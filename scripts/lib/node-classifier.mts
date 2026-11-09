/** Runs a two-class ONNX detector under Node, for calibration and evaluation only. */
import { AutoModelForSequenceClassification, AutoTokenizer } from "@huggingface/transformers";

export type NodeClassifier = (text: string) => Promise<number>;

export async function loadNodeClassifier(id: string, revision: string, dtype = "q8"): Promise<NodeClassifier> {
  const tokenizer = await AutoTokenizer.from_pretrained(id, { revision });
  const model = await AutoModelForSequenceClassification.from_pretrained(id, {
    revision,
    dtype: dtype as "q8",
  });
  return async (text: string) => {
    const inputs = tokenizer(text, { truncation: true, max_length: 512 });
    const { logits } = await model(inputs);
    const [human, ai] = Array.from(logits.data as Float32Array, Number);
    return Math.exp(ai) / (Math.exp(human) + Math.exp(ai));
  };
}

export const JUDGE = {
  id: "onnx-community/tmr-ai-text-detector-ONNX",
  revision: "b9aa251e5bcda7e429fcc936767d921435945b60",
};
