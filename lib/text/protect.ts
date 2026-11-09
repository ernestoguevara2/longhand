/**
 * Swaps text that must survive word for word (code, URLs, citations, quotations, spans the user
 * locked) for placeholders before rewriting, and restores it afterwards.
 */

export type ProtectedSpan = { token: string; text: string };
export type Range = { start: number; end: number };

const AUTOMATIC: RegExp[] = [
  /`[^`\n]+`/g,
  /https?:\/\/[^\s)\]]+/g,
  /\[\d+(?:\s*[,–-]\s*\d+)*\]/g,
  /\(\s*[A-Z][\p{L}'’-]+(?:\s+(?:et al\.?|and|&)\s*[\p{L}'’-]*)?,\s*\d{4}[a-z]?(?:,\s*pp?\.\s*\d+(?:[–-]\d+)?)?\s*\)/gu,
  /“[^”\n]{1,400}”/g,
  /(?<=^|[\s(\[])"[^"\n]{1,400}"/g,
];

const tokenFor = (n: number) => `⟦P${n}⟧`;
const TOKEN = /⟦P\d+⟧/g;

export function protect(text: string, userLocked: Range[] = []): { text: string; spans: ProtectedSpan[] } {
  const ranges: Range[] = [...userLocked];
  for (const pattern of AUTOMATIC) {
    for (const match of text.matchAll(pattern)) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: Range[] = [];
  for (const range of ranges) {
    if (range.end <= range.start) continue;
    const last = merged.at(-1);
    if (last && range.start < last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  const spans: ProtectedSpan[] = [];
  let output = "";
  let cursor = 0;
  for (const range of merged) {
    output += text.slice(cursor, range.start);
    const token = tokenFor(spans.length + 1);
    spans.push({ token, text: text.slice(range.start, range.end) });
    output += token;
    cursor = range.end;
  }
  output += text.slice(cursor);
  return { text: output, spans };
}

export function restore(text: string, spans: ProtectedSpan[]): string {
  const lookup = new Map(spans.map((span) => [span.token, span.text]));
  // A model can't see punctuation inside a token, so it may repeat it just after: "done.". becomes "done."
  return text.replace(/⟦P\d+⟧([.,;:!?])?/g, (match, after: string | undefined) => {
    const token = after ? match.slice(0, -after.length) : match;
    const original = lookup.get(token);
    if (original === undefined) return match;
    const closing = original.match(/([.,;:!?])["”’']?$/)?.[1];
    return closing && closing === after ? original : original + (after ?? "");
  });
}

export function findTokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}
