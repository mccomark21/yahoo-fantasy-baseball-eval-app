import { describe, expect, it } from 'vitest';
import {
  computeProspectMomentum,
  computeProspectTrend,
  getProspectRole,
} from '@/lib/prospect-trend';
import type { ProspectMinorLeagueStats, ProspectRow, ProspectStatsWindow } from '@/lib/queries';

const EMPTY_STATS: ProspectMinorLeagueStats = {
  atBats: null,
  avg: null,
  homeRuns: null,
  rbi: null,
  runs: null,
  stolenBases: null,
  strikeOuts: null,
  ops: null,
  obp: null,
  slg: null,
  era: null,
  whip: null,
  strikeoutsPer9: null,
  walksPer9: null,
  wins: null,
  saves: null,
  holds: null,
  inningsPitched: null,
};

function hitterWindow(atBats: number, ops: number): ProspectMinorLeagueStats {
  return { ...EMPTY_STATS, atBats, ops };
}

function pitcherWindow(inningsPitched: number, era: number, whip: number, k9: number): ProspectMinorLeagueStats {
  return { ...EMPTY_STATS, inningsPitched, era, whip, strikeoutsPer9: k9 };
}

function buildRow(
  positions: string,
  windows: Partial<Record<ProspectStatsWindow, ProspectMinorLeagueStats>>
): ProspectRow {
  const minor_league_stats: Record<ProspectStatsWindow, ProspectMinorLeagueStats> = {
    STD: windows.STD ?? EMPTY_STATS,
    L7: windows.L7 ?? EMPTY_STATS,
    L14: windows.L14 ?? EMPTY_STATS,
    L30: windows.L30 ?? EMPTY_STATS,
  };

  return {
    player_name: 'Test Prospect',
    norm_name: 'test prospect',
    organization: 'LAD',
    positions,
    is_rostered: false,
    fantasy_team: null,
    league_name: null,
    mlb_rank: null,
    fangraphs_rank: null,
    prospects_live_rank: null,
    fantrax_rank: null,
    pitcherlist_rank: null,
    tjstats_rank: null,
    average_rank: 50,
    highest_rank: 40,
    lowest_rank: 60,
    stddev_rank: 5,
    best_rank_bias_score: 10,
    age: 21,
    eta: '2027',
    level: 'AA',
    height: null,
    weight: null,
    bats: null,
    throws: null,
    fv: null,
    ofp: null,
    player_summary: null,
    stats_summary: null,
    scouting_report: null,
    notes: null,
    minor_league_stats,
  };
}

const emojis = (combined: string) => combined.split(' ');

describe('getProspectRole', () => {
  it('classifies hitters, pitchers, and two-way prospects', () => {
    expect(getProspectRole(buildRow('SS', {}))).toBe('hitter');
    expect(getProspectRole(buildRow('SP', {}))).toBe('pitcher');
    expect(getProspectRole(buildRow('RHP', {}))).toBe('pitcher');
    expect(getProspectRole(buildRow('1B/SP', {}))).toBe('two_way');
    expect(getProspectRole(buildRow('', {}))).toBe('unknown');
  });
});

describe('computeProspectTrend — disjoint windows', () => {
  it('a single hot week no longer flashes all three slices', () => {
    // 30 hot AB in the last week; nothing meaningful before that. Under the old
    // cumulative logic this hot week was contained in L7, L14 and L30 alike.
    const row = buildRow('OF', {
      L7: hitterWindow(30, 1.2),
      L14: hitterWindow(30, 1.2),
      L30: hitterWindow(30, 1.2),
    });

    const [recent, mid, old] = emojis(computeProspectTrend(row).emoji);
    expect(recent).toBe('🔥');
    // Days 8–14 and 15–30 have zero marginal volume → neutral, not fire.
    expect(mid).toBe('➖');
    expect(old).toBe('➖');
  });

  it('de-aggregates a cold prior stretch hidden inside a hot cumulative L30', () => {
    // Recent week red-hot, but the earlier 23 days were ice cold. The L30
    // aggregate still looks fine; the disjoint `old` slice exposes the slump.
    // L7: 25 AB @ 1.300 ; L14: 50 AB @ 1.000 -> mid 25 AB @ .700 (neutral)
    // L30: 100 AB @ .700 -> old 50 AB @ .400 (ice)
    const row = buildRow('OF', {
      L7: hitterWindow(25, 1.3),
      L14: hitterWindow(50, 1.0),
      L30: hitterWindow(100, 0.7),
    });

    const [recent, mid, old] = emojis(computeProspectTrend(row).emoji);
    expect(recent).toBe('🔥');
    expect(mid).toBe('➖');
    expect(old).toBe('🧊');
  });

  it('shrinkage pulls a thin hot sample back to neutral', () => {
    // Just over the recent AB floor but a tiny sample: shrinkage toward .700
    // keeps it from reaching the .900 fire line.
    const row = buildRow('OF', {
      L7: hitterWindow(11, 0.95),
      L14: hitterWindow(11, 0.95),
      L30: hitterWindow(11, 0.95),
    });
    // adjusted = .700 + (.95-.700)*(11/(11+25)) = .700 + .25*0.3056 = .776 < .900
    expect(emojis(computeProspectTrend(row).emoji)[0]).toBe('➖');

    // A larger sample at the same OPS clears the fire line.
    const bigSample = buildRow('OF', {
      L7: hitterWindow(120, 0.95),
      L14: hitterWindow(120, 0.95),
      L30: hitterWindow(120, 0.95),
    });
    // adjusted = .700 + .25*(120/145) = .907 >= .900
    expect(emojis(computeProspectTrend(bigSample).emoji)[0]).toBe('🔥');
  });

  it('renders neutral when a slice is below its marginal volume floor', () => {
    const row = buildRow('OF', {
      L7: hitterWindow(5, 1.4), // below recent floor of 10 AB
    });
    expect(emojis(computeProspectTrend(row).emoji)[0]).toBe('➖');
  });

  it('treats non-nested feed noise (inner ≥ outer volume) as neutral', () => {
    // L14 reports fewer AB than L7 — impossible for true nested windows.
    const row = buildRow('OF', {
      L7: hitterWindow(40, 1.2),
      L14: hitterWindow(30, 1.1),
      L30: hitterWindow(80, 0.9),
    });
    const [recent, mid] = emojis(computeProspectTrend(row).emoji);
    expect(recent).toBe('🔥');
    expect(mid).toBe('➖'); // marginal volume <= 0 → neutral
  });

  it('recency-weighted sort ranks a hot recent slice above a hot old slice', () => {
    const hotRecent = buildRow('OF', {
      L7: hitterWindow(40, 1.2),
      L14: hitterWindow(40, 1.2),
      L30: hitterWindow(40, 1.2),
    });
    const hotOld = buildRow('OF', {
      L7: hitterWindow(0, 0),
      L14: hitterWindow(0, 0),
      L30: hitterWindow(60, 1.2),
    });
    expect(computeProspectTrend(hotRecent).sortScore).toBeGreaterThan(
      computeProspectTrend(hotOld).sortScore
    );
  });

  it('scores pitchers off the composite metric', () => {
    // Dominant recent line: low ERA/WHIP, high K/9 → high composite score.
    const row = buildRow('SP', {
      L7: pitcherWindow(7, 1.5, 0.8, 12),
      L14: pitcherWindow(7, 1.5, 0.8, 12),
      L30: pitcherWindow(7, 1.5, 0.8, 12),
    });
    expect(emojis(computeProspectTrend(row).emoji)[0]).toBe('🔥');
  });
});

describe('computeProspectMomentum — last 30 days vs rest of season', () => {
  it('flags improvement when the last 30 days beats the rest of the season', () => {
    // recent L30: 90 AB @ 1.000 ; baseline (STD − L30) = 90 AB @ .600
    const row = buildRow('OF', {
      L30: hitterWindow(90, 1.0),
      STD: hitterWindow(180, 0.8), // (1.0*90 + .6*90)/180
    });
    const result = computeProspectMomentum(row);
    expect(result.hasData).toBe(true);
    expect(result.emoji).toBe('⬆️');
    expect(result.sortScore).toBeGreaterThan(0);
    expect(result.deltaText).toBe('+0.400'); // 1.000 − .600
  });

  it('flags decline when the last 30 days drops below the rest of the season', () => {
    const row = buildRow('OF', {
      L30: hitterWindow(90, 0.5),
      STD: hitterWindow(180, 0.65), // baseline 90 AB @ .800
    });
    const result = computeProspectMomentum(row);
    expect(result.emoji).toBe('⬇️');
    expect(result.sortScore).toBeLessThan(0);
  });

  it('reads steady when the delta is within the step threshold', () => {
    const row = buildRow('OF', {
      L30: hitterWindow(90, 0.72),
      STD: hitterWindow(180, 0.715), // baseline .710, ΔOPS .010 < .100
    });
    expect(computeProspectMomentum(row).emoji).toBe('➡️');
  });

  it('returns no-data when either half is below the volume floor', () => {
    const thinRecent = buildRow('OF', {
      L30: hitterWindow(5, 1.2),
      STD: hitterWindow(65, 0.7),
    });
    const result = computeProspectMomentum(thinRecent);
    expect(result.hasData).toBe(false);
    expect(result.emoji).toBe('—');
    expect(result.sortScore).toBe(Number.NEGATIVE_INFINITY);

    const thinBaseline = buildRow('OF', {
      L30: hitterWindow(90, 1.2),
      STD: hitterWindow(94, 1.1), // baseline only 4 AB
    });
    expect(computeProspectMomentum(thinBaseline).hasData).toBe(false);
  });

  it('normalizes hitter and pitcher momentum onto a comparable sort scale', () => {
    // ΔOPS +.150 / step .075 = 2.0
    const hitter = buildRow('OF', {
      L30: hitterWindow(90, 0.85),
      STD: hitterWindow(180, 0.775), // baseline 90 AB @ .700, Δ = +.150
    });
    expect(computeProspectMomentum(hitter).sortScore).toBeCloseTo(2.0, 1);
  });
});
