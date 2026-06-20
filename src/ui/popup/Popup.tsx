/**
 * @fileoverview Popup dashboard view.
 */
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import SettingsIcon from '@mui/icons-material/Settings';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { useEffect } from 'react';

import { Dashboard } from '@/ui/shared/components/Dashboard';
import { EmergencyStopButton } from '@/ui/shared/components/EmergencyStopButton';
import { PrinterSelector } from '@/ui/shared/components/PrinterSelector';
import { WebcamBackground } from '@/ui/shared/components/WebcamBackground';
import { useT } from '@/ui/shared/i18n';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { useSettings } from '@/ui/shared/state/SettingsContext';

// Chrome caps action popups at 800×600px; max it out.
const POPUP_WIDTH = 800;
const POPUP_MAX_HEIGHT = 600;

const openOptions = (): void => {
  void chrome.runtime.openOptionsPage();
};

// Open the dashboard in a full browser tab — the only way to exceed the popup
// cap. If it's already open in a tab, focus that one instead of duplicating it.
const openInTab = async (): Promise<void> => {
  const url = chrome.runtime.getURL('options.html');
  const [existing] = await chrome.tabs.query({ url });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
};

export function Popup(): JSX.Element {
  const t = useT();
  const { settings, update } = useSettings();
  const { ready, printers, activeSnapshot } = useBackground();
  const activeId = settings.activePrinterId;

  // Auto-select the first printer when none is selected (or the saved one is gone).
  useEffect(() => {
    if (!ready || printers.length === 0) return;
    if (!activeId || !printers.some((p) => p.id === activeId)) {
      void update({ activePrinterId: printers[0]?.id });
    }
  }, [ready, printers, activeId, update]);

  const webcam = settings.webcamBackground ? activeSnapshot?.webcams[0] : undefined;

  return (
    <Box
      className={webcam ? 'helmsman-hud' : undefined}
      sx={{ width: POPUP_WIDTH, maxHeight: POPUP_MAX_HEIGHT, overflowY: 'auto', position: 'relative' }}
    >
      <WebcamBackground webcam={webcam} />
      <Box className="helmsman-content" sx={{ p: 1.5 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', mb: 1.5 }}
        >
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            {t('app.title')}
          </Typography>
          <PrinterSelector
            activePrinterId={activeId}
            onChange={(id) => void update({ activePrinterId: id })}
          />
          <EmergencyStopButton printerId={activeId} />
          <IconButton onClick={() => void openInTab()} aria-label="Open in tab" title="Open in full tab">
            <OpenInFullIcon fontSize="small" />
          </IconButton>
          <IconButton onClick={openOptions} aria-label={t('app.settings')}>
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Stack>

        {printers.length === 0 ? (
          <Stack spacing={1.5} sx={{ alignItems: 'center', py: 6 }}>
            <Typography color="text.secondary">{t('app.noPrinters')}</Typography>
            <Button variant="contained" onClick={openOptions}>
              {t('app.addPrinter')}
            </Button>
          </Stack>
        ) : activeId && activeSnapshot ? (
          <Dashboard printerId={activeId} snapshot={activeSnapshot} />
        ) : (
          <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
            {t('conn.connecting')}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
