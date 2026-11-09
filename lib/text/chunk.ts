import { LIMITS } from "./limits";
import { countWords } from "./segment";

/**
 * A piece of the document. "locked" pieces (code fences, tables, headings) pass through unchanged;
 * "prose" pieces are rewritten. `separator` is the original whitespace after the piece, so joining
 * pieces reproduces the document's layout.
 */
export type Chunk = { kind: "prose" | "locked"; text: string; separator: string; words: number };

const isLockedBlock = (block: string) =>
  /^```/.test(block) ||
  /^\s*\|.*\|\s*$/m.test(block) ||
  /^#{1,6}\s/.test(block) ||
  /^\s*(?:[-*_]\s*){3,}$/.test(block);

function splitBlocks(text: string): { text: string; separator: string }[] {
  const blocks: { text: string; separator: string }[] = [];
  // Keep fenced code whole even if it contains blank lines.
  const pattern = /(?=\S)(?:```[\s\S]*?```|(?:[^\r\n]|\r?\n(?![ \t]*\r?\n))+)/g;
  let previousEnd = 0;
  let last: { text: string; separator: string } | null = null;
  const leading = text.match(/^\s*/)?.[0].length ?? 0;
  pattern.lastIndex = leading;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const raw = match[0];
    if (!raw.trim()) continue;
    if (last) last.separator = text.slice(previousEnd, match.index);
    last = { text: raw, separator: "" };
    blocks.push(last);
    previousEnd = match.index + raw.length;
  }
  return blocks;
}

/** Splits at paragraph breaks into chunks of about `maxWords`. A longer paragraph stays whole. */
export function chunkText(text: string, maxWords: number = LIMITS.chunkWords): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Chunk | null = null;
  for (const block of splitBlocks(text)) {
    const words = countWords(block.text);
    if (isLockedBlock(block.text)) {
      current = null;
      chunks.push({ kind: "locked", text: block.text, separator: block.separator, words });
      continue;
    }
    if (current && current.words + words <= maxWords) {
      current.text += current.separator + block.text;
      current.separator = block.separator;
      current.words += words;
    } else {
      current = { kind: "prose", text: block.text, separator: block.separator, words };
      chunks.push(current);
    }
  }
  return chunks;
}

export function joinChunks(pieces: { text: string; separator: string }[]): string {
  return pieces.map((piece) => piece.text + piece.separator).join("").trimEnd();
}
