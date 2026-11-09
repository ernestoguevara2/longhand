import data from "./data/ai-vocabulary.json";
import type { TellMatch } from "./types";

const WHY =
  "Language models use this word far more often than people do. One is a coincidence; several together are a tell.";

const singleWords = [...new Set(Object.values(data.eras).flat())];
const wordRegex = new RegExp(`\\b(?:${singleWords.join("|")})\\b`, "gi");
const contextual = data.contextual.map((entry) => ({
  id: entry.id,
  regex: new RegExp(entry.pattern, "gi"),
}));

/** A capitalized word mid-sentence is probably a name ("Vibrant Inc."), so it is not counted. */
function looksLikeName(text: string, start: number): boolean {
  const first = text[start];
  if (first !== first.toUpperCase() || first === first.toLowerCase()) return false;
  const before = text.slice(Math.max(0, start - 2), start);
  return before.length > 0 && !/^\s*$|[.!?:]\s*$|\n\s*$/.test(before);
}

export function findVocabularyTells(text: string, masked: string): TellMatch[] {
  const matches: TellMatch[] = [];
  const add = (patternId: string, start: number, end: number) => {
    if (looksLikeName(text, start)) return;
    if (matches.some((m) => start < m.end && end > m.start)) return;
    matches.push({
      patternId,
      label: "AI vocabulary",
      why: WHY,
      tier: "weak",
      group: "vocabulary",
      start,
      end,
      text: text.slice(start, end),
    });
  };
  for (const { id, regex } of contextual) {
    for (const match of masked.matchAll(regex)) add(id, match.index, match.index + match[0].length);
  }
  for (const match of masked.matchAll(wordRegex)) {
    add("ai-word", match.index, match.index + match[0].length);
  }
  return matches.sort((a, b) => a.start - b.start);
}

export const VOCABULARY_VERSION = data.version;
