"use client";

import { useMemo, useRef, type RefObject } from "react";

import type { ScanResult } from "@/lib/detect";

type Segment = { text: string; sentence?: number; signal?: "some" | "strong" };

function buildSegments(text: string, scan: ScanResult | null): Segment[] {
  if (!scan || scan.sentences.length === 0) return [{ text }];
  const segments: Segment[] = [];
  let cursor = 0;
  for (const sentence of scan.sentences) {
    if (sentence.end > text.length || text.slice(sentence.start, sentence.end) !== sentence.text) {
      // The scan is older than the text; show it unmarked until the next scan arrives.
      return [{ text }];
    }
    if (sentence.start > cursor) segments.push({ text: text.slice(cursor, sentence.start) });
    segments.push({
      text: sentence.text,
      sentence: sentence.index,
      signal: sentence.signal === "none" ? undefined : sentence.signal,
    });
    cursor = sentence.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  scan: ScanResult | null;
  activeSentence: number | null;
  onActiveSentence: (index: number | null) => void;
  placeholder?: string;
  readOnly?: boolean;
  layerRef?: RefObject<HTMLDivElement | null>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  minHeight?: string;
};

/**
 * A plain textarea over a highlight layer with identical text metrics. The layer sets the height
 * and draws the marks; the textarea keeps native editing, selection, undo, and accessibility.
 */
export function MarkedEditor({
  label,
  value,
  onChange,
  scan,
  activeSentence,
  onActiveSentence,
  placeholder,
  readOnly,
  layerRef,
  textareaRef,
  minHeight = "26rem",
}: Props) {
  const segments = useMemo(() => buildSegments(value, scan), [value, scan]);
  const ownTextarea = useRef<HTMLTextAreaElement>(null);
  const input = textareaRef ?? ownTextarea;

  const updateCaret = () => {
    const element = input.current;
    if (!element || !scan) return;
    const at = element.selectionStart;
    const sentence = scan.sentences.find((s) => at >= s.start && at <= s.end);
    onActiveSentence(sentence ? sentence.index : null);
  };

  return (
    <div className="relative" style={{ minHeight }}>
      <div
        ref={layerRef}
        aria-hidden="true"
        data-testid={`${label}-marks`}
        className="reading-text pointer-events-none px-1 pb-24"
        style={{ minHeight, color: "transparent" }}
      >
        {segments.map((segment, i) =>
          segment.sentence === undefined ? (
            <span key={i}>{segment.text}</span>
          ) : (
            <span
              key={i}
              data-sentence={segment.sentence}
              className={[
                segment.signal ? `mark-${segment.signal}` : "",
                activeSentence === segment.sentence ? "mark-active" : "",
              ].join(" ")}
            >
              {segment.text}
            </span>
          ),
        )}
        {/* A trailing newline needs a character after it to take up a line. */}
        {"​"}
      </div>
      <textarea
        ref={input}
        aria-label={label}
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={!readOnly}
        onChange={(event) => onChange(event.target.value)}
        onClick={updateCaret}
        onKeyUp={updateCaret}
        onSelect={updateCaret}
        className="reading-text absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent px-1 pb-24 text-foreground caret-[var(--ring)] outline-none placeholder:text-muted-foreground/70 placeholder:italic"
      />
    </div>
  );
}
