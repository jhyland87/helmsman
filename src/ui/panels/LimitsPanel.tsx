/**
 * @fileoverview Printer limits panel — sliders for velocity, acceleration,
 * accel-to-decel, and square corner velocity.
 */
import { Box, Slider, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import type { LimitsSnapshot } from '@/core/model/PrinterSnapshot';
import { api } from '@/ui/shared/api';
import { useT } from '@/ui/shared/i18n';
import type { MessageKey } from '@/ui/shared/i18n/en';
import type { PanelProps } from './PanelProps';

interface LimitSpec {
  readonly field: keyof LimitsSnapshot;
  readonly labelKey: MessageKey;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
}

const SPECS: readonly LimitSpec[] = [
  { field: 'velocity', labelKey: 'limits.velocity', min: 1, max: 1000, step: 1, unit: 'mm/s' },
  { field: 'accel', labelKey: 'limits.accel', min: 100, max: 20000, step: 100, unit: 'mm/s²' },
  { field: 'accelToDecel', labelKey: 'limits.accelToDecel', min: 100, max: 20000, step: 100, unit: 'mm/s²' },
  {
    field: 'squareCornerVelocity',
    labelKey: 'limits.squareCornerVelocity',
    min: 1,
    max: 50,
    step: 0.5,
    unit: 'mm/s',
  },
];

function LimitSlider({
  printerId,
  spec,
  current,
}: {
  printerId: string;
  spec: LimitSpec;
  current?: number;
}): JSX.Element {
  const t = useT();
  const [value, setValue] = useState(current ?? spec.min);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging && current !== undefined) setValue(current);
  }, [current, dragging]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption">{t(spec.labelKey)}</Typography>
        <Typography variant="caption" color="text.secondary">
          {Math.round(value)} {spec.unit}
        </Typography>
      </Box>
      <Slider
        size="small"
        value={value}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        disabled={current === undefined}
        onChange={(_e, v) => {
          setDragging(true);
          setValue(typeof v === 'number' ? v : v[0] ?? spec.min);
        }}
        onChangeCommitted={(_e, v) => {
          const next = typeof v === 'number' ? v : v[0] ?? spec.min;
          setDragging(false);
          void api.setLimits(printerId, { [spec.field]: next });
        }}
      />
    </Box>
  );
}

export function LimitsPanel({ printerId, snapshot }: PanelProps): JSX.Element {
  const limits = snapshot.limits ?? {};
  return (
    <Stack spacing={0.5}>
      {SPECS.map((spec) => (
        <LimitSlider
          key={spec.field}
          printerId={printerId}
          spec={spec}
          current={limits[spec.field]}
        />
      ))}
    </Stack>
  );
}
