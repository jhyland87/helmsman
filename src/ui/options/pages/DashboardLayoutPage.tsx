/**
 * @fileoverview Dashboard layout editor — toggle panel visibility, default
 * collapsed state, reorder within a column (drag), and move between columns.
 */
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { Box, Card, FormControlLabel, IconButton, Stack, Switch, Typography } from '@mui/material';

import {
  type DashboardCard,
  type DashboardLayout,
  PanelId,
} from '@/core/settings/schema';
import { PANELS } from '@/ui/panels/registry';
import { useT } from '@/ui/shared/i18n';
import { useBackground } from '@/ui/shared/state/BackgroundContext';
import { useSettings } from '@/ui/shared/state/SettingsContext';
import { useDashboard } from '@/ui/shared/state/useDashboard';

const findColumn = (layout: DashboardLayout, panelId: string): number =>
  layout.columns.findIndex((col) => col.some((c) => c.id === panelId));

function SortableCard({
  card,
  columnIndex,
  columnCount,
  onToggleEnabled,
  onToggleCollapsed,
  onMove,
}: {
  card: DashboardCard;
  columnIndex: number;
  columnCount: number;
  onToggleEnabled: () => void;
  onToggleCollapsed: () => void;
  onMove: (direction: -1 | 1) => void;
}): JSX.Element {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: card.id });
  const def = PANELS[card.id];
  return (
    <Card
      ref={setNodeRef}
      variant="outlined"
      sx={{
        p: 1,
        mb: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: card.enabled ? 1 : 0.55,
      }}
    >
      <Box {...attributes} {...listeners} sx={{ cursor: 'grab', display: 'flex' }}>
        <DragIndicatorIcon fontSize="small" color="disabled" />
      </Box>
      <Typography variant="body2" sx={{ flexGrow: 1 }}>
        {def ? t(def.titleKey) : card.id}
      </Typography>
      <IconButton
        size="small"
        disabled={columnIndex === 0}
        onClick={() => onMove(-1)}
        aria-label="move left"
      >
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        disabled={columnIndex === columnCount - 1}
        onClick={() => onMove(1)}
        aria-label="move right"
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
      <FormControlLabel
        control={<Switch size="small" checked={card.enabled} onChange={onToggleEnabled} />}
        label="On"
        sx={{ mr: 0 }}
      />
      <FormControlLabel
        control={<Switch size="small" checked={card.collapsed} onChange={onToggleCollapsed} />}
        label="Collapsed"
      />
    </Card>
  );
}

export function DashboardLayoutPage(): JSX.Element {
  const { settings } = useSettings();
  const { printers } = useBackground();
  const active = settings.activePrinterId ?? printers[0]?.id;
  const { dashboard, setLayout } = useDashboard(active);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const layout = dashboard.layout;

  const mutateCard = (panelId: string, patch: Partial<DashboardCard>): void => {
    const columns = layout.columns.map((col) =>
      col.map((c) => (c.id === panelId ? { ...c, ...patch } : c)),
    );
    setLayout({ columns });
  };

  const moveCard = (panelId: PanelId, direction: -1 | 1): void => {
    const from = findColumn(layout, panelId);
    const to = from + direction;
    if (to < 0 || to >= layout.columns.length) return;
    const card = layout.columns[from]?.find((c) => c.id === panelId);
    if (!card) return;
    const columns = layout.columns.map((col) => [...col]);
    columns[from] = (columns[from] ?? []).filter((c) => c.id !== panelId);
    columns[to] = [...(columns[to] ?? []), card];
    setLayout({ columns });
  };

  const onDragEnd = (event: DragEndEvent): void => {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const column = findColumn(layout, String(dragged.id));
    if (column < 0 || column !== findColumn(layout, String(over.id))) return;
    const items = [...(layout.columns[column] ?? [])];
    const oldIndex = items.findIndex((c) => c.id === dragged.id);
    const newIndex = items.findIndex((c) => c.id === over.id);
    const columns = layout.columns.map((col) => [...col]);
    columns[column] = arrayMove(items, oldIndex, newIndex);
    setLayout({ columns });
  };

  if (!active) return <Typography color="text.secondary">No printer selected.</Typography>;

  return (
    <Stack spacing={2}>
      <Typography variant="h6">Dashboard Layout</Typography>
      <Typography variant="body2" color="text.secondary">
        Drag to reorder within a column; use the arrows to move panels between columns. Changes save
        automatically for the selected printer.
      </Typography>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: `repeat(${layout.columns.length}, 1fr)` },
          }}
        >
          {layout.columns.map((column, columnIndex) => (
            <Box key={columnIndex}>
              <Typography variant="overline" color="text.secondary">
                Column {columnIndex + 1}
              </Typography>
              <SortableContext
                items={column.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {column.map((card) => (
                  <SortableCard
                    key={card.id}
                    card={card}
                    columnIndex={columnIndex}
                    columnCount={layout.columns.length}
                    onToggleEnabled={() => mutateCard(card.id, { enabled: !card.enabled })}
                    onToggleCollapsed={() => mutateCard(card.id, { collapsed: !card.collapsed })}
                    onMove={(direction) => moveCard(card.id, direction)}
                  />
                ))}
              </SortableContext>
            </Box>
          ))}
        </Box>
      </DndContext>
    </Stack>
  );
}
