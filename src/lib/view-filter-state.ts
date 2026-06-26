import type { TimeWindow } from './queries';

/**
 * Typed, discriminated-union filter state for each app view.
 *
 * Using a single `ViewFilters` type for the active view eliminates the ~20
 * parallel filter props that were previously threaded through FilterBar, and
 * ensures TypeScript enforces which filters are valid for which view.
 */

export interface HitterFilters {
  readonly mode: 'hitters';
  selectedTeams: string[];
  selectedPositions: string[];
  timeWindow: TimeWindow;
}

export interface HitterRankFilters {
  readonly mode: 'hitter-rankings';
  selectedTeams: string[];
}

export interface PitcherFilters {
  readonly mode: 'pitchers';
  selectedTeams: string[];
}

export interface ReliefFilters {
  readonly mode: 'relievers';
  selectedTeams: string[];
}

export interface InjuredFilters {
  readonly mode: 'injured';
  selectedTeams: string[];
}

export interface StreamerHitterFilters {
  readonly mode: 'streamer-hitters';
  selectedTeams: string[];
}

export interface StreamerPitcherFilters {
  readonly mode: 'streamer-pitchers';
  selectedTeams: string[];
}

export interface ProspectFilters {
  readonly mode: 'prospects';
  selectedTeams: string[];
  selectedPositions: string[];
  maxAge: number | null;
  rosterFilter: 'all' | 'rostered' | 'available';
  selectedLevels: string[];
}

export type ViewFilters =
  | HitterFilters
  | HitterRankFilters
  | PitcherFilters
  | ReliefFilters
  | InjuredFilters
  | StreamerHitterFilters
  | StreamerPitcherFilters
  | ProspectFilters;

export function defaultHitterFilters(): HitterFilters {
  return { mode: 'hitters', selectedTeams: [], selectedPositions: [], timeWindow: 'STD' };
}

export function defaultHitterRankFilters(): HitterRankFilters {
  return { mode: 'hitter-rankings', selectedTeams: [] };
}

export function defaultPitcherFilters(): PitcherFilters {
  return { mode: 'pitchers', selectedTeams: [] };
}

export function defaultReliefFilters(): ReliefFilters {
  return { mode: 'relievers', selectedTeams: [] };
}

export function defaultInjuredFilters(): InjuredFilters {
  return { mode: 'injured', selectedTeams: [] };
}

export function defaultStreamerHitterFilters(): StreamerHitterFilters {
  return { mode: 'streamer-hitters', selectedTeams: [] };
}

export function defaultStreamerPitcherFilters(): StreamerPitcherFilters {
  return { mode: 'streamer-pitchers', selectedTeams: [] };
}

export function defaultProspectFilters(): ProspectFilters {
  return {
    mode: 'prospects',
    selectedTeams: [],
    selectedPositions: [],
    maxAge: null,
    rosterFilter: 'all',
    selectedLevels: [],
  };
}
