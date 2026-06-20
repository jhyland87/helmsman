/**
 * @fileoverview Print Status panel — live job details (state, speed, flow,
 * filament, layers), slicer/file/total time estimates + finish time, a circular
 * progress gauge, the file thumbnail, and print controls.
 *
 * Time estimates follow Fluidd's approach: remaining = print_duration/progress −
 * print_duration (file) and estimated_time − print_duration (slicer); the ETA
 * uses the average of whichever are available.
 */
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import {
  Alert,
  Box,
  Chip,
  type ChipProps,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';

import { PrintAction } from '@/core/drivers/PrinterDriver';
import { ConnectionState, PrintState } from '@/core/model/PrinterSnapshot';
import { api } from '@/ui/shared/api';
import { useT } from '@/ui/shared/i18n';
import { useConfirm } from '@/ui/shared/state/ConfirmContext';
import { useSettings } from '@/ui/shared/state/SettingsContext';
import type { PanelProps } from './PanelProps';

/**
 * Pause/resume + cancel controls for the Print Status panel's title bar
 * (registered as the panel's header `actions`). Hidden when no print is active.
 * Pause and cancel prompt for confirmation (unless disabled in settings);
 * resume is harmless and sends directly.
 */
export function PrintControls({ printerId, snapshot }: PanelProps): JSX.Element | null {
  const t = useT();
  const confirm = useConfirm();
  const { settings } = useSettings();
  const state = snapshot.job?.state;
  const isPrinting = state === PrintState.PRINTING;
  const isPaused = state === PrintState.PAUSED;
  if (!isPrinting && !isPaused) return null;

  const run = async (
    action: PrintAction,
    prompt?: { title: string; message: string },
  ): Promise<void> => {
    if (prompt && settings.confirmPrintActions) {
      const ok = await confirm({
        title: prompt.title,
        message: prompt.message,
        confirmLabel: action === PrintAction.CANCEL ? t('job.cancel') : t('job.pause'),
        confirmColor: 'warning',
      });
      if (!ok) return;
    }
    await api.printAction(printerId, action);
  };

  return (
    <>
      {isPrinting && (
        <Tooltip title={t('job.pause')}>
          <IconButton
            size="small"
            aria-label={t('job.pause')}
            onClick={() =>
              void run(PrintAction.PAUSE, {
                title: t('confirm.pause.title'),
                message: t('confirm.pause.message'),
              })
            }
          >
            <PauseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {isPaused && (
        <Tooltip title={t('job.resume')}>
          <IconButton
            size="small"
            aria-label={t('job.resume')}
            onClick={() => void run(PrintAction.RESUME)}
          >
            <PlayArrowIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip title={t('job.cancel')}>
        <IconButton
          size="small"
          color="warning"
          aria-label={t('job.cancel')}
          onClick={() =>
            void run(PrintAction.CANCEL, {
              title: t('confirm.cancel.title'),
              message: t('confirm.cancel.message'),
            })
          }
        >
          <StopIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
}

const fmtDuration = (s?: number): string => {
  if (s === undefined || !Number.isFinite(s)) return '—';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const fmtClock = (d?: Date): string =>
  d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

const fmtUnit = (v: number | undefined, unit: string, digits = 0): string =>
  v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)} ${unit}`;

const STATE_COLOR: Readonly<Record<PrintState, ChipProps['color']>> = {
  [PrintState.PRINTING]: 'primary',
  [PrintState.PAUSED]: 'warning',
  [PrintState.COMPLETE]: 'success',
  [PrintState.CANCELLED]: 'default',
  [PrintState.ERROR]: 'error',
  [PrintState.STANDBY]: 'default',
  [PrintState.UNKNOWN]: 'default',
};

const STATE_LABEL: Readonly<Record<PrintState, string>> = {
  [PrintState.PRINTING]: 'Printing',
  [PrintState.PAUSED]: 'Paused',
  [PrintState.COMPLETE]: 'Complete',
  [PrintState.CANCELLED]: 'Cancelled',
  [PrintState.ERROR]: 'Failed',
  [PrintState.STANDBY]: 'Standby',
  [PrintState.UNKNOWN]: 'Unknown',
};

function Tile({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="caption" noWrap title={value}>
        {value}
      </Typography>
    </Box>
  );
}

export function PrinterStatusPanel({ snapshot }: PanelProps): JSX.Element {
  const job = snapshot.job;
  const state = job?.state ?? PrintState.UNKNOWN;

  const progressFraction = job?.progress ?? 0;
  const progressPct = Math.round(progressFraction * 100);

  // Remaining-time estimates (seconds).
  const printDuration = job?.printDuration ?? 0;
  const slicerRemaining =
    job?.estimatedTime !== undefined ? Math.max(0, job.estimatedTime - printDuration) : undefined;
  const fileRemaining =
    progressFraction > 0 && printDuration > 0
      ? printDuration / progressFraction - printDuration
      : undefined;
  const remainings = [slicerRemaining, fileRemaining].filter(
    (x): x is number => x !== undefined && x > 0,
  );
  const avgRemaining =
    remainings.length > 0 ? remainings.reduce((a, b) => a + b, 0) / remainings.length : undefined;
  const totalEstimate = avgRemaining !== undefined ? printDuration + avgRemaining : undefined;
  const eta = avgRemaining !== undefined ? new Date(Date.now() + avgRemaining * 1000) : undefined;

  const filamentUsed =
    job?.filamentUsed !== undefined ? `${(job.filamentUsed / 1000).toFixed(2)} m` : '—';

  // Two-column tile grid, interleaved so columns read top-to-bottom.
  const tiles: ReadonlyArray<{ label: string; value: string }> = [
    { label: 'Speed', value: fmtUnit(job?.speed, 'mm/s') },
    { label: 'File ETA', value: fmtDuration(fileRemaining) },
    { label: 'Flow', value: fmtUnit(job?.flow, 'mm³/s', 1) },
    { label: 'Slicer', value: fmtDuration(slicerRemaining) },
    { label: 'Filament', value: filamentUsed },
    { label: 'Total', value: fmtDuration(totalEstimate) },
    { label: 'Layer', value: `${job?.currentLayer ?? 0} / ${job?.totalLayers ?? '—'}` },
    { label: 'Finish', value: fmtClock(eta) },
  ];

  return (
    <Stack spacing={1.25}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        {job && <Chip size="small" label={STATE_LABEL[state]} color={STATE_COLOR[state]} />}
        {snapshot.klippyState && (
          <Typography variant="caption" color="text.secondary">
            Klippy: {snapshot.klippyState}
          </Typography>
        )}
      </Box>

      {snapshot.connection !== ConnectionState.CONNECTED && snapshot.connectionMessage && (
        <Alert severity="warning" sx={{ py: 0, fontSize: 12 }}>
          {snapshot.connectionMessage}
        </Alert>
      )}

      {job?.filename && (
        <Typography variant="body2" noWrap title={job.filename}>
          {job.filename}
        </Typography>
      )}

      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
        <Box sx={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <CircularProgress variant="determinate" value={progressPct} size={72} thickness={3.5} />
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" color="primary">
              {progressPct}%
            </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            flexGrow: 1,
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap: 1.5,
            rowGap: 0.25,
          }}
        >
          {tiles.map((tile) => (
            <Tile key={tile.label} label={tile.label} value={tile.value} />
          ))}
        </Box>

        {job?.thumbnailUrl && (
          <Box
            component="img"
            src={job.thumbnailUrl}
            alt=""
            sx={{
              width: 72,
              height: 72,
              flexShrink: 0,
              objectFit: 'contain',
              borderRadius: 1,
              bgcolor: 'action.hover',
            }}
          />
        )}
      </Box>
    </Stack>
  );
}
