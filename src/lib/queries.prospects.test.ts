import { describe, expect, it } from 'vitest';
import {
  buildProspectRows,
  normalizePlayerName,
  resolveStatsNormNameWithFallback,
} from '@/lib/queries';
import type { ProspectSourceRow, ProspectSourceStatus } from '@/lib/prospects-client';

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

function makeSourceStatus(source: ProspectSourceStatus['source'], publishedAt: string | null): ProspectSourceStatus {
  return {
    source,
    title: source,
    source_url: `https://example.com/${source}`,
    published_at: publishedAt,
    scraped_at: '2026-05-10T12:00:00Z',
    status: 'ok',
    row_count: 1,
    error: null,
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
  const sourceStatuses = [
    makeSourceStatus('mlb', null),
    makeSourceStatus('fangraphs', '2026-05-10T11:22:00-04:00'),
    makeSourceStatus('prospects_live', '2026-02-12T14:00:00Z'),
    makeSourceStatus('fantrax', '2026-03-14T02:59:28Z'),
    makeSourceStatus('pitcherlist', '2026-04-23T00:00:00Z'),
    makeSourceStatus('tjstats', '2026-05-09T14:14:47Z'),
  ];

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
      sourceStatuses,
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
      sourceStatuses,
    });

    const segaRows = buildProspectRows(sourceRows, segaOwnership, {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      rosterFilter: 'all',
      sourceStatuses,
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
      sourceStatuses,
    });

    expect(filteredRows).toHaveLength(0);
  });

  it('treats prospects with null ownership as Free Agent for team filtering', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 10, 'Josue De Paula'),
      makeProspectRow('fangraphs', 20, 'Josue De Paula'),
      makeProspectRow('prospects_live', 16, 'Josue De Paula'),
    ];

    const rows = buildProspectRows(sourceRows, new Map(), {
      selectedFantasyTeams: ['Free Agent'],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      sourceStatuses,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].norm_name).toBe(normalizePlayerName('Josue De Paula'));
    expect(rows[0].fantasy_team).toBe('Free Agent');
    expect(rows[0].is_rostered).toBe(false);
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
      sourceStatuses,
    });

    const availableOnly = buildProspectRows(sourceRows, ownership, {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      rosterFilter: 'available',
      sourceStatuses,
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
      sourceStatuses,
    });

    expect(rows).toHaveLength(61);
    expect(rows.some((row) => row.norm_name === normalizePlayerName('Luis Peña'))).toBe(true);
  });

  it('excludes MLB-level players from results', () => {
    const sourceRows: ProspectSourceRow[] = [
      { ...makeProspectRow('mlb', 15, 'MLB Ready Prospect'), level: 'MLB' },
      { ...makeProspectRow('fangraphs', 18, 'MLB Ready Prospect'), level: 'MLB' },
      { ...makeProspectRow('prospects_live', 20, 'MLB Ready Prospect'), level: 'MLB' },
      makeProspectRow('mlb', 21, 'Minor League Prospect'),
      makeProspectRow('fangraphs', 24, 'Minor League Prospect'),
      makeProspectRow('prospects_live', 25, 'Minor League Prospect'),
    ];

    const rows = buildProspectRows(sourceRows, new Map(), {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      sourceStatuses,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].norm_name).toBe(normalizePlayerName('Minor League Prospect'));
    expect(rows.every((row) => row.level !== 'MLB')).toBe(true);
  });

  it('weights newer source ranks more heavily in the consensus blend', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 100, 'Weighted Prospect'),
      makeProspectRow('fangraphs', 10, 'Weighted Prospect'),
      makeProspectRow('prospects_live', 100, 'Weighted Prospect'),
      makeProspectRow('fantrax', 100, 'Weighted Prospect'),
      makeProspectRow('pitcherlist', 100, 'Weighted Prospect'),
      makeProspectRow('tjstats', 100, 'Weighted Prospect'),
    ];

    const rows = buildProspectRows(sourceRows, new Map(), {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      sourceStatuses,
      consensusReferenceDate: new Date('2026-05-10T16:00:00Z'),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].average_rank).toBeGreaterThanOrEqual(10);
    expect(rows[0].average_rank).toBeLessThan(100);
    expect(rows[0].fantrax_rank).toBe(100);
    expect(rows[0].fangraphs_rank).toBe(10);
  });

  it('excludes sources older than 60 days from consensus rank calculation', () => {
    const sourceRows: ProspectSourceRow[] = [
      makeProspectRow('mlb', 50, 'Stale Source Test'),
      makeProspectRow('fangraphs', 10, 'Stale Source Test'),
      makeProspectRow('prospects_live', 60, 'Stale Source Test'),
      makeProspectRow('fantrax', 65, 'Stale Source Test'),
    ];

    const staleSourceStatuses: ProspectSourceStatus[] = [
      makeSourceStatus('mlb', '2026-03-10T00:00:00Z'), // ~70 days old
      makeSourceStatus('fangraphs', '2026-05-15T00:00:00Z'), // ~4 days old
      makeSourceStatus('prospects_live', '2026-03-15T00:00:00Z'), // ~65 days old
      makeSourceStatus('fantrax', '2026-05-19T00:00:00Z'), // current day
    ];

    const rows = buildProspectRows(sourceRows, new Map(), {
      selectedFantasyTeams: [],
      selectedPositions: [],
      playerNameSearch: '',
      maxAge: null,
      sourceStatuses: staleSourceStatuses,
      consensusReferenceDate: new Date('2026-05-19T12:00:00Z'),
    });

    expect(rows).toHaveLength(1);
    // Only fangraphs (10) and fantrax (65) should participate
    // Excluding worst (65), we average only fangraphs: 10
    expect(rows[0].average_rank).toBe(10);
    expect(rows[0].fangraphs_rank).toBe(10);
    expect(rows[0].fantrax_rank).toBe(65);
    // MLB and prospects_live are > 60 days old, so not included in consensus
    expect(rows[0].mlb_rank).toBe(50);
    expect(rows[0].prospects_live_rank).toBe(60);
  });
});

describe('resolveStatsNormNameWithFallback', () => {
  it('recovers replacement-character mojibake names when a known normalized target exists', () => {
    const known = new Set([normalizePlayerName('Luis Pena')]);
    expect(resolveStatsNormNameWithFallback('Luis Pe�a', known)).toBe(normalizePlayerName('Luis Pena'));
  });

  it('returns direct normalization when no fallback candidate matches known names', () => {
    const known = new Set([normalizePlayerName('Different Player')]);
    expect(resolveStatsNormNameWithFallback('Luis Pe�a', known)).toBe(normalizePlayerName('Luis Pe�a'));
  });
});
