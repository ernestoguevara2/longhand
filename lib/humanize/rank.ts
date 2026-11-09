import type { Candidate } from "./types";

/**
 * Faithfulness first: a candidate that passes the gates always beats one that fails them.
 * Among equals, fewer remaining tells wins, then the lower classifier score if one is available.
 * Never chooses a less faithful text because a detector prefers it.
 */
export function rankCandidates(candidates: Candidate[], classifierScores?: number[]): Candidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, score: classifierScores?.[index] ?? 0 }))
    .sort(
      (a, b) =>
        a.candidate.violations.length - b.candidate.violations.length ||
        a.score - b.score ||
        a.candidate.tellsPer100 - b.candidate.tellsPer100,
    )
    .map((entry) => entry.candidate);
}
