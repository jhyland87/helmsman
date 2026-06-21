/**
 * @fileoverview The backend-agnostic printer driver contract.
 *
 * A driver owns one live connection to one printer and translates between
 * Helmsman's normalized model ({@link PrinterSnapshot}) and a specific backend
 * API. Adding support for a new firmware/host (e.g. OctoPrint) means writing one
 * class that implements this interface and registering a factory in
 * `registry.ts` — nothing in the UI or background router needs to change.
 */
import type {
  FileEntry,
  GcodeMetadataMap,
  HistoryListOptions,
  HistoryListResult,
  HistoryTotalsResult,
  JobQueueStatus,
  MachineSystemInfo,
} from '@jhyland87/moonraker-client';

import type { PrinterConfig } from '@/core/printers/printerConfig';
import type { SlicerSettings } from '@/core/slicer/SlicerSettingsParser';
import type {
  LimitsSnapshot,
  PrinterSnapshot,
  TemperatureHistory,
} from '@/core/model/PrinterSnapshot';

/** Print lifecycle actions a driver must support. */
export enum PrintAction {
  PAUSE = 'pause',
  RESUME = 'resume',
  CANCEL = 'cancel',
}

/** Restart targets. */
export enum RestartTarget {
  FIRMWARE = 'firmware',
  KLIPPY = 'klippy',
  SERVER = 'server',
  HOST = 'host',
}

/** Origin of a console line. */
export enum LogLineType {
  COMMAND = 'command',
  RESPONSE = 'response',
}

/** A single console line from the printer. */
export interface GcodeLogLine {
  /** ms epoch. */
  readonly t: number;
  readonly message: string;
  readonly type: LogLineType;
}

/** Unsubscribe handle returned by the driver's `on*` registrations. */
export type Unsubscribe = () => void;

/**
 * One live connection to one printer. Implementations should be safe to
 * construct cheaply and only open the network connection on {@link connect}.
 */
export interface PrinterDriver {
  readonly config: PrinterConfig;

  // --- lifecycle ---
  connect(): void;
  disconnect(): void;
  /**
   * Apply an updated config in place for changes that don't require a
   * reconnect (e.g. webcam URL, display name, color). Endpoint/auth changes are
   * handled by the manager recreating the driver instead.
   */
  updateConfig(config: PrinterConfig): void;
  /** Latest known snapshot (never null; disconnected before first data). */
  getSnapshot(): PrinterSnapshot;
  /** Buffered temperature history for charting. */
  getTemperatureHistory(): TemperatureHistory;

  // --- subscriptions ---
  onSnapshot(listener: (snapshot: PrinterSnapshot) => void): Unsubscribe;
  onGcodeLog(listener: (line: GcodeLogLine) => void): Unsubscribe;

  // --- commands (side effects on the printer) ---
  sendGcode(script: string): Promise<void>;
  runMacro(name: string, params?: Record<string, string | number>): Promise<void>;
  setHeaterTarget(key: string, target: number): Promise<void>;
  setFanSpeed(key: string, value: number): Promise<void>;
  setLimits(limits: LimitsSnapshot): Promise<void>;
  home(axes?: readonly string[]): Promise<void>;
  adjustZOffset(deltaMm: number): Promise<void>;
  printAction(action: PrintAction): Promise<void>;
  startPrint(filename: string): Promise<void>;
  emergencyStop(): Promise<void>;
  restart(target: RestartTarget): Promise<void>;

  // --- queries (for full-page views) ---
  getHistory(options?: HistoryListOptions): Promise<HistoryListResult>;
  getHistoryTotals(): Promise<HistoryTotalsResult>;
  getJobQueue(): Promise<JobQueueStatus>;
  getSystemInfo(): Promise<MachineSystemInfo>;
  /**
   * Recent buffered console lines (commands + responses) for a console view.
   * @param count - Max entries to return; omit for the printer's full store.
   */
  getConsoleBacklog(count?: number): Promise<readonly GcodeLogLine[]>;
  /** Flat list of g-code files (the file browser builds a tree from the paths). */
  listGcodeFiles(): Promise<readonly FileEntry[]>;
  /** Bulk g-code metadata map (keyed by filename) for the file browser columns. */
  getGcodeMetadata(): Promise<GcodeMetadataMap>;
  /** Delete a g-code file by its gcodes-relative path. */
  deleteGcodeFile(path: string): Promise<void>;
  /** Move/rename a g-code file (both paths gcodes-relative). */
  moveGcodeFile(source: string, dest: string): Promise<void>;
  /** Absolute HTTP URL for downloading a g-code file. */
  getFileDownloadUrl(path: string): string;
  /** Parse slicer settings embedded in a g-code file (gcodes-relative path). */
  getSlicerSettings(path: string): Promise<SlicerSettings>;

  // --- per-printer settings storage (e.g. Moonraker DB) ---
  /** Read a JSON value from the printer's own settings store, if supported. */
  readStoredSettings<T>(key: string): Promise<T | undefined>;
  /** Write a JSON value to the printer's own settings store, if supported. */
  writeStoredSettings<T>(key: string, value: T): Promise<void>;
  /** True when this driver can persist settings on the printer itself. */
  readonly supportsRemoteSettings: boolean;
}
