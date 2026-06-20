/**
 * @fileoverview Printers page — add, edit, and remove printer connections.
 */
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import { isPrinterType, supportedPrinterTypes } from '@/core/drivers/registry';
import { ConnectionState } from '@/core/model/PrinterSnapshot';
import { createPrinterConfig, type PrinterConfig } from '@/core/printers/printerConfig';
import { api } from '@/ui/shared/api';
import { ConnectionBadge } from '@/ui/shared/components/ConnectionBadge';
import { useBackground } from '@/ui/shared/state/BackgroundContext';

const blank = (): PrinterConfig => createPrinterConfig({ name: '', host: '' });

function PrinterForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: PrinterConfig;
  onSaved: () => void;
  onCancel: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<PrinterConfig>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof PrinterConfig>(key: K, value: PrinterConfig[K]): void =>
    setDraft((d) => ({ ...d, [key]: value }));

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.savePrinter(draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Name"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              select
              label="Type"
              value={draft.type}
              onChange={(e) => {
                if (isPrinterType(e.target.value)) set('type', e.target.value);
              }}
              size="small"
              sx={{ minWidth: 140 }}
            >
              {supportedPrinterTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Host / IP"
              value={draft.host}
              onChange={(e) => set('host', e.target.value)}
              fullWidth
              size="small"
              placeholder="192.168.1.50"
            />
            <TextField
              label="Port"
              type="number"
              value={draft.port}
              onChange={(e) => set('port', Number(e.target.value))}
              size="small"
              sx={{ width: 120 }}
            />
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <TextField
              label="WebSocket path"
              value={draft.path ?? ''}
              onChange={(e) => set('path', e.target.value)}
              size="small"
              sx={{ width: 200 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.secure ?? false}
                  onChange={(e) => set('secure', e.target.checked)}
                />
              }
              label="TLS (wss/https)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={draft.enabled}
                  onChange={(e) => set('enabled', e.target.checked)}
                />
              }
              label="Enabled"
            />
          </Stack>
          <TextField
            label="API key (optional)"
            value={draft.apiKey ?? ''}
            onChange={(e) => set('apiKey', e.target.value || undefined)}
            size="small"
            fullWidth
            placeholder="Only needed if Moonraker's [authorization] requires a key"
          />
          <TextField
            label="Webcam URL (optional)"
            value={draft.webcamUrl ?? ''}
            onChange={(e) => set('webcamUrl', e.target.value || undefined)}
            size="small"
            fullWidth
            placeholder="http://192.168.1.50:8080/?action=stream"
          />
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => void save()}
              disabled={saving || !draft.name || !draft.host}
            >
              Save
            </Button>
            <Button onClick={onCancel}>Cancel</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function PrintersPage(): JSX.Element {
  const { printers, snapshots } = useBackground();
  const [editing, setEditing] = useState<PrinterConfig | undefined>();

  const remove = async (id: string): Promise<void> => {
    await api.deletePrinter(id);
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Printers</Typography>
        {!editing && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={() => setEditing(blank())}>
            Add printer
          </Button>
        )}
      </Box>

      {editing && (
        <PrinterForm
          initial={editing}
          onSaved={() => setEditing(undefined)}
          onCancel={() => setEditing(undefined)}
        />
      )}

      {printers.map((printer) => (
        <Card key={printer.id} variant="outlined">
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ flexGrow: 1 }}>
              <Typography variant="subtitle1">{printer.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {printer.type} · {printer.host}:{printer.port}
                {printer.path ?? ''}
              </Typography>
            </Box>
            <ConnectionBadge
              state={snapshots[printer.id]?.connection ?? ConnectionState.DISCONNECTED}
            />
            <Button size="small" onClick={() => setEditing(printer)}>
              Edit
            </Button>
            <IconButton color="error" onClick={() => void remove(printer.id)} aria-label="delete">
              <DeleteIcon />
            </IconButton>
          </CardContent>
        </Card>
      ))}

      {printers.length === 0 && !editing && (
        <Typography color="text.secondary">No printers yet. Add one to get started.</Typography>
      )}
    </Stack>
  );
}
