/**
 * @fileoverview History & statistics page — aggregate totals and recent jobs.
 */
import { Card, CardContent, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

import type { HistoryJob, JobTotals } from '@jhyland87/moonraker-client';

import { api } from '@/ui/shared/api';
import { DataTable, type DataTableColumn } from '@/ui/shared/components/DataTable';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { useSettings } from '@/ui/shared/state/SettingsContext';

const formatHours = (seconds: number): string => `${(seconds / 3600).toFixed(1)} h`;
const formatMeters = (mm: number): string => `${(mm / 1000).toFixed(1)} m`;
const formatDate = (unixSeconds?: number): string =>
  unixSeconds ? new Date(unixSeconds * 1000).toLocaleString() : '—';

const HISTORY_COLUMNS: readonly DataTableColumn<HistoryJob>[] = [
  {
    id: 'file',
    label: 'File',
    fixed: true,
    sortValue: (job) => job.filename.toLowerCase(),
    render: (job) => (
      <Typography
        variant="body2"
        sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={job.filename}
      >
        {job.filename}
      </Typography>
    ),
  },
  { id: 'status', label: 'Status', sortValue: (job) => job.status, render: (job) => job.status },
  {
    id: 'start',
    label: 'Started',
    sortValue: (job) => job.start_time,
    render: (job) => formatDate(job.start_time),
  },
  {
    id: 'duration',
    label: 'Duration',
    align: 'right',
    sortValue: (job) => job.print_duration,
    render: (job) => formatHours(job.print_duration),
  },
  {
    id: 'filament',
    label: 'Filament',
    align: 'right',
    sortValue: (job) => job.filament_used,
    render: (job) => formatMeters(job.filament_used),
  },
];

function TotalCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Card variant="outlined" sx={{ minWidth: 150, flex: 1 }}>
      <CardContent>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h6">{value}</Typography>
      </CardContent>
    </Card>
  );
}

export function HistoryPage(): JSX.Element {
  const { settings } = useSettings();
  const { printers } = useBackground();
  const active = settings.activePrinterId ?? printers[0]?.id;
  const [jobs, setJobs] = useState<readonly HistoryJob[]>([]);
  const [totals, setTotals] = useState<JobTotals>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!active) return;
    let live = true;
    setError(undefined);
    const loadHistory = async (): Promise<void> => {
      try {
        const [history, totalsResult] = await Promise.all([
          api.getHistory(active, { limit: 50, order: 'desc' }),
          api.getHistoryTotals(active),
        ]);
        if (!live) return;
        setJobs(history.jobs);
        setTotals(totalsResult.job_totals);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void loadHistory();
    return () => {
      live = false;
    };
  }, [active]);

  if (!active) return <Typography color="text.secondary">No printer selected.</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h6">History &amp; Statistics</Typography>
      {error && <Typography color="error">{error}</Typography>}
      {totals && (
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
          <TotalCard label="Total jobs" value={String(totals.total_jobs)} />
          <TotalCard label="Print time" value={formatHours(totals.total_print_time)} />
          <TotalCard label="Filament" value={`${(totals.total_filament_used / 1000).toFixed(1)} m`} />
          <TotalCard label="Longest print" value={formatHours(totals.longest_print)} />
        </Stack>
      )}
      <Card variant="outlined" sx={{ p: 1 }}>
        <DataTable<HistoryJob>
          tableId="history"
          columns={HISTORY_COLUMNS}
          rows={jobs}
          getRowKey={(job) => String(job.job_id)}
          defaultSort={{ column: 'start', direction: 'desc' }}
          emptyMessage="No jobs recorded."
          searchPlaceholder="Search jobs…"
        />
      </Card>
    </Stack>
  );
}
