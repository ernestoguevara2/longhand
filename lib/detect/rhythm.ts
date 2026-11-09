import type { Paragraph, Sentence } from "@/lib/text/segment";

import type { TellMatch } from "./types";

const stdDevOverMean = (values: number[]): number => {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
};

/** Higher means more even sentence lengths. Zero when there are too few sentences to tell. */
export function rhythmUniformity(sentences: Sentence[]): number {
  const prose = sentences.filter((s) => s.words >= 2).map((s) => s.words);
  if (prose.length < 4) return 0;
  return Math.max(0, 1 - stdDevOverMean(prose));
}

export function paragraphUniformity(paragraphs: Paragraph[]): number {
  const lengths = paragraphs.map((p) => p.text.length);
  if (lengths.length < 3) return 0;
  return Math.max(0, 1 - stdDevOverMean(lengths));
}

const firstWord = (text: string) => text.match(/[\p{L}']+/u)?.[0].toLowerCase() ?? "";
const COMMON_OPENERS = new Set(["the", "a", "an", "in", "it"]);

/** Three or more consecutive sentences opening with the same word. */
export function findRepeatedOpenings(sentences: Sentence[]): TellMatch[] {
  const matches: TellMatch[] = [];
  let run: Sentence[] = [];
  const flush = () => {
    if (run.length >= 3) {
      for (const sentence of run) {
        const word = firstWord(sentence.text);
        matches.push({
          patternId: "repeated-opening",
          label: "Repeated sentence openings",
          why: `Several sentences in a row start with "${word}".`,
          tier: "weak",
          group: "rhythm",
          start: sentence.start,
          end: sentence.start + word.length,
          text: word,
        });
      }
    }
    run = [];
  };
  for (const sentence of sentences) {
    const word = firstWord(sentence.text);
    const previous = run.at(-1);
    if (word && !COMMON_OPENERS.has(word) && previous && firstWord(previous.text) === word && previous.paragraph === sentence.paragraph) {
      run.push(sentence);
    } else {
      flush();
      run = word && !COMMON_OPENERS.has(word) ? [sentence] : [];
    }
  }
  flush();
  return matches;
}

/** A row of three or more very short sentences, such as "No prior. No nostalgia. No taste." */
export function findFragmentRows(sentences: Sentence[]): TellMatch[] {
  const matches: TellMatch[] = [];
  let run: Sentence[] = [];
  const flush = () => {
    if (run.length >= 3) {
      matches.push({
        patternId: "fragment-row",
        label: "Row of fragments",
        why: "Short dramatic fragments in a row add emphasis without adding a claim.",
        tier: "strong",
        group: "staging",
        start: run[0].start,
        end: run.at(-1)!.end,
        text: run.map((s) => s.text).join(" "),
      });
    }
    run = [];
  };
  for (const sentence of sentences) {
    if (sentence.words > 0 && sentence.words <= 4 && run.at(-1)?.paragraph !== undefined && run.at(-1)?.paragraph !== sentence.paragraph) flush();
    if (sentence.words > 0 && sentence.words <= 4) run.push(sentence);
    else flush();
  }
  flush();
  return matches;
}

/** Em dashes, plus en dashes that are not number ranges, and spaced double hyphens. */
export function findDashes(text: string): TellMatch[] {
  const matches: TellMatch[] = [];
  for (const match of text.matchAll(/—|(?<!\d)–|–(?!\d)|\s--\s/g)) {
    matches.push({
      patternId: "dash",
      label: "Dash as a connector",
      why: "A dash lets a writer skip choosing how two clauses relate. One is fine; many are a tell.",
      tier: "weak",
      group: "rhythm",
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    });
  }
  return matches;
}
