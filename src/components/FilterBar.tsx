import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { TimeWindow, FilterOptions } from '@/lib/queries';
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
  mode: 'hitters' | 'pitchers' | 'relievers' | 'prospects';
  filterOptions: FilterOptions;
  leagueFantasyTeams: string[];
  selectedLeague: string | null;
  onLeagueChange: (league: string | null) => void;
  selectedTeams: string[];
  onTeamsChange: (teams: string[]) => void;
  selectedPositions: string[];
  onPositionsChange: (positions: string[]) => void;
  timeWindow: TimeWindow;
  onTimeWindowChange: (tw: TimeWindow) => void;
  selectedPitcherTeams: string[];
  onPitcherTeamsChange: (values: string[]) => void;
  selectedReliefTeams: string[];
  onReliefTeamsChange: (values: string[]) => void;
  selectedProspectTeams: string[];
  onProspectTeamsChange: (values: string[]) => void;
  selectedProspectMaxAge: number | null;
  onProspectMaxAgeChange: (value: number | null) => void;
  selectedProspectRosterFilter: 'all' | 'rostered' | 'available';
  onProspectRosterFilterChange: (value: 'all' | 'rostered' | 'available') => void;
  selectedProspectLevels: string[];
  onProspectLevelsChange: (values: string[]) => void;
  prospectAgeOptions: number[];
  prospectLevelOptions: string[];
  prospectPositions: string[];
  searchDraft: string;
  onSearchDraftChange: (value: string) => void;
  onSearchSubmit: () => void;
}

const TIME_WINDOWS: TimeWindow[] = ['STD', '30D', '14D', '7D'];

export function FilterBar({
  mode,
  filterOptions,
  leagueFantasyTeams,
  selectedLeague,
  onLeagueChange,
  selectedTeams,
  onTeamsChange,
  selectedPositions,
  onPositionsChange,
  timeWindow,
  onTimeWindowChange,
  selectedPitcherTeams,
  onPitcherTeamsChange,
  selectedReliefTeams,
  onReliefTeamsChange,
  selectedProspectTeams,
  onProspectTeamsChange,
  selectedProspectMaxAge,
  onProspectMaxAgeChange,
  selectedProspectRosterFilter,
  onProspectRosterFilterChange,
  selectedProspectLevels,
  onProspectLevelsChange,
  prospectAgeOptions,
  prospectLevelOptions,
  prospectPositions,
  searchDraft,
  onSearchDraftChange,
  onSearchSubmit,
}: FilterBarProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const defaultRosterTeams = useMemo(
    () => getDefaultRosterTeams(leagueFantasyTeams),
    [leagueFantasyTeams]
  );
  const activeTeamSelection =
    mode === 'hitters'
      ? selectedTeams
      : mode === 'pitchers'
        ? selectedPitcherTeams
        : mode === 'relievers'
          ? selectedReliefTeams
          : selectedProspectTeams;
  const hasDefaultRosterFocus =
    defaultRosterTeams.length > 0 &&
    activeTeamSelection.length === defaultRosterTeams.length &&
    defaultRosterTeams.every((team) => activeTeamSelection.includes(team));

  const activeFilterCount =
    (activeTeamSelection.length > 0 ? 1 : 0) +
    ((mode === 'hitters' || mode === 'prospects') && selectedPositions.length > 0 ? 1 : 0) +
    (mode === 'hitters' && timeWindow !== 'STD' ? 1 : 0) +
    (mode === 'prospects' && selectedProspectMaxAge != null ? 1 : 0) +
    (mode === 'prospects' && selectedProspectRosterFilter !== 'all' ? 1 : 0) +
    (mode === 'prospects' && selectedProspectLevels.length > 0 ? 1 : 0) +
    ((mode === 'pitchers' && selectedPitcherTeams.length > 0) ||
    (mode === 'relievers' && selectedReliefTeams.length > 0) ||
    (mode === 'prospects' && selectedProspectTeams.length > 0)
      ? 1
      : 0);

  return (
    <div className="border-b bg-background">
      {/* Mobile toggle header */}
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2.5 md:hidden"
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
        className={`grid transition-[grid-template-rows] duration-200 ease-out md:!grid-rows-[1fr] ${
          isMobile ? (isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]') : 'grid-rows-[1fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-3 px-3 pb-3 md:flex-row md:flex-wrap md:items-center md:gap-3 md:px-4 md:py-4">
            {/* League selector */}
            <div className="flex flex-col gap-1 w-full md:w-auto">
              <label className="text-xs font-medium text-muted-foreground">League</label>
              <Select
                value={selectedLeague ?? undefined}
                onValueChange={(v) => onLeagueChange(v || null)}
              >
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Leagues" />
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

            {/* Fantasy Team multi-select */}
            {(mode === 'hitters' || mode === 'prospects') && (
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <label className="text-xs font-medium text-muted-foreground">Fantasy Team</label>
                <MultiSelect
                  options={leagueFantasyTeams}
                  selected={mode === 'hitters' ? selectedTeams : selectedProspectTeams}
                  onChange={mode === 'hitters' ? onTeamsChange : onProspectTeamsChange}
                  placeholder="All Teams"
                />
                {hasDefaultRosterFocus && (
                  <p className="text-[11px] text-muted-foreground">
                    Default roster focus active (Free Agent/Waiver)
                  </p>
                )}
              </div>
            )}

            {/* Position multi-select */}
            {(mode === 'hitters' || mode === 'prospects') && (
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <label className="text-xs font-medium text-muted-foreground">Position</label>
                <MultiSelect
                  options={
                    mode === 'hitters'
                      ? filterOptions.positions.filter((p) => p !== 'SP' && p !== 'RP')
                      : prospectPositions
                  }
                  selected={selectedPositions}
                  onChange={onPositionsChange}
                  placeholder="All Positions"
                />
              </div>
            )}

            {mode === 'prospects' && prospectLevelOptions.length > 0 && (
              <div className="flex flex-col gap-1 w-full md:w-auto">
                <label className="text-xs font-medium text-muted-foreground">Level</label>
                <MultiSelect
                  options={prospectLevelOptions}
                  selected={selectedProspectLevels}
                  onChange={onProspectLevelsChange}
                  placeholder="All Levels"
                />
              </div>
            )}

            {mode === 'prospects' && (
              <div className="flex flex-col gap-1 w-full md:w-[140px]">
                <label className="text-xs font-medium text-muted-foreground">Rostered</label>
                <Select
                  value={selectedProspectRosterFilter}
                  onValueChange={(value) =>
                    onProspectRosterFilterChange(value as 'all' | 'rostered' | 'available')
                  }
                >
                  <SelectTrigger className="w-full md:w-[140px]">
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

            {mode === 'prospects' && (
              <div className="flex flex-col gap-1 w-full md:w-[140px]">
                <label className="text-xs font-medium text-muted-foreground">Age ≤</label>
                <Select
                  value={selectedProspectMaxAge != null ? String(selectedProspectMaxAge) : 'any'}
                  onValueChange={(value) => onProspectMaxAgeChange(value === 'any' ? null : Number(value))}
                >
                  <SelectTrigger className="w-full md:w-[120px]">
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

            {mode === 'pitchers' && (
              <div className="flex flex-col gap-1 w-full md:w-auto md:ml-auto">
                <label className="text-xs font-medium text-muted-foreground">Fantasy Team</label>
                <MultiSelect
                  options={leagueFantasyTeams}
                  selected={selectedPitcherTeams}
                  onChange={onPitcherTeamsChange}
                  placeholder="All Teams"
                  selectAllLabel="Select All Teams"
                />
                {hasDefaultRosterFocus && (
                  <p className="text-[11px] text-muted-foreground">
                    Default roster focus active (Free Agent/Waiver)
                  </p>
                )}
              </div>
            )}

            {mode === 'relievers' && (
              <div className="flex flex-col gap-1 w-full md:w-auto md:ml-auto">
                <label className="text-xs font-medium text-muted-foreground">Fantasy Team</label>
                <MultiSelect
                  options={leagueFantasyTeams}
                  selected={selectedReliefTeams}
                  onChange={onReliefTeamsChange}
                  placeholder="All Teams"
                  selectAllLabel="Select All Teams"
                />
                {hasDefaultRosterFocus && (
                  <p className="text-[11px] text-muted-foreground">
                    Default roster focus active (Free Agent/Waiver)
                  </p>
                )}
              </div>
            )}

            {/* Time Window toggle */}
            {mode === 'hitters' && (
              <div className="flex flex-col gap-1 w-full md:w-auto md:ml-auto">
                <label className="text-xs font-medium text-muted-foreground">Time Window</label>
                <ToggleGroup
                  value={[timeWindow]}
                  onValueChange={(newValue: string[]) => {
                    if (newValue.length > 0) {
                      const latest = newValue[newValue.length - 1];
                      onTimeWindowChange(latest as TimeWindow);
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
              <label className="text-xs font-medium text-muted-foreground">
                {mode === 'hitters'
                  ? 'Player Name'
                  : mode === 'pitchers'
                    ? 'Pitcher Name'
                    : mode === 'relievers'
                      ? 'Reliever Name'
                      : 'Prospect Name'}
              </label>
              <Input
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
