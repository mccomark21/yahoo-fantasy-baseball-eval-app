import { describe, expect, it } from 'vitest';
import {
  assembleAccuracyCohort,
  normalizePlayerName,
  type AccuracyCohortEligibleRow,
} from '@/lib/queries';

function makeEligibleRow(playerName: string, bbe: number): AccuracyCohortEligibleRow {
  return {
    player_name: playerName,
    mlb_team: 'TST',
    norm_name: normalizePlayerName(playerName),
    pa: 200,
    bbe,
    xwoba: 0.35,
    xwoba_unrounded: 0.34991,
    xwoba_num: 70,
    xwoba_denom: 200,
    game_date_min: '2026-03-28',
    game_date_max: '2026-04-19',
  };
}

describe('assembleAccuracyCohort', () => {
  const eligibleRows: AccuracyCohortEligibleRow[] = [
    makeEligibleRow('Mason Price', 60),
    makeEligibleRow('Ike Wynn', 58),
    makeEligibleRow('Zane Soto', 57),
    makeEligibleRow('Liam Cole', 56),
    makeEligibleRow('Noah Kent', 55),
    makeEligibleRow('Evan Hart', 54),
  ];

  it('keeps arbitrary benchmark players and sorts benchmarks first', () => {
    const result = assembleAccuracyCohort(eligibleRows, 55, ['Zane Soto', 'Ike Wynn'], 2, 12345);

    expect(result.bbe_p75).toBe(55);
    expect(result.eligible_count).toBe(eligibleRows.length);

    const benchmarkRows = result.rows.filter((row) => row.is_benchmark);
    expect(benchmarkRows.map((row) => row.player_name)).toEqual(['Ike Wynn', 'Zane Soto']);
  });

  it('throws when any requested benchmark is missing from eligible pool', () => {
    expect(() =>
      assembleAccuracyCohort(eligibleRows, 55, ['Ike Wynn', 'Not In Pool'], 2, 12345)
    ).toThrowError('Benchmark player(s) not in top 25% BBE eligibility pool: Not In Pool');
  });

  it('is deterministic for same seed and can differ across seeds', () => {
    const baseSeed = 20260417;
    const runA = assembleAccuracyCohort(eligibleRows, 55, ['Ike Wynn'], 3, baseSeed);
    const runB = assembleAccuracyCohort(eligibleRows, 55, ['Ike Wynn'], 3, baseSeed);

    const sampledA = runA.rows.filter((row) => !row.is_benchmark).map((row) => row.player_name);
    const sampledB = runB.rows.filter((row) => !row.is_benchmark).map((row) => row.player_name);

    expect(sampledA).toEqual(sampledB);

    let foundDifferentSeed = false;
    for (let offset = 1; offset <= 32; offset += 1) {
      const sampledAlt = assembleAccuracyCohort(
        eligibleRows,
        55,
        ['Ike Wynn'],
        3,
        baseSeed + offset
      )
        .rows.filter((row) => !row.is_benchmark)
        .map((row) => row.player_name);
      if (JSON.stringify(sampledAlt) !== JSON.stringify(sampledA)) {
        foundDifferentSeed = true;
        break;
      }
    }

    expect(foundDifferentSeed).toBe(true);
  });

  it('clamps sample size to available non-benchmark players', () => {
    const result = assembleAccuracyCohort(eligibleRows, 55, ['Ike Wynn', 'Zane Soto'], 99, 9876);
    const sampleRows = result.rows.filter((row) => !row.is_benchmark);

    expect(sampleRows).toHaveLength(eligibleRows.length - 2);
  });
});
