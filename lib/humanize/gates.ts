import { looksEnglish } from "@/lib/detect/warnings";
import { changedFraction } from "@/lib/text/diff";
import { findTokens } from "@/lib/text/protect";
import { countWords, splitParagraphs } from "@/lib/text/segment";

import type { Engine, GateViolation, Intensity } from "./types";

/** Fine-tuned models rewrite fully, so they use the widest length range. */
const LENGTH_RANGE: Record<Intensity, [number, number]> = {
  light: [0.85, 1.15],
  medium: [0.75, 1.3],
  aggressive: [0.7, 1.4],
};

const MIN_CHANGE: Record<Intensity, number> = { light: 0.03, medium: 0.15, aggressive: 0.3 };

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8",
  nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", thirty: "30",
  forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
};

/**
 * Digits as a multiset, with "%" kept as part of the value so "37 complaints" and "37%" differ.
 * Small spelled-out numbers count as digits, so "3" and "three" are the same fact.
 */
export function extractNumbers(text: string): string[] {
  const found: string[] = [];
  const pattern = /\d[\d,]*(?:\.\d+)?(?:\s?(?:%|percent\b|per cent\b))?/gi;
  for (const match of text.matchAll(pattern)) {
    const percent = /%|percent|per cent/i.test(match[0]);
    const value = match[0].replace(/\s?(?:%|percent|per cent)/i, "").replace(/,/g, "").replace(/\.$/, "");
    found.push(percent ? `${value}%` : value);
  }
  return found;
}

function spelledNumbers(text: string): Set<string> {
  const values = new Set<string>();
  for (const word of text.toLowerCase().match(/\b[a-z]+\b/g) ?? []) {
    const value = NUMBER_WORDS[word];
    if (value) values.add(value);
  }
  return values;
}

function checkNumbers(draft: string, rewrite: string): GateViolation[] {
  const before = extractNumbers(draft);
  const after = extractNumbers(rewrite);
  const missing = [...new Set(before)].filter((n) => !after.includes(n) && !spelledNumbers(rewrite).has(n));
  const added = [...new Set(after)].filter((n) => !before.includes(n) && !spelledNumbers(draft).has(n));
  const out: GateViolation[] = [];
  if (missing.length) out.push({ gate: "numbers", message: `Missing numbers: ${missing.join(", ")}` });
  if (added.length) out.push({ gate: "numbers", message: `New numbers not in the draft: ${added.join(", ")}` });
  return out;
}

const NOT_NAMES = new Set(
  "I A An The This That These Those It He She They We You His Her Their Our My Your In On At Of For From To By With And But Or If When While After Before As So Then There Here What Why How Who Where Which Yet Although Because Since Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December".split(
    " ",
  ),
);

/** Proper nouns in the draft: capitalized words mid-sentence, multi-word names, and acronyms. */
export function extractNames(text: string): string[] {
  const names = new Set<string>();
  const prose = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
  for (const match of prose.matchAll(/\b[A-Z][\p{L}’'-]+(?:\s+(?:of\s+|the\s+|de\s+|van\s+|von\s+)?[A-Z][\p{L}’'-]+)*/gu)) {
    const before = prose.slice(Math.max(0, match.index - 2), match.index);
    const opensSentence = match.index === 0 || /[.!?:]\s$|\n\s*$|["“(]$/.test(before);
    const parts = match[0].split(/\s+/);
    if (opensSentence && parts.length === 1 && !/^[A-Z0-9]{2,}$/.test(match[0])) continue;
    const significant = parts.filter((part) => !NOT_NAMES.has(part) && !/^(?:of|the|de|van|von)$/.test(part));
    if (significant.length) names.add(significant.join(" ").replace(/['’]s$/, ""));
  }
  return [...names];
}

function checkNames(draft: string, rewrite: string): GateViolation[] {
  const haystack = rewrite.toLowerCase();
  const missing = extractNames(draft).filter((name) =>
    name
      .split(/\s+/)
      .some((part) => !haystack.includes(part.replace(/['’]s$/, "").toLowerCase())),
  );
  return missing.length ? [{ gate: "names", message: `Missing names: ${missing.join(", ")}` }] : [];
}

const normalizeQuotes = (text: string) => text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ");

function checkQuotesAndLinks(draft: string, rewrite: string): GateViolation[] {
  const after = normalizeQuotes(rewrite);
  const quotes = [...normalizeQuotes(draft).matchAll(/"([^"\n]{3,400})"/g)].map((m) => m[1]);
  const urlsOf = (text: string) =>
    (text.match(/https?:\/\/[^\s)\]]+/g) ?? []).map((u) => u.replace(/[.,;:!?'"]+$/, ""));
  const rewriteUrls = urlsOf(rewrite);
  const missing = [...quotes.filter((q) => !after.includes(q)), ...urlsOf(draft).filter((u) => !rewriteUrls.includes(u))];
  return missing.length
    ? [{ gate: "quotes", message: `Changed or missing quotes or links: ${missing.map((m) => `"${m.slice(0, 60)}"`).join(", ")}` }]
    : [];
}

const RESIDUE =
  /^\s*(?:here(?:'s| is| are)\b|sure\b|certainly\b|of course\b|okay\b|rewritten(?: text)?:|below is\b)|<\/?draft>|\bas an ai\b|\bi (?:cannot|can't|can’t|won't|won’t) (?:help|rewrite|assist)\b|###\s*rewritten/i;

function checkResidue(rewrite: string, draft: string): GateViolation[] {
  if (!rewrite.trim()) return [{ gate: "residue", message: "The model returned nothing." }];
  if (RESIDUE.test(rewrite) && !RESIDUE.test(draft)) {
    return [{ gate: "residue", message: "The output contains a preamble, a refusal, or leftover markup." }];
  }
  return [];
}

function checkDegenerate(draft: string, rewrite: string): GateViolation[] {
  const words = rewrite.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  const counts = new Map<string, number>();
  for (let i = 0; i + 5 <= words.length; i++) {
    const gram = words.slice(i, i + 5).join(" ");
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  const draftLower = draft.toLowerCase().replace(/\s+/g, " ");
  const repeated = [...counts.entries()].find(([gram, count]) => count >= 3 && !draftLower.includes(gram));
  if (repeated) return [{ gate: "degenerate", message: `Repeats itself: "${repeated[0]}"` }];
  const glued = (rewrite.match(/\b\p{Ll}+\p{Lu}\p{Ll}+\b/gu) ?? []).filter((w) => !draft.includes(w));
  if (glued.length >= 2) return [{ gate: "degenerate", message: `Words run together: ${glued.slice(0, 3).join(", ")}` }];
  return [];
}

export function runGates(
  draft: string,
  rewrite: string,
  intensity: Intensity,
  engine: Engine = "prompt",
): GateViolation[] {
  const violations: GateViolation[] = [...checkResidue(rewrite, draft)];
  if (violations.length) return violations;

  if (looksEnglish(draft) !== looksEnglish(rewrite)) {
    violations.push({ gate: "language", message: "The rewrite changed language." });
  }

  const missingTokens = findTokens(draft).filter((token) => !rewrite.includes(token));
  if (missingTokens.length) {
    violations.push({ gate: "protected", message: `Protected text was lost: ${missingTokens.join(", ")}` });
  }

  violations.push(...checkNumbers(draft, rewrite), ...checkNames(draft, rewrite), ...checkQuotesAndLinks(draft, rewrite));

  const before = splitParagraphs(draft).length;
  const after = splitParagraphs(rewrite).length;
  if (before !== after) {
    violations.push({ gate: "layout", message: `Paragraph count changed from ${before} to ${after}.` });
  }

  const effective: Intensity = engine === "prompt" ? intensity : "aggressive";
  const [low, high] = LENGTH_RANGE[effective];
  const ratio = countWords(rewrite) / Math.max(1, countWords(draft));
  if (ratio < low || ratio > high) {
    violations.push({ gate: "length", message: `Length is ${ratio.toFixed(2)} times the draft; expected ${low} to ${high}.` });
  }

  violations.push(...checkDegenerate(draft, rewrite));

  const changed = changedFraction(draft, rewrite);
  if (changed < MIN_CHANGE[effective]) {
    violations.push({ gate: "change", message: `Only ${Math.round(changed * 100)}% of words changed.` });
  }
  return violations;
}
