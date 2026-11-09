/**
 * Generates fresh AI-written drafts with local Ollama models, for calibration and evaluation.
 * Usage: pnpm tsx scripts/generate-samples.mts
 * Appends to research/data/fresh.json and resumes where it left off.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "research/data/fresh.json";
const OLLAMA = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

type Sample = { id: string; generator: string; genre: string; words: number; prompt: string; text: string };

const JOBS: { genre: string; ask: string }[] = [
  { genre: "blog", ask: "a blog post about why small towns should invest in public libraries" },
  { genre: "blog", ask: "a blog post on what a first year of beekeeping is like" },
  { genre: "blog", ask: "a blog post about switching from a car to a bicycle commute" },
  { genre: "explainer", ask: "an explanation of how vaccines train the immune system" },
  { genre: "explainer", ask: "an explainer on how index funds work" },
  { genre: "explainer", ask: "an explanation of how coral reefs form and why they are threatened" },
  { genre: "explainer", ask: "an explainer on how noise-cancelling headphones work" },
  { genre: "essay", ask: "a persuasive essay arguing that high schools should start later in the morning" },
  { genre: "essay", ask: "an essay on whether cities should ban cars from their centers" },
  { genre: "essay", ask: "a college application essay about learning to cook from a grandparent" },
  { genre: "essay", ask: "a reflective essay on what makes a good teacher" },
  { genre: "review", ask: "a product review of a mid-range electric bicycle" },
  { genre: "review", ask: "a review of a neighborhood Italian restaurant" },
  { genre: "news", ask: "a news article about a city adopting congestion pricing" },
  { genre: "news", ask: "a news article about a regional airport reopening after renovations" },
  { genre: "email", ask: "a work email announcing a four-day week pilot" },
  { genre: "email", ask: "a work email explaining a delay in a software release to a client" },
  { genre: "history", ask: "an overview of the causes of the French Revolution" },
  { genre: "history", ask: "an article about the history of the bicycle" },
  { genre: "academic", ask: "an abstract for a study on urban heat islands and tree cover" },
  { genre: "academic", ask: "a literature-review section on sleep and memory consolidation" },
  { genre: "report", ask: "a report summary on remote work and productivity" },
  { genre: "report", ask: "an executive summary of a customer churn analysis for a subscription company" },
  { genre: "forum", ask: "a forum answer about how to start running at age 40" },
  { genre: "forum", ask: "a forum answer on how to get better at chess as an adult" },
  { genre: "letter", ask: "a cover letter for a junior data analyst role" },
  { genre: "marketing", ask: "landing page copy for a meal-planning app" },
  { genre: "marketing", ask: "a newsletter from a small coffee roaster introducing a new blend" },
];

const LENGTHS = [200, 350, 500];
const PLAN: { generator: string; count: number }[] = [
  { generator: "gemma4:e4b", count: 28 },
  { generator: "gemma4:26b", count: 14 },
];

const samples: Sample[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
mkdirSync("research/data", { recursive: true });

for (const { generator, count } of PLAN) {
  for (let i = 0; i < count; i++) {
    const job = JOBS[i % JOBS.length];
    const words = LENGTHS[i % LENGTHS.length];
    const id = `${generator}-${i}`;
    if (samples.some((s) => s.id === id)) continue;
    const prompt = `Write ${job.ask}, about ${words} words long. Output only the text, with no preamble.`;
    const started = Date.now();
    let text = "";
    try {
      const res = await fetch(`${OLLAMA}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(280_000),
        body: JSON.stringify({
          model: generator,
          prompt,
          stream: false,
          think: false,
          options: { temperature: 0.8, num_predict: 1400 },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      text = String(((await res.json()) as { response?: string }).response ?? "").trim();
    } catch (error) {
      console.error(id, "skipped:", String(error).slice(0, 200));
      continue;
    }
    samples.push({ id, generator, genre: job.genre, words, prompt, text });
    writeFileSync(OUT, JSON.stringify(samples, null, 1));
    console.log(id, text.split(/\s+/).length, "words", Math.round((Date.now() - started) / 1000), "s");
  }
}
console.log("done", samples.length);
