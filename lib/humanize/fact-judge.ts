import { z } from "zod";

import { parseJsonObject } from "./json";
import { FACT_JUDGE_INSTRUCTIONS, factJudgePrompt } from "./prompts";
import type { FactProblem, Generate } from "./types";

const schema = z.object({
  problems: z.array(
    z.object({
      kind: z.enum(["changed", "added", "dropped"]),
      draft: z.string().default(""),
      rewrite: z.string().default(""),
      explanation: z.string().default(""),
    }),
  ),
});

/** Returns null when the model's reply could not be understood, so the UI can say the check did not run. */
export async function judgeFacts(
  generate: Generate,
  draft: string,
  rewrite: string,
  signal?: AbortSignal,
): Promise<FactProblem[] | null> {
  const reply = await generate({
    instructions: FACT_JUDGE_INSTRUCTIONS,
    prompt: factJudgePrompt(draft, rewrite),
    temperature: 0,
    maxOutputTokens: 800,
    signal,
  });
  const parsed = schema.safeParse(parseJsonObject(reply));
  return parsed.success ? parsed.data.problems : null;
}
