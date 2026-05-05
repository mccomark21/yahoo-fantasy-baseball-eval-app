export interface OwnershipRecord {
  norm_name: string | null;
  fantasy_team: string | null;
  league_name: string | null;
}

export interface ProspectOwnership {
  fantasy_team: string | null;
  league_name: string | null;
}

export function buildOwnerByNormName(
  ownershipRows: OwnershipRecord[]
): Map<string, ProspectOwnership> {
  const ownerByNormName = new Map<string, ProspectOwnership>();

  for (const row of ownershipRows) {
    if (!row.norm_name || ownerByNormName.has(row.norm_name)) continue;
    ownerByNormName.set(row.norm_name, {
      fantasy_team: row.fantasy_team,
      league_name: row.league_name,
    });
  }

  return ownerByNormName;
}

export function applyFantasyTeamFilter<TRow extends { fantasy_team: string | null }>(
  rows: TRow[],
  selectedFantasyTeams: string[]
): TRow[] {
  if (selectedFantasyTeams.length === 0) return rows;
  return rows.filter(
    (row) => row.fantasy_team != null && selectedFantasyTeams.includes(row.fantasy_team)
  );
}

export function applyPlayerNameSearchFilter<TRow extends { player_name: string }>(
  rows: TRow[],
  playerNameSearch: string | undefined,
  normalizePlayerName: (name: string) => string
): TRow[] {
  const normalizedSearch = playerNameSearch ? normalizePlayerName(playerNameSearch) : '';
  if (!normalizedSearch) return rows;
  return rows.filter((row) => normalizePlayerName(row.player_name).includes(normalizedSearch));
}

export function applyFantasyTeamAndPlayerSearchFilters<
  TRow extends { fantasy_team: string | null; player_name: string },
>(
  rows: TRow[],
  selectedFantasyTeams: string[],
  playerNameSearch: string | undefined,
  normalizePlayerName: (name: string) => string
): TRow[] {
  const teamFiltered = applyFantasyTeamFilter(rows, selectedFantasyTeams);
  return applyPlayerNameSearchFilter(teamFiltered, playerNameSearch, normalizePlayerName);
}
