/**
 * @fileoverview Collapsible / maximizable dashboard panel wrapper (MUI Card).
 */
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import { Box, Card, Collapse, IconButton, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function Panel({
  title,
  collapsed,
  onToggleCollapse,
  maximized = false,
  onToggleMaximize,
  action,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** When true, the panel is shown full-size (collapse is ignored). */
  maximized?: boolean;
  /** Provide to show a maximize/restore button. */
  onToggleMaximize?: () => void;
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const showContent = maximized || !collapsed;

  return (
    <Card className="helmsman-panel">
      <Box
        className="helmsman-panel-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          cursor: maximized ? 'default' : 'pointer',
          borderBottom: showContent ? 1 : 'none',
          borderColor: 'divider',
        }}
        onClick={maximized ? undefined : onToggleCollapse}
      >
        <Typography variant="subtitle2" sx={{ flexGrow: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'flex', alignItems: 'center' }}>
          {action}
        </Box>
        {onToggleMaximize && (
          <IconButton
            size="small"
            aria-label={maximized ? 'restore' : 'maximize'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMaximize();
            }}
          >
            {maximized ? (
              <FullscreenExitIcon fontSize="small" />
            ) : (
              <FullscreenIcon fontSize="small" />
            )}
          </IconButton>
        )}
        {!maximized && (
          <IconButton size="small" aria-label={collapsed ? 'expand' : 'collapse'}>
            {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>
      {maximized ? (
        <Box sx={{ p: 1.5 }}>{children}</Box>
      ) : (
        <Collapse in={!collapsed} unmountOnExit>
          <Box sx={{ p: 1.5 }}>{children}</Box>
        </Collapse>
      )}
    </Card>
  );
}
