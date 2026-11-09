"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SentenceResult } from "@/lib/detect";
import { refineWithTarget, type ModelTarget } from "@/lib/humanize/client";
import { classifyError } from "@/lib/llm/errors";

/** Three other ways to write a sentence, each already checked for its numbers and names. */
export function RefineActions({
  sentence,
  text,
  target,
  onReplace,
}: {
  sentence: SentenceResult;
  text: string;
  target: ModelTarget | null;
  onReplace: (replacement: string) => void;
}) {
  const [options, setOptions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  async function load() {
    if (!target) {
      setError("Choose a model in Settings first.");
      return;
    }
    setLoading(true);
    setError(null);
    controller.current?.abort();
    controller.current = new AbortController();
    try {
      const alternatives = await refineWithTarget(
        target,
        {
          sentence: sentence.text,
          before: text.slice(Math.max(0, sentence.start - 400), sentence.start),
          after: text.slice(sentence.end, sentence.end + 400),
        },
        controller.current.signal,
      );
      setOptions(alternatives);
      if (alternatives.length === 0) setError("No wording kept all the facts. Try again, or edit the sentence directly.");
    } catch (failure) {
      setError(classifyError(failure).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
        {loading ? "Writing options" : options ? "Try again" : "Try other wordings"}
      </Button>
      {error && <p role="alert">{error}</p>}
      {options?.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onReplace(option)}
          className="block w-full cursor-pointer rounded-md bg-secondary px-2.5 py-2 text-left font-serif text-[0.875rem] leading-snug hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
