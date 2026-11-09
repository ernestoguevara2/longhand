# Longhand: product and technical spec

**Status: approved and built.** Evidence for the decisions here is in [RESEARCH.md](./RESEARCH.md), and measured results are in [docs/EVALUATION.md](./docs/EVALUATION.md).

### What changed during the build

| Spec said | Built | Why |
|---|---|---|
| Server calls Ollama in local mode | The browser always calls Ollama directly | One code path, no server-side URL at all, and local text never touches the server |
| Aggressive includes an LLM "mark tells" pass | The local scanner marks tells and passes them to the rewrite | Instant, deterministic, and one fewer slow model call |
| `POST /api/fact-check` | The fact judge runs inside `/api/humanize` | It only ever runs on a chunk's winning rewrite |
| Refine in a popover | Refine sits in the margin note for the sentence | Same place as the reason it was flagged, and it works with the keyboard |
| "Why" panel beside the score | Score in a band above the page | Leaves the margin free so notes line up with their sentences |
| Classifier could mark a sentence "strong" | Only named patterns earn the strongest mark | The classifier saturates on whole documents, which turned every sentence pink |
| Fine-tuned engines tested in M6 | Implemented but not run | Awaiting the decision on the multi-GB download |
| TypeScript 7 if tools accept it | TypeScript 5.9 | What `create-next-app` installs for Next.js 16 |
| Thresholds from a false-positive target | Two limits: 6% overall and 20% on TOEFL essays | So non-native writers do not carry the overall rate's errors |

## 1. Product

Longhand is a web app that scans text for signs of AI writing, explains what it found sentence by sentence, and rewrites it at a chosen intensity while protecting the facts.

**Who it is for:** writers, marketers and professionals editing their own AI-assisted drafts, and anyone checking whether their own writing might be wrongly flagged.

**What makes it different from StealthWriter:**

| | StealthWriter | Longhand |
|---|---|---|
| Why a sentence was flagged | Color-coded highlights | Color plus named reasons, such as "not X but Y contrast" |
| Where text goes | Its servers; it says text is not stored after processing | Scans stay on the device; rewrites go only to the model you pick, which can be local |
| Fact protection | Not described on its site | Gates and a fact check, with problems shown |
| Accuracy | No published method found | Published method and error rates, including where it fails |
| Limits | Daily quota | None beyond your own model or key |

**Product stance.** Longhand is presented as an editor. It makes no "undetectable" or "bypasses Turnitin" claims, because no evidence supports a guarantee. The interface and README state that a score is not proof of authorship, and that users should follow the rules of their school, employer or publisher.

**Non-goals for the MVP:** accounts, server-side storage, billing, team features, file upload (PDF/DOCX), non-English detection, and training our own models.

## 2. Architecture

```
 BROWSER                                                   SERVER (stateless)
┌───────────────────────────────────────────────┐        ┌──────────────────────┐
│ Workspace UI (React)                          │        │ POST /api/humanize   │
│   │                                           │ chunk  │  builds prompts      │
│   ├─ lib/detect/stylometry (sync, <100 ms) ◄──┤ + key  │  runs passes + gates │──► Anthropic, OpenAI
│   │                                           ├───────►│  streams NDJSON      │    Groq, Gemini
│   ├─ Web Worker: Fakespot RoBERTa (ONNX)      │        │                      │
│   │    downloaded once, then cached           │        │ POST /api/refine     │
│   │                                           │        │ POST /api/fact-check │
│   ├─ lib/detect/fusion  (calibrated score)    │        │ POST /api/detect/    │──► Sapling, Pangram
│   │                                           │        │      external        │    GPTZero
│   ├─ Candidate ranking, diff, refine          │        └──────────┬───────────┘
│   │                                           │                   │ local mode only
│   └─ localStorage: history, preferences       │                   ▼
│        (keys only if "remember" is chosen)    │              Ollama :11434
│                                               │                   ▲
│   lib/humanize/pipeline (same code as server) ├───────────────────┘
└───────────────────────────────────────────────┘   hosted mode: browser calls Ollama directly
```

**Key decisions**

- **Detection runs on the client.** Nothing leaves the device unless the user opts into an external detector.
- **The rewrite pipeline is isomorphic.** One `lib/humanize/pipeline.ts` takes an injected `generate()`. The server uses it for cloud providers; a hosted site uses it in the browser to reach the user's own Ollama.
- **The server builds prompts.** `/api/humanize` accepts a chunk and options and never takes raw prompts, so a deployment holding a server key is not an open LLM proxy.
- **No client-supplied base URLs on the server,** which prevents server-side request forgery. The Ollama URL comes from an environment variable and works only in local mode.
- **One chunk per request.** The client coordinates chunks, so a failure retries one chunk and partial results survive.
- **Server stores nothing.** Text and keys are never logged; responses use `Cache-Control: no-store`.

## 3. Tech stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js 16 App Router, React 19 | Requested; fits stateless route handlers |
| Language | TypeScript, strict | Latest 7.x if the tools accept it, otherwise latest 5.x (checked in M0) |
| UI | Tailwind 4, shadcn/ui, dark first | Requested |
| LLM | AI SDK 7 with `@ai-sdk/anthropic`, `openai`, `groq`, `google`, and `ollama-ai-provider-v2` | One interface across providers |
| In-browser ML | `@huggingface/transformers` 4 in a Web Worker | Keeps scans private and the page responsive |
| Validation | Zod 4 | Validates all route input and LLM JSON |
| Diff | `diff` | Word-level comparison |
| Tests | Vitest 5, Playwright | Unit, integration and browser |
| Package manager | pnpm | Requested; install with `npm i -g pnpm` |

**Default models.** Claude uses `claude-sonnet-5-5`. For other providers, the settings screen lists models from the provider's own endpoint and accepts free text, because third-party lists conflict. Defaults are confirmed against official docs during M4.

## 4. Detector

### 4.1 Signals

| Layer | Runs | Provides |
|---|---|---|
| **Tell patterns** | Instantly | Named, located matches per sentence; strong and weak tiers following blader's ordering |
| **AI vocabulary** | Instantly | Density from a versioned, era-tagged list; respects quotes and proper names |
| **Rhythm** | Instantly | Sentence-length variation, repeated openings, paragraph uniformity. Burstiness must pass the acceptance rule |
| **Classifier** | Web Worker | Fakespot RoBERTa probability on sliding windows, truncating via the tokenizer directly |
| **Perplexity** (experimental) | Web Worker | distilgpt2, included only if it passes the acceptance rule |
| **Second opinion** | Optional, with key | Sapling, Pangram or GPTZero, shown separately and never blended |

**Excluded on purpose:** grammar quality, formality, readability scores, isolated transition words, and raw type-token ratio.

**Feature acceptance rule.** A signal ships only if it improves held-out AUROC *and* does not raise the false-positive rate on TOEFL essays.

### 4.2 Scoring

- **Calibration data:** human text across domains, including TOEFL essays, college essays, 8th-grade essays and academic abstracts; AI text from several generators, including fresh 2026 output. Split with held-out domains and generators.
- **Fusion:** logistic regression over the classifier logit and accepted features. Coefficients ship as `calibration.json`, and the fitting script is committed.
- **Before the deep model loads,** the app shows a "Quick read" from the stylometric-only fit, clearly labelled as less reliable.
- **Thresholds** are set for a target false-positive rate on the human set, excluding known-unreliable registers, and the achieved numbers are published.
- **Verdict bands:** Likely human, Mixed or unclear, Likely AI, and Not enough text. A percentage appears beside the band with its confidence.

### 4.3 Sentence highlights

- Each sentence combines a 3-sentence classifier window, centered on it, with its own tell matches.
- Colors use three levels: none, some signal, strong signal. Hover or focus shows the reasons.
- Highlights use character offsets from the same segmenter as the rest of the app, so they stay accurate with CRLF and Unicode.
- Below 80 words, sentence highlights show tells only.
- The app also shows the share of the text in flagged sentences, so a half-AI document is not hidden by a middling overall score.

### 4.4 Reliability warnings

| Condition | What the user sees |
|---|---|
| Under 50 words | No verdict; tells only |
| 50 to 150 words | Verdict with "low confidence" |
| Looks academic or technical | "Detectors often misjudge this kind of writing, including human-written work" |
| Any text | A permanent note explains the known bias against non-native writers; the app never guesses who wrote the text |
| Not English | No percentage; "calibrated for English only" |
| Classifier and tells disagree | "Signals disagree" and a lower confidence |
| Mostly code, lists or tables | Those blocks are excluded and the user is told |

Every result links to a "How scores work" page with measured error rates.

## 5. Humanizer

### 5.1 Pipeline

```
input
  │  segment and protect (code, URLs, citations, quotes, user-locked spans)
  ▼
chunks of about 400 to 500 words, split at paragraph breaks
  │  for each chunk (concurrency: 2 cloud, 1 Ollama)
  ▼
passes by intensity ──► N candidates
  ▼
gates ──fail──► one targeted retry listing the violations ──fail──► keep best, mark flagged
  ▼
fact judge (optional)
  ▼
client ranks passing candidates (gates, then local detector signal)
  ▼
join chunks, restore protected text, re-scan, show before/after
```

### 5.2 Intensity levels

| | Light | Medium | Aggressive |
|---|---|---|---|
| **Job** | Copy-edit | Rewrite sentences; keep paragraph order | Re-voice; reorganize within paragraphs |
| **Removes** | Leftovers, strongest tells, AI vocabulary | Also triads, dashes, inflation, rhythm | All patterns, including paragraph-scale ones |
| **Passes** | Rewrite | Rewrite, audit | Mark tells, rewrite, audit |
| **Candidates per chunk** | 1 | 2 | 3 |
| **Temperature** | 0.5 | 0.8 | 1.0 |
| **Length gate** | 0.85 to 1.15 | 0.75 to 1.3 | 0.7 to 1.4 |
| **Words changed (target)** | 10 to 30% | 30 to 60% | Over 60% |

Candidate counts and word-change targets are starting values, tuned during evaluation.

### 5.3 Engines

**Prompt engine,** for any LLM. A system prompt adapted from blader's MIT-licensed patterns:
- Draft is wrapped in delimiters and treated as data, never instructions.
- Never add a fact, name, number, date, quote or citation.
- Leave watched words alone inside quotes, titles and names, and keep specific details and real asides.
- Optional voice sample overrides the style rules.
- Output is the text only, with any preamble stripped.

**Fine-tuned engine,** optional, through Ollama:

| | jialinyyzz/humanizer (recommended) | Smaug-Humanizer |
|---|---|---|
| Download | 3.9 to 12.7 GB | 7.4 to 12.7 GB |
| Sampling | temp 1.0, top-p 0.95, top-k 0, min-p 0, repeat 1.0 | temp 1.0, top-p 0.95, top-k 64 |
| Prompt | Byte-exact, verified with the published hash in a test | Fixed template from its card |
| Stop | EOS only; never `###` | `<end_of_turn>` |

These models take one fixed prompt, so Light and Medium are unavailable for them, with a tooltip explaining why. Intensity sets the sample count instead.

**Excluded by design:** synonym swapping, typo injection, invisible characters, homoglyphs, token-level detector guidance, and looping until a detector is satisfied.

### 5.4 Gates

All pure functions with unit tests, in the order they run:

| Gate | Fails when |
|---|---|
| Residue | Output has a preamble, refusal or leftover delimiters |
| Language and script | Language or alphabet changed |
| Protected spans | A placeholder is missing or altered |
| Numbers | A number, date, unit or percentage from the input is missing, or a new one appears |
| Names | A capitalized multi-word name or acronym is missing |
| Quotes and links | A quotation or URL changed |
| Layout | Paragraph count differs |
| Length | Outside the range for that intensity |
| Degenerate | Repeated n-grams or glued words |
| Change | Too little changed for the chosen intensity |

**Fact judge.** An LLM compares draft and rewrite and returns structured JSON listing changed, added and dropped claims. It is on by default for Medium and Aggressive with cloud models, and optional for local ones because of speed. It reports only; the user decides.

**Failure behavior.** The app never silently passes a known problem. Flagged items appear in a review panel, linked to their sentences.

### 5.5 Sentence refinement

Clicking a sentence in the result opens a popover with three alternatives written with its neighbors as context, each already gate-checked, plus inline editing and "keep original". Choosing one re-scores instantly with stylometry, then with the classifier after a short pause.

## 6. Screens

**Workspace (`/`), the single main page:**

```
┌─ Longhand ───────────────────── Your text goes to: this device ─ ⏱ History ⚙ ┐
│                                                                              │
│  ┌ Draft ────────────────────────┐  ┌ Rewrite ─────── [Side by side|Changes] ┐│
│  │ Studies indicate that regular │  │ Regular exercise helps memory. In one  ││
│  │ [exercise plays a crucial]    │  │ review, people who walked 150 minutes  ││
│  │ role in cognitive health...   │  │ a week ...                             ││
│  │                               │  │                                        ││
│  │ 412 / 5,000 words             │  │ ⧉ Copy   ⬇ .txt  ⬇ .md                  ││
│  └───────────────────────────────┘  └────────────────────────────────────────┘│
│                                                                              │
│  [ Scan ]   Light · Medium · Aggressive   [ Rewrite ]        Keep exact: select│
│                                                                              │
│  ┌ Before ───────┐ → ┌ After ────────┐  ┌ Why ───────────────────────────────┐│
│  │ 84  Likely AI │   │ 31  Mixed     │  │ 6 strong tells → 1                 ││
│  │ High confid.  │   │ Med. confid.  │  │ AI vocabulary 1.2 → 0.2 per 100    ││
│  └───────────────┘   └───────────────┘  │ 2 facts to review  ▸               ││
│  A score is not proof of authorship.    └────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Header privacy label** always names where text goes: "this device", "Anthropic", or "Ollama on this computer".
- **Phone layout** stacks everything, with tabs for Draft and Rewrite.
- **Settings drawer:** engine and model, keys, Ollama status with setup steps, voice sample, deep-scan download, external detectors, history on or off.
- **History drawer:** the last 20 runs, restore or delete, clear all.
- **`/how-it-works`:** methods, measured error rates, limits and responsible use.

**States covered:** empty (with sample text), first-time model download with progress and consent, scanning, streaming per chunk, partial failure with retry, Ollama offline, missing key, and reduced motion.

## 7. Limits and edge cases

| Area | Behavior |
|---|---|
| **Word limits** | Scan up to 20,000; rewrite up to 5,000 (matching StealthWriter's paid cap; configurable); refine one sentence up to 120 words |
| **Very short text** | Scan shows tells only; rewrite needs at least 20 words |
| **Long text** | Windows for scanning; chunks at paragraph breaks for rewriting |
| **Markdown, code, tables** | Structure preserved; code and tables locked |
| **Citations, quotes, URLs** | Locked by default |
| **Abbreviations, decimals, initials** | `Intl.Segmenter` plus an abbreviation guard, with fixture tests |
| **Non-English** | Rewriting allowed; detection shows no percentage; the language gate still runs |
| **Prompt injection in text** | Delimited as data; output checked by gates; a test fixture covers it |
| **Provider errors** | 401 prompts for the key; 429 backs off and retries; 5xx or timeout retries that chunk; partial results kept |
| **User cancels** | `AbortController` stops the requests; finished chunks stay |
| **Stale runs** | Results from an older run are ignored if the text changed |
| **No WebGPU or WASM trouble** | Falls back to WASM, then to Quick read with an explanation |
| **Model download fails** | Retry; scanning still works with Quick read |
| **Ollama blocked by CORS on a hosted site** | Shows the exact `OLLAMA_ORIGINS` command |
| **localStorage full or blocked** | Wrapped in try/catch; app keeps working without history |
| **Key handling** | In memory by default; "remember on this device" is opt-in with a warning |
| **Server keys on public deployments** | Off unless `LONGHAND_ALLOW_SERVER_KEYS=true`; the README warns about cost and abuse |

## 8. Privacy and security

- Scans never leave the device. The model download contacts Hugging Face but sends no user text.
- No analytics, cookies or server logging of request bodies.
- Strict Content-Security-Policy with an explicit `connect-src` list.
- Keys travel per request over HTTPS in a header, and are never stored or logged by the server.
- Zod limits on every route, including size. Rate limiting is noted for public deployments as a README recommendation, since no state is stored.
- **Documented limit:** cloud providers receive the text you send them, under their own terms. The header label makes this visible before you rewrite.

## 9. Testing and evaluation

### Automated tests

| Level | Covers |
|---|---|
| **Unit (Vitest)** | Segmenter and offsets; every tell pattern, with positive and negative fixtures; rhythm; fusion and calibration loading; each gate; protect and restore; chunking; prompt builders; fine-tuned prompt hash |
| **Integration (Vitest)** | Full pipeline using AI SDK's mock model: retries, gate failure, candidate choice, partial failure, cancellation; route handlers: validation, streaming, key handling, `no-store`, proof that keys and text are not logged |
| **Browser (Playwright)** | Paste, scan, rewrite, compare, refine, copy, download, history; mobile width; offline Ollama; mocked provider so the suite needs no keys |

### Evaluation scripts

Run with `pnpm eval:detector` and `pnpm eval:humanizer`. Results are published in `docs/EVALUATION.md`, whatever they show.

- **Detector:** held-out AUROC, false-positive rate per human group including TOEFL, and true-positive rate per generator. Compared against the raw classifier.
- **Humanizer:** at least 30 AI samples across genres and at least 2 generators, for each intensity and engine.
  - **Independent judge:** TMR scores results but plays no part in the pipeline. A commercial detector is added if a key is supplied.
  - **Also reported:** gate pass rate, fact-judge problems, words changed, and time per 100 words.
  - **Human check:** a reading of at least 10 before-and-after pairs for meaning and quality.

## 10. Success criteria

| # | Criterion | How checked |
|---|---|---|
| 1 | `pnpm dev` runs; detection and rewriting both work end to end | Manual run and Playwright |
| 2 | TypeScript clean, lint passes, build succeeds, tests pass | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` |
| 3 | Instant signals under 100 ms for 2,000 words | Unit benchmark |
| 4 | False-positive rate at the "Likely AI" threshold is at most 10% on human text overall, excluding abstracts | `eval:detector` |
| 5 | TOEFL false positives are lower than raw Fakespot's 70%, target at most 25% | `eval:detector` |
| 6 | Held-out AUROC at least 0.90 across AI groups | `eval:detector` |
| 7 | Gates catch 100% of seeded fact-corruption fixtures | Unit tests |
| 8 | At least 90% of Medium and Aggressive rewrites pass all gates within one retry | `eval:humanizer` |
| 9 | Judge score (TMR) falls for each engine on average, reported per intensity, whatever the size | `eval:humanizer` |
| 10 | Fine-tuned engine's reduction, if used, is measured against its published claim | `eval:humanizer` |
| 11 | No user text or keys in server logs or at rest on the server | Integration test and code review |
| 12 | Repo pushed publicly, with README, CLAUDE.md, SPEC, RESEARCH and EVALUATION | Link supplied |

**If criteria 4 to 6 cannot be met** after reasonable effort, I will report the achieved numbers rather than move the goalposts, and we decide together. Abstracts are excluded from criterion 4 because the bake-off showed almost no separation there; the app warns about them instead. Criterion 9 asks only for honest measurement, since the research suggests the prompt engine may do little against strong classifiers.

## 11. Files

```
longhand/
├─ README.md  CLAUDE.md  SPEC.md  RESEARCH.md  LICENSE (MIT)  .env.example
├─ package.json  tsconfig.json  next.config.ts  eslint.config.mjs  components.json
├─ vitest.config.ts  playwright.config.ts
├─ docs/
│  └─ EVALUATION.md
├─ research/bakeoff/                 # exists: spike scripts and raw results
├─ public/samples/                   # demo drafts we wrote ourselves
├─ app/
│  ├─ layout.tsx  page.tsx  globals.css
│  ├─ how-it-works/page.tsx
│  └─ api/
│     ├─ humanize/route.ts           # streams one chunk's passes as NDJSON
│     ├─ refine/route.ts             # three alternatives for one sentence
│     ├─ fact-check/route.ts
│     ├─ detect/external/route.ts    # Sapling, Pangram, GPTZero with user key
│     └─ models/route.ts             # lists a provider's models
├─ components/
│  ├─ workspace/  workspace.tsx  draft-editor.tsx  rewrite-panel.tsx
│  │              highlight-layer.tsx  diff-view.tsx  action-bar.tsx
│  │              score-card.tsx  signals-panel.tsx  fact-review.tsx
│  │              refine-popover.tsx  privacy-label.tsx
│  ├─ settings/   settings-drawer.tsx  provider-form.tsx  ollama-status.tsx
│  │              model-download.tsx
│  ├─ history/    history-drawer.tsx
│  └─ ui/                            # shadcn components
├─ hooks/         use-scan.ts  use-humanize.ts  use-refine.ts  use-settings.ts
│                 use-history.ts
├─ workers/       detector.worker.ts
├─ lib/
│  ├─ text/       segment.ts  protect.ts  chunk.ts  diff.ts  limits.ts
│  ├─ detect/
│  │  ├─ index.ts  types.ts
│  │  ├─ stylometry.ts  rhythm.ts  vocabulary.ts
│  │  ├─ patterns/    staging.ts  rhythm.ts  inflation.ts  formatting.ts
│  │  │               leftovers.ts  index.ts
│  │  ├─ data/        ai-vocabulary.json  calibration.json
│  │  ├─ fusion.ts  warnings.ts  worker-client.ts
│  │  └─ external/    sapling.ts  pangram.ts  gptzero.ts  index.ts
│  ├─ humanize/
│  │  ├─ pipeline.ts  types.ts  rank.ts  gates.ts  fact-judge.ts  refine.ts
│  │  └─ prompts/     system.ts  light.ts  medium.ts  aggressive.ts  audit.ts
│  │                  fine-tuned.ts
│  ├─ llm/            providers.ts  generate.ts  errors.ts
│  ├─ storage/        history.ts  settings.ts
│  └─ server/         security.ts  schemas.ts
├─ tests/
│  ├─ unit/           (mirrors lib/)
│  ├─ integration/    pipeline.test.ts  routes.test.ts
│  ├─ e2e/            workspace.spec.ts
│  └─ fixtures/       ai-drafts/  human-texts/  corrupted-facts/  injection/
└─ scripts/
   ├─ fit-calibration.ts
   ├─ eval-detector.ts
   └─ eval-humanizer.ts
```

## 12. Milestones

| # | Milestone | Done when |
|---|---|---|
| **M0** | Scaffold: Next.js, TypeScript, Tailwind, shadcn, Vitest, Playwright | Empty app passes typecheck, lint and build |
| **M1** | **Riskiest first:** Fakespot in a browser Web Worker under Next.js | Real scores in the browser; WASM and WebGPU timings recorded |
| **M2** | Detector core: segmenter, patterns, vocabulary, rhythm | Unit tests pass |
| **M3** | Calibration and fusion; `eval:detector`; decide on burstiness and perplexity | Criteria 3 to 6 reported |
| **M4** | Humanizer: gates, prompts, pipeline, routes, Ollama and cloud providers | Integration tests pass; a real rewrite through local Gemma |
| **M5** | UI: workspace, highlights, diff, refine, settings, history, states | Playwright passes; visual review at desktop and phone widths |
| **M6** | Fine-tuned engine (if approved) and `eval:humanizer` | `docs/EVALUATION.md` written with before-and-after examples |
| **M7** | Fix what evaluation finds; README and CLAUDE.md | All success criteria checked |
| **M8** | GitHub: create public repo and push | URL reported |

## 13. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| ONNX Runtime and Web Workers under Next.js bundling | Medium | Done first in M1. Fallback: load the runtime from public assets |
| WASM too slow on long documents | Medium | Cap windows and show progress; stylometry remains instant |
| Fusion fails to reduce false positives enough | Medium | Report it; raise the "Likely AI" threshold and strengthen warnings |
| Prompt engine barely moves the judge score | High | Report it honestly; offer the fine-tuned engine |
| Fine-tuned model slow on this iGPU or CPU | Medium | Use a smaller quantization; measure in M6 |
| Vocabulary and tells go stale | Certain over time | Versioned data file; documented update process |
| Detector or provider APIs change | Medium | Thin adapters behind tests; external detectors are optional |
| TypeScript 7 incompatibility | Low to medium | Check in M0; fall back to 5.x |
