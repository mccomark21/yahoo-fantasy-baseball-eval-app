import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { FilterOptions, TimeWindow } from '@/lib/queries';
import type {
  HitterFilters,
  HitterRankFilters,
  InjuredFilters,
  PitcherFilters,
  ProspectFilters,
  ReliefFilters,
  StreamerHitterFilters,
  StreamerPitcherFilters,
  ViewFilters,
} from '@/lib/view-filter-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { MultiSelect } from '@/components/MultiSelect';
import { Input } from '@/components/ui/input';
import { useIsMobile } from '@/lib/use-mobile';
import { getDefaultRosterTeams } from '@/lib/fantasy-teams';

interface FilterBarProps {
  filters: ViewFilters;
  onFiltersChange: (filters: ViewFilters) => void;
  filterOptions: FilterOptions;
  leagueFantasyTeams: string[];
  selectedLeague: string;
  onLeagueChange: (league: string) => void;
  /** Dynamic age options derived from the loaded prospect data. */
  prospectAgeOptions: number[];
  /** Dynamic level options derived from the loaded prospect data. */
  prospectLevelOptions: string[];
  /** Dynamic position options derived from the loaded prospect data. */
  prospectPositions: string[];
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onSearchSubmit: () => void;
}

const TIME_WINDOWS: TimeWindow[] = ['STD', '30D', '14D', '7D'];

export function FilterBar({
  filters,
  onFiltersChange,
  filterOptions,
  leagueFantasyTeams,
  selectedLeague,
  onLeagueChange,
  prospectAgeOptions,
  prospectLevelOptions,
  prospectPositions,
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
}: FilterBarProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const mode = filters.mode;

  // Narrow to per-view filter shapes for type-safe access inside JSX.
  const hf = filters.mode === 'hitters' ? (filters as HitterFilters) : null;
  const hrf = filters.mode === 'hitter-rankings' ? (filters as HitterRankFilters) : null;
  const pf = filters.mode === 'pitchers' ? (filters as PitcherFilters) : null;
  const rf = filters.mode === 'relievers' ? (filters as ReliefFilters) : null;
  const inf = filters.mode === 'injured' ? (filters as InjuredFilters) : null;
  const shf = filters.mode === 'streamer-hitters' ? (filters as StreamerHitterFilters) : null;
  const spf = filters.mode === 'streamer-pitchers' ? (filters as StreamerPitcherFilters) : null;
  const prpf = filters.mode === 'prospects' ? (filters as ProspectFilters) : null;

  const defaultRosterTeams = useMemo(
    () => getDefaultRosterTeams(leagueFantasyTeams),
    [leagueFantasyTeams]
  );
  const activeTeamSelection = filters.selectedTeams;
  const hasDefaultRosterFocus =
    defaultRosterTeams.length > 0 &&
    activeTeamSelection.length === defaultRosterTeams.length &&
    defaultRosterTeams.every((team) => activeTeamSelection.includes(team));

  const activeFilterCount =
    (activeTeamSelection.length > 0 ? 1 : 0) +
    (hf != null && hf.selectedPositions.length > 0 ? 1 : 0) +
    (prpf != null && prpf.selectedPositions.length > 0 ? 1 : 0) +
    (hf != null && hf.timeWindow !== 'STD' ? 1 : 0) +
    (prpf != null && prpf.maxAge != null ? 1 : 0) +
    (prpf != null && prpf.rosterFilter !== 'all' ? 1 : 0) +
    (prpf != null && prpf.selectedLevels.length > 0 ? 1 : 0);

  return (
    <div className="border-b bg-background">
      {/* Mobile toggle header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5 md:hidden"
        aria-expanded={isOpen}
        aria-controls="filterbar-panel"
        onClick={() => setIsOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Filters</span>
          {!isOpen && activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Filter content — collapsible on mobile, always visible on desktop */}
      <div
        id="filterbar-panel"
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none md:!grid-rows-[1fr] ${
          isMobile ? (isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]') : 'grid-rows-[1fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 px-3 pb-3 md:flex-row md:flex-wrap md:items-center md:gap-3 md:px-4 md:py-4">
            {/* League selector */}
            <div className="flex flex-col gap-1 w-full md:w-auto">
              <label htmlFor="filter-league" className="text-xs font-medium text-muted-foreground">League</label>
              <Select
                value={selectedLeague}
                onValueChange={(v) => {
                  if (v != null) onLeagueChange(v)
                }}
              >
                <SelectTrigger id="filter-league" className="w-full md:w-[200px]">
                  <SelectValue placeholder="League" />
                </SelectTrigger>
                <SelectContent>
                  {filterOptions.leagues.map((league) => (
                    <SelectItem key={league} value={league}>
                      {league}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fantasy Team multi-select — hitters and prospects */}
            {(hf != null || prpf != null) && (
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <label htmlFor="filter-fantasy-team" className="text-xs font-medium text-muted-foreground">Fantasy Team</label>
                <MultiSelect
                  id="filter-fantasy-team"
                  options={leagueFantasyTeams}
                  selected={filters.selectedTeams}
                  onChange={(teams) => onFiltersChange({ ...filters, selectedTeams: teams })}
                  placeholder="All Teams"
                />
                {hasDefaultRosterFocus && (
                  <p className="text-[11px] text-muted-foreground">
                    Default roster focus active (Free Agent)
                  </p>
                )}
              </div>
            )}

            {/* Position multi-select */}
            {(hf != null || prpf != null) && (
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <label htmlFor="filter-position" className="text-xs font-medium text-muted-foreground">Position</label>
                <MultiSelect
                  id="filter-position"
                  options={
                    hf != null
                      ? filterOptions.positions.filter((p) => p !== 'SP' && p !== 'RP')
                      : prospectPositions
                  }
                  selected={hf != null ? hf.selectedPositions : (prpf?.selectedPositions ?? [])}
                  onChange={(positions) => onFiltersChange({ ...filters, selectedPositions: positions } as HitterFilters | ProspectFilters)}
                  placeholder="All Positions"
                />
              </div>
            )}

            {prpf != null && prospectLevelOptions.length > 0 && (
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <label htmlFor="filter-level" className="text-xs font-medium text-muted-foreground">Level</label>
                <MultiSelect
                  id="filter-level"
                  options={prospectLevelOptions}
                  selected={prpf.selectedLevels}
                  onChange={(levels) => onFiltersChange({ ...prpf, selectedLevels: levels })}
                  placeholder="All Levels"
                />
              </div>
            )}

            {prpf != null && (
              <div className="flex flex-col gap-1 w-full md:w-[140px]">
                <label htmlFor="filter-rostered" className="text-xs font-medium text-muted-foreground">Rostered</label>
                <Select
                  value={prpf.rosterFilter}
                  onValueChange={(value) =>
                    onFiltersChange({ ...prpf, rosterFilter: value as 'all' | 'rostered' | 'available' })
                  }
                >
                  <SelectTrigger id="filter-rostered" className="w-full md:w-[140px]">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="rostered">Rostered</SelectItem>
                    <SelectItem value="available">Available</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {prpf != null && (
              <div className="flex flex-col gap-1 w-full md:w-[140px]">
                <label htmlFor="filter-age" className="text-xs font-medium text-muted-foreground">Age ≤</label>
                <Select
                  value={prpf.maxAge != null ? String(prpf.maxAge) : 'any'}
                  onValueChange={(value) => onFiltersChange({ ...prpf, maxAge: value === 'any' ? null : Number(value) })}
                >
                  <SelectTrigger id="filter-age" className="w-full md:w-[120px]">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {prospectAgeOptions.map((age) => (
                      <SelectItem key={age} value={String(age)}>
                        {age}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Fantasy Team multi-select — hitter rankings / pitchers / relievers / injured / streamers (right-aligned) */}
            {(hrf != null || pf != null || rf != null || inf != null || shf != null || spf != null) && (
              <div className="flex flex-col gap-1 w-full md:w-auto md:ml-auto">
                <label htmlFor="filter-fantasy-team" className="text-xs font-medium text-muted-foreground">Fantasy Team</label>
                <MultiSelect
                  id="filter-fantasy-team"
                  options={leagueFantasyTeams}
                  selected={filters.selectedTeams}
                  onChange={(teams) => onFiltersChange({ ...filters, selectedTeams: teams })}
                  placeholder="All Teams"
                  selectAllLabel="Select All Teams"
                />
                {hasDefaultRosterFocus && (
                  <p className="text-[11px] text-muted-foreground">
                    Default roster focus active (Free Agent)
                  </p>
                )}
              </div>
            )}

            {/* Time Window toggle */}
            {hf != null && (
              <div className="flex flex-col gap-1 w-full md:w-auto md:ml-auto">
                <label id="filter-time-window-label" className="text-xs font-medium text-muted-foreground">Time Window</label>
                <ToggleGroup
                  aria-labelledby="filter-time-window-label"
                  value={[hf.timeWindow]}
                  onValueChange={(newValue: string[]) => {
                    if (newValue.length > 0) {
                      const latest = newValue[newValue.length - 1];
                      onFiltersChange({ ...hf, timeWindow: latest as HitterFilters['timeWindow'] });
                    }
                  }}
                >
                  {TIME_WINDOWS.map((tw) => (
                    <ToggleGroupItem key={tw} value={tw} className="px-3 text-sm">
                      {tw}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}

            <div className="flex flex-col gap-1 w-full md:w-[220px]">
              <label htmlFor="filter-player-name" className="text-xs font-medium text-muted-foreground">
                {mode === 'hitters'
                  ? 'Player Name'
                  : mode === 'hitter-rankings'
                    ? 'Hitter Name'
                  : mode === 'pitchers'
                    ? 'Pitcher Name'
                    : mode === 'relievers'
                      ? 'Reliever Name'
                      : mode === 'injured'
                        ? 'Pitcher Name'
                      : mode === 'streamer-hitters'
                        ? 'Hitter Name'
                      : mode === 'streamer-pitchers'
                        ? 'Pitcher Name'
                      : 'Prospect Name'}
              </label>
              <Input
                id="filter-player-name"
                value={searchDraft}
                onChange={(event) => onSearchDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onSearchSubmit();
                  }
                }}
                placeholder="Type name and press Enter"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
