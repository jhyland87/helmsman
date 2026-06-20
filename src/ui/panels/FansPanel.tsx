/**
 * @fileoverview Fans & outputs panel — monitor speeds and set controllable fans.
 */
import { Box, Slider, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import type { FanSnapshot } from '@/core/model/PrinterSnapshot';
import { api } from '@/ui/shared/api';
import type { PanelProps } from './PanelProps';

function FanRow({ printerId, fan }: { printerId: string; fan: FanSnapshot }): JSX.Element {
  // Local slider value so dragging is smooth; sync from snapshot when idle.
  const [value, setValue] = useState(Math.round(fan.speed * 100));
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setValue(Math.round(fan.speed * 100));
  }, [fan.speed, dragging]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="caption">{fan.label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {value}%{fan.rpm !== undefined ? ` · ${Math.round(fan.rpm)} RPM` : ''}
        </Typography>
      </Box>
      <Slider
        size="small"
        value={value}
        disabled={!fan.controllable}
        min={0}
        max={100}
        onChange={(_e, v) => {
          setDragging(true);
          setValue(typeof v === 'number' ? v : v[0] ?? 0);
        }}
        onChangeCommitted={(_e, v) => {
          const pct = typeof v === 'number' ? v : v[0] ?? 0;
          setDragging(false);
          void api.setFan(printerId, fan.key, pct / 100);
        }}
      />
    </Box>
  );
}

export function FansPanel({ printerId, snapshot }: PanelProps): JSX.Element {
  if (snapshot.fans.length === 0) {
    return <Typography variant="body2" color="text.secondary">No fans detected.</Typography>;
  }
  return (
    <Stack spacing={0.5}>
      {snapshot.fans.map((fan) => (
        <FanRow key={fan.key} printerId={printerId} fan={fan} />
      ))}
    </Stack>
  );
}
