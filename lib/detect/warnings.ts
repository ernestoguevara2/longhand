import type { ScanWarning } from "./types";

const COMMON_ENGLISH = new Set(
  "the of and to in a is that it for was on with as are be this have from or by not but they you at his an which we can all were their has more one had there will would what when your about if so into".split(
    " ",
  ),
);

/** A rough check: detection is calibrated for English only, so a guess is good enough to warn. */
export function looksEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return true;
  const latinLetters = letters.filter((c) => /[a-zA-Z]/.test(c)).length;
  if (latinLetters / letters.length < 0.6) return false;
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 8) return true;
  const common = words.filter((w) => COMMON_ENGLISH.has(w)).length;
  return common / words.length >= 0.15;
}

const ACADEMIC_PATTERNS = [
  /\babstract\s*[:.\n]/i,
  /\bet al\./i,
  /\bin this (?:paper|study|report|thesis|article|work)\b/i,
  /\bwe (?:propose|present|investigate|evaluate|demonstrate|find that|show that)\b/i,
  /\b(?:results|findings) (?:show|suggest|indicate|demonstrate)\b/i,
  /\b(?:dataset|methodology|hypothesis|baseline|statistically significant|literature review)\b/i,
  /\(\s*[A-Z][a-z]+(?:\s+et al\.?)?,\s*\d{4}\s*\)/,
  /\[\d+\]/,
];

/** Detectors misjudge academic and technical writing badly, so these texts get a visible warning. */
export function looksAcademic(text: string): boolean {
  const hits = ACADEMIC_PATTERNS.filter((pattern) => pattern.test(text)).length;
  return hits >= 2;
}

export const WARNING_TEXT = {
  tooShort: "Under 50 words is too short for a verdict. Showing writing patterns only.",
  short: "Under 150 words, scores are unreliable. Treat this as a rough guide.",
  academic:
    "This looks academic or technical. Detectors often flag this kind of writing even when a person wrote it.",
  notEnglish: "Scores are calibrated for English only, so no percentage is shown.",
  disagree: "The classifier and the writing patterns disagree, so confidence is lower.",
  nonProse: "Code and tables were left out of the score.",
  quickRead: "Quick read from writing patterns only. Run a deep scan for a fuller estimate.",
} as const;

export function warning(id: ScanWarning["id"], message: string): ScanWarning {
  return { id, message };
}
