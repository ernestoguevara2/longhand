// Throwaway research spike: compare browser-sized detectors on labelled samples.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pipeline } from "@huggingface/transformers";

const load = (name) => {
  const p = new URL(`./data/${name}.json`, import.meta.url);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
};
const samples = [
  ...load("raid"),
  ...load("fresh-gemma").map((s) => ({ ...s, bucket: "ai_gemma_2026" })),
  ...load("toefl").map((s) => ({ ...s, bucket: "human_toefl" })),
  ...load("hewlett"),
  ...load("liang"),
].filter((s) => s.text && s.text.trim().length > 0);

const MODELS = [
  { id: "onnx-community/e5-small-lora-ai-generated-detector-ONNX", dtype: "q8", size: "34MB" },
  { id: "onnx-community/tmr-ai-text-detector-ONNX", dtype: "q8", size: "126MB" },
  { id: "hbhanushali/fakespot-ai-detector-onnx", dtype: "q8", size: "125MB" },
];

const isAiLabel = (label, model) => {
  const l = String(label).toLowerCase();
  if (/human|real|^label_0$/.test(l)) return false;
  if (/ai|machine|fake|generated|gpt|^label_1$/.test(l)) return true;
  throw new Error(`Unknown label ${label} for ${model}`);
};

function auroc(pos, neg) {
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return pos.length && neg.length ? wins / (pos.length * neg.length) : NaN;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const rate = (a, thr) => a.filter((v) => v >= thr).length / (a.length || 1);

const results = {};
for (const m of MODELS) {
  const t0 = Date.now();
  const clf = await pipeline("text-classification", m.id, { dtype: m.dtype });
  const loadMs = Date.now() - t0;
  const scores = {};
  let labels = new Set();
  const t1 = Date.now();
  for (const s of samples) {
    const enc = clf.tokenizer(s.text, { truncation: true, max_length: 512 });
    const logits = (await clf.model(enc)).logits;
    const raw = Array.from(logits.data, Number);
    const exp = raw.map((v) => Math.exp(v));
    const sum = exp.reduce((a, b) => a + b, 0);
    const id2label = clf.model.config.id2label;
    const flat = raw.length === 1
      ? [{ label: id2label?.[0] ?? "AI", score: 1 / (1 + Math.exp(-raw[0])) }]
      : exp.map((v, i) => ({ label: id2label?.[i] ?? `LABEL_${i}`, score: v / sum }));
    for (const o of flat) labels.add(o.label);
    const ai = flat.find((o) => isAiLabel(o.label, m.id));
    (scores[s.bucket] ??= []).push(ai ? ai.score : 1 - flat[0].score);
  }
  const perDocMs = (Date.now() - t1) / samples.length;
  const humans = Object.entries(scores).filter(([b]) => b.startsWith("human") && b !== "human_toefl").flatMap(([, v]) => v);
  const r = {
    size: m.size,
    labels: [...labels],
    loadSec: +(loadMs / 1000).toFixed(1),
    msPerDoc: Math.round(perDocMs),
    auroc: {},
    meanScore: {},
    flaggedAt50: {},
    flaggedAt90: {},
  };
  for (const [b, v] of Object.entries(scores)) {
    r.meanScore[b] = +mean(v).toFixed(3);
    r.flaggedAt50[b] = `${(rate(v, 0.5) * 100).toFixed(0)}% of ${v.length}`;
    r.flaggedAt90[b] = `${(rate(v, 0.9) * 100).toFixed(0)}% of ${v.length}`;
    if (b.startsWith("ai")) r.auroc[b] = +auroc(v, humans).toFixed(3);
  }
  results[m.id] = r;
  console.log(m.id, JSON.stringify(r, null, 1));
  writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1));
}
console.log("done");
