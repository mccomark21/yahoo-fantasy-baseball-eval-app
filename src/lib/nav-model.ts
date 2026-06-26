import type { ViewMode } from './view-orchestration';

// ---------------------------------------------------------------------------
// Navigation model — the single source of truth for the two-tier nav.
//
// Tier 1 (primary) is the list of NavGroups; Tier 2 (sub-views) is each
// group's `views`. A group with a single view renders no secondary toolbar.
// New views (Hitter Rankings, Streamer Hitters/Pitchers, Pitcher StatCast …)
// plug in here and the nav scales without touching the components.
// ---------------------------------------------------------------------------

export type NavGroupId = 'hitters' | 'pitchers' | 'prospects';

export interface NavSubView {
  value: ViewMode;
  label: string;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  views: NavSubView[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'hitters',
    label: 'Hitters',
    views: [
      { value: 'hitters',          label: 'StatCast'  },
      { value: 'hitter-rankings',  label: 'Rankings'  },
      { value: 'streamer-hitters', label: 'Streamers' },
    ],
  },
  {
    id: 'pitchers',
    label: 'Pitchers',
    views: [
      { value: 'pitchers',          label: 'SP Rankings' },
      { value: 'relievers',         label: 'RP Rankings' },
      { value: 'injured',           label: 'Injured'     },
      { value: 'streamer-pitchers', label: 'Streamers'   },
    ],
  },
  {
    id: 'prospects',
    label: 'Prospects',
    views: [
      { value: 'prospects', label: 'Consensus' },
    ],
  },
];
