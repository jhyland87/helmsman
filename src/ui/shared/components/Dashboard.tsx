/**
 * @fileoverview Renders the dashboard: the saved column layout of enabled,
 * capability-available panels, each wrapped in a collapsible {@link Panel}.
 * Any panel can be maximized to fill the popup (transient view state).
 */
import { Box } from '@mui/material';

import type { PrinterSnapshot } from '@/core/model/PrinterSnapshot';
import type { DashboardCard, PanelId } from '@/core/settings/schema';
import { PANELS, type PanelDefinition } from '@/ui/panels/registry';
import { useT } from '@/ui/shared/i18n';
import { useDashboard } from '@/ui/shared/state/useDashboard';
import { Panel } from './Panel';

export function Dashboard({
  printerId,
  snapshot,
}: {
  printerId: string;
  snapshot: PrinterSnapshot;
}): JSX.Element {
  const t = useT();
  const { dashboard, toggleCollapse, update } = useDashboard(printerId);
  // Persisted so the maximized view resumes when the popup reopens.
  const maximized = dashboard.maximizedPanel;

  const isAvailable = (def: PanelDefinition): boolean =>
    !def.isAvailable || def.isAvailable(snapshot);

  const toggleMaximize = (id: PanelId): void =>
    update({ maximizedPanel: maximized === id ? undefined : id });

  // Maximized view: render only the chosen panel, filling the popup.
  if (maximized) {
    const def = PANELS[maximized];
    if (def && isAvailable(def)) {
      const Component = def.component;
      const Actions = def.actions;
      return (
        <Panel
          title={t(def.titleKey)}
          collapsed={false}
          onToggleCollapse={() => undefined}
          maximized
          onToggleMaximize={() => update({ maximizedPanel: undefined })}
          action={Actions ? <Actions printerId={printerId} snapshot={snapshot} maximized /> : undefined}
        >
          <Component printerId={printerId} snapshot={snapshot} maximized />
        </Panel>
      );
    }
  }

  const renderCard = (card: DashboardCard): JSX.Element | null => {
    if (!card.enabled) return null;
    const def = PANELS[card.id];
    if (!def || !isAvailable(def)) return null;
    const Component = def.component;
    const Actions = def.actions;
    return (
      <Panel
        key={card.id}
        title={t(def.titleKey)}
        collapsed={card.collapsed}
        onToggleCollapse={() => toggleCollapse(card.id)}
        onToggleMaximize={() => toggleMaximize(card.id)}
        action={Actions ? <Actions printerId={printerId} snapshot={snapshot} /> : undefined}
      >
        <Component printerId={printerId} snapshot={snapshot} />
      </Panel>
    );
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: `repeat(${dashboard.layout.columns.length}, minmax(0, 1fr))`,
        },
        gap: 1.5,
        alignItems: 'start',
      }}
    >
      {dashboard.layout.columns.map((column, i) => (
        <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>
          {column.map(renderCard)}
        </Box>
      ))}
    </Box>
  );
}
