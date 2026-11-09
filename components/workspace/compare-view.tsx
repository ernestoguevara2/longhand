"use client";

import { useMemo } from "react";

import { wordDiff, type DiffPart } from "@/lib/text/diff";

function Parts({ parts }: { parts: DiffPart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "same" ? (
          <span key={i}>{part.text}</span>
        ) : part.kind === "added" ? (
          <ins key={i} className="diff-added no-underline">
            {part.text}
          </ins>
        ) : (
          <del key={i} className="diff-removed">
            {part.text}
          </del>
        ),
      )}
    </>
  );
}

export function SideBySide({ draft, rewrite }: { draft: string; rewrite: string }) {
  const parts = useMemo(() => wordDiff(draft, rewrite), [draft, rewrite]);
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2" data-testid="side-by-side">
      <section aria-label="Draft">
        <h2 className="mb-3 text-[0.8125rem] text-muted-foreground">Draft</h2>
        <div className="reading-text">
          <Parts parts={parts.filter((p) => p.kind !== "added")} />
        </div>
      </section>
      <section aria-label="Rewrite">
        <h2 className="mb-3 text-[0.8125rem] text-muted-foreground">Rewrite</h2>
        <div className="reading-text">
          <Parts parts={parts.filter((p) => p.kind !== "removed")} />
        </div>
      </section>
    </div>
  );
}

export function InlineChanges({ draft, rewrite }: { draft: string; rewrite: string }) {
  const parts = useMemo(() => wordDiff(draft, rewrite), [draft, rewrite]);
  return (
    <div className="reading-text max-w-[68ch]" data-testid="inline-changes">
      <Parts parts={parts} />
    </div>
  );
}
