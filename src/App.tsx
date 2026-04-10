import { useCallback, useEffect, useRef, useState } from 'react';
import { loadData } from '@/lib/data-loader';
import {
  getFilterOptions,
  getFantasyTeamsForLeague,
  queryPlayers,
  filterByVolume,
  computeZScores,
  type FilterOptions,
  type PlayerRow,
  type TimeWindow,
} from '@/lib/queries';
import { FilterBar } from '@/components/FilterBar';
import { PlayerTable } from '@/components/PlayerTable';

type AppStatus = 'loading' | 'ready' | 'error';

export default function App() {
  const [status, setStatus] = useState<AppStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    leagues: [],
    fantasyTeams: [],
    positions: [],
  });
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [leagueFantasyTeams, setLeagueFantasyTeams] = useState<string[]>([]);

  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('STD');

  const defaultsSet = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        await loadData();
        const opts = await getFilterOptions();
        setFilterOptions(opts);

        if (opts.leagues.length > 0) {
          const firstLeague = opts.leagues[0];
          setSelectedLeague(firstLeague);

          const teams = await getFantasyTeamsForLeague(firstLeague);
          setLeagueFantasyTeams(teams);

          const defaults = teams.filter(
            (t) =>
              t.toLowerCase().includes('free agent') ||
              t.toLowerCase().includes('waiver')
          );
          if (defaults.length > 0) {
            setSelectedTeams(defaults);
          }
        }
        defaultsSet.current = true;

        setStatus('ready');
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    })();
  }, []);

  const runQuery = useCallback(async () => {
    if (status !== 'ready') return;
    setQueryLoading(true);
    try {
      const rows = await queryPlayers(
        timeWindow,
        selectedLeague,
        selectedTeams,
        selectedPositions
      );
      const unmatchedCount = rows.filter((r) => r.pa == null && r.bbe == null).length;
      console.log(
        `[query] ${rows.length} players returned, ${unmatchedCount} with no game log match`
      );
      const filtered = filterByVolume(rows);
      console.log(
        `[filter] ${filtered.length} players after volume filter (${rows.length - filtered.length} removed)`
      );
      setPlayers(computeZScores(filtered));
    } catch (err) {
      console.error('Query failed:', err);
    } finally {
      setQueryLoading(false);
    }
  }, [status, timeWindow, selectedLeague, selectedTeams, selectedPositions]);

  const handleLeagueChange = useCallback(async (league: string | null) => {
    setSelectedLeague(league);
    if (league) {
      const teams = await getFantasyTeamsForLeague(league);
      setLeagueFantasyTeams(teams);
      const defaults = teams.filter(
        (t) =>
          t.toLowerCase().includes('free agent') ||
          t.toLowerCase().includes('waiver')
      );
      setSelectedTeams(defaults.length > 0 ? defaults : []);
    } else {
      setLeagueFantasyTeams([]);
      setSelectedTeams([]);
    }
  }, []);

  useEffect(() => {
    if (!defaultsSet.current) return;
    const timer = setTimeout(runQuery, 100);
    return () => clearTimeout(timer);
  }, [runQuery]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg font-medium">Loading Fantasy Baseball Data</div>
          <div className="text-sm text-muted-foreground mt-2">
            Initializing DuckDB and fetching data...
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center text-destructive">
          <div className="text-lg font-medium">Failed to load data</div>
          <div className="text-sm mt-2">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-3 border-b">
        <h1 className="text-xl font-semibold">Fantasy Baseball Eval</h1>
      </header>
      <FilterBar
        filterOptions={filterOptions}
        leagueFantasyTeams={leagueFantasyTeams}
        selectedLeague={selectedLeague}
        onLeagueChange={handleLeagueChange}
        selectedTeams={selectedTeams}
        onTeamsChange={setSelectedTeams}
        selectedPositions={selectedPositions}
        onPositionsChange={setSelectedPositions}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
      />
      <PlayerTable data={players} isLoading={queryLoading} />
    </div>
  );
}
