import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/lib/use-mobile';
import type { TrendDirection } from '@/lib/pitcherlist-client';
import type { PitcherTrendRow } from '@/lib/queries';

type PitcherSortKey = 'latest_rank' | 'movement_value' | 'trend_8w_net' | 'player_name' | 'fantasy_team';

interface PitcherTableProps {
  data: PitcherTrendRow[];
  isLoading: boolean;
}

function trendPillClass(direction: TrendDirection): string {
  if (direction === 'up' || direction === 'new') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  }
  if (direction === 'down') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  }
  return 'bg-muted text-muted-foreground';
}

function movementSortValue(row: PitcherTrendRow): number {
  if (row.movement_value == null) {
    if (row.trend_direction === 'new') return 1000;
    return Number.NEGATIVE_INFINITY;
  }
  return row.movement_value;
}

function getSortValue(row: PitcherTrendRow, key: PitcherSortKey): number | string {
  if (key === 'latest_rank') return row.latest_rank;
  if (key === 'movement_value') return movementSortValue(row);
  if (key === 'trend_8w_net') return row.trend_8w_net ?? Number.NEGATIVE_INFINITY;
  if (key === 'fantasy_team') return row.fantasy_team ?? 'zzzz';
  return row.player_name;
}

function TrendSparkline({ series }: { series: (number | null)[] }) {
  const defined = series.filter((v): v is number => v != null);
  if (defined.length < 2) {
    return <div className="h-6 w-16 text-[11px] text-muted-foreground">n/a</div>;
  }

  const first = defined[0];
  const last = defined[defined.length - 1];
  // Lower rank = better, so improvement means end < start
  const color = last < first ? '#22c55e' : last > first ? '#ef4444' : '#6b7280';

  const width = 64;
  const height = 24;
  const pad = 2;
  const min = Math.min(...defined);
  const max = Math.max(...defined);
  const range = Math.max(1, max - min);
  const n = series.length;

  const getX = (idx: number) => pad + ((width - pad * 2) * idx) / Math.max(1, n - 1);
  const getY = (value: number) => pad + ((height - pad * 2) * (value - min)) / range;

  // Split into contiguous segments, leaving gaps where value is null
  const segments: string[][] = [];
  let current: string[] = [];
  series.forEach((value, idx) => {
    if (value == null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      current.push(`${getX(idx)},${getY(value)}`);
    }
  });
  if (current.length > 0) segments.push(current);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden="true"
    >
      {segments.map((pts, i) =>
        pts.length === 1 ? (
          <circle
            key={i}
            cx={pts[0].split(',')[0]}
            cy={pts[0].split(',')[1]}
            r="1.5"
            fill={color}
          />
        ) : (
          <polyline
            key={i}
            fill="none"
            stroke={color}
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pts.join(' ')}
          />
        )
      )}
    </svg>
  );
}

export function PitcherTable({ data, isLoading }: PitcherTableProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<PitcherSortKey>('latest_rank');
  const [sortDesc, setSortDesc] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const sortedData = useMemo(() => {
    const rows = [...data];
    rows.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);

      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv);
        return sortDesc ? -cmp : cmp;
      }

      const cmp = Number(av) - Number(bv);
      return sortDesc ? -cmp : cmp;
    });
    return rows;
  }, [data, sortKey, sortDesc]);

  const setSort = (key: PitcherSortKey) => {
    if (sortKey === key) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(key);
    setSortDesc(key === 'trend_8w_net' || key === 'movement_value');
  };

  const sortIcon = (key: PitcherSortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;
    return sortDesc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />;
  };

  const toggleExpand = (rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground">Loading pitcher rankings...</div>;
  }

  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        {sortedData.length > 0 ? (
          sortedData.map((row) => {
            const rowKey = `${row.latest_rank}-${row.player_name}`;
            const isExpanded = expandedRows.has(rowKey);

            return (
              <div key={rowKey} className="border-b px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(rowKey)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                      aria-expanded={isExpanded}
                      aria-label={`Toggle note for ${row.player_name}`}
                    >
                      <span className="font-medium truncate"><span className="font-mono tabular-nums">#{row.latest_rank}</span> {row.player_name}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {row.mlb_team ?? '—'} · {row.fantasy_team ?? 'Not Found'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium font-mono tabular-nums ${trendPillClass(row.trend_direction)}`}>
                      {row.movement_raw}
                    </span>
                    <div className="text-[11px] mt-1 text-muted-foreground">
                      8W: {row.trend_start_rank != null && row.trend_end_rank != null ? `${row.trend_start_rank} -> ${row.trend_end_rank}` : 'n/a'}
                    </div>
                  </div>
                </div>
                <div className="mt-2">
                  <TrendSparkline series={row.trend_8w_series} />
                </div>
                {isExpanded ? (
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">
                    {row.notes ?? 'No note available.'}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-muted-foreground">No results.</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col flex-1 overflow-hidden">
      <div className="min-h-0 overflow-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('latest_rank')}>
                <div className="flex items-center gap-1">Rank {sortIcon('latest_rank')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('player_name')}>
                <div className="flex items-center gap-1">Pitcher {sortIcon('player_name')}</div>
              </TableHead>
              <TableHead>MLB</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('movement_value')}>
                <div className="flex items-center gap-1">This Week {sortIcon('movement_value')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('trend_8w_net')}>
                <div className="flex items-center gap-1">Trend (8W) {sortIcon('trend_8w_net')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('fantasy_team')}>
                <div className="flex items-center gap-1">Fantasy Team {sortIcon('fantasy_team')}</div>
              </TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((row) => (
                <TableRow key={`${row.latest_rank}-${row.player_name}`}>
                  <TableCell className="font-mono tabular-nums">{row.latest_rank}</TableCell>
                  <TableCell className="font-medium">{row.player_name}</TableCell>
                  <TableCell>{row.mlb_team ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium font-mono tabular-nums ${trendPillClass(row.trend_direction)}`}>
                      {row.movement_raw}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2" title={row.trend_start_rank != null && row.trend_end_rank != null ? `${row.trend_start_rank} -> ${row.trend_end_rank}` : 'Insufficient history'}>
                      <TrendSparkline series={row.trend_8w_series} />
                    </div>
                  </TableCell>
                  <TableCell>{row.fantasy_team ?? 'Not Found'}</TableCell>
                  <TableCell className="max-w-md text-xs leading-5 text-muted-foreground whitespace-normal">
                    {row.notes ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No results.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">Showing {sortedData.length} pitchers</div>
    </div>
  );
}
