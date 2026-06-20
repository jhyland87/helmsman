/**
 * @fileoverview Console panel — buffered + live gcode log with a command input.
 */
import SendIcon from '@mui/icons-material/Send';
import { Box, IconButton, Stack, TextField } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';

import { LogLineType, type GcodeLogLine } from '@/core/drivers/PrinterDriver';
import { api } from '@/ui/shared/api';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { useT } from '@/ui/shared/i18n';
import type { PanelProps } from './PanelProps';

export function ConsolePanel({ printerId, maximized }: PanelProps): JSX.Element {
  const t = useT();
  const { logs } = useBackground();
  const [backlog, setBacklog] = useState<readonly GcodeLogLine[]>([]);
  const [command, setCommand] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const loadBacklog = async (): Promise<void> => {
      try {
        const lines = await api.getConsoleBacklog(printerId);
        if (active) setBacklog(lines);
      } catch {
        // backlog is best-effort; ignore (printer may be disconnected)
      }
    };
    void loadBacklog();
    return () => {
      active = false;
    };
  }, [printerId]);

  // Backlog timestamps precede live logs; show backlog then the live stream.
  const lines = useMemo(() => [...backlog, ...logs], [backlog, logs]);

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
    <Stack spacing={1}>
      <Box
        ref={scrollRef}
        sx={{
          height: maximized ? 440 : 180,
          overflowY: 'auto',
          fontFamily: 'monospace',
          fontSize: 12,
          bgcolor: 'action.hover',
          borderRadius: 1,
          p: 1,
        }}
      >
        {lines.map((line, i) => (
          <Box
            key={`${line.t}-${i}`}
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: line.type === LogLineType.COMMAND ? 'primary.main' : 'text.primary',
            }}
          >
            {line.type === LogLineType.COMMAND ? '> ' : ''}
            {line.message}
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
