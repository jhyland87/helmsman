/**
 * @fileoverview Vendor-neutral printer state model.
 *
 * Every driver (Moonraker today, OctoPrint or others later) maps its native
 * status into a {@link PrinterSnapshot}. The UI and messaging layers only ever
 * see this normalized shape, so panels never depend on a specific backend.
 */

/** Transport-level connection state of a printer. */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

/** Normalized high-level print job state. */
export enum PrintState {
  STANDBY = 'standby',
  PRINTING = 'printing',
  PAUSED = 'paused',
  COMPLETE = 'complete',
  CANCELLED = 'cancelled',
  ERROR = 'error',
  UNKNOWN = 'unknown',
}

/** Role of a heater/temperature source, used for grouping and coloring. */
export enum TemperatureKind {
  EXTRUDER = 'extruder',
  BED = 'bed',
  CHAMBER = 'chamber',
  MCU = 'mcu',
  TEMPERATURE_FAN = 'temperature_fan',
  SENSOR = 'sensor',
  GENERIC = 'generic',
}

/**
 * A heater the user can control (has a settable target). Extruder, bed, and
 * `heater_generic` objects.
 */
export interface HeaterSnapshot {
  /** Native object key (e.g. `'extruder'`, `'heater_bed'`). */
  readonly key: string;
  readonly label: string;
  readonly kind: TemperatureKind;
  readonly temperature: number;
  readonly target: number;
  /** Heater duty cycle, 0..1. */
  readonly power?: number;
  readonly minTemp?: number;
  readonly maxTemp?: number;
}

/**
 * Any temperature source for the graph — heaters, plain sensors,
 * `temperature_fan`s, MCU/host temps. `target`/`power`/`speed` are present only
 * where the source reports them.
 */
export interface TemperatureSource {
  readonly key: string;
  readonly label: string;
  readonly kind: TemperatureKind;
  readonly temperature: number;
  readonly target?: number;
  readonly power?: number;
  readonly speed?: number;
}

/** A fan, whether monitor-only or controllable. */
export interface FanSnapshot {
  readonly key: string;
  readonly label: string;
  /** Current speed, 0..1. */
  readonly speed: number;
  /** True when the user can set the speed (part fan, fan_generic, output_pin). */
  readonly controllable: boolean;
  readonly rpm?: number;
  readonly kind: string;
}

/** Toolhead position and motion state. */
export interface ToolheadSnapshot {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Homed axes as a lowercase string, e.g. `'xyz'`. */
  readonly homedAxes: string;
  readonly gcodeZOffset?: number;
}

/** Live kinematic limits. */
export interface LimitsSnapshot {
  readonly velocity?: number;
  readonly accel?: number;
  readonly accelToDecel?: number;
  readonly squareCornerVelocity?: number;
}

/** Active/last print job. */
export interface PrintJobSnapshot {
  readonly state: PrintState;
  readonly filename?: string;
  /** 0..1. */
  readonly progress?: number;
  readonly printDuration?: number;
  readonly totalDuration?: number;
  readonly filamentUsed?: number;
  /** Slicer-estimated total print time (s), from the file's metadata. */
  readonly estimatedTime?: number;
  /** Live toolhead speed, mm/s (motion_report.live_velocity). */
  readonly speed?: number;
  /** Live volumetric flow, mm³/s. */
  readonly flow?: number;
  readonly currentLayer?: number;
  readonly totalLayers?: number;
  readonly message?: string;
  /** HTTP URL of the current job's thumbnail, if known. */
  readonly thumbnailUrl?: string;
}

/** Bed mesh leveling data. */
export interface BedMeshSnapshot {
  readonly profileName?: string;
  /** Interpolated mesh matrix (rows of Z values, mm). */
  readonly matrix: readonly (readonly number[])[];
  readonly min: readonly [number, number];
  readonly max: readonly [number, number];
  readonly rangeMin: number;
  readonly rangeMax: number;
}

/** A configured gcode macro. */
export interface MacroSnapshot {
  readonly name: string;
  readonly description?: string;
}

/** A configured webcam stream. */
export interface WebcamRef {
  readonly name: string;
  /** Absolute stream URL (resolved against the printer host). */
  readonly streamUrl: string;
  readonly snapshotUrl?: string;
  readonly flipHorizontal?: boolean;
  readonly flipVertical?: boolean;
  readonly rotation?: number;
}

/** Host/system resource stats. */
export interface SystemStatsSnapshot {
  readonly cpuTemp?: number;
  readonly systemCpuUsage?: number;
  readonly systemMemory?: { readonly total: number; readonly used: number; readonly available: number };
  readonly moonrakerCpu?: number;
  readonly moonrakerMemory?: number;
  readonly uptime?: number;
  readonly websocketConnections?: number;
}

/**
 * Which optional features a printer exposes — drives panel availability so the
 * dashboard hides panels a given printer can't serve.
 */
export interface PrinterCapabilities {
  readonly hasBedMesh: boolean;
  readonly hasChamber: boolean;
  readonly hasWebcam: boolean;
  readonly hasExcludeObject: boolean;
  readonly fanCount: number;
  readonly macroCount: number;
}

/** Default (all-false) capability set, used before discovery completes. */
export const EMPTY_CAPABILITIES: PrinterCapabilities = {
  hasBedMesh: false,
  hasChamber: false,
  hasWebcam: false,
  hasExcludeObject: false,
  fanCount: 0,
  macroCount: 0,
};

/**
 * The complete normalized state of one printer at a moment in time. Produced by
 * a driver, cached in the background worker, and streamed to the UI.
 */
export interface PrinterSnapshot {
  readonly printerId: string;
  readonly connection: ConnectionState;
  readonly connectionMessage?: string;
  /** Klippy state string, e.g. `'ready'`, `'startup'`, `'error'`, `'shutdown'`. */
  readonly klippyState?: string;
  readonly capabilities: PrinterCapabilities;
  readonly temperatures: readonly TemperatureSource[];
  readonly heaters: readonly HeaterSnapshot[];
  readonly fans: readonly FanSnapshot[];
  readonly toolhead?: ToolheadSnapshot;
  readonly limits?: LimitsSnapshot;
  readonly job?: PrintJobSnapshot;
  readonly bedMesh?: BedMeshSnapshot;
  readonly macros: readonly MacroSnapshot[];
  readonly system?: SystemStatsSnapshot;
  readonly webcams: readonly WebcamRef[];
  /** ms epoch when this snapshot was produced. */
  readonly updatedAt: number;
}

/** One temperature history sample for charting. */
export interface TemperatureSample {
  /** ms epoch. */
  readonly t: number;
  readonly temperature: number;
  readonly target?: number;
  readonly power?: number;
}

/** Per-source temperature history, keyed by source `key`. */
export type TemperatureHistory = Readonly<Record<string, readonly TemperatureSample[]>>;

/**
 * Build a disconnected placeholder snapshot for a printer that has no live
 * data yet.
 */
export const emptySnapshot = (
  printerId: string,
  connection: ConnectionState = ConnectionState.DISCONNECTED,
  connectionMessage?: string,
): PrinterSnapshot => ({
  printerId,
  connection,
  connectionMessage,
  capabilities: EMPTY_CAPABILITIES,
  temperatures: [],
  heaters: [],
  fans: [],
  macros: [],
  webcams: [],
  updatedAt: Date.now(),
});
