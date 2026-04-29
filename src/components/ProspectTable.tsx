import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useIsMobile } from '@/lib/use-mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { ProspectRow, ProspectStatsWindow } from '@/lib/queries';

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

function formatNum(value: number | null, digits = 2): string {
  if (value == null) return '—';
  if (Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function ProspectTable({ data, isLoading }: ProspectTableProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<ProspectSortKey>('best_rank_bias_score');
  const [sortDesc, setSortDesc] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showRankingColumns, setShowRankingColumns] = useState(false);
  const [statsWindow, setStatsWindow] = useState<ProspectStatsWindow>('STD');

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
        {/* Mobile toolbar */}
        <div className="border-b bg-background p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Stats Window:</span>
            <Select value={statsWindow} onValueChange={(value) => setStatsWindow(value as ProspectStatsWindow)}>
              <SelectTrigger className="h-8 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STD">Season</SelectItem>
                <SelectItem value="L30">L30</SelectItem>
                <SelectItem value="L14">L14</SelectItem>
                <SelectItem value="L7">L7</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {sortedData.length > 0 ? (
          sortedData.map((row, index) => {
            const rowKey = `${row.norm_name}-${index}`;
            const isExpanded = expandedRows.has(rowKey);
            const rosterLabel = row.is_rostered ? 'Rostered' : 'Available';
            const stats = row.minor_league_stats[statsWindow];

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
                    <div className="pt-1 border-t mt-2">
                      <div className="font-semibold mb-1">Minor League Stats ({statsWindow})</div>
                      {stats.atBats != null && <div>AB: {formatNum(stats.atBats, 0)} · AVG: {formatNum(stats.avg, 3)} · HR: {formatNum(stats.homeRuns, 0)}</div>}
                      {stats.era != null && <div>IP: {formatNum(stats.inningsPitched, 1)} · ERA: {formatNum(stats.era, 2)} · WHIP: {formatNum(stats.whip, 2)} · K/9: {formatNum(stats.strikeoutsPer9, 1)}</div>}
                    </div>
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
    <div className="flex min-h-0 flex-col flex-1 overflow-hidden">
      {/* Desktop toolbar */}
      <div className="border-b bg-background px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRankingColumns(!showRankingColumns)}
            className="gap-2"
          >
            {showRankingColumns ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            {showRankingColumns ? 'Hide' : 'Show'} Rankings
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Stats Window:</span>
          <Select value={statsWindow} onValueChange={(value) => setStatsWindow(value as ProspectStatsWindow)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="STD">Season to Date</SelectItem>
              <SelectItem value="L30">Last 30 Days</SelectItem>
              <SelectItem value="L14">Last 14 Days</SelectItem>
              <SelectItem value="L7">Last 7 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-h-0 overflow-auto flex-1">
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
                <div className="flex items-center gap-1">Avg Rank {sortIcon('average_rank')}</div>
              </TableHead>
              {showRankingColumns && (
                <>
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
                </>
              )}
              <TableHead>Rostered</TableHead>
              <TableHead>AB / HR / AVG / OPS</TableHead>
              <TableHead>IP / ERA / WHIP / K/9</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((row) => {
                const stats = row.minor_league_stats[statsWindow];
                const hasHitterStats = stats.atBats != null || stats.avg != null;
                const hasPitcherStats = stats.inningsPitched != null || stats.era != null || stats.whip != null;

                return (
                  <TableRow key={row.norm_name}>
                    <TableCell className="font-medium">{row.player_name}</TableCell>
                    <TableCell>{row.organization ?? '—'}</TableCell>
                    <TableCell>{row.positions || '—'}</TableCell>
                    <TableCell className="font-mono tabular-nums">{formatAge(row.age)}</TableCell>
                    <TableCell className="font-mono tabular-nums">{row.eta ?? '—'}</TableCell>
                    <TableCell className="font-mono tabular-nums">{row.level ?? '—'}</TableCell>
                    <TableCell>{row.fantasy_team ?? 'Not Found'}</TableCell>
                    <TableCell className="font-mono tabular-nums font-semibold">{row.average_rank.toFixed(2)}</TableCell>
                    {showRankingColumns && (
                      <>
                        <TableCell className="font-mono tabular-nums">{row.highest_rank}</TableCell>
                        <TableCell className="font-mono tabular-nums">{row.lowest_rank}</TableCell>
                        <TableCell className="font-mono tabular-nums">{row.stddev_rank.toFixed(2)}</TableCell>
                        <TableCell className="font-mono tabular-nums">{row.mlb_rank ?? '—'}</TableCell>
                        <TableCell className="font-mono tabular-nums">{row.fangraphs_rank ?? '—'}</TableCell>
                        <TableCell className="font-mono tabular-nums">{row.prospects_live_rank ?? '—'}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${rosterBadgeClass(row.is_rostered)}`}
                      >
                        {row.is_rostered ? 'Yes' : 'No'}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-sm">
                      {hasHitterStats ? (
                        <>
                          {formatNum(stats.atBats, 0)} / {formatNum(stats.homeRuns, 0)} / {formatNum(stats.avg, 3)} / {formatNum(stats.ops, 3)}
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums text-sm">
                      {hasPitcherStats ? (
                        <>
                          {formatNum(stats.inningsPitched, 1)} / {formatNum(stats.era, 2)} / {formatNum(stats.whip, 2)} / {formatNum(stats.strikeoutsPer9, 1)}
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={showRankingColumns ? 17 : 11} className="h-24 text-center text-muted-foreground">No results.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">Showing {sortedData.length} prospects</div>
    </div>
  );
}
