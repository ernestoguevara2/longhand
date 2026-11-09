import { describe, expect, it } from "vitest";

import { chunkText, joinChunks } from "@/lib/text/chunk";
import { changedFraction, wordDiff } from "@/lib/text/diff";
import { findTokens, protect, restore } from "@/lib/text/protect";

describe("protect and restore", () => {
  it("round-trips text with code, links, citations, and quotes", () => {
    const text =
      'Use `npm test` as Lee said: "run it twice" (Lee, 2020). See https://a.co/b and [12] and “curly quote” here.';
    const { text: masked, spans } = protect(text);
    expect(masked).not.toContain("npm test");
    expect(masked).not.toContain("https://a.co");
    expect(masked).not.toContain("(Lee, 2020)");
    expect(masked).not.toContain("[12]");
    expect(masked).not.toContain("curly quote");
    expect(restore(masked, spans)).toBe(text);
    expect(findTokens(masked)).toHaveLength(spans.length);
  });

  it("protects ranges the user locked, and merges overlaps", () => {
    const text = "Keep this exact phrase and change the rest.";
    const start = text.indexOf("this exact");
    const { text: masked, spans } = protect(text, [
      { start, end: start + 10 },
      { start: start + 5, end: start + 17 },
    ]);
    expect(spans).toEqual([{ token: "⟦P1⟧", text: "this exact phrase" }]);
    expect(masked).toBe("Keep ⟦P1⟧ and change the rest.");
  });

  it("drops punctuation a model repeated right after a protected quote", () => {
    const spans = [
      { token: "⟦P1⟧", text: '"beat the market,"' },
      { token: "⟦P2⟧", text: '"be the market."' },
      { token: "⟦P3⟧", text: '"no period"' },
    ];
    expect(restore("Try to ⟦P1⟧, then ⟦P2⟧.", spans)).toBe('Try to "beat the market," then "be the market."');
    expect(restore("Say ⟦P3⟧.", spans)).toBe('Say "no period".');
    expect(restore("Keep ⟦P2⟧, please.", spans)).toBe('Keep "be the market.", please.');
  });

  it("leaves plain text alone", () => {
    expect(protect("Nothing special here.").spans).toEqual([]);
  });
});

describe("chunkText", () => {
  const paragraph = (n: number, words = 200) =>
    Array.from({ length: words }, (_, i) => `p${n}w${i}`).join(" ");

  it("groups paragraphs up to the limit and splits between them", () => {
    const text = [paragraph(1), paragraph(2), paragraph(3)].join("\n\n");
    const chunks = chunkText(text, 450);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].words).toBe(400);
    expect(chunks[0].text).toContain("\n\n");
  });

  it("reproduces the document when joined", () => {
    const text = `${paragraph(1, 5)}\n\n\n${paragraph(2, 5)}\r\n\r\n## A heading\n\n${paragraph(3, 5)}\n\n\`\`\`\ncode\n\nmore code\n\`\`\`\n\nlast`;
    expect(joinChunks(chunkText(text))).toBe(text);
  });

  it("locks headings, code, and tables", () => {
    const chunks = chunkText("## Title\n\nSome prose here.\n\n```\nlet a;\n\nlet b;\n```\n\n| a | b |\n| 1 | 2 |\n\nMore prose.");
    expect(chunks.map((c) => c.kind)).toEqual(["locked", "prose", "locked", "locked", "prose"]);
  });

  it("keeps an oversized paragraph whole", () => {
    expect(chunkText(paragraph(1, 900), 450)).toHaveLength(1);
  });

  it("handles empty input", () => {
    expect(chunkText("")).toEqual([]);
    expect(joinChunks([])).toBe("");
  });
});

describe("diff helpers", () => {
  it("measures how many words changed", () => {
    expect(changedFraction("one two three four", "one two three four")).toBe(0);
    expect(changedFraction("one two three four", "five six seven eight")).toBe(1);
    expect(changedFraction("one two three four", "one two five six")).toBe(0.5);
    expect(changedFraction("", "")).toBe(0);
  });

  it("produces parts that rebuild both sides", () => {
    const parts = wordDiff("the quick fox", "the slow fox");
    expect(parts.filter((p) => p.kind !== "added").map((p) => p.text).join("")).toBe("the quick fox");
    expect(parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("")).toBe("the slow fox");
  });
});
