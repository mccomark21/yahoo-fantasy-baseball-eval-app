// Client for the CBS weekly streamer feeds (issues #19 & #20). Mirrors the
// dev-middleware / static-snapshot split used by pitcherlist-client.ts.

export type StreamerKind = 'hitters' | 'pitchers';

export interface StreamerMatchup {
  /** Game date 'YYYY-MM-DD', or null when the schedule lookup couldn't place it. */
  date: string | null;
  /** Canonical MLB opponent abbreviation, e.g. 'DET'. */
  opponent: string;
  /** true = home game, false = away game. */
  home: boolean;
}

export interface CbsStreamerRow {
  player_name: string;
  mlb_team: string | null;
  positions: string[];
  matchups: StreamerMatchup[];
  games: number;
  /** Pitchers only: the player is lined up for two starts this week. */
  two_start: boolean;
  /** The analyst's short per-player writeup from the CBS column. */
  blurb: string | null;
}

export interface CbsStreamerLatestResponse {
  kind: StreamerKind;
  title: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  week_label: string | null;
  week_start: string | null;
  week_end: string | null;
  rows: CbsStreamerRow[];
}

function formatCbsStreamerFetchError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      'Unable to reach the streamer source. Confirm the app is deployed correctly and reload the page.'
    );
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function buildAppUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

function getStreamerEndpoint(kind: StreamerKind): string {
  const feed = kind === 'hitters' ? 'cbs-streamer-hitters' : 'cbs-streamer-pitchers';
  if (import.meta.env.DEV) {
    return `/api/${feed}/latest`;
  }
  return buildAppUrl(`api/${feed}/latest.json`);
}

export async function fetchLatestCbsStreamer(
  kind: StreamerKind
): Promise<CbsStreamerLatestResponse> {
  let response: Response;

  try {
    response = await fetch(getStreamerEndpoint(kind));
  } catch (error) {
    throw formatCbsStreamerFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`CBS streamer ${kind} API request failed (${response.status})`);
  }

  const payload = (await response.json()) as CbsStreamerLatestResponse;
  if (!Array.isArray(payload.rows)) {
    throw new Error(`CBS streamer ${kind} API payload is missing rows`);
  }

  return payload;
}
