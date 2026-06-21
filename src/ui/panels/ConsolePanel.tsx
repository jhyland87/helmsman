/**
 * @fileoverview Console panel — gcode console with a command input.
 *
 * Moonraker's `server.gcode_store` is the authoritative record of the console:
 * it holds every command *and* response (from any client), each timestamped.
 * The live `notify:gcode_response` stream only carries responses, so we treat
 * the store as the source of truth — fetched on mount and polled for new lines —
 * and append only live lines newer than the store for sub-poll immediacy.
 */
import SendIcon from '@mui/icons-material/Send';
import { Box, IconButton, Stack, TextField } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';

import { LogLineType, type GcodeLogLine } from '@/core/drivers/PrinterDriver';
import { api } from '@/ui/shared/api';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { useT } from '@/ui/shared/i18n';
import type { PanelProps } from './PanelProps';

/** How often to re-pull recent store entries, and how many to fetch each time. */
const REFRESH_MS = 3000;
const REFRESH_COUNT = 200;
const MAX_LINES = 1500;

const keyOf = (line: GcodeLogLine): string => `${line.t}|${line.message}`;

/** Merge store fetches, de-duping by timestamp+message and capping length. */
const mergeEntries = (
  existing: readonly GcodeLogLine[],
  incoming: readonly GcodeLogLine[],
): GcodeLogLine[] => {
  const map = new Map<string, GcodeLogLine>();
  for (const line of existing) map.set(keyOf(line), line);
  for (const line of incoming) map.set(keyOf(line), line);
  const merged = [...map.values()].sort((a, b) => a.t - b.t);
  return merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;
};

const formatTimestamp = (t: number): string =>
  new Date(t).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

export function ConsolePanel({ printerId, maximized }: PanelProps): JSX.Element {
  const t = useT();
  const { logs } = useBackground();
  const [store, setStore] = useState<readonly GcodeLogLine[]>([]);
  const [command, setCommand] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setStore([]);
    // Full store on mount (scrollback), then poll recent lines and merge.
    const loadInitial = async (): Promise<void> => {
      try {
        const lines = await api.getConsoleBacklog(printerId);
        if (active) setStore(lines);
      } catch {
        // best-effort; the printer may be disconnected
      }
    };
    void loadInitial();
    const interval = setInterval(() => {
      void (async () => {
        try {
          const recent = await api.getConsoleBacklog(printerId, REFRESH_COUNT);
          if (active) setStore((prev) => mergeEntries(prev, recent));
        } catch {
          // ignore transient failures
        }
      })();
    }, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [printerId]);

  // Store is the source of truth; show live lines newer than it for immediacy
  // (they fold into the store on the next poll and de-dupe automatically).
  const lines = useMemo(() => {
    const lastT = store.at(-1)?.t ?? 0;
    const live = logs.filter((line) => line.t > lastT);
    return [...store, ...live];
  }, [store, logs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const send = (): void => {
    const script = command.trim();
    if (!script) return;
    void api.sendGcode(printerId, script);
    setCommand('');
  };

  return (
    <Stack spacing={1} sx={maximized ? { height: '100%' } : undefined}>
      <Box
        ref={scrollRef}
        sx={{
          ...(maximized ? { flex: 1, minHeight: 0 } : { height: 180 }),
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          bgcolor: 'action.hover',
          borderRadius: 1,
          p: 1,
        }}
      >
        {lines.map((line, i) => (
          <Box key={`${line.t}-${i}`} sx={{ display: 'flex', gap: 1 }}>
            <Box
              component="span"
              sx={{ color: 'text.disabled', flexShrink: 0, userSelect: 'none' }}
            >
              {formatTimestamp(line.t)}
            </Box>
            <Box
              component="span"
              sx={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: line.type === LogLineType.COMMAND ? 'primary.main' : 'text.primary',
              }}
            >
              {line.type === LogLineType.COMMAND ? '> ' : ''}
              {line.message}
            </Box>
          </Box>
        ))}
      </Box>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          placeholder={t('console.placeholder')}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          slotProps={{ htmlInput: { spellCheck: false, autoCapitalize: 'off' } }}
        />
        <IconButton color="primary" onClick={send} aria-label={t('console.send')}>
          <SendIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Stack>
  );
}
