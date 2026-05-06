import { describe, expect, it, vi } from 'vitest';
import {
  makeInjuredViewExecute,
  makePitcherViewExecute,
  makeReliefViewExecute,
} from '@/lib/view-orchestration';

// ---------------------------------------------------------------------------
// makePitcherViewExecute — Pitcher View execute factory
//
// Tests validate the interface: fetch + query + meta mapping in one step.
// ---------------------------------------------------------------------------

describe('makePitcherViewExecute', () => {
  const mockLatest = {
    title: 'Top 100 SPs - Week 18',
    source_url: 'https://pitcherlist.com/top-100',
    published_at: '2026-05-01T00:00:00Z',
    scraped_at: '2026-05-02T09:00:00Z',
    rows: [
      {
        latest_rank: 1,
        player_name: 'Corbin Burnes',
        mlb_team: 'BAL',
        movement_raw: '-',
        movement_value: null,
        trend_direction: 'flat' as const,
        notes: null,
      },
    ],
  };

  const mockHistory = {
    snapshots: [
      {
        snapshot_date: '2026-04-24',
        title: 'Top 100 SPs - Week 17',
        source_url: 'https://pitcherlist.com/top-100',
        published_at: '2026-04-24T00:00:00Z',
        scraped_at: '2026-04-25T09:00:00Z',
        rows: [{ latest_rank: 2, player_name: 'Corbin Burnes', mlb_team: 'BAL', movement_raw: '+1', movement_value: 1, trend_direction: 'up' as const, notes: null }],
      },
    ],
  };

  const mockRows = [
    {
      latest_rank: 1,
      player_name: 'Corbin Burnes',
      mlb_team: 'BAL',
      movement_raw: '-',
      movement_value: null,
      trend_direction: 'flat' as const,
      notes: null,
      fantasy_team: 'Free Agent',
      league_name: 'Sega Memorial',
      trend_8w_series: [2, null, null, null, null, null, null, 1],
      trend_8w_net: 1,
      trend_start_rank: 2,
      trend_end_rank: 1,
    },
  ];

  it('returns rows and meta from combined fetch + query', async () => {
    const fetchLatest = vi.fn().mockResolvedValue(mockLatest);
    const fetchHistory = vi.fn().mockResolvedValue(mockHistory);
    const queryTrends = vi.fn().mockResolvedValue(mockRows);

    const execute = makePitcherViewExecute({ fetchLatest, fetchHistory, queryTrends });

    const result = await execute({
      selectedLeague: 'Sega Memorial',
      selectedTeams: ['Free Agent'],
      playerSearch: '',
    });

    expect(result.rows).toBe(mockRows);
    expect(result.meta).toEqual({
      title: 'Top 100 SPs - Week 18',
      source_url: 'https://pitcherlist.com/top-100',
      published_at: '2026-05-01T00:00:00Z',
    });
  });

  it('fetches latest and history in parallel and passes snapshots to queryTrends', async () => {
    const fetchLatest = vi.fn().mockResolvedValue(mockLatest);
    const fetchHistory = vi.fn().mockResolvedValue(mockHistory);
    const queryTrends = vi.fn().mockResolvedValue([]);

    const execute = makePitcherViewExecute({ fetchLatest, fetchHistory, queryTrends });

    await execute({ selectedLeague: null, selectedTeams: [], playerSearch: '' });

    expect(queryTrends).toHaveBeenCalledWith(
      mockLatest.rows,
      null,
      [],
      undefined,
      mockHistory.snapshots,
    );
  });

  it('passes playerSearch as undefined when empty string', async () => {
    const fetchLatest = vi.fn().mockResolvedValue(mockLatest);
    const fetchHistory = vi.fn().mockResolvedValue(mockHistory);
    const queryTrends = vi.fn().mockResolvedValue([]);

    const execute = makePitcherViewExecute({ fetchLatest, fetchHistory, queryTrends });
    await execute({ selectedLeague: null, selectedTeams: [], playerSearch: '' });

    const [, , , search] = queryTrends.mock.calls[0];
    expect(search).toBeUndefined();
  });

  it('propagates a fetch error without calling queryTrends', async () => {
    const fetchLatest = vi.fn().mockRejectedValue(new Error('Network unavailable'));
    const fetchHistory = vi.fn().mockResolvedValue(mockHistory);
    const queryTrends = vi.fn();

    const execute = makePitcherViewExecute({ fetchLatest, fetchHistory, queryTrends });

    await expect(
      execute({ selectedLeague: null, selectedTeams: [], playerSearch: '' }),
    ).rejects.toThrow('Network unavailable');

    expect(queryTrends).not.toHaveBeenCalled();
  });

  it('propagates a query error', async () => {
    const fetchLatest = vi.fn().mockResolvedValue(mockLatest);
    const fetchHistory = vi.fn().mockResolvedValue(mockHistory);
    const queryTrends = vi.fn().mockRejectedValue(new Error('DuckDB Binder Error'));

    const execute = makePitcherViewExecute({ fetchLatest, fetchHistory, queryTrends });

    await expect(
      execute({ selectedLeague: null, selectedTeams: [], playerSearch: '' }),
    ).rejects.toThrow('DuckDB Binder Error');
  });
});

// ---------------------------------------------------------------------------
// makeReliefViewExecute — Reliever View execute factory
// ---------------------------------------------------------------------------

describe('makeReliefViewExecute', () => {
  const mockLatest = {
    title: 'RP Rankings - SV+HLD',
    source_url: 'https://pitcherlist.com/rp',
    published_at: '2026-05-01T00:00:00Z',
    scraped_at: '2026-05-02T09:00:00Z',
    scoring_mode: 'svhld' as const,
    rows: [
      {
        latest_rank: 1,
        player_name: 'Emmanuel Clase',
        mlb_team: 'CLE',
        movement_raw: '-',
        movement_value: null,
        trend_direction: 'flat' as const,
        notes: null,
      },
    ],
  };

  const mockHistory = { snapshots: [] };
  const mockRows = [
    {
      latest_rank: 1,
      player_name: 'Emmanuel Clase',
      mlb_team: 'CLE',
      movement_raw: '-',
      movement_value: null,
      trend_direction: 'flat' as const,
      notes: null,
      fantasy_team: null,
      league_name: null,
      trend_8w_series: [],
      trend_8w_net: null,
      trend_start_rank: null,
      trend_end_rank: null,
    },
  ];

  it('returns rows and meta including scoring_mode', async () => {
    const execute = makeReliefViewExecute({
      fetchLatest: vi.fn().mockResolvedValue(mockLatest),
      fetchHistory: vi.fn().mockResolvedValue(mockHistory),
      queryTrends: vi.fn().mockResolvedValue(mockRows),
    });

    const result = await execute({
      selectedLeague: null,
      selectedTeams: [],
      playerSearch: '',
      scoringMode: 'svhld',
    });

    expect(result.rows).toBe(mockRows);
    expect(result.meta.scoring_mode).toBe('svhld');
    expect(result.meta.title).toBe('RP Rankings - SV+HLD');
  });

  it('passes scoringMode to both fetch functions', async () => {
    const fetchLatest = vi.fn().mockResolvedValue(mockLatest);
    const fetchHistory = vi.fn().mockResolvedValue(mockHistory);

    const execute = makeReliefViewExecute({
      fetchLatest,
      fetchHistory,
      queryTrends: vi.fn().mockResolvedValue([]),
    });

    await execute({ selectedLeague: null, selectedTeams: [], playerSearch: '', scoringMode: 'saves' });

    expect(fetchLatest).toHaveBeenCalledWith('saves');
    expect(fetchHistory).toHaveBeenCalledWith('saves');
  });

  it('propagates a fetch error', async () => {
    const execute = makeReliefViewExecute({
      fetchLatest: vi.fn().mockRejectedValue(new Error('Relief list fetch failed (404)')),
      fetchHistory: vi.fn().mockResolvedValue(mockHistory),
      queryTrends: vi.fn(),
    });

    await expect(
      execute({ selectedLeague: null, selectedTeams: [], playerSearch: '', scoringMode: 'svhld' }),
    ).rejects.toThrow('404');
  });
});

// ---------------------------------------------------------------------------
// makeInjuredViewExecute — Injured Pitcher View execute factory
// ---------------------------------------------------------------------------

describe('makeInjuredViewExecute', () => {
  const mockLatest = {
    title: 'Injured Pitchers - Week 18',
    source_urls: { sp: 'https://pitcherlist.com/sp', rp: 'https://pitcherlist.com/rp' },
    scraped_at: '2026-05-02T09:00:00Z',
    rows: [
      {
        rank_when_healthy: 12,
        player_name: 'Tyler Glasnow',
        mlb_team: 'LAD',
        injury_note: 'TJ surgery',
        source_list: 'SP' as const,
      },
    ],
  };

  const mockRows = [
    {
      rank_when_healthy: 12,
      player_name: 'Tyler Glasnow',
      mlb_team: 'LAD',
      injury_note: 'TJ surgery',
      source_list: 'SP' as const,
      fantasy_team: 'Team A',
      league_name: 'Sega Memorial',
    },
  ];

  it('returns rows and meta from fetch + query', async () => {
    const execute = makeInjuredViewExecute({
      fetchLatest: vi.fn().mockResolvedValue(mockLatest),
      queryTrends: vi.fn().mockResolvedValue(mockRows),
    });

    const result = await execute({ selectedLeague: 'Sega Memorial', selectedTeams: [], playerSearch: '' });

    expect(result.rows).toBe(mockRows);
    expect(result.meta).toEqual({
      title: 'Injured Pitchers - Week 18',
      source_urls: { sp: 'https://pitcherlist.com/sp', rp: 'https://pitcherlist.com/rp' },
      scraped_at: '2026-05-02T09:00:00Z',
    });
  });

  it('passes selected league, teams, and search to queryTrends', async () => {
    const queryTrends = vi.fn().mockResolvedValue([]);

    const execute = makeInjuredViewExecute({
      fetchLatest: vi.fn().mockResolvedValue(mockLatest),
      queryTrends,
    });

    await execute({ selectedLeague: 'Sega Memorial', selectedTeams: ['Team A'], playerSearch: 'glasnow' });

    expect(queryTrends).toHaveBeenCalledWith(
      mockLatest.rows,
      'Sega Memorial',
      ['Team A'],
      'glasnow',
    );
  });

  it('passes playerSearch as undefined when empty string', async () => {
    const queryTrends = vi.fn().mockResolvedValue([]);

    const execute = makeInjuredViewExecute({
      fetchLatest: vi.fn().mockResolvedValue(mockLatest),
      queryTrends,
    });

    await execute({ selectedLeague: null, selectedTeams: [], playerSearch: '' });

    const [, , , search] = queryTrends.mock.calls[0];
    expect(search).toBeUndefined();
  });

  it('propagates fetch errors without calling queryTrends', async () => {
    const queryTrends = vi.fn();

    const execute = makeInjuredViewExecute({
      fetchLatest: vi.fn().mockRejectedValue(new Error('Scraper heading mismatch')),
      queryTrends,
    });

    await expect(
      execute({ selectedLeague: null, selectedTeams: [], playerSearch: '' }),
    ).rejects.toThrow('Scraper heading mismatch');

    expect(queryTrends).not.toHaveBeenCalled();
  });

  it('returns empty rows on query error (caller responsibility to catch)', async () => {
    const execute = makeInjuredViewExecute({
      fetchLatest: vi.fn().mockResolvedValue(mockLatest),
      queryTrends: vi.fn().mockRejectedValue(new Error('Ownership query failed')),
    });

    // The execute function propagates errors — useRankingViews catches and sets error state.
    await expect(
      execute({ selectedLeague: null, selectedTeams: [], playerSearch: '' }),
    ).rejects.toThrow('Ownership query failed');
  });
});
