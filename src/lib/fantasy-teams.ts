export function getDefaultRosterTeams(teams: string[]): string[] {
  return teams.filter((team) => /\bfree\s*agent\b/i.test(team));
}
