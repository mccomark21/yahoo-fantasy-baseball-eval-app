import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLoadData } from '@/lib/data-source';
import {
  getFilterOptions,
  getFantasyTeamsForLeague,
  queryInjuredPitchers,
  queryPlayers,
  queryPitcherTrends,
  queryReliefTrends,
  queryProspects,
  filterByVolume,
  computeZScores,
  type FilterOptions,
  type InjuredPitcherTrendRow,
  type PlayerRow,
  type PitcherTrendRow,
  type ReliefTrendRow,
  type ProspectRow,
} from '@/lib/queries';
import {
  defaultHitterFilters,
  defaultInjuredFilters,
  defaultPitcherFilters,
  defaultProspectFilters,
  defaultReliefFilters,
  type ViewFilters,
  type HitterFilters,
  type PitcherFilters,
  type ReliefFilters,
  type InjuredFilters,
  type ProspectFilters,
} from '@/lib/view-filter-state';
import { FilterBar } from '@/components/FilterBar';
import { PlayerTable } from '@/components/PlayerTable';
import { PitcherTable } from '@/components/PitcherTable';
import { ReliefPitcherTable } from '@/components/ReliefPitcherTable';
import { InjuredPitcherTable } from '@/components/InjuredPitcherTable';
import { ProspectTable } from '@/components/ProspectTable';
import {
  fetchLatestInjuredPitchers,
  fetchLatestPitcherList,
  fetchPitcherListHistory,
  fetchLatestReliefList,
  fetchReliefListHistory,
  type ReliefScoringMode,
} from '@/lib/pitcherlist-client';
import { fetchLatestProspects, type ProspectSourceStatus } from '@/lib/prospects-client';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
import { Moon, Sun } from 'lucide-react';
import { getDefaultRosterTeams } from '@/lib/fantasy-teams';
import { useAsyncTask } from '@/lib/use-async-task';
import {
  runManagedViewQuery,
  scheduleActiveViewQuery,
  type ViewMode,
} from '@/lib/view-orchestration';


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
  const { status, error } = useLoadData();
  const [viewMode, setViewMode] = useState<ViewMode>('hitters');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    leagues: [],
    fantasyTeams: [],
    positions: [],
  });
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [pitchers, setPitchers] = useState<PitcherTrendRow[]>([]);
  const [relievers, setRelievers] = useState<ReliefTrendRow[]>([]);
  const [injuredPitchers, setInjuredPitchers] = useState<InjuredPitcherTrendRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
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
  const [injuredMeta, setInjuredMeta] = useState<{
    title: string;
    source_urls: { sp: string; rp: string };
    scraped_at: string;
  } | null>(null);
  const [prospectsMeta, setProspectsMeta] = useState<{
    title: string;
    scraped_at: string;
    sources: ProspectSourceStatus[];
  } | null>(null);
  const [leagueFantasyTeams, setLeagueFantasyTeams] = useState<string[]>([]);

  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [hitterFilters, setHitterFilters] = useState<HitterFilters>(defaultHitterFilters);
  const [pitcherFilters, setPitcherFilters] = useState<PitcherFilters>(defaultPitcherFilters);
  const [reliefFilters, setReliefFilters] = useState<ReliefFilters>(defaultReliefFilters);
  const [injuredFilters, setInjuredFilters] = useState<InjuredFilters>(defaultInjuredFilters);
  const [prospectFilters, setProspectFilters] = useState<ProspectFilters>(defaultProspectFilters);

  const filtersByMode = useMemo<Record<string, ViewFilters>>(() => ({
    hitters: hitterFilters,
    pitchers: pitcherFilters,
    relievers: reliefFilters,
    injured: injuredFilters,
    prospects: prospectFilters,
  }), [hitterFilters, pitcherFilters, reliefFilters, injuredFilters, prospectFilters]);

  const activeFilters = filtersByMode[viewMode];

  const handleFiltersChange = useCallback((updated: ViewFilters) => {
    switch (updated.mode) {
      case 'hitters': setHitterFilters(updated as HitterFilters); break;
      case 'pitchers': setPitcherFilters(updated as PitcherFilters); break;
      case 'relievers': setReliefFilters(updated as ReliefFilters); break;
      case 'injured': setInjuredFilters(updated as InjuredFilters); break;
      case 'prospects': setProspectFilters(updated as ProspectFilters); break;
    }
  }, []);
  const [prospectAgeOptions, setProspectAgeOptions] = useState<number[]>([]);
  const [prospectLevelOptions, setProspectLevelOptions] = useState<string[]>([]);
  const [prospectPositions, setProspectPositions] = useState<string[]>([]);
  const [searchDraft, setSearchDraft] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const {
    loading: pitcherLoading,
    error: pitcherError,
    run: runPitcherTask,
  } = useAsyncTask();
  const {
    loading: reliefLoading,
    error: reliefError,
    run: runReliefTask,
  } = useAsyncTask();
  const {
    loading: injuredLoading,
    error: injuredError,
    run: runInjuredTask,
  } = useAsyncTask();
  const {
    loading: prospectLoading,
    error: prospectError,
    run: runProspectTask,
  } = useAsyncTask();

  const defaultsSet = useRef(false);
  const reliefScoringMode = useMemo(
    () => getReliefModeForLeague(selectedLeague),
    [selectedLeague]
  );
  const applyDefaultTeamSelections = useCallback(
    (league: string, teams: string[]) => {
      const defaults = getDefaultRosterTeams(teams);
      const nextTeamSelection = defaults.length > 0 ? defaults : [];

      setHitterFilters((f) => ({ ...f, selectedTeams: nextTeamSelection }));
      setPitcherFilters((f) => ({ ...f, selectedTeams: nextTeamSelection }));
      setReliefFilters((f) => ({ ...f, selectedTeams: nextTeamSelection }));
      // Injured tab intentionally shows all teams by default — injured pitchers are
      // typically rostered, so applying the Free Agent default would hide all results.
      setInjuredFilters((f) => ({ ...f, selectedTeams: [] }));
      setProspectFilters((f) => ({ ...f, selectedTeams: nextTeamSelection }));

      if (defaults.length > 0) {
        console.log(
          `[filters:league] Applied default roster focus for ${league}: ${defaults.length}/${teams.length} teams`
        );
      } else {
        console.log(`[filters:league] No default roster teams found for ${league}`);
      }
    },
    []
  );

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (status !== 'ready') return;
    (async () => {
      try {
        const opts = await getFilterOptions();
        setFilterOptions(opts);

        if (opts.leagues.length > 0) {
          const firstLeague = opts.leagues[0];
          setSelectedLeague(firstLeague);

          const teams = await getFantasyTeamsForLeague(firstLeague);
          setLeagueFantasyTeams(teams);
          applyDefaultTeamSelections(firstLeague, teams);
        }
        defaultsSet.current = true;
      } catch (err) {
        console.error('Failed to initialise filter options:', err);
      }
    })();
  }, [status, applyDefaultTeamSelections]);

  const runQuery = useCallback(async () => {
    if (status !== 'ready') return;
    setQueryLoading(true);
    try {
      const rows = await queryPlayers(
        hitterFilters.timeWindow,
        selectedLeague,
        hitterFilters.selectedTeams,
        hitterFilters.selectedPositions,
        playerSearch
      );
      const unmatchedCount = rows.filter((r) => r.pa == null && r.bbe == null).length;
      console.log(
        `[query] ${rows.length} players returned, ${unmatchedCount} with no game log match`
      );
      const deduped = rows.filter((r) => !/\(batter\)/i.test(r.player_name) && (r.pa != null || r.bbe != null));
      const filtered = filterByVolume(deduped);
      console.log(
        `[filter] ${filtered.length} players after volume filter (${deduped.length - filtered.length} removed)`
      );
      setPlayers(computeZScores(filtered));
    } catch (err) {
      console.error('Query failed:', err);
    } finally {
      setQueryLoading(false);
    }
  }, [status, hitterFilters, selectedLeague, playerSearch]);

  const runPitcherQuery = useCallback(async () => {
    await runManagedViewQuery({
      isReady: status === 'ready',
      runTask: runPitcherTask,
      task: async () => {
        const [latest, history] = await Promise.all([
          fetchLatestPitcherList(),
          fetchPitcherListHistory(),
        ]);
        const joined = await queryPitcherTrends(
          latest.rows,
          selectedLeague,
          pitcherFilters.selectedTeams,
          playerSearch,
          history.snapshots
        );

        return { latest, joined };
      },
      onSuccess: ({ latest, joined }) => {
        setPitchers(joined);
        setPitcherMeta({
          title: latest.title,
          source_url: latest.source_url,
          published_at: latest.published_at,
        });
      },
      onError: () => {
        setPitchers([]);
      },
    });
  }, [status, selectedLeague, pitcherFilters, playerSearch, runPitcherTask]);

  const runReliefQuery = useCallback(async () => {
    await runManagedViewQuery({
      isReady: status === 'ready',
      runTask: runReliefTask,
      task: async () => {
        const [latest, history] = await Promise.all([
          fetchLatestReliefList(reliefScoringMode),
          fetchReliefListHistory(reliefScoringMode),
        ]);
        const joined = await queryReliefTrends(
          latest.rows,
          selectedLeague,
          reliefFilters.selectedTeams,
          playerSearch,
          history.snapshots
        );

        return { latest, joined };
      },
      onSuccess: ({ latest, joined }) => {
        setRelievers(joined);
        setReliefMeta({
          title: latest.title,
          source_url: latest.source_url,
          published_at: latest.published_at,
          scoring_mode: latest.scoring_mode,
        });
      },
      onError: () => {
        setRelievers([]);
      },
    });
  }, [status, selectedLeague, reliefFilters, reliefScoringMode, playerSearch, runReliefTask]);

  const runInjuredQuery = useCallback(async () => {
    await runManagedViewQuery({
      isReady: status === 'ready',
      runTask: runInjuredTask,
      task: async () => {
        const latest = await fetchLatestInjuredPitchers();
        const joined = await queryInjuredPitchers(
          latest.rows,
          selectedLeague,
          injuredFilters.selectedTeams,
          playerSearch
        );

        return { latest, joined };
      },
      onSuccess: ({ latest, joined }) => {
        setInjuredPitchers(joined);
        setInjuredMeta({
          title: latest.title,
          source_urls: latest.source_urls,
          scraped_at: latest.scraped_at,
        });
      },
      onError: () => {
        setInjuredPitchers([]);
      },
    });
  }, [status, selectedLeague, injuredFilters, playerSearch, runInjuredTask]);

  const runProspectQuery = useCallback(async () => {
    await runManagedViewQuery({
      isReady: status === 'ready',
      runTask: runProspectTask,
      task: async () => {
        const latest = await fetchLatestProspects();
        const joined = await queryProspects(
          latest.rows,
          selectedLeague,
          prospectFilters.selectedTeams,
          prospectFilters.selectedPositions,
          playerSearch,
          125,
          prospectFilters.maxAge,
          prospectFilters.rosterFilter,
          prospectFilters.selectedLevels
        );

        return { latest, joined };
      },
      onSuccess: ({ latest, joined }) => {
        setProspects(joined);

        const LEVEL_ORDER = ['MLB', 'AAA', 'AA', 'A+', 'A', 'ROK'];
        const levelOptions = Array.from(
          new Set(
            latest.rows
              .map((row) => row.level?.trim().toUpperCase())
              .filter((l): l is string => l != null && l.length > 0)
          )
        ).sort((a, b) => {
          const ai = LEVEL_ORDER.indexOf(a);
          const bi = LEVEL_ORDER.indexOf(b);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return a.localeCompare(b);
        });
        setProspectLevelOptions(levelOptions);

        const positions = Array.from(
          new Set(
            latest.rows
              .flatMap((row) => row.positions)
              .map((position) => position.trim().toUpperCase())
              .filter(Boolean)
          )
        ).sort();
        setProspectPositions(positions);

        const ageOptions = Array.from(
          new Set(
            latest.rows
              .map((row) => row.age)
              .filter((age): age is number => age != null && Number.isFinite(age))
              .map((age) => Math.ceil(age))
          )
        ).sort((a, b) => a - b);
        setProspectAgeOptions(ageOptions);
        if (prospectFilters.maxAge != null && !ageOptions.includes(prospectFilters.maxAge)) {
          setProspectFilters((f) => ({ ...f, maxAge: null }));
        }

        setProspectsMeta({
          title: latest.title,
          scraped_at: latest.scraped_at,
          sources: latest.sources,
        });
      },
      onError: () => {
        setProspects([]);
        setProspectPositions([]);
        setProspectAgeOptions([]);
      },
    });
  }, [
    status,
    selectedLeague,
    prospectFilters,
    playerSearch,
    runProspectTask,
  ]);

  const runByView = useMemo<Record<ViewMode, () => Promise<void>>>(
    () => ({
      hitters: runQuery,
      pitchers: runPitcherQuery,
      relievers: runReliefQuery,
      injured: runInjuredQuery,
      prospects: runProspectQuery,
    }),
    [runQuery, runPitcherQuery, runReliefQuery, runInjuredQuery, runProspectQuery]
  );

  const handleLeagueChange = useCallback(async (league: string | null) => {
    setSelectedLeague(league);
    if (league) {
      const teams = await getFantasyTeamsForLeague(league);
      setLeagueFantasyTeams(teams);
      applyDefaultTeamSelections(league, teams);
    } else {
      setLeagueFantasyTeams([]);
      setHitterFilters((f) => ({ ...f, selectedTeams: [] }));
      setPitcherFilters((f) => ({ ...f, selectedTeams: [] }));
      setReliefFilters((f) => ({ ...f, selectedTeams: [] }));
      setInjuredFilters((f) => ({ ...f, selectedTeams: [] }));
      setProspectFilters((f) => ({ ...f, selectedTeams: [] }));
    }
  }, [applyDefaultTeamSelections]);

  useEffect(() => {
    if (!defaultsSet.current) return;
    return scheduleActiveViewQuery({
      viewMode,
      runByView,
      delayMs: 100,
    });
  }, [viewMode, runByView]);

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
    <div className="flex min-h-0 flex-col h-dvh overflow-hidden">
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
                const nextView = next[next.length - 1] as
                  | 'hitters'
                  | 'pitchers'
                  | 'relievers'
                  | 'injured'
                  | 'prospects';
                if (nextView !== viewMode) {
                  setSearchDraft('');
                  setPlayerSearch('');
                }
                setViewMode(nextView);
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
              SP Rankings
            </ToggleGroupItem>
            <ToggleGroupItem
              value="relievers"
              className="h-9 px-3.5 text-sm font-semibold text-teal-100 aria-pressed:bg-teal-700 aria-pressed:text-white data-[state=on]:bg-teal-700 data-[state=on]:text-white"
            >
              RP Rankings
            </ToggleGroupItem>
            <ToggleGroupItem
              value="injured"
              className="h-9 px-3.5 text-sm font-semibold text-teal-100 aria-pressed:bg-teal-700 aria-pressed:text-white data-[state=on]:bg-teal-700 data-[state=on]:text-white"
            >
              Injured
            </ToggleGroupItem>
            <ToggleGroupItem
              value="prospects"
              className="h-9 px-3.5 text-sm font-semibold text-teal-100 aria-pressed:bg-teal-700 aria-pressed:text-white data-[state=on]:bg-teal-700 data-[state=on]:text-white"
            >
              Prospects
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>
      <FilterBar
        filters={activeFilters}
        onFiltersChange={handleFiltersChange}
        filterOptions={filterOptions}
        leagueFantasyTeams={leagueFantasyTeams}
        selectedLeague={selectedLeague}
        onLeagueChange={handleLeagueChange}
        prospectAgeOptions={prospectAgeOptions}
        prospectLevelOptions={prospectLevelOptions}
        prospectPositions={prospectPositions}
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        onSearchSubmit={() => setPlayerSearch(searchDraft.trim())}
      />
      {viewMode === 'hitters' ? (
        <PlayerTable
          data={players}
          isLoading={queryLoading}
          showMetricSparklines={hitterFilters.timeWindow === 'STD'}
        />
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
      ) : viewMode === 'relievers' ? (
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
      ) : viewMode === 'injured' ? (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {injuredError ? (
              <span className="text-destructive">Injured pitcher rankings fetch failed: {injuredError}</span>
            ) : injuredMeta ? (
              <span>
                {injuredMeta.title}
                {` · Refreshed ${new Date(injuredMeta.scraped_at).toLocaleString()}`}
                {' · '}
                <a
                  href={injuredMeta.source_urls.sp}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  SP Source
                </a>
                {' · '}
                <a
                  href={injuredMeta.source_urls.rp}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  RP Source
                </a>
              </span>
            ) : (
              <span>Loading injured pitcher rankings...</span>
            )}
          </div>
          <InjuredPitcherTable data={injuredPitchers} isLoading={injuredLoading} />
        </>
      ) : (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {prospectError ? (
              <span className="text-destructive">Prospect rankings fetch failed: {prospectError}</span>
            ) : prospectsMeta ? (
              <span>
                {prospectsMeta.title}
                {` · Refreshed ${new Date(prospectsMeta.scraped_at).toLocaleString()}`}
                {' · Sources: '}
                {prospectsMeta.sources
                  .map((source) =>
                    source.status === 'ok'
                      ? `${source.source} (${source.row_count})`
                      : `${source.source} (error)`
                  )
                  .join(', ')}
              </span>
            ) : (
              <span>Loading latest prospect rankings...</span>
            )}
          </div>
          <ProspectTable data={prospects} isLoading={prospectLoading} />
        </>
      )}
    </div>
  );
}
