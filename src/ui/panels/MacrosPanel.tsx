/**
 * @fileoverview Macros panel — one button per configured gcode macro.
 */
import { Box, Button, Typography } from '@mui/material';

import { api } from '@/ui/shared/api';
import type { PanelProps } from './PanelProps';

export function MacrosPanel({ printerId, snapshot }: PanelProps): JSX.Element {
  if (snapshot.macros.length === 0) {
    return <Typography variant="body2" color="text.secondary">No macros configured.</Typography>;
  }
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {snapshot.macros.map((macro) => (
        <Button
          key={macro.name}
          variant="outlined"
          onClick={() => void api.runMacro(printerId, macro.name)}
          title={macro.description}
        >
          {macro.name}
        </Button>
      ))}
    </Box>
  );
}
