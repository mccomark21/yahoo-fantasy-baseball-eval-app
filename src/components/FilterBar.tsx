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

interface FilterBarProps {
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
}

const TIME_WINDOWS: TimeWindow[] = ['STD', '30D', '14D', '7D'];

export function FilterBar({
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
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 border-b bg-background">
      {/* League selector */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">League</label>
        <Select
          value={selectedLeague ?? undefined}
          onValueChange={(v) => onLeagueChange(v || null)}
        >
          <SelectTrigger className="w-[200px]">
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
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Fantasy Team</label>
        <MultiSelect
          options={leagueFantasyTeams}
          selected={selectedTeams}
          onChange={onTeamsChange}
          placeholder="All Teams"
        />
      </div>

      {/* Position multi-select */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Position</label>
        <MultiSelect
          options={filterOptions.positions.filter(p => p !== 'SP' && p !== 'RP')}
          selected={selectedPositions}
          onChange={onPositionsChange}
          placeholder="All Positions"
        />
      </div>

      {/* Time Window toggle */}
      <div className="flex flex-col gap-1 ml-auto">
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
    </div>
  );
}
