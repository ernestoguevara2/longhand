# Research data and spikes

`bakeoff/` holds the throwaway comparison behind `RESEARCH.md` §1.5 and §1.6, with its raw results.

`data/` is ignored by git, because the upstream sets have mixed or undeclared licenses. To rebuild it:

| File | Source | Command |
|---|---|---|
| `liang.json` | [Liang et al.](https://github.com/Weixin-Liang/ChatGPT-Detector-Bias) | `node research/bakeoff/fetch-liang.mjs`, then copy `research/bakeoff/data/liang.json` here. It has every bucket, including TOEFL and US 8th-grade essays. |
| `raid-clean.json` | [RAID](https://github.com/liamdugan/raid) | `pnpm tsx scripts/fetch-raid.mts` |
| `raid.json` | RAID paraphrased rows and [HC3](https://huggingface.co/datasets/Hello-SimpleAI/HC3) human answers | Sampled once during research through the Hugging Face dataset viewer |
| `fresh.json` | Local Ollama models | `pnpm tsx scripts/generate-samples.mts` |

The Hugging Face dataset viewer failed often during this work. Only RAID's abstracts domain could be sampled for unattacked text, which limits how well that part of the data represents RAID.

Results are committed: `humanizer-eval.json`, `humanizer-summary.json`, and `detector-eval.json`.
