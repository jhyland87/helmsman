/**
 * @fileoverview Toolhead panel — position readout, homing, and live Z offset
 * (babystepping) adjustment.
 */
import { Box, Button, Chip, Stack, Typography } from '@mui/material';

import { api } from '@/ui/shared/api';
import { useT } from '@/ui/shared/i18n';
import type { PanelProps } from './PanelProps';

const Z_STEPS = [-0.05, -0.01, 0.01, 0.05] as const;

export function ToolheadPanel({ printerId, snapshot }: PanelProps): JSX.Element {
  const t = useT();
  const th = snapshot.toolhead;
  const pos = th?.position;
  const homed = th?.homedAxes ?? '';
  const axisHomed = (axis: string): boolean => homed.toLowerCase().includes(axis);

  return (
    <Stack spacing={1.25}>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <Chip
            key={axis}
            size="small"
            color={axisHomed(axis) ? 'success' : 'default'}
            variant={axisHomed(axis) ? 'filled' : 'outlined'}
            label={`${axis.toUpperCase()}: ${pos ? pos[axis].toFixed(2) : '—'}`}
          />
        ))}
      </Box>

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={() => void api.home(printerId)}>
          {t('toolhead.home')}
        </Button>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <Button key={axis} variant="outlined" onClick={() => void api.home(printerId, [axis])}>
            Home {axis.toUpperCase()}
          </Button>
        ))}
      </Stack>

      <Box>
        <Typography variant="caption" color="text.secondary">
          Z offset {th?.gcodeZOffset !== undefined ? `(${th.gcodeZOffset.toFixed(3)} mm)` : ''}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
          {Z_STEPS.map((delta) => (
            <Button
              key={delta}
              size="small"
              variant="outlined"
              onClick={() => void api.adjustZ(printerId, delta)}
            >
              {delta > 0 ? `+${delta}` : delta}
            </Button>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
