import { describe, expect, it } from 'vitest';
import {
  buildRankRowsWithTrend,
  buildRankTrendByNormName,
  type RankHistorySnapshot,
  type RankSnapshotRow,
} from '@/lib/rank-trend';
import { normalizePlayerName } from '@/lib/queries';

type TestRankRow = RankSnapshotRow & {
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: 'up' | 'down' | 'flat' | 'new' | 'out';
  notes: string | null;
};

describe('rank trend helpers', () => {
  it('builds normalized trend series and keeps missing weeks as null', () => {
    const latestRows: TestRankRow[] = [
      {
        latest_rank: 5,
        player_name: 'Jose Ramirez',
        mlb_team: 'CLE',
        movement_raw: '+1',
        movement_value: 1,
        trend_direction: 'up',
        notes: null,
      },
    ];

    const historySnapshots: Array<RankHistorySnapshot<TestRankRow>> = [
      {
        snapshot_date: '2026-04-01',
        rows: [
          {
            latest_rank: 12,
            player_name: 'Jose Ramirez',
            mlb_team: 'CLE',
            movement_raw: '-',
            movement_value: null,
            trend_direction: 'flat',
            notes: null,
          },
        ],
      },
      {
        snapshot_date: '2026-04-08',
        rows: [],
      },
    ];

    const trendByNormName = buildRankTrendByNormName(
      latestRows,
      historySnapshots,
      normalizePlayerName,
      8
    );

    const joseTrend = trendByNormName.get(normalizePlayerName('Jose Ramirez'));
    expect(joseTrend).toBeDefined();
    expect(joseTrend?.[0]).toBe(12);
    expect(joseTrend?.[1]).toBeNull();
    expect(joseTrend?.[joseTrend.length - 1]).toBe(5);
  });

  it('joins ranks with ownership and computes trend metrics', () => {
    const ranks: TestRankRow[] = [
      {
        latest_rank: 6,
        player_name: 'Jose Ramirez',
        mlb_team: 'CLE',
        movement_raw: '+2',
        movement_value: 2,
        trend_direction: 'up',
        notes: null,
      },
    ];

    const trendByNormName = new Map<string, (number | null)[]>([
      [normalizePlayerName('Jose Ramirez'), [10, 8, 6]],
    ]);

    const ownerByNormName = new Map([
      [
        normalizePlayerName('Jose Ramirez'),
        {
          fantasy_team: 'Free Agent',
          league_name: 'League of Champions',
        },
      ],
    ]);

    const rows = buildRankRowsWithTrend({
      ranks,
      ownerByNormName,
      trendByNormName,
      normalizePlayerName,
      buildRow: ({ rank, ownership, trendSeries, trendStartRank, trendEndRank, trendNet }) => ({
        player_name: rank.player_name,
        latest_rank: rank.latest_rank,
        fantasy_team: ownership?.fantasy_team ?? null,
        league_name: ownership?.league_name ?? null,
        trend_8w_series: trendSeries,
        trend_start_rank: trendStartRank,
        trend_end_rank: trendEndRank,
        trend_8w_net: trendNet,
      }),
    });

    expect(rows).toEqual([
      {
        player_name: 'Jose Ramirez',
        latest_rank: 6,
        fantasy_team: 'Free Agent',
        league_name: 'League of Champions',
        trend_8w_series: [10, 8, 6],
        trend_start_rank: 10,
        trend_end_rank: 6,
        trend_8w_net: 4,
      },
    ]);
  });
});
