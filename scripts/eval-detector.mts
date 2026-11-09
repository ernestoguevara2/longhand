/**
 * Scores the held-out test split with the shipped calibration and the shipped fusion code,
 * and compares it with the raw classifier at its usual 0.5 cutoff.
 * Writes research/detector-eval.json. Run fit:calibration first.
 */
import { writeFileSync } from "node:fs";

import { bandFor, fuseDeep, fuseQuick } from "../lib/detect/fusion.ts";
import { EXCLUDED_FROM_FPR_TARGET, loadSamples, type Sample } from "./lib/dataset.mts";
import { auroc } from "./lib/logistic.mts";

const samples = await loadSamples();
const test = samples.filter((s) => s.split === "test");
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

const deep = (s: Sample) => fuseDeep(s.classifierScore, s.features);
const quick = (s: Sample) => fuseQuick(s.features);

const buckets = [...new Set(test.map((s) => s.bucket))].sort();
const perBucket = buckets.map((bucket) => {
  const rows = test.filter((s) => s.bucket === bucket);
  const band = (fn: (s: Sample) => number, mode: "deep" | "quick", name: string) =>
    pct(rows.filter((s) => bandFor(fn(s), mode) === name).length, rows.length);
  return {
    bucket,
    n: rows.length,
    rawFlaggedAt50: pct(rows.filter((s) => s.classifierScore >= 0.5).length, rows.length),
    deepLikelyAi: band(deep, "deep", "likely-ai"),
    deepUnclear: band(deep, "deep", "unclear"),
    deepLikelyHuman: band(deep, "deep", "likely-human"),
    quickLikelyAi: band(quick, "quick", "likely-ai"),
  };
});

const aiRows = test.filter((s) => s.label === 1);
const humanRows = test.filter((s) => s.label === 0);
const nativeHuman = humanRows.filter((s) => s.bucket !== "human_toefl");
const aucFor = (fn: (s: Sample) => number, ai: Sample[], human: Sample[]) =>
  Number(auroc(ai.map(fn), human.map(fn)).toFixed(3));

const aucPerAiBucket = Object.fromEntries(
  [...new Set(aiRows.map((s) => s.bucket))].map((bucket) => {
    const rows = aiRows.filter((s) => s.bucket === bucket);
    return [
      bucket,
      {
        raw: aucFor((s) => s.classifierScore, rows, nativeHuman),
        deep: aucFor(deep, rows, nativeHuman),
        quick: aucFor(quick, rows, nativeHuman),
      },
    ];
  }),
);

const counted = humanRows.filter((s) => !EXCLUDED_FROM_FPR_TARGET.has(s.bucket));
const summary = {
  testSamples: test.length,
  auroc: {
    raw: aucFor((s) => s.classifierScore, aiRows, nativeHuman),
    deep: aucFor(deep, aiRows, nativeHuman),
    quick: aucFor(quick, aiRows, nativeHuman),
  },
  fprExcludingAbstracts: {
    rawAt50: pct(counted.filter((s) => s.classifierScore >= 0.5).length, counted.length),
    deepLikelyAi: pct(counted.filter((s) => bandFor(deep(s), "deep") === "likely-ai").length, counted.length),
  },
  truePositiveRate: {
    rawAt50: pct(aiRows.filter((s) => s.classifierScore >= 0.5).length, aiRows.length),
    deepLikelyAi: pct(aiRows.filter((s) => bandFor(deep(s), "deep") === "likely-ai").length, aiRows.length),
    deepNotLikelyHuman: pct(aiRows.filter((s) => bandFor(deep(s), "deep") !== "likely-human").length, aiRows.length),
  },
};

const report = { summary, aucPerAiBucket, perBucket };
writeFileSync("research/detector-eval.json", `${JSON.stringify(report, null, 2)}\n`);
writeFileSync("lib/detect/data/evaluation.json", `${JSON.stringify({ summary, perBucket }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 1));
console.table(perBucket);
console.log(JSON.stringify(aucPerAiBucket));
