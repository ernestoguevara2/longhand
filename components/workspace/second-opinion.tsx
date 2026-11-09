"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EXTERNAL_DETECTOR_LABELS, type ExternalResult } from "@/lib/detect/external";
import type { ExternalDetector, KeyName } from "@/lib/storage/settings";

const DETECTORS: ExternalDetector[] = ["sapling", "pangram", "gptzero"];

/** Commercial detectors, only offered when the user has added a key. Shown apart from our score. */
export function SecondOpinion({ text, keys }: { text: string; keys: Partial<Record<KeyName, string>> }) {
  const [results, setResults] = useState<Partial<Record<ExternalDetector, ExternalResult | string>>>({});
  const available = DETECTORS.filter((d) => keys[d]);
  if (available.length === 0) return null;

  async function check(detector: ExternalDetector) {
    setResults((r) => ({ ...r, [detector]: "Checking" }));
    try {
      const res = await fetch("/api/detect/external", {
        method: "POST",
        headers: { "content-type": "application/json", "x-provider-key": keys[detector] ?? "" },
        body: JSON.stringify({ detector, text }),
      });
      const body = (await res.json()) as ExternalResult & { message?: string };
      setResults((r) => ({ ...r, [detector]: res.ok ? body : (body.message ?? "That check failed.") }));
    } catch {
      setResults((r) => ({ ...r, [detector]: "That check failed. Check your connection." }));
    }
  }

  return (
    <section aria-label="Second opinion" className="space-y-2 text-[0.8125rem]">
      <h2 className="text-sm font-medium">Second opinion</h2>
      <p className="leading-snug text-muted-foreground">This sends the text to the service you pick.</p>
      {available.map((detector) => {
        const result = results[detector];
        return (
          <div key={detector} className="flex items-center justify-between gap-3">
            <Button size="sm" variant="secondary" onClick={() => check(detector)}>
              {EXTERNAL_DETECTOR_LABELS[detector]}
            </Button>
            {typeof result === "string" && <span className="text-muted-foreground">{result}</span>}
            {result && typeof result === "object" && (
              <span className="tabular-nums">
                {Math.round(result.score * 100)}% AI{result.label ? `, ${result.label}` : ""}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
