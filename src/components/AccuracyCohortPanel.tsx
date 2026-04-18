import { useMemo, useState } from 'react';
import { buildAccuracyCohort, type AccuracyCohortResult } from '@/lib/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BENCHMARK_PLAYERS = ['Aaron Judge', 'Yordan Alvarez'];

interface AccuracyCohortPanelProps {
  selectedLeague: string | null;
}

function fmtNumber(value: number, digits = 0): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export function AccuracyCohortPanel({ selectedLeague }: AccuracyCohortPanelProps) {
  const [sampleSize, setSampleSize] = useState(12);
  const [randomSeed, setRandomSeed] = useState(20260417);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AccuracyCohortResult | null>(null);

  const cohortCountLabel = useMemo(() => {
    if (!result) return null;
    return `${result.rows.length} tested hitters from ${result.eligible_count} eligible (top 25% BBE volume)`;
  }, [result]);

  const runCohort = async () => {
    setLoading(true);
    setError(null);

    try {
      const nextResult = await buildAccuracyCohort({
        selectedLeague,
        benchmarkPlayers: BENCHMARK_PLAYERS,
        randomSampleSize: sampleSize,
        randomSeed,
      });
      setResult(nextResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="border-b px-3 py-2 md:px-4 md:py-3 bg-muted/20">
      <details>
        <summary className="cursor-pointer select-none text-sm font-medium">
          Accuracy Cohort Test (Top 25% BBE)
        </summary>
        <div className="mt-2 space-y-3">
          <p className="text-xs text-muted-foreground">
            Benchmarks: {BENCHMARK_PLAYERS.join(', ')}. Random players are sampled deterministically from hitters with Season-to-Date BBE at or above the 75th percentile.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Random sample size</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={sampleSize}
                onChange={(e) => setSampleSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="h-8 w-28"
              />
            </label>
            <label className="text-xs">
              <span className="block text-muted-foreground mb-1">Random seed</span>
              <Input
                type="number"
                value={randomSeed}
                onChange={(e) => setRandomSeed(Number(e.target.value) || 0)}
                className="h-8 w-36"
              />
            </label>
            <Button size="sm" onClick={() => void runCohort()} disabled={loading}>
              {loading ? 'Running...' : 'Run Cohort'}
            </Button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {result && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                BBE 75th percentile threshold: <span className="font-mono">{fmtNumber(result.bbe_p75, 1)}</span>
                {' · '}
                {cohortCountLabel}
              </p>
              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5">Player</th>
                      <th className="text-left px-2 py-1.5">Team</th>
                      <th className="text-right px-2 py-1.5">PA</th>
                      <th className="text-right px-2 py-1.5">BBE</th>
                      <th className="text-right px-2 py-1.5">xwOBA</th>
                      <th className="text-right px-2 py-1.5">xwOBA Raw</th>
                      <th className="text-right px-2 py-1.5">xwOBA Num</th>
                      <th className="text-right px-2 py-1.5">xwOBA Denom</th>
                      <th className="text-left px-2 py-1.5">Date Span</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row) => (
                      <tr key={`${row.norm_name}:${row.is_benchmark ? 'bench' : 'sample'}`} className="border-t">
                        <td className="px-2 py-1.5 font-medium">
                          {row.player_name}
                          {row.is_benchmark ? <span className="ml-1 text-[10px] text-teal-700 dark:text-teal-300">Benchmark</span> : null}
                        </td>
                        <td className="px-2 py-1.5">{row.mlb_team}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtNumber(row.pa, 0)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtNumber(row.bbe, 0)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtNumber(row.xwoba, 3)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtNumber(row.xwoba_unrounded, 6)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtNumber(row.xwoba_num, 3)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtNumber(row.xwoba_denom, 3)}</td>
                        <td className="px-2 py-1.5 font-mono">{row.game_date_min} to {row.game_date_max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
