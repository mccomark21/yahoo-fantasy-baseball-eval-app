import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadData } from '@/lib/data-loader';
import {
  getFilterOptions,
  getFantasyTeamsForLeague,
  queryPlayers,
  queryPitcherTrends,
  queryReliefTrends,
  filterByVolume,
  computeZScores,
  type FilterOptions,
  type PlayerRow,
  type PitcherTrendRow,
  type ReliefTrendRow,
  type TimeWindow,
} from '@/lib/queries';
import { FilterBar } from '@/components/FilterBar';
import { PlayerTable } from '@/components/PlayerTable';
import { PitcherTable } from '@/components/PitcherTable';
import { ReliefPitcherTable } from '@/components/ReliefPitcherTable';
import {
  fetchLatestPitcherList,
  fetchLatestReliefList,
  type ReliefScoringMode,
} from '@/lib/pitcherlist-client';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import { Moon, Sun } from 'lucide-react';

type AppStatus = 'loading' | 'ready' | 'error';
type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';

const RELIEF_MODE_BY_LEAGUE_NAME: Array<{ pattern: RegExp; mode: ReliefScoringMode }> = [
  { pattern: /sega memorial fantasy baseball/i, mode: 'saves' },
  { pattern: /league(?:s)?\s+of\s+champions/i, mode: 'svhld' },
];

function getReliefModeForLeague(leagueName: string | null): ReliefScoringMode {
  if (!leagueName) return 'svhld';

  const match = RELIEF_MODE_BY_LEAGUE_NAME.find((entry) => entry.pattern.test(leagueName));
  return match?.mode ?? 'svhld';
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [status, setStatus] = useState<AppStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'hitters' | 'pitchers' | 'relievers'>('hitters');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    leagues: [],
    fantasyTeams: [],
    positions: [],
  });
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [pitchers, setPitchers] = useState<PitcherTrendRow[]>([]);
  const [relievers, setRelievers] = useState<ReliefTrendRow[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [pitcherLoading, setPitcherLoading] = useState(false);
  const [reliefLoading, setReliefLoading] = useState(false);
  const [pitcherError, setPitcherError] = useState<string | null>(null);
  const [reliefError, setReliefError] = useState<string | null>(null);
  const [pitcherMeta, setPitcherMeta] = useState<{
    title: string;
    source_url: string;
    published_at: string | null;
  } | null>(null);
  const [reliefMeta, setReliefMeta] = useState<{
    title: string;
    source_url: string;
    published_at: string | null;
    scoring_mode: ReliefScoringMode;
  } | null>(null);
  const [leagueFantasyTeams, setLeagueFantasyTeams] = useState<string[]>([]);

  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('STD');
  const [selectedPitcherTeams, setSelectedPitcherTeams] = useState<string[]>([]);
  const [selectedReliefTeams, setSelectedReliefTeams] = useState<string[]>([]);

  const defaultsSet = useRef(false);
  const reliefScoringMode = useMemo(
    () => getReliefModeForLeague(selectedLeague),
    [selectedLeague]
  );

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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
            setSelectedPitcherTeams(defaults);
            setSelectedReliefTeams(defaults);
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

  const runPitcherQuery = useCallback(async () => {
    if (status !== 'ready') return;

    setPitcherLoading(true);
    setPitcherError(null);

    try {
      const latest = await fetchLatestPitcherList();
      const joined = await queryPitcherTrends(latest.rows, selectedLeague, selectedPitcherTeams);
      setPitchers(joined);
      setPitcherMeta({
        title: latest.title,
        source_url: latest.source_url,
        published_at: latest.published_at,
      });
    } catch (err) {
      setPitcherError(err instanceof Error ? err.message : String(err));
      setPitchers([]);
    } finally {
      setPitcherLoading(false);
    }
  }, [status, selectedLeague, selectedPitcherTeams]);

  const runReliefQuery = useCallback(async () => {
    if (status !== 'ready') return;

    setReliefLoading(true);
    setReliefError(null);

    try {
      const latest = await fetchLatestReliefList(reliefScoringMode);
      const joined = await queryReliefTrends(latest.rows, selectedLeague, selectedReliefTeams);
      setRelievers(joined);
      setReliefMeta({
        title: latest.title,
        source_url: latest.source_url,
        published_at: latest.published_at,
        scoring_mode: latest.scoring_mode,
      });
    } catch (err) {
      setReliefError(err instanceof Error ? err.message : String(err));
      setRelievers([]);
    } finally {
      setReliefLoading(false);
    }
  }, [status, selectedLeague, selectedReliefTeams, reliefScoringMode]);

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
      setSelectedPitcherTeams(defaults.length > 0 ? defaults : []);
      setSelectedReliefTeams(defaults.length > 0 ? defaults : []);
    } else {
      setLeagueFantasyTeams([]);
      setSelectedTeams([]);
      setSelectedPitcherTeams([]);
      setSelectedReliefTeams([]);
    }
  }, []);

  useEffect(() => {
    if (!defaultsSet.current) return;
    const timer = setTimeout(() => {
      if (viewMode === 'hitters') {
        void runQuery();
        return;
      }
      if (viewMode === 'pitchers') {
        void runPitcherQuery();
        return;
      }
      void runReliefQuery();
    }, 100);
    return () => clearTimeout(timer);
  }, [viewMode, runQuery, runPitcherQuery, runReliefQuery]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-center">
          <div className="text-lg font-medium">Loading Fantasy Baseball Research Data</div>
          <div className="text-sm text-muted-foreground mt-2">
            Initializing DuckDB and fetching data...
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="text-center text-destructive">
          <div className="text-lg font-medium">Failed to load data</div>
          <div className="text-sm mt-2">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh">
      <header className="px-3 py-2 md:px-4 md:py-3 border-b">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg md:text-xl font-semibold tracking-tight">Fantasy Baseball Research</h1>
            <Toggle
              variant="outline"
              size="sm"
              aria-label="Toggle dark mode"
              pressed={theme === 'dark'}
              onPressedChange={(pressed) => setTheme(pressed ? 'dark' : 'light')}
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </Toggle>
          </div>
          <ToggleGroup
            value={[viewMode]}
            onValueChange={(next: string[]) => {
              if (next.length > 0) {
                setViewMode(next[next.length - 1] as 'hitters' | 'pitchers' | 'relievers');
              }
            }}
            className="self-start rounded-lg bg-teal-950 p-0.5"
          >
            <ToggleGroupItem
              value="hitters"
              className="h-9 px-3.5 text-sm font-semibold text-teal-100 aria-pressed:bg-teal-700 aria-pressed:text-white data-[state=on]:bg-teal-700 data-[state=on]:text-white"
            >
              Hitters
            </ToggleGroupItem>
            <ToggleGroupItem
              value="pitchers"
              className="h-9 px-3.5 text-sm font-semibold text-teal-100 aria-pressed:bg-teal-700 aria-pressed:text-white data-[state=on]:bg-teal-700 data-[state=on]:text-white"
            >
              Starts
            </ToggleGroupItem>
            <ToggleGroupItem
              value="relievers"
              className="h-9 px-3.5 text-sm font-semibold text-teal-100 aria-pressed:bg-teal-700 aria-pressed:text-white data-[state=on]:bg-teal-700 data-[state=on]:text-white"
            >
              Relievers
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>
      <FilterBar
        mode={viewMode}
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
        selectedPitcherTeams={selectedPitcherTeams}
        onPitcherTeamsChange={setSelectedPitcherTeams}
        selectedReliefTeams={selectedReliefTeams}
        onReliefTeamsChange={setSelectedReliefTeams}
      />
      {viewMode === 'hitters' ? (
        <PlayerTable data={players} isLoading={queryLoading} />
      ) : viewMode === 'pitchers' ? (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {pitcherError ? (
              <span className="text-destructive">Pitcher List fetch failed: {pitcherError}</span>
            ) : pitcherMeta ? (
              <span>
                {pitcherMeta.title}
                {pitcherMeta.published_at ? ` · Published ${new Date(pitcherMeta.published_at).toLocaleDateString()}` : ''}
                {' · '}
                <a
                  href={pitcherMeta.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Source
                </a>
              </span>
            ) : (
              <span>Loading latest Pitcher List Top 100...</span>
            )}
          </div>
          <PitcherTable data={pitchers} isLoading={pitcherLoading} />
        </>
      ) : (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {reliefError ? (
              <span className="text-destructive">Reliever rankings fetch failed: {reliefError}</span>
            ) : reliefMeta ? (
              <span>
                {reliefMeta.title}
                {` · ${reliefMeta.scoring_mode === 'saves' ? 'Saves-only' : 'SV+HLD'}`}
                {reliefMeta.published_at ? ` · Published ${new Date(reliefMeta.published_at).toLocaleDateString()}` : ''}
                {' · '}
                <a
                  href={reliefMeta.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Source
                </a>
              </span>
            ) : (
              <span>Loading latest reliever rankings...</span>
            )}
          </div>
          <ReliefPitcherTable data={relievers} isLoading={reliefLoading} />
        </>
      )}
    </div>
  );
}
