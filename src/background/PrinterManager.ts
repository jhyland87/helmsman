/**
 * @fileoverview Owns every live printer connection in the background worker.
 *
 * Creates a {@link PrinterDriver} per enabled {@link PrinterConfig}, keeps the
 * latest snapshot for each, and broadcasts snapshot/log changes to subscribers
 * (the message router). Reconfigures when the persisted printer list changes.
 */
import { createDriver } from '@/core/drivers/registry';
import type { GcodeLogLine, PrinterDriver, Unsubscribe } from '@/core/drivers/PrinterDriver';
import {
  ConnectionState,
  type PrinterSnapshot,
  type TemperatureHistory,
  emptySnapshot,
} from '@/core/model/PrinterSnapshot';
import type { PrinterConfig } from '@/core/printers/printerConfig';

interface ManagedDriver {
  readonly driver: PrinterDriver;
  snapshot: PrinterSnapshot;
  readonly unsubscribers: Unsubscribe[];
}

type SnapshotListener = (snapshot: PrinterSnapshot) => void;
type LogListener = (printerId: string, line: GcodeLogLine) => void;

export class PrinterManager {
  private readonly drivers = new Map<string, ManagedDriver>();
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly logListeners = new Set<LogListener>();

  /** (Re)build drivers to match the given configs. Idempotent. */
  reconfigure(printers: readonly PrinterConfig[]): void {
    const wanted = new Map(printers.filter((p) => p.enabled).map((p) => [p.id, p]));

    // Remove drivers that are gone or whose endpoint/auth changed; otherwise
    // push the updated config in place (webcam URL, name, color — no reconnect).
    for (const [id, managed] of this.drivers) {
      const next = wanted.get(id);
      if (!next || !this.sameEndpoint(managed.driver.config, next)) {
        this.teardown(id);
      } else {
        managed.driver.updateConfig(next);
      }
    }

    // Add drivers for newly-wanted printers.
    for (const [id, config] of wanted) {
      if (this.drivers.has(id)) continue;
      this.spawn(config);
    }
  }

  getSnapshot(printerId: string): PrinterSnapshot {
    return this.drivers.get(printerId)?.snapshot ?? emptySnapshot(printerId);
  }

  getAllSnapshots(): Record<string, PrinterSnapshot> {
    const out: Record<string, PrinterSnapshot> = {};
    for (const [id, managed] of this.drivers) out[id] = managed.snapshot;
    return out;
  }

  getHistory(printerId: string): TemperatureHistory {
    return this.drivers.get(printerId)?.driver.getTemperatureHistory() ?? {};
  }

  /** Get a connected driver, throwing a clear error if absent. */
  getDriver(printerId: string): PrinterDriver {
    const managed = this.drivers.get(printerId);
    if (!managed) throw new Error(`Printer ${printerId} is not connected`);
    return managed.driver;
  }

  onSnapshot(listener: SnapshotListener): Unsubscribe {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onLog(listener: LogListener): Unsubscribe {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  /** Reconnect any drivers that have dropped (called by the alarm watchdog). */
  reviveDropped(): void {
    for (const managed of this.drivers.values()) {
      const state = managed.snapshot.connection;
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.ERROR) {
        managed.driver.connect();
      }
    }
  }

  dispose(): void {
    for (const id of [...this.drivers.keys()]) this.teardown(id);
  }

  // --- internals ------------------------------------------------------------

  private spawn(config: PrinterConfig): void {
    const driver = createDriver(config);
    const managed: ManagedDriver = {
      driver,
      snapshot: emptySnapshot(config.id),
      unsubscribers: [],
    };
    managed.unsubscribers.push(
      driver.onSnapshot((snapshot) => {
        managed.snapshot = snapshot;
        for (const listener of this.snapshotListeners) listener(snapshot);
      }),
    );
    managed.unsubscribers.push(
      driver.onGcodeLog((line) => {
        for (const listener of this.logListeners) listener(config.id, line);
      }),
    );
    this.drivers.set(config.id, managed);
    driver.connect();
  }

  private teardown(id: string): void {
    const managed = this.drivers.get(id);
    if (!managed) return;
    for (const unsub of managed.unsubscribers) unsub();
    managed.driver.disconnect();
    this.drivers.delete(id);
  }

  private sameEndpoint(a: PrinterConfig, b: PrinterConfig): boolean {
    return (
      a.type === b.type &&
      a.host === b.host &&
      a.port === b.port &&
      a.path === b.path &&
      a.secure === b.secure &&
      // apiKey affects the one-shot token fetch, so a change must reconnect.
      a.apiKey === b.apiKey
    );
  }
}
