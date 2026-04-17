export type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'unknown';
export type ReliefScoringMode = 'svhld' | 'saves';

export interface PitcherListRankRow {
  latest_rank: number;
  player_name: string;
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: TrendDirection;
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
      'Unable to reach the local app server. Confirm Vite is running and reload the page.'
    );
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

export async function fetchLatestPitcherList(): Promise<PitcherListLatestResponse> {
  let response: Response;

  try {
    response = await fetch('/api/pitcher-list/latest');
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
    response = await fetch(`/api/relief-list/latest?scoring=${scoringMode}`);
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
