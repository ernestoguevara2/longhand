import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import type { Generate } from "@/lib/humanize/types";

import { makeGenerate } from "./generate";
import type { CloudProvider } from "./providers";

/** Server only. The key comes from the request or an explicitly enabled environment variable. */
export function cloudModel(provider: CloudProvider, model: string, apiKey: string): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(model);
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "groq":
      return createGroq({ apiKey })(model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(model);
  }
}

export const cloudGenerate = (provider: CloudProvider, model: string, apiKey: string): Generate =>
  makeGenerate(cloudModel(provider, model, apiKey));

/** Lists models from the provider's own endpoint. */
export async function listCloudModels(provider: CloudProvider, apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const request: { url: string; headers: Record<string, string> } = {
    anthropic: {
      url: "https://api.anthropic.com/v1/models?limit=100",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    },
    openai: { url: "https://api.openai.com/v1/models", headers: { authorization: `Bearer ${apiKey}` } },
    groq: { url: "https://api.groq.com/openai/v1/models", headers: { authorization: `Bearer ${apiKey}` } },
    google: {
      url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
      headers: { "x-goog-api-key": apiKey },
    },
  }[provider];
  const res = await fetch(request.url, { headers: request.headers, signal });
  if (!res.ok) throw Object.assign(new Error(`Provider returned ${res.status}`), { statusCode: res.status });
  const body = (await res.json()) as { data?: { id: string }[]; models?: { name: string }[] };
  const ids = body.data?.map((m) => m.id) ?? body.models?.map((m) => m.name.replace(/^models\//, "")) ?? [];
  return ids.sort();
}
