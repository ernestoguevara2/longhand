import { countWords, splitParagraphs, splitSentences, type Paragraph, type Sentence } from "@/lib/text/segment";

import { findPatternTells, maskIgnored } from "./patterns";
import { findDashes, findFragmentRows, findRepeatedOpenings, paragraphUniformity, rhythmUniformity } from "./rhythm";
import type { StyleFeatures, TellMatch } from "./types";
import { findVocabularyTells } from "./vocabulary";

export type StyleAnalysis = {
  words: number;
  sentences: Sentence[];
  paragraphs: Paragraph[];
  tells: TellMatch[];
  features: StyleFeatures;
};

/**
 * Candidates for calibration. paragraphUniformity is computed but left out on purpose: in the
 * training data most human essays are one paragraph, so it mostly learns the dataset's formatting.
 */
export const FEATURE_NAMES = [
  "strongTellsPer100",
  "weakTellsPer100",
  "vocabularyPer100",
  "dashesPer100",
  "rhythmUniformity",
  "repeatedOpeningRate",
] as const satisfies readonly (keyof StyleFeatures)[];

/** Pure and synchronous: this is the instant layer of the scan. */
export function analyzeStyle(text: string): StyleAnalysis {
  const words = countWords(text);
  const paragraphs = splitParagraphs(text);
  const sentences = splitSentences(text);
  const masked = maskIgnored(text);

  const tells = [
    ...findPatternTells(text, masked),
    ...findVocabularyTells(text, masked),
    ...findDashes(masked),
    ...findRepeatedOpenings(sentences),
    ...findFragmentRows(sentences),
  ].sort((a, b) => a.start - b.start);

  const per100 = (count: number) => (words ? (count / words) * 100 : 0);
  const count = (predicate: (t: TellMatch) => boolean) => tells.filter(predicate).length;
  const repeated = count((t) => t.patternId === "repeated-opening");

  return {
    words,
    sentences,
    paragraphs,
    tells,
    features: {
      strongTellsPer100: per100(count((t) => t.tier === "strong")),
      weakTellsPer100: per100(count((t) => t.tier === "weak" && t.group !== "vocabulary" && t.patternId !== "dash")),
      vocabularyPer100: per100(count((t) => t.group === "vocabulary")),
      dashesPer100: per100(count((t) => t.patternId === "dash")),
      rhythmUniformity: rhythmUniformity(sentences),
      repeatedOpeningRate: sentences.length ? repeated / sentences.length : 0,
      paragraphUniformity: paragraphUniformity(paragraphs),
    },
  };
}
