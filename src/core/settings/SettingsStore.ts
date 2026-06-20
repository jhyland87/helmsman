/**
 * @fileoverview chrome.storage-backed persistence for settings and printer
 * configs. This is the canonical store the background worker reads. The
 * optional on-disk file (see `fsHandle.ts`) and Moonraker-DB dashboard storage
 * are UI-managed mirrors layered on top of this.
 */
import type { PrinterConfig } from '@/core/printers/printerConfig';
import {
  type AppSettings,
  type PrinterDashboardSettings,
  defaultAppSettings,
  defaultDashboardSettings,
} from './schema';

const KEY_APP = 'app_settings';
const KEY_PRINTERS = 'printers';
const dashboardKey = (printerId: string): string => `dashboard:${printerId}`;

const get = async <T>(key: string): Promise<T | undefined> => {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
};

const set = async (key: string, value: unknown): Promise<void> => {
  await chrome.storage.local.set({ [key]: value });
};

export const loadAppSettings = async (): Promise<AppSettings> => {
  const saved = await get<Partial<AppSettings>>(KEY_APP);
  return { ...defaultAppSettings(), ...saved };
};

export const saveAppSettings = async (settings: AppSettings): Promise<void> => {
  await set(KEY_APP, settings);
};

export const loadPrinters = async (): Promise<PrinterConfig[]> => {
  return (await get<PrinterConfig[]>(KEY_PRINTERS)) ?? [];
};

export const savePrinters = async (printers: readonly PrinterConfig[]): Promise<void> => {
  await set(KEY_PRINTERS, printers);
};

export const loadDashboard = async (
  printerId: string,
): Promise<PrinterDashboardSettings> => {
  const saved = await get<Partial<PrinterDashboardSettings>>(dashboardKey(printerId));
  return { ...defaultDashboardSettings(), ...saved };
};

export const saveDashboard = async (
  printerId: string,
  dashboard: PrinterDashboardSettings,
): Promise<void> => {
  await set(dashboardKey(printerId), dashboard);
};

/**
 * Subscribe to local-storage changes (used by the UI to react to settings
 * updates made elsewhere). Returns an unsubscribe function.
 */
export const onStorageChanged = (
  listener: (changes: Record<string, chrome.storage.StorageChange>) => void,
): (() => void) => {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName === 'local') listener(changes);
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
};

export const STORAGE_KEYS = { app: KEY_APP, printers: KEY_PRINTERS } as const;
