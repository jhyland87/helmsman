/**
 * @fileoverview Pure mapping between Moonraker's printer-object status and
 * Helmsman's normalized {@link PrinterSnapshot}. Kept free of any I/O or client
 * references so it can be unit-tested in isolation.
 *
 * Inputs are `unknown`-valued records straight off the wire; every field read
 * goes through a runtime guard rather than a type assertion.
 */
import {
  type BedMeshSnapshot,
  type FanSnapshot,
  type HeaterSnapshot,
  type LimitsSnapshot,
  type MacroSnapshot,
  type PrintJobSnapshot,
  PrintState,
  type SystemStatsSnapshot,
  type TemperatureSource,
  TemperatureKind,
  type ToolheadSnapshot,
} from '@/core/model/PrinterSnapshot';
import {
  isRecord,
  toArray,
  toFiniteNumber,
  toRecord,
  toStringValue,
} from '@/core/util/guards';

/**
 * Raw accumulated printer status: object name → field map. Each object's fields
 * are `unknown` until guarded. Both the live accumulator and the client's typed
 * `PrinterStatus` are assignable to this.
 */
export type RawStatus = Readonly<Record<string, Record<string, unknown> | undefined>>;

/** Object-name prefixes we subscribe to and map. */
const SUBSCRIBED_PREFIXES = [
  'webhooks',
  'print_stats',
  'display_status',
  'virtual_sdcard',
  'toolhead',
  'gcode_move',
  'motion_report',
  'idle_timeout',
  'bed_mesh',
  'exclude_object',
  'heater_bed',
  'extruder',
  'heater_generic ',
  'temperature_sensor ',
  'temperature_fan ',
  'fan',
  'fan_generic ',
  'heater_fan ',
  'controller_fan ',
  'output_pin ',
] as const;

const FAN_SECTIONS = new Set(['fan_generic', 'heater_fan', 'controller_fan']);

/** Split a Moonraker object key into `[section, name]` (name may be empty). */
const splitKey = (key: string): [string, string] => {
  const i = key.indexOf(' ');
  return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)];
};

/** True if `key` is an object we want to subscribe to. */
const isSubscribed = (key: string): boolean =>
  SUBSCRIBED_PREFIXES.some((p) => (p.endsWith(' ') ? key.startsWith(p) : key === p));

/** Read a finite numeric field off a status object. */
const field = (obj: Record<string, unknown> | undefined, name: string): number | undefined =>
  obj ? toFiniteNumber(obj[name]) : undefined;

/**
 * Build the `printer.objects.subscribe` spec from the printer's full object
 * list — every matching object, all fields.
 */
export const buildSubscriptionSpec = (
  objectNames: readonly string[],
): Record<string, null> => {
  const spec: Record<string, null> = {};
  for (const name of objectNames) {
    if (isSubscribed(name)) spec[name] = null;
  }
  for (const required of ['webhooks', 'print_stats', 'toolhead', 'display_status']) {
    spec[required] = null;
  }
  return spec;
};

/** Extract the gcode-macro names from a printer object list. */
export const extractMacros = (objectNames: readonly string[]): MacroSnapshot[] =>
  objectNames
    .filter((n) => n.startsWith('gcode_macro '))
    .map((n) => n.slice('gcode_macro '.length))
    // Klipper convention: leading underscore marks an internal/helper macro.
    .filter((name) => !name.startsWith('_'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name }));

const classifyTemperature = (key: string): TemperatureKind => {
  const [section, name] = splitKey(key);
  const lower = name.toLowerCase();
  if (section === 'extruder') return TemperatureKind.EXTRUDER;
  if (key === 'heater_bed') return TemperatureKind.BED;
  if (section === 'temperature_fan') return TemperatureKind.TEMPERATURE_FAN;
  if (lower.includes('chamber')) return TemperatureKind.CHAMBER;
  if (lower.includes('mcu') || lower.includes('host')) return TemperatureKind.MCU;
  if (section === 'heater_generic') return TemperatureKind.GENERIC;
  return TemperatureKind.SENSOR;
};

const sourceLabel = (key: string): string => {
  const [section, name] = splitKey(key);
  if (key === 'heater_bed') return 'Bed';
  if (section === 'extruder') return key === 'extruder' ? 'Extruder' : key;
  return name || key;
};

/** Map heater-like objects (settable target) into {@link HeaterSnapshot}s. */
export const mapHeaters = (status: RawStatus): HeaterSnapshot[] => {
  const heaters: HeaterSnapshot[] = [];
  // Configured min/max temps live under `configfile.config.<section>` (queried
  // once on connect and merged into the status), keyed by the object name.
  const config = toRecord(toRecord(status.configfile)?.config);
  for (const [key, obj] of Object.entries(status)) {
    if (!obj) continue;
    const [section] = splitKey(key);
    const isHeater =
      section === 'extruder' || key === 'heater_bed' || section === 'heater_generic';
    if (!isHeater) continue;
    const temperature = field(obj, 'temperature');
    if (temperature === undefined) continue;
    const limits = config ? toRecord(config[key]) : undefined;
    heaters.push({
      key,
      label: sourceLabel(key),
      kind: classifyTemperature(key),
      temperature,
      target: field(obj, 'target') ?? 0,
      power: field(obj, 'power'),
      minTemp: limits ? toFiniteNumber(limits.min_temp) : undefined,
      maxTemp: limits ? toFiniteNumber(limits.max_temp) : undefined,
    });
  }
  return heaters.sort((a, b) => a.key.localeCompare(b.key));
};

/** Map every temperature-bearing object into graph sources. */
export const mapTemperatureSources = (status: RawStatus): TemperatureSource[] => {
  const sources: TemperatureSource[] = [];
  for (const [key, obj] of Object.entries(status)) {
    if (!obj) continue;
    const temperature = field(obj, 'temperature');
    if (temperature === undefined) continue;
    sources.push({
      key,
      label: sourceLabel(key),
      kind: classifyTemperature(key),
      temperature,
      target: field(obj, 'target'),
      power: field(obj, 'power'),
      speed: field(obj, 'speed'),
    });
  }
  return sources.sort((a, b) => a.key.localeCompare(b.key));
};

/** Map fan objects into {@link FanSnapshot}s. */
export const mapFans = (status: RawStatus): FanSnapshot[] => {
  const fans: FanSnapshot[] = [];
  for (const [key, obj] of Object.entries(status)) {
    if (!obj) continue;
    const [section, name] = splitKey(key);
    let speed: number | undefined;
    let controllable = false;
    if (key === 'fan') {
      speed = field(obj, 'speed');
      controllable = true;
    } else if (FAN_SECTIONS.has(section)) {
      speed = field(obj, 'speed');
      controllable = section === 'fan_generic';
    } else if (section === 'output_pin' && name.toLowerCase().includes('fan')) {
      speed = field(obj, 'value');
      controllable = true;
    } else {
      continue;
    }
    if (speed === undefined) continue;
    fans.push({
      key,
      label: key === 'fan' ? 'Part Fan' : name || key,
      speed,
      controllable,
      rpm: field(obj, 'rpm'),
      kind: section,
    });
  }
  return fans.sort((a, b) => a.key.localeCompare(b.key));
};

/** Map toolhead + gcode_move into a {@link ToolheadSnapshot}. */
export const mapToolhead = (status: RawStatus): ToolheadSnapshot | undefined => {
  const th = status.toolhead;
  if (!th) return undefined;
  const pos = toArray(th.position) ?? [];
  const offset = toArray(status.gcode_move?.homing_origin) ?? [];
  return {
    position: {
      x: toFiniteNumber(pos[0]) ?? 0,
      y: toFiniteNumber(pos[1]) ?? 0,
      z: toFiniteNumber(pos[2]) ?? 0,
    },
    homedAxes: toStringValue(th.homed_axes) ?? '',
    gcodeZOffset: toFiniteNumber(offset[2]),
  };
};

/** Map kinematic limits from the toolhead object. */
export const mapLimits = (status: RawStatus): LimitsSnapshot | undefined => {
  const th = status.toolhead;
  if (!th) return undefined;
  return {
    velocity: field(th, 'max_velocity'),
    accel: field(th, 'max_accel'),
    accelToDecel: field(th, 'max_accel_to_decel'),
    squareCornerVelocity: field(th, 'square_corner_velocity'),
  };
};

const PRINT_STATE_MAP: Readonly<Record<string, PrintState>> = {
  standby: PrintState.STANDBY,
  printing: PrintState.PRINTING,
  paused: PrintState.PAUSED,
  complete: PrintState.COMPLETE,
  cancelled: PrintState.CANCELLED,
  error: PrintState.ERROR,
};

/** Map print_stats + live motion data into a {@link PrintJobSnapshot}. */
export const mapJob = (status: RawStatus): PrintJobSnapshot | undefined => {
  const ps = status.print_stats;
  if (!ps) return undefined;
  const stateStr = toStringValue(ps.state) ?? 'standby';
  const progress =
    field(status.display_status, 'progress') ?? field(status.virtual_sdcard, 'progress');

  // Live speed + volumetric flow from motion_report (+ filament_diameter config).
  const speed = field(status.motion_report, 'live_velocity');
  const extruderVelocity = field(status.motion_report, 'live_extruder_velocity');
  const extruderConfig = toRecord(toRecord(toRecord(status.configfile)?.config)?.extruder);
  const filamentDiameter = extruderConfig ? toFiniteNumber(extruderConfig.filament_diameter) : undefined;
  const flow =
    extruderVelocity !== undefined && filamentDiameter !== undefined
      ? extruderVelocity * Math.PI * (filamentDiameter / 2) ** 2
      : undefined;

  // Layer info comes from the slicer via SET_PRINT_STATS_INFO when printing.
  const info = toRecord(ps.info);

  return {
    state: PRINT_STATE_MAP[stateStr] ?? PrintState.UNKNOWN,
    filename: toStringValue(ps.filename) || undefined,
    progress,
    printDuration: field(ps, 'print_duration'),
    totalDuration: field(ps, 'total_duration'),
    filamentUsed: field(ps, 'filament_used'),
    speed,
    flow,
    currentLayer: info ? toFiniteNumber(info.current_layer) : undefined,
    totalLayers: info ? toFiniteNumber(info.total_layer) : undefined,
    message: toStringValue(ps.message) || undefined,
  };
};

const matrixRange = (matrix: readonly (readonly number[])[]): [number, number] => {
  let min = Infinity;
  let max = -Infinity;
  for (const row of matrix) {
    for (const z of row) {
      if (z < min) min = z;
      if (z > max) max = z;
    }
  }
  return Number.isFinite(min) ? [min, max] : [0, 0];
};

/** Map the bed_mesh object into a {@link BedMeshSnapshot}. */
export const mapBedMesh = (status: RawStatus): BedMeshSnapshot | undefined => {
  const bm = status.bed_mesh;
  if (!bm) return undefined;
  const rawMatrix = toArray(bm.probed_matrix) ?? toArray(bm.mesh_matrix);
  if (!rawMatrix || rawMatrix.length === 0) return undefined;
  const matrix = rawMatrix.map((row) => {
    const cells = toArray(row) ?? [];
    return cells.map((v) => toFiniteNumber(v) ?? 0);
  });
  const minCoord = toArray(bm.mesh_min) ?? [0, 0];
  const maxCoord = toArray(bm.mesh_max) ?? [0, 0];
  const [rangeMin, rangeMax] = matrixRange(matrix);
  return {
    profileName: toStringValue(bm.profile_name) || undefined,
    matrix,
    min: [toFiniteNumber(minCoord[0]) ?? 0, toFiniteNumber(minCoord[1]) ?? 0],
    max: [toFiniteNumber(maxCoord[0]) ?? 0, toFiniteNumber(maxCoord[1]) ?? 0],
    rangeMin,
    rangeMax,
  };
};

/** Klippy state string (`ready`/`startup`/`shutdown`/`error`) from webhooks. */
export const mapKlippyState = (status: RawStatus): string | undefined =>
  toStringValue(status.webhooks?.state);

/** Map a `machine.proc_stats` payload into a {@link SystemStatsSnapshot}. */
export const mapSystemStats = (proc: unknown): SystemStatsSnapshot => {
  if (!isRecord(proc)) return {};
  const samples = toArray(proc.moonraker_stats) ?? [];
  const last = toRecord(samples[samples.length - 1]);
  const mem = toRecord(proc.system_memory);
  const cpu = toRecord(proc.system_cpu_usage);
  return {
    cpuTemp: toFiniteNumber(proc.cpu_temp),
    systemCpuUsage: cpu ? toFiniteNumber(cpu.cpu) : undefined,
    systemMemory: mem
      ? {
          total: toFiniteNumber(mem.total) ?? 0,
          used: toFiniteNumber(mem.used) ?? 0,
          available: toFiniteNumber(mem.available) ?? 0,
        }
      : undefined,
    moonrakerCpu: last ? toFiniteNumber(last.cpu_usage) : undefined,
    moonrakerMemory: last ? toFiniteNumber(last.memory) : undefined,
    uptime: toFiniteNumber(proc.system_uptime),
    websocketConnections: toFiniteNumber(proc.websocket_connections),
  };
};
