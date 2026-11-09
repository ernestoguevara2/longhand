// Throwaway research spike: generate fresh AI text from a 2026 local model.
import { writeFileSync } from "node:fs";

const OUT = new URL("./data/fresh-gemma.json", import.meta.url);
const prompts = [
  "Write a 200-word blog post about why small towns should invest in public libraries.",
  "Write a 200-word explanation of how vaccines train the immune system.",
  "Write a 200-word persuasive essay arguing that high schools should start later in the morning.",
  "Write a 200-word product review of a mid-range electric bicycle.",
  "Write a 200-word news-style article about a city adopting congestion pricing.",
  "Write a 200-word work email announcing a move to a four-day week pilot.",
  "Write a 200-word overview of the causes of the French Revolution.",
  "Write a 200-word abstract for a study on urban heat islands and tree cover.",
  "Write a 200-word personal essay about learning to cook from a grandparent.",
  "Write a 200-word explainer on how index funds work.",
  "Write a 200-word forum answer about how to start running at age 40.",
  "Write a 200-word cover letter for a junior data analyst role.",
  "Write a 200-word article about the history of the bicycle.",
  "Write a 200-word report summary on remote work and productivity.",
  "Write a 200-word reflection on what makes a good teacher.",
  "Write a 200-word description of how coral reefs form and why they are threatened.",
];

const out = [];
for (const prompt of prompts) {
  const t0 = Date.now();
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "gemma4:e4b",
      prompt: `${prompt} Output only the text, with no preamble.`,
      stream: false,
      think: false,
      options: { temperature: 0.8, num_predict: 500 },
    }),
  });
  const j = await res.json();
  const text = (j.response ?? "").trim();
  out.push({ source: "gemma4:e4b", prompt, text });
  console.log(`${out.length}/${prompts.length} ${text.split(/\s+/).length}w ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  writeFileSync(OUT, JSON.stringify(out, null, 1));
}
console.log("done");
