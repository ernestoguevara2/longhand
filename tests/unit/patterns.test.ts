import { describe, expect, it } from "vitest";

import { findPatternTells, maskIgnored, PATTERNS } from "@/lib/detect/patterns";

const ids = (text: string) => findPatternTells(text).map((t) => t.patternId);

/** Every pattern must have text it catches and similar ordinary text it leaves alone. */
const CASES: Record<string, { hit: string[]; miss: string[] }> = {
  "not-x-but-y": {
    hit: [
      "It's not just a song, it's a statement.",
      "This is not merely a tool; it is a partner.",
      "Not only does it run fast but it also saves memory.",
      "This does not mean every choice is equal. It means no system confirms it.",
      "The library is more than just a building.",
    ],
    miss: ["The door was not open, so we left.", "She did not like the song but stayed anyway."],
  },
  closer: {
    hit: ["Let that sink in.", "That distinction matters.", "The message was clear: stop."],
    miss: ["The water was clear and cold.", "Sink the nail in with a hammer."],
  },
  "deep-saying": {
    hit: ["At its core, this is about trust.", "The real question is whether it scales."],
    miss: ["The core of the apple was brown.", "My question is about the invoice."],
  },
  "staged-opener": {
    hit: ["Let's dive in.", "Here's the thing about caching.", "Is it worth it? Honestly? It depends."],
    miss: ["We let the dog dive in the lake.", "He honestly forgot the keys."],
  },
  "arguing-with-no-one": {
    hit: ["To be clear, nothing changed.", "Don't get me wrong, it works."],
    miss: ["The water became clear to us.", "I got the answer wrong."],
  },
  "stacked-qualifiers": {
    hit: ["This could potentially help.", "It could be argued that it works."],
    miss: ["This could help.", "They may well come."],
  },
  "inflated-significance": {
    hit: [
      "It stands as a testament to her work.",
      "The founding marked a pivotal moment.",
      "Sleep plays a crucial role in memory.",
      "This reflects a broader shift.",
      "The future looks bright for the firm.",
    ],
    miss: ["He plays a small part in the film.", "The moment passed quickly.", "Sleep helps memory."],
  },
  "ing-rider": {
    hit: ["The city built a park, highlighting its commitment.", "Sales rose, reflecting demand."],
    miss: ["Highlighting the text is easy.", "She was reflecting on it."],
  },
  "vague-association": {
    hit: ["The concerts were held in connection with the fair."],
    miss: ["The wire has a loose connection."],
  },
  "sales-language": {
    hit: ["A town nestled in the hills.", "It has stunning views.", "Our seamless checkout."],
    miss: ["A town in the hills.", "The bird nested there.", "It has good views."],
  },
  "borrowed-authority": {
    hit: ["Experts believe it matters.", "Industry reports suggest growth."],
    miss: ["The experts' report is on page 3.", "Dr. Lee believes it matters."],
  },
  "copula-avoidance": {
    hit: ["The room serves as a gallery.", "The hotel boasts a pool."],
    miss: ["The waiter serves soup.", "He stands on the box.", "She boasts constantly."],
  },
  "bold-label": {
    hit: ["- **Performance:** It is fast.", "1. **Security:** Encrypted."],
    miss: ["- Performance is fast.", "**Note** this sentence."],
  },
  "markdown-heading": {
    hit: ["## Why libraries matter"],
    miss: ["Issue #12 is fixed.", "# "],
  },
  "decorative-emoji": {
    hit: ["🚀 Launch in Q3", "- 💡 Users prefer simplicity"],
    miss: ["We launched in Q3 🚀", "No emoji here."],
  },
  "chatbot-residue": {
    hit: ["I hope this helps!", "Certainly! Here is the text.", "Let me know if you want more.", "Great question!"],
    miss: ["She certainly knows.", "I hope this works out for them.", "The question was great."],
  },
  "knowledge-disclaimer": {
    hit: ["As of my last update, it was open.", "While specific details are limited, it opened in 1990."],
    miss: ["As of March, it was open.", "The details are on the site."],
  },
};

describe("tell patterns", () => {
  it("has a test case for every pattern", () => {
    expect(Object.keys(CASES).sort()).toEqual(PATTERNS.map((p) => p.id).sort());
  });

  for (const [id, { hit, miss }] of Object.entries(CASES)) {
    describe(id, () => {
      it.each(hit)("catches: %s", (text) => {
        expect(ids(text)).toContain(id);
      });
      it.each(miss)("leaves alone: %s", (text) => {
        expect(ids(text)).not.toContain(id);
      });
    });
  }

  it("ignores tells inside quotations", () => {
    expect(ids('He wrote, "this stands as a testament to courage," and left.')).toEqual([]);
    expect(ids("He wrote, “this stands as a testament to courage,” and left.")).toEqual([]);
  });

  it("ignores tells inside code", () => {
    expect(ids("Run `let's dive in` now.\n\n```\nat its core\n```")).toEqual([]);
  });

  it("reports offsets that match the original text", () => {
    const text = "Well. At its core, it works.";
    const [tell] = findPatternTells(text);
    expect(text.slice(tell.start, tell.end)).toBe("At its core");
    expect(tell.text).toBe("At its core");
  });

  it("masking keeps the text length", () => {
    const text = 'A "quoted bit" and `code` and https://x.co/y here.';
    expect(maskIgnored(text)).toHaveLength(text.length);
  });
});
