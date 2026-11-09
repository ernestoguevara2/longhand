import { analyzeStyle } from "@/lib/detect/stylometry";
import { changedFraction } from "@/lib/text/diff";

import { judgeFacts } from "./fact-judge";
import { runGates } from "./gates";
import {
  AUDIT_INSTRUCTIONS,
  auditPrompt,
  FINE_TUNED_SAMPLING,
  fineTunedPrompt,
  REPAIR_INSTRUCTIONS,
  repairPrompt,
  rewriteInstructions,
  rewritePrompt,
} from "./prompts";
import { rankCandidates } from "./rank";
import type { Candidate, ChunkOptions, ChunkResult, Generate, Intensity, PipelineEvent } from "./types";

const SETTINGS: Record<Intensity, { candidates: number; temperature: number; audit: boolean }> = {
  light: { candidates: 1, temperature: 0.5, audit: false },
  medium: { candidates: 2, temperature: 0.8, audit: true },
  aggressive: { candidates: 3, temperature: 1, audit: true },
};

const FINE_TUNED_SAMPLES: Record<Intensity, number> = { light: 1, medium: 2, aggressive: 4 };

/** An audit may tidy a rewrite, but may not undo most of it. */
const AUDIT_MIN_CHANGE_KEPT = 0.6;

/** Models sometimes wrap output in tags, fences, or a stray label despite instructions. */
export function cleanOutput(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, "$1")
    .replace(/^<(rewrite|draft)>\s*/i, "")
    .replace(/\s*<\/(rewrite|draft)>$/i, "")
    .trim();
}

function describeTells(text: string): { list: string[]; per100: number } {
  const { tells, words } = analyzeStyle(text);
  const counted = tells.filter((t) => t.patternId !== "dash" || tells.filter((d) => d.patternId === "dash").length > 1);
  const seen = new Map<string, string>();
  for (const tell of counted) {
    if (seen.size >= 15) break;
    const key = `${tell.patternId}:${tell.text.toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, `${tell.label}: "${tell.text.trim().slice(0, 70)}"`);
  }
  return { list: [...seen.values()], per100: words ? (counted.length / words) * 100 : 0 };
}

async function writeCandidate(
  generate: Generate,
  chunk: string,
  options: ChunkOptions,
  index: number,
  total: number,
  emit: (event: PipelineEvent) => void,
  signal?: AbortSignal,
): Promise<Candidate> {
  const engine = options.engine ?? "prompt";
  const settings = SETTINGS[options.intensity];
  const streamFirst = index === 0 ? (text: string) => emit({ type: "delta", text }) : undefined;
  const maxOutputTokens = Math.ceil(chunk.length / 2) + 400;

  emit({ type: "stage", stage: "writing", candidate: index + 1, of: total });
  let text: string;
  if (engine === "prompt") {
    text = cleanOutput(
      await generate({
        instructions: rewriteInstructions(options.intensity, options.voiceSample),
        prompt: rewritePrompt(chunk, describeTells(chunk).list, options.context),
        temperature: settings.temperature,
        maxOutputTokens,
        signal,
        onDelta: settings.audit ? undefined : streamFirst,
      }),
    );
    if (settings.audit) {
      emit({ type: "stage", stage: "auditing", candidate: index + 1, of: total });
      const audited = cleanOutput(
        await generate({
          instructions: AUDIT_INSTRUCTIONS,
          prompt: auditPrompt(chunk, text, describeTells(text).list),
          temperature: 0.4,
          maxOutputTokens,
          signal,
          onDelta: streamFirst,
        }),
      );
      // Models sometimes hand back the draft, or break a check, while "auditing". Keep the better text.
      const worse =
        runGates(chunk, audited, options.intensity, engine).length > runGates(chunk, text, options.intensity, engine).length ||
        changedFraction(chunk, audited) < changedFraction(chunk, text) * AUDIT_MIN_CHANGE_KEPT;
      if (!worse) text = audited;
    }
  } else {
    text = cleanOutput(
      await generate({
        prompt: fineTunedPrompt(engine, chunk),
        ...FINE_TUNED_SAMPLING[engine],
        stop: engine === "smaug-12b" ? [...FINE_TUNED_SAMPLING[engine].stop] : undefined,
        maxOutputTokens,
        signal,
        onDelta: streamFirst,
      }),
    );
  }

  let violations = runGates(chunk, text, options.intensity, engine);
  let repaired = false;
  if (violations.length) {
    emit({ type: "stage", stage: "repairing", candidate: index + 1, of: total });
    const fixed = cleanOutput(
      await generate({
        instructions: REPAIR_INSTRUCTIONS,
        prompt: repairPrompt(chunk, text, violations),
        temperature: 0.2,
        maxOutputTokens,
        signal,
      }),
    );
    const fixedViolations = runGates(chunk, fixed, options.intensity, engine);
    if (fixedViolations.length < violations.length) {
      text = fixed;
      violations = fixedViolations;
      repaired = true;
    }
  }

  return {
    text,
    violations,
    changed: changedFraction(chunk, text),
    tellsPer100: describeTells(text).per100,
    repaired,
  };
}

async function inBatches<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    results.push(...(await Promise.all(tasks.slice(i, i + concurrency).map((task) => task()))));
  }
  return results;
}

/** Rewrites one chunk. Works anywhere a `Generate` can run: server route, browser, or script. */
export async function humanizeChunk(
  generate: Generate,
  chunk: string,
  options: ChunkOptions,
  emit: (event: PipelineEvent) => void = () => {},
  signal?: AbortSignal,
): Promise<ChunkResult> {
  const engine = options.engine ?? "prompt";
  const total =
    options.candidates ??
    (engine === "prompt" ? SETTINGS[options.intensity].candidates : FINE_TUNED_SAMPLES[options.intensity]);

  const tasks = Array.from({ length: total }, (_, index) => () =>
    writeCandidate(generate, chunk, options, index, total, emit, signal),
  );
  const candidates = rankCandidates(await inBatches(tasks, Math.max(1, options.concurrency ?? 1)));
  const best = candidates[0];

  let factProblems: ChunkResult["factProblems"] = null;
  if (options.factCheck) {
    emit({ type: "stage", stage: "fact-checking", candidate: 1, of: 1 });
    factProblems = await judgeFacts(generate, chunk, best.text, signal);
  }

  const result: ChunkResult = { best, candidates, factProblems };
  emit({ type: "result", result });
  return result;
}
