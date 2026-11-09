import type { TellGroup, TellMatch, TellTier } from "../types";

export type Pattern = {
  id: string;
  label: string;
  why: string;
  tier: TellTier;
  group: TellGroup;
  regex: RegExp;
};

const words = (list: string[]) => list.map((w) => w.replace(/ /g, "\\s+")).join("|");

/**
 * Phrase-level tells, adapted from blader/humanizer (MIT) and Wikipedia's "Signs of AI writing".
 * Strong tells justify attention on one sighting; weak ones only count in numbers.
 */
export const PATTERNS: Pattern[] = [
  // Staging instead of stating
  {
    id: "not-x-but-y",
    label: "Not X but Y",
    why: "Sets up a claim nobody made so the real point sounds bigger. State the point directly.",
    tier: "strong",
    group: "staging",
    regex:
      /\b(?:not\s+(?:just|only|merely|simply)\b[^.!?\n]{1,120}?\bbut\b|(?:it|this|that)(?:'s|’s|\s+is)\s+not\s+(?:just\s+|only\s+|merely\s+)?[^.!?\n,;]{1,70}[,;:—–]\s*(?:it|this|that)(?:'s|’s|\s+is)\b|(?:isn't|isn’t)\s+(?:just\s+|only\s+|merely\s+)?[^.!?\n,;]{1,70}[,;:—–]\s*(?:it|this|that)(?:'s|’s|\s+is)\b|(?:does|do)\s+not\s+mean\b[^.!?\n]{1,120}[.!?]\s+It\s+means\b|more\s+than\s+just\b)/gi,
  },
  {
    id: "closer",
    label: "Dramatic closer",
    why: "Asks the reader to pause on a claim instead of adding to it.",
    tier: "strong",
    group: "staging",
    regex: new RegExp(
      `\\b(?:${words(["that is the real win", "that's the real win", "that distinction matters", "read that again", "let that sink in", "the message was clear", "this shows the importance of", "and that makes all the difference", "that's the whole point", "and that matters"])})\\b`,
      "gi",
    ),
  },
  {
    id: "deep-saying",
    label: "Saying that sounds deep",
    why: "Dresses an ordinary point as a hidden truth. Replace it with the specific claim.",
    tier: "strong",
    group: "staging",
    regex: new RegExp(
      `\\b(?:${words(["the real question is", "at its core", "what really matters", "the heart of the matter", "the deeper issue", "the real story here", "in a world where"])})\\b`,
      "gi",
    ),
  },
  {
    id: "staged-opener",
    label: "Staged run-up",
    why: "Announces the point instead of making it.",
    tier: "strong",
    group: "staging",
    regex: new RegExp(
      `\\b(?:${words(["let's dive in", "let’s dive in", "let's explore", "let’s explore", "let's break this down", "let’s break this down", "let's break it down", "let’s break it down", "here's what you need to know", "here’s what you need to know", "without further ado", "here's the thing", "here’s the thing", "let's be honest", "let’s be honest", "real talk"])})\\b|(?<=^|[.!?]\\s)Honestly\\?`,
      "gi",
    ),
  },
  {
    id: "arguing-with-no-one",
    label: "Arguing with no one",
    why: "Answers an objection that appears nowhere else in the text.",
    tier: "weak",
    group: "staging",
    regex: new RegExp(
      `\\b(?:${words(["to be clear", "don't get me wrong", "don’t get me wrong", "this is not to say", "i'm not saying", "i’m not saying", "a tempting approach", "one might be tempted", "some might say", "you might think"])})\\b`,
      "gi",
    ),
  },

  // Rhythm by rule
  {
    id: "stacked-qualifiers",
    label: "Stacked qualifiers",
    why: "Piles up hedges until the claim says very little.",
    tier: "weak",
    group: "rhythm",
    regex: new RegExp(
      `\\b(?:${words(["could potentially", "might potentially", "may potentially", "might arguably", "could possibly", "it could be argued"])})\\b`,
      "gi",
    ),
  },

  // Inflation
  {
    id: "inflated-significance",
    label: "Inflated significance",
    why: "Says an ordinary detail marks a change or a legacy. Keep the fact and drop the weight.",
    tier: "strong",
    group: "inflation",
    regex: new RegExp(
      `\\b(?:${words(["stands as a testament", "a testament to", "pivotal moment", "crucial moment", "underscores its importance", "underscores the importance", "reflects a broader", "lasting legacy", "enduring legacy", "setting the stage for", "sets the stage for", "indelible mark", "the future looks bright", "exciting times ahead", "a step in the right direction", "continues to thrive", "game changer", "game-changer"])})\\b|\\bplays?\\s+(?:a|an)\\s+(?:key|crucial|vital|pivotal|significant|important|essential)\\s+role\\b|\\bmarking\\s+a\\s+(?:significant|pivotal|major|key|turning)\\b`,
      "gi",
    ),
  },
  {
    id: "ing-rider",
    label: "Shallow -ing ending",
    why: "Bolts an interpretation onto a simple fact to make it sound deeper.",
    tier: "strong",
    group: "inflation",
    regex:
      /,\s+(?:highlighting|underscoring|emphasizing|reflecting|symbolizing|contributing\s+to|cultivating|fostering|encompassing|showcasing|ensuring)\b/gi,
  },
  {
    id: "vague-association",
    label: "Vague connection",
    why: "Says two things are connected without saying how.",
    tier: "weak",
    group: "inflation",
    regex: /\b(?:in\s+association\s+with|in\s+connection\s+with)\b/gi,
  },
  {
    id: "sales-language",
    label: "Sales language",
    why: "Reads like an advertisement. Say what the thing is.",
    tier: "weak",
    group: "inflation",
    regex: new RegExp(
      `\\b(?:${words(["nestled", "in the heart of", "breathtaking", "must-visit", "stunning", "diverse array", "wide array", "renowned", "commitment to", "groundbreaking", "transformative", "unparalleled", "world-class", "cutting-edge", "seamless", "seamlessly"])})\\b|\\brich\\s+(?:cultural|history|heritage)\\b`,
      "gi",
    ),
  },
  {
    id: "borrowed-authority",
    label: "Borrowed authority",
    why: "An unnamed authority stands in for what was actually said.",
    tier: "weak",
    group: "inflation",
    regex: /\b(?:experts\s+(?:argue|believe|say|agree)|observers\s+have|industry\s+reports)\b/gi,
  },
  {
    id: "copula-avoidance",
    label: "Avoiding is or has",
    why: "Swaps a simple verb for a longer one. 'Is' and 'has' usually read better.",
    tier: "weak",
    group: "inflation",
    regex: /\b(?:serves?\s+as|stands?\s+as|functions?\s+as|boasts?\s+(?:a|an|over|more|the))\b/gi,
  },

  // Formatting by rule
  {
    id: "bold-label",
    label: "Bold label on a list item",
    why: "Templated bold-and-colon list items are a common chatbot format.",
    tier: "strong",
    group: "formatting",
    regex: /^[ \t]*(?:[-*•]|\d+\.)\s+\*\*[^*\n]{1,60}:?\*\*:?/gm,
  },
  {
    id: "markdown-heading",
    label: "Markdown left in the text",
    why: "Markdown syntax in finished prose often means it was pasted from a chatbot.",
    tier: "strong",
    group: "formatting",
    regex: /^#{1,4}\s+\S.*$/gm,
  },
  {
    id: "decorative-emoji",
    label: "Decorative emoji",
    why: "Emoji on headings or list items are a chatbot habit.",
    tier: "weak",
    group: "formatting",
    regex: /^[ \t]*(?:[-*•]\s+)?[\p{Extended_Pictographic}]️?\s/gmu,
  },

  // Leftovers from chat and drafting
  {
    id: "chatbot-residue",
    label: "Chatbot residue",
    why: "A greeting, offer or sign-off from a chat window was left in the text.",
    tier: "strong",
    group: "leftovers",
    regex: new RegExp(
      `\\b(?:${words(["i hope this helps", "great question", "you're absolutely right", "you’re absolutely right", "would you like me to", "let me know if you", "feel free to ask", "as an ai", "here is a revised", "here's a revised", "here’s a revised"])})\\b|^(?:Certainly|Of course|Sure|Absolutely)[!,]`,
      "gim",
    ),
  },
  {
    id: "knowledge-disclaimer",
    label: "Knowledge-limit disclaimer",
    why: "Mentions where a model's knowledge ends, or fills a gap with a guess.",
    tier: "strong",
    group: "leftovers",
    regex: new RegExp(
      `\\b(?:${words(["as of my last", "my last training", "my knowledge cutoff", "while specific details", "based on available information", "not extensively documented", "not widely documented", "maintains a low profile", "in readily available sources"])})\\b`,
      "gi",
    ),
  },
];

/** Blanks out quoted text and code so tells inside quotations are not counted, keeping offsets intact. */
export function maskIgnored(text: string): string {
  const blank = (match: string) => match.replace(/[^\r\n]/g, " ");
  return text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/`[^`\n]+`/g, blank)
    .replace(/https?:\/\/\S+/g, blank)
    .replace(/“[^”\n]{1,400}”/g, blank)
    .replace(/(^|[\s(\[])"[^"\n]{1,400}"/g, (match) => blank(match));
}

export function findPatternTells(text: string, masked = maskIgnored(text)): TellMatch[] {
  const matches: TellMatch[] = [];
  for (const pattern of PATTERNS) {
    for (const match of masked.matchAll(pattern.regex)) {
      matches.push({
        patternId: pattern.id,
        label: pattern.label,
        why: pattern.why,
        tier: pattern.tier,
        group: pattern.group,
        start: match.index,
        end: match.index + match[0].length,
        text: text.slice(match.index, match.index + match[0].length),
      });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}
