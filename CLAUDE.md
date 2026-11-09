# Longhand

An editor that scans writing for signs of AI, explains each mark, and rewrites while protecting facts. Decisions and evidence: `SPEC.md`, `RESEARCH.md`. Measured results: `docs/EVALUATION.md`. Next.js rules: `AGENTS.md`.

## Commands

`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`.

Before calling work done, all of these pass: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`.

- `pnpm test:e2e` reuses anything already listening on port 3100, so stop a stale `pnpm start` first or you test old code.
- `pnpm fit:calibration`, then `pnpm eval:detector`: refit and re-measure the detector. Needs `research/data/` (ignored by git; see `research/README.md`).
- `pnpm eval:humanizer`: needs Ollama, takes hours, and resumes from `research/humanizer-eval.json`. Delete that file after changing prompts or the pipeline.

## Where things live

- `lib/detect/`: scanning. `index.ts` is the entry point. Pure and client-safe, except `external/`.
- `lib/humanize/pipeline.ts`: one chunk's passes, runs on the server, in the browser, and in scripts through an injected `Generate`.
- `lib/humanize/client.ts`: splits a document into chunks and picks the transport.
- `lib/humanize/gates.ts`: deterministic fact checks.
- `app/api/`: stateless routes. `workers/`: the classifier's Web Worker.

## Rules that protect the product

- **Privacy.** Scans stay in the browser. Ollama is called from the browser, never through the server. Routes log no text or keys, send `no-store`, and return fixed error messages (`lib/llm/errors.ts`), because provider errors can echo keys or text. `tests/integration/routes.test.ts` enforces this.
- **Server trust.** Routes build prompts themselves and accept no base URL or raw prompt, so a deployment with a server key stays a closed service.
- **Faithfulness outranks detector scores.** `rankCandidates` sorts by gate violations first. Keep it that way, and show every failure in the review list.
- **Rewrites improve writing.** Synonym swapping, typo injection, invisible characters, homoglyphs, and detector-guided decoding stay out, and product copy makes no "undetectable" or "bypass" claim.
- **Honest numbers.** The score is a calibrated signal, with "Likely AI" fixed at 70. Publish evaluation results whatever they show, and judge the humanizer with TMR, which the pipeline never sees.

## Calibration

A feature joins `calibration.json` only if it raises validation AUROC without raising the TOEFL false-positive rate. Tune against train and validation; the test split is for reporting.

Excluded for a reason: `paragraphUniformity` (mostly learns dataset formatting, since human samples are single-paragraph) and raw type-token ratio (falls with length). Grammar and formality stay unscored because they penalize non-native and academic writers.

## Gotchas

- Classifier: call the tokenizer with `truncation` and `max_length` directly. The Transformers.js pipeline ignores `max_length` on some models and crashes on long text.
- Editor highlights rely on `.reading-text` giving the textarea and its layer identical metrics. Change them together.
- Models often return the draft from an audit or repair pass, so the pipeline compares results before accepting them. Mocks hide this kind of failure; run real Ollama after changing prompts.
- A model cannot see punctuation inside a `⟦P1⟧` token and may repeat it after the token. `restore` handles that.
- `postinstall` copies the ONNX Runtime files to `public/ort/`. A "no available backend" error means that copy did not run or is missing a variant.
- Update `lib/detect/data/ai-vocabulary.json` as models change. Each era's words go stale.
- A route with no request access is prerendered. `/api/config` reads the request to stay dynamic.
- The GPTZero adapter follows third-party descriptions and has never run against the real API. Sapling and Pangram follow their docs but are also untested without keys.
