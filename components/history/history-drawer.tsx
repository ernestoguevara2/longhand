"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { HistoryEntry } from "@/lib/storage/history";

const when = (timestamp: number) =>
  new Date(timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function HistoryDrawer({
  open,
  onOpenChange,
  entries,
  onRestore,
  onDelete,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: HistoryEntry[];
  onRestore: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>History</SheetTitle>
          <SheetDescription>Your last 20 rewrites, stored only in this browser.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">
          {entries.length === 0 && <p className="text-sm text-muted-foreground">Rewrites you make will appear here.</p>}
          {entries.map((entry) => (
            <article key={entry.id} className="space-y-1.5 border-l-2 border-border pl-3">
              <p className="line-clamp-2 font-serif text-sm">{entry.rewrite}</p>
              <p className="text-[0.8125rem] text-muted-foreground tabular-nums">
                {when(entry.createdAt)}, {entry.intensity}
                {entry.scoreBefore !== null && entry.scoreAfter !== null && `, score ${entry.scoreBefore} to ${entry.scoreAfter}`}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => onRestore(entry)}>
                  Restore
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDelete(entry.id)}>
                  Delete
                </Button>
              </div>
            </article>
          ))}
          {entries.length > 0 && (
            <Button variant="ghost" onClick={onClear}>
              Clear all history
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
