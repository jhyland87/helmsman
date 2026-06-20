/**
 * @fileoverview Dropdown to choose the active printer, with a live status dot.
 */
import { Box, MenuItem, Select, type SelectChangeEvent } from '@mui/material';

import { ConnectionState } from '@/core/model/PrinterSnapshot';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { ConnectionDot } from './ConnectionBadge';

export function PrinterSelector({
  activePrinterId,
  onChange,
}: {
  activePrinterId?: string;
  onChange: (printerId: string) => void;
}): JSX.Element | null {
  const { printers, snapshots } = useBackground();
  if (printers.length === 0) return null;

  const handleChange = (event: SelectChangeEvent): void => onChange(event.target.value);

  return (
    <Select
      size="small"
      value={activePrinterId ?? ''}
      onChange={handleChange}
      sx={{ minWidth: 160 }}
      displayEmpty
    >
      {printers.map((printer) => {
        const state = snapshots[printer.id]?.connection ?? ConnectionState.DISCONNECTED;
        return (
          <MenuItem key={printer.id} value={printer.id}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ConnectionDot state={state} />
              {printer.name}
            </Box>
          </MenuItem>
        );
      })}
    </Select>
  );
}
