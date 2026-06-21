/**
 * @fileoverview Webcam panel — renders the printer's configured camera stream.
 * Clicking the feed toggles a magnifier: while on, the image zooms toward the
 * cursor as it moves, and scrolling adjusts the zoom level. A second click
 * zooms back out.
 */
import { Box, MenuItem, Select, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState, type MouseEvent } from 'react';

import type { PanelProps } from './PanelProps';

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const clampPct = (n: number): number => Math.max(0, Math.min(100, n));

export function WebcamPanel({ snapshot, maximized }: PanelProps): JSX.Element {
  const webcams = snapshot.webcams;
  const [index, setIndex] = useState(0);
  const [zoomOn, setZoomOn] = useState(false);
  const [zoom, setZoom] = useState(2.5);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);
  const webcam = webcams[index] ?? webcams[0];

  // Wheel-to-zoom needs a non-passive listener so we can preventDefault and not
  // scroll the popup while zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !zoomOn) return undefined;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY < 0 ? 0.5 : -0.5))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomOn]);

  if (!webcam) {
    return <Typography variant="body2" color="text.secondary">No webcam configured.</Typography>;
  }

  const transform = [
    webcam.flipHorizontal ? 'scaleX(-1)' : '',
    webcam.flipVertical ? 'scaleY(-1)' : '',
    webcam.rotation ? `rotate(${webcam.rotation}deg)` : '',
    zoomOn ? `scale(${zoom})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const focalPoint = (e: MouseEvent<HTMLDivElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * 100;
    let y = ((e.clientY - rect.top) / rect.height) * 100;
    // Mirror the focal point so the zoom stays under the cursor on flipped feeds.
    if (webcam.flipHorizontal) x = 100 - x;
    if (webcam.flipVertical) y = 100 - y;
    return { x: clampPct(x), y: clampPct(y) };
  };

  const onMove = (e: MouseEvent<HTMLDivElement>): void => {
    if (zoomOn) setOrigin(focalPoint(e));
  };

  // Click toggles the magnifier; zoom in right where the user clicked.
  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (!zoomOn) setOrigin(focalPoint(e));
    setZoomOn((v) => !v);
  };

  return (
    <Stack spacing={1} sx={maximized ? { height: '100%' } : undefined}>
      {webcams.length > 1 && (
        <Select size="small" value={index} onChange={(e) => setIndex(Number(e.target.value))}>
          {webcams.map((w, i) => (
            <MenuItem key={w.name} value={i}>
              {w.name}
            </MenuItem>
          ))}
        </Select>
      )}

      <Box
        ref={containerRef}
        onClick={onClick}
        onMouseMove={onMove}
        //title={zoomOn ? 'Click to zoom out · scroll to adjust zoom' : 'Click to magnify'}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 1,
          lineHeight: 0,
          cursor: zoomOn ? 'zoom-out' : 'zoom-in',
          ...(maximized ? { flex: 1, minHeight: 0, display: 'flex' } : {}),
        }}
      >
        <Box
          component="img"
          src={webcam.streamUrl}
          alt={webcam.name}
          sx={{
            width: '100%',
            objectFit: 'contain',
            display: 'block',
            ...(maximized ? { height: '100%', minHeight: 0 } : {}),
            transform: transform || undefined,
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transition: 'transform 60ms linear',
          }}
        />
      </Box>
    </Stack>
  );
}
