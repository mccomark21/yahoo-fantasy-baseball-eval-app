export type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'unknown';

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
  rows: ReliefListRankRow[];
}

export async function fetchLatestPitcherList(): Promise<PitcherListLatestResponse> {
  const response = await fetch('/api/pitcher-list/latest');

  if (!response.ok) {
    throw new Error(`Pitcher List API request failed (${response.status})`);
  }

  const payload = (await response.json()) as PitcherListLatestResponse;
  if (!Array.isArray(payload.rows)) {
    throw new Error('Pitcher List API payload is missing rows');
  }

  return payload;
}

export async function fetchLatestReliefList(): Promise<ReliefListLatestResponse> {
  const response = await fetch('/api/relief-list/latest');

  if (!response.ok) {
    throw new Error(`Relief List API request failed (${response.status})`);
  }

  const payload = (await response.json()) as ReliefListLatestResponse;
  if (!Array.isArray(payload.rows)) {
    throw new Error('Relief List API payload is missing rows');
  }

  return payload;
}
