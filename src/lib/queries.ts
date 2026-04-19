import { getDB } from './duckdb';
import type { PitcherListRankRow, ReliefListRankRow, TrendDirection } from './pitcherlist-client';

export type TimeWindow = 'STD' | '7D' | '14D' | '30D';

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

export interface BuildAccuracyCohortOptions {
  selectedLeague: string | null;
  benchmarkPlayers: string[];
  randomSampleSize: number;
  randomSeed: number;
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
  selectedPositions: string[]
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
    const eligibleRows = eligibleResult.toArray().map((row) => ({
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
      bbe_p75: Number(row.bbe_p75),
    }));

    if (eligibleRows.length === 0) {
      throw new Error('No top-quartile BBE hitters were found for the current filters.');
    }

    const bbeP75 = eligibleRows[0].bbe_p75;

    const byNormName = new Map(eligibleRows.map((row) => [row.norm_name, row]));
    const benchmarkNorms = Array.from(
      new Set(options.benchmarkPlayers.map((name) => normalizePlayerName(name)))
    );

    const missingBenchmarks = benchmarkNorms.filter((normName) => !byNormName.has(normName));
    if (missingBenchmarks.length > 0) {
      const missingDisplay = options.benchmarkPlayers.filter((name) =>
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
    const sampleSize = Math.max(0, Math.min(options.randomSampleSize, sampleCandidates.length));

    const sampledRows = sampleCandidates
      .map((row) => ({ row, score: seededScore(row.norm_name, options.randomSeed) }))
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

export function normalizePlayerName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '')
    .replace(/[^a-zA-Z ]/g, '')
    .toLowerCase()
    .trim();
}

export async function queryPitcherTrends(
  ranks: PitcherListRankRow[],
  selectedLeague: string | null,
  selectedFantasyTeams: string[]
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

    const filtered =
      selectedFantasyTeams.length > 0
        ? joined.filter((r) => r.fantasy_team != null && selectedFantasyTeams.includes(r.fantasy_team))
        : joined;

    return filtered.sort((a, b) => a.latest_rank - b.latest_rank);
  } finally {
    await conn.close();
  }
}

export async function queryReliefTrends(
  ranks: ReliefListRankRow[],
  selectedLeague: string | null,
  selectedFantasyTeams: string[]
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

    const filtered =
      selectedFantasyTeams.length > 0
        ? joined.filter((r) => r.fantasy_team != null && selectedFantasyTeams.includes(r.fantasy_team))
        : joined;

    return filtered.sort((a, b) => a.latest_rank - b.latest_rank);
  } finally {
    await conn.close();
  }
}
