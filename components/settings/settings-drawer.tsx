"use client";

import { useTheme } from "next-themes";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Engine } from "@/lib/humanize/types";
import { CLOUD_PROVIDERS, DEFAULT_MODELS, PROVIDER_LABELS, type CloudProvider } from "@/lib/llm/providers";
import type { ExternalDetector, KeyName, ProviderChoice, Settings } from "@/lib/storage/settings";

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>option]:bg-popover";

const ENGINE_HELP: Record<Engine, string> = {
  prompt: "Uses editing instructions with any model. Light, Medium and Aggressive all apply.",
  "humanizer-12b": "A model fine-tuned for rewriting. Set it up in Ollama as “humanizer” using the README. Full rewrites only.",
  "smaug-12b": "A model fine-tuned for rewriting. Set it up in Ollama using the README. Full rewrites only.",
};

const DETECTORS: { id: ExternalDetector; label: string }[] = [
  { id: "sapling", label: "Sapling" },
  { id: "pangram", label: "Pangram" },
  { id: "gptzero", label: "GPTZero" },
];

function Field({ label, htmlFor, children, help }: { label: string; htmlFor: string; children: ReactNode; help?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && <p className="text-[0.8125rem] leading-snug text-muted-foreground">{help}</p>}
    </div>
  );
}

function Toggle({ id, label, help, checked, onChange }: { id: string; label: string; help?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        {help && <p className="text-[0.8125rem] leading-snug text-muted-foreground">{help}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  keys: Partial<Record<KeyName, string>>;
  setKey: (name: KeyName, value: string) => void;
  setRemember: (remember: boolean) => void;
  ollama: { models: string[]; online: boolean | null; refresh: () => void };
  serverKeys: Partial<Record<CloudProvider, boolean>>;
  notice?: string | null;
};

export function SettingsDrawer({ open, onOpenChange, settings, update, keys, setKey, setRemember, ollama, serverKeys, notice }: Props) {
  const { theme, setTheme } = useTheme();
  const [cloudModels, setCloudModels] = useState<Partial<Record<CloudProvider, string[]>>>({});
  const [listError, setListError] = useState<string | null>(null);
  const provider = settings.provider;
  const cloud = provider === "ollama" ? null : provider;

  const setModel = (model: string) => update({ models: { ...settings.models, [provider]: model } });

  async function listModels(id: CloudProvider) {
    setListError(null);
    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "content-type": "application/json", ...(keys[id] ? { "x-provider-key": keys[id] } : {}) },
        body: JSON.stringify({ provider: id }),
      });
      const body = (await res.json()) as { models?: string[]; message?: string };
      if (!res.ok || !body.models) setListError(body.message ?? "Could not list models.");
      else setCloudModels((m) => ({ ...m, [id]: body.models }));
    } catch {
      setListError("Could not list models. Check your connection.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Saved in this browser. Nothing here is stored on a server.</SheetDescription>
        </SheetHeader>

        <div className="space-y-8 px-4 pb-8">
          {notice && (
            <p role="alert" className="border-l-2 border-[var(--pen-flag)] pl-3 text-sm">
              {notice}
            </p>
          )}

          <section className="space-y-4">
            <h3 className="font-medium">Rewriting model</h3>
            <Field label="Provider" htmlFor="provider">
              <select
                id="provider"
                className={SELECT_CLASS}
                value={provider}
                onChange={(e) => update({ provider: e.target.value as ProviderChoice })}
              >
                <option value="ollama">{PROVIDER_LABELS.ollama}</option>
                {CLOUD_PROVIDERS.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_LABELS[id]}
                  </option>
                ))}
              </select>
            </Field>

            {provider === "ollama" && (
              <>
                <Field
                  label="Ollama address"
                  htmlFor="ollama-url"
                  help={
                    ollama.online === false
                      ? "Ollama did not respond. Start it, then refresh. On a hosted copy of this app, also run: OLLAMA_ORIGINS=<this site's address> ollama serve"
                      : "Text goes straight from this browser to Ollama."
                  }
                >
                  <div className="flex gap-2">
                    <Input id="ollama-url" value={settings.ollamaUrl} onChange={(e) => update({ ollamaUrl: e.target.value })} />
                    <Button variant="secondary" onClick={ollama.refresh}>
                      Refresh
                    </Button>
                  </div>
                </Field>
                <Field label="Model" htmlFor="ollama-model">
                  <select
                    id="ollama-model"
                    className={SELECT_CLASS}
                    value={settings.models.ollama ?? ""}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {!settings.models.ollama && <option value="">Choose a model</option>}
                    {settings.models.ollama && !ollama.models.includes(settings.models.ollama) && (
                      <option value={settings.models.ollama}>{settings.models.ollama}</option>
                    )}
                    {ollama.models.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Rewriting method" htmlFor="engine" help={ENGINE_HELP[settings.engine]}>
                  <select
                    id="engine"
                    className={SELECT_CLASS}
                    value={settings.engine}
                    onChange={(e) => update({ engine: e.target.value as Engine })}
                  >
                    <option value="prompt">Editing instructions</option>
                    <option value="humanizer-12b">Fine-tuned: humanizer 12B</option>
                    <option value="smaug-12b">Fine-tuned: Smaug 12B</option>
                  </select>
                </Field>
              </>
            )}

            {cloud && (
              <>
                <Field
                  label="API key"
                  htmlFor="api-key"
                  help={
                    serverKeys[cloud]
                      ? "This deployment has its own key. Add yours to use it instead."
                      : "Sent with each request and never stored on the server."
                  }
                >
                  <Input
                    id="api-key"
                    type="password"
                    autoComplete="off"
                    value={keys[cloud] ?? ""}
                    onChange={(e) => setKey(cloud, e.target.value)}
                  />
                </Field>
                <Field label="Model" htmlFor="cloud-model" help={listError ?? undefined}>
                  <div className="flex gap-2">
                    <Input
                      id="cloud-model"
                      list="cloud-model-list"
                      placeholder={DEFAULT_MODELS[cloud] ?? "Type a model name, or list them"}
                      value={settings.models[cloud] ?? ""}
                      onChange={(e) => setModel(e.target.value)}
                    />
                    <Button variant="secondary" onClick={() => listModels(cloud)}>
                      List
                    </Button>
                  </div>
                  <datalist id="cloud-model-list">
                    {cloudModels[cloud]?.map((model) => <option key={model} value={model} />)}
                  </datalist>
                </Field>
              </>
            )}

            <Field label="Writing sample" htmlFor="voice" help="Optional. Rewrites follow this rhythm and word choice. It is sent with the draft.">
              <Textarea
                id="voice"
                rows={4}
                maxLength={4000}
                value={settings.voiceSample}
                onChange={(e) => update({ voiceSample: e.target.value })}
              />
            </Field>
            <Toggle
              id="fact-check"
              label="Check facts with the model"
              help="Compares each rewrite with the draft. Slower on local models."
              checked={settings.factCheck}
              onChange={(factCheck) => update({ factCheck })}
            />
          </section>

          <section className="space-y-4">
            <h3 className="font-medium">Scanning</h3>
            <Toggle
              id="deep-scan"
              label="Deep scan"
              help="Downloads a 125 MB model once, then runs it in this browser. Your text stays here."
              checked={settings.deepScanAllowed}
              onChange={(deepScanAllowed) => update({ deepScanAllowed })}
            />
            <p className="text-[0.8125rem] leading-snug text-muted-foreground">
              Add a key below to get a second opinion from a commercial detector. Those checks send your text to that service.
            </p>
            {DETECTORS.map(({ id, label }) => (
              <Field key={id} label={`${label} API key`} htmlFor={`key-${id}`}>
                <Input
                  id={`key-${id}`}
                  type="password"
                  autoComplete="off"
                  value={keys[id] ?? ""}
                  onChange={(e) => setKey(id, e.target.value)}
                />
              </Field>
            ))}
          </section>

          <section className="space-y-4">
            <h3 className="font-medium">This browser</h3>
            <Toggle
              id="remember-keys"
              label="Remember API keys"
              help="Off means keys are forgotten when you close the tab. On stores them unencrypted in this browser."
              checked={settings.rememberKeys}
              onChange={setRemember}
            />
            <Toggle
              id="history"
              label="Keep history"
              help="Stores your last 20 rewrites in this browser only."
              checked={settings.historyEnabled}
              onChange={(historyEnabled) => update({ historyEnabled })}
            />
            <Toggle id="theme" label="Dark theme" checked={theme !== "light"} onChange={(dark) => setTheme(dark ? "dark" : "light")} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
