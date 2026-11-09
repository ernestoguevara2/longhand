/** Text segmentation with character offsets, shared by every feature so highlights stay aligned. */

export type Sentence = {
  index: number;
  paragraph: number;
  start: number;
  end: number;
  text: string;
  words: number;
};

export type Paragraph = { index: number; start: number; end: number; text: string };

const ABBREVIATION =
  /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|cf|al|Fig|No|Inc|Ltd|Co|Corp|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|U\.K|[A-Z])\.$/;

export function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+(?:['’.\-][\p{L}\p{N}]+)*/gu) ?? []).length;
}

export function splitParagraphs(text: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const pattern = /(?:[^\r\n]|\r?\n(?![ \t]*\r?\n))+/g;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = match.index + lead;
    paragraphs.push({ index: paragraphs.length, start, end: start + trimmed.length, text: trimmed });
  }
  return paragraphs;
}

/** Sentence boundaries from Intl.Segmenter, re-joined where it split after an abbreviation or initial. */
function segmentParagraph(paragraph: Paragraph, firstIndex: number): Sentence[] {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const pieces: { start: number; end: number }[] = [];
  for (const { segment, index } of segmenter.segment(paragraph.text)) {
    const lead = segment.length - segment.trimStart().length;
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const piece = { start: index + lead, end: index + lead + trimmed.length };
    const previous = pieces.at(-1);
    if (previous && shouldJoin(paragraph.text.slice(previous.start, previous.end), trimmed)) {
      previous.end = piece.end;
    } else {
      pieces.push(piece);
    }
  }
  return pieces.map((piece, offset) => {
    const body = paragraph.text.slice(piece.start, piece.end);
    return {
      index: firstIndex + offset,
      paragraph: paragraph.index,
      start: paragraph.start + piece.start,
      end: paragraph.start + piece.end,
      text: body,
      words: countWords(body),
    };
  });
}

function shouldJoin(previous: string, next: string): boolean {
  if (!ABBREVIATION.test(previous)) return false;
  // "Dr. Lee" joins; "in the U.S. The next" also joins, which is the safer failure for highlighting.
  return /^[\p{Lu}\p{Ll}\p{N}(]/u.test(next);
}

export function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  for (const paragraph of splitParagraphs(text)) {
    sentences.push(...segmentParagraph(paragraph, sentences.length));
  }
  return sentences;
}
