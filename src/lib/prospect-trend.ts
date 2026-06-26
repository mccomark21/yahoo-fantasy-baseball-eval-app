import type { ProspectMinorLeagueStats, ProspectRow } from '@/lib/queries';

// ---------------------------------------------------------------------------
// Prospect trend + momentum logic.
//
// The minor-league feed exposes three *cumulative trailing* windows that nest
// inside one another (L7 ⊂ L14 ⊂ L30). Comparing each cumulative window to a
// fixed threshold makes the three signals correlated: one hot week, contained
// in all three windows, can flash 🔥 across L7/L14/L30 at once (issue #25).
//
// To restore independent signal we de-aggregate the nested windows into three
// *disjoint* slices via volume-weighting, guard each slice with a marginal
// volume floor, and regress thin samples toward a neutral baseline (shrinkage)
// before thresholding. Momentum is a separate read: recent form vs the prior
// baseline.
// ---------------------------------------------------------------------------

export type ProspectRole = 'hitter' | 'pitcher' | 'two_way' | 'unknown';
export type TrendEmoji = '🔥' | '🧊' | '➖';
export type MomentumEmoji = '⬆️' | '➡️' | '⬇️' | '—';

const PITCHER_POSITION_CODES = new Set(['P', 'SP', 'RP']);
const HITTER_POSITION_CODES = new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'OF', 'DH', 'UT']);

// --- Tuning constants -------------------------------------------------------
// First-pass estimates (issue #25 open question). Centralized so validating
// against real prospect examples is a one-line edit.

// Disjoint-slice keys, ordered most-recent first.
type SliceKey = 'recent' | 'mid' | 'old';
const SLICE_ORDER: SliceKey[] = ['recent', 'mid', 'old'];
// Human-facing labels for the time span each slice covers.
const SLICE_LABEL: Record<SliceKey, string> = {
  recent: 'L7',
  mid: '8–14d',
  old: '15–30d',
};

// Recency-weighted trend sort: the recent slice dominates ordering.
const TREND_SORT_WEIGHTS: Record<SliceKey, number> = { recent: 9, mid: 3, old: 1 };

interface MetricConfig {
  fire: number;
  ice: number;
  neutral: number;
  shrinkK: number;
  sliceMinVol: Record<SliceKey, number>;
  momentumStep: number;
  momentumMinVol: number;
}

const HITTER_CONFIG: MetricConfig = {
  fire: 0.9, // OPS
  ice: 0.6,
  neutral: 0.7,
  shrinkK: 25, // AB
  sliceMinVol: { recent: 10, mid: 10, old: 18 }, // marginal AB per slice
  momentumStep: 0.075, // ΔOPS (L30 vs rest of season — smoother than a week, so tighter)
  momentumMinVol: 25, // AB in each of last-30 + rest-of-season
};

const PITCHER_CONFIG: MetricConfig = {
  fire: 85, // composite score
  ice: 55,
  neutral: 67,
  shrinkK: 8, // IP
  sliceMinVol: { recent: 3, mid: 3, old: 5 }, // marginal IP per slice
  momentumStep: 7, // Δscore (L30 vs rest of season — smoother than a week, so tighter)
  momentumMinVol: 10, // IP in each of last-30 + rest-of-season
};

// --- Role classification ----------------------------------------------------

export function parseProspectPositionCodes(positions: string): string[] {
  return positions
    .split(/[,/]/)
    .map((position) => position.trim().toUpperCase())
    .filter(Boolean);
}

export function getProspectRole(row: ProspectRow): ProspectRole {
  const codes = parseProspectPositionCodes(row.positions);
  if (codes.length === 0) return 'unknown';

  const hasPitchingCode = codes.some(
    (code) => PITCHER_POSITION_CODES.has(code) || code === 'RHP' || code === 'LHP' || code.endsWith('P')
  );
  const hasHittingCode = codes.some((code) => HITTER_POSITION_CODES.has(code));

  if (hasPitchingCode && hasHittingCode) return 'two_way';
  if (hasPitchingCode) return 'pitcher';
  if (hasHittingCode) return 'hitter';
  return 'unknown';
}

// --- Metric extraction ------------------------------------------------------

export function calcPitcherCompositeScore(
  era: number | null,
  whip: number | null,
  k9: number | null
): number | null {
  if (era == null && whip == null && k9 == null) return null;
  let score = 0;
  if (era != null && era > 0) score += (2.5 / era) * 40;
  if (whip != null && whip > 0) score += (0.9 / whip) * 35;
  if (k9 != null) score += (k9 / 9.0) * 25;
  return score;
}

// A window or slice: an aggregate metric paired with the volume behind it.
interface MetricSample {
  metric: number | null;
  volume: number | null;
}

function hitterSample(stats: ProspectMinorLeagueStats): MetricSample {
  return { metric: stats.ops, volume: stats.atBats };
}

function pitcherSample(stats: ProspectMinorLeagueStats): MetricSample {
  return {
    metric: calcPitcherCompositeScore(stats.era, stats.whip, stats.strikeoutsPer9),
    volume: stats.inningsPitched,
  };
}

// --- De-aggregation ---------------------------------------------------------

// The marginal slice covered by `outer` but not `inner` (e.g. days 8–14 from
// L14 − L7), recovered by volume-weighting:
//   metric_margin = (m_outer·v_outer − m_inner·v_inner) / (v_outer − v_inner)
// Guards against non-nested feed noise: if the inner window reports as much or
// more volume than the outer one, the slice is meaningless → neutral (vol 0).
function marginalSlice(outer: MetricSample, inner: MetricSample): MetricSample {
  if (outer.volume == null || outer.metric == null) return { metric: null, volume: null };

  const innerVolume = inner.volume ?? 0;
  const marginalVolume = outer.volume - innerVolume;

  if (marginalVolume <= 0) return { metric: null, volume: 0 };

  // No usable inner contribution → the whole outer window is the slice.
  if (innerVolume === 0 || inner.metric == null) {
    return { metric: outer.metric, volume: outer.volume };
  }

  const marginalMetric =
    (outer.metric * outer.volume - inner.metric * innerVolume) / marginalVolume;
  return { metric: marginalMetric, volume: marginalVolume };
}

function disjointSlices(l7: MetricSample, l14: MetricSample, l30: MetricSample): Record<SliceKey, MetricSample> {
  return {
    recent: l7, // L7 is already the most-recent slice
    mid: marginalSlice(l14, l7), // days 8–14
    old: marginalSlice(l30, l14), // days 15–30
  };
}

// --- Shrinkage + verdict ----------------------------------------------------

// Regress a slice metric toward the neutral baseline by vol / (vol + K) so a
// thin hot/cold sample can't reach the fire/ice line on volume alone.
function shrink(metric: number, volume: number, neutral: number, shrinkK: number): number {
  return neutral + (metric - neutral) * (volume / (volume + shrinkK));
}

function sliceVerdict(slice: MetricSample, key: SliceKey, cfg: MetricConfig): TrendEmoji {
  if (slice.metric == null) return '➖';
  const volume = slice.volume ?? 0;
  if (volume < cfg.sliceMinVol[key]) return '➖';

  const adjusted = shrink(slice.metric, volume, cfg.neutral, cfg.shrinkK);
  if (adjusted >= cfg.fire) return '🔥';
  if (adjusted <= cfg.ice) return '🧊';
  return '➖';
}

function trendSortValue(emoji: TrendEmoji): number {
  if (emoji === '🔥') return 1;
  if (emoji === '🧊') return -1;
  return 0;
}

// --- Trend (existing column, reworked) --------------------------------------

export interface ProspectTrendResult {
  /** Three space-separated emojis, recent → old. */
  emoji: string;
  /** Recency-weighted score for sorting (higher = hotter recent form). */
  sortScore: number;
  tooltip: string;
}

interface RoleSlices {
  role: 'hitter' | 'pitcher';
  cfg: MetricConfig;
  slices: Record<SliceKey, MetricSample>;
  unit: 'ops' | 'score';
}

function buildRoleSlices(row: ProspectRow, role: 'hitter' | 'pitcher'): RoleSlices {
  const sample = role === 'pitcher' ? pitcherSample : hitterSample;
  const l7 = sample(row.minor_league_stats.L7);
  const l14 = sample(row.minor_league_stats.L14);
  const l30 = sample(row.minor_league_stats.L30);
  return {
    role,
    cfg: role === 'pitcher' ? PITCHER_CONFIG : HITTER_CONFIG,
    slices: disjointSlices(l7, l14, l30),
    unit: role === 'pitcher' ? 'score' : 'ops',
  };
}

function rolesForTrend(row: ProspectRow): RoleSlices[] {
  const role = getProspectRole(row);
  if (role === 'pitcher') return [buildRoleSlices(row, 'pitcher')];
  if (role === 'two_way') return [buildRoleSlices(row, 'hitter'), buildRoleSlices(row, 'pitcher')];
  return [buildRoleSlices(row, 'hitter')]; // hitter + unknown
}

function combineVerdicts(verdicts: TrendEmoji[]): TrendEmoji {
  // Fire takes precedence, then ice, then neutral.
  if (verdicts.includes('🔥')) return '🔥';
  if (verdicts.includes('🧊')) return '🧊';
  return '➖';
}

function formatSampleUnits(slice: MetricSample, unit: 'ops' | 'score'): string {
  const vol = slice.volume != null ? slice.volume.toFixed(unit === 'score' ? 1 : 0) : '—';
  const metric =
    slice.metric != null ? (unit === 'score' ? slice.metric.toFixed(1) : slice.metric.toFixed(3)) : '—';
  const volLabel = unit === 'score' ? 'IP' : 'AB';
  const metricLabel = unit === 'score' ? 'score' : 'OPS';
  return `${volLabel} ${vol}, ${metricLabel} ${metric}`;
}

export function computeProspectTrend(row: ProspectRow): ProspectTrendResult {
  const roles = rolesForTrend(row);
  const role = getProspectRole(row);

  const emojis = SLICE_ORDER.map((key) =>
    combineVerdicts(roles.map((r) => sliceVerdict(r.slices[key], key, r.cfg)))
  );

  const sortScore = SLICE_ORDER.reduce(
    (acc, key, index) => acc + trendSortValue(emojis[index]) * TREND_SORT_WEIGHTS[key],
    0
  );

  const tooltipLines = SLICE_ORDER.map((key, index) => {
    const units = roles.map((r) => formatSampleUnits(r.slices[key], r.unit)).join(' · ');
    return `${SLICE_LABEL[key]}: ${emojis[index]}  ${units}`;
  });

  const tooltip =
    `Performance trend (${role.replace('_', '-')}) — disjoint windows L7 / days 8–14 / days 15–30\n` +
    tooltipLines.join('\n');

  return { emoji: emojis.join(' '), sortScore, tooltip };
}

// --- Momentum (new column) --------------------------------------------------

export interface ProspectMomentumResult {
  emoji: MomentumEmoji;
  /** Scale-normalized delta (Δ / step) so hitters and pitchers sort together. */
  sortScore: number;
  /** Signed delta in native units (e.g. "+0.150" OPS, "−4.2" score); '' when no data. */
  deltaText: string;
  tooltip: string;
  hasData: boolean;
}

const MOMENTUM_NO_DATA: ProspectMomentumResult = {
  emoji: '—',
  sortScore: Number.NEGATIVE_INFINITY,
  deltaText: '',
  tooltip: 'Momentum: insufficient recent or baseline volume',
  hasData: false,
};

interface MomentumRead {
  normalized: number;
  delta: number;
  recent: number;
  baseline: number;
  unit: 'ops' | 'score';
  role: 'hitter' | 'pitcher';
}

function metricMomentum(row: ProspectRow, role: 'hitter' | 'pitcher'): MomentumRead | null {
  const sample = role === 'pitcher' ? pitcherSample : hitterSample;
  const cfg = role === 'pitcher' ? PITCHER_CONFIG : HITTER_CONFIG;

  const recent = sample(row.minor_league_stats.L30);
  // Baseline = rest of the season excluding the last 30 days (STD − L30),
  // volume-weighted.
  const baseline = marginalSlice(sample(row.minor_league_stats.STD), recent);

  if (recent.metric == null || baseline.metric == null) return null;
  if ((recent.volume ?? 0) < cfg.momentumMinVol) return null;
  if ((baseline.volume ?? 0) < cfg.momentumMinVol) return null;

  const delta = recent.metric - baseline.metric;
  return {
    normalized: delta / cfg.momentumStep,
    delta,
    recent: recent.metric,
    baseline: baseline.metric,
    unit: role === 'pitcher' ? 'score' : 'ops',
    role,
  };
}

function rolesForMomentum(row: ProspectRow): Array<'hitter' | 'pitcher'> {
  const role = getProspectRole(row);
  if (role === 'pitcher') return ['pitcher'];
  if (role === 'two_way') return ['hitter', 'pitcher'];
  return ['hitter'];
}

export function computeProspectMomentum(row: ProspectRow): ProspectMomentumResult {
  const reads = rolesForMomentum(row)
    .map((role) => metricMomentum(row, role))
    .filter((read): read is MomentumRead => read != null);

  if (reads.length === 0) return MOMENTUM_NO_DATA;

  // For two-way prospects, surface the stronger signal.
  const read = reads.reduce((best, candidate) =>
    Math.abs(candidate.normalized) > Math.abs(best.normalized) ? candidate : best
  );

  const cfg = read.role === 'pitcher' ? PITCHER_CONFIG : HITTER_CONFIG;
  let emoji: MomentumEmoji = '➡️';
  if (read.delta >= cfg.momentumStep) emoji = '⬆️';
  else if (read.delta <= -cfg.momentumStep) emoji = '⬇️';

  const fmt = (value: number) => (read.unit === 'score' ? value.toFixed(1) : value.toFixed(3));
  const deltaSign = read.delta >= 0 ? '+' : '−';
  const deltaText = `${deltaSign}${fmt(Math.abs(read.delta))}`;
  const deltaLabel = `${read.unit === 'score' ? 'Δscore' : 'ΔOPS'} ${deltaText}`;

  const tooltip =
    `Momentum (${read.role}) — last 30 days vs rest of season\n` +
    `last 30d ${fmt(read.recent)} vs season excl. last 30d ${fmt(read.baseline)}  →  ${deltaLabel}`;

  return { emoji, sortScore: read.normalized, deltaText, tooltip, hasData: true };
}
