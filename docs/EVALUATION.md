# Evaluation

Measured on 2026-11-09 on a Windows laptop. All numbers come from files in `research/`, which the scripts in `scripts/` regenerate. The samples are small, so treat every percentage as a rough estimate.

## Detector

`pnpm eval:detector` scores 118 held-out samples that took no part in fitting. Source: [`research/detector-eval.json`](../research/detector-eval.json).

| Measure | Classifier alone | Longhand deep scan |
|---|---:|---:|
| AUROC | 0.969 | 0.983 |
| Human text marked AI, abstracts excluded | 35.5% (at 0.5) | 8.1% ("Likely AI") |
| AI text marked "Likely AI" | 100% (at 0.5) | 97.8% |
| AI text not marked "Likely human" | 100% | 100% |

The quick read, which uses only the patterns, reaches AUROC 0.934.

Human writing by group:

| Group | n | Classifier alone flags | Deep: Likely AI | Unclear | Likely human |
|---|---:|---:|---:|---:|---:|
| US 8th-grade essays | 22 | 4.5% | 0% | 0% | 100% |
| College essays | 13 | 38.5% | 0% | 15.4% | 84.6% |
| TOEFL essays (non-native writers) | 20 | 80% | 25% | 30% | 45% |
| CS224N abstracts | 11 | 100% | 54.5% | 36.4% | 9.1% |
| HC3 answers | 4 | 0% | 0% | 0% | 100% |
| RAID abstracts | 3 | 0% | 0% | 0% | 100% |

**What this means**

- Calibration cuts false accusations sharply, but one in four TOEFL essays is still marked "Likely AI". That is why the app warns that scores are an estimate.
- Academic abstracts are unreliable: over half of the human ones were marked "Likely AI". The app shows a warning when text looks academic.
- The thresholds were chosen on a separate validation split, but the test set was looked at more than once during development, so these figures are probably a little optimistic.

## Rewriter

`pnpm eval:humanizer` rewrites fresh drafts from two local models (Gemma 4 e4b and 26b) at each intensity, using Gemma 4 e4b, one candidate per part, and the fact check on Aggressive only. Source: [`research/humanizer-eval.json`](../research/humanizer-eval.json).

**Partial results.** The run was still going when this was written: 17 drafts at all three levels plus one extra Light and Medium, 53 rewrites in total. Run `pnpm eval:humanizer` to finish it; it resumes where it stopped and writes `research/humanizer-summary.json`.

The **judge** is TMR RoBERTa, a second classifier Longhand never uses to choose or tune anything, so it is the fairest measure here. The Fakespot and deep-scan columns are Longhand's own detector, which the rewriter does not optimise against either, but which shaped the prompts during development.

| Level | Rewrites | Judge mean, before → after | Judge flags (≥ 0.5) before → after | Deep "Likely AI" before → after | Words changed | Passed every check | Time per 100 words |
|---|---:|---:|---:|---:|---:|---:|---:|
| Light | 18 | 0.80 → 0.63 | 78% → 61% | 94% → 72% | 25% | 78% | 21 s |
| Medium | 18 | 0.80 → 0.60 | 78% → 61% | 94% → 78% | 41% | 78% | 37 s |
| Aggressive | 17 | 0.79 → 0.41 | 76% → 41% | 94% → 82% | 46% | 65% | 50 s |

Writing patterns fell at every level: strong patterns from about 1.0 to 0.5 per draft, and AI-vocabulary hits from about 1.1 to 0.1.

**What this means**

- Rewriting lowers AI signals, but unevenly. Of the drafts the judge flagged before, 71% (Light), 79% (Medium) and 54% (Aggressive) were still flagged after one rewrite.
- Longhand's own deep scan barely moves: most rewrites stay "Likely AI". A rewrite from a small local model still reads as model-written to a classifier trained on that style.
- Results swing a lot between drafts. The same draft can drop to 0.02 at one level and stay at 0.99 at another.
- Only 65–78% of rewrites passed every check, short of the 90% goal in the spec. Most failures were a changed or dropped name (11), then a lost protected quote (2). Those rewrites are shown to the user with the problem marked, never silently accepted.
- The fact judge flagged problems in 4 of 17 Aggressive rewrites.
- A larger cloud model, or the fine-tuned models in the README, may do better. Neither has been measured yet.

## Before and after

Three real rows from the run, chosen to show a clear success, a partial one and a failure. Opening paragraphs only; the full texts are in the JSON.

### Success: index funds explainer, Light (gemma4:26b draft, 328 words)

| | Judge | Fakespot | Longhand deep |
|---|---:|---:|---:|
| Before | 0.98 | 1.00 | 0.85, Likely AI |
| After | 0.02 | 0.48 | 0.18, Likely human |

29% of words changed; every check passed.

> **Before.** An index fund is a type of mutual fund or exchange-traded fund (ETF) designed to mimic the performance of a specific financial market benchmark, known as an index. Instead of employing a highly paid fund manager to hand-pick individual stocks in an attempt to "beat the market," an index fund uses a passive management strategy to simply "be the market."
>
> **After.** An index fund is a kind of mutual fund or exchange-traded fund (ETF) that is designed to copy the performance of a specific financial market benchmark, called an index. Instead of having a highly paid fund manager select individual stocks trying to "beat the market," an index fund uses a passive management method to simply "be the market."

### Partial: bicycle history, Medium (gemma4:e4b draft, 155 words)

| | Judge | Fakespot | Longhand deep |
|---|---:|---:|---:|
| Before | 0.93 | 1.00 | 0.99, Likely AI |
| After | 0.02 | 1.00 | 0.92, Likely AI |

41% of words changed; every check passed. The judge was satisfied, Longhand's own detector was not.

> **Before.** The first recognizable precursor was likely the *bicicleta* or "velocipede" in the 1810s. However, the breakthrough came with Karl Drais's "Laufmaschine" (running machine) in 1817—essentially a steerable wooden frame propelled by pushing feet along the ground.
>
> **After.** The *bicicleta*, or "velocipede", likely represents the first recognizable precursor, appearing in the 1810s. A major advancement came with Karl Drais's "Laufmaschine" (running machine) in 1817. This device was essentially a steerable wooden frame that people propelled by pushing their feet along the ground.

### Failure: restaurant review, Medium (gemma4:26b draft, 192 words)

| | Judge | Fakespot | Longhand deep |
|---|---:|---:|---:|
| Before | 0.99 | 1.00 | 0.96, Likely AI |
| After | 0.99 | 1.00 | 0.92, Likely AI |

39% of words changed and every check passed, yet no detector moved.

> **Before.** The menu is a love letter to traditional Italian comfort. While the antipasti are delightful, the real stars are the handmade pastas.
>
> **After.** The menu shows deep affection for traditional Italian comfort food. The antipasti are enjoyable, but the truly remarkable items are the handmade pastas.

## Not measured yet

- Cloud providers (Anthropic, OpenAI, Groq, Gemini) as the rewriting model.
- The fine-tuned humanizer 12B and Smaug-Humanizer models.
- Commercial detectors (Sapling, Pangram, GPTZero) as judges.
- Languages other than English.
