import { useCallback, useEffect, useState } from 'react';
import {
  fetchLatestInjuredPitchers,
  fetchLatestPitcherList,
  fetchPitcherListHistory,
  fetchLatestReliefList,
  fetchReliefListHistory,
  type InjuredPitcherRow,
  type InjuredPitchersLatestResponse,
  type PitcherListHistorySnapshot,
  type PitcherListLatestResponse,
  type PitcherListRankRow,
  type ReliefListHistorySnapshot,
  type ReliefListLatestResponse,
  type ReliefListRankRow,
  type ReliefScoringMode,
} from './pitcherlist-client';
import {
  queryCbsStreamer,
  queryInjuredPitchers,
  queryPitcherTrends,
  queryReliefTrends,
  type InjuredPitcherTrendRow,
  type PitcherTrendRow,
  type ReliefTrendRow,
  type StreamerViewRow,
} from './queries';
import {
  fetchLatestCbsStreamer,
  type CbsStreamerLatestResponse,
} from './cbs-streamer-client';

export type ViewMode =
  | 'hitters'
  | 'pitchers'
  | 'relievers'
  | 'injured'
  | 'prospects'
  | 'streamer-hitters'
  | 'streamer-pitchers';

// ---------------------------------------------------------------------------
// Metadata types — the shape of banner information each ranking view exposes
// ---------------------------------------------------------------------------

export interface PitcherViewMeta {
  title: string;
  source_url: string;
  published_at: string | null;
}

export interface ReliefViewMeta {
  title: string;
  source_url: string;
  published_at: string | null;
  scoring_mode: ReliefScoringMode;
}

export interface InjuredViewMeta {
  title: string;
  source_urls: { sp: string; rp: string };
  scraped_at: string;
}

export interface StreamerViewMeta {
  title: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  week_label: string | null;
  week_start: string | null;
  week_end: string | null;
}

// ---------------------------------------------------------------------------
// Input types — what each ranking view needs to run its query
// ---------------------------------------------------------------------------

export interface PitcherViewInput {
  selectedLeague: string | null;
  selectedTeams: string[];
  playerSearch: string;
}

export interface ReliefViewInput {
  selectedLeague: string | null;
  selectedTeams: string[];
  playerSearch: string;
  scoringMode: ReliefScoringMode;
}

export interface InjuredViewInput {
  selectedLeague: string | null;
  selectedTeams: string[];
  playerSearch: string;
}

export interface StreamerViewInput {
  selectedLeague: string | null;
  selectedTeams: string[];
  playerSearch: string;
}

// ---------------------------------------------------------------------------
// Prepared view state — what the registry returns to the caller
// ---------------------------------------------------------------------------

export interface RankingViewState<TRow, TMeta> {
  rows: TRow[];
  isLoading: boolean;
  error: string | null;
  meta: TMeta | null;
}

// ---------------------------------------------------------------------------
// Execute factories — the testable seam.
//
// Each factory accepts injectable dependencies so callers (and tests) can
// supply real or fake adapters.  The returned execute function owns the full
// fetch + query + metadata-mapping pipeline for one View.
// ---------------------------------------------------------------------------

export interface PitcherViewDeps {
  fetchLatest: () => Promise<PitcherListLatestResponse>;
  fetchHistory: () => Promise<{ snapshots: PitcherListHistorySnapshot[] }>;
  queryTrends: (
    rows: PitcherListRankRow[],
    league: string | null,
    teams: string[],
    search: string | undefined,
    history: PitcherListHistorySnapshot[],
  ) => Promise<PitcherTrendRow[]>;
}

export function makePitcherViewExecute(
  deps: PitcherViewDeps,
): (input: PitcherViewInput) => Promise<{ rows: PitcherTrendRow[]; meta: PitcherViewMeta }> {
  return async (input) => {
    const [latest, history] = await Promise.all([deps.fetchLatest(), deps.fetchHistory()]);
    const rows = await deps.queryTrends(
      latest.rows,
      input.selectedLeague,
      input.selectedTeams,
      input.playerSearch || undefined,
      history.snapshots,
    );
    return {
      rows,
      meta: {
        title: latest.title,
        source_url: latest.source_url,
        published_at: latest.published_at,
      },
    };
  };
}

export interface ReliefViewDeps {
  fetchLatest: (scoringMode: ReliefScoringMode) => Promise<ReliefListLatestResponse>;
  fetchHistory: (scoringMode: ReliefScoringMode) => Promise<{ snapshots: ReliefListHistorySnapshot[] }>;
  queryTrends: (
    rows: ReliefListRankRow[],
    league: string | null,
    teams: string[],
    search: string | undefined,
    history: ReliefListHistorySnapshot[],
  ) => Promise<ReliefTrendRow[]>;
}

export function makeReliefViewExecute(
  deps: ReliefViewDeps,
): (input: ReliefViewInput) => Promise<{ rows: ReliefTrendRow[]; meta: ReliefViewMeta }> {
  return async (input) => {
    const [latest, history] = await Promise.all([
      deps.fetchLatest(input.scoringMode),
      deps.fetchHistory(input.scoringMode),
    ]);
    const rows = await deps.queryTrends(
      latest.rows,
      input.selectedLeague,
      input.selectedTeams,
      input.playerSearch || undefined,
      history.snapshots,
    );
    return {
      rows,
      meta: {
        title: latest.title,
        source_url: latest.source_url,
        published_at: latest.published_at,
        scoring_mode: latest.scoring_mode,
      },
    };
  };
}

export interface InjuredViewDeps {
  fetchLatest: () => Promise<InjuredPitchersLatestResponse>;
  queryTrends: (
    rows: InjuredPitcherRow[],
    league: string | null,
    teams: string[],
    search: string | undefined,
  ) => Promise<InjuredPitcherTrendRow[]>;
}

export function makeInjuredViewExecute(
  deps: InjuredViewDeps,
): (input: InjuredViewInput) => Promise<{ rows: InjuredPitcherTrendRow[]; meta: InjuredViewMeta }> {
  return async (input) => {
    const latest = await deps.fetchLatest();
    const rows = await deps.queryTrends(
      latest.rows,
      input.selectedLeague,
      input.selectedTeams,
      input.playerSearch || undefined,
    );
    return {
      rows,
      meta: {
        title: latest.title,
        source_urls: latest.source_urls,
        scraped_at: latest.scraped_at,
      },
    };
  };
}

export interface StreamerViewDeps {
  fetchLatest: () => Promise<CbsStreamerLatestResponse>;
  queryRows: (
    rows: CbsStreamerLatestResponse['rows'],
    league: string | null,
    teams: string[],
    search: string | undefined,
  ) => Promise<StreamerViewRow[]>;
}

export function makeStreamerViewExecute(
  deps: StreamerViewDeps,
): (input: StreamerViewInput) => Promise<{ rows: StreamerViewRow[]; meta: StreamerViewMeta }> {
  return async (input) => {
    const latest = await deps.fetchLatest();
    const rows = await deps.queryRows(
      latest.rows,
      input.selectedLeague,
      input.selectedTeams,
      input.playerSearch || undefined,
    );
    return {
      rows,
      meta: {
        title: latest.title,
        source_url: latest.source_url,
        published_at: latest.published_at,
        scraped_at: latest.scraped_at,
        week_label: latest.week_label,
        week_start: latest.week_start,
        week_end: latest.week_end,
      },
    };
  };
}

// Production execute functions wired to real adapters.
const defaultPitcherViewExecute = makePitcherViewExecute({
  fetchLatest: fetchLatestPitcherList,
  fetchHistory: fetchPitcherListHistory,
  queryTrends: queryPitcherTrends,
});

const defaultReliefViewExecute = makeReliefViewExecute({
  fetchLatest: fetchLatestReliefList,
  fetchHistory: fetchReliefListHistory,
  queryTrends: queryReliefTrends,
});

const defaultInjuredViewExecute = makeInjuredViewExecute({
  fetchLatest: fetchLatestInjuredPitchers,
  queryTrends: queryInjuredPitchers,
});

const defaultStreamerHittersExecute = makeStreamerViewExecute({
  fetchLatest: () => fetchLatestCbsStreamer('hitters'),
  queryRows: queryCbsStreamer,
});

const defaultStreamerPitchersExecute = makeStreamerViewExecute({
  fetchLatest: () => fetchLatestCbsStreamer('pitchers'),
  queryRows: queryCbsStreamer,
});

// ---------------------------------------------------------------------------
// useRankingViews — the registry hook.
//
// Accepts inputs for all three ranking views plus shared readiness/mode state.
// Returns prepared view state for each.  Scheduling (100 ms debounce) is
// owned here so callers receive only query results, not lifecycle internals.
//
// Callers MUST memoize the pitcher / relief / injured input objects (e.g. with
// useMemo) to prevent spurious query re-runs on every render.
//
// Injectable execute overrides are exposed for test isolation.
// ---------------------------------------------------------------------------

export interface RankingViewsInput {
  isReady: boolean;
  viewMode: ViewMode;
  pitcher: PitcherViewInput;
  relief: ReliefViewInput;
  injured: InjuredViewInput;
  streamerHitters: StreamerViewInput;
  streamerPitchers: StreamerViewInput;
  /** Override for testing only. */
  pitcherExecute?: (input: PitcherViewInput) => Promise<{ rows: PitcherTrendRow[]; meta: PitcherViewMeta }>;
  /** Override for testing only. */
  reliefExecute?: (input: ReliefViewInput) => Promise<{ rows: ReliefTrendRow[]; meta: ReliefViewMeta }>;
  /** Override for testing only. */
  injuredExecute?: (input: InjuredViewInput) => Promise<{ rows: InjuredPitcherTrendRow[]; meta: InjuredViewMeta }>;
  /** Override for testing only. */
  streamerHittersExecute?: (input: StreamerViewInput) => Promise<{ rows: StreamerViewRow[]; meta: StreamerViewMeta }>;
  /** Override for testing only. */
  streamerPitchersExecute?: (input: StreamerViewInput) => Promise<{ rows: StreamerViewRow[]; meta: StreamerViewMeta }>;
}

export interface RankingViewsState {
  pitcher: RankingViewState<PitcherTrendRow, PitcherViewMeta>;
  relief: RankingViewState<ReliefTrendRow, ReliefViewMeta>;
  injured: RankingViewState<InjuredPitcherTrendRow, InjuredViewMeta>;
  streamerHitters: RankingViewState<StreamerViewRow, StreamerViewMeta>;
  streamerPitchers: RankingViewState<StreamerViewRow, StreamerViewMeta>;
}

const EMPTY_PITCHER_STATE: RankingViewState<PitcherTrendRow, PitcherViewMeta> = {
  rows: [],
  isLoading: false,
  error: null,
  meta: null,
};

const EMPTY_RELIEF_STATE: RankingViewState<ReliefTrendRow, ReliefViewMeta> = {
  rows: [],
  isLoading: false,
  error: null,
  meta: null,
};

const EMPTY_INJURED_STATE: RankingViewState<InjuredPitcherTrendRow, InjuredViewMeta> = {
  rows: [],
  isLoading: false,
  error: null,
  meta: null,
};

const EMPTY_STREAMER_STATE: RankingViewState<StreamerViewRow, StreamerViewMeta> = {
  rows: [],
  isLoading: false,
  error: null,
  meta: null,
};

export function useRankingViews({
  isReady,
  viewMode,
  pitcher,
  relief,
  injured,
  streamerHitters,
  streamerPitchers,
  pitcherExecute = defaultPitcherViewExecute,
  reliefExecute = defaultReliefViewExecute,
  injuredExecute = defaultInjuredViewExecute,
  streamerHittersExecute = defaultStreamerHittersExecute,
  streamerPitchersExecute = defaultStreamerPitchersExecute,
}: RankingViewsInput): RankingViewsState {
  const [pitcherState, setPitcherState] =
    useState<RankingViewState<PitcherTrendRow, PitcherViewMeta>>(EMPTY_PITCHER_STATE);
  const [reliefState, setReliefState] =
    useState<RankingViewState<ReliefTrendRow, ReliefViewMeta>>(EMPTY_RELIEF_STATE);
  const [injuredState, setInjuredState] =
    useState<RankingViewState<InjuredPitcherTrendRow, InjuredViewMeta>>(EMPTY_INJURED_STATE);
  const [streamerHittersState, setStreamerHittersState] =
    useState<RankingViewState<StreamerViewRow, StreamerViewMeta>>(EMPTY_STREAMER_STATE);
  const [streamerPitchersState, setStreamerPitchersState] =
    useState<RankingViewState<StreamerViewRow, StreamerViewMeta>>(EMPTY_STREAMER_STATE);

  const runPitcher = useCallback(
    async (input: PitcherViewInput) => {
      setPitcherState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const { rows, meta } = await pitcherExecute(input);
        setPitcherState({ rows, isLoading: false, error: null, meta });
      } catch (err) {
        setPitcherState({
          rows: [],
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
          meta: null,
        });
      }
    },
    [pitcherExecute],
  );

  const runRelief = useCallback(
    async (input: ReliefViewInput) => {
      setReliefState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const { rows, meta } = await reliefExecute(input);
        setReliefState({ rows, isLoading: false, error: null, meta });
      } catch (err) {
        setReliefState({
          rows: [],
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
          meta: null,
        });
      }
    },
    [reliefExecute],
  );

  const runInjured = useCallback(
    async (input: InjuredViewInput) => {
      setInjuredState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const { rows, meta } = await injuredExecute(input);
        setInjuredState({ rows, isLoading: false, error: null, meta });
      } catch (err) {
        setInjuredState({
          rows: [],
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
          meta: null,
        });
      }
    },
    [injuredExecute],
  );

  const runStreamerHitters = useCallback(
    async (input: StreamerViewInput) => {
      setStreamerHittersState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const { rows, meta } = await streamerHittersExecute(input);
        setStreamerHittersState({ rows, isLoading: false, error: null, meta });
      } catch (err) {
        setStreamerHittersState({
          rows: [],
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
          meta: null,
        });
      }
    },
    [streamerHittersExecute],
  );

  const runStreamerPitchers = useCallback(
    async (input: StreamerViewInput) => {
      setStreamerPitchersState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const { rows, meta } = await streamerPitchersExecute(input);
        setStreamerPitchersState({ rows, isLoading: false, error: null, meta });
      } catch (err) {
        setStreamerPitchersState({
          rows: [],
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
          meta: null,
        });
      }
    },
    [streamerPitchersExecute],
  );

  useEffect(() => {
    if (!isReady) return;

    const timer = window.setTimeout(() => {
      if (viewMode === 'pitchers') {
        void runPitcher(pitcher);
      } else if (viewMode === 'relievers') {
        void runRelief(relief);
      } else if (viewMode === 'injured') {
        void runInjured(injured);
      } else if (viewMode === 'streamer-hitters') {
        void runStreamerHitters(streamerHitters);
      } else if (viewMode === 'streamer-pitchers') {
        void runStreamerPitchers(streamerPitchers);
      }
    }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    isReady,
    viewMode,
    pitcher,
    relief,
    injured,
    streamerHitters,
    streamerPitchers,
    runPitcher,
    runRelief,
    runInjured,
    runStreamerHitters,
    runStreamerPitchers,
  ]);

  return {
    pitcher: pitcherState,
    relief: reliefState,
    injured: injuredState,
    streamerHitters: streamerHittersState,
    streamerPitchers: streamerPitchersState,
  };
}

// ---------------------------------------------------------------------------
// Legacy helpers kept for Hitter View and Prospect View scheduling.
// These are outside the current pilot scope.
// ---------------------------------------------------------------------------

interface RunAsyncTaskOptions<T> {
  task: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError?: () => void;
}

type AsyncTaskRunner = <T>(options: RunAsyncTaskOptions<T>) => Promise<void>;

interface RunManagedViewQueryArgs<T> {
  isReady: boolean;
  runTask: AsyncTaskRunner;
  task: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError: () => void;
}

export async function runManagedViewQuery<T>({
  isReady,
  runTask,
  task,
  onSuccess,
  onError,
}: RunManagedViewQueryArgs<T>): Promise<void> {
  if (!isReady) return;

  await runTask({
    task,
    onSuccess,
    onError,
  });
}

export function scheduleActiveViewQuery({
  viewMode,
  runByView,
  delayMs = 100,
}: {
  viewMode: ViewMode;
  runByView: Partial<Record<ViewMode, () => Promise<void>>>;
  delayMs?: number;
}): () => void {
  const runner = runByView[viewMode];
  if (!runner) return () => undefined;

  const timer = window.setTimeout(() => {
    void runner();
  }, delayMs);

  return () => {
    window.clearTimeout(timer);
  };
}
