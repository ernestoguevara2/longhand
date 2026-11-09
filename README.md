# Longhand

Longhand scans writing for signs of AI, shows why each sentence was flagged, and rewrites it at the intensity you choose while checking that the facts survive.

It is an editor for your own drafts. A score is an estimate and never proof of who wrote something, and no rewrite is guaranteed to pass any detector. Follow the rules of your school, employer or publisher on AI assistance.

## What it does

- **Marks as you type.** Highlights name the pattern behind each one, such as "not X but Y", with an explanation in the margin.
- **Deep scan in your browser.** A classifier runs on your device and combines with the patterns into a calibrated score. Your text stays on the device.
- **Warns when scores are unreliable.** Short text, academic writing and other languages each get a visible warning.
- **Three rewrite levels.** Light copy-edits, Medium rewrites sentences, and Aggressive re-voices each paragraph.
- **Fact checks.** Numbers, names, quotations, links and layout are compared with your draft. A failure gets one targeted retry, then stays visible for you to review.
- **Sentence-level control.** Pick from other wordings for any flagged sentence, edit directly, or lock text so it stays exact.
- **Before and after.** Scores side by side, plus side-by-side and inline views of what changed.
- **Your choice of model.** Ollama, Anthropic, OpenAI, Groq or Gemini.
- **Nothing stored on a server.** No accounts or analytics. History stays in your browser, and you can turn it off.

## How accurate is it?

See [docs/EVALUATION.md](docs/EVALUATION.md) for full results and [the method](SPEC.md#9-testing-and-evaluation).

## Quick start

You need Node 22 or newer and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 and press **Try a sample draft**. Marks and the quick read need no setup.

To rewrite, you need a model:

| Option | Setup |
|---|---|
| **Ollama** (text stays on your computer) | [Install Ollama](https://ollama.com), run `ollama pull gemma4:e4b` or any chat model, and choose it in **Settings** |
| **Cloud provider** | Paste an API key in **Settings**, then choose a model. Your text goes to that provider |

The first deep scan asks before downloading a 125 MB model, which your browser then caches.

## Configuration

Everything is optional. See [.env.example](.env.example).

| Variable | Purpose |
|---|---|
| `LONGHAND_ALLOW_SERVER_KEYS` | Set to `true` to let the deployment's own keys serve its visitors |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` | Read only when the setting above is `true` |

**API keys in the browser.** Keys stay in memory unless you turn on **Remember API keys**, which stores them unencrypted in that browser. They travel in a header with each request, and the server neither logs nor stores them.

**Second opinions.** Add a Sapling, Pangram or GPTZero key in Settings to compare with a commercial detector. That sends your text to the service you pick. These adapters have not been run against the live services, and the GPTZero one is based on third-party descriptions of its API.

## Optional: fine-tuned local models

The research suggests prompt-based rewriting may do little against strong commercial detectors, while models fine-tuned on human originals report better results. These models are large, and Longhand's support for them has **not been tested yet**.

**[humanizer 12B](https://huggingface.co/jialinyyzz/humanizer)** (Apache-2.0). Download a GGUF from [its repo](https://huggingface.co/jialinyyzz/humanizer-GGUF). The smallest is 3.9 GB. Then create it in Ollama as `humanizer`, using the `Modelfile` from [its Ollama instructions](https://huggingface.co/jialinyyzz/humanizer#ollama), because Ollama's default Gemma template breaks this model:

```bash
ollama create humanizer -f Modelfile
```

**[Smaug-Humanizer](https://huggingface.co/abacusai/Smaug-Humanizer)** (Apache-2.0). Q4_K_M is 7.4 GB:

```bash
ollama pull hf.co/abacusai/Smaug-Humanizer-GGUF:Q4_K_M
```

In **Settings**, choose the model, then set **Rewriting method** to match. These models take one fixed prompt, so only Aggressive is available.

## Deploy

Longhand is a standard Next.js app and needs no database.

```bash
pnpm build
pnpm start
```

On Vercel, import the repo and deploy. No environment variables are needed, because visitors bring their own keys.

- **Ollama on a hosted copy.** The browser calls each visitor's own Ollama, which must allow your site: `OLLAMA_ORIGINS=https://your-site.example ollama serve`. A remote Ollama address also needs adding to `connect-src` in `next.config.ts`.
- **Server keys on a public site.** Leave them off unless you add authentication and rate limiting, because visitors would spend your money.

## Development

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

Run `pnpm exec playwright install chromium` once before the browser tests. [CLAUDE.md](CLAUDE.md) covers conventions and gotchas, [SPEC.md](SPEC.md) the design, and [RESEARCH.md](RESEARCH.md) the evidence behind it.

To re-measure, rebuild the data as described in [research/README.md](research/README.md), then:

```bash
pnpm fit:calibration   # refit the score
pnpm eval:detector     # held-out detector results
pnpm eval:humanizer    # needs Ollama; takes hours; resumes if stopped
```

## Credits

- Writing patterns adapted from [blader/humanizer](https://github.com/blader/humanizer) (MIT) and Wikipedia's [Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
- Classifier: [Fakespot RoBERTa](https://huggingface.co/fakespot-ai/roberta-base-ai-text-detection-v1) (Apache-2.0), [browser build by hbhanushali](https://huggingface.co/hbhanushali/fakespot-ai-detector-onnx)
- Evaluation judge: [TMR RoBERTa](https://huggingface.co/onnx-community/tmr-ai-text-detector-ONNX) (MIT)
- Test data from [Liang et al.](https://github.com/Weixin-Liang/ChatGPT-Detector-Bias), [RAID](https://github.com/liamdugan/raid) and [HC3](https://huggingface.co/datasets/Hello-SimpleAI/HC3)

## License

[MIT](LICENSE)
