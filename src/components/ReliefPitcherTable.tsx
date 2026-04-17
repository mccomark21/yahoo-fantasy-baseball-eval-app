import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
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
import type { ReliefTrendRow } from '@/lib/queries';

type ReliefSortKey = 'latest_rank' | 'movement_value' | 'player_name' | 'fantasy_team';

interface ReliefPitcherTableProps {
  data: ReliefTrendRow[];
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

function getSortValue(row: ReliefTrendRow, key: ReliefSortKey): number | string {
  if (key === 'latest_rank') return row.latest_rank;
  if (key === 'movement_value') return row.movement_value ?? Number.NEGATIVE_INFINITY;
  if (key === 'fantasy_team') return row.fantasy_team ?? 'zzzz';
  return row.player_name;
}

export function ReliefPitcherTable({ data, isLoading }: ReliefPitcherTableProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<ReliefSortKey>('latest_rank');
  const [sortDesc, setSortDesc] = useState(false);

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

  const setSort = (key: ReliefSortKey) => {
    if (sortKey === key) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(key);
    setSortDesc(key === 'movement_value');
  };

  const sortIcon = (key: ReliefSortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;
    return sortDesc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-12 text-muted-foreground">Loading reliever rankings...</div>;
  }

  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        {sortedData.length > 0 ? (
          sortedData.map((row) => (
            <div key={`${row.latest_rank}-${row.player_name}`} className="border-b px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">#{row.latest_rank} {row.player_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {row.mlb_team ?? '—'} · {row.fantasy_team ?? 'Not Found'}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${trendPillClass(row.trend_direction)}`}>
                    {row.movement_raw}
                  </span>
                  <div className="text-[11px] mt-1 text-muted-foreground">
                    {row.fantasy_team ?? 'Not Found'}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-muted-foreground">No results.</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('latest_rank')}>
                <div className="flex items-center gap-1">Rank {sortIcon('latest_rank')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('player_name')}>
                <div className="flex items-center gap-1">Reliever {sortIcon('player_name')}</div>
              </TableHead>
              <TableHead>MLB</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('movement_value')}>
                <div className="flex items-center gap-1">Movement {sortIcon('movement_value')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('fantasy_team')}>
                <div className="flex items-center gap-1">Fantasy Team {sortIcon('fantasy_team')}</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((row) => (
                <TableRow key={`${row.latest_rank}-${row.player_name}`}>
                  <TableCell className="tabular-nums">{row.latest_rank}</TableCell>
                  <TableCell className="font-medium">{row.player_name}</TableCell>
                  <TableCell>{row.mlb_team ?? '—'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${trendPillClass(row.trend_direction)}`}>
                      {row.movement_raw}
                    </span>
                  </TableCell>
                  <TableCell>{row.fantasy_team ?? 'Not Found'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No results.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">Showing {sortedData.length} relievers</div>
    </div>
  );
}
