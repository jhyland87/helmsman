/**
 * @fileoverview Print jobs panel — current job details (scaffolded; extend with
 * a file browser + start-print picker as needed).
 */
import { Stack, Typography } from '@mui/material';

import { PrintState } from '@/core/model/PrinterSnapshot';
import type { PanelProps } from './PanelProps';

const STATE_LABEL: Readonly<Record<PrintState, string>> = {
  [PrintState.STANDBY]: 'Standby',
  [PrintState.PRINTING]: 'Printing',
  [PrintState.PAUSED]: 'Paused',
  [PrintState.COMPLETE]: 'Complete',
  [PrintState.CANCELLED]: 'Cancelled',
  [PrintState.ERROR]: 'Error',
  [PrintState.UNKNOWN]: 'Unknown',
};

export function PrintJobsPanel({ snapshot }: PanelProps): JSX.Element {
  const job = snapshot.job;
  if (!job) {
    return <Typography variant="body2" color="text.secondary">No job information.</Typography>;
  }
  return (
    <Stack spacing={0.5}>
      <Typography variant="body2">State: {STATE_LABEL[job.state]}</Typography>
      {job.filename && (
        <Typography variant="body2" noWrap title={job.filename}>
          File: {job.filename}
        </Typography>
      )}
      {job.filamentUsed !== undefined && (
        <Typography variant="caption" color="text.secondary">
          Filament used: {(job.filamentUsed / 1000).toFixed(2)} m
        </Typography>
      )}
      {job.message && (
        <Typography variant="caption" color="text.secondary">
          {job.message}
        </Typography>
      )}
    </Stack>
  );
}
