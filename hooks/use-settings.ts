"use client";

import { useCallback, useState } from "react";

import {
  loadKeys,
  loadSettings,
  saveKeys,
  saveSettings,
  type KeyName,
  type Settings,
} from "@/lib/storage/settings";

/** The workspace only renders in the browser, so storage can be read during the first render. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [keys, setKeys] = useState<Partial<Record<KeyName, string>>>(loadKeys);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const setKey = useCallback(
    (name: KeyName, value: string) => {
      setKeys((current) => {
        const next = { ...current, [name]: value };
        saveKeys(next, settings.rememberKeys);
        return next;
      });
    },
    [settings.rememberKeys],
  );

  const setRemember = useCallback(
    (remember: boolean) => {
      update({ rememberKeys: remember });
      saveKeys(keys, remember);
    },
    [keys, update],
  );

  return { settings, update, keys, setKey, setRemember };
}
