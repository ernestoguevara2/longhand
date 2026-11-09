"use client";

import { useCallback, useRef, useState } from "react";

import { deepScan, type ScanResult } from "@/lib/detect";
import { ClassifierClient } from "@/lib/detect/worker-client";

export type DeepStatus =
  | { state: "idle" }
  | { state: "downloading"; percent: number | null }
  | { state: "scanning"; done: number; total: number }
  | { state: "failed"; message: string };

let shared: ClassifierClient | null = null;
const classifier = () => (shared ??= new ClassifierClient());

/** Runs the classifier in its worker. A failure leaves the quick read in place. */
export function useDeepScan() {
  const [status, setStatus] = useState<DeepStatus>({ state: "idle" });
  const [ready, setReady] = useState(false);
  const generation = useRef(0);

  const scan = useCallback(async (text: string): Promise<ScanResult | null> => {
    const run = ++generation.current;
    try {
      setStatus({ state: "downloading", percent: null });
      await classifier().load(({ loaded, total }) => {
        if (generation.current === run) {
          setStatus({ state: "downloading", percent: total ? Math.round((loaded / total) * 100) : null });
        }
      });
      setReady(true);
      setStatus({ state: "scanning", done: 0, total: 0 });
      const result = await deepScan(
        text,
        (windows, onProgress) => classifier().score(windows, onProgress),
        (done, total) => {
          if (generation.current === run) setStatus({ state: "scanning", done, total });
        },
      );
      if (generation.current !== run) return null;
      setStatus({ state: "idle" });
      return result;
    } catch {
      if (generation.current === run) {
        setStatus({
          state: "failed",
          message: "The deep scan could not run, so this is the quick read. Check your connection and try again.",
        });
      }
      return null;
    }
  }, []);

  const scoreTexts = useCallback((texts: string[]) => classifier().score(texts), []);

  return { scan, status, ready, scoreTexts };
}
