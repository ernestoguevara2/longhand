/**
 * Samples unattacked RAID rows (human and chat-model text) into research/data/raid-clean.json.
 * The server's filter endpoint is unreliable, so this walks pages across the split and filters locally.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "research/data/raid-clean.json";
const TOTAL = 2_270_000;
const STEP = 9_000;
const DOMAINS = new Set(["abstracts", "books", "news", "reddit", "reviews", "wiki"]);
const CHAT_MODELS = new Set(["ChatGPT", "gpt4", "llama-chat", "mistral-chat"]);
const PER_HUMAN_DOMAIN = 25;
const PER_MODEL_DOMAIN = 6;

type Row = { bucket: string; source: string; domain: string; attack: string; text: string };
type RaidRow = { id: string; model: string; attack: string; domain: string; generation: string };

const wordCount = (t: string) => t.trim().split(/\s+/).length;
const usable = (t: string) => wordCount(t) >= 80 && wordCount(t) <= 900;

async function page(offset: number): Promise<RaidRow[]> {
  const url = `https://datasets-server.huggingface.co/rows?dataset=liamdugan/raid&config=raid&split=train&offset=${offset}&length=100`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "research-client/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) return ((await res.json()) as { rows: { row: RaidRow }[] }).rows.map((r) => r.row);
    } catch {}
  }
  return [];
}

const rows: Row[] = [];
const seen = new Set<string>();
const counts = new Map<string, number>();

function consider(r: RaidRow) {
  if (r.attack !== "none" || !DOMAINS.has(r.domain) || seen.has(r.id) || !usable(r.generation)) return;
  const human = r.model === "human";
  if (!human && !CHAT_MODELS.has(r.model)) return;
  const cell = `${r.model}:${r.domain}`;
  const limit = human ? PER_HUMAN_DOMAIN : PER_MODEL_DOMAIN;
  if ((counts.get(cell) ?? 0) >= limit) return;
  counts.set(cell, (counts.get(cell) ?? 0) + 1);
  seen.add(r.id);
  rows.push({
    bucket: human ? "human_raid" : "ai_raid",
    source: r.model,
    domain: r.domain,
    attack: r.attack,
    text: r.generation,
  });
}

const offsets: number[] = [];
for (let o = 0; o < TOTAL; o += STEP) offsets.push(o);
const existing = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as Row[]).length : 0;
for (let i = 0; i < offsets.length; i += 2) {
  const pages = await Promise.all(offsets.slice(i, i + 2).map(page));
  for (const p of pages) p.forEach(consider);
  // Never replace a better sample with a worse one if the server starts failing partway.
  if (rows.length > existing) writeFileSync(OUT, JSON.stringify(rows));
  if (i % 40 === 0) console.log(offsets[i], "human", rows.filter((r) => r.source === "human").length, "ai", rows.filter((r) => r.source !== "human").length);
  await new Promise((resolve) => setTimeout(resolve, 400));
}
console.log("done", rows.length);
