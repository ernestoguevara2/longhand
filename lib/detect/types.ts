export type TellTier = "strong" | "weak";

export type TellGroup = "staging" | "rhythm" | "inflation" | "formatting" | "leftovers" | "vocabulary";

export type TellMatch = {
  patternId: string;
  label: string;
  why: string;
  tier: TellTier;
  group: TellGroup;
  start: number;
  end: number;
  text: string;
};

/** Numeric features used by calibration. Rates are per 100 words so length does not dominate. */
export type StyleFeatures = {
  strongTellsPer100: number;
  weakTellsPer100: number;
  vocabularyPer100: number;
  dashesPer100: number;
  /** 1 minus the coefficient of variation of sentence length, floored at 0. Higher means more uniform. */
  rhythmUniformity: number;
  repeatedOpeningRate: number;
  paragraphUniformity: number;
};

export type SentenceSignal = "none" | "some" | "strong";

export type SentenceResult = {
  index: number;
  start: number;
  end: number;
  text: string;
  signal: SentenceSignal;
  tells: TellMatch[];
  /** Classifier probability of the window around this sentence, once the deep scan has run. */
  windowScore?: number;
};

export type Band = "not-enough-text" | "likely-human" | "unclear" | "likely-ai";

export type Confidence = "low" | "medium" | "high";

export type ScanWarningId =
  | "too-short"
  | "short"
  | "academic"
  | "not-english"
  | "signals-disagree"
  | "non-prose-excluded"
  | "quick-read";

export type ScanWarning = { id: ScanWarningId; message: string };

export type ScanResult = {
  mode: "quick" | "deep";
  /** Calibrated 0 to 100 AI-signal score, or null when no score should be shown. */
  score: number | null;
  band: Band;
  confidence: Confidence;
  flaggedShare: number;
  words: number;
  sentences: SentenceResult[];
  tells: TellMatch[];
  features: StyleFeatures;
  classifierScore?: number;
  warnings: ScanWarning[];
};
