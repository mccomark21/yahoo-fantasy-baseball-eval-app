/**
 * Hitter composite scoring model.
 *
 * Centralises the weight constants, per-metric directions and clamping value
 * used for both the season-to-date composite and the short-window (L7/L14/L30)
 * composites.  Pure functions here are testable without DuckDB.
 */

export type ScoringMetric = 'xwoba' | 'pull_air_pct' | 'bb_k' | 'sb';
export type WindowMetric = ScoringMetric | 'pa';

/**
 * Additive quality-blend weights for the STD composite.
 * PA is NOT included — it acts as a confidence multiplier instead.
 */
export const Z_QUALITY_WEIGHTS: Readonly<Record<ScoringMetric, number>> = {
  xwoba: 0.40,
  pull_air_pct: 0.20,
  bb_k: 0.30,
  sb: 0.10,
} as const;

/**
 * Additive weights for short-window (L7/L14/L30) composites.
 * PA is treated as an additive z-score here because short windows
 * naturally produce lower PA counts for everyone.
 */
export const Z_WINDOW_WEIGHTS: Readonly<Record<WindowMetric, number>> = {
  xwoba: 0.34,
  pull_air_pct: 0.20,
  bb_k: 0.26,
  sb: 0.10,
  pa: 0.10,
} as const;

/** All metrics are positively directed (higher = better). */
export const Z_SCORE_DIRECTIONS: Readonly<Record<WindowMetric, 1 | -1>> = {
  xwoba: 1,
  pull_air_pct: 1,
  bb_k: 1,
  sb: 1,
  pa: 1,
} as const;

/** Maximum absolute z-score; values are clamped to [-Z_CLAMP, +Z_CLAMP]. */
export const Z_CLAMP = 2.5;

export type WindowRawMetrics = {
  xwoba: number | null;
  pull_air_pct: number | null;
  bb_k: number | null;
  sb: number | null;
  pa: number | null;
};

/**
 * Compute a weighted z-score composite for each player over a short time window.
 *
 * @param byNormName Map of normalised player name → raw window metrics
 * @returns Map of normalised player name → composite score (null if no data)
 */
export function computeWindowComposites(
  byNormName: Map<string, WindowRawMetrics>
): Map<string, number | null> {
  const metrics: ReadonlyArray<WindowMetric> = ['xwoba', 'pull_air_pct', 'bb_k', 'sb', 'pa'];
  const allRows = Array.from(byNormName.entries());

  const stats = {} as Record<WindowMetric, { mean: number; std: number }>;
  for (const key of metrics) {
    const vals = allRows.map(([, r]) => r[key]).filter((v): v is number => v != null);
    if (vals.length < 2) {
      stats[key] = { mean: 0, std: 0 };
      continue;
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    stats[key] = { mean, std: Math.sqrt(variance) };
  }

  const result = new Map<string, number | null>();
  for (const [normName, row] of allRows) {
    let weightedSum = 0;
    let weightSum = 0;
    let hasAny = false;
    for (const key of metrics) {
      const val = row[key];
      const { mean, std } = stats[key];
      if (val == null || std === 0) continue;
      const direction = Z_SCORE_DIRECTIONS[key];
      const z = Math.max(-Z_CLAMP, Math.min(Z_CLAMP, direction * ((val - mean) / std)));
      weightedSum += Z_WINDOW_WEIGHTS[key] * z;
      weightSum += Z_WINDOW_WEIGHTS[key];
      hasAny = true;
    }
    result.set(normName, hasAny ? Math.round((weightedSum / weightSum) * 100) / 100 : null);
  }
  return result;
}
