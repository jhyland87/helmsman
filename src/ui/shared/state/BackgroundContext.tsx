/**
 * @fileoverview React context that owns the live stream from the background
 * worker: the printer list, per-printer snapshots, the active printer's
 * temperature history, and console logs.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { GcodeLogLine } from '@/core/drivers/PrinterDriver';
import { StreamConnection } from '@/core/messaging/client';
import { StreamEventType, type StreamEvent } from '@/core/messaging/protocol';
import type {
  PrinterSnapshot,
  TemperatureHistory,
  TemperatureSample,
} from '@/core/model/PrinterSnapshot';
import type { PrinterConfig } from '@/core/printers/printerConfig';

const MAX_LOG_LINES = 600;
const MAX_HISTORY_SAMPLES = 1500;

interface BackgroundContextValue {
  readonly ready: boolean;
  readonly printers: readonly PrinterConfig[];
  readonly snapshots: Readonly<Record<string, PrinterSnapshot>>;
  readonly activeSnapshot?: PrinterSnapshot;
  readonly history: TemperatureHistory;
  readonly logs: readonly GcodeLogLine[];
}

const BackgroundContext = createContext<BackgroundContextValue>({
  ready: false,
  printers: [],
  snapshots: {},
  history: {},
  logs: [],
});

const appendSample = (
  history: TemperatureHistory,
  snapshot: PrinterSnapshot,
): TemperatureHistory => {
  const next: Record<string, TemperatureSample[]> = {};
  for (const [key, samples] of Object.entries(history)) next[key] = [...samples];
  for (const source of snapshot.temperatures) {
    const arr = next[source.key] ?? (next[source.key] = []);
    arr.push({
      t: snapshot.updatedAt,
      temperature: source.temperature,
      target: source.target,
      power: source.power,
    });
    if (arr.length > MAX_HISTORY_SAMPLES) arr.splice(0, arr.length - MAX_HISTORY_SAMPLES);
  }
  return next;
};

export function BackgroundProvider({
  activePrinterId,
  children,
}: {
  activePrinterId?: string;
  children: ReactNode;
}): JSX.Element {
  const [ready, setReady] = useState(false);
  const [printers, setPrinters] = useState<readonly PrinterConfig[]>([]);
  const [snapshots, setSnapshots] = useState<Record<string, PrinterSnapshot>>({});
  const [history, setHistory] = useState<TemperatureHistory>({});
  const [logsByPrinter, setLogsByPrinter] = useState<Record<string, GcodeLogLine[]>>({});
  const connectionRef = useRef<StreamConnection | undefined>(undefined);
  const activeRef = useRef<string | undefined>(activePrinterId);
  activeRef.current = activePrinterId;

  useEffect(() => {
    const connection = new StreamConnection();
    connectionRef.current = connection;

    const handle = (event: StreamEvent): void => {
      switch (event.type) {
        case StreamEventType.INIT:
          setPrinters(event.printers);
          setSnapshots((prev) => ({ ...prev, ...event.snapshots }));
          setHistory(event.history);
          setReady(true);
          return;
        case StreamEventType.SNAPSHOT: {
          const { snapshot } = event;
          setSnapshots((prev) => ({ ...prev, [snapshot.printerId]: snapshot }));
          if (snapshot.printerId === activeRef.current) {
            setHistory((prev) => appendSample(prev, snapshot));
          }
          return;
        }
        case StreamEventType.GCODE_LOG:
          setLogsByPrinter((prev) => {
            const existing = prev[event.printerId] ?? [];
            const updated = [...existing, event.line];
            if (updated.length > MAX_LOG_LINES) {
              updated.splice(0, updated.length - MAX_LOG_LINES);
            }
            return { ...prev, [event.printerId]: updated };
          });
          return;
        case StreamEventType.PRINTERS_CHANGED:
          setPrinters(event.printers);
          return;
        default:
          return;
      }
    };

    const unsubscribe = connection.onEvent(handle);
    connection.connect();
    return () => {
      unsubscribe();
      connection.disconnect();
    };
  }, []);

  // Re-seed history whenever the active printer changes.
  useEffect(() => {
    setHistory({});
    connectionRef.current?.setActivePrinter(activePrinterId);
  }, [activePrinterId]);

  const value = useMemo<BackgroundContextValue>(() => {
    const activeSnapshot = activePrinterId ? snapshots[activePrinterId] : undefined;
    const logs = activePrinterId ? (logsByPrinter[activePrinterId] ?? []) : [];
    return { ready, printers, snapshots, activeSnapshot, history, logs };
  }, [ready, printers, snapshots, history, logsByPrinter, activePrinterId]);

  return <BackgroundContext.Provider value={value}>{children}</BackgroundContext.Provider>;
}

export const useBackground = (): BackgroundContextValue => useContext(BackgroundContext);
