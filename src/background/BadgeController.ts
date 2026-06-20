/**
 * @fileoverview Drives the toolbar icon badge from the active printer's print
 * status.
 *
 * - Printing/paused → percent remaining, updated live as snapshots arrive.
 * - Complete/failed/cancelled → a status glyph that persists until the user
 *   opens the popup (any stream-port connect) or the state changes (e.g. a new
 *   print starts).
 *
 * The "active printer" is `settings.activePrinterId` (what the popup shows),
 * falling back to the first configured printer.
 */
import { STREAM_PORT } from '@/core/messaging/protocol';
import { PrintState, type PrinterSnapshot } from '@/core/model/PrinterSnapshot';
import {
  STORAGE_KEYS,
  loadAppSettings,
  loadPrinters,
  onStorageChanged,
} from '@/core/settings/SettingsStore';
import type { PrinterManager } from './PrinterManager';

const FINAL_STATES: ReadonlySet<PrintState> = new Set([
  PrintState.COMPLETE,
  PrintState.ERROR,
  PrintState.CANCELLED,
]);

const STATE_LABEL: Readonly<Record<PrintState, string>> = {
  [PrintState.PRINTING]: 'Printing',
  [PrintState.PAUSED]: 'Paused',
  [PrintState.COMPLETE]: 'Complete',
  [PrintState.CANCELLED]: 'Cancelled',
  [PrintState.ERROR]: 'Failed',
  [PrintState.STANDBY]: 'Standby',
  [PrintState.UNKNOWN]: 'Idle',
};

interface BadgeStyle {
  readonly text: string;
  readonly color: string;
}

const FINAL_STYLE: Readonly<Record<string, BadgeStyle>> = {
  [PrintState.COMPLETE]: { text: '✓', color: '#22c55e' },
  [PrintState.ERROR]: { text: '!', color: '#ef4444' },
  [PrintState.CANCELLED]: { text: '✕', color: '#9ca3af' },
};

export class BadgeController {
  private activePrinterId?: string;
  private printerNames = new Map<string, string>();
  /** True once the user has seen/acknowledged the current final-state badge. */
  private finalAcknowledged = false;

  constructor(private readonly manager: PrinterManager) {}

  start(): void {
    void chrome.action.setBadgeTextColor({ color: '#ffffff' });
    void this.reloadConfig();

    onStorageChanged((changes) => {
      if (changes[STORAGE_KEYS.app] || changes[STORAGE_KEYS.printers]) {
        void this.reloadConfig();
      }
    });

    this.manager.onSnapshot((snapshot) => {
      if (snapshot.printerId === this.activePrinterId) this.render(snapshot);
    });

    // Opening the popup (or options) connects the stream port — treat that as
    // acknowledging a finished print so its badge clears.
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name === STREAM_PORT) this.acknowledge();
    });
  }

  private async reloadConfig(): Promise<void> {
    const [settings, printers] = await Promise.all([loadAppSettings(), loadPrinters()]);
    this.printerNames = new Map(printers.map((p) => [p.id, p.name]));
    const next = settings.activePrinterId ?? printers[0]?.id;
    if (next !== this.activePrinterId) {
      this.activePrinterId = next;
      this.finalAcknowledged = false; // new printer context
    }
    this.renderActive();
  }

  private renderActive(): void {
    if (!this.activePrinterId) {
      this.clear();
      return;
    }
    this.render(this.manager.getSnapshot(this.activePrinterId));
  }

  private acknowledge(): void {
    this.finalAcknowledged = true;
    this.renderActive();
  }

  private render(snapshot: PrinterSnapshot): void {
    const job = snapshot.job;
    const state = job?.state;

    if (state && FINAL_STATES.has(state)) {
      if (this.finalAcknowledged) {
        this.clear();
        return;
      }
      this.apply(FINAL_STYLE[state] ?? { text: '', color: '#000' }, this.title(snapshot, state));
      return;
    }

    // Any non-final state means new activity — let the next final badge show.
    this.finalAcknowledged = false;

    if (state === PrintState.PRINTING || state === PrintState.PAUSED) {
      const done = Math.round((job?.progress ?? 0) * 100);
      this.apply(
        { text: `${done}%`, color: state === PrintState.PAUSED ? '#f59e0b' : '#2196f3' },
        this.title(snapshot, state, done),
      );
      return;
    }

    this.clear();
  }

  private title(snapshot: PrinterSnapshot, state: PrintState, done?: number): string {
    const name = this.printerNames.get(snapshot.printerId) ?? 'Printer';
    let detail = STATE_LABEL[state];
    if (done !== undefined) detail += ` — ${done}% complete`;
    return `Helmsman · ${name}: ${detail}`;
  }

  private apply(style: BadgeStyle, title: string): void {
    void chrome.action.setBadgeText({ text: style.text });
    void chrome.action.setBadgeBackgroundColor({ color: style.color });
    void chrome.action.setTitle({ title });
  }

  private clear(): void {
    void chrome.action.setBadgeText({ text: '' });
    void chrome.action.setTitle({ title: 'Helmsman' });
  }
}
