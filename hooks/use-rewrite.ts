"use client";

import { useCallback, useRef, useState } from "react";

import {
  rewriteDocument,
  type ChunkOutcome,
  type RunOptions,
  type RunProgress,
  type RunResult,
} from "@/lib/humanize/client";

export function useRewrite() {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [outcomes, setOutcomes] = useState<ChunkOutcome[]>([]);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(
    async (draft: string, options: RunOptions, previous: ChunkOutcome[] = []): Promise<RunResult> => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setProgress({ part: 1, parts: 1, stage: "starting" });
      try {
        const result = await rewriteDocument(draft, options, setProgress, abort.signal, previous);
        setOutcomes(result.outcomes);
        return result;
      } finally {
        if (controller.current === abort) {
          controller.current = null;
          setProgress(null);
        }
      }
    },
    [],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { run, cancel, progress, outcomes, setOutcomes, running: progress !== null };
}
