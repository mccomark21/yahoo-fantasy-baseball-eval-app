import { getDB } from './duckdb';

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
        ON LOWER(y.player_name) = (
          TRIM(SPLIT_PART(g.player_name, ',', 2)) || ' ' || TRIM(SPLIT_PART(g.player_name, ',', 1))
        )
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
    }));
  } finally {
    await conn.close();
  }
}

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
