/**
 * @fileoverview System stats page — host info, resource utilization, and MCU
 * info from `machine.system_info` + the live `machine.proc_stats` snapshot.
 */
import { Box, Card, CardContent, LinearProgress, Stack, Typography } from '@mui/material';
import { useEffect, useState, type ReactNode } from 'react';

import type { MachineSystemInfo } from '@jhyland87/moonraker-client';

import type { SystemStatsSnapshot } from '@/core/model/PrinterSnapshot';
import { api } from '@/ui/shared/api';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { useSettings } from '@/ui/shared/state/SettingsContext';

function InfoCard({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" gutterBottom>
          {title}
        </Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

function UsageBar({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <Stack spacing={0.5} sx={{ mb: 1 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2">{value.toFixed(0)}%</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={Math.min(100, value)} />
    </Stack>
  );
}

export function SystemStatsPage(): JSX.Element {
  const { settings } = useSettings();
  const { printers, snapshots } = useBackground();
  const active = settings.activePrinterId ?? printers[0]?.id;
  const system: SystemStatsSnapshot | undefined = active ? snapshots[active]?.system : undefined;
  const [info, setInfo] = useState<MachineSystemInfo>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!active) return;
    let live = true;
    const loadInfo = async (): Promise<void> => {
      try {
        const result = await api.getSystemInfo(active);
        if (live) setInfo(result);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : String(err));
      }
    };
    void loadInfo();
    return () => {
      live = false;
    };
  }, [active]);

  if (!active) return <Typography color="text.secondary">No printer selected.</Typography>;

  const memUsedPct = system?.systemMemory
    ? (system.systemMemory.used / system.systemMemory.total) * 100
    : undefined;

  return (
    <Stack spacing={2}>
      <Typography variant="h6">System Stats</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
        }}
      >
        <InfoCard title="System Info">
            <Row label="Hostname" value={info?.network ? Object.keys(info.network)[0] ?? '—' : '—'} />
            <Row label="Processor" value={info?.cpu_info?.processor ?? info?.cpu_info?.model ?? '—'} />
            <Row label="Cores" value={String(info?.cpu_info?.cpu_count ?? '—')} />
            <Row
              label="OS"
              value={
                info?.distribution
                  ? `${info.distribution.name ?? ''} ${info.distribution.version ?? ''}`.trim() || '—'
                  : '—'
              }
            />
            <Row label="Python" value={info?.python?.version_string ?? '—'} />
        </InfoCard>
        <InfoCard title="Resource Utilization">
            {system?.systemCpuUsage !== undefined && (
              <UsageBar label="System CPU" value={system.systemCpuUsage} />
            )}
            {memUsedPct !== undefined && <UsageBar label="System memory" value={memUsedPct} />}
            {system?.moonrakerCpu !== undefined && (
              <UsageBar label="Moonraker CPU" value={system.moonrakerCpu} />
            )}
            <Row label="CPU temp" value={system?.cpuTemp !== undefined ? `${system.cpuTemp.toFixed(1)} °C` : '—'} />
            <Row
              label="Uptime"
              value={system?.uptime !== undefined ? `${(system.uptime / 3600).toFixed(1)} h` : '—'}
            />
            <Row label="WS connections" value={String(system?.websocketConnections ?? '—')} />
        </InfoCard>
        <InfoCard title="Memory">
            {system?.systemMemory ? (
              <>
                <Row label="Total" value={`${(system.systemMemory.total / 1024).toFixed(0)} MB`} />
                <Row label="Used" value={`${(system.systemMemory.used / 1024).toFixed(0)} MB`} />
                <Row
                  label="Available"
                  value={`${(system.systemMemory.available / 1024).toFixed(0)} MB`}
                />
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No data.
              </Typography>
            )}
        </InfoCard>
        <InfoCard title="Services">
          <Typography variant="body2" color="text.secondary">
            {info?.available_services?.join(', ') ?? '—'}
          </Typography>
        </InfoCard>
      </Box>
    </Stack>
  );
}
