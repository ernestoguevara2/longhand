import { diffArrays, diffWordsWithSpace } from "diff";

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

export function wordDiff(before: string, after: string): DiffPart[] {
  return diffWordsWithSpace(before, after).map((part) => ({
    kind: part.added ? "added" : part.removed ? "removed" : "same",
    text: part.value,
  }));
}

const toWords = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];

/** Share of the longer text's words that did not survive, from 0 (identical) to 1 (all new). */
export function changedFraction(before: string, after: string): number {
  const a = toWords(before);
  const b = toWords(after);
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 0;
  let kept = 0;
  for (const part of diffArrays(a, b)) if (!part.added && !part.removed) kept += part.count ?? part.value.length;
  return 1 - kept / longest;
}
