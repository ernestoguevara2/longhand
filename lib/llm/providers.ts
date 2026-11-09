export const CLOUD_PROVIDERS = ["anthropic", "openai", "groq", "google"] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<CloudProvider | "ollama", string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  groq: "Groq",
  google: "Google Gemini",
  ollama: "Ollama on this computer",
};

/**
 * Suggested models. Only Anthropic has a default: third-party lists of other providers' model IDs
 * conflict, so for those the settings screen lists models from the provider's own endpoint.
 */
export const DEFAULT_MODELS: Partial<Record<CloudProvider, string>> = {
  anthropic: "claude-sonnet-5-5",
};

export const SERVER_KEY_ENV: Record<CloudProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};
