import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlayerRow } from '@/lib/queries';
import { useIsMobile } from '@/lib/use-mobile';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';

const Z_SCORE_COLUMNS = new Set(['z_xwoba', 'z_pull_air_pct', 'z_bb_k', 'z_sb', 'z_pa']);
const NUMERIC_COLUMNS = new Set([
  'pa',
  'bbe',
  'xwoba',
  'pull_air_pct',
  'bb_k',
  'sb',
  'z_xwoba',
  'z_pull_air_pct',
  'z_bb_k',
  'z_sb',
  'z_pa',
  'composite_score',
]);

function hasNoStatcastData(row: PlayerRow): boolean {
  return row.pa == null && row.bbe == null;
}

function getZScoreBgClass(value: number | null): string {
  if (value == null) return '';
  if (value <= -1.5) return 'bg-destructive/20 dark:bg-destructive/35';
  if (value <= -0.5) return 'bg-destructive/10 dark:bg-destructive/20';
  if (value < 0.5) return '';
  if (value < 1.5) return 'bg-navy-deep/8 dark:bg-navy-mid/20';
  return 'bg-navy-deep/16 dark:bg-navy-mid/35';
}

function buildSparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const xStep = values.length > 1 ? width / (values.length - 1) : 0;
  const range = max - min;

  return values
    .map((value, idx) => {
      const x = idx * xStep;
      const y = range === 0 ? height / 2 : height - ((value - min) / range) * height;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function trendClass(values: number[]): string {
  if (values.length < 2) return 'text-muted-foreground';
  const delta = values[values.length - 1] - values[0];
  if (Math.abs(delta) < 1e-6) return 'text-muted-foreground';
  return delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
}

function getHitterTrendEmoji(player: PlayerRow): string {
  const toEmoji = (v: number | null) => {
    if (v == null) return '➖';
    if (v > 0.5) return '🔥';
    if (v < -0.5) return '🧊';
    return '➖';
  };
  return `${toEmoji(player.composite_l30)}${toEmoji(player.composite_l14)}${toEmoji(player.composite_l7)}`;
}

function getHitterTrendTooltip(player: PlayerRow): string {
  const fmt = (v: number | null) => (v != null ? v.toFixed(2) : 'n/a');
  return `L30: ${fmt(player.composite_l30)}  L14: ${fmt(player.composite_l14)}  L7: ${fmt(player.composite_l7)}`;
}

function MetricValueWithSparkline({
  value,
  display,
  trend,
  showSparkline,
}: {
  value: number | null;
  display: string;
  trend: number[];
  showSparkline: boolean;
}) {
  if (value == null) {
    return '—';
  }

  if (!showSparkline || trend.length < 2) {
    return display;
  }

  const width = 46;
  const height = 14;
  const path = buildSparklinePath(trend, width, height);

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{display}</span>
      <svg
        className={trendClass(trend)}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function getColumns(showMetricSparklines: boolean): ColumnDef<PlayerRow>[] {
  return [
  {
    id: 'trend',
    header: 'Trend',
    cell: ({ row }) => (
      <span className="text-base tracking-wide" title={getHitterTrendTooltip(row.original)}>
        {getHitterTrendEmoji(row.original)}
      </span>
    ),
  },
  {
    accessorKey: 'player_name',
    header: 'Player',
    cell: ({ row, getValue }) => (
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{getValue<string>()}</span>
        {hasNoStatcastData(row.original) && (
          <span
            title="No Statcast game-log match found — possible name mismatch between Yahoo and pybaseball data"
            aria-label="No Statcast data"
          >
            ⚠️
          </span>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'mlb_team',
    header: 'Team',
  },
  {
    accessorKey: 'position',
    header: 'Position',
  },
  {
    accessorKey: 'fantasy_team',
    header: 'Fantasy Team',
    cell: ({ getValue }) => {
      const v = getValue<string>();
      const clean = v ? v.replace(/\s*\(.*?\)\s*/g, '').trim() : '—';
      return <span className="text-xs text-muted-foreground truncate block max-w-[120px]" title={v}>{clean}</span>;
    },
  },
  {
    accessorKey: 'pa',
    header: 'PA',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v : '—';
    },
  },
  {
    accessorKey: 'bbe',
    header: 'BBE',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v : '—';
    },
  },
  {
    accessorKey: 'xwoba',
    header: 'xwOBA',
    cell: ({ getValue, row }) => {
      const v = getValue<number | null>();
      return (
        <MetricValueWithSparkline
          value={v}
          display={v != null ? v.toFixed(3) : '—'}
          trend={row.original.trend_xwoba}
          showSparkline={showMetricSparklines}
        />
      );
    },
  },
  {
    accessorKey: 'pull_air_pct',
    header: 'Pull Air%',
    cell: ({ getValue, row }) => {
      const v = getValue<number | null>();
      return (
        <MetricValueWithSparkline
          value={v}
          display={v != null ? `${v.toFixed(1)}%` : '—'}
          trend={row.original.trend_pull_air_pct}
          showSparkline={showMetricSparklines}
        />
      );
    },
  },
  {
    accessorKey: 'bb_k',
    header: 'BB:K',
    cell: ({ getValue, row }) => {
      const v = getValue<number | null>();
      return (
        <MetricValueWithSparkline
          value={v}
          display={v != null ? v.toFixed(2) : '—'}
          trend={row.original.trend_bb_k}
          showSparkline={showMetricSparklines}
        />
      );
    },
  },
  {
    accessorKey: 'sb',
    header: 'SB',
    cell: ({ getValue, row }) => {
      const v = getValue<number | null>();
      return (
        <MetricValueWithSparkline
          value={v}
          display={v != null ? v.toFixed(0) : '—'}
          trend={row.original.trend_sb}
          showSparkline={showMetricSparklines}
        />
      );
    },
  },
  {
    accessorKey: 'z_xwoba',
    header: 'xwOBA Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'z_pull_air_pct',
    header: 'Pull% Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'z_bb_k',
    header: 'BB:K Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'z_sb',
    header: 'SB Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'z_pa',
    header: 'PA Adj Z',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  {
    accessorKey: 'composite_score',
    header: 'Composite',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? v.toFixed(2) : '—';
    },
  },
  ];
}

interface PlayerTableProps {
  data: PlayerRow[];
  isLoading: boolean;
  showMetricSparklines: boolean;
}

/**
 * Per-table loading skeleton shown on re-queries and tab switches.
 * Mirrors the app-level first-load skeleton vocabulary (bg-surface-header for
 * primary shapes, bg-surface for secondary, animate-pulse + i*60ms stagger) and
 * the real table's outer structure so the swap to data causes no layout shift.
 */
function TableSkeletonDesktop() {
  return (
    <div className="flex min-h-0 flex-col flex-1 overflow-hidden" aria-hidden="true">
      <div className="min-h-0 overflow-hidden flex-1">
        <div className="bg-surface-header border-b border-border h-9" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 border-b border-border animate-pulse motion-reduce:animate-none"
            style={{ height: '41px', animationDelay: `${i * 60}ms` }}
          >
            <div className="h-3.5 w-6 rounded bg-surface-header flex-shrink-0" />
            <div className="h-3.5 rounded bg-surface" style={{ width: `${100 + (i % 3) * 36}px` }} />
            <div className="h-3.5 w-14 rounded bg-surface" />
            <div className="h-3.5 w-12 rounded bg-surface ml-auto" />
            <div className="h-3.5 w-12 rounded bg-surface" />
            <div className="h-3.5 w-12 rounded bg-surface" />
            <div className="h-3.5 w-10 rounded bg-surface" />
          </div>
        ))}
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">
        <div className="h-4 w-28 rounded bg-surface animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function TableSkeletonMobile() {
  return (
    <div className="flex min-h-0 flex-col flex-1 overflow-hidden" aria-hidden="true">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-shrink-0">
        <div className="h-3.5 w-10 rounded bg-surface-header animate-pulse motion-reduce:animate-none shrink-0" />
        <div className="h-8 flex-1 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
        <div className="h-8 w-8 rounded bg-surface-header animate-pulse motion-reduce:animate-none shrink-0" />
      </div>
      <div className="min-h-0 overflow-hidden flex-1">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="border-b px-3 py-2.5 animate-pulse motion-reduce:animate-none"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="h-4 rounded bg-surface-header" style={{ width: `${120 + (i % 3) * 32}px` }} />
                <div className="h-3 w-40 rounded bg-surface" />
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="h-4 w-12 rounded bg-surface-header" />
                <div className="h-2.5 w-14 rounded bg-surface" />
              </div>
            </div>
            <div className="flex gap-1 mt-2">
              {[44, 52, 44, 32, 52].map((w, j) => (
                <div key={j} className="h-5 rounded bg-surface" style={{ width: `${w}px` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t px-3 py-2 text-sm text-muted-foreground pb-[env(safe-area-inset-bottom,0px)]">
        <div className="h-4 w-28 rounded bg-surface animate-pulse motion-reduce:animate-none" />
      </div>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'composite_score', label: 'Composite' },
  { value: 'z_xwoba', label: 'xwOBA Z' },
  { value: 'z_pull_air_pct', label: 'Pull% Z' },
  { value: 'z_bb_k', label: 'BB:K Z' },
  { value: 'z_sb', label: 'SB Z' },
  { value: 'z_pa', label: 'PA Adj Z' },
  { value: 'xwoba', label: 'xwOBA' },
  { value: 'pull_air_pct', label: 'Pull Air%' },
  { value: 'bb_k', label: 'BB:K' },
  { value: 'sb', label: 'SB' },
  { value: 'pa', label: 'PA' },
  { value: 'player_name', label: 'Player' },
] as const;

function fmt(v: number | null, digits: number, suffix = ''): string {
  if (v == null) return '—';
  return v.toFixed(digits) + suffix;
}

function ZBadge({ label, value }: { label: string; value: number | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${getZScoreBgClass(value)}`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium font-mono tabular-nums">{value != null ? value.toFixed(2) : '—'}</span>
    </span>
  );
}

function PlayerCard({
  player,
  expanded,
  onToggle,
  showMetricSparklines,
}: {
  player: PlayerRow;
  expanded: boolean;
  onToggle: () => void;
  showMetricSparklines: boolean;
}) {
  return (
    <div className="border-b px-3 py-2.5">
      <button
        type="button"
        className="w-full text-left"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium truncate">{player.player_name}</span>
              {hasNoStatcastData(player) && (
                <span
                  title="No Statcast game-log match found — possible name mismatch between Yahoo and pybaseball data"
                  aria-label="No Statcast data"
                  className="shrink-0"
                >
                  ⚠️
                </span>
              )}
              <span className="text-base tracking-wide shrink-0" title={getHitterTrendTooltip(player)}>
                {getHitterTrendEmoji(player)}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {player.mlb_team} · {player.position} · <span className="">{player.fantasy_team ? player.fantasy_team.replace(/\s*\(.*?\)\s*/g, '').trim() : ''}</span>
              {player.bbe != null && <span> · <span className="font-mono tabular-nums">{player.bbe} BBE</span></span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <div className="text-sm font-semibold font-mono tabular-nums">
                {fmt(player.composite_score, 2)}
              </div>
              <div className="text-[10px] text-muted-foreground">Composite</div>
            </div>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          <ZBadge label="xwOBA" value={player.z_xwoba} />
          <ZBadge label="Pull%" value={player.z_pull_air_pct} />
          <ZBadge label="BB:K" value={player.z_bb_k} />
          <ZBadge label="SB" value={player.z_sb} />
          <ZBadge label="PA Adj" value={player.z_pa} />
        </div>
      </button>
      {expanded && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 mt-2.5 pt-2.5 border-t text-xs">
          <div>
            <span className="text-muted-foreground">PA</span>{' '}
            <span className="font-medium font-mono tabular-nums">{player.pa ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">BBE</span>{' '}
            <span className="font-medium font-mono tabular-nums">{player.bbe ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">xwOBA</span>{' '}
            <span className="font-medium font-mono tabular-nums">
              <MetricValueWithSparkline
                value={player.xwoba}
                display={fmt(player.xwoba, 3)}
                trend={player.trend_xwoba}
                showSparkline={showMetricSparklines}
              />
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Pull Air%</span>{' '}
            <span className="font-medium font-mono tabular-nums">
              <MetricValueWithSparkline
                value={player.pull_air_pct}
                display={fmt(player.pull_air_pct, 1, '%')}
                trend={player.trend_pull_air_pct}
                showSparkline={showMetricSparklines}
              />
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">BB:K</span>{' '}
            <span className="font-medium font-mono tabular-nums">
              <MetricValueWithSparkline
                value={player.bb_k}
                display={fmt(player.bb_k, 2)}
                trend={player.trend_bb_k}
                showSparkline={showMetricSparklines}
              />
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">SB</span>{' '}
            <span className="font-medium font-mono tabular-nums">
              <MetricValueWithSparkline
                value={player.sb}
                display={fmt(player.sb, 0)}
                trend={player.trend_sb}
                showSparkline={showMetricSparklines}
              />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayerTable({ data, isLoading, showMetricSparklines }: PlayerTableProps) {
  const isMobile = useIsMobile();
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'composite_score', desc: true },
  ]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const columns = useMemo(
    () => getColumns(showMetricSparklines),
    [showMetricSparklines]
  );

  // TanStack table returns functions that the React compiler warns about by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const toggleExpand = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (isLoading) {
    return (
      <>
        <span className="sr-only" role="status" aria-live="polite">
          Loading player data
        </span>
        {isMobile ? <TableSkeletonMobile /> : <TableSkeletonDesktop />}
      </>
    );
  }

  const sortedRows = table.getRowModel().rows;
  const currentSortId = sorting[0]?.id ?? 'composite_score';
  const currentSortDesc = sorting[0]?.desc ?? true;

  if (isMobile) {
    return (
      <div className="flex min-h-0 flex-col flex-1 overflow-hidden">
        {/* Mobile sort control */}
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground shrink-0">Sort by</span>
          <Select
            value={currentSortId}
            onValueChange={(v) => {
              if (!v) return;
              setSorting([{ id: v, desc: v !== 'player_name' }]);
            }}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border text-xs shrink-0 hover:bg-accent"
            onClick={() =>
              setSorting([{ id: currentSortId, desc: !currentSortDesc }])
            }
            aria-label={currentSortDesc ? 'Sort ascending' : 'Sort descending'}
          >
            {currentSortDesc ? (
              <ArrowDown className="h-3.5 w-3.5" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Card list */}
        <div className="min-h-0 overflow-auto flex-1">
          {sortedRows.length > 0 ? (
            sortedRows.map((row, idx) => (
              <PlayerCard
                key={row.id}
                player={row.original}
                expanded={expandedRows.has(idx)}
                onToggle={() => toggleExpand(idx)}
                showMetricSparklines={showMetricSparklines}
              />
            ))
          ) : (
            <div className="p-8">
              <EmptyState hint="Try clearing the Fantasy Team or Position filter." />
            </div>
          )}
        </div>

        <div className="border-t px-3 py-2 text-sm text-muted-foreground pb-[env(safe-area-inset-bottom,0px)]">
          Showing {sortedRows.length} players
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col flex-1 overflow-hidden">
      <div className="min-h-0 overflow-y-auto overflow-x-hidden flex-1">
        <Table className="w-full table-auto">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="cursor-pointer select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getIsSorted() === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : header.column.getIsSorted() === 'desc' ? (
                        <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={`${NUMERIC_COLUMNS.has(cell.column.id) ? 'font-mono tabular-nums' : ''} ${Z_SCORE_COLUMNS.has(cell.column.id) ? getZScoreBgClass(cell.getValue<number | null>()) : ''}`}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  <EmptyState hint="Try clearing the Fantasy Team or Position filter." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">
        Showing {table.getRowModel().rows.length} players
      </div>
    </div>
  );
}