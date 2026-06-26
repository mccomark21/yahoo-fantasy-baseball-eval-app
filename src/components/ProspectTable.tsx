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
import { EmptyState } from '@/components/EmptyState';
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
import {
  computeProspectMomentum,
  computeProspectTrend,
  getProspectRole,
  parseProspectPositionCodes,
  type ProspectMomentumResult,
} from '@/lib/prospect-trend';

type ProspectSortKey =
  | 'best_rank_bias_score'
  | 'player_name'
  | 'trend_score'
  | 'momentum_score'
  | 'average_rank'
  | 'highest_rank'
  | 'lowest_rank'
  | 'stddev_rank'
  | 'fantasy_team';

interface ProspectTableProps {
  data: ProspectRow[];
  isLoading: boolean;
}

const ORG_ABBREVIATIONS = new Map<string, string>([
  ['ARIZONA DIAMONDBACKS', 'ARI'],
  ['ARI', 'ARI'],
  ['ATLANTA BRAVES', 'ATL'],
  ['ATL', 'ATL'],
  ['BALTIMORE ORIOLES', 'BAL'],
  ['BAL', 'BAL'],
  ['BOSTON RED SOX', 'BOS'],
  ['BOS', 'BOS'],
  ['CHICAGO CUBS', 'CHC'],
  ['CHC', 'CHC'],
  ['CHICAGO WHITE SOX', 'CWS'],
  ['CWS', 'CWS'],
  ['CINCINNATI REDS', 'CIN'],
  ['CIN', 'CIN'],
  ['CLEVELAND GUARDIANS', 'CLE'],
  ['CLE', 'CLE'],
  ['COLORADO ROCKIES', 'COL'],
  ['COL', 'COL'],
  ['DETROIT TIGERS', 'DET'],
  ['DET', 'DET'],
  ['HOUSTON ASTROS', 'HOU'],
  ['HOU', 'HOU'],
  ['KANSAS CITY ROYALS', 'KC'],
  ['KANSAS CITY', 'KC'],
  ['KC', 'KC'],
  ['LOS ANGELES ANGELS', 'LAA'],
  ['LA ANGELS', 'LAA'],
  ['LAA', 'LAA'],
  ['LOS ANGELES DODGERS', 'LAD'],
  ['LA DODGERS', 'LAD'],
  ['LAD', 'LAD'],
  ['MIAMI MARLINS', 'MIA'],
  ['MIA', 'MIA'],
  ['MILWAUKEE BREWERS', 'MIL'],
  ['MIL', 'MIL'],
  ['MINNESOTA TWINS', 'MIN'],
  ['MIN', 'MIN'],
  ['NEW YORK METS', 'NYM'],
  ['NY METS', 'NYM'],
  ['NYM', 'NYM'],
  ['NEW YORK YANKEES', 'NYY'],
  ['NY YANKEES', 'NYY'],
  ['NYY', 'NYY'],
  ['ATHLETICS', 'ATH'],
  ['OAKLAND ATHLETICS', 'ATH'],
  ['A\'S', 'ATH'],
  ['AS', 'ATH'],
  ['ATH', 'ATH'],
  ['PHILADELPHIA PHILLIES', 'PHI'],
  ['PHI', 'PHI'],
  ['PITTSBURGH PIRATES', 'PIT'],
  ['PIT', 'PIT'],
  ['SAN DIEGO PADRES', 'SD'],
  ['SD', 'SD'],
  ['SAN FRANCISCO GIANTS', 'SF'],
  ['SF', 'SF'],
  ['SEATTLE MARINERS', 'SEA'],
  ['SEA', 'SEA'],
  ['ST. LOUIS CARDINALS', 'STL'],
  ['ST LOUIS CARDINALS', 'STL'],
  ['STL', 'STL'],
  ['TAMPA BAY RAYS', 'TB'],
  ['TB', 'TB'],
  ['TEXAS RANGERS', 'TEX'],
  ['TEX', 'TEX'],
  ['TORONTO BLUE JAYS', 'TOR'],
  ['TOR', 'TOR'],
  ['WASHINGTON NATIONALS', 'WSH'],
  ['WSH', 'WSH'],
]);

function formatOrgAbbreviation(organization: string | null): string {
  if (!organization) return '—';

  const normalized = organization.trim().toUpperCase();
  if (!normalized) return '—';

  const mapped = ORG_ABBREVIATIONS.get(normalized);
  if (mapped) return mapped;

  if (/^[A-Z]{2,3}$/.test(normalized)) return normalized;

  const lettersOnly = normalized.replace(/[^A-Z]/g, '');
  if (lettersOnly.length >= 3) return lettersOnly.slice(0, 3);

  return normalized.slice(0, 3);
}

function formatDisplayPosition(row: ProspectRow): string {
  const codes = parseProspectPositionCodes(row.positions);
  if (codes.length === 0) return '—';

  const role = getProspectRole(row);
  if (role === 'pitcher') {
    const hasLhp = codes.includes('LHP');
    if (hasLhp) return 'LHP';
    const hasRhp = codes.includes('RHP');
    if (hasRhp) return 'RHP';
    if (codes.includes('SP')) return 'SP';
    if (codes.includes('P')) return 'P';
    return 'P';
  }

  return codes[0];
}

function getSortValue(row: ProspectRow, key: ProspectSortKey): number | string {
  if (key === 'player_name') return row.player_name;
  if (key === 'fantasy_team') return row.fantasy_team ?? 'zzzz';
  if (key === 'trend_score') return computeProspectTrend(row).sortScore;
  if (key === 'momentum_score') return computeProspectMomentum(row).sortScore;
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

// |Δ| in steps (normalized units) that fills one half of the bar.
const MOMENTUM_BAR_FULL_SCALE = 3;

// Diverging magnitude bar: improving grows right (green), declining grows left
// (red), length scales with magnitude. Direction is carried three ways — side,
// color, and the signed delta — so it stays readable without relying on color.
function MomentumCell({ momentum }: { momentum: ProspectMomentumResult }) {
  if (!momentum.hasData) {
    return (
      <span className="text-muted-foreground" title={momentum.tooltip}>
        —
      </span>
    );
  }

  const norm = momentum.sortScore; // signed Δ / step
  const fillPct = Math.min(Math.abs(norm) / MOMENTUM_BAR_FULL_SCALE, 1) * 50;
  const isUp = norm > 0;
  const isSteady = Math.abs(norm) < 1; // within ±1 step → ➡️ steady

  const fillColor = isSteady
    ? 'bg-muted-foreground/40'
    : isUp
      ? 'bg-green-600 dark:bg-green-500'
      : 'bg-red-600 dark:bg-red-500';

  const deltaColor = isSteady
    ? 'text-muted-foreground'
    : isUp
      ? 'text-green-700 dark:text-green-400'
      : 'text-red-700 dark:text-red-400';

  return (
    <span className="inline-flex items-center gap-2" title={momentum.tooltip}>
      <span className="relative h-2.5 w-12 shrink-0 rounded-sm bg-muted/50" aria-hidden="true">
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        <span
          className={`absolute inset-y-0 ${isUp ? 'left-1/2 rounded-r-sm' : 'right-1/2 rounded-l-sm'} ${fillColor}`}
          style={{ width: `${fillPct}%` }}
        />
      </span>
      <span className={`text-xs tabular-nums ${deltaColor}`}>{momentum.deltaText}</span>
    </span>
  );
}

export function ProspectTable({ data, isLoading }: ProspectTableProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<ProspectSortKey>('average_rank');
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
    setSortDesc(key === 'trend_score' || key === 'momentum_score');
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
            const trend = computeProspectTrend(row);
            const momentum = computeProspectMomentum(row);

            return (
              <div key={rowKey} className="border-b px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleExpand(rowKey)}
                      className="flex w-full items-center gap-2 text-left"
                      aria-expanded={isExpanded}
                      aria-label={`Toggle details for ${row.player_name}`}
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">{row.player_name}</span>
                      <MomentumCell momentum={momentum} />
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatOrgAbbreviation(row.organization)} · {formatDisplayPosition(row)} · Age {formatAge(row.age)} · ETA {row.eta ?? '—'} · {row.level ?? '—'}
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
                    <div title={trend.tooltip}>
                      Trend: <span className="font-mono">{trend.emoji || '—'}</span>
                    </div>
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
          <div className="p-8">
            <EmptyState hint="Try clearing the Team, Level, or Age filters." />
          </div>
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
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('trend_score')}>
                <div className="flex items-center gap-1">Trend {sortIcon('trend_score')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('momentum_score')}>
                <div className="flex items-center gap-1">Mom {sortIcon('momentum_score')}</div>
              </TableHead>
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
                  <TableHead>Fantrax</TableHead>
                  <TableHead>PList</TableHead>
                  <TableHead>TJ</TableHead>
                </>
              )}
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
                const trend = computeProspectTrend(row);
                const momentum = computeProspectMomentum(row);

                return (
                  <TableRow key={row.norm_name}>
                    <TableCell className="font-mono tabular-nums" title={trend.tooltip}>{trend.emoji || '—'}</TableCell>
                    <TableCell>
                      <MomentumCell momentum={momentum} />
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.player_name}
                    </TableCell>
                    <TableCell>{formatOrgAbbreviation(row.organization)}</TableCell>
                    <TableCell>{formatDisplayPosition(row)}</TableCell>
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
                        <TableCell className="font-mono tabular-nums">{row.fantrax_rank ?? '—'}</TableCell>
                        <TableCell className="font-mono tabular-nums">{row.pitcherlist_rank ?? '—'}</TableCell>
                        <TableCell className="font-mono tabular-nums">{row.tjstats_rank ?? '—'}</TableCell>
                      </>
                    )}
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
                <TableCell colSpan={showRankingColumns ? 21 : 12} className="h-24 text-center">
                  <EmptyState hint="Try clearing the Team, Level, or Age filters." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">Showing {sortedData.length} prospects</div>
    </div>
  );
}
