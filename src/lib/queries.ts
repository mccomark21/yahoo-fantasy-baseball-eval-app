import { getDB } from './duckdb';
import type { PitcherListRankRow, ReliefListRankRow, TrendDirection } from './pitcherlist-client';

export type TimeWindow = 'STD' | '7D' | '14D' | '30D';

export interface PlayerRow {
  player_name: string;
  mlb_team: string;
  position: string;
  league_name: string;
  fantasy_team: string;
  xwoba: number | null;
  pull_air_pct: number | null;
  bb_k: number | null;
  sb_per_pa: number | null;
  pa: number | null;
  bbe: number | null;
  z_xwoba: number | null;
  z_pull_air_pct: number | null;
  z_bb_k: number | null;
  z_sb_per_pa: number | null;
  composite_score: number | null;
}

export interface PitcherTrendRow {
  latest_rank: number;
  player_name: string;
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: TrendDirection;
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
        CASE WHEN SUM(g.pa) > 0
          THEN ROUND(SUM(g.sb)::DOUBLE / SUM(g.pa), 3)
          ELSE NULL END AS sb_per_pa,
        SUM(g.pa) AS pa,
        SUM(g.bbe) AS bbe
      FROM yahoo y
      LEFT JOIN game_logs g
        ON y.norm_name = g.norm_name
        ${dateFilter}
      ${whereSQL}
      GROUP BY
        y.player_name,
        y.mlb_team,
        y.eligible_positions,
        y.league_name,
        y.fantasy_team
      ORDER BY xwoba DESC NULLS LAST
    `;

    const result = await conn.query(sql);
    return result.toArray().map((row) => ({
      player_name: row.player_name as string,
      mlb_team: row.mlb_team as string,
      position: row.position as string,
      league_name: row.league_name as string,
      fantasy_team: row.fantasy_team as string,
      xwoba: toNum(row.xwoba),
      pull_air_pct: toNum(row.pull_air_pct),
      bb_k: toNum(row.bb_k),
      sb_per_pa: toNum(row.sb_per_pa),
      pa: toNum(row.pa),
      bbe: toNum(row.bbe),
      z_xwoba: null,
      z_pull_air_pct: null,
      z_bb_k: null,
      z_sb_per_pa: null,
      composite_score: null,
    }));
  } finally {
    await conn.close();
  }
}

const Z_SCORE_WEIGHTS = {
  xwoba: 0.4,
  pull_air_pct: 0.2,
  bb_k: 0.3,
  sb_per_pa: 0.1,
} as const;

const Z_CLAMP = 2.5;

export function computeZScores(rows: PlayerRow[]): PlayerRow[] {
  const metrics = ['xwoba', 'pull_air_pct', 'bb_k', 'sb_per_pa'] as const;
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
