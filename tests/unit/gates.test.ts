import { describe, expect, it } from "vitest";

import { extractNames, extractNumbers, runGates } from "@/lib/humanize/gates";
import { cleanOutput } from "@/lib/humanize/pipeline";
import { rankCandidates } from "@/lib/humanize/rank";
import type { Candidate } from "@/lib/humanize/types";

const DRAFT =
  "The Riverside Clinic opened in 1998 with 12 beds. Dr. Amara Osei said \"we built this for the neighborhood\" at the ceremony. It now treats about 37% of local patients, and the remaining 37 complaints were resolved in March.\n\nSee https://example.org/report for details.";

const GOOD_REWRITE =
  "When the Riverside Clinic started in 1998, it had 12 beds. At the ceremony, Dr. Amara Osei told the crowd \"we built this for the neighborhood\". These days roughly 37% of local patients go there. The remaining 37 complaints were settled in March.\n\nThe full report is at https://example.org/report if you want the details.";

const gatesOf = (rewrite: string, draft = DRAFT, intensity: "light" | "medium" | "aggressive" = "medium") =>
  runGates(draft, rewrite, intensity).map((v) => v.gate);

describe("runGates", () => {
  it("passes a faithful rewrite", () => {
    expect(runGates(DRAFT, GOOD_REWRITE, "medium")).toEqual([]);
  });

  describe("seeded fact corruption is always caught", () => {
    const corruptions: [string, string, string][] = [
      ["changes a year", GOOD_REWRITE.replace("1998", "1989"), "numbers"],
      ["changes a count", GOOD_REWRITE.replace("12 beds", "21 beds"), "numbers"],
      ["drops a number", GOOD_REWRITE.replace(" it had 12 beds", " it was small"), "numbers"],
      ["adds a number", GOOD_REWRITE.replace("the crowd", "the 500 guests"), "numbers"],
      ["turns a count into a percent", GOOD_REWRITE.replace("remaining 37 complaints", "other 37% of complaints"), "numbers"],
      ["renames a person", GOOD_REWRITE.replace("Amara Osei", "Amara Owusu"), "names"],
      ["renames an organization", GOOD_REWRITE.replace("Riverside", "Lakeside"), "names"],
      ["alters a quotation", GOOD_REWRITE.replace("for the neighborhood", "for this neighborhood"), "quotes"],
      ["changes a link", GOOD_REWRITE.replace("example.org/report", "example.org/reports"), "quotes"],
      ["merges paragraphs", GOOD_REWRITE.replace("\n\n", " "), "layout"],
    ];
    it.each(corruptions)("%s", (_name, rewrite, gate) => {
      expect(gatesOf(rewrite)).toContain(gate);
    });
  });

  it("flags preambles, refusals, and leftover tags", () => {
    expect(gatesOf(`Here is the rewritten text:\n\n${GOOD_REWRITE}`)).toEqual(["residue"]);
    expect(gatesOf("I cannot help with that request.")).toEqual(["residue"]);
    expect(gatesOf(`<draft>${GOOD_REWRITE}</draft>`)).toContain("residue");
    expect(gatesOf("")).toEqual(["residue"]);
  });

  it("does not flag a draft that legitimately starts like a preamble", () => {
    const draft = "Sure enough, the river rose again that spring and flooded the lower fields near the mill.";
    const rewrite = "Sure enough, that spring the river came up again, and water covered the low fields by the mill.";
    expect(gatesOf(rewrite, draft, "medium")).not.toContain("residue");
  });

  it("enforces the length range for the intensity", () => {
    const short = "The Riverside Clinic had 12 beds in 1998.";
    expect(gatesOf(short)).toContain("length");
  });

  it("flags a rewrite that barely changed", () => {
    expect(gatesOf(DRAFT)).toContain("change");
  });

  it("flags a change of language", () => {
    const draft = "The town library closes at six on weekdays, which is hard for people who work late in the city.";
    const rewrite = "La biblioteca del pueblo cierra a las seis entre semana, y eso es difícil para quienes trabajan hasta tarde.";
    expect(gatesOf(rewrite, draft)).toContain("language");
  });

  it("requires protected tokens to survive", () => {
    const draft = "We cite ⟦P1⟧ and also the older study from the same lab, which found a similar effect in mice.";
    const rewrite = "We also point to an older study from that lab, where mice showed much the same effect as well.";
    expect(gatesOf(rewrite, draft)).toContain("protected");
  });

  it("flags repetition the draft did not have", () => {
    const loop = "the river rose again today ".repeat(6);
    expect(gatesOf(loop, "The river rose. It flooded the fields near the mill and the town below it for a week.")).toContain("degenerate");
  });
});

describe("extractNumbers", () => {
  it("keeps percent as part of the value and normalizes separators", () => {
    expect(extractNumbers("37 items, 37% of them, 1,200 total, 3.5 percent, in 2020.")).toEqual([
      "37",
      "37%",
      "1200",
      "3.5%",
      "2020",
    ]);
  });

  it("accepts a small number written as a word", () => {
    const draft = "They bought 3 boats last spring and sold them at the harbor by the end of the season.";
    const rewrite = "They picked up three boats in the spring, then sold them at the harbor once the season ended.";
    expect(runGates(draft, rewrite, "medium").map((v) => v.gate)).not.toContain("numbers");
  });
});

describe("extractNames", () => {
  it("finds names and acronyms but not ordinary sentence openers", () => {
    const names = extractNames("The team met Grace Hopper at NASA. Later they flew to Paris. Rain fell.");
    expect(names).toEqual(expect.arrayContaining(["Grace Hopper", "NASA", "Paris"]));
    expect(names).not.toContain("Rain");
    expect(names).not.toContain("Later");
  });
});

describe("cleanOutput", () => {
  it("strips fences and tags", () => {
    expect(cleanOutput("```\nHello there.\n```")).toBe("Hello there.");
    expect(cleanOutput("<rewrite>\nHello.\n</rewrite>")).toBe("Hello.");
  });
});

describe("rankCandidates", () => {
  const candidate = (text: string, violations: number, tellsPer100: number): Candidate => ({
    text,
    violations: Array.from({ length: violations }, () => ({ gate: "numbers", message: "x" })),
    changed: 0.5,
    tellsPer100,
    repaired: false,
  });

  it("never lets a low detector score beat faithfulness", () => {
    const ranked = rankCandidates([candidate("unfaithful", 1, 0), candidate("faithful", 0, 5)], [0.01, 0.99]);
    expect(ranked[0].text).toBe("faithful");
  });

  it("uses classifier scores, then tells, among equally faithful candidates", () => {
    expect(rankCandidates([candidate("a", 0, 1), candidate("b", 0, 1)], [0.9, 0.2])[0].text).toBe("b");
    expect(rankCandidates([candidate("a", 0, 3), candidate("b", 0, 1)])[0].text).toBe("b");
  });
});
