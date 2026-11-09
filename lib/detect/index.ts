import { cleanForClassifier } from "./clean";
import { bandFor, fuseDeep, fuseQuick, pooledClassifierScore } from "./fusion";
import { analyzeStyle, type StyleAnalysis } from "./stylometry";
import type { Band, Confidence, ScanResult, ScanWarning, SentenceResult, SentenceSignal, TellMatch } from "./types";
import { looksAcademic, looksEnglish, warning, WARNING_TEXT } from "./warnings";
import { documentWindows, sentenceWindows, spreadWindowScores } from "./windows";

export const MIN_WORDS_FOR_VERDICT = 50;
export const LOW_CONFIDENCE_WORDS = 150;
export const MIN_WORDS_FOR_SENTENCE_SCORES = 80;

/** Scores text windows. Implemented by the Web Worker in the browser and by ONNX Runtime in scripts. */
export type ClassifyFn = (
  windows: string[],
  onProgress?: (done: number, total: number) => void,
) => Promise<number[]>;

function sentenceSignal(
  tells: TellMatch[],
  windowScore: number | undefined,
  band: Band,
  dashHeavy: boolean,
): SentenceSignal {
  const counted = tells.filter((t) => t.patternId !== "dash" || dashHeavy);
  // The classifier saturates on whole documents, so it alone never earns the strongest mark:
  // that is kept for patterns the user can see and act on.
  if (counted.some((t) => t.tier === "strong") || counted.length >= 3) return "strong";
  if (counted.length > 0) return "some";
  if (windowScore !== undefined && band !== "likely-human" && windowScore >= 0.8) return "some";
  return "none";
}

function buildSentences(
  analysis: StyleAnalysis,
  band: Band,
  windowScores?: (number | undefined)[],
): SentenceResult[] {
  const dashHeavy = analysis.features.dashesPer100 >= 0.5;
  return analysis.sentences.map((sentence) => {
    const tells = analysis.tells.filter((t) => t.start < sentence.end && t.end > sentence.start);
    const windowScore = windowScores?.[sentence.index];
    return {
      index: sentence.index,
      start: sentence.start,
      end: sentence.end,
      text: sentence.text,
      signal: sentenceSignal(tells, windowScore, band, dashHeavy),
      tells,
      windowScore,
    };
  });
}

function flaggedShare(analysis: StyleAnalysis, sentences: SentenceResult[]): number {
  if (!analysis.words) return 0;
  const flagged = sentences.reduce(
    (sum, s) => sum + (s.signal === "none" ? 0 : (analysis.sentences[s.index]?.words ?? 0)),
    0,
  );
  return Math.min(1, flagged / analysis.words);
}

function baseWarnings(text: string, analysis: StyleAnalysis, mode: "quick" | "deep"): ScanWarning[] {
  const warnings: ScanWarning[] = [];
  if (!looksEnglish(text)) warnings.push(warning("not-english", WARNING_TEXT.notEnglish));
  if (analysis.words < MIN_WORDS_FOR_VERDICT) warnings.push(warning("too-short", WARNING_TEXT.tooShort));
  else if (analysis.words < LOW_CONFIDENCE_WORDS) warnings.push(warning("short", WARNING_TEXT.short));
  if (looksAcademic(text)) warnings.push(warning("academic", WARNING_TEXT.academic));
  if (/```[\s\S]*?```|^\|.*\|\s*$/m.test(text)) warnings.push(warning("non-prose-excluded", WARNING_TEXT.nonProse));
  if (mode === "quick") warnings.push(warning("quick-read", WARNING_TEXT.quickRead));
  return warnings;
}

function confidenceFor(
  analysis: StyleAnalysis,
  warnings: ScanWarning[],
  mode: "quick" | "deep",
  score: number | null,
): Confidence {
  if (score === null || mode === "quick") return "low";
  const blocked = new Set<ScanWarning["id"]>(["short", "academic", "signals-disagree"]);
  if (warnings.some((w) => blocked.has(w.id))) return "low";
  if (analysis.words < 300) return "medium";
  return score >= 0.9 || score <= 0.1 ? "high" : "medium";
}

/** Instant, synchronous, and entirely local. */
export function quickScan(text: string): ScanResult {
  const analysis = analyzeStyle(text);
  const warnings = baseWarnings(text, analysis, "quick");
  const hidden = warnings.some((w) => w.id === "too-short" || w.id === "not-english");
  const probability = hidden ? null : fuseQuick(analysis.features);
  const band: Band = probability === null ? "not-enough-text" : bandFor(probability, "quick");
  const sentences = buildSentences(analysis, band);
  return {
    mode: "quick",
    score: probability === null ? null : Math.round(probability * 100),
    band,
    confidence: confidenceFor(analysis, warnings, "quick", probability),
    flaggedShare: flaggedShare(analysis, sentences),
    words: analysis.words,
    sentences,
    tells: analysis.tells,
    features: analysis.features,
    warnings,
  };
}

/** Quick scan plus the classifier. Sentence windows are only scored when there is enough text. */
export async function deepScan(
  text: string,
  classify: ClassifyFn,
  onProgress?: (done: number, total: number) => void,
): Promise<ScanResult> {
  const analysis = analyzeStyle(text);
  const warnings = baseWarnings(text, analysis, "deep");
  const hidden = warnings.some((w) => w.id === "too-short" || w.id === "not-english");
  if (hidden) return { ...quickScan(text), mode: "deep", warnings };

  const docWindows = documentWindows(text, analysis.sentences).map(cleanForClassifier).filter(Boolean);
  const sentWindows =
    analysis.words >= MIN_WORDS_FOR_SENTENCE_SCORES ? sentenceWindows(text, analysis.sentences) : [];
  const total = docWindows.length + sentWindows.length;

  const scores = await classify(
    [...docWindows, ...sentWindows.map((w) => cleanForClassifier(w.text) || " ")],
    onProgress ? (done) => onProgress(done, total) : undefined,
  );
  const classifierScore = pooledClassifierScore(scores.slice(0, docWindows.length));
  const windowScores = spreadWindowScores(sentWindows, scores.slice(docWindows.length), analysis.sentences.length);

  const probability = fuseDeep(classifierScore, analysis.features);
  const band = bandFor(probability, "deep");

  const strongCount = analysis.tells.filter((t) => t.tier === "strong").length;
  if ((classifierScore >= 0.9 && analysis.tells.length === 0) || (classifierScore <= 0.2 && strongCount >= 3)) {
    warnings.push(warning("signals-disagree", WARNING_TEXT.disagree));
  }

  const sentences = buildSentences(analysis, band, windowScores);
  return {
    mode: "deep",
    score: Math.round(probability * 100),
    band,
    confidence: confidenceFor(analysis, warnings, "deep", probability),
    flaggedShare: flaggedShare(analysis, sentences),
    words: analysis.words,
    sentences,
    tells: analysis.tells,
    features: analysis.features,
    classifierScore,
    warnings,
  };
}

export type { ScanResult, SentenceResult, TellMatch } from "./types";
