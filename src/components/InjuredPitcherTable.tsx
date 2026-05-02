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
import type { InjuredPitcherTrendRow } from '@/lib/queries';

type InjuredSortKey = 'rank_when_healthy' | 'player_name' | 'source_list' | 'fantasy_team';

interface InjuredPitcherTableProps {
  data: InjuredPitcherTrendRow[];
  isLoading: boolean;
}

function getSortValue(row: InjuredPitcherTrendRow, key: InjuredSortKey): number | string {
  if (key === 'rank_when_healthy') return row.rank_when_healthy ?? Number.MAX_SAFE_INTEGER;
  if (key === 'source_list') return row.source_list;
  if (key === 'fantasy_team') return row.fantasy_team ?? 'zzzz';
  return row.player_name;
}

export function InjuredPitcherTable({ data, isLoading }: InjuredPitcherTableProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<InjuredSortKey>('rank_when_healthy');
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

  const setSort = (key: InjuredSortKey) => {
    if (sortKey === key) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(key);
    setSortDesc(false);
  };

  const sortIcon = (key: InjuredSortKey) => {
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
    return <div className="flex items-center justify-center p-12 text-muted-foreground">Loading injured pitcher rankings...</div>;
  }

  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        {sortedData.length > 0 ? (
          sortedData.map((row) => {
            const rowKey = `${row.source_list}-${row.rank_when_healthy ?? 'na'}-${row.player_name}`;
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
                      aria-label={`Toggle injury note for ${row.player_name}`}
                    >
                      <span className="font-medium truncate">
                        <span className="font-mono tabular-nums">#{row.rank_when_healthy ?? '-'}</span> {row.player_name}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {row.source_list} · {row.mlb_team ?? '-'} · {row.fantasy_team ?? 'Not Found'}
                    </div>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">
                    {row.injury_note ?? 'No injury note available.'}
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
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('rank_when_healthy')}>
                <div className="flex items-center gap-1">Healthy Rank {sortIcon('rank_when_healthy')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('player_name')}>
                <div className="flex items-center gap-1">Pitcher {sortIcon('player_name')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('source_list')}>
                <div className="flex items-center gap-1">Role {sortIcon('source_list')}</div>
              </TableHead>
              <TableHead>MLB</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('fantasy_team')}>
                <div className="flex items-center gap-1">Fantasy Team {sortIcon('fantasy_team')}</div>
              </TableHead>
              <TableHead>Injury Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((row) => (
                <TableRow key={`${row.source_list}-${row.rank_when_healthy ?? 'na'}-${row.player_name}`}>
                  <TableCell className="font-mono tabular-nums">{row.rank_when_healthy ?? '-'}</TableCell>
                  <TableCell className="font-medium">{row.player_name}</TableCell>
                  <TableCell>{row.source_list}</TableCell>
                  <TableCell>{row.mlb_team ?? '-'}</TableCell>
                  <TableCell>{row.fantasy_team ?? 'Not Found'}</TableCell>
                  <TableCell className="max-w-md text-xs leading-5 text-muted-foreground whitespace-normal">
                    {row.injury_note ?? '-'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No results.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">Showing {sortedData.length} injured pitchers</div>
    </div>
  );
}
