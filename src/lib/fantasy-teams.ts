export function getDefaultRosterTeams(teams: string[]): string[] {
  return teams.filter((team) => {
    const normalized = team.toLowerCase();
    return normalized.includes('free agent') || normalized.includes('waiver');
  });
}
