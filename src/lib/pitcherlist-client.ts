export type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'unknown';
export type ReliefScoringMode = 'svhld' | 'saves';

export interface PitcherListRankRow {
  latest_rank: number;
  player_name: string;
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: TrendDirection;
  notes: string | null;
}

export interface PitcherListLatestResponse {
  title: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  rows: PitcherListRankRow[];
}

export interface ReliefListRankRow {
  latest_rank: number;
  player_name: string;
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: TrendDirection;
}

export interface ReliefListLatestResponse {
  title: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  scoring_mode: ReliefScoringMode;
  rows: ReliefListRankRow[];
}

function formatPitcherListFetchError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      'Unable to reach the rankings source. Confirm the app is deployed correctly and reload the page.'
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

function getPitcherListEndpoint(): string {
  if (import.meta.env.DEV) {
    return '/api/pitcher-list/latest';
  }
  return buildAppUrl('api/pitcher-list/latest.json');
}

function getReliefListEndpoint(scoringMode: ReliefScoringMode): string {
  if (import.meta.env.DEV) {
    return `/api/relief-list/latest?scoring=${scoringMode}`;
  }
  return buildAppUrl(`api/relief-list/latest.${scoringMode}.json`);
}

export async function fetchLatestPitcherList(): Promise<PitcherListLatestResponse> {
  let response: Response;

  try {
    response = await fetch(getPitcherListEndpoint());
  } catch (error) {
    throw formatPitcherListFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Pitcher List API request failed (${response.status})`);
  }

  const payload = (await response.json()) as PitcherListLatestResponse;
  if (!Array.isArray(payload.rows)) {
    throw new Error('Pitcher List API payload is missing rows');
  }

  return payload;
}

export async function fetchLatestReliefList(
  scoringMode: ReliefScoringMode = 'svhld'
): Promise<ReliefListLatestResponse> {
  let response: Response;

  try {
    response = await fetch(getReliefListEndpoint(scoringMode));
  } catch (error) {
    throw formatPitcherListFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Relief List API request failed (${response.status})`);
  }

  const payload = (await response.json()) as ReliefListLatestResponse;
  if (!Array.isArray(payload.rows)) {
    throw new Error('Relief List API payload is missing rows');
  }

  if (payload.scoring_mode !== 'svhld' && payload.scoring_mode !== 'saves') {
    throw new Error('Relief List API payload is missing scoring mode');
  }

  return payload;
}
