/**
 * @fileoverview Bed mesh panel — canvas heatmap of the probed mesh (scaffolded;
 * extend with a 3D view or per-point readout).
 */
import { Box, Stack, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';

import type { BedMeshSnapshot } from '@/core/model/PrinterSnapshot';
import type { PanelProps } from './PanelProps';

/** Map a normalized 0..1 value to a blue→green→red heatmap color. */
const heatColor = (norm: number): string => {
  const clamped = Math.max(0, Math.min(1, norm));
  const hue = (1 - clamped) * 240; // 240=blue (low) → 0=red (high)
  return `hsl(${hue}, 85%, 50%)`;
};

const drawMesh = (canvas: HTMLCanvasElement, mesh: BedMeshSnapshot): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rows = mesh.matrix.length;
  const cols = mesh.matrix[0]?.length ?? 0;
  if (rows === 0 || cols === 0) return;
  const { width, height } = canvas;
  const cellW = width / cols;
  const cellH = height / rows;
  const span = mesh.rangeMax - mesh.rangeMin || 1;
  ctx.clearRect(0, 0, width, height);
  for (let r = 0; r < rows; r += 1) {
    const row = mesh.matrix[r] ?? [];
    for (let c = 0; c < cols; c += 1) {
      const z = row[c] ?? 0;
      ctx.fillStyle = heatColor((z - mesh.rangeMin) / span);
      // Flip Y so the front of the bed is at the bottom.
      ctx.fillRect(c * cellW, (rows - 1 - r) * cellH, cellW + 1, cellH + 1);
    }
  }
};

export function BedMeshPanel({ snapshot }: PanelProps): JSX.Element {
  const mesh = snapshot.bedMesh;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (mesh && canvasRef.current) drawMesh(canvasRef.current, mesh);
  }, [mesh]);

  if (!mesh) {
    return <Typography variant="body2" color="text.secondary">No bed mesh data.</Typography>;
  }

  return (
    <Stack spacing={1}>
      <Box
        component="canvas"
        ref={canvasRef}
        width={280}
        height={200}
        sx={{ width: '100%', height: 'auto', borderRadius: 1, border: 1, borderColor: 'divider' }}
      />
      <Typography variant="caption" color="text.secondary">
        {mesh.profileName ? `${mesh.profileName} · ` : ''}
        range {mesh.rangeMin.toFixed(3)} … {mesh.rangeMax.toFixed(3)} mm
      </Typography>
    </Stack>
  );
}
