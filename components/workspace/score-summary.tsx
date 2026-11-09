import type { ScanResult } from "@/lib/detect";
import type { Band } from "@/lib/detect/types";
import { cn } from "@/lib/utils";

const BAND_TEXT: Record<Band, string> = {
  "not-enough-text": "Not enough text",
  "likely-human": "Likely human",
  unclear: "Mixed or unclear",
  "likely-ai": "Likely AI",
};

const BAND_COLOR: Record<Band, string> = {
  "not-enough-text": "text-muted-foreground",
  "likely-human": "text-[var(--pen-good)]",
  unclear: "text-[var(--pen-note)]",
  "likely-ai": "text-[var(--pen-flag)]",
};

function Score({ scan, label, large }: { scan: ScanResult; label: string; large: boolean }) {
  return (
    <div className="flex items-end gap-3">
      <p
        className={cn(
          "font-serif leading-[0.85] tabular-nums",
          large ? "text-[4rem]" : "text-[2.25rem] text-muted-foreground",
          large && BAND_COLOR[scan.band],
        )}
        data-testid={`score-${label.toLowerCase()}`}
      >
        {scan.score ?? "–"}
      </p>
      <div className="text-[0.8125rem] leading-tight">
        <p className="text-muted-foreground">{label}</p>
        <p className={cn("font-medium", BAND_COLOR[scan.band])}>{BAND_TEXT[scan.band]}</p>
        {scan.score !== null && (
          <p className="text-muted-foreground">
            {scan.mode === "quick" ? "Quick read" : `${scan.confidence[0].toUpperCase()}${scan.confidence.slice(1)} confidence`}
          </p>
        )}
      </div>
    </div>
  );
}

function SignalList({ scan, before }: { scan: ScanResult; before: ScanResult | null }) {
  const strong = (s: ScanResult) => s.tells.filter((t) => t.tier === "strong").length;
  const vocabulary = (s: ScanResult) => s.tells.filter((t) => t.group === "vocabulary").length;
  const dashes = (s: ScanResult) => s.tells.filter((t) => t.patternId === "dash").length;
  const row = (name: string, fn: (s: ScanResult) => number) => (
    <div className="flex justify-between gap-4 tabular-nums" key={name}>
      <dt className="text-muted-foreground">{name}</dt>
      <dd>{before ? `${fn(before)} to ${fn(scan)}` : fn(scan)}</dd>
    </div>
  );
  return (
    <dl className="grid min-w-[12rem] gap-y-0.5 text-[0.8125rem] sm:grid-cols-2 sm:gap-x-8">
      {row("Strong patterns", strong)}
      {row("AI vocabulary", vocabulary)}
      {row("Dashes", dashes)}
      <div className="flex justify-between gap-4 tabular-nums">
        <dt className="text-muted-foreground">Text marked</dt>
        <dd>{Math.round(scan.flaggedShare * 100)}%</dd>
      </div>
    </dl>
  );
}

/** A band above the page, so the margin below stays free for notes lined up with their sentences. */
export function ScoreSummary({ current, before }: { current: ScanResult | null; before: ScanResult | null }) {
  if (!current) return null;
  return (
    <section aria-label="Scan result" className="mb-7 flex flex-wrap items-end gap-x-10 gap-y-4 border-b border-border pb-5">
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        {before && <Score scan={before} label="Before" large={false} />}
        <Score scan={current} label={before ? "After" : "AI signal"} large />
      </div>
      <SignalList scan={current} before={before} />
      <div className="min-w-[16rem] flex-1 space-y-1 text-[0.8125rem] leading-snug text-muted-foreground">
        {current.warnings.map((warning) => (
          <p key={warning.id}>{warning.message}</p>
        ))}
        <p>
          A score is an estimate, not proof of who wrote something.{" "}
          <a href="/how-it-works" className="underline underline-offset-2 hover:text-foreground">
            How scores work
          </a>
        </p>
      </div>
    </section>
  );
}
