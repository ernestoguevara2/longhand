"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ChunkOutcome } from "@/lib/humanize/client";

const VISIBLE_FACTS = 3;

/** Everything the checks found in the rewrite. Problems are shown, never quietly passed. */
export function ReviewList({
  outcomes,
  onRetry,
  busy,
}: {
  outcomes: ChunkOutcome[];
  onRetry: () => void;
  busy: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const failed = outcomes.filter((o) => o.error);
  const violations = outcomes.flatMap((o) => o.violations);
  const facts = outcomes.flatMap((o) => o.factProblems ?? []);
  const judgeSkipped = outcomes.some((o) => !o.error && o.factProblems === null);
  const total = failed.length + violations.length + facts.length;

  return (
    <section aria-label="Things to check" className="space-y-2 text-[0.8125rem] leading-snug" data-testid="review-list">
      <h2 className="text-sm font-medium">
        {total === 0 ? "Checks passed" : total === 1 ? "1 thing to check" : `${total} things to check`}
      </h2>
      {total === 0 && (
        <p className="text-muted-foreground">
          Numbers, names, quotes, links and layout match the draft. Read it through before you use it.
        </p>
      )}
      {failed.length > 0 && (
        <div className="space-y-2 border-l-2 border-[var(--pen-flag)] pl-3">
          <p>
            {failed.length === 1 ? "One part" : `${failed.length} parts`} kept the original text.{" "}
            {failed[0].error?.message}
          </p>
          <Button size="sm" variant="secondary" onClick={onRetry} disabled={busy}>
            Retry failed parts
          </Button>
        </div>
      )}
      {violations.map((violation, i) => (
        <p key={i} className="border-l-2 border-[var(--pen-flag)] pl-3">
          {violation.message}
        </p>
      ))}
      {(showAll ? facts : facts.slice(0, VISIBLE_FACTS)).map((fact, i) => (
        <div key={i} className="border-l-2 border-[var(--pen-note)] pl-3">
          <p>{fact.explanation || `Possible ${fact.kind} fact`}</p>
          {fact.draft && <p className="text-muted-foreground">Draft: “{fact.draft}”</p>}
          {fact.rewrite && <p className="text-muted-foreground">Rewrite: “{fact.rewrite}”</p>}
        </div>
      ))}
      {facts.length > VISIBLE_FACTS && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show ${facts.length - VISIBLE_FACTS} more`}
        </Button>
      )}
      {judgeSkipped && outcomes.some((o) => o.factProblems !== null) && (
        <p className="text-muted-foreground">The fact check could not read the model&apos;s answer for one part.</p>
      )}
    </section>
  );
}
