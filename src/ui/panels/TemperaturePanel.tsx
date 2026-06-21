/**
 * @fileoverview Temperature graph + controls.
 *
 * Each source draws two lines that share a hue: the **actual** temperature
 * (solid, full opacity) and the **target** (same color, dimmer + dashed), as
 * specified. Heaters get an inline target-setter.
 */
import { Box, Fade, Stack, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts';

import {
  TemperatureKind,
  type HeaterSnapshot,
  type TemperatureHistory,
  type TemperatureSource,
} from '@/core/model/PrinterSnapshot';
import { api } from '@/ui/shared/api';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import type { PanelProps } from './PanelProps';

const KIND_COLORS: Partial<Record<TemperatureKind, string>> = {
  [TemperatureKind.EXTRUDER]: '#ef4444',
  [TemperatureKind.BED]: '#3b82f6',
  [TemperatureKind.CHAMBER]: '#a855f7',
  [TemperatureKind.MCU]: '#22c55e',
  [TemperatureKind.TEMPERATURE_FAN]: '#06b6d4',
};

const FALLBACK_COLORS = ['#eab308', '#f97316', '#14b8a6', '#ec4899', '#84cc16', '#8b5cf6'];

const TARGET_SUFFIX = '::target';

/** Assign each source a stable color: by-kind first, then a cycling fallback. */
const assignColors = (sources: readonly TemperatureSource[]): Record<string, string> => {
  const usedKinds = new Set<TemperatureKind>();
  const colors: Record<string, string> = {};
  let fallback = 0;
  for (const source of sources) {
    const byKind = KIND_COLORS[source.kind];
    if (byKind && !usedKinds.has(source.kind)) {
      usedKinds.add(source.kind);
      colors[source.key] = byKind;
    } else {
      colors[source.key] = FALLBACK_COLORS[fallback % FALLBACK_COLORS.length] ?? '#888';
      fallback += 1;
    }
  }
  return colors;
};

interface ChartRow {
  t: number;
  [seriesKey: string]: number;
}

const buildChartData = (
  history: TemperatureHistory,
  sources: readonly TemperatureSource[],
): ChartRow[] => {
  const rows = new Map<number, ChartRow>();
  for (const source of sources) {
    for (const sample of history[source.key] ?? []) {
      let row = rows.get(sample.t);
      if (!row) {
        row = { t: sample.t };
        rows.set(sample.t, row);
      }
      row[source.key] = sample.temperature;
      if (sample.target !== undefined) row[`${source.key}${TARGET_SUFFIX}`] = sample.target;
    }
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
};

const formatTime = (t: number): string =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Themed, semi-transparent hover tooltip. Merges each source's actual + target
 * series onto one compact line (`Bed: 35.1 / 35.0 °C`).
 */
function ChartTooltip({ active, payload, label }: TooltipContentProps): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const byKey = new Map(payload.map((entry) => [String(entry.dataKey), entry]));
  const rows = payload
    .filter((entry) => !String(entry.dataKey).endsWith(TARGET_SUFFIX))
    .map((entry) => {
      const target = byKey.get(`${String(entry.dataKey)}${TARGET_SUFFIX}`);
      return {
        key: String(entry.dataKey),
        name: typeof entry.name === 'string' ? entry.name : String(entry.dataKey),
        color: entry.color ?? 'inherit',
        value: typeof entry.value === 'number' ? entry.value : undefined,
        target: typeof target?.value === 'number' ? target.value : undefined,
      };
    });

  return (
    <Box
      sx={{
        bgcolor: (theme) => alpha(theme.palette.background.paper, 0.82),
        color: 'text.primary',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        boxShadow: 3,
        px: 1,
        py: 0.5,
        backdropFilter: 'blur(2px)',
        fontSize: 11,
        lineHeight: 1.4,
      }}
    >
      <Box sx={{ color: 'text.secondary', fontSize: 10, mb: 0.25 }}>
        {formatTime(Number(label))}
      </Box>
      {rows.map((row) => (
        <Box key={row.key} sx={{ color: row.color, whiteSpace: 'nowrap' }}>
          {row.name}: {row.value !== undefined ? row.value.toFixed(1) : '—'}
          {row.target !== undefined ? ` / ${row.target.toFixed(1)}` : ''} °C
        </Box>
      ))}
    </Box>
  );
}

/**
 * Y-axis upper bound with headroom so lines near the top (e.g. a 220°C target)
 * aren't drawn on the chart border. Adds ~8% (min 10°C) and rounds up to the
 * next 10°C. Recharts calls this with the data's max value.
 */
const yAxisMax = (dataMax: number): number => {
  const headroom = Math.max(10, dataMax * 0.08);
  return Math.ceil((dataMax + headroom) / 10) * 10;
};

/**
 * Clamp a requested target to the heater's configured limits. `0` passes through
 * (turns the heater off). Returns the value to send plus a short note when it
 * was adjusted.
 */
const clampTarget = (
  target: number,
  heater: HeaterSnapshot,
): { value: number; note?: string } => {
  if (target === 0) return { value: 0 };
  if (heater.minTemp !== undefined && target < heater.minTemp) {
    return { value: heater.minTemp, note: `min ${heater.minTemp}°C` };
  }
  if (heater.maxTemp !== undefined && target > heater.maxTemp) {
    return { value: heater.maxTemp, note: `max ${heater.maxTemp}°C` };
  }
  return { value: target };
};

function TargetControl({
  printerId,
  heater,
}: {
  printerId: string;
  heater: HeaterSnapshot;
}): JSX.Element {
  const [value, setValue] = useState('');
  // `note` stays set while the warning fades; `showNote` drives the fade.
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  const flashNote = (message: string): void => {
    setNote(message);
    setShowNote(true);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setShowNote(false), 1200);
  };

  const submit = (): void => {
    if (value.trim() === '') return;
    const requested = Number(value);
    if (!Number.isFinite(requested)) {
      setValue('');
      return;
    }
    const { value: target, note: clampNote } = clampTarget(requested, heater);
    if (clampNote) flashNote(clampNote);
    void api.setHeater(printerId, heater.key, target);
    setValue('');
  };

  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography variant="caption" sx={{ minWidth: 70 }}>
        {heater.label}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 78 }}>
        {heater.temperature.toFixed(1)} / {heater.target.toFixed(0)}°C
      </Typography>
      <TextField
        size="small"
        type="number"
        placeholder="set"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        onBlur={submit}
        sx={{ width: 80 }}
        slotProps={{
          htmlInput: {
            min: 0,
            max: heater.maxTemp,
            'aria-label': `${heater.label} target`,
          },
        }}
      />
      <Fade in={showNote} timeout={{ enter: 150, exit: 500 }}>
        <Typography variant="caption" color="warning.main" sx={{ whiteSpace: 'nowrap' }}>
          → {note}
        </Typography>
      </Fade>
    </Stack>
  );
}

export function TemperaturePanel({ printerId, snapshot, maximized }: PanelProps): JSX.Element {
  const { history } = useBackground();
  const sources = snapshot.temperatures;
  const colors = useMemo(() => assignColors(sources), [sources]);
  const data = useMemo(() => buildChartData(history, sources), [history, sources]);

  if (sources.length === 0) {
    return <Typography variant="body2" color="text.secondary">No temperature sensors.</Typography>;
  }

  return (
    <Stack spacing={1} sx={maximized ? { height: '100%' } : undefined}>
      <Box
        sx={{ width: '100%', ...(maximized ? { flex: 1, minHeight: 0 } : { height: 220 }) }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
            <XAxis
              dataKey="t"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={formatTime}
              minTickGap={48}
              tick={{ fontSize: 10 }}
            />
            <YAxis width={40} tick={{ fontSize: 10 }} domain={[0, yAxisMax]} />
            <Tooltip content={(props) => <ChartTooltip {...props} />} />
            {sources.map((source) => (
              <Line
                key={source.key}
                type="monotone"
                dataKey={source.key}
                name={source.label}
                stroke={colors[source.key]}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
            {sources
              .filter((s) => history[s.key]?.some((sample) => sample.target !== undefined))
              .map((source) => (
                <Line
                  key={`${source.key}${TARGET_SUFFIX}`}
                  type="monotone"
                  dataKey={`${source.key}${TARGET_SUFFIX}`}
                  name={`${source.label} target`}
                  stroke={colors[source.key]}
                  strokeOpacity={0.5}
                  strokeWidth={1.25}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </Box>
      <Stack spacing={0.5}>
        {snapshot.heaters.map((heater) => (
          <TargetControl key={heater.key} printerId={printerId} heater={heater} />
        ))}
      </Stack>
    </Stack>
  );
}
