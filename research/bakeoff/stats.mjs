// Throwaway research spike: do simple stylometric features separate these buckets at all?
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const load = (name) => {
  const p = new URL(`./data/${name}.json`, import.meta.url);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
};
const samples = [
  ...load("raid"),
  ...load("liang"),
  ...load("hewlett"),
  ...load("fresh-gemma").map((s) => ({ ...s, bucket: "ai_gemma_2026" })),
  ...load("toefl").map((s) => ({ ...s, bucket: "human_toefl" })),
].filter((s) => s.text?.trim());

const VOCAB =
  /\b(additionally|align with|boasts?|bolstered|crucial|deep dive|delv(?:e|es|ing)|emphasizing|enduring|enhanc(?:e|es|ing)|fostering|foster|garner(?:ed|ing)?|highlight(?:s|ing)?|interplay|intricate|intricacies|landscape|meticulous(?:ly)?|pivotal|robust|showcas(?:e|es|ing)|tapestry|testament|underscor(?:e|es|ing)|valuable|vibrant|leverag(?:e|es|ing)|multifaceted|prioritize|quietly|seamless(?:ly)?|navigat(?:e|es|ing)|realm|moreover|furthermore)\b/gi;
const STRUCT =
  /\b(not (?:just|only|merely)\b|it'?s not\b|serves as|stands as|plays a (?:key|crucial|vital|pivotal) role|in today'?s|whether (?:you'?re|it'?s)|at its core|the real question|more than just)\b/gi;

function sentences(t) {
  const seg = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...seg.segment(t)].map((s) => s.segment.trim()).filter(Boolean);
}
function features(t) {
  const words = t.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const lens = sentences(t).map((s) => s.split(/\s+/).length);
  const m = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - m) ** 2, 0) / (lens.length || 1));
  return {
    burstinessCV: sd / (m || 1), // lower = more uniform
    sentenceLen: m,
    aiVocabPer100: ((t.match(VOCAB) ?? []).length / (words.length || 1)) * 100,
    structuralPer100: ((t.match(STRUCT) ?? []).length / (words.length || 1)) * 100,
    emDashPer100: ((t.match(/[—–]/g) ?? []).length / (words.length || 1)) * 100,
    typeTokenRatio: new Set(words).size / (words.length || 1),
  };
}
function auroc(pos, neg) {
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0;
  return w / (pos.length * neg.length);
}
const by = {};
for (const s of samples) (by[s.bucket] ??= []).push(features(s.text));
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const keys = Object.keys(Object.values(by)[0][0]);
const humans = Object.entries(by).filter(([b]) => b.startsWith("human") && b !== "human_toefl").flatMap(([, v]) => v);

console.log("MEANS");
for (const [b, v] of Object.entries(by))
  console.log(b.padEnd(28), `n=${String(v.length).padEnd(4)}`, keys.map((k) => `${k}=${mean(v.map((x) => x[k])).toFixed(2)}`).join(" "));

console.log("\nAUROC vs pooled native-human (direction: higher means more AI-like; <0.5 means feature points the other way)");
const out = {};
for (const [b, v] of Object.entries(by)) {
  if (!b.startsWith("ai") && b !== "human_toefl") continue;
  out[b] = {};
  for (const k of keys) out[b][k] = +auroc(v.map((x) => x[k]), humans.map((x) => x[k])).toFixed(2);
  console.log(b.padEnd(28), JSON.stringify(out[b]));
}
writeFileSync(new URL("./stats-results.json", import.meta.url), JSON.stringify(out, null, 1));
