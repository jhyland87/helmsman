/**
 * @fileoverview Typed convenience wrappers over the background request channel,
 * used by panels and pages to issue commands and queries.
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

import type {
  GcodeLogLine,
  PrintAction,
  RestartTarget,
} from '@/core/drivers/PrinterDriver';
import { sendRequest } from '@/core/messaging/client';
import { RequestType } from '@/core/messaging/protocol';
import type { LimitsSnapshot } from '@/core/model/PrinterSnapshot';
import type { PrinterConfig } from '@/core/printers/printerConfig';
import type { SlicerSettings } from '@/core/slicer/SlicerSettingsParser';

export const api = {
  // printer config CRUD
  getPrinters: () => sendRequest<PrinterConfig[]>({ type: RequestType.GET_PRINTERS }),
  savePrinter: (printer: PrinterConfig) =>
    sendRequest<PrinterConfig[]>({ type: RequestType.SAVE_PRINTER, printer }),
  deletePrinter: (printerId: string) =>
    sendRequest<PrinterConfig[]>({ type: RequestType.DELETE_PRINTER, printerId }),

  // commands
  sendGcode: (printerId: string, script: string) =>
    sendRequest<void>({ type: RequestType.SEND_GCODE, printerId, script }),
  runMacro: (printerId: string, name: string, params?: Record<string, string | number>) =>
    sendRequest<void>({ type: RequestType.RUN_MACRO, printerId, name, params }),
  setHeater: (printerId: string, heater: string, target: number) =>
    sendRequest<void>({ type: RequestType.SET_HEATER, printerId, heater, target }),
  setFan: (printerId: string, fan: string, value: number) =>
    sendRequest<void>({ type: RequestType.SET_FAN, printerId, fan, value }),
  setLimits: (printerId: string, limits: LimitsSnapshot) =>
    sendRequest<void>({ type: RequestType.SET_LIMITS, printerId, limits }),
  home: (printerId: string, axes?: readonly string[]) =>
    sendRequest<void>({ type: RequestType.HOME, printerId, axes }),
  adjustZ: (printerId: string, deltaMm: number) =>
    sendRequest<void>({ type: RequestType.ADJUST_Z, printerId, deltaMm }),
  printAction: (printerId: string, action: PrintAction) =>
    sendRequest<void>({ type: RequestType.PRINT_ACTION, printerId, action }),
  startPrint: (printerId: string, filename: string) =>
    sendRequest<void>({ type: RequestType.START_PRINT, printerId, filename }),
  emergencyStop: (printerId: string) =>
    sendRequest<void>({ type: RequestType.EMERGENCY_STOP, printerId }),
  restart: (printerId: string, target: RestartTarget) =>
    sendRequest<void>({ type: RequestType.RESTART, printerId, target }),

  // queries
  getHistory: (printerId: string, options?: HistoryListOptions) =>
    sendRequest<HistoryListResult>({ type: RequestType.GET_HISTORY, printerId, options }),
  getHistoryTotals: (printerId: string) =>
    sendRequest<HistoryTotalsResult>({ type: RequestType.GET_HISTORY_TOTALS, printerId }),
  getJobQueue: (printerId: string) =>
    sendRequest<JobQueueStatus>({ type: RequestType.GET_JOB_QUEUE, printerId }),
  getSystemInfo: (printerId: string) =>
    sendRequest<MachineSystemInfo>({ type: RequestType.GET_SYSTEM_INFO, printerId }),
  getConsoleBacklog: (printerId: string, count?: number) =>
    sendRequest<readonly GcodeLogLine[]>({
      type: RequestType.GET_CONSOLE_BACKLOG,
      printerId,
      count,
    }),
  listFiles: (printerId: string) =>
    sendRequest<readonly FileEntry[]>({ type: RequestType.LIST_FILES, printerId }),
  getGcodeMetadata: (printerId: string) =>
    sendRequest<GcodeMetadataMap>({ type: RequestType.GET_GCODE_METADATA, printerId }),
  deleteFile: (printerId: string, path: string) =>
    sendRequest<void>({ type: RequestType.DELETE_FILE, printerId, path }),
  moveFile: (printerId: string, source: string, dest: string) =>
    sendRequest<void>({ type: RequestType.MOVE_FILE, printerId, source, dest }),
  downloadFile: (printerId: string, path: string) =>
    sendRequest<void>({ type: RequestType.DOWNLOAD_FILE, printerId, path }),
  getSlicerSettings: (printerId: string, path: string) =>
    sendRequest<SlicerSettings>({ type: RequestType.GET_SLICER_SETTINGS, printerId, path }),

  // per-printer remote settings (Moonraker DB)
  getPrinterSettings: <T>(printerId: string, key: string) =>
    sendRequest<T | undefined>({ type: RequestType.PRINTER_GET_SETTINGS, printerId, key }),
  setPrinterSettings: (printerId: string, key: string, value: unknown) =>
    sendRequest<void>({ type: RequestType.PRINTER_SET_SETTINGS, printerId, key, value }),
} as const;
