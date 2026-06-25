import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLoadData } from '@/lib/data-source';
import {
  getFilterOptions,
  getFantasyTeamsForLeague,
  queryPlayers,
  queryProspects,
  filterByVolume,
  computeZScores,
  type FilterOptions,
  type PlayerRow,
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
import { type ReliefScoringMode } from '@/lib/pitcherlist-client';
import { fetchLatestProspects, type ProspectSourceStatus } from '@/lib/prospects-client';
import { NavTabs } from '@/components/NavTabs';
import { Toggle } from '@/components/ui/toggle';
import { AlertCircle, Moon, Sun } from 'lucide-react';
import { getDefaultRosterTeams } from '@/lib/fantasy-teams';
import { useAsyncTask } from '@/lib/use-async-task';
import {
  runManagedViewQuery,
  scheduleActiveViewQuery,
  useRankingViews,
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
  const { status, error, retry } = useLoadData();
  const contentRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('hitters');
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    leagues: [],
    fantasyTeams: [],
    positions: [],
  });
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [prospectsMeta, setProspectsMeta] = useState<{
    title: string;
    scraped_at: string;
    sources: ProspectSourceStatus[];
  } | null>(null);
  const [leagueFantasyTeams, setLeagueFantasyTeams] = useState<string[]>([]);

  const [selectedLeague, setSelectedLeague] = useState<string>('');
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
    loading: prospectLoading,
    error: prospectError,
    run: runProspectTask,
  } = useAsyncTask();

  const [defaultsApplied, setDefaultsApplied] = useState(false);
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
        setDefaultsApplied(true);
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

  // ---------------------------------------------------------------------------
  // Ranking view orchestration — Pitcher View, Reliever View, Injured View.
  // Inputs are memoized so the hook only re-runs queries when relevant state changes.
  // ---------------------------------------------------------------------------

  const pitcherInput = useMemo(
    () => ({
      selectedLeague,
      selectedTeams: pitcherFilters.selectedTeams,
      playerSearch,
    }),
    [selectedLeague, pitcherFilters.selectedTeams, playerSearch],
  );

  const reliefInput = useMemo(
    () => ({
      selectedLeague,
      selectedTeams: reliefFilters.selectedTeams,
      playerSearch,
      scoringMode: reliefScoringMode,
    }),
    [selectedLeague, reliefFilters.selectedTeams, playerSearch, reliefScoringMode],
  );

  const injuredInput = useMemo(
    () => ({
      selectedLeague,
      selectedTeams: injuredFilters.selectedTeams,
      playerSearch,
    }),
    [selectedLeague, injuredFilters.selectedTeams, playerSearch],
  );

  const {
    pitcher: pitcherView,
    relief: reliefView,
    injured: injuredView,
  } = useRankingViews({
    isReady: status === 'ready' && defaultsApplied,
    viewMode,
    pitcher: pitcherInput,
    relief: reliefInput,
    injured: injuredInput,
  });

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
          latest.sources,
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

  const runByView = useMemo<Partial<Record<ViewMode, () => Promise<void>>>>(
    () => ({
      hitters: runQuery,
      prospects: runProspectQuery,
    }),
    [runQuery, runProspectQuery],
  );

  const handleLeagueChange = useCallback(async (league: string) => {
    setSelectedLeague(league);
    const teams = await getFantasyTeamsForLeague(league);
    setLeagueFantasyTeams(teams);
    applyDefaultTeamSelections(league, teams);
  }, [applyDefaultTeamSelections]);

  useEffect(() => {
    if (!defaultsApplied) return;
    return scheduleActiveViewQuery({
      viewMode,
      runByView,
      delayMs: 100,
    });
  }, [viewMode, runByView, defaultsApplied]);

  if (status === 'loading') {
    return (
      <div className="flex flex-col h-dvh overflow-hidden" role="status" aria-label="Loading player data" aria-busy="true">
        {/* Header */}
        <div className="bg-navy-deep px-3 py-2 md:px-4 md:py-3 flex-shrink-0">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="h-5 w-44 rounded bg-white/20 animate-pulse motion-reduce:animate-none" />
              <div className="h-7 w-16 rounded bg-white/20 animate-pulse motion-reduce:animate-none" />
            </div>
            <div className="flex gap-0.5">
              {[72, 82, 82, 66, 82].map((w, i) => (
                <div key={i} className="h-11 md:h-9 rounded-sm bg-white/20 animate-pulse motion-reduce:animate-none flex-shrink-0" style={{ width: `${w}px` }} />
              ))}
            </div>
          </div>
        </div>

        {/* Filter bar — collapsed toggle on mobile, chips on desktop */}
        <div className="border-b bg-background flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2.5 md:hidden">
            <div className="h-4 w-12 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
            <div className="h-4 w-4 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
          </div>
          <div className="hidden md:flex flex-wrap items-center gap-3 px-4 py-4">
            <div className="h-8 w-36 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
            <div className="h-8 w-28 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
            <div className="h-8 w-20 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
            <div className="h-8 w-20 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
            <div className="ml-auto h-8 w-48 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
          </div>
        </div>

        {/* Content — card list on mobile, table rows on desktop */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Mobile: sort bar + cards */}
          <div className="md:hidden flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30 flex-shrink-0">
              <div className="h-3.5 w-10 rounded bg-surface-header animate-pulse motion-reduce:animate-none shrink-0" />
              <div className="h-8 flex-1 rounded bg-surface-header animate-pulse motion-reduce:animate-none" />
              <div className="h-8 w-8 rounded bg-surface-header animate-pulse motion-reduce:animate-none shrink-0" />
            </div>
            <div className="flex-1 overflow-hidden">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className="border-b px-3 py-2.5 animate-pulse motion-reduce:animate-none"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                      <div className="h-4 rounded bg-surface-header" style={{ width: `${120 + (i % 3) * 32}px` }} />
                      <div className="h-3 w-40 rounded bg-surface" />
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="h-4 w-12 rounded bg-surface-header" />
                      <div className="h-2.5 w-14 rounded bg-surface" />
                    </div>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {[44, 52, 44, 32, 52].map((w, j) => (
                      <div key={j} className="h-5 rounded bg-surface" style={{ width: `${w}px` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop: table header + rows */}
          <div className="hidden md:flex md:flex-col flex-1 overflow-hidden">
            <div className="bg-surface-header border-b border-border h-9 flex-shrink-0" />
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-4 border-b border-border animate-pulse motion-reduce:animate-none"
                style={{ height: '41px', animationDelay: `${i * 60}ms` }}
              >
                <div className="h-3.5 w-6 rounded bg-surface-header flex-shrink-0" />
                <div className="h-3.5 rounded bg-surface" style={{ width: `${100 + (i % 3) * 36}px` }} />
                <div className="h-3.5 w-14 rounded bg-surface" />
                <div className="h-3.5 w-12 rounded bg-surface ml-auto" />
                <div className="h-3.5 w-12 rounded bg-surface" />
                <div className="h-3.5 w-12 rounded bg-surface" />
                <div className="h-3.5 w-10 rounded bg-surface" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center justify-center h-dvh bg-surface" role="alert" aria-live="assertive">
        <div className="bg-white rounded-lg border border-border p-8 max-w-sm w-full mx-4 text-center shadow-float">
          <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-5 h-5 text-destructive" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">Couldn't load player data</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            This is usually a network issue. Try refreshing.
          </p>
          <button
            onClick={retry}
            className="w-full bg-primary hover:bg-navy-mid text-white text-sm font-medium rounded px-4 py-2 transition-colors duration-150 cursor-pointer"
          >
            Try again
          </button>
          {error && (
            <details className="mt-4 text-left">
              <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors duration-100">
                Technical details
              </summary>
              <pre className="mt-2 text-xs text-muted-foreground bg-surface rounded p-3 overflow-auto max-h-32 font-mono whitespace-pre-wrap break-all">
                {error}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col h-dvh overflow-hidden">
      <header className="bg-navy-deep px-3 py-2 md:px-4 md:py-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg md:text-xl font-semibold tracking-tight text-white">Fantasy Baseball Research</h1>
            <Toggle
              variant="default"
              size="sm"
              aria-label="Toggle dark mode"
              pressed={theme === 'dark'}
              onPressedChange={(pressed) => setTheme(pressed ? 'dark' : 'light')}
              className="border border-white/20 text-white/70 hover:bg-white/10 hover:text-white hover:border-white/40 aria-pressed:text-white aria-pressed:bg-white/15 aria-pressed:border-white/30"
            >
              {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </Toggle>
          </div>
          <NavTabs
            value={viewMode}
            onChange={(next) => {
              if (next !== viewMode) {
                setSearchDraft('');
                setPlayerSearch('');
              }
              setViewMode(next);
            }}
            contentRef={contentRef}
          />
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
      <div
        ref={contentRef}
        tabIndex={-1}
        className="flex flex-col flex-1 min-h-0 outline-none"
      >
      {viewMode === 'hitters' ? (
        <PlayerTable
          data={players}
          isLoading={queryLoading}
          showMetricSparklines={hitterFilters.timeWindow === 'STD'}
        />
      ) : viewMode === 'pitchers' ? (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {pitcherView.error ? (
              <span role="alert" className="text-destructive">Pitcher List fetch failed: {pitcherView.error}</span>
            ) : pitcherView.meta ? (
              <span>
                {pitcherView.meta.title}
                {pitcherView.meta.published_at ? ` · Published ${new Date(pitcherView.meta.published_at).toLocaleDateString()}` : ''}
                {' · '}
                <a
                  href={pitcherView.meta.source_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Source: ${pitcherView.meta.title}`}
                  className="underline hover:text-navy-mid transition-colors duration-100"
                >
                  Source
                </a>
              </span>
            ) : (
              <span>Loading latest Pitcher List Top 100...</span>
            )}
          </div>
          <PitcherTable data={pitcherView.rows} isLoading={pitcherView.isLoading} />
        </>
      ) : viewMode === 'relievers' ? (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {reliefView.error ? (
              <span role="alert" className="text-destructive">Reliever rankings fetch failed: {reliefView.error}</span>
            ) : reliefView.meta ? (
              <span>
                {reliefView.meta.title}
                {` · ${reliefView.meta.scoring_mode === 'saves' ? 'Saves-only' : 'SV+HLD'}`}
                {reliefView.meta.published_at ? ` · Published ${new Date(reliefView.meta.published_at).toLocaleDateString()}` : ''}
                {' · '}
                <a
                  href={reliefView.meta.source_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Source: ${reliefView.meta.title}`}
                  className="underline hover:text-navy-mid transition-colors duration-100"
                >
                  Source
                </a>
              </span>
            ) : (
              <span>Loading latest reliever rankings...</span>
            )}
          </div>
          <ReliefPitcherTable data={reliefView.rows} isLoading={reliefView.isLoading} />
        </>
      ) : viewMode === 'injured' ? (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {injuredView.error ? (
              <span role="alert" className="text-destructive">Injured pitcher rankings fetch failed: {injuredView.error}</span>
            ) : injuredView.meta ? (
              <span>
                {injuredView.meta.title}
                {` · Refreshed ${new Date(injuredView.meta.scraped_at).toLocaleString()}`}
                {' · '}
                <a
                  href={injuredView.meta.source_urls.sp}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Starting pitcher injury data source"
                  className="underline hover:text-navy-mid transition-colors duration-100"
                >
                  SP Source
                </a>
                {' · '}
                <a
                  href={injuredView.meta.source_urls.rp}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Relief pitcher injury data source"
                  className="underline hover:text-navy-mid transition-colors duration-100"
                >
                  RP Source
                </a>
              </span>
            ) : (
              <span>Loading injured pitcher rankings...</span>
            )}
          </div>
          <InjuredPitcherTable data={injuredView.rows} isLoading={injuredView.isLoading} />
        </>
      ) : (
        <>
          <div className="border-b px-3 py-2 md:px-4 text-xs text-muted-foreground">
            {prospectError ? (
              <span role="alert" className="text-destructive">Prospect rankings fetch failed: {prospectError}</span>
            ) : prospectsMeta ? (
              <span>
                {prospectsMeta.title}
                {` · Refreshed ${new Date(prospectsMeta.scraped_at).toLocaleString()}`}
                {' · Sources: '}
                {prospectsMeta.sources
                  .map((source) =>
                    source.status === 'ok'
                      ? `${source.source} (${source.row_count}, ${new Date(source.published_at ?? source.scraped_at).toLocaleDateString()})`
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
    </div>
  );
}
