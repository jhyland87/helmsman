/**
 * @fileoverview Typed message contract between the UI contexts (popup, options)
 * and the background service worker.
 *
 * Two channels:
 * - **Stream** (long-lived `chrome.runtime.Port`): the UI subscribes and
 *   receives an {@link InitEvent} then a stream of snapshot/log/config events.
 * - **Request/response** (`chrome.runtime.sendMessage`): one-shot commands and
 *   queries returning a {@link BackgroundResponse}.
 */
import type { HistoryListOptions } from '@jhyland87/moonraker-client';

import type { GcodeLogLine, PrintAction, RestartTarget } from '@/core/drivers/PrinterDriver';
import type { PrinterSnapshot, TemperatureHistory, LimitsSnapshot } from '@/core/model/PrinterSnapshot';
import type { PrinterConfig } from '@/core/printers/printerConfig';

/** Name used for the streaming port. */
export const STREAM_PORT = 'helmsman-stream';

// --- Stream: UI → background ------------------------------------------------

export enum PortRequestType {
  /** Subscribe to events and (re)seed for a specific active printer. */
  SUBSCRIBE = 'subscribe',
}

export interface SubscribeRequest {
  readonly type: PortRequestType.SUBSCRIBE;
  /** Printer to receive history for; omit to just get the printers list. */
  readonly printerId?: string;
}

export type PortRequest = SubscribeRequest;

// --- Stream: background → UI ------------------------------------------------

export enum StreamEventType {
  INIT = 'init',
  SNAPSHOT = 'snapshot',
  GCODE_LOG = 'gcode_log',
  PRINTERS_CHANGED = 'printers_changed',
}

export interface InitEvent {
  readonly type: StreamEventType.INIT;
  readonly printers: readonly PrinterConfig[];
  readonly activePrinterId?: string;
  /** Latest snapshot for every configured printer, keyed by id. */
  readonly snapshots: Readonly<Record<string, PrinterSnapshot>>;
  /** Temperature history for the active printer only. */
  readonly history: TemperatureHistory;
}

export interface SnapshotEvent {
  readonly type: StreamEventType.SNAPSHOT;
  readonly snapshot: PrinterSnapshot;
}

export interface GcodeLogEvent {
  readonly type: StreamEventType.GCODE_LOG;
  readonly printerId: string;
  readonly line: GcodeLogLine;
}

export interface PrintersChangedEvent {
  readonly type: StreamEventType.PRINTERS_CHANGED;
  readonly printers: readonly PrinterConfig[];
}

export type StreamEvent = InitEvent | SnapshotEvent | GcodeLogEvent | PrintersChangedEvent;

// --- Request/response: commands & queries -----------------------------------

export enum RequestType {
  // commands (printer side effects)
  SEND_GCODE = 'send_gcode',
  RUN_MACRO = 'run_macro',
  SET_HEATER = 'set_heater',
  SET_FAN = 'set_fan',
  SET_LIMITS = 'set_limits',
  HOME = 'home',
  ADJUST_Z = 'adjust_z',
  PRINT_ACTION = 'print_action',
  START_PRINT = 'start_print',
  EMERGENCY_STOP = 'emergency_stop',
  RESTART = 'restart',
  // queries
  GET_HISTORY = 'get_history',
  GET_HISTORY_TOTALS = 'get_history_totals',
  GET_JOB_QUEUE = 'get_job_queue',
  GET_SYSTEM_INFO = 'get_system_info',
  GET_CONSOLE_BACKLOG = 'get_console_backlog',
  LIST_FILES = 'list_files',
  GET_GCODE_METADATA = 'get_gcode_metadata',
  DELETE_FILE = 'delete_file',
  MOVE_FILE = 'move_file',
  DOWNLOAD_FILE = 'download_file',
  GET_SLICER_SETTINGS = 'get_slicer_settings',
  // per-printer remote settings (Moonraker database)
  PRINTER_GET_SETTINGS = 'printer_get_settings',
  PRINTER_SET_SETTINGS = 'printer_set_settings',
  // printer-config CRUD (handled in the background, persisted to settings)
  GET_PRINTERS = 'get_printers',
  SAVE_PRINTER = 'save_printer',
  DELETE_PRINTER = 'delete_printer',
}

interface ForPrinter {
  readonly printerId: string;
}

export type BackgroundRequest =
  | ({ type: RequestType.SEND_GCODE; script: string } & ForPrinter)
  | ({ type: RequestType.RUN_MACRO; name: string; params?: Record<string, string | number> } & ForPrinter)
  | ({ type: RequestType.SET_HEATER; heater: string; target: number } & ForPrinter)
  | ({ type: RequestType.SET_FAN; fan: string; value: number } & ForPrinter)
  | ({ type: RequestType.SET_LIMITS; limits: LimitsSnapshot } & ForPrinter)
  | ({ type: RequestType.HOME; axes?: readonly string[] } & ForPrinter)
  | ({ type: RequestType.ADJUST_Z; deltaMm: number } & ForPrinter)
  | ({ type: RequestType.PRINT_ACTION; action: PrintAction } & ForPrinter)
  | ({ type: RequestType.START_PRINT; filename: string } & ForPrinter)
  | ({ type: RequestType.EMERGENCY_STOP } & ForPrinter)
  | ({ type: RequestType.RESTART; target: RestartTarget } & ForPrinter)
  | ({ type: RequestType.GET_HISTORY; options?: HistoryListOptions } & ForPrinter)
  | ({ type: RequestType.GET_HISTORY_TOTALS } & ForPrinter)
  | ({ type: RequestType.GET_JOB_QUEUE } & ForPrinter)
  | ({ type: RequestType.GET_SYSTEM_INFO } & ForPrinter)
  | ({ type: RequestType.GET_CONSOLE_BACKLOG; count?: number } & ForPrinter)
  | ({ type: RequestType.LIST_FILES } & ForPrinter)
  | ({ type: RequestType.GET_GCODE_METADATA } & ForPrinter)
  | ({ type: RequestType.DELETE_FILE; path: string } & ForPrinter)
  | ({ type: RequestType.MOVE_FILE; source: string; dest: string } & ForPrinter)
  | ({ type: RequestType.DOWNLOAD_FILE; path: string } & ForPrinter)
  | ({ type: RequestType.GET_SLICER_SETTINGS; path: string } & ForPrinter)
  | ({ type: RequestType.PRINTER_GET_SETTINGS; key: string } & ForPrinter)
  | ({ type: RequestType.PRINTER_SET_SETTINGS; key: string; value: unknown } & ForPrinter)
  | { type: RequestType.GET_PRINTERS }
  | { type: RequestType.SAVE_PRINTER; printer: PrinterConfig }
  | { type: RequestType.DELETE_PRINTER; printerId: string };

/** Uniform response wrapper for {@link BackgroundRequest}. */
export type BackgroundResponse<T = unknown> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string };

// --- runtime guards for the message boundaries ------------------------------

const REQUEST_TYPES = new Set<string>(Object.values(RequestType));
const STREAM_EVENT_TYPES = new Set<string>(Object.values(StreamEventType));
const PORT_REQUEST_TYPES = new Set<string>(Object.values(PortRequestType));

/** Does `value` have a string `type` field in the given allow-set? */
const hasTypeIn = (value: unknown, allowed: ReadonlySet<string>): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  typeof value.type === 'string' &&
  allowed.has(value.type);

/** Type guard for an inbound {@link BackgroundRequest}. */
export const isBackgroundRequest = (value: unknown): value is BackgroundRequest =>
  hasTypeIn(value, REQUEST_TYPES);

/** Type guard for an inbound {@link StreamEvent}. */
export const isStreamEvent = (value: unknown): value is StreamEvent =>
  hasTypeIn(value, STREAM_EVENT_TYPES);

/** Type guard for an inbound {@link PortRequest}. */
export const isPortRequest = (value: unknown): value is PortRequest =>
  hasTypeIn(value, PORT_REQUEST_TYPES);
