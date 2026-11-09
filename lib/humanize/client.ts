import { chunkText, joinChunks, type Chunk } from "@/lib/text/chunk";
import { protect, restore, type Range } from "@/lib/text/protect";
import { DEFAULT_OLLAMA_URL, ollamaGenerate } from "@/lib/llm/ollama";
import { classifyError, type ErrorCode } from "@/lib/llm/errors";
import type { CloudProvider } from "@/lib/llm/providers";

import { humanizeChunk } from "./pipeline";
import { rankCandidates } from "./rank";
import { refineSentence } from "./refine";
import type { ChunkResult, Engine, FactProblem, GateViolation, Intensity, PipelineEvent } from "./types";

export type ModelTarget =
  | { kind: "ollama"; model: string; baseUrl?: string; engine: Engine }
  | { kind: "cloud"; provider: CloudProvider; model: string; apiKey?: string };

export type RunOptions = {
  target: ModelTarget;
  intensity: Intensity;
  voiceSample?: string;
  factCheck: boolean;
  /** Phrases the user wants kept word for word. */
  locked: string[];
  /** Scores candidates with the local classifier, when it is loaded. */
  scoreCandidates?: (texts: string[]) => Promise<number[]>;
};

export type ChunkOutcome = {
  index: number;
  draft: string;
  text: string;
  violations: GateViolation[];
  factProblems: FactProblem[] | null;
  error?: { code: ErrorCode; message: string };
};

export type RunProgress = {
  part: number;
  parts: number;
  stage: string;
  preview?: string;
};

const CONTEXT_WORDS = 60;

const lockedRanges = (text: string, phrases: string[]): Range[] =>
  phrases.flatMap((phrase) => {
    const ranges: Range[] = [];
    if (!phrase) return ranges;
    for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + phrase.length)) {
      ranges.push({ start: at, end: at + phrase.length });
    }
    return ranges;
  });

async function runCloudChunk(
  target: Extract<ModelTarget, { kind: "cloud" }>,
  body: Record<string, unknown>,
  emit: (event: PipelineEvent) => void,
  signal: AbortSignal,
): Promise<ChunkResult> {
  const res = await fetch("/api/humanize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(target.apiKey ? { "x-provider-key": target.apiKey } : {}),
    },
    body: JSON.stringify({ ...body, provider: { id: target.provider, model: target.model } }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw Object.assign(new Error("Request failed"), { statusCode: res.status });
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: ChunkResult | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const event = JSON.parse(line) as PipelineEvent | { type: "error"; code: ErrorCode; message: string };
      if (event.type === "error") {
        const status = { auth: 401, "rate-limit": 429, unavailable: 503, "bad-request": 400 }[event.code as string];
        throw Object.assign(new Error(event.message), { statusCode: status });
      }
      if (event.type === "result") result = event.result;
      emit(event);
    }
  }
  if (!result) throw new Error("The response ended early.");
  return result;
}

const STAGE_LABEL: Record<string, string> = {
  writing: "writing",
  auditing: "checking for leftover patterns",
  repairing: "fixing a failed check",
  "fact-checking": "checking facts",
};

async function rewriteOne(
  chunk: Chunk,
  index: number,
  previous: string,
  options: RunOptions,
  onEvent: (event: PipelineEvent) => void,
  signal: AbortSignal,
): Promise<ChunkOutcome> {
  const { target } = options;
  const fineTuned = target.kind === "ollama" && target.engine !== "prompt";
  // Fine-tuned models are not trained on placeholders, so they rewrite the plain text.
  const masked = fineTuned ? { text: chunk.text, spans: [] } : protect(chunk.text, lockedRanges(chunk.text, options.locked));
  const context = previous.split(/\s+/).slice(-CONTEXT_WORDS).join(" ");
  const base = {
    intensity: options.intensity,
    voiceSample: options.voiceSample || undefined,
    context: context || undefined,
    factCheck: options.factCheck,
  };

  const result =
    target.kind === "cloud"
      ? await runCloudChunk(target, { ...base, chunk: masked.text }, onEvent, signal)
      : await humanizeChunk(
          ollamaGenerate(target.model, target.baseUrl ?? DEFAULT_OLLAMA_URL),
          masked.text,
          { ...base, engine: target.engine, concurrency: 1 },
          onEvent,
          signal,
        );

  let winner = result.best;
  if (options.scoreCandidates && result.candidates.length > 1) {
    const restored = result.candidates.map((c) => restore(c.text, masked.spans));
    const scores = await options.scoreCandidates(restored).catch(() => undefined);
    if (scores) winner = rankCandidates(result.candidates, scores)[0];
  }
  return {
    index,
    draft: chunk.text,
    text: restore(winner.text, masked.spans),
    violations: winner.violations,
    factProblems: result.factProblems,
  };
}

export type RunResult = {
  text: string;
  outcomes: ChunkOutcome[];
  chunks: Chunk[];
};

/**
 * Rewrites a document chunk by chunk. A failed chunk keeps its original text and is reported, so
 * partial work survives and only that chunk needs a retry.
 */
export async function rewriteDocument(
  draft: string,
  options: RunOptions,
  onProgress: (progress: RunProgress) => void,
  signal: AbortSignal,
  /** Finished chunks from an earlier run; only the others are rewritten. */
  previous: ChunkOutcome[] = [],
): Promise<RunResult> {
  const chunks = chunkText(draft);
  const proseIndexes = chunks.flatMap((chunk, i) => (chunk.kind === "prose" ? [i] : []));
  const output = chunks.map((chunk) => chunk.text);
  const outcomes: ChunkOutcome[] = [];

  for (const [position, index] of proseIndexes.entries()) {
    if (signal.aborted) break;
    const finished = previous.find((o) => o.index === index && !o.error && o.draft === chunks[index].text);
    if (finished) {
      output[index] = finished.text;
      outcomes.push(finished);
      continue;
    }
    let preview = "";
    const onEvent = (event: PipelineEvent) => {
      if (event.type === "delta") preview += event.text;
      if (event.type === "stage") preview = "";
      if (event.type === "stage" || event.type === "delta") {
        onProgress({
          part: position + 1,
          parts: proseIndexes.length,
          stage: event.type === "stage" ? STAGE_LABEL[event.stage] : "writing",
          preview,
        });
      }
    };
    onProgress({ part: position + 1, parts: proseIndexes.length, stage: "writing" });
    try {
      const outcome = await rewriteOne(chunks[index], index, output[index - 1] ?? "", options, onEvent, signal);
      output[index] = outcome.text;
      outcomes.push(outcome);
    } catch (error) {
      const failure = classifyError(error);
      outcomes.push({
        index,
        draft: chunks[index].text,
        text: chunks[index].text,
        violations: [],
        factProblems: null,
        error: failure,
      });
      if (failure.code === "cancelled" || failure.code === "auth") break;
    }
  }
  return {
    text: joinChunks(chunks.map((chunk, i) => ({ text: output[i], separator: chunk.separator }))),
    outcomes,
    chunks,
  };
}

export async function refineWithTarget(
  target: ModelTarget,
  input: { sentence: string; before: string; after: string },
  signal: AbortSignal,
): Promise<string[]> {
  if (target.kind === "ollama") {
    return refineSentence(ollamaGenerate(target.model, target.baseUrl ?? DEFAULT_OLLAMA_URL), input, signal);
  }
  const res = await fetch("/api/refine", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(target.apiKey ? { "x-provider-key": target.apiKey } : {}),
    },
    body: JSON.stringify({ ...input, provider: { id: target.provider, model: target.model } }),
    signal,
  });
  if (!res.ok) throw Object.assign(new Error("Request failed"), { statusCode: res.status });
  return ((await res.json()) as { alternatives: string[] }).alternatives;
}
