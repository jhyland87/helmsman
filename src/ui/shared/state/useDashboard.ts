/**
 * @fileoverview Loads and persists a printer's dashboard settings, honoring the
 * selected storage backend (chrome.storage vs the Moonraker database).
 */
import { useCallback, useEffect, useState } from 'react';

import { loadDashboard, saveDashboard } from '@/core/settings/SettingsStore';
import {
  DASHBOARD_SETTINGS_KEY,
  DashboardStorageMode,
  type DashboardLayout,
  type PrinterDashboardSettings,
  defaultDashboardSettings,
  reconcileLayout,
} from '@/core/settings/schema';
import { api } from '@/ui/shared/api';
import { useSettings } from './SettingsContext';

interface UseDashboardResult {
  readonly dashboard: PrinterDashboardSettings;
  readonly ready: boolean;
  setLayout(layout: DashboardLayout): void;
  toggleCollapse(panelId: string): void;
  update(patch: Partial<PrinterDashboardSettings>): void;
}

export const useDashboard = (printerId?: string): UseDashboardResult => {
  const { settings } = useSettings();
  const mode = settings.dashboardStorage;
  const [dashboard, setDashboard] = useState<PrinterDashboardSettings>(
    defaultDashboardSettings,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    // Returns the loaded settings plus whether they came from the printer DB.
    const load = async (): Promise<{ settings: PrinterDashboardSettings; fromDb: boolean }> => {
      if (!printerId) return { settings: defaultDashboardSettings(), fromDb: false };
      if (mode === DashboardStorageMode.PRINTER_DB) {
        try {
          const remote = await api.getPrinterSettings<PrinterDashboardSettings>(
            printerId,
            DASHBOARD_SETTINGS_KEY,
          );
          if (remote) return { settings: { ...defaultDashboardSettings(), ...remote }, fromDb: true };
        } catch {
          // fall through to the local copy when the printer DB is unavailable
        }
      }
      return { settings: await loadDashboard(printerId), fromDb: false };
    };
    const run = async (): Promise<void> => {
      const { settings, fromDb } = await load();
      const reconciled = { ...settings, layout: reconcileLayout(settings.layout) };
      if (!active) return;
      setDashboard(reconciled);
      setReady(true);
      // Seed the Moonraker DB on first use so the `helmsman` namespace is
      // created immediately (rather than only on the first layout change).
      if (printerId && mode === DashboardStorageMode.PRINTER_DB && !fromDb) {
        try {
          await api.setPrinterSettings(printerId, DASHBOARD_SETTINGS_KEY, reconciled);
        } catch {
          // printer DB unavailable (offline); the local cache still applies
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [printerId, mode]);

  const persist = useCallback(
    (next: PrinterDashboardSettings): void => {
      setDashboard(next);
      if (!printerId) return;
      // Always cache locally; additionally push to the printer DB when selected.
      void saveDashboard(printerId, next);
      if (mode === DashboardStorageMode.PRINTER_DB) {
        void (async () => {
          try {
            await api.setPrinterSettings(printerId, DASHBOARD_SETTINGS_KEY, next);
          } catch {
            // remote persist is best-effort; the local cache already has it
          }
        })();
      }
    },
    [printerId, mode],
  );

  const setLayout = useCallback(
    (layout: DashboardLayout) => persist({ ...dashboard, layout }),
    [dashboard, persist],
  );

  const toggleCollapse = useCallback(
    (panelId: string) => {
      const columns = dashboard.layout.columns.map((column) =>
        column.map((c) => (c.id === panelId ? { ...c, collapsed: !c.collapsed } : c)),
      );
      persist({ ...dashboard, layout: { columns } });
    },
    [dashboard, persist],
  );

  const update = useCallback(
    (patch: Partial<PrinterDashboardSettings>) => persist({ ...dashboard, ...patch }),
    [dashboard, persist],
  );

  return { dashboard, ready, setLayout, toggleCollapse, update };
};
