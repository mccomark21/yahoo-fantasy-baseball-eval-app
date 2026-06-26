import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';
import { useIsMobile } from '@/lib/use-mobile';
import type { StreamerMatchup } from '@/lib/cbs-streamer-client';
import type { StreamerViewRow } from '@/lib/queries';

type StreamerKind = 'hitters' | 'pitchers';
type StreamerSortKey = 'priority' | 'player_name' | 'games' | 'fantasy_team';

interface StreamerTableProps {
  data: StreamerViewRow[];
  isLoading: boolean;
  kind: StreamerKind;
}

// Stable abbreviated weekday + day-of-month, e.g. "Tue 24". Dates arrive as
// 'YYYY-MM-DD'; render in UTC so the calendar day never drifts by timezone.
function formatGameDay(date: string | null): string | null {
  if (!date) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function getSortValue(row: StreamerViewRow, key: StreamerSortKey): number | string {
  if (key === 'games') return row.games;
  if (key === 'fantasy_team') return row.fantasy_team ?? 'zzzz';
  return row.player_name;
}

function rowKeyOf(row: StreamerViewRow): string {
  return `${row.player_name}-${row.mlb_team ?? ''}`;
}

function RosterBadge({ fantasyTeam }: { fantasyTeam: string | null }) {
  if (fantasyTeam) {
    return (
      <span className="inline-flex items-center rounded-sm bg-navy-mid px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-white">
        {fantasyTeam}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-sm border border-border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
      FA
    </span>
  );
}

// The hero column: each game this week as a compact chip. "@DET" / "vs BOS"
// carries the home/away signal as a text label (never colour alone), the day
// sits beneath in muted mono. Falls back to opponent-only when the schedule
// lookup couldn't date the game.
function MatchupList({ matchups }: { matchups: StreamerMatchup[] }) {
  if (matchups.length === 0) {
    return <span className="text-xs text-muted-foreground">No games listed</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {matchups.map((matchup, index) => {
        const day = formatGameDay(matchup.date);
        return (
          <span
            key={`${matchup.opponent}-${index}`}
            className="inline-flex flex-col items-center rounded-sm border border-border bg-surface px-1.5 py-1 leading-none"
          >
            <span className="font-mono text-xs font-medium text-foreground">
              <span className="text-muted-foreground">{matchup.home ? 'vs ' : '@ '}</span>
              {matchup.opponent}
            </span>
            {day ? (
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{day}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function TwoStartBadge() {
  return (
    <span className="inline-flex items-center rounded-sm bg-surface-header px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-mlb-red">
      2 Start
    </span>
  );
}

export function StreamerTable({ data, isLoading, kind }: StreamerTableProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<StreamerSortKey>('priority');
  const [sortDesc, setSortDesc] = useState(false);
  const noun = kind === 'hitters' ? 'hitters' : 'pitchers';

  const sortedData = useMemo(() => {
    // 'priority' preserves the query order (two-start arms first, then most
    // games) — the order a streaming manager actually wants to scan.
    if (sortKey === 'priority') return data;
    const rows = [...data];
    rows.sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv);
        return sortDesc ? -cmp : cmp;
      }
      const cmp = Number(av) - Number(bv);
      return sortDesc ? -cmp : cmp;
    });
    return rows;
  }, [data, sortKey, sortDesc]);

  const setSort = (key: StreamerSortKey) => {
    if (key === sortKey) {
      setSortDesc((v) => !v);
      return;
    }
    setSortKey(key);
    setSortDesc(key === 'games');
  };

  const sortIcon = (key: StreamerSortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />;
    return sortDesc ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        Loading streaming {noun}...
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        {sortedData.length > 0 ? (
          sortedData.map((row) => (
            <div key={rowKeyOf(row)} className="border-b px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.player_name}</span>
                    {row.two_start ? <TwoStartBadge /> : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {row.mlb_team ?? '—'}
                    {row.positions.length > 0 ? ` · ${row.positions.join('/')}` : ''}
                    {` · ${row.games} ${row.games === 1 ? 'game' : 'games'}`}
                  </div>
                </div>
                <RosterBadge fantasyTeam={row.fantasy_team} />
              </div>
              <div className="mt-2">
                <MatchupList matchups={row.matchups} />
              </div>
              {row.blurb ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.blurb}</p>
              ) : null}
            </div>
          ))
        ) : (
          <div className="p-8">
            <EmptyState hint="Try clearing the Fantasy Team filter." />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('player_name')}>
                <div className="flex items-center gap-1">
                  {kind === 'hitters' ? 'Hitter' : 'Pitcher'} {sortIcon('player_name')}
                </div>
              </TableHead>
              <TableHead>MLB</TableHead>
              <TableHead>This Week</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('games')}>
                <div className="flex items-center gap-1">{kind === 'hitters' ? 'G' : 'Starts'} {sortIcon('games')}</div>
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => setSort('fantasy_team')}>
                <div className="flex items-center gap-1">Fantasy Team {sortIcon('fantasy_team')}</div>
              </TableHead>
              <TableHead className="min-w-[20rem]">Outlook</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.length > 0 ? (
              sortedData.map((row) => (
                <TableRow key={rowKeyOf(row)} className="align-top">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{row.player_name}</span>
                      {row.two_start ? <TwoStartBadge /> : null}
                    </div>
                    {row.positions.length > 0 ? (
                      <span className="text-xs text-muted-foreground">{row.positions.join('/')}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{row.mlb_team ?? '—'}</TableCell>
                  <TableCell>
                    <MatchupList matchups={row.matchups} />
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">{row.games}</TableCell>
                  <TableCell>
                    <RosterBadge fantasyTeam={row.fantasy_team} />
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal text-xs leading-5 text-muted-foreground">
                    {row.blurb ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <EmptyState hint="Try clearing the Fantasy Team filter." />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4 py-2 text-sm text-muted-foreground">
        Showing {sortedData.length} streaming {noun}
      </div>
    </div>
  );
}
