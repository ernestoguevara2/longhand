import { createOllama } from "ollama-ai-provider-v2";

import type { Generate } from "@/lib/humanize/types";

import { makeGenerate } from "./generate";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const CONTEXT_TOKENS = 8192;

/**
 * Ollama is always called from where the user is, in the browser or in a local script. Text sent
 * to it never passes through the Longhand server, and the server never needs a user-supplied URL.
 */
export function ollamaGenerate(model: string, baseUrl: string = DEFAULT_OLLAMA_URL): Generate {
  const provider = createOllama({ baseURL: `${baseUrl.replace(/\/+$/, "")}/api` });
  return makeGenerate(provider(model), ({ topK }) => ({
    ollama: {
      think: false,
      options: { num_ctx: CONTEXT_TOKENS, ...(topK === undefined ? {} : { top_k: topK }) },
    },
  }));
}

export async function listOllamaModels(baseUrl: string = DEFAULT_OLLAMA_URL, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, { signal });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const body = (await res.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name);
}
