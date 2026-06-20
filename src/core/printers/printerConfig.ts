/**
 * @fileoverview Persisted configuration for a single printer connection.
 */

/** Backend type. Extend this union as new drivers are added. */
export type PrinterType = 'moonraker';

/** A user-configured printer. */
export interface PrinterConfig {
  /** Stable unique id (crypto.randomUUID). */
  readonly id: string;
  readonly name: string;
  readonly type: PrinterType;
  /** Hostname or IP. */
  readonly host: string;
  readonly port: number;
  /** WebSocket path; defaults to `/websocket`. */
  readonly path?: string;
  /** Use TLS (wss/https). */
  readonly secure?: boolean;
  /**
   * Moonraker API key, used to obtain the one-shot websocket token when the
   * printer's `[authorization]` component requires it. Optional — trusted
   * clients and unauthenticated setups don't need it.
   */
  readonly apiKey?: string;
  /**
   * Manual webcam stream URL (e.g. `http://host:8080/?action=stream`). Shown in
   * the Webcam panel in addition to any cameras Moonraker auto-discovers.
   */
  readonly webcamUrl?: string;
  /** Whether the background worker should connect to this printer. */
  readonly enabled: boolean;
  /** Accent color used in the UI to distinguish printers. */
  readonly color?: string;
}

/** Create a new printer config with sensible defaults. */
export const createPrinterConfig = (
  partial: Partial<PrinterConfig> & Pick<PrinterConfig, 'name' | 'host'>,
): PrinterConfig => ({
  id: partial.id ?? crypto.randomUUID(),
  name: partial.name,
  type: partial.type ?? 'moonraker',
  host: partial.host,
  port: partial.port ?? 7125,
  path: partial.path ?? '/websocket',
  secure: partial.secure ?? false,
  apiKey: partial.apiKey,
  webcamUrl: partial.webcamUrl,
  enabled: partial.enabled ?? true,
  color: partial.color,
});
