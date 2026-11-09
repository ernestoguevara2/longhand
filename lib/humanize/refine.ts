import { z } from "zod";

import { extractNames, extractNumbers } from "./gates";
import { parseJsonObject } from "./json";
import { REFINE_INSTRUCTIONS, refinePrompt } from "./prompts";
import type { Generate } from "./types";

const schema = z.object({ alternatives: z.array(z.string().min(1)).min(1) });

/** A sentence-level check: same numbers and names, and not wildly different in length. */
function keepsFacts(sentence: string, alternative: string): boolean {
  const numbers = extractNumbers(alternative);
  if (extractNumbers(sentence).some((n) => !numbers.includes(n))) return false;
  const lower = alternative.toLowerCase();
  if (extractNames(sentence).some((name) => name.split(/\s+/).some((p) => !lower.includes(p.toLowerCase())))) {
    return false;
  }
  const ratio = alternative.length / Math.max(1, sentence.length);
  return ratio > 0.4 && ratio < 2.2;
}

export async function refineSentence(
  generate: Generate,
  input: { sentence: string; before: string; after: string; temperature?: number },
  signal?: AbortSignal,
): Promise<string[]> {
  const reply = await generate({
    instructions: REFINE_INSTRUCTIONS,
    prompt: refinePrompt(input.sentence, input.before, input.after),
    temperature: input.temperature ?? 0.9,
    maxOutputTokens: 600,
    signal,
  });
  const parsed = schema.safeParse(parseJsonObject(reply));
  if (!parsed.success) return [];
  const seen = new Set([input.sentence.trim()]);
  return parsed.data.alternatives
    .map((a) => a.trim())
    .filter((a) => {
      if (seen.has(a) || !keepsFacts(input.sentence, a)) return false;
      seen.add(a);
      return true;
    })
    .slice(0, 3);
}
