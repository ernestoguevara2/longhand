"use client";

import { useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

import type { ScanResult, SentenceResult, TellMatch } from "@/lib/detect";
import { cn } from "@/lib/utils";

const uniqueByLabel = (tells: TellMatch[]) => {
  const seen = new Map<string, TellMatch>();
  for (const tell of tells) if (!seen.has(tell.label)) seen.set(tell.label, tell);
  return [...seen.values()].sort((a, b) => Number(b.tier === "strong") - Number(a.tier === "strong"));
};

function noteLabels(sentence: SentenceResult): string[] {
  const labels = uniqueByLabel(sentence.tells).map((t) => t.label);
  if (labels.length === 0 && sentence.windowScore !== undefined) return ["Reads as AI to the classifier"];
  return labels;
}

function NoteBody({ sentence, children }: { sentence: SentenceResult; children?: ReactNode }) {
  const tells = uniqueByLabel(sentence.tells);
  return (
    <div className="space-y-2 pt-1">
      {tells.length === 0 ? (
        <p className="text-muted-foreground">The classifier read this passage as AI-like. No named pattern was found.</p>
      ) : (
        tells.map((tell) => (
          <p key={tell.label} className="text-muted-foreground">
            <span className="text-foreground">{tell.label}.</span> {tell.why}
          </p>
        ))
      )}
      {sentence.windowScore !== undefined && (
        <p className="text-muted-foreground tabular-nums">
          Classifier on this passage: {Math.round(sentence.windowScore * 100)}%
        </p>
      )}
      {children}
    </div>
  );
}

type Props = {
  scan: ScanResult | null;
  activeSentence: number | null;
  onActiveSentence: (index: number | null) => void;
  layerRef: RefObject<HTMLDivElement | null>;
  /** Extra controls for the sentence being looked at, such as other wordings. */
  renderActions?: (sentence: SentenceResult) => ReactNode;
};

/**
 * Editor's notes in the margin, each lined up with its sentence. Only strong marks and the sentence
 * under the caret get a note, so the margin stays readable. Stacks as a list on narrow screens.
 */
export function MarginNotes({ scan, activeSentence, onActiveSentence, layerRef, renderActions }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [tops, setTops] = useState<Record<number, number>>({});
  const [height, setHeight] = useState(0);

  const shown = useMemo(
    () =>
      (scan?.sentences ?? []).filter(
        (s) => s.signal === "strong" || (s.index === activeSentence && s.signal !== "none"),
      ),
    [scan, activeSentence],
  );

  useLayoutEffect(() => {
    const measure = () => {
      const layer = layerRef.current;
      const root = container.current;
      if (!layer || !root) return;
      const origin = root.getBoundingClientRect().top;
      const next: Record<number, number> = {};
      let cursor = 0;
      for (const note of Array.from(root.querySelectorAll<HTMLElement>("[data-note]"))) {
        const index = Number(note.dataset.note);
        const mark = layer.querySelector<HTMLElement>(`[data-sentence="${index}"]`);
        const wanted = mark ? mark.getBoundingClientRect().top - origin : cursor;
        const top = Math.max(wanted, cursor);
        next[index] = top;
        cursor = top + note.offsetHeight + 8;
      }
      setTops((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
      setHeight(cursor);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (layerRef.current) observer.observe(layerRef.current);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [layerRef, shown, activeSentence]);

  if (!scan || shown.length === 0) return null;

  return (
    <div ref={container} className="relative flex flex-col gap-2 lg:block" style={{ minHeight: height }} data-testid="margin-notes">
      {shown.map((sentence) => {
        const active = sentence.index === activeSentence;
        return (
          <div
            key={sentence.index}
            data-note={sentence.index}
            className={cn(
              "w-full border-l-2 pl-3 text-[0.8125rem] leading-snug lg:absolute lg:left-0",
              sentence.signal === "strong" ? "border-[var(--pen-flag)]" : "border-[var(--pen-note)]",
              active && "z-30 max-h-[40dvh] overflow-y-auto rounded-r-md bg-card py-2 pr-3 max-lg:fixed max-lg:inset-x-2 max-lg:bottom-32 max-lg:w-auto max-lg:shadow-lg lg:z-10 lg:max-h-none",
            )}
            style={{ top: tops[sentence.index] ?? 0 }}
          >
            <button
              type="button"
              onClick={() => onActiveSentence(active ? null : sentence.index)}
              aria-expanded={active}
              className="w-full cursor-pointer rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {noteLabels(sentence).slice(0, 3).join(", ")}
            </button>
            {active && <NoteBody sentence={sentence}>{renderActions?.(sentence)}</NoteBody>}
          </div>
        );
      })}
    </div>
  );
}
