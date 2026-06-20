/**
 * @fileoverview UI-side helpers for talking to the background worker:
 * a promise-based request/response call and a reconnecting event stream.
 */
import { log } from '@/core/util/log';
import {
  type BackgroundRequest,
  type BackgroundResponse,
  PortRequestType,
  STREAM_PORT,
  type StreamEvent,
  isStreamEvent,
} from './protocol';

/**
 * Send a one-shot command/query to the background and resolve with its data,
 * rejecting on a background-reported error.
 */
export const sendRequest = async <T>(request: BackgroundRequest): Promise<T> => {
  const response = (await chrome.runtime.sendMessage(request)) as
    | BackgroundResponse<T>
    | undefined;
  if (!response) throw new Error('No response from background worker');
  if (!response.ok) throw new Error(response.error);
  return response.data;
};

const RECONNECT_DELAY_MS = 1000;

/**
 * A reconnecting subscription to the background event stream. Re-subscribes to
 * the same active printer automatically if the service worker recycles.
 */
export class StreamConnection {
  private port?: chrome.runtime.Port;
  private activePrinterId?: string;
  private closed = false;
  private readonly listeners = new Set<(event: StreamEvent) => void>();

  connect(): void {
    this.closed = false;
    this.open();
  }

  disconnect(): void {
    this.closed = true;
    this.port?.disconnect();
    this.port = undefined;
  }

  /** Select the active printer (re)seeding history; safe to call repeatedly. */
  setActivePrinter(printerId?: string): void {
    this.activePrinterId = printerId;
    this.port?.postMessage({ type: PortRequestType.SUBSCRIBE, printerId });
  }

  onEvent(listener: (event: StreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private open(): void {
    const port = chrome.runtime.connect({ name: STREAM_PORT });
    this.port = port;
    port.onMessage.addListener((message) => {
      if (!isStreamEvent(message)) {
        log.warn('Dropping unrecognized stream message from background:', message);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
    port.onDisconnect.addListener(() => {
      this.port = undefined;
      if (!this.closed) setTimeout(() => this.open(), RECONNECT_DELAY_MS);
    });
    port.postMessage({ type: PortRequestType.SUBSCRIBE, printerId: this.activePrinterId });
  }
}
