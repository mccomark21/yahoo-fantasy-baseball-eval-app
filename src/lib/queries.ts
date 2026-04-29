import { getDB } from './duckdb';
import type { PitcherListRankRow, ReliefListRankRow, TrendDirection } from './pitcherlist-client';
import type { ProspectSourceRow } from './prospects-client';

export type TimeWindow = 'STD' | '7D' | '14D' | '30D';
export type ProspectStatsWindow = 'STD' | 'L7' | 'L14' | 'L30';

export interface ProspectMinorLeagueStats {
  atBats: number | null;
  avg: number | null;
  homeRuns: number | null;
  rbi: number | null;
  runs: number | null;
  stolenBases: number | null;
  strikeOuts: number | null;
  ops: number | null;
  obp: number | null;
  slg: number | null;
  era: number | null;
  whip: number | null;
  strikeoutsPer9: number | null;
  walksPer9: number | null;
  wins: number | null;
  saves: number | null;
  holds: number | null;
  inningsPitched: number | null;
}

export interface PlayerRow {
  player_name: string;
  norm_name: string;
  mlb_team: string;
  position: string;
  league_name: string;
  fantasy_team: string;
  xwoba: number | null;
  pull_air_pct: number | null;
  bb_k: number | null;
  sb: number | null;
  pa: number | null;
  bbe: number | null;
  z_xwoba: number | null;
  z_pull_air_pct: number | null;
  z_bb_k: number | null;
  z_sb: number | null;
  composite_score: number | null;
  trend_xwoba: number[];
  trend_pull_air_pct: number[];
  trend_bb_k: number[];
  trend_sb: number[];
}

export interface PitcherTrendRow {
  latest_rank: number;
  player_name: string;
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: TrendDirection;
  notes: string | null;
  fantasy_team: string | null;
  league_name: string | null;
}

export interface ReliefTrendRow {
  latest_rank: number;
  player_name: string;
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: TrendDirection;
  notes: string | null;
  fantasy_team: string | null;
  league_name: string | null;
}

export interface ProspectRow {
  player_name: string;
  norm_name: string;
  organization: string | null;
  positions: string;
  is_rostered: boolean;
  fantasy_team: string | null;
  league_name: string | null;
  mlb_rank: number | null;
  fangraphs_rank: number | null;
  prospects_live_rank: number | null;
  average_rank: number;
  highest_rank: number;
  lowest_rank: number;
  stddev_rank: number;
  best_rank_bias_score: number;
  age: number | null;
  eta: string | null;
  level: string | null;
  height: string | null;
  weight: string | null;
  bats: string | null;
  throws: string | null;
  fv: string | null;
  ofp: string | null;
  player_summary: string | null;
  stats_summary: string | null;
  scouting_report: string | null;
  notes: string | null;
  minor_league_stats: Record<ProspectStatsWindow, ProspectMinorLeagueStats>;
}

const VOLUME_THRESHOLD_PCT = 0.5;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function filterByVolume(rows: PlayerRow[]): PlayerRow[] {
  const paValues = rows.map((r) => r.pa).filter((v): v is number => v != null && v > 0);
  const bbeValues = rows.map((r) => r.bbe).filter((v): v is number => v != null && v > 0);

  const minPA = median(paValues) * VOLUME_THRESHOLD_PCT;
  const minBBE = median(bbeValues) * VOLUME_THRESHOLD_PCT;

  return rows.filter(
    (r) =>
      // Preserve players with no game-log match (NULL stats)
      (r.pa == null && r.bbe == null) ||
      ((r.pa ?? 0) >= minPA && (r.bbe ?? 0) >= minBBE)
  );
}

export interface FilterOptions {
  leagues: string[];
  fantasyTeams: string[];
  positions: string[];
}

export interface AccuracyCohortRow {
  player_name: string;
  mlb_team: string;
  norm_name: string;
  pa: number;
  bbe: number;
  xwoba: number;
  xwoba_unrounded: number;
  xwoba_num: number;
  xwoba_denom: number;
  game_date_min: string;
  game_date_max: string;
  is_benchmark: boolean;
}

export interface AccuracyCohortResult {
  bbe_p75: number;
  eligible_count: number;
  rows: AccuracyCohortRow[];
}

export interface AccuracyCohortEligibleRow {
  player_name: string;
  mlb_team: string;
  norm_name: string;
  pa: number;
  bbe: number;
  xwoba: number;
  xwoba_unrounded: number;
  xwoba_num: number;
  xwoba_denom: number;
  game_date_min: string;
  game_date_max: string;
}

export interface BuildAccuracyCohortOptions {
  selectedLeague: string | null;
  benchmarkPlayers: string[];
  randomSampleSize: number;
  randomSeed: number;
}

export function assembleAccuracyCohort(
  eligibleRows: AccuracyCohortEligibleRow[],
  bbeP75: number,
  benchmarkPlayers: string[],
  randomSampleSize: number,
  randomSeed: number
): AccuracyCohortResult {
  if (eligibleRows.length === 0) {
    throw new Error('No top-quartile BBE hitters were found for the current filters.');
  }

  const byNormName = new Map(eligibleRows.map((row) => [row.norm_name, row]));
  const benchmarkNorms = Array.from(
    new Set(benchmarkPlayers.map((name) => normalizePlayerName(name)))
  );

  const missingBenchmarks = benchmarkNorms.filter((normName) => !byNormName.has(normName));
  if (missingBenchmarks.length > 0) {
    const missingDisplay = benchmarkPlayers.filter((name) =>
      missingBenchmarks.includes(normalizePlayerName(name))
    );
    throw new Error(
      `Benchmark player(s) not in top 25% BBE eligibility pool: ${missingDisplay.join(', ')}`
    );
  }

  const benchmarkRows: AccuracyCohortRow[] = benchmarkNorms
    .map((normName) => byNormName.get(normName))
    .filter((row): row is NonNullable<typeof row> => row != null)
    .map((row) => ({
      ...row,
      is_benchmark: true,
    }));

  const benchmarkSet = new Set(benchmarkNorms);
  const sampleCandidates = eligibleRows.filter((row) => !benchmarkSet.has(row.norm_name));
  const sampleSize = Math.max(0, Math.min(randomSampleSize, sampleCandidates.length));

  const sampledRows = sampleCandidates
    .map((row) => ({ row, score: seededScore(row.norm_name, randomSeed) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, sampleSize)
    .map(({ row }) => ({
      ...row,
      is_benchmark: false,
    }));

  const rows = [...benchmarkRows, ...sampledRows].sort((a, b) => {
    if (a.is_benchmark !== b.is_benchmark) return a.is_benchmark ? -1 : 1;
    return a.player_name.localeCompare(b.player_name);
  });

  return {
    bbe_p75: bbeP75,
    eligible_count: eligibleRows.length,
    rows,
  };
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const db = await getDB();
  const conn = await db.connect();
  try {
    const [leagues, teams, positions] = await Promise.all([
      conn.query(
        `SELECT DISTINCT league_name FROM yahoo ORDER BY league_name`
      ),
      conn.query(
        `SELECT DISTINCT fantasy_team FROM yahoo ORDER BY fantasy_team`
      ),
      conn.query(
        `SELECT DISTINCT primary_position FROM yahoo WHERE primary_position IS NOT NULL ORDER BY primary_position`
      ),
    ]);

    return {
      leagues: leagues.toArray().map((r) => r.league_name as string),
      fantasyTeams: teams.toArray().map((r) => r.fantasy_team as string),
      positions: positions.toArray().map((r) => r.primary_position as string),
    };
  } finally {
    await conn.close();
  }
}

export async function getFantasyTeamsForLeague(league: string): Promise<string[]> {
  const db = await getDB();
  const conn = await db.connect();
  try {
    const result = await conn.query(
      `SELECT DISTINCT fantasy_team FROM yahoo WHERE league_name = '${escapeSQL(league)}' ORDER BY fantasy_team`
    );
    return result.toArray().map((r) => r.fantasy_team as string);
  } finally {
    await conn.close();
  }
}

function getDateFilter(timeWindow: TimeWindow): string {
  switch (timeWindow) {
    case '7D':
      return `AND g.game_date >= CURRENT_DATE - INTERVAL 7 DAY`;
    case '14D':
      return `AND g.game_date >= CURRENT_DATE - INTERVAL 14 DAY`;
    case '30D':
      return `AND g.game_date >= CURRENT_DATE - INTERVAL 30 DAY`;
    case 'STD':
    default:
      return '';
  }
}

export async function queryPlayers(
  timeWindow: TimeWindow,
  selectedLeague: string | null,
  selectedTeams: string[],
  selectedPositions: string[],
  playerNameSearch?: string
): Promise<PlayerRow[]> {
  const db = await getDB();
  const conn = await db.connect();
  try {
    const dateFilter = getDateFilter(timeWindow);

    const whereClauses: string[] = [
      `y.primary_position NOT IN ('SP', 'RP')`,
    ];
    if (selectedLeague) {
      whereClauses.push(`y.league_name = '${escapeSQL(selectedLeague)}'`);
    }
    if (selectedTeams.length > 0) {
      const teamList = selectedTeams.map((t) => `'${escapeSQL(t)}'`).join(', ');
      whereClauses.push(`y.fantasy_team IN (${teamList})`);
    }
    if (selectedPositions.length > 0) {
      const posList = selectedPositions
        .map((p) => `'${escapeSQL(p)}'`)
        .join(', ');
      whereClauses.push(`y.primary_position IN (${posList})`);
    }
    const normalizedSearch = playerNameSearch ? normalizePlayerName(playerNameSearch) : '';
    if (normalizedSearch) {
      whereClauses.push(`y.norm_name LIKE '%${escapeSQL(normalizedSearch)}%'`);
    }

    const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

    const sql = `
      SELECT
        y.player_name,
        y.norm_name,
        y.mlb_team,
        y.eligible_positions AS position,
        y.league_name,
        y.fantasy_team,
        CASE WHEN SUM(g.xwoba_denom) > 0
          THEN ROUND(SUM(g.xwoba_num) / SUM(g.xwoba_denom), 3)
          ELSE NULL END AS xwoba,
        CASE WHEN SUM(g.bbe) > 0
          THEN ROUND(SUM(g.pull_air_events)::DOUBLE / SUM(g.bbe) * 100, 1)
          ELSE NULL END AS pull_air_pct,
        CASE WHEN SUM(g.k) > 0
          THEN ROUND(SUM(g.bb)::DOUBLE / SUM(g.k), 2)
          ELSE NULL END AS bb_k,
        SUM(g.sb) AS sb,
        SUM(g.pa) AS pa,
        SUM(g.bbe) AS bbe
      FROM yahoo y
      LEFT JOIN game_logs g
        ON y.norm_name = g.norm_name
        ${dateFilter}
      ${whereSQL}
      GROUP BY
        y.player_name,
        y.norm_name,
        y.mlb_team,
        y.eligible_positions,
        y.league_name,
        y.fantasy_team
      ORDER BY xwoba DESC NULLS LAST
    `;

    const result = await conn.query(sql);
    const rows = result.toArray().map((row) => ({
      player_name: row.player_name as string,
      norm_name: row.norm_name as string,
      mlb_team: row.mlb_team as string,
      position: row.position as string,
      league_name: row.league_name as string,
      fantasy_team: row.fantasy_team as string,
      xwoba: toNum(row.xwoba),
      pull_air_pct: toNum(row.pull_air_pct),
      bb_k: toNum(row.bb_k),
      sb: toNum(row.sb),
      pa: toNum(row.pa),
      bbe: toNum(row.bbe),
      z_xwoba: null,
      z_pull_air_pct: null,
      z_bb_k: null,
      z_sb: null,
      composite_score: null,
      trend_xwoba: [],
      trend_pull_air_pct: [],
      trend_bb_k: [],
      trend_sb: [],
    }));

    if (timeWindow !== 'STD' || rows.length === 0) {
      return rows;
    }

    const trendByNormName = await getSeasonToDateMetricTrends(
      conn,
      rows.map((r) => r.norm_name)
    );

    return rows.map((row) => {
      const trend = trendByNormName.get(row.norm_name);
      if (!trend) return row;
      return {
        ...row,
        trend_xwoba: trend.xwoba,
        trend_pull_air_pct: trend.pull_air_pct,
        trend_bb_k: trend.bb_k,
        trend_sb: trend.sb,
      };
    });
  } finally {
    await conn.close();
  }
}

async function getSeasonToDateMetricTrends(
  conn: Awaited<ReturnType<Awaited<ReturnType<typeof getDB>>['connect']>>,
  normNames: string[]
): Promise<Map<string, { xwoba: number[]; pull_air_pct: number[]; bb_k: number[]; sb: number[] }>> {
  const uniqueNormNames = Array.from(new Set(normNames));
  if (uniqueNormNames.length === 0) {
    return new Map();
  }

  const normNameList = uniqueNormNames
    .map((name) => `'${escapeSQL(name)}'`)
    .join(', ');

  const sql = `
    WITH per_day AS (
      SELECT
        g.norm_name,
        g.game_date,
        CASE WHEN SUM(g.xwoba_denom) > 0
          THEN SUM(g.xwoba_num)::DOUBLE / SUM(g.xwoba_denom)
          ELSE NULL END AS xwoba,
        CASE WHEN SUM(g.bbe) > 0
          THEN SUM(g.pull_air_events)::DOUBLE / SUM(g.bbe) * 100
          ELSE NULL END AS pull_air_pct,
        CASE WHEN SUM(g.k) > 0
          THEN SUM(g.bb)::DOUBLE / SUM(g.k)
          ELSE NULL END AS bb_k,
        SUM(g.sb)::DOUBLE AS sb,
        ROW_NUMBER() OVER (
          PARTITION BY g.norm_name
          ORDER BY g.game_date DESC
        ) AS row_num
      FROM game_logs g
      WHERE g.norm_name IN (${normNameList})
      GROUP BY g.norm_name, g.game_date
    ),
    last_games AS (
      SELECT *
      FROM per_day
      WHERE row_num <= 12
    )
    SELECT
      norm_name,
      game_date,
      xwoba,
      pull_air_pct,
      bb_k,
      sb
    FROM last_games
    ORDER BY norm_name, game_date
  `;

  const result = await conn.query(sql);
  const byNormName = new Map<string, { xwoba: number[]; pull_air_pct: number[]; bb_k: number[]; sb: number[] }>();

  for (const row of result.toArray()) {
    const normName = row.norm_name as string | null;
    if (!normName) continue;

    if (!byNormName.has(normName)) {
      byNormName.set(normName, {
        xwoba: [],
        pull_air_pct: [],
        bb_k: [],
        sb: [],
      });
    }

    const trend = byNormName.get(normName);
    if (!trend) continue;

    const xwoba = toNum(row.xwoba);
    const pullAirPct = toNum(row.pull_air_pct);
    const bbK = toNum(row.bb_k);
    const sb = toNum(row.sb);

    if (xwoba != null) trend.xwoba.push(xwoba);
    if (pullAirPct != null) trend.pull_air_pct.push(pullAirPct);
    if (bbK != null) trend.bb_k.push(bbK);
    if (sb != null) trend.sb.push(sb);
  }

  return byNormName;
}

export async function buildAccuracyCohort(
  options: BuildAccuracyCohortOptions
): Promise<AccuracyCohortResult> {
  const db = await getDB();
  const conn = await db.connect();

  try {
    const leagueFilter = options.selectedLeague
      ? `AND y.league_name = '${escapeSQL(options.selectedLeague)}'`
      : '';

    const eligibleSql = `
      WITH hitter_totals AS (
        SELECT
          y.player_name,
          y.mlb_team,
          y.norm_name,
          SUM(g.pa) AS pa,
          SUM(g.bbe) AS bbe,
          SUM(g.xwoba_num) AS xwoba_num,
          SUM(g.xwoba_denom) AS xwoba_denom,
          MIN(g.game_date) AS game_date_min,
          MAX(g.game_date) AS game_date_max
        FROM yahoo y
        INNER JOIN game_logs g
          ON y.norm_name = g.norm_name
        WHERE y.primary_position NOT IN ('SP', 'RP')
          ${leagueFilter}
        GROUP BY y.player_name, y.mlb_team, y.norm_name
      ),
      threshold AS (
        SELECT quantile_cont(bbe, 0.75) AS bbe_p75
        FROM hitter_totals
      )
      SELECT
        h.player_name,
        h.mlb_team,
        h.norm_name,
        h.pa,
        h.bbe,
        h.xwoba_num,
        h.xwoba_denom,
        CASE WHEN h.xwoba_denom > 0 THEN h.xwoba_num / h.xwoba_denom ELSE NULL END AS xwoba_unrounded,
        CASE WHEN h.xwoba_denom > 0 THEN ROUND(h.xwoba_num / h.xwoba_denom, 3) ELSE NULL END AS xwoba,
        h.game_date_min,
        h.game_date_max,
        t.bbe_p75
      FROM hitter_totals h
      CROSS JOIN threshold t
      WHERE h.bbe >= t.bbe_p75
        AND h.xwoba_denom > 0
    `;

    const eligibleResult = await conn.query(eligibleSql);
    const rawEligibleRows = eligibleResult.toArray();
    const sqlBbeP75 = Number((rawEligibleRows[0] as { bbe_p75: number } | undefined)?.bbe_p75 ?? 0);
    const eligibleRows = rawEligibleRows.map((row) => ({
      player_name: row.player_name as string,
      mlb_team: row.mlb_team as string,
      norm_name: row.norm_name as string,
      pa: Number(row.pa),
      bbe: Number(row.bbe),
      xwoba_num: Number(row.xwoba_num),
      xwoba_denom: Number(row.xwoba_denom),
      xwoba_unrounded: Number(row.xwoba_unrounded),
      xwoba: Number(row.xwoba),
      game_date_min: String(row.game_date_min),
      game_date_max: String(row.game_date_max),
    }));

    const cohort = assembleAccuracyCohort(
      eligibleRows,
      sqlBbeP75,
      options.benchmarkPlayers,
      options.randomSampleSize,
      options.randomSeed
    );

    return cohort;
  } finally {
    await conn.close();
  }
}

const Z_SCORE_WEIGHTS = {
  xwoba: 0.4,
  pull_air_pct: 0.2,
  bb_k: 0.3,
  sb: 0.1,
} as const;

const Z_CLAMP = 2.5;

export function computeZScores(rows: PlayerRow[]): PlayerRow[] {
  const metrics = ['xwoba', 'pull_air_pct', 'bb_k', 'sb'] as const;
  type MetricKey = (typeof metrics)[number];

  const stats = {} as Record<MetricKey, { mean: number; std: number }>;

  for (const key of metrics) {
    const vals = rows.map((r) => r[key]).filter((v): v is number => v != null);
    if (vals.length < 2) {
      stats[key] = { mean: 0, std: 0 };
      continue;
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    stats[key] = { mean, std: Math.sqrt(variance) };
  }

  return rows.map((row) => {
    const zScores = {} as Record<`z_${MetricKey}`, number | null>;
    let availableCount = 0;

    for (const key of metrics) {
      const val = row[key];
      const { mean, std } = stats[key];
      if (val == null || std === 0) {
        zScores[`z_${key}`] = null;
      } else {
        const z = (val - mean) / std;
        zScores[`z_${key}`] = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, z));
        availableCount++;
      }
    }

    let composite: number | null = null;
    if (availableCount > 0) {
      let weightedSum = 0;
      let weightSum = 0;
      for (const key of metrics) {
        const z = zScores[`z_${key}`];
        if (z != null) {
          weightedSum += Z_SCORE_WEIGHTS[key] * z;
          weightSum += Z_SCORE_WEIGHTS[key];
        }
      }
      composite = Math.round((weightedSum / weightSum) * 100) / 100;
    }

    return { ...row, ...zScores, composite_score: composite };
  });
}

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function seededScore(value: string, seed: number): number {
  let h = (seed >>> 0) ^ 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function toRounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalizeDisplayText(value: string | null | undefined): string | null {
  if (value == null) return null;
  let normalizedInput = value;
  if (/[ÃÂ]/.test(normalizedInput)) {
    try {
      normalizedInput = decodeURIComponent(escape(normalizedInput));
    } catch {
      normalizedInput = value;
    }
  }
  const normalized = normalizedInput
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEta(value: string | null): string | null {
  const normalized = normalizeDisplayText(value);
  if (!normalized) return null;
  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return yearMatch[0];
  if (/^mlb$/i.test(normalized)) return 'MLB';
  return normalized;
}

function normalizeLevel(value: string | null): string | null {
  const normalized = normalizeDisplayText(value);
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  if (upper === 'AAA' || upper === 'AA' || upper === 'A+' || upper === 'A' || upper === 'MLB' || upper === 'ROK') {
    return upper;
  }
  if (/TRIPLE\s*-?\s*A/i.test(normalized)) return 'AAA';
  if (/DOUBLE\s*-?\s*A/i.test(normalized)) return 'AA';
  if (/HIGH\s*-?\s*A/i.test(normalized)) return 'A+';
  if (/LOW\s*-?\s*A|SINGLE\s*-?\s*A/i.test(normalized)) return 'A';
  return normalized;
}

function normalizeBatThrow(value: string | null): string | null {
  const normalized = normalizeDisplayText(value)?.toUpperCase() ?? null;
  if (!normalized) return null;
  if (normalized === 'RIGHT' || normalized === 'R') return 'R';
  if (normalized === 'LEFT' || normalized === 'L') return 'L';
  if (normalized === 'SWITCH' || normalized === 'S') return 'S';
  return null;
}

function normalizeHeight(value: string | null): string | null {
  const normalized = normalizeDisplayText(value);
  if (!normalized) return null;
  const feetInches = normalized.match(/(\d+)\s*['’]\s*(\d{1,2})\s*(?:\"|”|in)?/);
  if (feetInches) return `${feetInches[1]}'${feetInches[2]}"`;
  return normalized;
}

function normalizeWeight(value: string | null): string | null {
  const normalized = normalizeDisplayText(value);
  if (!normalized) return null;
  const numberMatch = normalized.match(/\d{2,3}/);
  if (!numberMatch) return normalized;
  return `${numberMatch[0]} lb`;
}

function normalizeAge(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function normalizeScoutingSnippet(value: string | null, maxLen: number): string | null {
  const normalized = normalizeDisplayText(value);
  if (!normalized) return null;
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen).trimEnd()}...`;
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+|\s+[-|]\s+/)
    .map((part) => normalizeDisplayText(part) ?? '')
    .map((part) => part.replace(/^summary\s*:\s*/i, '').trim())
    .filter((part) => part.length >= 25);
}

function canonicalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNearDuplicate(candidate: string, existing: string): boolean {
  const a = canonicalizeText(candidate);
  const b = canonicalizeText(existing);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const aTokens = new Set(a.split(' '));
  const bTokens = new Set(b.split(' '));
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  const denom = Math.max(aTokens.size, bTokens.size);
  return denom > 0 && overlap / denom >= 0.75;
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function truncateSummary(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  const truncated = value.slice(0, maxLen).trimEnd();
  return `${truncated.replace(/[,.!?;:]+$/g, '')}...`;
}

function buildProspectSummary(args: {
  statsSummary: string | null;
  notes: string | null;
  scoutingReport: string | null;
  fv: string | null;
  ofp: string | null;
  eta: string | null;
  level: string | null;
}): string | null {
  const headlineBits: string[] = [];
  if (args.fv) headlineBits.push(`FV ${args.fv}`);
  if (args.ofp) headlineBits.push(`OFP ${args.ofp}`);
  if (args.eta) headlineBits.push(`ETA ${args.eta}`);
  if (args.level) headlineBits.push(`Level ${args.level}`);
  const headline = headlineBits.length > 0 ? `${headlineBits.join(' | ')}.` : null;

  const candidates = [args.notes, args.statsSummary, args.scoutingReport]
    .filter((text): text is string => !!text)
    .flatMap((text) => splitSentences(text));

  const selected: string[] = [];
  for (const sentence of candidates) {
    if (selected.some((existing) => isNearDuplicate(sentence, existing))) {
      continue;
    }
    selected.push(sentence);
    if (selected.length >= 2) break;
  }

  const body = selected.map(ensureSentence).join(' ');
  const combined = normalizeDisplayText([headline, body].filter(Boolean).join(' '));
  if (!combined) return null;
  return truncateSummary(combined, 320);
}

export function normalizePlayerName(name: string): string {
  let normalizedInput = name;
  if (/[ÃÂ]/.test(normalizedInput)) {
    try {
      normalizedInput = decodeURIComponent(escape(normalizedInput));
    } catch {
      normalizedInput = name;
    }
  }

  return normalizedInput
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '')
    .replace(/[^a-zA-Z ]/g, '')
    .toLowerCase()
    .trim();
}

interface ProspectOwnership {
  fantasy_team: string | null;
  league_name: string | null;
}

interface BuildProspectRowsOptions {
  selectedFantasyTeams: string[];
  selectedPositions: string[];
  playerNameSearch?: string;
  missingRankDefault?: number;
  maxAge?: number | null;
  rosterFilter?: 'all' | 'rostered' | 'available';
  minorLeagueStatsByNormName?: Map<string, Record<ProspectStatsWindow, ProspectMinorLeagueStats>>;
}

export function buildProspectRows(
  sourceRows: ProspectSourceRow[],
  ownerByNormName: Map<string, ProspectOwnership>,
  options: BuildProspectRowsOptions
): ProspectRow[] {
  const {
    selectedFantasyTeams,
    selectedPositions,
    playerNameSearch,
    missingRankDefault = 125,
    maxAge = null,
    rosterFilter = 'all',
    minorLeagueStatsByNormName = new Map(),
  } = options;

  const grouped = new Map<string, ProspectSourceRow[]>();
  for (const sourceRow of sourceRows) {
    const normName = normalizePlayerName(sourceRow.player_name);
    if (!normName) continue;

    const existing = grouped.get(normName) ?? [];
    existing.push(sourceRow);
    grouped.set(normName, existing);
  }

  const rows: ProspectRow[] = [];

  for (const [normName, group] of grouped.entries()) {
    const rankBySource = new Map<string, number>();
    for (const sourceRow of group) {
      const existingRank = rankBySource.get(sourceRow.source);
      if (existingRank == null || sourceRow.rank < existingRank) {
        rankBySource.set(sourceRow.source, sourceRow.rank);
      }
    }

    const mlbRank = rankBySource.get('mlb') ?? null;
    const fangraphsRank = rankBySource.get('fangraphs') ?? null;
    const prospectsLiveRank = rankBySource.get('prospects_live') ?? null;

    const effectiveRanks = [
      mlbRank ?? missingRankDefault,
      fangraphsRank ?? missingRankDefault,
      prospectsLiveRank ?? missingRankDefault,
    ];

    const avg = effectiveRanks.reduce((sum, rank) => sum + rank, 0) / effectiveRanks.length;
    const highest = Math.min(...effectiveRanks);
    const lowest = Math.max(...effectiveRanks);
    const rankStdDev = stddev(effectiveRanks);

    const bestRankBiasScore =
      0.6 * highest +
      0.3 * avg +
      0.1 * lowest +
      0.2 * rankStdDev;

    const preferredRows = [...group].sort((a, b) => {
      const sourceWeight = (source: string): number => {
        if (source === 'fangraphs') return 3;
        if (source === 'mlb') return 2;
        if (source === 'prospects_live') return 1;
        return 0;
      };

      const weightDiff = sourceWeight(b.source) - sourceWeight(a.source);
      if (weightDiff !== 0) return weightDiff;
      return a.rank - b.rank;
    });

    const mergedPositions = Array.from(
      new Set(
        group
          .flatMap((row) => row.positions)
          .map((position) => position.trim().toUpperCase())
          .filter(Boolean)
      )
    ).sort();

    const selectTextField = (selector: (row: ProspectSourceRow) => string | null): string | null => {
      for (const row of preferredRows) {
        const value = selector(row);
        if (value && value.trim().length > 0) {
          return value;
        }
      }
      return null;
    };

    const selectNumberField = (selector: (row: ProspectSourceRow) => number | null): number | null => {
      for (const row of preferredRows) {
        const value = selector(row);
        if (value != null && Number.isFinite(value)) {
          return value;
        }
      }
      return null;
    };

    const ownership = ownerByNormName.get(normName);
    const fantasyTeam = ownership?.fantasy_team ?? null;
    const rostered =
      fantasyTeam != null &&
      !fantasyTeam.toLowerCase().includes('free agent') &&
      !fantasyTeam.toLowerCase().includes('waiver');

    const age = normalizeAge(selectNumberField((row) => row.age));
    const eta = normalizeEta(selectTextField((row) => row.eta));
    const level = normalizeLevel(selectTextField((row) => row.level));
    const height = normalizeHeight(selectTextField((row) => row.height));
    const weight = normalizeWeight(selectTextField((row) => row.weight));
    const bats = normalizeBatThrow(selectTextField((row) => row.bats));
    const throws = normalizeBatThrow(selectTextField((row) => row.throws));
    const fv = normalizeDisplayText(selectTextField((row) => row.fv));
    const ofp = normalizeDisplayText(selectTextField((row) => row.ofp));
    const statsSummary = normalizeScoutingSnippet(selectTextField((row) => row.stats_summary), 280);
    const scoutingReport = normalizeScoutingSnippet(selectTextField((row) => row.scouting_report), 900);
    const notes = normalizeScoutingSnippet(selectTextField((row) => row.notes), 380);
    const playerSummary = buildProspectSummary({
      statsSummary,
      notes,
      scoutingReport,
      fv,
      ofp,
      eta,
      level,
    });

    const defaultStats: ProspectMinorLeagueStats = {
      atBats: null,
      avg: null,
      homeRuns: null,
      rbi: null,
      runs: null,
      stolenBases: null,
      strikeOuts: null,
      ops: null,
      obp: null,
      slg: null,
      era: null,
      whip: null,
      strikeoutsPer9: null,
      walksPer9: null,
      wins: null,
      saves: null,
      holds: null,
      inningsPitched: null,
    };

    const minorLeagueStats = minorLeagueStatsByNormName.get(normName) ?? {
      STD: defaultStats,
      L7: defaultStats,
      L14: defaultStats,
      L30: defaultStats,
    };

    rows.push({
      player_name:
        normalizeDisplayText(preferredRows[0]?.player_name ?? group[0].player_name) ??
        preferredRows[0]?.player_name ??
        group[0].player_name,
      norm_name: normName,
      organization: normalizeDisplayText(selectTextField((row) => row.org)),
      positions: mergedPositions.join(', '),
      is_rostered: rostered,
      fantasy_team: fantasyTeam,
      league_name: ownership?.league_name ?? null,
      mlb_rank: mlbRank,
      fangraphs_rank: fangraphsRank,
      prospects_live_rank: prospectsLiveRank,
      average_rank: toRounded(avg, 2),
      highest_rank: highest,
      lowest_rank: lowest,
      stddev_rank: toRounded(rankStdDev, 2),
      best_rank_bias_score: toRounded(bestRankBiasScore, 2),
      age,
      eta,
      level,
      height,
      weight,
      bats,
      throws,
      fv,
      ofp,
      player_summary: playerSummary,
      stats_summary: statsSummary,
      scouting_report: scoutingReport,
      notes,
      minor_league_stats: minorLeagueStats,
    });
  }

  const teamFiltered =
    selectedFantasyTeams.length > 0
      ? rows.filter((row) => row.fantasy_team != null && selectedFantasyTeams.includes(row.fantasy_team))
      : rows;

  const positionFiltered =
    selectedPositions.length > 0
      ? teamFiltered.filter((row) => {
          if (!row.positions) return false;
          const rowPositions = row.positions
            .split(',')
            .map((position) => position.trim().toUpperCase())
            .filter(Boolean);
          return selectedPositions.some((position) => rowPositions.includes(position.toUpperCase()));
        })
      : teamFiltered;

  const normalizedSearch = playerNameSearch ? normalizePlayerName(playerNameSearch) : '';
  const searchFiltered = normalizedSearch
    ? positionFiltered.filter((row) => normalizePlayerName(row.player_name).includes(normalizedSearch))
    : positionFiltered;

  const ageFiltered =
    maxAge != null
      ? searchFiltered.filter((row) => row.age != null && row.age <= maxAge)
      : searchFiltered;

  const rosterFiltered =
    rosterFilter === 'rostered'
      ? ageFiltered.filter((row) => row.is_rostered)
      : rosterFilter === 'available'
        ? ageFiltered.filter((row) => !row.is_rostered)
        : ageFiltered;

  return rosterFiltered
    .sort((a, b) => {
      if (a.best_rank_bias_score !== b.best_rank_bias_score) {
        return a.best_rank_bias_score - b.best_rank_bias_score;
      }
      if (a.highest_rank !== b.highest_rank) {
        return a.highest_rank - b.highest_rank;
      }
      if (a.average_rank !== b.average_rank) {
        return a.average_rank - b.average_rank;
      }
      return a.player_name.localeCompare(b.player_name);
    })
    .slice(0, 50);
}

async function loadMinorLeagueStats(
  conn: Awaited<ReturnType<Awaited<ReturnType<typeof getDB>>['connect']>>,
  normNames: string[]
): Promise<Map<string, Record<ProspectStatsWindow, ProspectMinorLeagueStats>>> {
  if (normNames.length === 0) {
    return new Map();
  }

  const normNameSet = new Set(normNames);
  const normalizeProspectWindow = (value: string | null): ProspectStatsWindow | null => {
    if (!value) return null;
    const normalized = value.toUpperCase();
    if (normalized === 'STD') return 'STD';
    if (normalized === '7D' || normalized === 'L7') return 'L7';
    if (normalized === '14D' || normalized === 'L14') return 'L14';
    if (normalized === '30D' || normalized === 'L30') return 'L30';
    return null;
  };

   try {
     // Query prospects table, calculating norm_name on the fly
     const sql = `
       SELECT
         player_name,
         "window" AS stats_window,
         atBats,
         avg,
         homeRuns,
         rbi,
         runs,
         stolenBases,
         strikeOuts,
         ops,
         obp,
         slg,
         era,
         whip,
         strikeoutsPer9Inn,
         walksPer9Inn,
         wins,
         saves,
         holds,
         inningsPitched
       FROM prospects
       WHERE "window" IS NOT NULL
     `;

    const result = await conn.query(sql);
    const byNormName = new Map<string, Record<ProspectStatsWindow, ProspectMinorLeagueStats>>();

    for (const row of result.toArray()) {
      const playerName = row.player_name as string | null;
      const window = normalizeProspectWindow((row.stats_window as string | null) ?? null);

      if (!playerName || !window) continue;
      const normName = normalizePlayerName(playerName);
      if (!normName || !normNameSet.has(normName)) continue;

      const defaultStats: ProspectMinorLeagueStats = {
        atBats: null,
        avg: null,
        homeRuns: null,
        rbi: null,
        runs: null,
        stolenBases: null,
        strikeOuts: null,
        ops: null,
        obp: null,
        slg: null,
        era: null,
        whip: null,
        strikeoutsPer9: null,
        walksPer9: null,
        wins: null,
        saves: null,
        holds: null,
        inningsPitched: null,
      };

      if (!byNormName.has(normName)) {
        byNormName.set(normName, {
          STD: { ...defaultStats },
          L7: { ...defaultStats },
          L14: { ...defaultStats },
          L30: { ...defaultStats },
        });
      }

      const stats = byNormName.get(normName)!;

      // Parse string values to numbers where applicable
      const parseNum = (val: unknown): number | null => {
        if (val === null || val === undefined) return null;
        const n = Number(val);
        return isNaN(n) ? null : n;
      };

      stats[window] = {
        atBats: parseNum(row.atBats),
        avg: parseNum(row.avg),
        homeRuns: parseNum(row.homeRuns),
        rbi: parseNum(row.rbi),
        runs: parseNum(row.runs),
        stolenBases: parseNum(row.stolenBases),
        strikeOuts: parseNum(row.strikeOuts),
        ops: parseNum(row.ops),
        obp: parseNum(row.obp),
        slg: parseNum(row.slg),
        era: parseNum(row.era),
        whip: parseNum(row.whip),
        strikeoutsPer9: parseNum(row.strikeoutsPer9Inn),
        walksPer9: parseNum(row.walksPer9Inn),
        wins: parseNum(row.wins),
        saves: parseNum(row.saves),
        holds: parseNum(row.holds),
        inningsPitched: parseNum(row.inningsPitched),
      };
    }

    return byNormName;
  } catch (error) {
    // If prospects table doesn't exist or has no data, return empty map
    console.warn('Could not load minor league stats:', error);
    return new Map();
  }
}

export async function queryProspects(
  sourceRows: ProspectSourceRow[],
  selectedLeague: string | null,
  selectedFantasyTeams: string[],
  selectedPositions: string[],
  playerNameSearch?: string,
  missingRankDefault = 125,
  maxAge: number | null = null,
  rosterFilter: 'all' | 'rostered' | 'available' = 'all'
): Promise<ProspectRow[]> {
  const db = await getDB();
  const conn = await db.connect();

  try {
    let sql = 'SELECT league_name, fantasy_team, norm_name FROM yahoo';
    if (selectedLeague) {
      sql += ` WHERE league_name = '${escapeSQL(selectedLeague)}'`;
    }

    const result = await conn.query(sql);
    const ownershipRows = result.toArray();
    const ownerByNormName = new Map<
      string,
      { fantasy_team: string | null; league_name: string | null }
    >();

    for (const row of ownershipRows) {
      const normName = (row.norm_name as string | null) ?? null;
      if (!normName || ownerByNormName.has(normName)) continue;
      ownerByNormName.set(normName, {
        fantasy_team: (row.fantasy_team as string | null) ?? null,
        league_name: (row.league_name as string | null) ?? null,
      });
    }

    // Load minor league stats for all source row prospects
    const prospectNormNames = Array.from(
      new Set(sourceRows.map((r) => normalizePlayerName(r.player_name)).filter(Boolean))
    );
    const minorLeagueStatsByNormName = await loadMinorLeagueStats(conn, prospectNormNames);

    return buildProspectRows(sourceRows, ownerByNormName, {
      selectedFantasyTeams,
      selectedPositions,
      playerNameSearch,
      missingRankDefault,
      maxAge,
      rosterFilter,
      minorLeagueStatsByNormName,
    });
  } finally {
    await conn.close();
  }
}

export async function queryPitcherTrends(
  ranks: PitcherListRankRow[],
  selectedLeague: string | null,
  selectedFantasyTeams: string[],
  playerNameSearch?: string
): Promise<PitcherTrendRow[]> {
  const db = await getDB();
  const conn = await db.connect();

  try {
    let sql = 'SELECT player_name, league_name, fantasy_team, norm_name FROM yahoo';
    if (selectedLeague) {
      sql += ` WHERE league_name = '${escapeSQL(selectedLeague)}'`;
    }

    const result = await conn.query(sql);
    const ownershipRows = result.toArray();
    const ownerByNormName = new Map<
      string,
      { fantasy_team: string | null; league_name: string | null }
    >();

    for (const row of ownershipRows) {
      const normName = (row.norm_name as string | null) ?? null;
      if (!normName || ownerByNormName.has(normName)) continue;
      ownerByNormName.set(normName, {
        fantasy_team: (row.fantasy_team as string | null) ?? null,
        league_name: (row.league_name as string | null) ?? null,
      });
    }

    const joined = ranks.map((rank) => {
      const normName = normalizePlayerName(rank.player_name);
      const ownership = ownerByNormName.get(normName);
      const fantasyTeam = ownership?.fantasy_team ?? null;

      return {
        latest_rank: rank.latest_rank,
        player_name: rank.player_name,
        mlb_team: rank.mlb_team,
        movement_raw: rank.movement_raw,
        movement_value: rank.movement_value,
        trend_direction: rank.trend_direction,
        notes: rank.notes,
        fantasy_team: fantasyTeam,
        league_name: ownership?.league_name ?? null,
      } satisfies PitcherTrendRow;
    });

    const teamFiltered =
      selectedFantasyTeams.length > 0
        ? joined.filter((r) => r.fantasy_team != null && selectedFantasyTeams.includes(r.fantasy_team))
        : joined;

    const normalizedSearch = playerNameSearch ? normalizePlayerName(playerNameSearch) : '';
    const filtered = normalizedSearch
      ? teamFiltered.filter((row) => normalizePlayerName(row.player_name).includes(normalizedSearch))
      : teamFiltered;

    return filtered.sort((a, b) => a.latest_rank - b.latest_rank);
  } finally {
    await conn.close();
  }
}

export async function queryReliefTrends(
  ranks: ReliefListRankRow[],
  selectedLeague: string | null,
  selectedFantasyTeams: string[],
  playerNameSearch?: string
): Promise<ReliefTrendRow[]> {
  const db = await getDB();
  const conn = await db.connect();

  try {
    let sql = 'SELECT player_name, league_name, fantasy_team, norm_name FROM yahoo';
    if (selectedLeague) {
      sql += ` WHERE league_name = '${escapeSQL(selectedLeague)}'`;
    }

    const result = await conn.query(sql);
    const ownershipRows = result.toArray();
    const ownerByNormName = new Map<
      string,
      { fantasy_team: string | null; league_name: string | null }
    >();

    for (const row of ownershipRows) {
      const normName = (row.norm_name as string | null) ?? null;
      if (!normName || ownerByNormName.has(normName)) continue;
      ownerByNormName.set(normName, {
        fantasy_team: (row.fantasy_team as string | null) ?? null,
        league_name: (row.league_name as string | null) ?? null,
      });
    }

    const joined = ranks.map((rank) => {
      const normName = normalizePlayerName(rank.player_name);
      const ownership = ownerByNormName.get(normName);
      const fantasyTeam = ownership?.fantasy_team ?? null;

      return {
        latest_rank: rank.latest_rank,
        player_name: rank.player_name,
        mlb_team: rank.mlb_team,
        movement_raw: rank.movement_raw,
        movement_value: rank.movement_value,
        trend_direction: rank.trend_direction,
        notes: rank.notes,
        fantasy_team: fantasyTeam,
        league_name: ownership?.league_name ?? null,
      } satisfies ReliefTrendRow;
    });

    const teamFiltered =
      selectedFantasyTeams.length > 0
        ? joined.filter((r) => r.fantasy_team != null && selectedFantasyTeams.includes(r.fantasy_team))
        : joined;

    const normalizedSearch = playerNameSearch ? normalizePlayerName(playerNameSearch) : '';
    const filtered = normalizedSearch
      ? teamFiltered.filter((row) => normalizePlayerName(row.player_name).includes(normalizedSearch))
      : teamFiltered;

    return filtered.sort((a, b) => a.latest_rank - b.latest_rank);
  } finally {
    await conn.close();
  }
}
