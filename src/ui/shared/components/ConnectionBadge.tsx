/**
 * @fileoverview A small colored dot + label reflecting a connection state.
 */
import { Box, Typography } from '@mui/material';

import { ConnectionState } from '@/core/model/PrinterSnapshot';
import { useT } from '@/ui/shared/i18n';
import type { MessageKey } from '@/ui/shared/i18n/en';

const COLOR: Readonly<Record<ConnectionState, string>> = {
  [ConnectionState.CONNECTED]: '#22c55e',
  [ConnectionState.CONNECTING]: '#f59e0b',
  [ConnectionState.DISCONNECTED]: '#9ca3af',
  [ConnectionState.ERROR]: '#ef4444',
};

const LABEL_KEY: Readonly<Record<ConnectionState, MessageKey>> = {
  [ConnectionState.CONNECTED]: 'conn.connected',
  [ConnectionState.CONNECTING]: 'conn.connecting',
  [ConnectionState.DISCONNECTED]: 'conn.disconnected',
  [ConnectionState.ERROR]: 'conn.error',
};

export function ConnectionDot({ state }: { state: ConnectionState }): JSX.Element {
  return (
    <Box
      component="span"
      sx={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: COLOR[state],
      }}
    />
  );
}

export function ConnectionBadge({ state }: { state: ConnectionState }): JSX.Element {
  const t = useT();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <ConnectionDot state={state} />
      <Typography variant="caption" color="text.secondary">
        {t(LABEL_KEY[state])}
      </Typography>
    </Box>
  );
}
