import type { ProspectOwnership } from './query-filter-pipeline';

export interface RankSnapshotRow {
  latest_rank: number;
  player_name: string;
}

export interface RankHistorySnapshot<TRow extends RankSnapshotRow> {
  snapshot_date: string;
  rows: TRow[];
}

function toTimestamp(dateValue: string): number {
  const time = Date.parse(dateValue);
  return Number.isFinite(time) ? time : 0;
}

export function buildRankTrendByNormName<TRow extends RankSnapshotRow>(
  latestRows: TRow[],
  historySnapshots: Array<RankHistorySnapshot<TRow>>,
  normalizePlayerName: (name: string) => string,
  maxPoints = 8
): Map<string, (number | null)[]> {
  const targetNorms = new Set(
    latestRows.map((row) => normalizePlayerName(row.player_name)).filter(Boolean)
  );
  const snapshotsByDate = new Map<string, RankHistorySnapshot<TRow>>();

  for (const snapshot of historySnapshots) {
    if (!snapshot.snapshot_date || !Array.isArray(snapshot.rows)) continue;
    const existing = snapshotsByDate.get(snapshot.snapshot_date);
    if (!existing || snapshot.rows.length >= existing.rows.length) {
      snapshotsByDate.set(snapshot.snapshot_date, snapshot);
    }
  }

  // Ensure the current ranking set is always represented even if history fetch is stale.
  snapshotsByDate.set(new Date().toISOString().slice(0, 10), {
    snapshot_date: new Date().toISOString(),
    rows: latestRows,
  });

  const snapshots = [...snapshotsByDate.values()].sort(
    (a, b) => toTimestamp(a.snapshot_date) - toTimestamp(b.snapshot_date)
  );

  const seriesByNormName = new Map<string, (number | null)[]>();
  for (const normName of targetNorms) {
    seriesByNormName.set(normName, []);
  }

  for (const snapshot of snapshots) {
    const rankByNormName = new Map<string, number>();
    for (const row of snapshot.rows) {
      const normName = normalizePlayerName(row.player_name);
      if (!normName || !targetNorms.has(normName)) continue;
      if (!rankByNormName.has(normName)) {
        rankByNormName.set(normName, row.latest_rank);
      }
    }

    for (const [normName, series] of seriesByNormName.entries()) {
      const rank = rankByNormName.get(normName);
      // Push null for weeks where the player was absent (injured/unranked)
      series.push(rank ?? null);
    }
  }

  for (const [normName, series] of seriesByNormName.entries()) {
    seriesByNormName.set(normName, series.slice(-maxPoints));
  }

  return seriesByNormName;
}

interface BuildRankRowsWithTrendArgs<TRankRow extends RankSnapshotRow, TResult> {
  ranks: TRankRow[];
  ownerByNormName: Map<string, ProspectOwnership>;
  trendByNormName: Map<string, (number | null)[]>;
  normalizePlayerName: (name: string) => string;
  buildRow: (args: {
    rank: TRankRow;
    ownership: ProspectOwnership | undefined;
    trendSeries: (number | null)[];
    trendStartRank: number | null;
    trendEndRank: number | null;
    trendNet: number | null;
  }) => TResult;
}

export function buildRankRowsWithTrend<TRankRow extends RankSnapshotRow, TResult>({
  ranks,
  ownerByNormName,
  trendByNormName,
  normalizePlayerName,
  buildRow,
}: BuildRankRowsWithTrendArgs<TRankRow, TResult>): TResult[] {
  return ranks.map((rank) => {
    const normName = normalizePlayerName(rank.player_name);
    const ownership = ownerByNormName.get(normName);
    const trendSeries = trendByNormName.get(normName) ?? [rank.latest_rank];
    const trendStartRank = trendSeries.find((value) => value != null) ?? null;
    const trendEndRank = [...trendSeries].reverse().find((value) => value != null) ?? null;
    const trendNet =
      trendStartRank != null && trendEndRank != null ? trendStartRank - trendEndRank : null;

    return buildRow({
      rank,
      ownership,
      trendSeries,
      trendStartRank,
      trendEndRank,
      trendNet,
    });
  });
}
