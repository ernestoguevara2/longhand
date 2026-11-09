import type { Engine, Intensity } from "@/lib/humanize/types";
import { DEFAULT_MODELS, type CloudProvider } from "@/lib/llm/providers";

export type ProviderChoice = CloudProvider | "ollama";
export type ExternalDetector = "sapling" | "pangram" | "gptzero";
export type KeyName = CloudProvider | ExternalDetector;

export type Settings = {
  provider: ProviderChoice;
  models: Partial<Record<ProviderChoice, string>>;
  ollamaUrl: string;
  engine: Engine;
  intensity: Intensity;
  voiceSample: string;
  factCheck: boolean;
  historyEnabled: boolean;
  deepScanAllowed: boolean;
  rememberKeys: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  provider: "ollama",
  models: { ...DEFAULT_MODELS },
  ollamaUrl: "http://localhost:11434",
  engine: "prompt",
  intensity: "medium",
  voiceSample: "",
  factCheck: true,
  historyEnabled: true,
  deepScanAllowed: false,
  rememberKeys: false,
};

const SETTINGS_KEY = "longhand.settings.v1";
const KEYS_KEY = "longhand.keys.v1";

/** Storage can be blocked or full, so every access tolerates failure. */
function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): Settings {
  const stored = read(SETTINGS_KEY);
  return stored && typeof stored === "object"
    ? { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) }
    : DEFAULT_SETTINGS;
}

export const saveSettings = (settings: Settings) => write(SETTINGS_KEY, settings);

export function loadKeys(): Partial<Record<KeyName, string>> {
  const stored = read(KEYS_KEY);
  return stored && typeof stored === "object" ? (stored as Partial<Record<KeyName, string>>) : {};
}

/** Keys live in memory unless the user opts in; opting out wipes anything stored. */
export function saveKeys(keys: Partial<Record<KeyName, string>>, remember: boolean) {
  if (remember) write(KEYS_KEY, keys);
  else {
    try {
      window.localStorage.removeItem(KEYS_KEY);
    } catch {
      // Nothing to clear if storage is blocked.
    }
  }
}
