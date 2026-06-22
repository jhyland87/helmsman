/**
 * @fileoverview Moonraker implementation of {@link PrinterDriver}.
 *
 * Owns one {@link MoonrakerClient}, accumulates the printer's status from
 * subscription deltas, maintains a temperature-history ring buffer, and emits
 * normalized {@link PrinterSnapshot}s. Auto-reconnects on unexpected drops.
 */
import {
  MoonrakerClient,
  type FileEntry,
  type GcodeMetadataMap,
  type GcodeThumbnail,
  type HistoryListOptions,
  type HistoryListResult,
  type HistoryTotalsResult,
  type JobQueueStatus,
  type MachineSystemInfo,
  type PrinterStatus,
  type SubscribeResult,
  type TemperatureStore,
} from '@jhyland87/moonraker-client';

import {
  ConnectionState,
  type PrinterCapabilities,
  type PrinterSnapshot,
  type TemperatureHistory,
  TemperatureKind,
  type TemperatureSample,
  emptySnapshot,
} from '@/core/model/PrinterSnapshot';
import type { PrinterConfig } from '@/core/printers/printerConfig';
import {
  SlicerSettingsParser,
  type SlicerSettings,
} from '@/core/slicer/SlicerSettingsParser';
import { log } from '@/core/util/log';
import {
  LogLineType,
  PrintAction,
  type GcodeLogLine,
  type PrinterDriver,
  RestartTarget,
  type Unsubscribe,
} from '@/core/drivers/PrinterDriver';
import {
  buildSubscriptionSpec,
  extractMacros,
  mapBedMesh,
  mapFans,
  mapJob,
  mapKlippyState,
  mapLimits,
  mapHeaters,
  mapSystemStats,
  mapTemperatureSources,
  mapToolhead,
} from './objects';
import type {
  LimitsSnapshot,
  MacroSnapshot,
  WebcamRef,
} from '@/core/model/PrinterSnapshot';

const MAX_HISTORY_SAMPLES = 1500;
const RECONNECT_DELAY_MS = 5000;

/**
 * Shown when the one-shot token authenticated (HTTP works) but the websocket
 * never opened — almost always Moonraker's Tornado `check_origin` returning 403
 * for the extension's `chrome-extension://…` Origin.
 */
const CORS_HINT =
  'Authorized over HTTP, but the printer refused the websocket (likely HTTP 403 / ' +
  'cross-origin). Add `chrome-extension://*` to `cors_domains` in Moonraker’s ' +
  '[authorization] config, then restart Moonraker.';

/** Mutable accumulator for Moonraker's status objects. */
type StatusAccumulator = Record<string, Record<string, unknown>>;

/**
 * Convert an image `Response` to a `data:` URL. Runs in the service worker
 * (no `FileReader`), so it base64-encodes the bytes in chunks via `btoa`.
 */
const responseToDataUrl = async (res: Response): Promise<string> => {
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const mime = res.headers.get('content-type') ?? 'image/png';
  return `data:${mime};base64,${btoa(binary)}`;
};

export class MoonrakerDriver implements PrinterDriver {
  readonly supportsRemoteSettings = true;

  private client?: MoonrakerClient;
  private status: StatusAccumulator = {};
  private objectNames: readonly string[] = [];
  private macros: readonly MacroSnapshot[] = [];
  private readonly history = new Map<string, TemperatureSample[]>();
  private connection = ConnectionState.DISCONNECTED;
  private connectionMessage?: string;
  private snapshot: PrinterSnapshot;
  private intentionalDisconnect = false;
  /** True once the current connection's websocket has opened at least once. */
  private everOpened = false;
  /** Filename whose file info (thumbnail + estimate + layers) is cached below. */
  private thumbnailFilename?: string;
  private thumbnailDataUrl?: string;
  private fileEstimatedTime?: number;
  private fileLayerCount?: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly snapshotListeners = new Set<(s: PrinterSnapshot) => void>();
  private readonly logListeners = new Set<(l: GcodeLogLine) => void>();

  /** Mutable so non-endpoint config changes (webcam, name, color) apply live. */
  config: PrinterConfig;

  constructor(config: PrinterConfig) {
    this.config = config;
    this.snapshot = emptySnapshot(config.id);
  }

  // --- lifecycle ------------------------------------------------------------

  updateConfig(config: PrinterConfig): void {
    this.config = config;
    // Re-emit so config-derived fields (e.g. the manual webcam) refresh.
    this.recomputeAndEmit();
  }

  connect(): void {
    if (this.client) return;
    this.intentionalDisconnect = false;
    this.everOpened = false;
    this.setConnection(ConnectionState.CONNECTING);
    const client = new MoonrakerClient({
      API: {
        connection: {
          server: this.config.host,
          port: this.config.port,
          path: this.config.path,
          secure: this.config.secure,
          apiKey: this.config.apiKey,
          // Fetch a one-shot token before connecting (Moonraker [authorization]);
          // the client falls back to a tokenless connection when not required.
          oneshotToken: true,
        },
      },
    });
    this.client = client;
    client.on('open', () => void this.onOpen());
    client.on('close', (_code, reason) => this.onClose(reason));
    client.on('error', (err) => this.onError(err));
    client.on('notify:status_update', (status) => this.onStatusUpdate(status));
    client.on('notify:gcode_response', (message) =>
      this.emitLog(message, LogLineType.RESPONSE),
    );
    client.on('notify:proc_stat_update', (stats) => this.onProcStats(stats));
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearReconnect();
    this.client?.close();
    this.client = undefined;
    this.setConnection(ConnectionState.DISCONNECTED);
  }

  getSnapshot(): PrinterSnapshot {
    return this.snapshot;
  }

  getTemperatureHistory(): TemperatureHistory {
    const out: Record<string, readonly TemperatureSample[]> = {};
    for (const [key, samples] of this.history) out[key] = samples;
    return out;
  }

  onSnapshot(listener: (s: PrinterSnapshot) => void): Unsubscribe {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  onGcodeLog(listener: (l: GcodeLogLine) => void): Unsubscribe {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  // --- connection event handlers --------------------------------------------

  private async onOpen(): Promise<void> {
    const client = this.client;
    if (!client) return;
    this.everOpened = true;
    try {
      const { objects } = await client.getObjectsList();
      this.objectNames = objects;
      this.macros = extractMacros(objects);

      await this.safe(async () => {
        // One-shot read of the static config so heater min/max temps are
        // available to mapHeaters (configfile.config.<heater>.min_temp/max_temp).
        const { status } = await client.queryObjects({ configfile: ['config'] });
        this.mergeStatus(status);
      });
      await this.safe(async () => {
        const store = await client.getTemperatureStore();
        this.seedHistory(store);
      });

      const initial: SubscribeResult = await client.subscribe(
        buildSubscriptionSpec(objects),
      );
      this.mergeStatus(initial.status);
      this.setConnection(ConnectionState.CONNECTED);
      this.recomputeAndEmit();

      await this.safe(async () => {
        this.cachedSystem = mapSystemStats(await client.getProcStats());
        this.recomputeAndEmit();
      });
    } catch (err) {
      this.onError(err);
    }
  }

  private onClose(reason?: string): void {
    const message = this.diagnoseFailure(reason);
    this.client = undefined;
    this.setConnection(ConnectionState.DISCONNECTED, message);
    if (!this.intentionalDisconnect) this.scheduleReconnect();
  }

  private onError(err: unknown): void {
    const reason = err instanceof Error ? err.message : String(err);
    this.setConnection(ConnectionState.ERROR, this.diagnoseFailure(reason));
    if (!this.intentionalDisconnect) this.scheduleReconnect();
  }

  /**
   * Pick the most useful connection message for a failure. When the one-shot
   * token authenticated but the socket never opened, the cause is almost
   * certainly Moonraker's origin (CORS) check → surface the actionable hint;
   * otherwise pass through the raw reason.
   */
  private diagnoseFailure(reason?: string): string | undefined {
    if (!this.everOpened && this.client?.tokenObtained) {
      log.warn(`[${this.config.name}] ${CORS_HINT}`);
      return CORS_HINT;
    }
    return reason;
  }

  private onStatusUpdate(delta: PrinterStatus): void {
    this.mergeStatus(delta);
    this.appendHistory(Date.now());
    this.recomputeAndEmit();
  }

  private onProcStats(stats: Record<string, unknown>): void {
    this.cachedSystem = mapSystemStats(stats);
    this.recomputeAndEmit();
  }

  // --- commands -------------------------------------------------------------

  async sendGcode(script: string): Promise<void> {
    this.emitLog(script, LogLineType.COMMAND);
    await this.requireClient().runGcode(script);
  }

  async runMacro(name: string, params?: Record<string, string | number>): Promise<void> {
    this.emitLog(name, LogLineType.COMMAND);
    await this.requireClient().runMacro(name, params);
  }

  async setHeaterTarget(key: string, target: number): Promise<void> {
    await this.requireClient().setHeaterTemperature(key, target);
  }

  async setFanSpeed(key: string, value: number): Promise<void> {
    await this.requireClient().setFanSpeed(key, value);
  }

  async setLimits(limits: LimitsSnapshot): Promise<void> {
    await this.requireClient().setVelocityLimits(limits);
  }

  async home(axes?: readonly string[]): Promise<void> {
    await this.requireClient().home(axes);
  }

  async adjustZOffset(deltaMm: number): Promise<void> {
    await this.requireClient().adjustGcodeOffsetZ(deltaMm);
  }

  async printAction(action: PrintAction): Promise<void> {
    const client = this.requireClient();
    switch (action) {
      case PrintAction.PAUSE:
        await client.pausePrint();
        return;
      case PrintAction.RESUME:
        await client.resumePrint();
        return;
      case PrintAction.CANCEL:
        await client.cancelPrint();
        return;
      default:
        return;
    }
  }

  async startPrint(filename: string): Promise<void> {
    await this.requireClient().startPrint(filename);
  }

  async emergencyStop(): Promise<void> {
    await this.requireClient().emergencyStop();
  }

  async restart(target: RestartTarget): Promise<void> {
    const client = this.requireClient();
    switch (target) {
      case RestartTarget.FIRMWARE:
        await client.restartFirmware();
        return;
      case RestartTarget.KLIPPY:
        await client.restartKlippy();
        return;
      case RestartTarget.SERVER:
        await client.restartServer();
        return;
      case RestartTarget.HOST:
        await client.request('machine.reboot');
        return;
      default:
        return;
    }
  }

  // --- queries --------------------------------------------------------------

  getHistory(options?: HistoryListOptions): Promise<HistoryListResult> {
    return this.requireClient().getHistory(options);
  }

  getHistoryTotals(): Promise<HistoryTotalsResult> {
    return this.requireClient().getHistoryTotals();
  }

  getJobQueue(): Promise<JobQueueStatus> {
    return this.requireClient().getJobQueue();
  }

  getSystemInfo(): Promise<MachineSystemInfo> {
    return this.requireClient().getMachineSystemInfo();
  }

  async getConsoleBacklog(count?: number): Promise<readonly GcodeLogLine[]> {
    const entries = await this.requireClient().getGcodeStore(count);
    return entries.map((e) => ({
      t: e.time * 1000,
      message: e.message,
      type: e.type === 'command' ? LogLineType.COMMAND : LogLineType.RESPONSE,
    }));
  }

  listGcodeFiles(): Promise<readonly FileEntry[]> {
    return this.requireClient().listFiles('gcodes');
  }

  getGcodeMetadata(): Promise<GcodeMetadataMap> {
    return this.requireClient().getDatabaseItem<GcodeMetadataMap>('gcode_metadata');
  }

  async deleteGcodeEntry(path: string, isDir: boolean): Promise<void> {
    await this.requireClient().delete(`gcodes/${path}`, { recursive: isDir });
  }

  async moveGcodeEntry(source: string, dest: string): Promise<void> {
    await this.requireClient().move(`gcodes/${source}`, `gcodes/${dest}`);
  }

  /** Largest thumbnail for a g-code file as a `data:` URL (fetched in the SW). */
  async getGcodeThumbnail(path: string): Promise<string | undefined> {
    const client = this.requireClient();
    const meta = await client.getFileMetadata(path);
    const thumb = meta.thumbnails.reduce<GcodeThumbnail | undefined>(
      (best, t) => (t.width > (best?.width ?? 0) ? t : best),
      undefined,
    );
    if (!thumb) return undefined;
    const dir = path.includes('/') ? `${path.slice(0, path.lastIndexOf('/'))}/` : '';
    const rel = `${dir}${thumb.relative_path}`.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(`${client.httpBaseUrl}/server/files/gcodes/${rel}`);
    if (!res.ok) return undefined;
    return responseToDataUrl(res);
  }

  getFileDownloadUrl(path: string): string {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    return `${this.requireClient().httpBaseUrl}/server/files/gcodes/${encoded}`;
  }

  getSlicerSettings(path: string): Promise<SlicerSettings> {
    return new SlicerSettingsParser(this.getFileDownloadUrl(path)).parse();
  }

  // --- remote settings (Moonraker database) ---------------------------------

  async readStoredSettings<T>(key: string): Promise<T | undefined> {
    try {
      return await this.requireClient().getDatabaseItem<T>('helmsman', key);
    } catch {
      return undefined;
    }
  }

  async writeStoredSettings<T>(key: string, value: T): Promise<void> {
    await this.requireClient().postDatabaseItem('helmsman', key, value);
  }

  // --- internals ------------------------------------------------------------

  private cachedSystem?: ReturnType<typeof mapSystemStats>;

  private requireClient(): MoonrakerClient {
    if (!this.client) throw new Error(`Printer ${this.config.name} is not connected`);
    return this.client;
  }

  /** Run an optional discovery step, swallowing failures (best-effort). */
  private async safe(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch {
      // discovery is best-effort; ignore (e.g. webcams/temp-store unsupported)
    }
  }

  private mergeStatus(delta: PrinterStatus): void {
    for (const [key, value] of Object.entries(delta)) {
      if (!value) continue;
      this.status[key] = { ...this.status[key], ...value };
    }
  }

  private setConnection(state: ConnectionState, message?: string): void {
    this.connection = state;
    this.connectionMessage = message;
    this.recomputeAndEmit();
  }

  private recomputeAndEmit(): void {
    const status = this.status;
    const temperatures = mapTemperatureSources(status);
    const fans = mapFans(status);
    const bedMesh = mapBedMesh(status);
    const webcams = this.allWebcams();
    const job = mapJob(status);
    this.maybeFetchFileInfo(job?.filename);
    const capabilities: PrinterCapabilities = {
      hasBedMesh: bedMesh !== undefined || this.objectNames.includes('bed_mesh'),
      hasChamber: temperatures.some((t) => t.kind === TemperatureKind.CHAMBER),
      hasWebcam: webcams.length > 0,
      hasExcludeObject: this.objectNames.includes('exclude_object'),
      fanCount: fans.length,
      macroCount: this.macros.length,
    };
    this.snapshot = {
      printerId: this.config.id,
      connection: this.connection,
      connectionMessage: this.connectionMessage,
      klippyState: mapKlippyState(status),
      capabilities,
      temperatures,
      heaters: mapHeaters(status),
      fans,
      toolhead: mapToolhead(status),
      limits: mapLimits(status),
      job: job
        ? {
            ...job,
            thumbnailUrl: this.thumbnailDataUrl,
            estimatedTime: this.fileEstimatedTime,
            totalLayers: job.totalLayers ?? this.fileLayerCount,
          }
        : undefined,
      bedMesh,
      macros: this.macros,
      system: this.cachedSystem,
      webcams,
      updatedAt: Date.now(),
    };
    for (const listener of this.snapshotListeners) listener(this.snapshot);
  }

  /** Only the user-configured webcam (Moonraker-discovered cams are ignored). */
  private allWebcams(): WebcamRef[] {
    return this.config.webcamUrl ? [{ name: 'Webcam', streamUrl: this.config.webcamUrl }] : [];
  }

  /**
   * When the printing file changes, fetch its largest thumbnail as a data URL
   * (cached). Done in the background worker so the image isn't blocked by the
   * popup's mixed-content rules, and embedded in the snapshot for the UI.
   */
  private maybeFetchFileInfo(filename: string | undefined): void {
    if (filename === this.thumbnailFilename) return;
    this.thumbnailFilename = filename;
    this.thumbnailDataUrl = undefined;
    this.fileEstimatedTime = undefined;
    this.fileLayerCount = undefined;
    if (filename) void this.fetchFileInfo(filename);
  }

  /**
   * Fetch the printing file's metadata: capture the slicer time estimate +
   * layer count for the status panel, and the largest thumbnail (as a data URL
   * to dodge popup mixed-content rules).
   */
  private async fetchFileInfo(filename: string): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      const meta = await client.getFileMetadata(filename);
      if (this.thumbnailFilename !== filename) return; // job changed while fetching
      this.fileEstimatedTime = meta.estimated_time;
      this.fileLayerCount = meta.layer_count;

      const thumb = meta.thumbnails.reduce<GcodeThumbnail | undefined>(
        (best, t) => (t.width > (best?.width ?? 0) ? t : best),
        undefined,
      );
      if (thumb) {
        // Thumbnail paths are relative to the gcode file's own directory.
        const dir = filename.includes('/')
          ? `${filename.slice(0, filename.lastIndexOf('/'))}/`
          : '';
        const path = `${dir}${thumb.relative_path}`.split('/').map(encodeURIComponent).join('/');
        const res = await fetch(`${client.httpBaseUrl}/server/files/gcodes/${path}`);
        if (res.ok && this.thumbnailFilename === filename) {
          this.thumbnailDataUrl = await responseToDataUrl(res);
        }
      }
      if (this.thumbnailFilename === filename) this.recomputeAndEmit();
    } catch {
      // Best-effort; ignore (file may lack metadata/thumbnail).
    }
  }

  private emitLog(message: string, type: LogLineType): void {
    const line: GcodeLogLine = { t: Date.now(), message, type };
    for (const listener of this.logListeners) listener(line);
  }

  private pushSample(key: string, sample: TemperatureSample): void {
    let arr = this.history.get(key);
    if (!arr) {
      arr = [];
      this.history.set(key, arr);
    }
    arr.push(sample);
    if (arr.length > MAX_HISTORY_SAMPLES) arr.splice(0, arr.length - MAX_HISTORY_SAMPLES);
  }

  private appendHistory(now: number): void {
    for (const source of mapTemperatureSources(this.status)) {
      this.pushSample(source.key, {
        t: now,
        temperature: source.temperature,
        target: source.target,
        power: source.power,
      });
    }
  }

  private seedHistory(store: TemperatureStore): void {
    const now = Date.now();
    for (const [key, sensor] of Object.entries(store)) {
      const temps = sensor.temperatures;
      const count = temps.length;
      const samples: TemperatureSample[] = temps.map((temperature, i) => ({
        // Samples are 1Hz, newest last; lay them out ending at `now`.
        t: now - (count - 1 - i) * 1000,
        temperature,
        target: sensor.targets?.[i],
        power: sensor.powers?.[i],
      }));
      this.history.set(key, samples.slice(-MAX_HISTORY_SAMPLES));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || this.intentionalDisconnect) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect) this.connect();
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
