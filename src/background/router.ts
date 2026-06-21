/**
 * @fileoverview Wires the background worker's two message channels to the
 * {@link PrinterManager} and settings persistence:
 * - the streaming port (snapshots / logs / printer-list changes), and
 * - request/response commands & queries.
 */
import {
  type BackgroundRequest,
  type BackgroundResponse,
  PortRequestType,
  RequestType,
  STREAM_PORT,
  StreamEventType,
  type StreamEvent,
  isBackgroundRequest,
  isPortRequest,
} from '@/core/messaging/protocol';
import type { PrinterConfig } from '@/core/printers/printerConfig';
import { loadPrinters, savePrinters } from '@/core/settings/SettingsStore';
import { log } from '@/core/util/log';
import type { PrinterManager } from './PrinterManager';

export class MessageRouter {
  private readonly ports = new Set<chrome.runtime.Port>();
  private readonly activePrinter = new Map<chrome.runtime.Port, string | undefined>();

  constructor(private readonly manager: PrinterManager) {}

  /** Register chrome listeners and start forwarding manager events to ports. */
  start(): void {
    this.manager.onSnapshot((snapshot) =>
      this.broadcast({ type: StreamEventType.SNAPSHOT, snapshot }),
    );
    this.manager.onLog((printerId, line) =>
      this.broadcast({ type: StreamEventType.GCODE_LOG, printerId, line }),
    );

    chrome.runtime.onConnect.addListener((port) => this.handleConnect(port));
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      // The listener must return `true` synchronously to keep the channel open;
      // the actual work runs in a fire-and-forget async closure.
      if (!isBackgroundRequest(message)) {
        log.warn('Ignoring unrecognized request message:', message);
        sendResponse({ ok: false, error: 'Unrecognized request' } satisfies BackgroundResponse);
        return false;
      }
      void (async () => {
        try {
          const data = await this.handleRequest(message);
          sendResponse({ ok: true, data } satisfies BackgroundResponse);
        } catch (err) {
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          } satisfies BackgroundResponse);
        }
      })();
      return true;
    });
  }

  // --- streaming port -------------------------------------------------------

  private handleConnect(port: chrome.runtime.Port): void {
    if (port.name !== STREAM_PORT) return;
    this.ports.add(port);
    port.onMessage.addListener((message) => {
      if (!isPortRequest(message)) {
        log.warn('Ignoring unrecognized port message:', message);
        return;
      }
      if (message.type === PortRequestType.SUBSCRIBE) {
        this.activePrinter.set(port, message.printerId);
        void this.sendInit(port, message.printerId);
      }
    });
    port.onDisconnect.addListener(() => {
      this.ports.delete(port);
      this.activePrinter.delete(port);
    });
  }

  private async sendInit(port: chrome.runtime.Port, activePrinterId?: string): Promise<void> {
    const printers = await loadPrinters();
    this.post(port, {
      type: StreamEventType.INIT,
      printers,
      activePrinterId,
      snapshots: this.manager.getAllSnapshots(),
      history: activePrinterId ? this.manager.getHistory(activePrinterId) : {},
    });
  }

  private broadcast(event: StreamEvent): void {
    for (const port of this.ports) this.post(port, event);
  }

  private post(port: chrome.runtime.Port, event: StreamEvent): void {
    try {
      port.postMessage(event);
    } catch {
      // Port closed between checks; drop it.
      this.ports.delete(port);
      this.activePrinter.delete(port);
    }
  }

  private async broadcastPrinters(): Promise<void> {
    const printers = await loadPrinters();
    this.broadcast({ type: StreamEventType.PRINTERS_CHANGED, printers });
  }

  // --- request/response -----------------------------------------------------

  private async handleRequest(request: BackgroundRequest): Promise<unknown> {
    switch (request.type) {
      case RequestType.GET_PRINTERS:
        return loadPrinters();
      case RequestType.SAVE_PRINTER:
        return this.savePrinter(request.printer);
      case RequestType.DELETE_PRINTER:
        return this.deletePrinter(request.printerId);

      case RequestType.SEND_GCODE:
        return this.manager.getDriver(request.printerId).sendGcode(request.script);
      case RequestType.RUN_MACRO:
        return this.manager.getDriver(request.printerId).runMacro(request.name, request.params);
      case RequestType.SET_HEATER:
        return this.manager
          .getDriver(request.printerId)
          .setHeaterTarget(request.heater, request.target);
      case RequestType.SET_FAN:
        return this.manager.getDriver(request.printerId).setFanSpeed(request.fan, request.value);
      case RequestType.SET_LIMITS:
        return this.manager.getDriver(request.printerId).setLimits(request.limits);
      case RequestType.HOME:
        return this.manager.getDriver(request.printerId).home(request.axes);
      case RequestType.ADJUST_Z:
        return this.manager.getDriver(request.printerId).adjustZOffset(request.deltaMm);
      case RequestType.PRINT_ACTION:
        return this.manager.getDriver(request.printerId).printAction(request.action);
      case RequestType.START_PRINT:
        return this.manager.getDriver(request.printerId).startPrint(request.filename);
      case RequestType.EMERGENCY_STOP:
        return this.manager.getDriver(request.printerId).emergencyStop();
      case RequestType.RESTART:
        return this.manager.getDriver(request.printerId).restart(request.target);

      case RequestType.GET_HISTORY:
        return this.manager.getDriver(request.printerId).getHistory(request.options);
      case RequestType.GET_HISTORY_TOTALS:
        return this.manager.getDriver(request.printerId).getHistoryTotals();
      case RequestType.GET_JOB_QUEUE:
        return this.manager.getDriver(request.printerId).getJobQueue();
      case RequestType.GET_SYSTEM_INFO:
        return this.manager.getDriver(request.printerId).getSystemInfo();
      case RequestType.GET_CONSOLE_BACKLOG:
        return this.manager.getDriver(request.printerId).getConsoleBacklog(request.count);
      case RequestType.LIST_FILES:
        return this.manager.getDriver(request.printerId).listGcodeFiles();
      case RequestType.GET_GCODE_METADATA:
        return this.manager.getDriver(request.printerId).getGcodeMetadata();
      case RequestType.DELETE_FILE:
        return this.manager.getDriver(request.printerId).deleteGcodeFile(request.path);
      case RequestType.MOVE_FILE:
        return this.manager
          .getDriver(request.printerId)
          .moveGcodeFile(request.source, request.dest);
      case RequestType.GET_SLICER_SETTINGS:
        return this.manager.getDriver(request.printerId).getSlicerSettings(request.path);
      case RequestType.DOWNLOAD_FILE: {
        const url = this.manager.getDriver(request.printerId).getFileDownloadUrl(request.path);
        const filename = request.path.slice(request.path.lastIndexOf('/') + 1);
        return chrome.downloads.download({ url, filename });
      }

      case RequestType.PRINTER_GET_SETTINGS:
        return this.manager.getDriver(request.printerId).readStoredSettings(request.key);
      case RequestType.PRINTER_SET_SETTINGS:
        return this.manager
          .getDriver(request.printerId)
          .writeStoredSettings(request.key, request.value);

      default: {
        const exhaustive: never = request;
        throw new Error(`Unhandled request: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  private async savePrinter(printer: PrinterConfig): Promise<PrinterConfig[]> {
    const printers = await loadPrinters();
    const index = printers.findIndex((p) => p.id === printer.id);
    if (index >= 0) printers[index] = printer;
    else printers.push(printer);
    await savePrinters(printers);
    this.manager.reconfigure(printers);
    await this.broadcastPrinters();
    return printers;
  }

  private async deletePrinter(printerId: string): Promise<PrinterConfig[]> {
    const printers = (await loadPrinters()).filter((p) => p.id !== printerId);
    await savePrinters(printers);
    this.manager.reconfigure(printers);
    await this.broadcastPrinters();
    return printers;
  }
}
