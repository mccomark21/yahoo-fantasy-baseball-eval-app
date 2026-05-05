import { describe, expect, it } from 'vitest';
import { computeWindowComposites, type WindowRawMetrics } from '@/lib/hitter-composite-scorer';

describe('computeWindowComposites', () => {
  it('returns null for all players when fewer than two data points exist', () => {
    const input = new Map<string, WindowRawMetrics>([
      ['player a', { xwoba: 0.35, pull_air_pct: 15, bb_k: 0.4, sb: 2, pa: 30 }],
    ]);
    const result = computeWindowComposites(input);
    expect(result.get('player a')).toBeNull();
  });

  it('scores the better performer higher with two comparable players', () => {
    const input = new Map<string, WindowRawMetrics>([
      ['elite hitter', { xwoba: 0.42, pull_air_pct: 25, bb_k: 0.6, sb: 5, pa: 50 }],
      ['below avg hitter', { xwoba: 0.28, pull_air_pct: 8, bb_k: 0.2, sb: 0, pa: 20 }],
    ]);
    const result = computeWindowComposites(input);
    const elite = result.get('elite hitter') ?? -Infinity;
    const below = result.get('below avg hitter') ?? Infinity;
    expect(elite).toBeGreaterThan(below);
  });

  it('clamps extreme z-scores and returns a finite composite', () => {
    const input = new Map<string, WindowRawMetrics>([
      ['outlier', { xwoba: 1.0, pull_air_pct: 100, bb_k: 10, sb: 100, pa: 200 }],
      ['baseline', { xwoba: 0.0, pull_air_pct: 0, bb_k: 0, sb: 0, pa: 0 }],
    ]);
    const result = computeWindowComposites(input);
    const outlierScore = result.get('outlier');
    expect(outlierScore).not.toBeNull();
    expect(Number.isFinite(outlierScore)).toBe(true);
    expect(outlierScore).toBeLessThanOrEqual(2.5);
  });

  it('returns null for a player with all-null metrics', () => {
    const input = new Map<string, WindowRawMetrics>([
      ['no data', { xwoba: null, pull_air_pct: null, bb_k: null, sb: null, pa: null }],
      ['has data', { xwoba: 0.35, pull_air_pct: 12, bb_k: 0.4, sb: 1, pa: 30 }],
    ]);
    const result = computeWindowComposites(input);
    expect(result.get('no data')).toBeNull();
    expect(result.get('has data')).toBeNull(); // only one non-null row → std=0 for all metrics
  });
});
