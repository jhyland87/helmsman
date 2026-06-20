/**
 * @fileoverview Panel registry — the single place that maps a {@link PanelId} to
 * its component, title, and (optional) availability predicate. Add a panel by
 * adding one entry here and one to {@link PanelId}.
 */
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { Box, CircularProgress } from '@mui/material';
import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';

import type { PrinterSnapshot } from '@/core/model/PrinterSnapshot';
import { PanelId } from '@/core/settings/schema';
import type { MessageKey } from '@/ui/shared/i18n/en';
import { BedMeshPanel } from './BedMeshPanel';
import { ConsolePanel } from './ConsolePanel';
import { FansPanel } from './FansPanel';
import { FilesPanel } from './FilesPanel';
import { LimitsPanel } from './LimitsPanel';
import { MacrosPanel } from './MacrosPanel';
import type { PanelProps } from './PanelProps';
import { PrintJobsPanel } from './PrintJobsPanel';
import { PrintQueuePanel } from './PrintQueuePanel';
import { PrintControls, PrinterStatusPanel } from './PrinterStatusPanel';
import { ToolheadPanel } from './ToolheadPanel';
import { WebcamPanel } from './WebcamPanel';

// The temperature chart pulls in Recharts (+ d3 et al, ~250 KB min) — by far
// the heaviest panel dependency. Lazy-load it so that code lands in its own
// async chunk instead of the popup's initial parse.
const TemperaturePanelLazy = lazy(async () => {
  const module = await import('./TemperaturePanel');
  return { default: module.TemperaturePanel };
});

function TemperaturePanelAsync(props: PanelProps): JSX.Element {
  return (
    <Suspense
      fallback={
        <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress size={22} />
        </Box>
      }
    >
      <TemperaturePanelLazy {...props} />
    </Suspense>
  );
}

export interface PanelDefinition {
  readonly id: PanelId;
  readonly titleKey: MessageKey;
  readonly component: ComponentType<PanelProps>;
  /** When provided, the panel is hidden unless the printer supports it. */
  readonly isAvailable?: (snapshot: PrinterSnapshot) => boolean;
  /** Optional controls rendered in the panel's title bar (e.g. pause/cancel). */
  readonly actions?: ComponentType<PanelProps>;
  /**
   * When set, the panel gets an entry in the options-page left nav (using this
   * icon) that opens it as a standalone page — reachable without adding it to
   * the dashboard.
   */
  readonly navIcon?: ReactNode;
}

export const PANELS: Readonly<Record<PanelId, PanelDefinition>> = {
  [PanelId.PRINTER_STATUS]: {
    id: PanelId.PRINTER_STATUS,
    titleKey: 'panel.printer-status',
    component: PrinterStatusPanel,
    actions: PrintControls,
  },
  [PanelId.TEMPERATURE]: {
    id: PanelId.TEMPERATURE,
    titleKey: 'panel.temperature',
    component: TemperaturePanelAsync,
  },
  [PanelId.CONSOLE]: {
    id: PanelId.CONSOLE,
    titleKey: 'panel.console',
    component: ConsolePanel,
  },
  [PanelId.MACROS]: {
    id: PanelId.MACROS,
    titleKey: 'panel.macros',
    component: MacrosPanel,
    isAvailable: (s) => s.capabilities.macroCount > 0,
  },
  [PanelId.FANS]: {
    id: PanelId.FANS,
    titleKey: 'panel.fans',
    component: FansPanel,
    isAvailable: (s) => s.capabilities.fanCount > 0,
  },
  [PanelId.TOOLHEAD]: {
    id: PanelId.TOOLHEAD,
    titleKey: 'panel.toolhead',
    component: ToolheadPanel,
  },
  [PanelId.LIMITS]: {
    id: PanelId.LIMITS,
    titleKey: 'panel.limits',
    component: LimitsPanel,
  },
  [PanelId.WEBCAM]: {
    id: PanelId.WEBCAM,
    titleKey: 'panel.webcam',
    component: WebcamPanel,
    isAvailable: (s) => s.capabilities.hasWebcam,
  },
  [PanelId.PRINT_JOBS]: {
    id: PanelId.PRINT_JOBS,
    titleKey: 'panel.print-jobs',
    component: PrintJobsPanel,
  },
  [PanelId.PRINT_QUEUE]: {
    id: PanelId.PRINT_QUEUE,
    titleKey: 'panel.print-queue',
    component: PrintQueuePanel,
  },
  [PanelId.BED_MESH]: {
    id: PanelId.BED_MESH,
    titleKey: 'panel.bed-mesh',
    component: BedMeshPanel,
    isAvailable: (s) => s.capabilities.hasBedMesh,
  },
  [PanelId.FILES]: {
    id: PanelId.FILES,
    titleKey: 'panel.files',
    component: FilesPanel,
    navIcon: <FolderOpenIcon />,
  },
};
