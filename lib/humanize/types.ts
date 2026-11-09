export const INTENSITIES = ["light", "medium", "aggressive"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const ENGINES = ["prompt", "humanizer-12b", "smaug-12b"] as const;
export type Engine = (typeof ENGINES)[number];

export type GenerateRequest = {
  instructions?: string;
  prompt: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  stop?: string[];
  maxOutputTokens?: number;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
};

/** Implemented with the AI SDK on the server and in the browser, and by a stub in tests. */
export type Generate = (request: GenerateRequest) => Promise<string>;

export type GateName =
  | "residue"
  | "language"
  | "protected"
  | "numbers"
  | "names"
  | "quotes"
  | "layout"
  | "length"
  | "degenerate"
  | "change";

export type GateViolation = { gate: GateName; message: string };

export type FactProblem = {
  kind: "changed" | "added" | "dropped";
  draft: string;
  rewrite: string;
  explanation: string;
};

export type Candidate = {
  text: string;
  violations: GateViolation[];
  changed: number;
  tellsPer100: number;
  repaired: boolean;
};

export type ChunkResult = {
  best: Candidate;
  candidates: Candidate[];
  factProblems: FactProblem[] | null;
};

export type PipelineEvent =
  | { type: "stage"; stage: "writing" | "auditing" | "repairing" | "fact-checking"; candidate: number; of: number }
  | { type: "delta"; text: string }
  | { type: "result"; result: ChunkResult };

export type ChunkOptions = {
  intensity: Intensity;
  engine?: Engine;
  voiceSample?: string;
  /** Text immediately before this chunk, for continuity. Never rewritten. */
  context?: string;
  factCheck?: boolean;
  /** Parallel generation is fine for cloud models; Ollama should use 1. */
  concurrency?: number;
  candidates?: number;
};
