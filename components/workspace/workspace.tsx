"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { HistoryDrawer } from "@/components/history/history-drawer";
import { SettingsDrawer } from "@/components/settings/settings-drawer";
import { Button } from "@/components/ui/button";
import { useDeepScan } from "@/hooks/use-deep-scan";
import { useRewrite } from "@/hooks/use-rewrite";
import { useSettings } from "@/hooks/use-settings";
import { quickScan, type ScanResult } from "@/lib/detect";
import { CLASSIFIER } from "@/lib/detect/classifier-config";
import type { ChunkOutcome, ModelTarget } from "@/lib/humanize/client";
import { INTENSITIES, type Intensity } from "@/lib/humanize/types";
import { listOllamaModels } from "@/lib/llm/ollama";
import { PROVIDER_LABELS, type CloudProvider } from "@/lib/llm/providers";
import { SAMPLE_DRAFT } from "@/lib/samples";
import { loadHistory, saveHistory, type HistoryEntry } from "@/lib/storage/history";
import { LIMITS } from "@/lib/text/limits";
import { countWords } from "@/lib/text/segment";
import { cn } from "@/lib/utils";

import { InlineChanges, SideBySide } from "./compare-view";
import { MarginNotes } from "./margin-notes";
import { MarkedEditor } from "./marked-editor";
import { RefineActions } from "./refine-actions";
import { ReviewList } from "./review-list";
import { ScoreSummary } from "./score-summary";
import { SecondOpinion } from "./second-opinion";

type View = "draft" | "rewrite" | "side" | "changes";
type Deep = { text: string; result: ScanResult } | null;

const VIEW_LABELS: Record<View, string> = {
  draft: "Draft",
  rewrite: "Rewrite",
  side: "Side by side",
  changes: "Changes",
};

const INTENSITY_LABELS: Record<Intensity, string> = { light: "Light", medium: "Medium", aggressive: "Aggressive" };
const INTENSITY_HELP: Record<Intensity, string> = {
  light: "Copy-edit: remove the strongest patterns",
  medium: "Rewrite sentences, keep the order",
  aggressive: "Re-voice each paragraph from its meaning",
};

function download(text: string, extension: "txt" | "md") {
  const type = extension === "md" ? "text/markdown" : "text/plain";
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `longhand-rewrite.${extension}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Workspace() {
  const { settings, update, keys, setKey, setRemember } = useSettings();
  const deep = useDeepScan();
  const rewriter = useRewrite();

  const [draft, setDraft] = useState("");
  const [rewrite, setRewrite] = useState<string | null>(null);
  const [view, setView] = useState<View>("draft");
  const [active, setActive] = useState<number | null>(null);
  const [locked, setLocked] = useState<string[]>([]);
  const [deepDraft, setDeepDraft] = useState<Deep>(null);
  const [deepRewrite, setDeepRewrite] = useState<Deep>(null);
  const [consentAsked, setConsentAsked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaOnline, setOllamaOnline] = useState<boolean | null>(null);
  const [serverKeys, setServerKeys] = useState<Partial<Record<CloudProvider, boolean>>>({});

  const draftLayer = useRef<HTMLDivElement>(null);
  const rewriteLayer = useRef<HTMLDivElement>(null);
  const draftInput = useRef<HTMLTextAreaElement>(null);

  const deferredDraft = useDeferredValue(draft);
  const deferredRewrite = useDeferredValue(rewrite ?? "");
  const quickDraft = useMemo(() => (deferredDraft.trim() ? quickScan(deferredDraft) : null), [deferredDraft]);
  const quickRewrite = useMemo(() => (deferredRewrite.trim() ? quickScan(deferredRewrite) : null), [deferredRewrite]);
  const draftScan = deepDraft?.text === draft ? deepDraft.result : quickDraft;
  const rewriteScan = deepRewrite?.text === rewrite ? deepRewrite.result : quickRewrite;

  const words = useMemo(() => countWords(draft), [draft]);
  const refreshOllama = useCallback(async () => {
    try {
      const models = await listOllamaModels(settings.ollamaUrl);
      setOllamaModels(models);
      setOllamaOnline(true);
      return models;
    } catch {
      setOllamaOnline(false);
      return [];
    }
  }, [settings.ollamaUrl]);

  useEffect(() => {
    let cancelled = false;
    listOllamaModels(settings.ollamaUrl)
      .then((models) => {
        if (cancelled) return;
        setOllamaModels(models);
        setOllamaOnline(true);
      })
      .catch(() => {
        if (!cancelled) setOllamaOnline(false);
      });
    fetch("/api/config")
      .then((res) => res.json())
      .then((body: { serverKeys: Partial<Record<CloudProvider, boolean>> }) => {
        if (!cancelled) setServerKeys(body.serverKeys);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.ollamaUrl]);

  const fineTuned = settings.provider === "ollama" && settings.engine !== "prompt";
  const intensity: Intensity = fineTuned ? "aggressive" : settings.intensity;

  /** Resolves the chosen model, or says exactly what is missing. */
  const resolveTarget = useCallback((): ModelTarget | string => {
    if (settings.provider === "ollama") {
      const model = settings.models.ollama || ollamaModels[0];
      if (ollamaOnline === false) return "Ollama did not respond. Start it, or choose another provider.";
      if (!model) return "Choose an Ollama model first.";
      return { kind: "ollama", model, baseUrl: settings.ollamaUrl, engine: settings.engine };
    }
    const provider = settings.provider;
    const model = settings.models[provider];
    if (!keys[provider] && !serverKeys[provider]) return `Add your ${PROVIDER_LABELS[provider]} API key.`;
    if (!model) return `Choose a ${PROVIDER_LABELS[provider]} model.`;
    return { kind: "cloud", provider, model, apiKey: keys[provider] };
  }, [settings, ollamaModels, ollamaOnline, keys, serverKeys]);

  const resolved = resolveTarget();
  const target = typeof resolved === "string" ? null : resolved;

  const privacy =
    settings.provider === "ollama"
      ? "Your text stays on this computer"
      : `Scans stay on this device. Rewrites go to ${PROVIDER_LABELS[settings.provider]}`;

  async function runDeep(text: string, which: "draft" | "rewrite"): Promise<ScanResult | null> {
    const result = await deep.scan(text);
    if (result) {
      if (which === "draft") setDeepDraft({ text, result });
      else setDeepRewrite({ text, result });
    }
    return result;
  }

  function scan() {
    setHint(null);
    const text = view === "draft" ? draft : (rewrite ?? "");
    if (!text.trim()) {
      setHint("Paste a draft first.");
      return;
    }
    if (countWords(text) > LIMITS.scanWords) {
      setHint(`Scans handle up to ${LIMITS.scanWords.toLocaleString()} words.`);
      return;
    }
    if (!settings.deepScanAllowed) {
      setConsentAsked(true);
      return;
    }
    void runDeep(text, view === "draft" ? "draft" : "rewrite");
  }

  function allowDeepScan() {
    update({ deepScanAllowed: true });
    setConsentAsked(false);
    void runDeep(view === "draft" ? draft : (rewrite ?? ""), view === "draft" ? "draft" : "rewrite");
  }

  async function runRewrite(previous: ChunkOutcome[] = []) {
    setHint(null);
    if (words < LIMITS.rewriteMinWords) {
      setHint(`Rewriting needs at least ${LIMITS.rewriteMinWords} words.`);
      return;
    }
    if (words > LIMITS.rewriteWords) {
      setHint(`Rewrites handle up to ${LIMITS.rewriteWords.toLocaleString()} words at a time. Split the draft, then rewrite each part.`);
      return;
    }
    const current = resolveTarget();
    if (typeof current === "string") {
      setSettingsNotice(current);
      setSettingsOpen(true);
      return;
    }
    setSettingsNotice(null);
    if (settings.provider === "ollama" && !settings.models.ollama && current.kind === "ollama") {
      update({ models: { ...settings.models, ollama: current.model } });
    }
    setActive(null);
    setView("rewrite");
    const source = draft;
    const result = await rewriter.run(
      source,
      {
        target: current,
        intensity,
        voiceSample: settings.voiceSample,
        factCheck: settings.factCheck,
        locked,
        scoreCandidates: deep.ready ? deep.scoreTexts : undefined,
      },
      previous,
    );
    setRewrite(result.text);
    setDeepRewrite(null);

    let before = deepDraft?.text === source ? deepDraft.result : quickScan(source);
    let after: ScanResult = quickScan(result.text);
    if (settings.deepScanAllowed) {
      if (before.mode === "quick") before = (await runDeep(source, "draft")) ?? before;
      after = (await runDeep(result.text, "rewrite")) ?? after;
    }
    if (settings.historyEnabled && result.text !== source) {
      setHistory((entries) =>
        saveHistory([
          {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            draft: source,
            rewrite: result.text,
            intensity,
            provider: current.kind === "ollama" ? `Ollama ${current.model}` : `${current.provider} ${current.model}`,
            scoreBefore: before.score,
            scoreAfter: after.score,
          },
          ...entries,
        ]),
      );
    }
  }

  function keepSelectionExact() {
    const element = draftInput.current;
    const selected = element ? draft.slice(element.selectionStart, element.selectionEnd).trim() : "";
    if (!selected) {
      setHint("Select the text to keep exact, then press this again.");
      return;
    }
    setHint(null);
    setLocked((phrases) => (phrases.includes(selected) ? phrases : [...phrases, selected]));
  }

  async function copy() {
    await navigator.clipboard.writeText(rewrite ?? "").catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const showResults = rewrite !== null || rewriter.running;
  const views: View[] = showResults ? ["draft", "rewrite", "side", "changes"] : ["draft"];
  const running = rewriter.running;
  const status = deep.status;
  const overLimit = words > LIMITS.rewriteWords;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[76rem] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 sm:px-6">
        <Link href="/" className="font-serif text-xl italic">
          Longhand
        </Link>
        <p className="order-3 w-full text-[0.8125rem] text-muted-foreground sm:order-none sm:w-auto" data-testid="privacy-label">
          {privacy}
        </p>
        <nav className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" render={<Link href="/how-it-works" />} nativeButton={false}>
            How it works
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
            History
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[76rem] flex-1 px-4 pb-40 sm:px-6">
        {views.length > 1 && (
          <div role="tablist" aria-label="View" className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1">
            {views.map((option) => (
              <button
                key={option}
                role="tab"
                type="button"
                aria-selected={view === option}
                onClick={() => {
                  setView(option);
                  setActive(null);
                }}
                className={cn(
                  "cursor-pointer rounded-sm border-b-2 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  view === option ? "border-[var(--pen-note)] text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {VIEW_LABELS[option]}
              </button>
            ))}
            {rewrite !== null && !running && (
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={copy}>
                  {copied ? "Copied" : "Copy rewrite"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => download(rewrite, "txt")}>
                  Download .txt
                </Button>
                <Button variant="ghost" size="sm" onClick={() => download(rewrite, "md")}>
                  Download .md
                </Button>
              </div>
            )}
          </div>
        )}

        {view === "draft" && (
          <>
            {draft.trim() && (
              <>
                <ScoreSummary current={draftScan} before={null} />
                <Extras>
                  <DeepPanel status={status} consentAsked={consentAsked} onAllow={allowDeepScan} onDecline={() => setConsentAsked(false)} />
                  <SecondOpinion text={draft} keys={keys} />
                  {locked.length > 0 && (
                    <section aria-label="Text kept exact" className="space-y-2 text-[0.8125rem]">
                      <h2 className="text-sm font-medium">Kept exact</h2>
                      {locked.map((phrase) => (
                        <div key={phrase} className="flex items-start justify-between gap-2 border-l-2 border-[var(--pen-good)] pl-3">
                          <span className="line-clamp-2 font-serif">{phrase}</span>
                          <button
                            type="button"
                            className="cursor-pointer text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            onClick={() => setLocked((phrases) => phrases.filter((p) => p !== phrase))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </section>
                  )}
                </Extras>
              </>
            )}
            <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
              <MarkedEditor
                label="Draft"
                value={draft}
                onChange={(value) => {
                  setDraft(value);
                  setActive(null);
                }}
                scan={draftScan?.sentences.length && deferredDraft === draft ? draftScan : null}
                activeSentence={active}
                onActiveSentence={setActive}
                placeholder="Paste a draft here. Marks appear as you type."
                layerRef={draftLayer}
                textareaRef={draftInput}
              />
              <aside>
                {!draft.trim() ? (
                  <section className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                    <p>Highlights show sentences that use common AI writing patterns, and notes here explain each one.</p>
                    <p>Scanning runs in this browser. Rewriting uses the model you choose in Settings.</p>
                    <Button variant="secondary" size="sm" onClick={() => setDraft(SAMPLE_DRAFT)}>
                      Try a sample draft
                    </Button>
                  </section>
                ) : (
                  <MarginNotes scan={draftScan} activeSentence={active} onActiveSentence={setActive} layerRef={draftLayer} />
                )}
              </aside>
            </div>
          </>
        )}

        {view === "rewrite" && (
          <>
            <ScoreSummary current={running ? draftScan : rewriteScan} before={running ? null : draftScan} />
            <Extras>
              <DeepPanel status={status} consentAsked={consentAsked} onAllow={allowDeepScan} onDecline={() => setConsentAsked(false)} />
              {!running && rewriter.outcomes.length > 0 && (
                <ReviewList outcomes={rewriter.outcomes} busy={running} onRetry={() => runRewrite(rewriter.outcomes)} />
              )}
              {!running && rewrite && <SecondOpinion text={rewrite} keys={keys} />}
            </Extras>
            <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
              {running ? (
                <div aria-live="polite" className="reading-text min-h-[26rem] px-1 text-muted-foreground" data-testid="rewrite-preview">
                  {rewriter.progress?.preview || "Waiting for the model."}
                </div>
              ) : (
                <MarkedEditor
                  label="Rewrite"
                  value={rewrite ?? ""}
                  onChange={(value) => {
                    setRewrite(value);
                    setActive(null);
                  }}
                  scan={rewriteScan?.sentences.length && deferredRewrite === rewrite ? rewriteScan : null}
                  activeSentence={active}
                  onActiveSentence={setActive}
                  layerRef={rewriteLayer}
                />
              )}
              <aside>
                {!running && rewrite !== null && (
                  <MarginNotes
                    scan={rewriteScan}
                    activeSentence={active}
                    onActiveSentence={setActive}
                    layerRef={rewriteLayer}
                    renderActions={(sentence) => (
                      <RefineActions
                        key={sentence.text}
                        sentence={sentence}
                        text={rewrite}
                        target={target}
                        onReplace={(replacement) => {
                          setRewrite(rewrite.slice(0, sentence.start) + replacement + rewrite.slice(sentence.end));
                          setActive(null);
                        }}
                      />
                    )}
                  />
                )}
              </aside>
            </div>
          </>
        )}

        {view === "side" && rewrite !== null && <SideBySide draft={draft} rewrite={rewrite} />}
        {view === "changes" && rewrite !== null && <InlineChanges draft={draft} rewrite={rewrite} />}
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[76rem] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <p className={cn("text-[0.8125rem] tabular-nums", overLimit ? "text-[var(--pen-flag)]" : "text-muted-foreground")}>
            {words.toLocaleString()} / {LIMITS.rewriteWords.toLocaleString()} words
          </p>

          {running ? (
            <p aria-live="polite" className="text-sm" data-testid="progress">
              Part {rewriter.progress?.part} of {rewriter.progress?.parts}: {rewriter.progress?.stage}
            </p>
          ) : (
            hint && (
              <p role="status" className="text-sm text-[var(--pen-note)]">
                {hint}
              </p>
            )
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {view === "draft" && !running && (
              <Button variant="ghost" size="sm" onClick={keepSelectionExact}>
                Keep selection exact
              </Button>
            )}
            <div role="radiogroup" aria-label="Rewrite intensity" className="flex rounded-md bg-secondary p-0.5">
              {INTENSITIES.map((level) => {
                const unavailable = fineTuned && level !== "aggressive";
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={intensity === level}
                    disabled={unavailable}
                    title={unavailable ? "This model only does full rewrites" : INTENSITY_HELP[level]}
                    onClick={() => update({ intensity: level })}
                    className={cn(
                      "cursor-pointer rounded-[4px] px-2.5 py-1 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                      intensity === level ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {INTENSITY_LABELS[level]}
                  </button>
                );
              })}
            </div>
            <Button variant="secondary" onClick={scan} disabled={status.state === "downloading" || status.state === "scanning"}>
              {status.state === "scanning" || status.state === "downloading" ? "Scanning" : "Scan"}
            </Button>
            {running ? (
              <Button onClick={rewriter.cancel}>Cancel</Button>
            ) : (
              <Button onClick={() => runRewrite()}>Rewrite</Button>
            )}
          </div>
        </div>
      </footer>

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        update={update}
        keys={keys}
        setKey={setKey}
        setRemember={setRemember}
        ollama={{ models: ollamaModels, online: ollamaOnline, refresh: refreshOllama }}
        serverKeys={serverKeys}
        notice={settingsNotice}
      />
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        entries={history}
        onRestore={(entry) => {
          setDraft(entry.draft);
          setRewrite(entry.rewrite);
          rewriter.setOutcomes([]);
          setView("rewrite");
          setHistoryOpen(false);
        }}
        onDelete={(id) => setHistory((entries) => saveHistory(entries.filter((e) => e.id !== id)))}
        onClear={() => setHistory(saveHistory([]))}
      />
    </div>
  );
}

/** Optional panels between the score and the page. Empty panels take no space. */
function Extras({ children }: { children: ReactNode }) {
  return <div className="mb-7 grid gap-6 empty:hidden md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function DeepPanel({
  status,
  consentAsked,
  onAllow,
  onDecline,
}: {
  status: ReturnType<typeof useDeepScan>["status"];
  consentAsked: boolean;
  onAllow: () => void;
  onDecline: () => void;
}) {
  if (consentAsked) {
    return (
      <section aria-label="Deep scan" className="space-y-2 border-l-2 border-[var(--pen-note)] pl-3 text-[0.8125rem] leading-snug" data-testid="deep-consent">
        <p>
          A deep scan downloads a {CLASSIFIER.approxDownloadMb} MB model once, then runs it in this browser. Your text stays here.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={onAllow}>
            Download and scan
          </Button>
          <Button size="sm" variant="ghost" onClick={onDecline}>
            Keep quick read
          </Button>
        </div>
      </section>
    );
  }
  if (status.state === "downloading") {
    return (
      <p role="status" className="text-[0.8125rem] text-muted-foreground tabular-nums">
        Loading the scanner{status.percent === null ? "" : `: ${status.percent}%`}
      </p>
    );
  }
  if (status.state === "scanning") {
    return (
      <p role="status" className="text-[0.8125rem] text-muted-foreground tabular-nums">
        Scanning{status.total ? `: ${status.done} of ${status.total} passages` : ""}
      </p>
    );
  }
  if (status.state === "failed") {
    return (
      <p role="alert" className="border-l-2 border-[var(--pen-flag)] pl-3 text-[0.8125rem] leading-snug">
        {status.message}
      </p>
    );
  }
  return null;
}
