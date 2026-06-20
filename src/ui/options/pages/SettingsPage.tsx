/**
 * @fileoverview Settings page — theme, font size, language, storage backends,
 * and the webcam-background toggle.
 */
import {
  Alert,
  Button,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';

import {
  DashboardStorageMode,
  FontSize,
  SettingsStorageMode,
  ThemeMode,
} from '@/core/settings/schema';
import {
  isFileSystemAccessSupported,
  pickSettingsFile,
  writeSettingsFile,
} from '@/core/settings/fsHandle';
import { isEnumValue } from '@/core/util/guards';
import { availableLanguages, useT } from '@/ui/shared/i18n';
import { useSettings } from '@/ui/shared/state/SettingsContext';

export function SettingsPage(): JSX.Element {
  const t = useT();
  const { settings, update } = useSettings();
  const [fileNotice, setFileNotice] = useState<string>();

  const chooseFile = async (): Promise<void> => {
    try {
      await pickSettingsFile();
      await writeSettingsFile(settings);
      await update({ settingsStorage: SettingsStorageMode.FILE });
      setFileNotice('Settings file selected. Settings will mirror to it.');
    } catch (err) {
      setFileNotice(err instanceof Error ? err.message : 'Could not select a file');
    }
  };

  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <Typography variant="h6">{t('nav.settings')}</Typography>

      <TextField
        select
        label={t('settings.theme')}
        value={settings.theme}
        onChange={(e) => {
          if (isEnumValue(ThemeMode, e.target.value)) void update({ theme: e.target.value });
        }}
        size="small"
      >
        <MenuItem value={ThemeMode.SYSTEM}>System</MenuItem>
        <MenuItem value={ThemeMode.LIGHT}>Light</MenuItem>
        <MenuItem value={ThemeMode.DARK}>Dark</MenuItem>
      </TextField>

      <TextField
        select
        label={t('settings.fontSize')}
        value={settings.fontSize}
        onChange={(e) => {
          if (isEnumValue(FontSize, e.target.value)) void update({ fontSize: e.target.value });
        }}
        size="small"
      >
        <MenuItem value={FontSize.SMALL}>Small</MenuItem>
        <MenuItem value={FontSize.MEDIUM}>Medium</MenuItem>
        <MenuItem value={FontSize.LARGE}>Large</MenuItem>
      </TextField>

      <TextField
        select
        label={t('settings.language')}
        value={settings.language}
        onChange={(e) => void update({ language: e.target.value })}
        size="small"
      >
        {availableLanguages.map((lang) => (
          <MenuItem key={lang} value={lang}>
            {lang}
          </MenuItem>
        ))}
      </TextField>

      <Stack spacing={1}>
        <TextField
          select
          label={t('settings.storage')}
          value={settings.settingsStorage}
          onChange={(e) => {
            if (isEnumValue(SettingsStorageMode, e.target.value)) {
              void update({ settingsStorage: e.target.value });
            }
          }}
          size="small"
        >
          <MenuItem value={SettingsStorageMode.LOCAL}>Extension storage</MenuItem>
          <MenuItem value={SettingsStorageMode.FILE} disabled={!isFileSystemAccessSupported()}>
            File on disk
          </MenuItem>
        </TextField>
        {settings.settingsStorage === SettingsStorageMode.FILE && (
          <Button variant="outlined" onClick={() => void chooseFile()} sx={{ alignSelf: 'start' }}>
            Choose settings file…
          </Button>
        )}
        {fileNotice && <Alert severity="info">{fileNotice}</Alert>}
        <Typography variant="caption" color="text.secondary">
          Extensions can't read a fixed home-directory path; the file is one you pick once and is
          re-used. Extension storage stays the source of truth for the background worker.
        </Typography>
      </Stack>

      <TextField
        select
        label={t('settings.dashboardStorage')}
        value={settings.dashboardStorage}
        onChange={(e) => {
          if (isEnumValue(DashboardStorageMode, e.target.value)) {
            void update({ dashboardStorage: e.target.value });
          }
        }}
        size="small"
      >
        <MenuItem value={DashboardStorageMode.LOCAL}>Extension storage</MenuItem>
        <MenuItem value={DashboardStorageMode.PRINTER_DB}>Moonraker database (per-printer)</MenuItem>
      </TextField>

      <FormControlLabel
        control={
          <Switch
            checked={settings.webcamBackground}
            onChange={(e) => void update({ webcamBackground: e.target.checked })}
          />
        }
        label={t('settings.webcamBackground')}
      />
      <Alert severity="info">
        A webcam stream served over plain http may be blocked as mixed content in the popup. Use an
        https / reverse-proxied stream for the background and webcam panel to load reliably.
      </Alert>

      <FormControlLabel
        control={
          <Switch
            checked={settings.confirmEmergencyStop}
            onChange={(e) => void update({ confirmEmergencyStop: e.target.checked })}
          />
        }
        label={t('settings.confirmEmergencyStop')}
      />
      <FormControlLabel
        control={
          <Switch
            checked={settings.confirmPrintActions}
            onChange={(e) => void update({ confirmPrintActions: e.target.checked })}
          />
        }
        label={t('settings.confirmPrintActions')}
      />
    </Stack>
  );
}
