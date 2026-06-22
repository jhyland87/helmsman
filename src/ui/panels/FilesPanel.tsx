/**
 * @fileoverview G-code file browser panel.
 *
 * Builds a folder tree from Moonraker's flat file list (`server.files.list`),
 * shows folders first with click-to-navigate, and renders a table whose columns
 * the user can toggle and reorder (persisted in app settings). Column values
 * come from the bulk g-code metadata map plus the print history (for the
 * "Last …" columns). Files support multi-select + a right-click context menu
 * (print, download, delete, rename, move, view slicer settings).
 */
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import PrintIcon from '@mui/icons-material/Print';
import RefreshIcon from '@mui/icons-material/Refresh';
import TuneIcon from '@mui/icons-material/Tune';
import {
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Popper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import type {
  FileEntry,
  GcodeFileMetadata,
  GcodeMetadataMap,
  HistoryJob,
} from '@jhyland87/moonraker-client';

import { FileColumnId } from '@/core/settings/schema';
import type { SlicerSettings } from '@/core/slicer/SlicerSettingsParser';
import { api } from '@/ui/shared/api';
import { DataTable, type DataTableColumn, type SortValue } from '@/ui/shared/components/DataTable';
import type { PanelProps } from './PanelProps';

// --- value formatting -------------------------------------------------------

const opt = <T,>(value: T | undefined | null, format: (v: T) => string): string =>
  value === undefined || value === null ? '—' : format(value);

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};
const fmtDate = (unixSeconds: number): string => new Date(unixSeconds * 1000).toLocaleString();
const fmtDuration = (seconds: number): string => {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtMm = (n: number): string => `${n.toFixed(2)} mm`;
const fmtTemp = (n: number): string => `${n}°C`;
const fmtGrams = (n: number): string => `${n.toFixed(1)} g`;
const fmtMeters = (mm: number): string => `${(mm / 1000).toFixed(2)} m`;

const filamentCount = (meta?: GcodeFileMetadata): number | undefined => {
  if (!meta) return undefined;
  if (meta.filament_name) {
    return meta.filament_name.split(/[;,]/).map((s) => s.trim()).filter(Boolean).length;
  }
  return meta.filament_total !== undefined ? 1 : undefined;
};

interface RowData {
  readonly file: FileEntry;
  readonly meta?: GcodeFileMetadata;
  readonly lastJob?: HistoryJob;
}

interface ColumnDef {
  readonly label: string;
  readonly align?: 'right';
  readonly value: (d: RowData) => string;
  /** Raw value used for header sorting (kept separate so e.g. sizes/dates sort numerically). */
  readonly sort: (d: RowData) => SortValue;
}

const COLUMNS: Readonly<Record<FileColumnId, ColumnDef>> = {
  [FileColumnId.FILE_SIZE]: { label: 'File size', align: 'right', value: (d) => opt(d.file.size, fmtBytes), sort: (d) => d.file.size },
  [FileColumnId.LAST_MODIFIED]: { label: 'Last modified', value: (d) => opt(d.file.modified, fmtDate), sort: (d) => d.file.modified },
  [FileColumnId.OBJECT_HEIGHT]: { label: 'Object Height', align: 'right', value: (d) => opt(d.meta?.object_height, fmtMm), sort: (d) => d.meta?.object_height },
  [FileColumnId.LAYER_HEIGHT]: { label: 'Layer Height', align: 'right', value: (d) => opt(d.meta?.layer_height, fmtMm), sort: (d) => d.meta?.layer_height },
  [FileColumnId.NOZZLE_DIAMETER]: { label: 'Nozzle Diameter', align: 'right', value: (d) => opt(d.meta?.nozzle_diameter, fmtMm), sort: (d) => d.meta?.nozzle_diameter },
  [FileColumnId.FILAMENTS]: { label: 'Filaments', align: 'right', value: (d) => opt(filamentCount(d.meta), String), sort: (d) => filamentCount(d.meta) },
  [FileColumnId.FILAMENT_NAME]: { label: 'Filament Name', value: (d) => opt(d.meta?.filament_name, (s) => s), sort: (d) => d.meta?.filament_name },
  [FileColumnId.FILAMENT_TYPE]: { label: 'Filament Type', value: (d) => opt(d.meta?.filament_type, (s) => s), sort: (d) => d.meta?.filament_type },
  [FileColumnId.FILAMENT_USAGE]: { label: 'Filament Usage', align: 'right', value: (d) => opt(d.meta?.filament_total, fmtMeters), sort: (d) => d.meta?.filament_total },
  [FileColumnId.FILAMENT_WEIGHT]: { label: 'Filament Weight', align: 'right', value: (d) => opt(d.meta?.filament_weight_total, fmtGrams), sort: (d) => d.meta?.filament_weight_total },
  [FileColumnId.PRINT_TIME]: { label: 'Print Time', align: 'right', value: (d) => opt(d.meta?.estimated_time, fmtDuration), sort: (d) => d.meta?.estimated_time },
  [FileColumnId.LAST_PRINT_DURATION]: { label: 'Last Print Duration', align: 'right', value: (d) => opt(d.lastJob?.print_duration, fmtDuration), sort: (d) => d.lastJob?.print_duration },
  [FileColumnId.SLICER]: { label: 'Slicer', value: (d) => opt(d.meta?.slicer, (s) => s), sort: (d) => d.meta?.slicer },
  [FileColumnId.EXTRUDER_TEMP]: { label: 'Extruder Temp.', align: 'right', value: (d) => opt(d.meta?.first_layer_extr_temp, fmtTemp), sort: (d) => d.meta?.first_layer_extr_temp },
  [FileColumnId.BED_TEMP]: { label: 'Bed Temp.', align: 'right', value: (d) => opt(d.meta?.first_layer_bed_temp, fmtTemp), sort: (d) => d.meta?.first_layer_bed_temp },
  [FileColumnId.CHAMBER_TEMP]: { label: 'Chamber Temp.', align: 'right', value: (d) => opt(d.meta?.chamber_temp, fmtTemp), sort: (d) => d.meta?.chamber_temp },
  [FileColumnId.LAST_START_TIME]: { label: 'Last Start Time', value: (d) => opt(d.lastJob?.start_time, fmtDate), sort: (d) => d.lastJob?.start_time },
  [FileColumnId.LAST_END_TIME]: { label: 'Last End Time', value: (d) => opt(d.lastJob?.end_time, fmtDate), sort: (d) => d.lastJob?.end_time },
  [FileColumnId.LAST_TOTAL_DURATION]: { label: 'Last Total Duration', align: 'right', value: (d) => opt(d.lastJob?.total_duration, fmtDuration), sort: (d) => d.lastJob?.total_duration },
  [FileColumnId.LAST_FILAMENT_USED]: { label: 'Last Filament Used', align: 'right', value: (d) => opt(d.lastJob?.filament_used, fmtMeters), sort: (d) => d.lastJob?.filament_used },
};

// --- path / tree helpers ----------------------------------------------------

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const dirName = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const joinPath = (dir: string, name: string): string => (dir ? `${dir}/${name}` : name);

/** A folder shown in the file browser, with stats aggregated from its contents. */
interface FolderInfo {
  readonly name: string;
  /** gcodes-relative folder path. */
  readonly path: string;
  /** Recursive total size of contained files (bytes). */
  readonly size: number;
  /** Most-recent modified time among contained files (unix seconds). */
  readonly modified?: number;
  /** Immediate child files and subfolders. */
  readonly fileCount: number;
  readonly folderCount: number;
}

/** A row in the browser: either a subfolder or a file. */
type FileRow =
  | { readonly kind: 'folder'; readonly key: string; readonly folder: FolderInfo }
  | { readonly kind: 'file'; readonly key: string; readonly file: FileEntry };

/** A move/delete/rename target: a gcodes-relative path plus whether it's a dir. */
interface FileTarget {
  readonly path: string;
  readonly isDir: boolean;
}

/** Selection keys encode the kind so folders and files can be told apart. */
const parseKey = (key: string): FileTarget => ({
  isDir: key.startsWith('d:'),
  path: key.slice(2),
});

/** Build the rows under `dir` (''=root): subfolders (with stats) then files. */
const listEntries = (files: readonly FileEntry[], dir: string): FileRow[] => {
  const prefix = dir ? `${dir}/` : '';
  const here: FileEntry[] = [];
  const folderNames = new Set<string>();
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) here.push(file);
    else folderNames.add(rest.slice(0, slash));
  }

  const folders: FolderInfo[] = [...folderNames]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const path = prefix + name;
      const childPrefix = `${path}/`;
      let size = 0;
      let modified: number | undefined;
      let fileCount = 0;
      const subdirs = new Set<string>();
      for (const file of files) {
        if (!file.path.startsWith(childPrefix)) continue;
        const tail = file.path.slice(childPrefix.length);
        const slash = tail.indexOf('/');
        if (slash === -1) fileCount += 1;
        else subdirs.add(tail.slice(0, slash));
        size += file.size ?? 0;
        if (file.modified !== undefined && (modified === undefined || file.modified > modified)) {
          modified = file.modified;
        }
      }
      return { name, path, size, modified, fileCount, folderCount: subdirs.size };
    });

  return [
    ...folders.map((folder): FileRow => ({ kind: 'folder', key: `d:${folder.path}`, folder })),
    ...here
      .sort((a, b) => baseName(a.path).localeCompare(baseName(b.path)))
      .map((file): FileRow => ({ kind: 'file', key: `f:${file.path}`, file })),
  ];
};

/** File name + a hover thumbnail preview (fetched lazily via the background). */
function FileNameCell({ printerId, file }: { printerId: string; file: FileEntry }): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // undefined = not fetched; null = no thumbnail; string = data URL.
  const [thumb, setThumb] = useState<string | null>();

  const onEnter = (e: MouseEvent<HTMLElement>): void => {
    setAnchor(e.currentTarget);
    if (thumb === undefined) {
      void (async () => {
        try {
          setThumb((await api.getGcodeThumbnail(printerId, file.path)) ?? null);
        } catch {
          setThumb(null);
        }
      })();
    }
  };

  return (
    <>
      <Box
        component="span"
        onMouseEnter={onEnter}
        onMouseLeave={() => setAnchor(null)}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
      >
        <InsertDriveFileOutlinedIcon fontSize="small" color="disabled" />
        <span>{baseName(file.path)}</span>
      </Box>
      <Popper
        open={Boolean(anchor) && Boolean(thumb)}
        anchorEl={anchor}
        placement="right"
        sx={{ pointerEvents: 'none', zIndex: (theme) => theme.zIndex.tooltip }}
        modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
      >
        <Paper elevation={6} sx={{ p: 0.5 }}>
          <Box
            component="img"
            src={thumb ?? undefined}
            alt=""
            sx={{ display: 'block', width: 180, height: 180, objectFit: 'contain' }}
          />
        </Paper>
      </Popper>
    </>
  );
}

/** Folder name (click to open) + a hover popup with its child counts. */
function FolderNameCell({
  folder,
  onOpen,
}: {
  folder: FolderInfo;
  onOpen: () => void;
}): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

  return (
    <>
      <Box
        component="span"
        onMouseEnter={(e) => setAnchor(e.currentTarget)}
        onMouseLeave={() => setAnchor(null)}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
      >
        <FolderIcon fontSize="small" color="warning" />
        <Link
          component="button"
          type="button"
          underline="hover"
          color="inherit"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {folder.name}
        </Link>
      </Box>
      <Popper
        open={Boolean(anchor)}
        anchorEl={anchor}
        placement="right"
        sx={{ pointerEvents: 'none', zIndex: (theme) => theme.zIndex.tooltip }}
        modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
      >
        <Paper elevation={6} sx={{ px: 1, py: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {plural(folder.fileCount, 'file')}, {plural(folder.folderCount, 'folder')}
          </Typography>
        </Paper>
      </Popper>
    </>
  );
}

// --- slicer settings dialog -------------------------------------------------

function SlicerSettingsDialog({
  printerId,
  path,
  onClose,
}: {
  printerId: string;
  path: string;
  onClose: () => void;
}): JSX.Element {
  const [data, setData] = useState<SlicerSettings>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  // When on, literal "\n" sequences in values are shown as real line breaks.
  const [renderNewlines, setRenderNewlines] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const settings = await api.getSlicerSettings(printerId, path);
        if (active) setData(settings);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [printerId, path]);

  const entries = data ? Object.entries(data) : [];

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            Slicer Settings
            <Typography variant="caption" component="div" color="text.secondary" noWrap>
              {baseName(path)}
            </Typography>
          </Box>
          <FormControlLabel
            sx={{ mr: 0, whiteSpace: 'nowrap' }}
            control={
              <Checkbox
                size="small"
                checked={renderNewlines}
                onChange={(e) => setRenderNewlines(e.target.checked)}
              />
            }
            label={'Render \\n'}
          />
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <CircularProgress size={20} />}
        {error && <Typography color="error">{error}</Typography>}
        {!loading && !error && entries.length === 0 && (
          <Typography color="text.secondary">
            No slicer settings found in this file (only Prusa/Orca/SuperSlicer config blocks are
            currently supported).
          </Typography>
        )}
        {entries.length > 0 && (
          <Table size="small">
            <TableBody>
              {entries.map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell sx={{ fontWeight: 600, verticalAlign: 'top', width: '40%' }}>
                    {key}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      wordBreak: 'break-all',
                      whiteSpace: renderNewlines ? 'pre-wrap' : 'normal',
                    }}
                  >
                    {renderNewlines ? value.replace(/\\n/g, '\n') : value}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// --- slicer settings compare dialog -----------------------------------------

interface CompareRow {
  readonly key: string;
  readonly a?: string;
  readonly b?: string;
  readonly differs: boolean;
}

function SlicerSettingsCompareDialog({
  printerId,
  pathA,
  pathB,
  onClose,
}: {
  printerId: string;
  pathA: string;
  pathB: string;
  onClose: () => void;
}): JSX.Element {
  const [a, setA] = useState<SlicerSettings>();
  const [b, setB] = useState<SlicerSettings>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [diffOnly, setDiffOnly] = useState(true);
  const [renderNewlines, setRenderNewlines] = useState(false);

  useEffect(() => {
    let active = true;
    const run = async (): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const [ra, rb] = await Promise.all([
          api.getSlicerSettings(printerId, pathA),
          api.getSlicerSettings(printerId, pathB),
        ]);
        if (active) {
          setA(ra);
          setB(rb);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [printerId, pathA, pathB]);

  const rows = useMemo<CompareRow[]>(() => {
    if (!a || !b) return [];
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort((x, y) =>
      x.localeCompare(y),
    );
    return keys.map((key) => ({ key, a: a[key], b: b[key], differs: a[key] !== b[key] }));
  }, [a, b]);

  const diffCount = rows.filter((r) => r.differs).length;
  const visibleRows = diffOnly ? rows.filter((r) => r.differs) : rows;
  const show = (value?: string): string =>
    value === undefined ? '—' : renderNewlines ? value.replace(/\\n/g, '\n') : value;

  const valueCellSx = {
    fontFamily: 'monospace',
    fontSize: 12,
    wordBreak: 'break-all' as const,
    whiteSpace: renderNewlines ? ('pre-wrap' as const) : ('normal' as const),
    verticalAlign: 'top' as const,
  };

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Box
          sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}
        >
          <Box sx={{ minWidth: 0 }}>
            Compare Slicer Settings
            {!loading && !error && rows.length > 0 && (
              <Typography variant="caption" component="div" color="text.secondary">
                {diffCount} of {rows.length} settings differ
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, whiteSpace: 'nowrap' }}>
            <FormControlLabel
              sx={{ mr: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={diffOnly}
                  onChange={(e) => setDiffOnly(e.target.checked)}
                />
              }
              label="Differences only"
            />
            <FormControlLabel
              sx={{ mr: 0 }}
              control={
                <Checkbox
                  size="small"
                  checked={renderNewlines}
                  onChange={(e) => setRenderNewlines(e.target.checked)}
                />
              }
              label={'Render \\n'}
            />
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {loading && <CircularProgress size={20} />}
        {error && <Typography color="error">{error}</Typography>}
        {!loading && !error && rows.length === 0 && (
          <Typography color="text.secondary">
            No slicer settings found in either file (only Prusa/Orca/SuperSlicer config blocks are
            currently supported).
          </Typography>
        )}
        {!loading && !error && rows.length > 0 && visibleRows.length === 0 && (
          <Typography color="text.secondary">These two files have identical slicer settings.</Typography>
        )}
        {visibleRows.length > 0 && (
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, width: '24%' }}>Setting</TableCell>
                <TableCell sx={{ fontWeight: 600, width: '38%' }} title={pathA}>
                  {baseName(pathA)}
                </TableCell>
                <TableCell sx={{ fontWeight: 600, width: '38%' }} title={pathB}>
                  {baseName(pathB)}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleRows.map((row) => {
                const diffBg = row.differs ? 'rgba(237, 108, 2, 0.12)' : undefined;
                return (
                  <TableRow key={row.key}>
                    <TableCell sx={{ fontWeight: 600, verticalAlign: 'top', wordBreak: 'break-all' }}>
                      {row.key}
                    </TableCell>
                    <TableCell sx={{ ...valueCellSx, bgcolor: diffBg }}>{show(row.a)}</TableCell>
                    <TableCell sx={{ ...valueCellSx, bgcolor: diffBg }}>{show(row.b)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// --- panel ------------------------------------------------------------------

export function FilesPanel({ printerId, maximized }: PanelProps): JSX.Element {
  const [files, setFiles] = useState<readonly FileEntry[]>([]);
  const [meta, setMeta] = useState<GcodeMetadataMap>({});
  const [lastJobs, setLastJobs] = useState<Record<string, HistoryJob>>({});
  const [dir, setDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [refreshKey, setRefreshKey] = useState(0);

  // Selection (checkbox set, kind-prefixed keys) + context menu + dialogs.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  // The row the context menu was opened on (independent of the checkbox set).
  const [menuKey, setMenuKey] = useState<string>();
  const [renameTarget, setRenameTarget] = useState<FileTarget>();
  const [renameValue, setRenameValue] = useState('');
  const [moveTargets, setMoveTargets] = useState<FileTarget[]>();
  const [moveDest, setMoveDest] = useState('');
  const [deleteTargets, setDeleteTargets] = useState<FileTarget[]>();
  const [slicerPath, setSlicerPath] = useState<string>();
  const [comparePaths, setComparePaths] = useState<{ a: string; b: string }>();

  useEffect(() => setDir(''), [printerId]);
  useEffect(() => {
    setSelected(new Set());
  }, [dir, printerId]);

  useEffect(() => {
    let active = true;
    const loadFiles = async (): Promise<void> => {
      setLoading(true);
      setError(undefined);
      try {
        const list = await api.listFiles(printerId);
        if (active) setFiles(list);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
        return;
      }
      try {
        const m = await api.getGcodeMetadata(printerId);
        if (active) setMeta(m);
      } catch {
        if (active) setMeta({});
      }
      try {
        const history = await api.getHistory(printerId, { limit: 1000, order: 'desc' });
        const map: Record<string, HistoryJob> = {};
        for (const job of history.jobs) if (!(job.filename in map)) map[job.filename] = job;
        if (active) setLastJobs(map);
      } catch {
        if (active) setLastJobs({});
      }
      if (active) setLoading(false);
    };
    void loadFiles();
    return () => {
      active = false;
    };
  }, [printerId, refreshKey]);

  const rows = useMemo(() => listEntries(files, dir), [files, dir]);
  const segments = dir ? dir.split('/') : [];
  const refresh = (): void => setRefreshKey((k) => k + 1);

  // Columns for the reusable DataTable: a fixed "Name" column plus the
  // configurable metadata columns. Folders show recursive size + latest-modified
  // and a dash elsewhere; files render their metadata via {@link ColumnDef}.
  const tableColumns = useMemo<DataTableColumn<FileRow>[]>(() => {
    const toRow = (file: FileEntry): RowData => ({
      file,
      meta: meta[file.path],
      lastJob: lastJobs[file.path],
    });
    const nameColumn: DataTableColumn<FileRow> = {
      id: 'name',
      label: 'Name',
      fixed: true,
      sortValue: (row) =>
        row.kind === 'folder' ? row.folder.name.toLowerCase() : baseName(row.file.path).toLowerCase(),
      render: (row) =>
        row.kind === 'folder' ? (
          <FolderNameCell folder={row.folder} onOpen={() => setDir(row.folder.path)} />
        ) : (
          <FileNameCell printerId={printerId} file={row.file} />
        ),
    };
    const metaColumns: DataTableColumn<FileRow>[] = Object.values(FileColumnId).map((id) => {
      const def = COLUMNS[id];
      return {
        id,
        label: def.label,
        align: def.align,
        render: (row) => {
          if (row.kind === 'file') return def.value(toRow(row.file));
          if (id === FileColumnId.FILE_SIZE) return fmtBytes(row.folder.size);
          if (id === FileColumnId.LAST_MODIFIED) return opt(row.folder.modified, fmtDate);
          return '—';
        },
        sortValue: (row) => {
          if (row.kind === 'file') return def.sort(toRow(row.file));
          if (id === FileColumnId.FILE_SIZE) return row.folder.size;
          if (id === FileColumnId.LAST_MODIFIED) return row.folder.modified;
          return undefined;
        },
      };
    });
    return [nameColumn, ...metaColumns];
  }, [meta, lastJobs, printerId]);

  // Every directory in the tree (for the Move dialog's folder picker).
  const allDirs = useMemo(() => {
    const dirs = new Set<string>(['']);
    for (const file of files) {
      const parts = file.path.split('/');
      parts.pop(); // drop filename
      let acc = '';
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        dirs.add(acc);
      }
    }
    return [...dirs].sort((a, b) => a.localeCompare(b));
  }, [files]);

  const openMenu = (event: MouseEvent, key: string): void => {
    event.preventDefault();
    setMenuKey(key);
    setMenuPos({ x: event.clientX, y: event.clientY });
  };
  const closeMenu = (): void => setMenuPos(null);

  const selectedKeys = [...selected];
  const selectedTargets = selectedKeys.map(parseKey);
  // Paths of selected *files* only (folders can't print/download/compare).
  const selectedFiles = selectedKeys.filter((k) => !k.startsWith('d:')).map((k) => k.slice(2));

  // --- actions (each clears selection + refreshes where it mutates) ---

  const runAction = async (fn: () => Promise<void>): Promise<void> => {
    setActionError(undefined);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const doPrint = (path: string): void => {
    closeMenu();
    void runAction(() => api.startPrint(printerId, path));
  };

  const doDownload = (paths: readonly string[]): void => {
    closeMenu();
    for (const path of paths) void api.downloadFile(printerId, path);
  };

  const beginRename = (target: FileTarget): void => {
    closeMenu();
    setRenameTarget(target);
    setRenameValue(baseName(target.path));
  };
  const confirmRename = (): void => {
    const target = renameTarget;
    if (!target) return;
    const dest = joinPath(dirName(target.path), renameValue.trim());
    setRenameTarget(undefined);
    void runAction(async () => {
      await api.moveEntry(printerId, target.path, dest);
      setSelected(new Set());
      refresh();
    });
  };

  const beginMove = (targets: FileTarget[]): void => {
    closeMenu();
    setMoveTargets(targets);
    setMoveDest(dir);
  };
  const confirmMove = (): void => {
    const targets = moveTargets ?? [];
    const destDir = moveDest.trim().replace(/^\/+|\/+$/g, '');
    setMoveTargets(undefined);
    void runAction(async () => {
      for (const target of targets) {
        await api.moveEntry(printerId, target.path, joinPath(destDir, baseName(target.path)));
      }
      setSelected(new Set());
      refresh();
    });
  };

  const beginDelete = (targets: FileTarget[]): void => {
    closeMenu();
    setDeleteTargets(targets);
  };
  const confirmDelete = (): void => {
    const targets = deleteTargets ?? [];
    setDeleteTargets(undefined);
    void runAction(async () => {
      for (const target of targets) {
        await api.deleteEntry(printerId, target.path, target.isDir);
      }
      setSelected(new Set());
      refresh();
    });
  };

  const viewSlicer = (path: string): void => {
    closeMenu();
    setSlicerPath(path);
  };

  const openCompare = (a: string, b: string): void => {
    closeMenu();
    setComparePaths({ a, b });
  };
  const compareTwoChecked = (): void => {
    const [a, b] = selectedFiles;
    if (a && b) openCompare(a, b);
  };

  // Context-menu shape: right-clicking inside a checked multi-selection gets bulk
  // actions; otherwise the clicked row gets single-item actions (files get more
  // than folders). A single *other* checked file enables "compare with selected".
  const menuTarget = menuKey ? parseKey(menuKey) : undefined;
  const menuIsMulti = menuKey !== undefined && selected.has(menuKey) && selectedKeys.length >= 2;
  const canCompareChecked = selectedKeys.length === 2 && selectedFiles.length === 2;
  const otherCheckedFile =
    selectedKeys.length === 1 &&
    selectedFiles.length === 1 &&
    menuTarget !== undefined &&
    !menuTarget.isDir &&
    selectedFiles[0] !== menuTarget.path
      ? selectedFiles[0]
      : undefined;

  const breadcrumbs = (
    <Breadcrumbs sx={{ flexGrow: 1, fontSize: 13 }}>
      <Link component="button" underline="hover" color="inherit" onClick={() => setDir('')}>
        gcodes
      </Link>
      {segments.map((seg, i) => {
        const target = segments.slice(0, i + 1).join('/');
        const isLast = i === segments.length - 1;
        return isLast ? (
          <Typography key={target} variant="body2" color="text.primary">
            {seg}
          </Typography>
        ) : (
          <Link
            key={target}
            component="button"
            underline="hover"
            color="inherit"
            onClick={() => setDir(target)}
          >
            {seg}
          </Link>
        );
      })}
    </Breadcrumbs>
  );

  return (
    <Stack spacing={1} sx={maximized ? { height: '100%' } : undefined}>
      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      {actionError && (
        <Typography variant="body2" color="error">
          {actionError}
        </Typography>
      )}

      <DataTable<FileRow>
        tableId="files"
        columns={tableColumns}
        rows={rows}
        getRowKey={(row) => row.key}
        defaultSort={{ column: 'name', direction: 'asc' }}
        sortGroup={(row) => (row.kind === 'folder' ? 0 : 1)}
        selection={{ selectedKeys: selected, onChange: (keys) => setSelected(keys) }}
        onRowContextMenu={(row, e) => openMenu(e, row.key)}
        isEmpty={!loading && rows.length === 0}
        emptyMessage="No files here."
        maxHeight={320}
        fillHeight={Boolean(maximized)}
        tableSx={{ whiteSpace: 'nowrap' }}
        toolbar={
          <>
            {breadcrumbs}
            {selectedKeys.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                {selectedKeys.length} selected
              </Typography>
            )}
            {canCompareChecked && (
              <Button
                size="small"
                startIcon={<CompareArrowsIcon fontSize="small" />}
                onClick={compareTwoChecked}
              >
                Compare
              </Button>
            )}
            {loading && <CircularProgress size={16} />}
            <IconButton size="small" aria-label="refresh" onClick={refresh}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </>
        }
        prefixRows={(cols) =>
          dir ? (
            <TableRow
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => setDir(segments.slice(0, -1).join('/'))}
            >
              <TableCell colSpan={cols}>
                <Typography variant="body2" color="text.secondary">
                  ‹ ..
                </Typography>
              </TableCell>
            </TableRow>
          ) : null
        }
      />

      {/* Right-click context menu (single-file vs checked multi-selection). */}
      <Menu
        open={menuPos !== null}
        onClose={closeMenu}
        anchorReference="anchorPosition"
        anchorPosition={menuPos ? { top: menuPos.y, left: menuPos.x } : undefined}
      >
        {menuIsMulti
          ? [
              selectedFiles.length > 0 ? (
                <MenuItem key="download" onClick={() => doDownload(selectedFiles)}>
                  <ListItemIcon>
                    <DownloadIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Download selected ({selectedFiles.length})</ListItemText>
                </MenuItem>
              ) : null,
              <MenuItem key="move" onClick={() => beginMove(selectedTargets)}>
                <ListItemIcon>
                  <DriveFileMoveIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Move selected ({selectedKeys.length})</ListItemText>
              </MenuItem>,
              canCompareChecked ? (
                <MenuItem key="compare" onClick={compareTwoChecked}>
                  <ListItemIcon>
                    <CompareArrowsIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Compare slicer settings</ListItemText>
                </MenuItem>
              ) : null,
              <Divider key="div" />,
              <MenuItem key="delete" onClick={() => beginDelete(selectedTargets)}>
                <ListItemIcon>
                  <DeleteIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText>Delete selected ({selectedKeys.length})</ListItemText>
              </MenuItem>,
            ]
          : menuTarget
            ? menuTarget.isDir
              ? [
                  <MenuItem key="rename" onClick={() => beginRename(menuTarget)}>
                    <ListItemIcon>
                      <DriveFileRenameOutlineIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rename folder</ListItemText>
                  </MenuItem>,
                  <MenuItem key="move" onClick={() => beginMove([menuTarget])}>
                    <ListItemIcon>
                      <DriveFileMoveIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Move folder</ListItemText>
                  </MenuItem>,
                  <Divider key="div" />,
                  <MenuItem key="delete" onClick={() => beginDelete([menuTarget])}>
                    <ListItemIcon>
                      <DeleteIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>Delete folder</ListItemText>
                  </MenuItem>,
                ]
              : [
                  <MenuItem key="print" onClick={() => doPrint(menuTarget.path)}>
                    <ListItemIcon>
                      <PrintIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Print file</ListItemText>
                  </MenuItem>,
                  <MenuItem key="download" onClick={() => doDownload([menuTarget.path])}>
                    <ListItemIcon>
                      <DownloadIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Download</ListItemText>
                  </MenuItem>,
                  <MenuItem key="rename" onClick={() => beginRename(menuTarget)}>
                    <ListItemIcon>
                      <DriveFileRenameOutlineIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rename</ListItemText>
                  </MenuItem>,
                  <MenuItem key="move" onClick={() => beginMove([menuTarget])}>
                    <ListItemIcon>
                      <DriveFileMoveIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Move</ListItemText>
                  </MenuItem>,
                  <MenuItem key="slicer" onClick={() => viewSlicer(menuTarget.path)}>
                    <ListItemIcon>
                      <TuneIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>View Slicer Settings</ListItemText>
                  </MenuItem>,
                  otherCheckedFile ? (
                    <MenuItem
                      key="compare"
                      onClick={() => openCompare(otherCheckedFile, menuTarget.path)}
                    >
                      <ListItemIcon>
                        <CompareArrowsIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>Compare slicer settings with selected file</ListItemText>
                    </MenuItem>
                  ) : null,
                  <Divider key="div" />,
                  <MenuItem key="delete" onClick={() => beginDelete([menuTarget])}>
                    <ListItemIcon>
                      <DeleteIcon fontSize="small" color="error" />
                    </ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                  </MenuItem>,
                ]
            : null}
      </Menu>

      {/* Rename dialog */}
      <Dialog open={renameTarget !== undefined} onClose={() => setRenameTarget(undefined)}>
        <DialogTitle>Rename {renameTarget?.isDir ? 'folder' : 'file'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="New name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
            sx={{ mt: 1, minWidth: 320 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(undefined)}>Cancel</Button>
          <Button variant="contained" onClick={confirmRename} disabled={!renameValue.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Move dialog — pick a destination folder (or type a new one). */}
      <Dialog open={moveTargets !== undefined} onClose={() => setMoveTargets(undefined)}>
        <DialogTitle>Move {moveTargets?.length ?? 0} item(s)</DialogTitle>
        <DialogContent>
          <Box
            sx={{
              maxHeight: 280,
              minWidth: 360,
              overflow: 'auto',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              mb: 1,
            }}
          >
            <List dense disablePadding>
              {allDirs.map((d) => {
                const depth = d === '' ? 0 : d.split('/').length;
                return (
                  <ListItemButton
                    key={d || '__root'}
                    selected={moveDest === d}
                    onClick={() => setMoveDest(d)}
                    sx={{ pl: 1 + depth * 2 }}
                  >
                    <ListItemIcon sx={{ minWidth: 30 }}>
                      <FolderIcon fontSize="small" color="warning" />
                    </ListItemIcon>
                    <ListItemText primary={d === '' ? 'gcodes (root)' : baseName(d)} />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
          <TextField
            fullWidth
            size="small"
            label="Destination (or type a new folder)"
            placeholder="empty = gcodes root"
            value={moveDest}
            onChange={(e) => setMoveDest(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmMove()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveTargets(undefined)}>Cancel</Button>
          <Button variant="contained" onClick={confirmMove}>
            Move
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTargets !== undefined} onClose={() => setDeleteTargets(undefined)}>
        <DialogTitle>Delete {deleteTargets?.length ?? 0} item(s)?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This permanently removes the selected item(s) from the printer. Folders are deleted
            recursively, including all of their contents.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTargets(undefined)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Slicer settings dialog */}
      {slicerPath && (
        <SlicerSettingsDialog
          printerId={printerId}
          path={slicerPath}
          onClose={() => setSlicerPath(undefined)}
        />
      )}

      {/* Slicer settings comparison dialog */}
      {comparePaths && (
        <SlicerSettingsCompareDialog
          printerId={printerId}
          pathA={comparePaths.a}
          pathB={comparePaths.b}
          onClose={() => setComparePaths(undefined)}
        />
      )}
    </Stack>
  );
}
