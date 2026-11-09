import { generateText, streamText, type LanguageModel } from "ai";

import type { Generate } from "@/lib/humanize/types";

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

/** Adapts an AI SDK model to the small interface the pipeline uses. */
export function makeGenerate(model: LanguageModel, buildOptions?: (r: { topK?: number }) => ProviderOptions): Generate {
  return async ({ instructions, prompt, temperature, topP, topK, stop, maxOutputTokens, signal, onDelta }) => {
    const shared = {
      model,
      instructions,
      prompt,
      temperature,
      topP,
      topK: buildOptions ? undefined : topK,
      stopSequences: stop,
      maxOutputTokens,
      abortSignal: signal,
      maxRetries: 2,
      providerOptions: buildOptions?.({ topK }),
    };
    if (!onDelta) {
      const { text } = await generateText(shared);
      return text;
    }
    let failure: unknown;
    const result = streamText({
      ...shared,
      onError: ({ error }) => {
        failure = error;
      },
    });
    let text = "";
    for await (const delta of result.textStream) {
      text += delta;
      onDelta(delta);
    }
    if (failure) throw failure;
    return text;
  };
}
