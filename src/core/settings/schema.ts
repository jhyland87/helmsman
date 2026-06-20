/**
 * @fileoverview Settings schema + defaults.
 *
 * Two scopes:
 * - {@link AppSettings} — global, browser-wide (theme, language, storage mode).
 * - {@link PrinterDashboardSettings} — per-printer dashboard layout, console
 *   history, and chart legend state. Mirrors how Mainsail/Fluidd persist their
 *   per-printer UI state (see dev/fluidd.json) so it can live in the Moonraker
 *   database and follow the printer across devices.
 */

/** Canonical panel identifiers. The UI panel registry maps these to components. */
export enum PanelId {
  PRINTER_STATUS = 'printer-status',
  TEMPERATURE = 'temperature',
  CONSOLE = 'console',
  MACROS = 'macros',
  FANS = 'fans',
  TOOLHEAD = 'toolhead',
  LIMITS = 'limits',
  WEBCAM = 'webcam',
  PRINT_JOBS = 'print-jobs',
  PRINT_QUEUE = 'print-queue',
  BED_MESH = 'bed-mesh',
  FILES = 'files',
}

/**
 * Selectable columns for the g-code file browser. `NAME` is always shown first
 * and isn't part of this list. Order here is the default column order.
 */
export enum FileColumnId {
  FILE_SIZE = 'file-size',
  LAST_MODIFIED = 'last-modified',
  OBJECT_HEIGHT = 'object-height',
  LAYER_HEIGHT = 'layer-height',
  NOZZLE_DIAMETER = 'nozzle-diameter',
  FILAMENTS = 'filaments',
  FILAMENT_NAME = 'filament-name',
  FILAMENT_TYPE = 'filament-type',
  FILAMENT_USAGE = 'filament-usage',
  FILAMENT_WEIGHT = 'filament-weight',
  PRINT_TIME = 'print-time',
  LAST_PRINT_DURATION = 'last-print-duration',
  SLICER = 'slicer',
  EXTRUDER_TEMP = 'extruder-temp',
  BED_TEMP = 'bed-temp',
  CHAMBER_TEMP = 'chamber-temp',
  LAST_START_TIME = 'last-start-time',
  LAST_END_TIME = 'last-end-time',
  LAST_TOTAL_DURATION = 'last-total-duration',
  LAST_FILAMENT_USED = 'last-filament-used',
}

/** Sort direction for a table column. */
export type SortDirection = 'asc' | 'desc';

/** One persisted table column's visibility (order is the array position). */
export interface TableColumnState {
  readonly id: string;
  readonly enabled: boolean;
}

/** Persisted sort for a table: the sorted column id + direction. */
export interface TableSortState {
  readonly column: string;
  readonly direction: SortDirection;
}

/**
 * Persisted UI state for a reusable data table (see `DataTable`): column
 * visibility + order, and the active sort. Keyed by a stable table id.
 */
export interface TableState {
  readonly columns: readonly TableColumnState[];
  readonly sort?: TableSortState;
}

export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum FontSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

/** Where global app settings are persisted. */
export enum SettingsStorageMode {
  LOCAL = 'local',
  FILE = 'file',
}

/** Where per-printer dashboard settings are persisted. */
export enum DashboardStorageMode {
  LOCAL = 'local',
  PRINTER_DB = 'printer_db',
}

/** Global, browser-wide settings. */
export interface AppSettings {
  readonly theme: ThemeMode;
  readonly fontSize: FontSize;
  readonly language: string;
  readonly settingsStorage: SettingsStorageMode;
  readonly dashboardStorage: DashboardStorageMode;
  /** Show the active printer's webcam feed as the popup background. */
  readonly webcamBackground: boolean;
  /** Per-table UI state (column visibility/order + sort), keyed by table id. */
  readonly tables: Readonly<Record<string, TableState>>;
  /** Require a confirmation prompt before sending an emergency stop. */
  readonly confirmEmergencyStop: boolean;
  /** Require a confirmation prompt before pausing/cancelling a print. */
  readonly confirmPrintActions: boolean;
  /** Last-selected printer id. */
  readonly activePrinterId?: string;
}

/** A single dashboard card (panel) within a column. */
export interface DashboardCard {
  readonly id: PanelId;
  readonly enabled: boolean;
  readonly collapsed: boolean;
}

/** Dashboard layout: an ordered list of columns, each an ordered card list. */
export interface DashboardLayout {
  readonly columns: readonly (readonly DashboardCard[])[];
}

/** Per-printer dashboard + UI state. */
export interface PrinterDashboardSettings {
  readonly layout: DashboardLayout;
  readonly consoleHistory: readonly string[];
  /** Temperature series keys the user has hidden in the chart legend. */
  readonly hiddenTempSeries: readonly string[];
  readonly selectedWebcam?: string;
  /** The currently-maximized panel, if any (restored when the popup reopens). */
  readonly maximizedPanel?: PanelId;
}

/** Key used for per-printer settings (chrome.storage prefix + Moonraker DB key). */
export const DASHBOARD_SETTINGS_KEY = 'dashboard';

const card = (id: PanelId, collapsed = false, enabled = true): DashboardCard => ({
  id,
  enabled,
  collapsed,
});

/** Default two-column dashboard layout. */
export const defaultDashboardLayout = (): DashboardLayout => ({
  columns: [
    [
      card(PanelId.PRINTER_STATUS),
      card(PanelId.TOOLHEAD, true),
      card(PanelId.MACROS, true),
      card(PanelId.FANS, true),
      card(PanelId.LIMITS, true),
    ],
    [
      card(PanelId.TEMPERATURE),
      card(PanelId.CONSOLE),
      card(PanelId.WEBCAM, false, false),
      card(PanelId.BED_MESH, true),
      card(PanelId.FILES, true),
      card(PanelId.PRINT_JOBS, true),
      card(PanelId.PRINT_QUEUE, true, false),
    ],
  ],
});

/**
 * Reconcile a saved column list against the current set of column ids: keep the
 * saved order + visibility for ids that still exist, drop stale ids, and append
 * any new ids (enabled) so saved table state keeps working as columns change.
 */
export const reconcileTableColumns = (
  saved: readonly TableColumnState[],
  ids: readonly string[],
): TableColumnState[] => {
  const idSet = new Set(ids);
  const known = saved.filter((c) => idSet.has(c.id));
  const present = new Set(known.map((c) => c.id));
  const missing = ids.filter((id) => !present.has(id)).map((id) => ({ id, enabled: true }));
  return [...known, ...missing];
};

export const defaultAppSettings = (): AppSettings => ({
  theme: ThemeMode.SYSTEM,
  fontSize: FontSize.MEDIUM,
  language: 'en',
  settingsStorage: SettingsStorageMode.LOCAL,
  // Default to the printer's own Moonraker DB so dashboards follow the printer
  // across devices/browsers (as Mainsail/Fluidd do); falls back to local
  // storage when the DB is unavailable.
  dashboardStorage: DashboardStorageMode.PRINTER_DB,
  webcamBackground: false,
  tables: {},
  confirmEmergencyStop: true,
  confirmPrintActions: true,
});

export const defaultDashboardSettings = (): PrinterDashboardSettings => ({
  layout: defaultDashboardLayout(),
  consoleHistory: [],
  hiddenTempSeries: [],
});

/**
 * Merge a saved layout with the default so newly-added panels appear for users
 * with an existing saved layout (appended to the first column, collapsed).
 */
export const reconcileLayout = (saved: DashboardLayout): DashboardLayout => {
  const present = new Set<string>();
  for (const column of saved.columns) {
    for (const c of column) present.add(c.id);
  }
  const missing = Object.values(PanelId)
    .filter((id) => !present.has(id))
    .map((id) => card(id, true, false));
  if (missing.length === 0) return saved;
  const columns = saved.columns.map((c) => [...c]);
  const first = columns[0] ?? [];
  columns[0] = [...first, ...missing];
  return { columns };
};
