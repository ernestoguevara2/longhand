/// <reference lib="webworker" />
import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";

import { CLASSIFIER } from "@/lib/detect/classifier-config";
import type { WorkerRequest, WorkerResponse } from "@/lib/detect/worker-protocol";

env.allowLocalModels = false;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = "/ort/";

let ready: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | null = null;

const post = (message: WorkerResponse) => self.postMessage(message);

function load() {
  ready ??= (async () => {
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress" && p.file?.endsWith(".onnx")) {
        post({ type: "progress", loaded: p.loaded ?? 0, total: p.total ?? 0 });
      }
    };
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(CLASSIFIER.id, { revision: CLASSIFIER.revision }),
      AutoModelForSequenceClassification.from_pretrained(CLASSIFIER.id, {
        revision: CLASSIFIER.revision,
        dtype: CLASSIFIER.dtype,
        device: "wasm",
        progress_callback,
      }),
    ]);
    return { tokenizer, model };
  })();
  return ready;
}

/** Calls the tokenizer directly: the pipeline helper ignores max_length for some models. */
async function scoreOne(text: string): Promise<number> {
  const { tokenizer, model } = await load();
  const inputs = tokenizer(text, { truncation: true, max_length: CLASSIFIER.maxTokens });
  const { logits } = await model(inputs);
  const [human, ai] = Array.from(logits.data as Float32Array, Number);
  return Math.exp(ai) / (Math.exp(human) + Math.exp(ai));
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  try {
    if (message.type === "load") {
      await load();
      post({ type: "loaded", threads: env.backends.onnx.wasm?.numThreads ?? 1 });
      return;
    }
    const scores: number[] = [];
    for (let i = 0; i < message.windows.length; i++) {
      scores.push(await scoreOne(message.windows[i]));
      post({ type: "scoring", id: message.id, done: i + 1, total: message.windows.length });
    }
    post({ type: "scores", id: message.id, scores });
  } catch (error) {
    ready = null;
    const text = error instanceof Error ? error.message : String(error);
    post({ type: "error", id: message.type === "score" ? message.id : undefined, message: text });
  }
};
