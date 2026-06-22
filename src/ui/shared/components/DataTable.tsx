/**
 * @fileoverview Reusable, self-persisting data table.
 *
 * Renders a sortable MUI table whose column visibility, column order, and sort
 * are stored in app settings (keyed by `tableId`) and restored automatically. A
 * built-in popover lets the user toggle and drag-reorder the configurable
 * columns. Optional row selection (checkbox column + click/ctrl/shift range) is
 * supported for callers that need it; everything else (folders, context menus,
 * dialogs) stays in the caller and is composed via `toolbar` / `prefixRows`.
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
import ClearIcon from '@mui/icons-material/Clear';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SearchIcon from '@mui/icons-material/Search';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {
  Box,
  Checkbox,
  IconButton,
  InputAdornment,
  Popover,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import {
  type SortDirection,
  type TableColumnState,
  type TableSortState,
  type TableState,
  reconcileTableColumns,
} from '@/core/settings/schema';
import { useSettings } from '@/ui/shared/state/SettingsContext';

/** Comparable value for sorting; `undefined`/`null` always sort last. */
export type SortValue = number | string | undefined | null;

export interface DataTableColumn<T> {
  readonly id: string;
  /** Header text + label shown in the column picker. */
  readonly label: string;
  readonly align?: 'right' | 'center';
  readonly render: (row: T) => ReactNode;
  /** Provide to make the column sortable; omit for a non-sortable column. */
  readonly sortValue?: (row: T) => SortValue;
  /**
   * Text this column contributes to live search. Defaults to {@link sortValue}
   * when it yields a string/number; set this to search formatted text instead.
   */
  readonly searchValue?: (row: T) => string | undefined;
  /** Fixed columns always render first and aren't shown in the column picker. */
  readonly fixed?: boolean;
  readonly width?: number | string;
}

/** Controlled selection: the caller owns the selected-key set. */
export interface DataTableSelection {
  readonly selectedKeys: ReadonlySet<string>;
  readonly onChange: (keys: Set<string>) => void;
}

export interface DataTableProps<T> {
  /** Stable id used as the storage key for this table's persisted state. */
  readonly tableId: string;
  readonly columns: readonly DataTableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowKey: (row: T) => string;
  /** Sort applied when nothing is persisted yet. */
  readonly defaultSort?: TableSortState;
  /**
   * Optional primary grouping: rows are ordered by this ascending value first
   * (e.g. folders=0 before files=1), then by the active column within a group.
   */
  readonly sortGroup?: (row: T) => number;
  readonly selection?: DataTableSelection;
  readonly onRowClick?: (row: T, event: MouseEvent) => void;
  readonly onRowContextMenu?: (row: T, event: MouseEvent) => void;
  /** Rows rendered at the top of the body (e.g. folders); given the column span. */
  readonly prefixRows?: (totalColumns: number) => ReactNode;
  /** Toolbar content rendered left of the search box + column-picker button. */
  readonly toolbar?: ReactNode;
  /** Show a live-search box that filters rows (default true). */
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
  /** Override the empty check (defaults to `rows.length === 0`). */
  readonly isEmpty?: boolean;
  readonly emptyMessage?: string;
  readonly maxHeight?: number;
  /** Fill the parent's height (flex) instead of using `maxHeight`. */
  readonly fillHeight?: boolean;
  readonly tableSx?: object;
}

const compareSort = (a: SortValue, b: SortValue, dir: SortDirection): number => {
  const aEmpty = a === undefined || a === null;
  const bEmpty = b === undefined || b === null;
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const cmp =
    typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
  return dir === 'asc' ? cmp : -cmp;
};

// --- column picker ----------------------------------------------------------

function ColumnToggleRow({
  id,
  label,
  enabled,
  onToggle,
}: {
  id: string;
  label: string;
  enabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <Box
      ref={setNodeRef}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Box {...attributes} {...listeners} sx={{ cursor: 'grab', display: 'flex' }}>
        <DragIndicatorIcon fontSize="small" color="disabled" />
      </Box>
      <Typography variant="body2" sx={{ flexGrow: 1 }}>
        {label}
      </Typography>
      <Checkbox size="small" checked={enabled} onChange={onToggle} />
    </Box>
  );
}

function ColumnPicker({
  state,
  labels,
  onChange,
}: {
  state: readonly TableColumnState[];
  labels: Readonly<Record<string, string>>;
  onChange: (next: TableColumnState[]) => void;
}): JSX.Element {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = state.findIndex((c) => c.id === active.id);
    const to = state.findIndex((c) => c.id === over.id);
    onChange(arrayMove([...state], from, to));
  };
  const toggle = (id: string): void =>
    onChange(state.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={state.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {state.map((column) => (
          <ColumnToggleRow
            key={column.id}
            id={column.id}
            label={labels[column.id] ?? column.id}
            enabled={column.enabled}
            onToggle={() => toggle(column.id)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

// --- table ------------------------------------------------------------------

export function DataTable<T>({
  tableId,
  columns,
  rows,
  getRowKey,
  defaultSort,
  sortGroup,
  selection,
  onRowClick,
  onRowContextMenu,
  prefixRows,
  toolbar,
  searchable = true,
  searchPlaceholder,
  isEmpty,
  emptyMessage,
  maxHeight,
  fillHeight,
  tableSx,
}: DataTableProps<T>): JSX.Element {
  const { settings, update } = useSettings();
  const persisted = settings.tables[tableId];
  const [colAnchor, setColAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const anchorKey = useRef<string | undefined>(undefined);

  const byId = useMemo(() => {
    const map: Record<string, DataTableColumn<T>> = {};
    for (const c of columns) map[c.id] = c;
    return map;
  }, [columns]);

  const fixedColumns = useMemo(() => columns.filter((c) => c.fixed), [columns]);
  const configColumns = useMemo(() => columns.filter((c) => !c.fixed), [columns]);
  const configIds = useMemo(() => configColumns.map((c) => c.id), [configColumns]);
  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of configColumns) map[c.id] = c.label;
    return map;
  }, [configColumns]);

  const columnState = useMemo(
    () => reconcileTableColumns(persisted?.columns ?? [], configIds),
    [persisted?.columns, configIds],
  );
  const visibleConfig = useMemo(
    () =>
      columnState
        .filter((s) => s.enabled)
        .map((s) => byId[s.id])
        .filter((c): c is DataTableColumn<T> => c !== undefined),
    [columnState, byId],
  );
  const orderedColumns = useMemo(
    () => [...fixedColumns, ...visibleConfig],
    [fixedColumns, visibleConfig],
  );
  const totalColumns = orderedColumns.length + (selection ? 1 : 0);

  const sort = persisted?.sort ?? defaultSort;

  const saveTable = (next: Partial<TableState>): void => {
    const current: TableState = { columns: columnState, sort };
    void update({ tables: { ...settings.tables, [tableId]: { ...current, ...next } } });
  };
  const toggleSort = (id: string): void => {
    const direction: SortDirection =
      sort?.column === id && sort.direction === 'asc' ? 'desc' : 'asc';
    saveTable({ sort: { column: id, direction } });
  };

  // Live search: filter rows by each column's searchValue (or its sortValue).
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    const textOf = (row: T): string =>
      columns
        .map((c) => {
          if (c.searchValue) return c.searchValue(row) ?? '';
          const value = c.sortValue?.(row);
          return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
        })
        .join(' ')
        .toLowerCase();
    return rows.filter((row) => textOf(row).includes(q));
  }, [rows, query, columns]);

  const sortedRows = useMemo(() => {
    const col = sort ? byId[sort.column] : undefined;
    const get = col?.sortValue;
    if (!sortGroup && !get) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      if (sortGroup) {
        const group = sortGroup(a) - sortGroup(b);
        if (group !== 0) return group;
      }
      if (get && sort) return compareSort(get(a), get(b), sort.direction);
      return 0;
    });
  }, [filteredRows, sort, byId, sortGroup]);

  // --- selection ---
  const handleRowClick = (row: T, event: MouseEvent): void => {
    if (selection) {
      const key = getRowKey(row);
      if (event.shiftKey && anchorKey.current) {
        const order = sortedRows.map(getRowKey);
        const from = order.indexOf(anchorKey.current);
        const to = order.indexOf(key);
        if (from >= 0 && to >= 0) {
          const [lo, hi] = from < to ? [from, to] : [to, from];
          selection.onChange(new Set(order.slice(lo, hi + 1)));
          return;
        }
      }
      const nextSet = new Set(selection.selectedKeys);
      if (event.ctrlKey || event.metaKey) {
        if (nextSet.has(key)) nextSet.delete(key);
        else nextSet.add(key);
      } else {
        nextSet.clear();
        nextSet.add(key);
      }
      selection.onChange(nextSet);
      anchorKey.current = key;
    }
    onRowClick?.(row, event);
  };
  const toggleOne = (key: string): void => {
    if (!selection) return;
    const nextSet = new Set(selection.selectedKeys);
    if (nextSet.has(key)) nextSet.delete(key);
    else nextSet.add(key);
    selection.onChange(nextSet);
    anchorKey.current = key;
  };
  const allSelected =
    selection !== undefined &&
    sortedRows.length > 0 &&
    sortedRows.every((r) => selection.selectedKeys.has(getRowKey(r)));
  const someSelected =
    selection !== undefined &&
    !allSelected &&
    sortedRows.some((r) => selection.selectedKeys.has(getRowKey(r)));
  const toggleAll = (): void => {
    if (!selection) return;
    selection.onChange(allSelected ? new Set() : new Set(sortedRows.map(getRowKey)));
  };

  const noMatches = query.trim() !== '' && filteredRows.length === 0;
  const showEmpty = noMatches || (isEmpty ?? rows.length === 0);
  const clickable = selection !== undefined || onRowClick !== undefined;

  return (
    <Stack spacing={1} sx={fillHeight ? { flex: 1, minHeight: 0 } : undefined}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
        {toolbar ?? <Box sx={{ flexGrow: 1 }} />}
        {searchable && (
          <TextField
            size="small"
            variant="outlined"
            placeholder={searchPlaceholder ?? 'Search…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ width: 180, flexShrink: 0 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="clear search" onClick={() => setQuery('')}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
        )}
        {configColumns.length > 0 && (
          <IconButton
            size="small"
            aria-label="choose columns"
            onClick={(e) => setColAnchor(e.currentTarget)}
          >
            <ViewColumnIcon fontSize="small" />
          </IconButton>
        )}
      </Stack>

      <Box
        sx={
          fillHeight
            ? { overflow: 'auto', flex: 1, minHeight: 0 }
            : maxHeight !== undefined
              ? { overflow: 'auto', maxHeight }
              : // No internal scroll: let sticky headers pin to the page's scroll area.
                { overflow: 'visible' }
        }
      >
        <Table size="small" stickyHeader sx={tableSx}>
          <TableHead sx={{ '& .MuiTableCell-stickyHeader': { bgcolor: 'background.paper' } }}>
            <TableRow>
              {selection && (
                <TableCell padding="checkbox" sx={{ bgcolor: 'background.paper' }}>
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={toggleAll}
                    slotProps={{ input: { 'aria-label': 'select all rows' } }}
                  />
                </TableCell>
              )}
              {orderedColumns.map((col) => {
                const active = sort?.column === col.id;
                return (
                  <TableCell
                    key={col.id}
                    align={col.align}
                    sortDirection={active && sort ? sort.direction : false}
                    sx={col.width !== undefined ? { width: col.width } : undefined}
                  >
                    {col.sortValue ? (
                      <TableSortLabel
                        active={active}
                        direction={active && sort ? sort.direction : 'asc'}
                        onClick={() => toggleSort(col.id)}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : (
                      col.label
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {prefixRows?.(totalColumns)}
            {sortedRows.map((row) => {
              const key = getRowKey(row);
              const selected = selection?.selectedKeys.has(key) ?? false;
              return (
                <TableRow
                  key={key}
                  hover
                  selected={selected}
                  sx={{ cursor: clickable ? 'pointer' : 'default' }}
                  onClick={clickable ? (e) => handleRowClick(row, e) : undefined}
                  onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(row, e) : undefined}
                >
                  {selection && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleOne(key)}
                        slotProps={{ input: { 'aria-label': 'select row' } }}
                      />
                    </TableCell>
                  )}
                  {orderedColumns.map((col) => (
                    <TableCell key={col.id} align={col.align}>
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {showEmpty && (
              <TableRow>
                <TableCell colSpan={totalColumns}>
                  <Typography variant="body2" color="text.secondary">
                    {noMatches ? `No matches for “${query.trim()}”.` : (emptyMessage ?? 'No data.')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>

      <Popover
        open={Boolean(colAnchor)}
        anchorEl={colAnchor}
        onClose={() => setColAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 1, width: 260 }}>
          <Typography variant="overline" color="text.secondary">
            Columns
          </Typography>
          <ColumnPicker
            state={columnState}
            labels={labels}
            onChange={(next) => saveTable({ columns: next })}
          />
        </Box>
      </Popover>
    </Stack>
  );
}
