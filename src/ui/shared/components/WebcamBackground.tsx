/**
 * @fileoverview Renders the active printer's webcam feed as a full-popup
 * background layer — the Helmsman equivalent of the Fluidd custom CSS in
 * dev/example-css-custom-style-for-fluidd.css. Sits behind all content at low
 * opacity so panels remain readable.
 *
 * Note: an MJPEG stream over plain http may be blocked as mixed content in the
 * chrome-extension (secure) context; https/reverse-proxied streams work.
 */
import { Box } from '@mui/material';

import type { WebcamRef } from '@/core/model/PrinterSnapshot';

export function WebcamBackground({ webcam }: { webcam?: WebcamRef }): JSX.Element | null {
  if (!webcam) return null;
  const transforms = [
    webcam.flipHorizontal ? 'scaleX(-1)' : '',
    webcam.flipVertical ? 'scaleY(-1)' : '',
    webcam.rotation ? `rotate(${webcam.rotation}deg)` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <Box
        component="img"
        src={webcam.streamUrl}
        alt=""
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // Full visibility — readability comes from the translucent HUD
          // panels (see .helmsman-hud in global.css), not from dimming the feed.
          opacity: 0.9,
          transform: transforms || undefined,
        }}
      />
    </Box>
  );
}
