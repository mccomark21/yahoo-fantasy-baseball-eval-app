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
import type { ProspectRow } from '@/lib/queries';

type ProspectSortKey =
  | 'best_rank_bias_score'
  | 'player_name'
  | 'average_rank'
  | 'highest_rank'
  | 'lowest_rank'
  | 'stddev_rank'
  | 'fantasy_team';

interface ProspectTableProps {
  data: ProspectRow[];
  isLoading: boolean;
}

function getSortValue(row: ProspectRow, key: ProspectSortKey): number | string {
  if (key === 'player_name') return row.player_name;
  if (key === 'fantasy_team') return row.fantasy_team ?? 'zzzz';
  return row[key] ?? Number.POSITIVE_INFINITY;
}

function rosterBadgeClass(isRostered: boolean): string {
  return isRostered
    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
    : 'bg-muted text-muted-foreground';
}

function formatAge(value: number | null): string {
  if (value == null) return '—';
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(1);
}

export function ProspectTable({ data, isLoading }: ProspectTableProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<ProspectSortKey>('best_rank_bias_score');
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

  const setSort = (key: ProspectSortKey) => {
    if (sortKey === key) {
      setSortDesc((value) => !value);
      return;
    }
    setSortKey(key);
    setSortDesc(false);
  };

  const sortIcon = (key: ProspectSortKey) => {
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
    return <div className="flex items-center justify-center p-12 text-muted-foreground">Loading prospects...</div>;
  }

  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 overflow-auto">
        {sortedData.length > 0 ? (
          sortedData.map((row, index) => {
            const rowKey = `${row.norm_name}-${index}`;
            const isExpanded = expandedRows.has(rowKey);
            const rosterLabel = row.is_rostered ? 'Rostered' : 'Available';

            return (
              <div key={rowKey} className="border-b px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(rowKey)}
                      className="flex w-full items-center justify-between gap-2 text-left"
                      aria-expanded={isExpanded}
                      aria-label={`Toggle details for ${row.player_name}`}
                    >
                      <span className="font-medium truncate">{row.player_name}</span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {row.organization ?? '—'} · {row.positions || '—'} · Age {formatAge(row.age)} · ETA {row.eta ?? '—'} · {row.level ?? '—'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs">Avg {row.average_rank.toFixed(2)}</div>
                    <span
                      className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${rosterBadgeClass(row.is_rostered)}`}
                    >
                      {rosterLabel}
                    </span>
                  </div>
                </div>
                {isExpanded ? (
                  <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                    <div>Team: {row.fantasy_team ?? 'Not Found'}</div>
                    <div>Ranks: MLB {row.mlb_rank ?? '—'} · FG {row.fangraphs_rank ?? '—'} · PLive {row.prospects_live_rank ?? '—'}</div>
                    <div>High/Low/StdDev: {row.highest_rank} / {row.lowest_rank} / {row.stddev_rank.toFixed(2)}</div>
                    <div>HT/WT: {row.height ?? '—'} / {row.weight ?? '—'}</div>
                    <div>B/T: {row.bats ?? '—'} / {row.throws ?? '—'} · FV/OFP: {row.fv ?? '—'} / {row.ofp ?? '—'}</div>
                    {row.player_summary ? <div>Summary: {row.player_summary}</div> : null}
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
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('player_name')}>
                <div className="flex items-center gap-1">Prospect {sortIcon('player_name')}</div>
              </TableHead>
              <TableHead>Org</TableHead>
              <TableHead>Pos</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Level</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('fantasy_team')}>
                <div className="flex items-center gap-1">Fantasy Team {sortIcon('fantasy_team')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('average_rank')}>
                <div className="flex items-center gap-1">Avg {sortIcon('average_rank')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('highest_rank')}>
                <div className="flex items-center gap-1">High {sortIcon('highest_rank')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('lowest_rank')}>
                <div className="flex items-center gap-1">Low {sortIcon('lowest_rank')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('stddev_rank')}>
                <div className="flex items-center gap-1">StdDev {sortIcon('stddev_rank')}</div>
              </TableHead>
              <TableHead>MLB</TableHead>
              <TableHead>FG</TableHead>
              <TableHead>PLive</TableHead>
              <TableHead>Rostered</TableHead>
              <TableHead>Meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((row) => (
                <TableRow key={row.norm_name}>
                  <TableCell className="font-medium">{row.player_name}</TableCell>
                  <TableCell>{row.organization ?? '—'}</TableCell>
                  <TableCell>{row.positions || '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{formatAge(row.age)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.eta ?? '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.level ?? '—'}</TableCell>
                  <TableCell>{row.fantasy_team ?? 'Not Found'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.average_rank.toFixed(2)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.highest_rank}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.lowest_rank}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.stddev_rank.toFixed(2)}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.mlb_rank ?? '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.fangraphs_rank ?? '—'}</TableCell>
                  <TableCell className="font-mono tabular-nums">{row.prospects_live_rank ?? '—'}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${rosterBadgeClass(row.is_rostered)}`}
                    >
                      {row.is_rostered ? 'Yes' : 'No'}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-md text-xs leading-5 text-muted-foreground whitespace-normal">
                    HT/WT {row.height ?? '—'} / {row.weight ?? '—'}
                    <br />
                    B/T {row.bats ?? '—'}/{row.throws ?? '—'} · FV/OFP {row.fv ?? '—'}/{row.ofp ?? '—'}
                    {row.player_summary ? (
                      <>
                        <br />
                        Summary: {row.player_summary}
                      </>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={16} className="h-24 text-center text-muted-foreground">No results.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">Showing {sortedData.length} prospects</div>
    </div>
  );
}
