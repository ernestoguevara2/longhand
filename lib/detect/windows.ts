import type { Sentence } from "@/lib/text/segment";

/** About what fits the classifier's 512 tokens, leaving a margin. */
const DOCUMENT_WINDOW_WORDS = 340;
const MAX_DOCUMENT_WINDOWS = 40;
const SENTENCE_WINDOW_SIZE = 3;
const MAX_SENTENCE_WINDOWS = 160;

export type SentenceWindow = { first: number; last: number; text: string };

/** Splits a document at sentence boundaries into windows the classifier can read whole. */
export function documentWindows(text: string, sentences: Sentence[]): string[] {
  if (sentences.length === 0) return text.trim() ? [text.trim()] : [];
  const windows: string[] = [];
  let start = 0;
  let words = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (words > 0 && words + sentences[i].words > DOCUMENT_WINDOW_WORDS) {
      windows.push(text.slice(sentences[start].start, sentences[i - 1].end));
      start = i;
      words = 0;
    }
    words += sentences[i].words;
  }
  windows.push(text.slice(sentences[start].start, sentences.at(-1)!.end));
  if (windows.length <= MAX_DOCUMENT_WINDOWS) return windows;
  const step = windows.length / MAX_DOCUMENT_WINDOWS;
  return Array.from({ length: MAX_DOCUMENT_WINDOWS }, (_, i) => windows[Math.floor(i * step)]);
}

/** Overlapping three-sentence windows for highlights, thinned out on long documents. */
export function sentenceWindows(text: string, sentences: Sentence[]): SentenceWindow[] {
  if (sentences.length === 0) return [];
  const stride = Math.max(
    1,
    Math.ceil(Math.max(0, sentences.length - SENTENCE_WINDOW_SIZE + 1) / MAX_SENTENCE_WINDOWS),
  );
  // A thinned-out stride widens the window too, so no sentence falls between two windows.
  const size = Math.max(SENTENCE_WINDOW_SIZE, stride);
  const windows: SentenceWindow[] = [];
  for (let first = 0; first < sentences.length; first += stride) {
    const last = Math.min(first + size - 1, sentences.length - 1);
    windows.push({ first, last, text: text.slice(sentences[first].start, sentences[last].end) });
    if (last === sentences.length - 1) break;
  }
  return windows;
}

/** Average probability of the windows covering each sentence; undefined if none cover it. */
export function spreadWindowScores(
  windows: SentenceWindow[],
  scores: number[],
  sentenceCount: number,
): (number | undefined)[] {
  const totals = new Array<number>(sentenceCount).fill(0);
  const counts = new Array<number>(sentenceCount).fill(0);
  windows.forEach((window, i) => {
    for (let s = window.first; s <= window.last; s++) {
      totals[s] += scores[i];
      counts[s] += 1;
    }
  });
  return totals.map((total, i) => (counts[i] ? total / counts[i] : undefined));
}
