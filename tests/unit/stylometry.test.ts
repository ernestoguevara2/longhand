import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { cleanForClassifier } from "@/lib/detect/clean";
import { deepScan, quickScan } from "@/lib/detect";
import { logit, pooledClassifierScore, sigmoid } from "@/lib/detect/fusion";
import { findDashes, findFragmentRows, findRepeatedOpenings, rhythmUniformity } from "@/lib/detect/rhythm";
import { analyzeStyle } from "@/lib/detect/stylometry";
import { findVocabularyTells } from "@/lib/detect/vocabulary";
import { looksAcademic, looksEnglish } from "@/lib/detect/warnings";
import { documentWindows, sentenceWindows, spreadWindowScores } from "@/lib/detect/windows";
import { splitSentences } from "@/lib/text/segment";

const AI_TEXT =
  "In today's rapidly evolving landscape, public libraries play a crucial role in fostering community. It's not just a building, it's a vibrant hub. Moreover, they serve as a testament to civic values, highlighting the importance of access. At its core, a library is a pivotal investment in people. Additionally, they enhance digital literacy, showcasing how institutions adapt. The future looks bright for these institutions, and that matters. Experts believe the trend will continue, underscoring the need for funding across every town and city in the country.";

const HUMAN_TEXT =
  "Our library closes at six on weekdays, which is annoying if you work until five thirty and live across town. I went twice last month. The first time I got there with ten minutes to spare and the guy at the desk let me stay a bit longer because he was reshelving anyway. The second time I gave up and read the book on my phone, even though I hate doing that. Mostly I just want them to stay open one night a week. Would that really cost so much? I have no idea what the budget looks like.";

describe("vocabulary", () => {
  const find = (text: string) => findVocabularyTells(text, text).map((t) => t.text.toLowerCase());

  it("finds listed words and context-dependent phrases", () => {
    expect(find("A pivotal and intricate plan in the evolving landscape.")).toEqual([
      "pivotal",
      "intricate",
      "evolving landscape",
    ]);
  });

  it("leaves literal senses alone", () => {
    expect(find("The landscape painter used an underscore_in a filename.")).toEqual([]);
    expect(find("She said key words to open the key lock.")).toEqual([]);
  });

  it("skips capitalized names mid-sentence but counts sentence openers", () => {
    expect(find("We hired Vibrant Media last year.")).toEqual([]);
    expect(find("Vibrant colors filled the room.")).toEqual(["vibrant"]);
  });
});

describe("rhythm", () => {
  it("scores even sentences higher than uneven ones", () => {
    const even = splitSentences("One two three four five six. One two three four five six. One two three four five six. One two three four five six.");
    const uneven = splitSentences("One. One two three four five six seven eight nine ten eleven twelve thirteen. Two words. One two three four five six seven eight nine.");
    expect(rhythmUniformity(even)).toBeGreaterThan(rhythmUniformity(uneven));
    expect(rhythmUniformity(even)).toBeCloseTo(1);
  });

  it("does not guess from too few sentences", () => {
    expect(rhythmUniformity(splitSentences("One two. Three four."))).toBe(0);
  });

  it("finds runs of repeated openings but not common words or pairs", () => {
    expect(findRepeatedOpenings(splitSentences("She came in. She sat down. She left."))).toHaveLength(3);
    expect(findRepeatedOpenings(splitSentences("She came in. She sat down. He left."))).toHaveLength(0);
    expect(findRepeatedOpenings(splitSentences("The cat sat. The dog ran. The bird flew."))).toHaveLength(0);
  });

  it("finds rows of fragments", () => {
    expect(findFragmentRows(splitSentences("It ran well. No prior. No nostalgia. No taste. Then it stopped running for good."))).toHaveLength(1);
    expect(findFragmentRows(splitSentences("Yes. Then it stopped running for good, which surprised us."))).toHaveLength(0);
  });

  it("counts connecting dashes but not number ranges", () => {
    expect(findDashes("A plan — a good one — worked.")).toHaveLength(2);
    expect(findDashes("From 2010–2020 and well-known.")).toHaveLength(0);
  });
});

describe("analyzeStyle", () => {
  it("finds more tells in chatbot-style text than in casual human text", () => {
    const ai = analyzeStyle(AI_TEXT).features;
    const human = analyzeStyle(HUMAN_TEXT).features;
    expect(ai.strongTellsPer100).toBeGreaterThan(human.strongTellsPer100);
    expect(ai.vocabularyPer100).toBeGreaterThan(human.vocabularyPer100);
    expect(human.strongTellsPer100).toBe(0);
  });

  it("handles empty input", () => {
    expect(analyzeStyle("").words).toBe(0);
    expect(analyzeStyle("").tells).toEqual([]);
  });

  it("runs in under 100 ms on 2,000 words", () => {
    const long = Array.from({ length: 2000 / HUMAN_TEXT.split(" ").length + 1 }, () => AI_TEXT).join("\n\n");
    const started = performance.now();
    analyzeStyle(long);
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("windows", () => {
  const text = Array.from({ length: 200 }, (_, i) => `This is sentence number ${i} in the text.`).join(" ");
  const sentences = splitSentences(text);

  it("covers the document in windows that fit the classifier", () => {
    const windows = documentWindows(text, sentences);
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.join(" ")).toBe(text);
    for (const window of windows) expect(window.split(" ").length).toBeLessThanOrEqual(420);
  });

  it("gives every sentence at least one window", () => {
    const windows = sentenceWindows(text, sentences);
    const scores = spreadWindowScores(windows, windows.map(() => 0.5), sentences.length);
    expect(scores.every((s) => s === 0.5)).toBe(true);
  });

  it("thins windows on very long documents without leaving gaps", () => {
    const longText = Array.from({ length: 900 }, (_, i) => `Sentence ${i} is right here.`).join(" ");
    const longSentences = splitSentences(longText);
    const windows = sentenceWindows(longText, longSentences);
    expect(windows.length).toBeLessThanOrEqual(310);
    expect(windows.at(-1)?.last).toBe(longSentences.length - 1);
  });
});

describe("cleanForClassifier", () => {
  it("removes markdown, code, and links but keeps prose", () => {
    const cleaned = cleanForClassifier("## Title\n\n**Bold** text with [a link](http://x.co).\n\n```\ncode\n```\n- item");
    expect(cleaned).toBe("Title Bold text with a link. item");
  });
});

describe("warnings", () => {
  it("recognizes English and other languages", () => {
    expect(looksEnglish(HUMAN_TEXT)).toBe(true);
    expect(looksEnglish("La biblioteca cierra a las seis de la tarde y eso es molesto para quienes trabajan hasta tarde en el centro.")).toBe(false);
    expect(looksEnglish("図書館は平日の六時に閉まるので、仕事の後に行くのはとても難しいです。本当に困っています。")).toBe(false);
  });

  it("recognizes academic writing", () => {
    expect(looksAcademic("Abstract: In this paper we propose a method. Results show gains over the baseline.")).toBe(true);
    expect(looksAcademic(HUMAN_TEXT)).toBe(false);
  });
});

describe("fusion helpers", () => {
  it("logit and sigmoid are inverses, and extreme values stay finite", () => {
    expect(sigmoid(logit(0.73))).toBeCloseTo(0.73);
    expect(Number.isFinite(logit(0))).toBe(true);
    expect(Number.isFinite(logit(1))).toBe(true);
  });

  it("pools window scores without one window dominating", () => {
    expect(pooledClassifierScore([0.9, 0.9])).toBeCloseTo(0.9);
    expect(pooledClassifierScore([0.99, 0.01])).toBeCloseTo(0.5);
    expect(pooledClassifierScore([])).toBe(0);
  });
});

describe("scans", () => {
  it("gives no verdict on very short text", () => {
    const result = quickScan("Regular exercise plays a crucial role in health.");
    expect(result.band).toBe("not-enough-text");
    expect(result.score).toBeNull();
    expect(result.warnings.map((w) => w.id)).toContain("too-short");
    expect(result.sentences[0].signal).toBe("strong");
  });

  it("shows no percentage for non-English text", () => {
    const text = "La biblioteca del pueblo cierra a las seis de la tarde todos los días de la semana, y eso es molesto para quienes trabajan hasta tarde en el centro de la ciudad. Muchos vecinos han pedido que abra una noche más, pero el ayuntamiento dice que no hay dinero para pagar al personal durante esas horas extra en el presupuesto.";
    const result = quickScan(text);
    expect(result.score).toBeNull();
    expect(result.warnings.map((w) => w.id)).toContain("not-english");
  });

  it("explains flagged sentences", () => {
    const result = quickScan(AI_TEXT);
    const flagged = result.sentences.filter((s) => s.signal !== "none");
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((s) => s.tells.length > 0)).toBe(true);
    expect(result.flaggedShare).toBeGreaterThan(0.5);
  });

  it("deep scan sends cleaned windows to the classifier and uses its scores", async () => {
    const seen: string[][] = [];
    const result = await deepScan(AI_TEXT, async (windows) => {
      seen.push(windows);
      return windows.map(() => 0.99);
    });
    expect(result.mode).toBe("deep");
    expect(result.classifierScore).toBeCloseTo(0.99);
    expect(result.score).not.toBeNull();
    expect(seen[0].every((w) => !w.includes("\n"))).toBe(true);
    expect(result.sentences.every((s) => s.windowScore !== undefined)).toBe(true);
  });

  it("deep scan does not call the classifier on text too short for a verdict", async () => {
    let calls = 0;
    const result = await deepScan("Too short to judge.", async (windows) => {
      calls++;
      return windows.map(() => 1);
    });
    expect(calls).toBe(0);
    expect(result.score).toBeNull();
  });
});
