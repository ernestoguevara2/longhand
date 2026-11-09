/**
 * Fits lib/detect/data/calibration.json.
 *
 * A feature is only kept if it improves validation AUROC and does not raise the false-positive
 * rate on TOEFL essays. The test split is never used for fitting or for choosing features.
 */
import { writeFileSync } from "node:fs";

import { logit, sigmoid } from "../lib/detect/fusion.ts";
import { FEATURE_NAMES } from "../lib/detect/stylometry.ts";
import { EXCLUDED_FROM_FPR_TARGET, loadSamples, type Sample } from "./lib/dataset.mts";
import { auroc, fitLogistic, quantile, rateAtOrAbove, type Fit } from "./lib/logistic.mts";

const OUTPUT = "lib/detect/data/calibration.json";
const TARGET_FPR = 0.06;
const TARGET_TOEFL_FPR = 0.2;
const AI_MISS_FOR_LIKELY_HUMAN = 0.1;

type Row = Record<string, number>;
const toRow = (s: Sample): Row => ({ ...s.features, classifierLogit: logit(s.classifierScore) });

/** Every bucket counts the same, and the two classes count the same overall. */
function balancedWeights(samples: Sample[]): number[] {
  const perBucket = new Map<string, number>();
  for (const s of samples) perBucket.set(s.bucket, (perBucket.get(s.bucket) ?? 0) + 1);
  const bucketsInClass = (label: number) =>
    new Set(samples.filter((s) => s.label === label).map((s) => s.bucket)).size;
  return samples.map((s) => 1 / (perBucket.get(s.bucket)! * bucketsInClass(s.label)));
}

const predict = (fit: Fit, row: Row) => {
  let z = fit.intercept;
  for (const [name, weight] of Object.entries(fit.weights)) {
    z += (weight * (row[name] - fit.mean[name])) / fit.std[name];
  }
  return sigmoid(z);
};

const fitFor = (samples: Sample[], names: readonly string[]) =>
  fitLogistic(samples.map(toRow), samples.map((s) => s.label), balancedWeights(samples), names);

/** Threshold with the target false-positive rate on human text, excluding unreliable registers. */
function aiThreshold(fit: Fit, samples: Sample[]): number {
  const score = (s: Sample) => predict(fit, toRow(s));
  const humans = samples.filter((s) => s.label === 0 && !EXCLUDED_FROM_FPR_TARGET.has(s.bucket)).map(score);
  const toefl = samples.filter((s) => s.bucket === "human_toefl").map(score);
  // Both limits must hold, so non-native writers do not carry the overall rate's errors.
  return Math.max(quantile(humans, 1 - TARGET_FPR), quantile(toefl, 1 - TARGET_TOEFL_FPR));
}

function humanThreshold(fit: Fit, samples: Sample[], likelyAi: number): number {
  const ai = samples.filter((s) => s.label === 1).map((s) => predict(fit, toRow(s)));
  return Math.min(quantile(ai, AI_MISS_FOR_LIKELY_HUMAN), likelyAi - 0.1);
}

function evaluateFeatures(train: Sample[], validation: Sample[], names: readonly string[]) {
  const fit = fitFor(train, names);
  const threshold = aiThreshold(fit, train);
  const scores = (rows: Sample[]) => rows.map((s) => predict(fit, toRow(s)));
  const ai = scores(validation.filter((s) => s.label === 1));
  const human = scores(validation.filter((s) => s.label === 0 && s.bucket !== "human_toefl"));
  const toefl = scores(validation.filter((s) => s.bucket === "human_toefl"));
  return { auroc: auroc(ai, human), toeflFpr: rateAtOrAbove(toefl, threshold) };
}

/** Forward selection under the acceptance rule. */
function selectFeatures(train: Sample[], validation: Sample[], start: string[]) {
  const chosen = [...start];
  const log: { feature: string; auroc: number; toeflFpr: number; accepted: boolean }[] = [];
  let best = chosen.length
    ? evaluateFeatures(train, validation, chosen)
    : { auroc: 0.5, toeflFpr: 1 };
  for (;;) {
    let winner: { name: string; result: typeof best } | null = null;
    for (const name of FEATURE_NAMES) {
      if (chosen.includes(name)) continue;
      const result = evaluateFeatures(train, validation, [...chosen, name]);
      const accepted = result.auroc > best.auroc + 0.001 && result.toeflFpr <= best.toeflFpr + 1e-9;
      log.push({ feature: name, auroc: result.auroc, toeflFpr: result.toeflFpr, accepted });
      if (accepted && (!winner || result.auroc > winner.result.auroc)) winner = { name, result };
    }
    if (!winner) break;
    chosen.push(winner.name);
    best = winner.result;
  }
  return { chosen, log, best };
}

const round = (fit: Fit, thresholds: { likelyAi: number; likelyHuman: number }) => {
  const r = (n: number) => Number(n.toFixed(5));
  const map = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r(v)]));
  return {
    intercept: r(fit.intercept),
    weights: map(fit.weights),
    mean: map(fit.mean),
    std: map(fit.std),
    thresholds: { likelyAi: r(thresholds.likelyAi), likelyHuman: r(thresholds.likelyHuman) },
  };
};

const samples = await loadSamples();
const train = samples.filter((s) => s.split === "train");
const validation = samples.filter((s) => s.split === "validation");
console.log("samples", samples.length, "train", train.length, "validation", validation.length);

const deepSelection = selectFeatures(train, validation, ["classifierLogit"]);
console.log("deep features", deepSelection.chosen, deepSelection.best);
const quickSelection = selectFeatures(train, validation, []);
console.log("quick features", quickSelection.chosen, quickSelection.best);

// Final fit on train + validation. The test split stays untouched for eval:detector.
const fitting = [...train, ...validation];
/**
 * Shifts the scale so the "Likely AI" line always falls at a score of 70. The score is a signal
 * strength set by the false-positive target, not a literal probability.
 */
const LIKELY_AI_SCORE = 0.7;
const MAX_LIKELY_HUMAN_SCORE = 0.3;

function finalModel(names: string[]) {
  const fit = fitFor(fitting, names);
  const likelyAi = aiThreshold(fit, fitting);
  const likelyHuman = humanThreshold(fit, fitting, likelyAi);
  const shift = logit(LIKELY_AI_SCORE) - logit(likelyAi);
  return round(
    { ...fit, intercept: fit.intercept + shift },
    // "Likely human" also needs a real gap below the line, so the unclear band stays honest.
    { likelyAi: LIKELY_AI_SCORE, likelyHuman: Math.min(sigmoid(logit(likelyHuman) + shift), MAX_LIKELY_HUMAN_SCORE) },
  );
}

const calibration = {
  version: `fit-${new Date().toISOString().slice(0, 10)}`,
  deep: finalModel(deepSelection.chosen),
  quick: finalModel(quickSelection.chosen.length ? quickSelection.chosen : ["vocabularyPer100"]),
  training: {
    samples: fitting.length,
    targetFpr: TARGET_FPR,
    selection: { deep: deepSelection.log, quick: quickSelection.log },
  },
};
writeFileSync(OUTPUT, `${JSON.stringify(calibration, null, 2)}\n`);
console.log("wrote", OUTPUT);
console.log(JSON.stringify({ deep: calibration.deep, quick: calibration.quick }, null, 1));
