import type { Intensity } from "@/lib/humanize/types";

export type HistoryEntry = {
  id: string;
  createdAt: number;
  draft: string;
  rewrite: string;
  intensity: Intensity;
  provider: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
};

const KEY = "longhand.history.v1";
export const MAX_ENTRIES = 20;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** When storage is full, the oldest entries are dropped until the rest fit. */
export function saveHistory(entries: HistoryEntry[]): HistoryEntry[] {
  let kept = entries.slice(0, MAX_ENTRIES);
  while (kept.length) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(kept));
      return kept;
    } catch {
      kept = kept.slice(0, -1);
    }
  }
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage is blocked; history simply does not persist.
  }
  return kept;
}
