/**
 * @fileoverview React context for global app settings, backed by chrome.storage
 * (the canonical store the background reads) with optional on-disk file mirror.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { loadAppSettings, saveAppSettings, onStorageChanged, STORAGE_KEYS } from '@/core/settings/SettingsStore';
import { type AppSettings, SettingsStorageMode, defaultAppSettings } from '@/core/settings/schema';
import { getSavedHandle, writeSettingsFile } from '@/core/settings/fsHandle';
import { isRecord } from '@/core/util/guards';

interface SettingsContextValue {
  readonly settings: AppSettings;
  readonly ready: boolean;
  update(patch: Partial<AppSettings>): Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaultAppSettings(),
  ready: false,
  update: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      const loaded = await loadAppSettings();
      if (!active) return;
      setSettings(loaded);
      setReady(true);
    };
    void load();
    const unsubscribe = onStorageChanged((changes) => {
      const next = changes[STORAGE_KEYS.app]?.newValue;
      if (isRecord(next)) setSettings({ ...defaultAppSettings(), ...next });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<AppSettings>): Promise<void> => {
      const next = { ...settings, ...patch };
      setSettings(next);
      await saveAppSettings(next);
      // Best-effort mirror to the on-disk file when that mode is selected.
      if (next.settingsStorage === SettingsStorageMode.FILE && (await getSavedHandle())) {
        try {
          await writeSettingsFile(next);
        } catch {
          // ignore — file may be unavailable; chrome.storage remains canonical
        }
      }
    },
    [settings],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, ready, update }),
    [settings, ready, update],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = (): SettingsContextValue => useContext(SettingsContext);
