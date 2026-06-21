/**
 * @fileoverview Options app shell — left nav + page content, with a printer
 * selector in the header.
 */
import DashboardIcon from '@mui/icons-material/Dashboard';
import HistoryIcon from '@mui/icons-material/History';
import MemoryIcon from '@mui/icons-material/Memory';
import PrintIcon from '@mui/icons-material/Print';
import SettingsIcon from '@mui/icons-material/Settings';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {
  Box,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { useState, type ReactNode } from 'react';

import { PanelId } from '@/core/settings/schema';
import { isEnumValue } from '@/core/util/guards';
import { PANELS, type PanelDefinition } from '@/ui/panels/registry';
import { Dashboard } from '@/ui/shared/components/Dashboard';
import { EmergencyStopButton } from '@/ui/shared/components/EmergencyStopButton';
import { PrinterSelector } from '@/ui/shared/components/PrinterSelector';
import { useT } from '@/ui/shared/i18n';
import type { MessageKey } from '@/ui/shared/i18n/en';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { useSettings } from '@/ui/shared/state/SettingsContext';
import { DashboardLayoutPage } from './pages/DashboardLayoutPage';
import { HistoryPage } from './pages/HistoryPage';
import { PrintersPage } from './pages/PrintersPage';
import { SettingsPage } from './pages/SettingsPage';
import { SystemStatsPage } from './pages/SystemStatsPage';

enum Page {
  DASHBOARD = 'dashboard',
  LAYOUT = 'layout',
  PRINTERS = 'printers',
  HISTORY = 'history',
  SYSTEM = 'system',
  SETTINGS = 'settings',
}

interface NavItem {
  readonly page: Page;
  readonly labelKey: MessageKey;
  readonly icon: ReactNode;
}

const NAV: readonly NavItem[] = [
  { page: Page.DASHBOARD, labelKey: 'nav.dashboard', icon: <DashboardIcon /> },
  { page: Page.LAYOUT, labelKey: 'nav.layout', icon: <ViewColumnIcon /> },
  { page: Page.PRINTERS, labelKey: 'nav.printers', icon: <PrintIcon /> },
  { page: Page.HISTORY, labelKey: 'nav.history', icon: <HistoryIcon /> },
  { page: Page.SYSTEM, labelKey: 'nav.system', icon: <MemoryIcon /> },
  { page: Page.SETTINGS, labelKey: 'nav.settings', icon: <SettingsIcon /> },
];

function OptionsDashboard(): JSX.Element {
  const { settings } = useSettings();
  const { printers, snapshots } = useBackground();
  const active = settings.activePrinterId ?? printers[0]?.id;
  const snapshot = active ? snapshots[active] : undefined;
  if (!active || !snapshot) {
    return <Typography color="text.secondary">No printer selected.</Typography>;
  }
  return <Dashboard printerId={active} snapshot={snapshot} />;
}

/** Renders a single panel as a standalone page (its nav-accessible view). */
function PanelPage({ def }: { def: PanelDefinition }): JSX.Element {
  const t = useT();
  const { settings } = useSettings();
  const { printers, snapshots } = useBackground();
  const active = settings.activePrinterId ?? printers[0]?.id;
  const snapshot = active ? snapshots[active] : undefined;
  if (!active || !snapshot) {
    return <Typography color="text.secondary">No printer selected.</Typography>;
  }
  const Component = def.component;
  return (
    <Stack spacing={2}>
      <Typography variant="h6">{t(def.titleKey)}</Typography>
      <Component printerId={active} snapshot={snapshot} maximized />
    </Stack>
  );
}

/** Panels that opt into the left nav via `navIcon`, in registry order. */
const PANEL_NAV: readonly PanelDefinition[] = Object.values(PANELS).filter(
  (def): def is PanelDefinition => def.navIcon !== undefined,
);

export function OptionsApp(): JSX.Element {
  const t = useT();
  const { settings, update } = useSettings();
  const { printers } = useBackground();
  // A page is either a static Page or a panel id (panels that set `navIcon`).
  const [page, setPage] = useState<string>(Page.DASHBOARD);

  const renderPage = (): ReactNode => {
    if (isEnumValue(PanelId, page)) {
      return <PanelPage def={PANELS[page]} />;
    }
    switch (page) {
      case Page.DASHBOARD:
        return <OptionsDashboard />;
      case Page.LAYOUT:
        return <DashboardLayoutPage />;
      case Page.PRINTERS:
        return <PrintersPage />;
      case Page.HISTORY:
        return <HistoryPage />;
      case Page.SYSTEM:
        return <SystemStatsPage />;
      case Page.SETTINGS:
        return <SettingsPage />;
      default:
        return null;
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box
        component="nav"
        sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider' }}
      >
        <Typography variant="h6" sx={{ p: 2, fontWeight: 700 }}>
          {t('app.title')}
        </Typography>
        <Divider />
        <List>
          {NAV.map((item) => (
            <ListItemButton
              key={item.page}
              selected={page === item.page}
              onClick={() => setPage(item.page)}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={t(item.labelKey)} />
            </ListItemButton>
          ))}
          {PANEL_NAV.length > 0 && <Divider sx={{ my: 1 }} />}
          {PANEL_NAV.map((def) => (
            <ListItemButton
              key={def.id}
              selected={page === def.id}
              onClick={() => setPage(def.id)}
            >
              <ListItemIcon>{def.navIcon}</ListItemIcon>
              <ListItemText primary={t(def.titleKey)} />
            </ListItemButton>
          ))}
        </List>
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
          <PrinterSelector
            activePrinterId={settings.activePrinterId}
            onChange={(id) => void update({ activePrinterId: id })}
          />
          <EmergencyStopButton printerId={settings.activePrinterId ?? printers[0]?.id} />
        </Box>
        {renderPage()}
      </Box>
    </Box>
  );
}
