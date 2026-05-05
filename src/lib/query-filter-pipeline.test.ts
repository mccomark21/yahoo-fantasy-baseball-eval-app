import { describe, expect, it } from 'vitest';
import {
  applyFantasyTeamAndPlayerSearchFilters,
  applyFantasyTeamFilter,
  applyPlayerNameSearchFilter,
  buildOwnerByNormName,
} from '@/lib/query-filter-pipeline';
import { normalizePlayerName } from '@/lib/queries';

describe('query filter pipeline helpers', () => {
  it('keeps the first ownership row per normalized name', () => {
    const ownerByNormName = buildOwnerByNormName([
      {
        norm_name: 'jose ramirez',
        fantasy_team: 'Team A',
        league_name: 'League 1',
      },
      {
        norm_name: 'jose ramirez',
        fantasy_team: 'Team B',
        league_name: 'League 2',
      },
      {
        norm_name: null,
        fantasy_team: 'Ignored Team',
        league_name: 'League 1',
      },
    ]);

    expect(ownerByNormName.size).toBe(1);
    expect(ownerByNormName.get('jose ramirez')).toEqual({
      fantasy_team: 'Team A',
      league_name: 'League 1',
    });
  });

  it('filters rows by selected fantasy teams only when filters are present', () => {
    const rows = [
      { player_name: 'Jose Ramirez', fantasy_team: 'Team A' },
      { player_name: 'Austin Martin', fantasy_team: 'Free Agent' },
      { player_name: 'Unknown', fantasy_team: null },
    ];

    expect(applyFantasyTeamFilter(rows, [])).toEqual(rows);
    expect(applyFantasyTeamFilter(rows, ['Free Agent'])).toEqual([
      { player_name: 'Austin Martin', fantasy_team: 'Free Agent' },
    ]);
  });

  it('applies normalized player-name search filtering', () => {
    const rows = [
      { player_name: 'José Ramírez', fantasy_team: 'Team A' },
      { player_name: 'Austin Martin', fantasy_team: 'Free Agent' },
    ];

    const filtered = applyPlayerNameSearchFilter(rows, 'Jose', normalizePlayerName);
    expect(filtered).toEqual([{ player_name: 'José Ramírez', fantasy_team: 'Team A' }]);
  });

  it('composes team and search filters in a single step', () => {
    const rows = [
      { player_name: 'José Ramírez', fantasy_team: 'Team A' },
      { player_name: 'Austin Martin', fantasy_team: 'Free Agent' },
      { player_name: 'Jose Altuve', fantasy_team: 'Free Agent' },
    ];

    const filtered = applyFantasyTeamAndPlayerSearchFilters(
      rows,
      ['Free Agent'],
      'Jose',
      normalizePlayerName
    );

    expect(filtered).toEqual([{ player_name: 'Jose Altuve', fantasy_team: 'Free Agent' }]);
  });
});
