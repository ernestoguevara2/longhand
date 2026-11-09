import { describe, expect, it } from "vitest";

import { countWords, splitParagraphs, splitSentences } from "@/lib/text/segment";

describe("splitSentences", () => {
  it("keeps offsets aligned with the original text", () => {
    const text = "First one here.  Second one here!\n\nThird paragraph starts. It continues.";
    for (const sentence of splitSentences(text)) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
    expect(splitSentences(text).map((s) => s.text)).toEqual([
      "First one here.",
      "Second one here!",
      "Third paragraph starts.",
      "It continues.",
    ]);
  });

  it("keeps offsets aligned with CRLF and Unicode", () => {
    const text = "Café crème is fine. Naïve? Yes.\r\n\r\nNext — paragraph 🎉 here. Done.";
    for (const sentence of splitSentences(text)) {
      expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
    }
    expect(splitSentences(text).at(-1)?.paragraph).toBe(1);
  });

  it("does not split after abbreviations, titles, or initials", () => {
    const sentences = splitSentences("Dr. Lee met J. Smith at the lab. They used e.g. saline. It worked.");
    expect(sentences.map((s) => s.text)).toEqual([
      "Dr. Lee met J. Smith at the lab.",
      "They used e.g. saline.",
      "It worked.",
    ]);
  });

  it("does not split decimals", () => {
    expect(splitSentences("The rate rose to 3.5 percent in 2020. It fell later.")).toHaveLength(2);
  });

  it("handles empty text", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   \n\n  ")).toEqual([]);
  });
});

describe("splitParagraphs", () => {
  it("splits on blank lines and keeps single line breaks together", () => {
    const paragraphs = splitParagraphs("One\nstill one\n\nTwo\n\n\nThree");
    expect(paragraphs.map((p) => p.text)).toEqual(["One\nstill one", "Two", "Three"]);
  });

  it("reports offsets into the original", () => {
    const text = "\n\nHello there.\r\n\r\nGeneral Kenobi.\n";
    for (const p of splitParagraphs(text)) expect(text.slice(p.start, p.end)).toBe(p.text);
  });
});

describe("countWords", () => {
  it("counts words, contractions, hyphenated words, and numbers once", () => {
    expect(countWords("It's a well-known fact: 3.5 percent!")).toBe(6);
  });
});
