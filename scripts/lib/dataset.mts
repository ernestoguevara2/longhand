/** Loads labelled text and caches classifier scores, so calibration re-runs in seconds. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { cleanForClassifier } from "../../lib/detect/clean.ts";
import { CLASSIFIER } from "../../lib/detect/classifier-config.ts";
import { pooledClassifierScore } from "../../lib/detect/fusion.ts";
import { analyzeStyle } from "../../lib/detect/stylometry.ts";
import type { StyleFeatures } from "../../lib/detect/types.ts";
import { documentWindows } from "../../lib/detect/windows.ts";
import { loadNodeClassifier } from "./node-classifier.mts";

export type Sample = {
  bucket: string;
  label: 0 | 1;
  text: string;
  hash: string;
  split: "train" | "validation" | "test";
  features: StyleFeatures;
  classifierScore: number;
};

const DATA = "research/data";
const CACHE = `${DATA}/classifier-cache.json`;

const read = (name: string): { bucket?: string; text: string; generator?: string }[] => {
  const path = `${DATA}/${name}.json`;
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : [];
};

export const hashText = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Stable split from the text hash: the same sample always lands in the same split. */
function splitFor(hash: string): Sample["split"] {
  const n = parseInt(hash.slice(0, 8), 16) % 100;
  return n < 60 ? "train" : n < 80 ? "validation" : "test";
}

export async function loadSamples(): Promise<Sample[]> {
  const raw = [
    ...read("raid"),
    ...read("raid-clean"),
    ...read("liang"),
    ...read("hewlett"),
    ...read("toefl").map((s) => ({ ...s, bucket: "human_toefl" })),
    ...read("fresh").map((s) => ({ ...s, bucket: `ai_fresh_${s.generator}` })),
  ].filter((s) => s.text?.trim());

  const cache: Record<string, number> = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  let classify: Awaited<ReturnType<typeof loadNodeClassifier>> | null = null;
  const samples: Sample[] = [];
  const seen = new Set<string>();
  let fresh = 0;

  for (const row of raw) {
    const hash = hashText(row.text);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const analysis = analyzeStyle(row.text);
    if (analysis.words < 50) continue;
    let classifierScore = cache[hash];
    if (classifierScore === undefined) {
      classify ??= await loadNodeClassifier(CLASSIFIER.id, CLASSIFIER.revision, CLASSIFIER.dtype);
      const windows = documentWindows(row.text, analysis.sentences).map(cleanForClassifier).filter(Boolean);
      const scores: number[] = [];
      for (const window of windows) scores.push(await classify(window));
      classifierScore = pooledClassifierScore(scores);
      cache[hash] = classifierScore;
      if (++fresh % 50 === 0) writeFileSync(CACHE, JSON.stringify(cache));
    }
    const bucket = row.bucket ?? "unknown";
    samples.push({
      bucket,
      label: bucket.startsWith("ai") ? 1 : 0,
      text: row.text,
      hash,
      split: splitFor(hash),
      features: analysis.features,
      classifierScore,
    });
  }
  writeFileSync(CACHE, JSON.stringify(cache));
  return samples;
}

/** Abstracts barely separate, so thresholds and the headline false-positive rate exclude them. */
export const EXCLUDED_FROM_FPR_TARGET = new Set(["human_cs224n_abstract"]);
