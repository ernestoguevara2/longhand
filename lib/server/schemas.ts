import { z } from "zod";

import { INTENSITIES } from "@/lib/humanize/types";
import { CLOUD_PROVIDERS } from "@/lib/llm/providers";
import { LIMITS } from "@/lib/text/limits";

const provider = z.object({
  id: z.enum(CLOUD_PROVIDERS),
  model: z.string().trim().min(1).max(120),
});

const SHORT_TEXT = 4_000;

export const humanizeSchema = z.object({
  chunk: z.string().trim().min(1).max(LIMITS.maxRequestChars),
  intensity: z.enum(INTENSITIES),
  voiceSample: z.string().max(SHORT_TEXT).optional(),
  context: z.string().max(SHORT_TEXT).optional(),
  factCheck: z.boolean().optional(),
  provider,
});

export const refineSchema = z.object({
  sentence: z.string().trim().min(1).max(2_000),
  before: z.string().max(SHORT_TEXT).default(""),
  after: z.string().max(SHORT_TEXT).default(""),
  provider,
});

export const modelsSchema = z.object({ provider: z.enum(CLOUD_PROVIDERS) });

export const EXTERNAL_DETECTORS = ["sapling", "pangram", "gptzero"] as const;

export const externalDetectSchema = z.object({
  detector: z.enum(EXTERNAL_DETECTORS),
  text: z.string().trim().min(1).max(LIMITS.maxRequestChars),
});
