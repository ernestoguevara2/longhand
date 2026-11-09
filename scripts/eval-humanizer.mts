/**
 * Measures the rewrite pipeline on fresh AI drafts, using a judge that takes no part in it.
 *
 *   TMR RoBERTa is the independent judge. Longhand never uses it to choose or tune anything.
 *   Fakespot and Longhand's own score are reported too, but those are not independent: the pipeline
 *   can see them, so they would flatter it.
 *
 * Resumable: results are saved after each rewrite, so re-running continues where it stopped.
 * Usage: pnpm eval:humanizer [--model gemma4:e4b] [--samples 30]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { cleanForClassifier } from "../lib/detect/clean.ts";
import { CLASSIFIER } from "../lib/detect/classifier-config.ts";
import { bandFor, fuseDeep, fuseQuick, pooledClassifierScore } from "../lib/detect/fusion.ts";
import { analyzeStyle } from "../lib/detect/stylometry.ts";
import { documentWindows } from "../lib/detect/windows.ts";
import { humanizeChunk } from "../lib/humanize/pipeline.ts";
import { INTENSITIES, type Intensity } from "../lib/humanize/types.ts";
import { ollamaGenerate } from "../lib/llm/ollama.ts";
import { chunkText, joinChunks } from "../lib/text/chunk.ts";
import { changedFraction } from "../lib/text/diff.ts";
import { protect, restore } from "../lib/text/protect.ts";
import { hashText } from "./lib/dataset.mts";
import { JUDGE, loadNodeClassifier, type NodeClassifier } from "./lib/node-classifier.mts";

const OUT = "research/humanizer-eval.json";
const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
};
const MODEL = arg("model", "gemma4:e4b");
const SAMPLES = Number(arg("samples", "30"));

type Scores = { judge: number; fakespot: number; quick: number; deep: number; deepBand: string };
type Row = {
  sample: string;
  generator: string;
  genre: string;
  words: number;
  intensity: Intensity;
  seconds: number;
  changed: number;
  gatesPassed: boolean;
  violations: string[];
  factProblems: number | null;
  strongBefore: number;
  strongAfter: number;
  vocabularyBefore: number;
  vocabularyAfter: number;
  before: Scores;
  after: Scores;
  draft: string;
  rewrite: string;
};

async function scoreText(text: string, judge: NodeClassifier, fakespot: NodeClassifier): Promise<Scores> {
  const analysis = analyzeStyle(text);
  const windows = documentWindows(text, analysis.sentences).map(cleanForClassifier).filter(Boolean);
  const pool = async (classify: NodeClassifier) => {
    const scores: number[] = [];
    for (const window of windows) scores.push(await classify(window));
    return pooledClassifierScore(scores);
  };
  const judgeScore = await pool(judge);
  const fakespotScore = await pool(fakespot);
  const deep = fuseDeep(fakespotScore, analysis.features);
  return {
    judge: judgeScore,
    fakespot: fakespotScore,
    quick: fuseQuick(analysis.features),
    deep,
    deepBand: bandFor(deep, "deep"),
  };
}

const fresh: { id: string; generator: string; genre: string; words: number; text: string }[] = JSON.parse(
  readFileSync("research/data/fresh.json", "utf8"),
);
// Spread across both generators and every genre, and skip the longest drafts to keep runs practical.
const pool = fresh
  .filter((s) => s.words <= 350 && s.text.split(/\s+/).length >= 80)
  .sort((a, b) => hashText(a.id).localeCompare(hashText(b.id)));
const generators = [...new Set(pool.map((s) => s.generator))];
const chosen: typeof pool = [];
for (let i = 0; chosen.length < SAMPLES && i < pool.length; i++) {
  for (const generator of generators) {
    const next = pool.filter((s) => s.generator === generator)[i];
    if (next && chosen.length < SAMPLES) chosen.push(next);
  }
}
// If the shorter drafts run out, top up with the shortest of the rest.
const longer = fresh
  .filter((s) => !chosen.includes(s))
  .sort((a, b) => a.text.length - b.text.length);
while (chosen.length < SAMPLES && longer.length) chosen.push(longer.shift()!);
console.log("samples", chosen.length, "model", MODEL);

const results: Row[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const judge = await loadNodeClassifier(JUDGE.id, JUDGE.revision, "q8");
const fakespot = await loadNodeClassifier(CLASSIFIER.id, CLASSIFIER.revision, CLASSIFIER.dtype);
const generate = ollamaGenerate(MODEL);

for (const sample of chosen) {
  for (const intensity of INTENSITIES) {
    if (results.some((r) => r.sample === sample.id && r.intensity === intensity)) continue;
    const started = Date.now();
    try {
      const chunks = chunkText(sample.text);
      const output: string[] = [];
      const violations: string[] = [];
      let factProblems: number | null = intensity === "aggressive" ? 0 : null;
      let previous = "";
      for (const chunk of chunks) {
        if (chunk.kind === "locked") {
          output.push(chunk.text);
          continue;
        }
        const masked = protect(chunk.text);
        const result = await humanizeChunk(generate, masked.text, {
          intensity,
          // One candidate per chunk keeps a full run to a couple of hours on a laptop.
          candidates: 1,
          factCheck: intensity === "aggressive",
          context: previous.split(/\s+/).slice(-60).join(" ") || undefined,
          concurrency: 1,
        });
        const text = restore(result.best.text, masked.spans);
        output.push(text);
        previous = text;
        violations.push(...result.best.violations.map((v) => `${v.gate}: ${v.message}`));
        if (factProblems !== null) factProblems = result.factProblems === null ? factProblems : factProblems + result.factProblems.length;
      }
      const rewrite = joinChunks(chunks.map((chunk, i) => ({ text: output[i], separator: chunk.separator })));
      const beforeStyle = analyzeStyle(sample.text);
      const afterStyle = analyzeStyle(rewrite);
      const strong = (a: typeof beforeStyle) => a.tells.filter((t) => t.tier === "strong").length;
      const vocabulary = (a: typeof beforeStyle) => a.tells.filter((t) => t.group === "vocabulary").length;
      results.push({
        sample: sample.id,
        generator: sample.generator,
        genre: sample.genre,
        words: beforeStyle.words,
        intensity,
        seconds: Math.round((Date.now() - started) / 1000),
        changed: changedFraction(sample.text, rewrite),
        gatesPassed: violations.length === 0,
        violations,
        factProblems,
        strongBefore: strong(beforeStyle),
        strongAfter: strong(afterStyle),
        vocabularyBefore: vocabulary(beforeStyle),
        vocabularyAfter: vocabulary(afterStyle),
        before: await scoreText(sample.text, judge, fakespot),
        after: await scoreText(rewrite, judge, fakespot),
        draft: sample.text,
        rewrite,
      });
      writeFileSync(OUT, JSON.stringify(results, null, 1));
      const last = results.at(-1)!;
      console.log(
        sample.id,
        intensity,
        `${last.seconds}s`,
        `judge ${last.before.judge.toFixed(2)}->${last.after.judge.toFixed(2)}`,
        `deep ${last.before.deep.toFixed(2)}->${last.after.deep.toFixed(2)}`,
        `changed ${last.changed.toFixed(2)}`,
        last.gatesPassed ? "gates ok" : `gates: ${violations.length}`,
      );
    } catch (error) {
      console.error(sample.id, intensity, "failed:", String(error).slice(0, 160));
    }
  }
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / (values.length || 1);
const summary = INTENSITIES.map((intensity) => {
  const rows = results.filter((r) => r.intensity === intensity);
  const rate = (fn: (r: Row) => boolean) => Math.round((rows.filter(fn).length / (rows.length || 1)) * 100);
  return {
    intensity,
    n: rows.length,
    judgeBefore: +mean(rows.map((r) => r.before.judge)).toFixed(3),
    judgeAfter: +mean(rows.map((r) => r.after.judge)).toFixed(3),
    judgeFlaggedBefore: rate((r) => r.before.judge >= 0.5),
    judgeFlaggedAfter: rate((r) => r.after.judge >= 0.5),
    deepBefore: +mean(rows.map((r) => r.before.deep)).toFixed(3),
    deepAfter: +mean(rows.map((r) => r.after.deep)).toFixed(3),
    likelyAiBefore: rate((r) => r.before.deepBand === "likely-ai"),
    likelyAiAfter: rate((r) => r.after.deepBand === "likely-ai"),
    strongBefore: +mean(rows.map((r) => r.strongBefore)).toFixed(1),
    strongAfter: +mean(rows.map((r) => r.strongAfter)).toFixed(1),
    vocabularyBefore: +mean(rows.map((r) => r.vocabularyBefore)).toFixed(1),
    vocabularyAfter: +mean(rows.map((r) => r.vocabularyAfter)).toFixed(1),
    changed: +mean(rows.map((r) => r.changed)).toFixed(2),
    gatesPassed: rate((r) => r.gatesPassed),
    secondsPer100Words: +mean(rows.map((r) => (r.seconds / r.words) * 100)).toFixed(1),
  };
});
writeFileSync("research/humanizer-summary.json", `${JSON.stringify(summary, null, 2)}\n`);
console.table(summary);
