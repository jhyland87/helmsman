/**
 * @fileoverview Common provider stack for both the popup and options apps:
 * settings → MUI theme + CssBaseline → i18n → background stream.
 */
import { CssBaseline, ThemeProvider } from '@mui/material';
import { useMemo, type ReactNode } from 'react';

import { createAppTheme } from './theme/theme';
import { I18nProvider } from './i18n';
import { BackgroundProvider } from './state/BackgroundContext';
import { ConfirmProvider } from './state/ConfirmContext';
import { SettingsProvider, useSettings } from './state/SettingsContext';

function Themed({ children }: { children: ReactNode }): JSX.Element {
  const { settings } = useSettings();
  const theme = useMemo(
    () => createAppTheme(settings.theme, settings.fontSize),
    [settings.theme, settings.fontSize],
  );
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <I18nProvider language={settings.language}>
        <ConfirmProvider>
          <BackgroundProvider activePrinterId={settings.activePrinterId}>
            {children}
          </BackgroundProvider>
        </ConfirmProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }): JSX.Element {
  return (
    <SettingsProvider>
      <Themed>{children}</Themed>
    </SettingsProvider>
  );
}
