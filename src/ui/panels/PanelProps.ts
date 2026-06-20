/**
 * @fileoverview Shared props passed to every dashboard panel component.
 */
import type { PrinterSnapshot } from '@/core/model/PrinterSnapshot';

export interface PanelProps {
  readonly printerId: string;
  readonly snapshot: PrinterSnapshot;
  /** True when this panel is currently maximized (filling the popup). */
  readonly maximized?: boolean;
}
