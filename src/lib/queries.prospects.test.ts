import { describe, expect, it } from 'vitest';
import {
  buildProspectRows,
  normalizePlayerName,
} from '@/lib/queries';
import type { ProspectSourceRow } from '@/lib/prospects-client';

function makeProspectRow(source: ProspectSourceRow['source'], rank: number, playerName: string): ProspectSourceRow {
  return {
    source,
    rank,
    player_name: playerName,
    org: 'MIL',
    positions: ['SS'],
    age: 18.9,
    eta: '2027',
    level: 'A',
    height: "6'1\"",
    weight: '180',
    bats: 'S',
    throws: 'R',
    fv: source === 'prospects_live' ? null : '60',
    ofp: source === 'prospects_live' ? '70' : null,
    stats_summary: null,
    scouting_report: null,
    notes: null,
  };
}

function alphaSuffix(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

describe('buildProspectRows', () => {
  it('includes top cross-source prospects by default even when rostered', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 21, 'Luis PeÃ±a'),
      makeProspectRow('fangraphs', 24, 'Luis Peña'),
      makeProspectRow('prospects_live', 25, 'Luis Pena'),
    ];

    const ownership = new Map([
      [normalizePlayerName('Luis Peña'), { fantasy_team: 'Dynasty Crushers', league_name: 'Alpha' }],
    ]);

    const rows = buildProspectRows(sourceRows, ownership, {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].norm_name).toBe(normalizePlayerName('Luis Peña'));
    expect(rows[0].mlb_rank).toBe(21);
    expect(rows[0].fangraphs_rank).toBe(24);
    expect(rows[0].prospects_live_rank).toBe(25);
    expect(rows[0].fantasy_team).toBe('Dynasty Crushers');
  });

  it('keeps Luis Pena included across league ownership contexts when no filters are applied', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 21, 'Luis PeÃ±a'),
      makeProspectRow('fangraphs', 24, 'Luis Peña'),
      makeProspectRow('prospects_live', 25, 'Luis Pena'),
    ];

    const leagueOfChampionsOwnership = new Map([
      [normalizePlayerName('Luis Peña'), { fantasy_team: 'LoC Team', league_name: 'League of Champions' }],
    ]);
    const segaOwnership = new Map<string, { fantasy_team: string | null; league_name: string | null }>();

    const locRows = buildProspectRows(sourceRows, leagueOfChampionsOwnership, {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      rosterFilter: 'all',
    });

    const segaRows = buildProspectRows(sourceRows, segaOwnership, {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      rosterFilter: 'all',
    });

    expect(locRows.some((row) => row.norm_name === normalizePlayerName('Luis Peña'))).toBe(true);
    expect(segaRows.some((row) => row.norm_name === normalizePlayerName('Luis Peña'))).toBe(true);
  });

  it('applies team filter only when explicitly selected', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 21, 'Luis Peña'),
      makeProspectRow('fangraphs', 24, 'Luis Peña'),
      makeProspectRow('prospects_live', 25, 'Luis Peña'),
    ];

    const ownership = new Map([
      [normalizePlayerName('Luis Peña'), { fantasy_team: 'Dynasty Crushers', league_name: 'Alpha' }],
    ]);

    const filteredRows = buildProspectRows(sourceRows, ownership, {
      selectedFantasyTeams: ['Free Agent'],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
    });

    expect(filteredRows).toHaveLength(0);
  });

  it('applies rostered filter as expected', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 21, 'Luis Peña'),
      makeProspectRow('fangraphs', 24, 'Luis Peña'),
      makeProspectRow('prospects_live', 25, 'Luis Peña'),
      makeProspectRow('mlb', 40, 'Available Prospect'),
      makeProspectRow('fangraphs', 42, 'Available Prospect'),
      makeProspectRow('prospects_live', 45, 'Available Prospect'),
    ];

    const ownership = new Map([
      [normalizePlayerName('Luis Peña'), { fantasy_team: 'Dynasty Crushers', league_name: 'Alpha' }],
    ]);

    const rosteredOnly = buildProspectRows(sourceRows, ownership, {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      rosterFilter: 'rostered',
    });

    const availableOnly = buildProspectRows(sourceRows, ownership, {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      rosterFilter: 'available',
    });

    expect(rosteredOnly).toHaveLength(1);
    expect(rosteredOnly[0].norm_name).toBe(normalizePlayerName('Luis Peña'));

    expect(availableOnly).toHaveLength(1);
    expect(availableOnly[0].norm_name).toBe(normalizePlayerName('Available Prospect'));
  });

  it('keeps high-ranked player in top-50 output when many rows exist', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 21, 'Luis Peña'),
      makeProspectRow('fangraphs', 24, 'Luis Peña'),
      makeProspectRow('prospects_live', 25, 'Luis Peña'),
    ];

    for (let i = 1; i <= 60; i += 1) {
      const name = `Depth Prospect ${alphaSuffix(i)}`;
      sourceRows.push(
        makeProspectRow('mlb', 60 + i, name),
        makeProspectRow('fangraphs', 60 + i, name),
        makeProspectRow('prospects_live', 60 + i, name)
      );
    }

    const rows = buildProspectRows(sourceRows, new Map(), {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
    });

    expect(rows).toHaveLength(50);
    expect(rows.some((row) => row.norm_name === normalizePlayerName('Luis Peña'))).toBe(true);
  });
});
