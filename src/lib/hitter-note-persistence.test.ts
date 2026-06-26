import { describe, expect, it } from 'vitest';
import { buildLatestNoteByNormName, normalizePlayerName } from '@/lib/queries';
import type { HitterListHistorySnapshot, PitcherListRankRow } from '@/lib/pitcherlist-client';

function row(
  rank: number,
  name: string,
  notes: string | null = null
): PitcherListRankRow {
  return {
    latest_rank: rank,
    player_name: name,
    mlb_team: null,
    movement_raw: '-',
    movement_value: 0,
    trend_direction: 'flat',
    notes,
  };
}

function snapshot(date: string, rows: PitcherListRankRow[]): HitterListHistorySnapshot {
  return {
    title: `Top 150 Hitters ${date}`,
    source_url: 'https://pitcherlist.com/example',
    published_at: `${date}T12:00:00Z`,
    scraped_at: `${date}T12:00:00Z`,
    snapshot_date: date,
    rows,
  };
}

describe('buildLatestNoteByNormName', () => {
  it('keeps an older note (with its date) until a newer one appears', () => {
    const snapshots: HitterListHistorySnapshot[] = [
      // Oldest week: Soto has a note, Judge does not.
      snapshot('2026-06-04', [row(1, 'Juan Soto', 'Heating up after a cold April.'), row(2, 'Aaron Judge')]),
      // Newer week: neither carries a fresh note — Soto's old note should survive.
      snapshot('2026-06-11', [row(1, 'Juan Soto'), row(2, 'Aaron Judge')]),
    ];

    const map = buildLatestNoteByNormName(snapshots, normalizePlayerName);

    expect(map.get(normalizePlayerName('Juan Soto'))).toEqual({
      note: 'Heating up after a cold April.',
      date: '2026-06-04',
    });
    // Judge never had a note anywhere, so he is absent.
    expect(map.has(normalizePlayerName('Aaron Judge'))).toBe(false);
  });

  it('lets the newest note supersede an older one', () => {
    const snapshots: HitterListHistorySnapshot[] = [
      snapshot('2026-06-04', [row(1, 'Juan Soto', 'Old take from two weeks ago.')]),
      snapshot('2026-06-18', [row(1, 'Juan Soto', 'Fresh take this week.')]),
    ];

    const map = buildLatestNoteByNormName(snapshots, normalizePlayerName);

    expect(map.get(normalizePlayerName('Juan Soto'))).toEqual({
      note: 'Fresh take this week.',
      date: '2026-06-18',
    });
  });

  it('ignores empty / whitespace-only notes', () => {
    const snapshots: HitterListHistorySnapshot[] = [
      snapshot('2026-06-04', [row(1, 'Juan Soto', 'Real note.')]),
      snapshot('2026-06-18', [row(1, 'Juan Soto', '   ')]),
    ];

    const map = buildLatestNoteByNormName(snapshots, normalizePlayerName);

    // The blank newest note does not clobber the real older one.
    expect(map.get(normalizePlayerName('Juan Soto'))).toEqual({
      note: 'Real note.',
      date: '2026-06-04',
    });
  });

  it('is resilient to unsorted snapshot input', () => {
    const snapshots: HitterListHistorySnapshot[] = [
      snapshot('2026-06-11', [row(1, 'Juan Soto', 'Middle week note.')]),
      snapshot('2026-06-18', [row(1, 'Juan Soto', 'Newest note.')]),
      snapshot('2026-06-04', [row(1, 'Juan Soto', 'Oldest note.')]),
    ];

    const map = buildLatestNoteByNormName(snapshots, normalizePlayerName);

    expect(map.get(normalizePlayerName('Juan Soto'))).toEqual({
      note: 'Newest note.',
      date: '2026-06-18',
    });
  });
});
