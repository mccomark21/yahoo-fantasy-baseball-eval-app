import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Eye, EyeOff } from 'lucide-react';
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
import { cn } from '@/lib/utils';
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

// DESIGN.md roster badges: Rostered = Navy Mid fill, Available = border stroke
// + muted. Text label (not color alone) carries the state for colorblind users.
function rosterBadgeClass(isRostered: boolean): string {
  return isRostered
    ? 'bg-navy-mid text-white'
    : 'border border-border text-muted-foreground';
}

// One source rank as a stacked label→value cell; mono value keeps the six-source
// row decimal-aligned. Used in the expanded mobile prospect card.
function SourceRank({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-foreground">{value ?? '—'}</span>
    </div>
  );
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

            // Collapsed subline: Org · Pos · Level · Age. ETA moves to expanded.
            const subline = [
              formatOrgAbbreviation(row.organization),
              formatDisplayPosition(row),
              row.level ?? '—',
              row.age != null ? `${formatAge(row.age)}y` : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={rowKey}
                className={cn(
                  'border-b',
                  // Committed zebra striping carries the scan separation; the open card
                  // keeps its own stripe so the dropdown stays consistent with the row
                  // it belongs to (no separate "selected" tint). Muted text darkens on
                  // the tint for AA contrast (it dips below 4.5:1 on surface-header
                  // otherwise) and cascades to every label inside; dark mode keeps it
                  // light. Even rows sit on the page background.
                  index % 2 === 1 &&
                    'bg-surface-header [--muted-foreground:oklch(0.43_0.03_258)] dark:[--muted-foreground:oklch(0.72_0.025_258)]'
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(rowKey)}
                  className="flex w-full min-h-12 items-center gap-2.5 px-3 py-2.5 text-left active:bg-accent/60"
                  aria-expanded={isExpanded}
                  aria-label={`Toggle details for ${row.player_name}`}
                >
                  {/* Momentum column — fixed-width leftmost strip so the bars align
                      row-to-row and the list skims as a single trend column */}
                  <div className="w-24 shrink-0">
                    <MomentumCell momentum={momentum} />
                  </div>

                  {/* Identity */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {row.player_name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{subline}</div>
                  </div>

                  {/* Avg rank (dominant) + roster status */}
                  <div className="flex shrink-0 flex-col items-end leading-none">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Avg
                    </span>
                    <span className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-foreground">
                      {row.average_rank.toFixed(2)}
                    </span>
                    <span
                      className={cn(
                        'mt-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                        rosterBadgeClass(row.is_rostered)
                      )}
                    >
                      {rosterLabel}
                    </span>
                  </div>

                  {/* Zone C — expand affordance */}
                  <ChevronDown
                    className={cn(
                      'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </button>

                {/* Expanded detail — mounted only when open (the prospect list runs
                    long; always-mounted detail for every row is needless DOM). The
                    enter animation is the 150–250ms reveal; reduced-motion skips it. */}
                {isExpanded ? (
                  <div className="overflow-hidden duration-200 animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
                    <div className="space-y-3 px-3 pb-3.5 pt-0.5 text-xs">
                      {/* Source ranks — one decimal-aligned mono row, all six sources */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Source Ranks
                        </div>
                        <div className="grid grid-cols-6 gap-x-1 rounded-md border border-border bg-card px-2 py-2">
                          <SourceRank label="MLB" value={row.mlb_rank} />
                          <SourceRank label="FG" value={row.fangraphs_rank} />
                          <SourceRank label="PLive" value={row.prospects_live_rank} />
                          <SourceRank label="Fntrx" value={row.fantrax_rank} />
                          <SourceRank label="PList" value={row.pitcherlist_rank} />
                          <SourceRank label="TJ" value={row.tjstats_rank} />
                        </div>
                      </div>

                      {/* Consensus spread + momentum */}
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">Hi / Lo</dt>
                          <dd className="font-mono tabular-nums text-foreground">
                            {row.highest_rank} / {row.lowest_rank}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">Std Dev</dt>
                          <dd className="font-mono tabular-nums text-foreground">
                            {row.stddev_rank.toFixed(2)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">ETA</dt>
                          <dd className="font-mono tabular-nums text-foreground">{row.eta ?? '—'}</dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">Trend</dt>
                          <dd className="font-mono" title={trend.tooltip}>
                            {trend.emoji || '—'}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="text-muted-foreground">Team</dt>
                          <dd className="truncate text-foreground">{row.fantasy_team ?? 'Not Found'}</dd>
                        </div>
                      </dl>

                      {/* Windowed minor-league stat block */}
                      <div className="space-y-1 border-t pt-2.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Minor League Stats · {statsWindow}
                        </div>
                        {stats.atBats != null && (
                          <div className="font-mono tabular-nums text-foreground">
                            <span className="text-muted-foreground">AB</span> {formatNum(stats.atBats, 0)}
                            {'  '}
                            <span className="text-muted-foreground">AVG</span> {formatNum(stats.avg, 3)}
                            {'  '}
                            <span className="text-muted-foreground">HR</span> {formatNum(stats.homeRuns, 0)}
                            {'  '}
                            <span className="text-muted-foreground">OPS</span> {formatNum(stats.ops, 3)}
                          </div>
                        )}
                        {stats.era != null && (
                          <div className="font-mono tabular-nums text-foreground">
                            <span className="text-muted-foreground">IP</span> {formatNum(stats.inningsPitched, 1)}
                            {'  '}
                            <span className="text-muted-foreground">ERA</span> {formatNum(stats.era, 2)}
                            {'  '}
                            <span className="text-muted-foreground">WHIP</span> {formatNum(stats.whip, 2)}
                            {'  '}
                            <span className="text-muted-foreground">K/9</span> {formatNum(stats.strikeoutsPer9, 1)}
                          </div>
                        )}
                        {stats.atBats == null && stats.era == null && (
                          <div className="text-muted-foreground">No {statsWindow} stats</div>
                        )}
                      </div>

                      {row.player_summary ? (
                        <p className="border-t pt-2.5 leading-5 text-muted-foreground">
                          {row.player_summary}
                        </p>
                      ) : null}
                    </div>
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
