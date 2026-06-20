/**
 * @fileoverview MUI theme factory driven by Helmsman's theme + font-size
 * settings.
 */
import { createTheme, type Theme } from '@mui/material/styles';

import { FontSize, ThemeMode } from '@/core/settings/schema';

const FONT_SIZE_PX: Readonly<Record<FontSize, number>> = {
  [FontSize.SMALL]: 12,
  [FontSize.MEDIUM]: 14,
  [FontSize.LARGE]: 16,
};

/** Resolve `ThemeMode.SYSTEM` to a concrete light/dark via `matchMedia`. */
export const resolvePaletteMode = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === ThemeMode.LIGHT) return 'light';
  if (mode === ThemeMode.DARK) return 'dark';
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

/** Build the MUI theme for the given settings. */
export const createAppTheme = (mode: ThemeMode, fontSize: FontSize): Theme =>
  createTheme({
    // Expose the palette as CSS variables (--mui-palette-*) so plain CSS
    // (e.g. the HUD styles in global.css) can derive theme-correct colors.
    cssVariables: true,
    palette: {
      mode: resolvePaletteMode(mode),
      primary: { main: '#12a3b4' },
      secondary: { main: '#f59e0b' },
    },
    typography: { fontSize: FONT_SIZE_PX[fontSize] },
    shape: { borderRadius: 10 },
    components: {
      MuiCard: { defaultProps: { variant: 'outlined' } },
      MuiButton: { defaultProps: { size: 'small' } },
    },
  });
