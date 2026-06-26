export type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'unknown';
export type ReliefScoringMode = 'svhld' | 'saves';
export type PitcherSourceList = 'SP' | 'RP';

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

export interface PitcherListHistorySnapshot extends PitcherListLatestResponse {
  snapshot_date: string;
}

export interface PitcherListHistoryResponse {
  snapshots: PitcherListHistorySnapshot[];
}

// The Pitcher List hitter board shares the SP/RP rank-row shape exactly
// (rank, player, team, weekly movement, trend direction, optional note), so it
// reuses the same payload types under hitter-named aliases for call-site clarity.
export type HitterListRankRow = PitcherListRankRow;
export type HitterListLatestResponse = PitcherListLatestResponse;
export type HitterListHistorySnapshot = PitcherListHistorySnapshot;
export type HitterListHistoryResponse = PitcherListHistoryResponse;

export interface ReliefListRankRow {
  latest_rank: number;
  player_name: string;
  mlb_team: string | null;
  movement_raw: string;
  movement_value: number | null;
  trend_direction: TrendDirection;
  notes: string | null;
}

export interface ReliefListLatestResponse {
  title: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  scoring_mode: ReliefScoringMode;
  rows: ReliefListRankRow[];
}

export interface ReliefListHistorySnapshot extends ReliefListLatestResponse {
  snapshot_date: string;
}

export interface ReliefListHistoryResponse {
  snapshots: ReliefListHistorySnapshot[];
}

export interface InjuredPitcherRow {
  rank_when_healthy: number | null;
  player_name: string;
  mlb_team: string | null;
  injury_note: string | null;
  source_list: PitcherSourceList;
}

export interface InjuredPitchersLatestResponse {
  title: string;
  source_urls: {
    sp: string;
    rp: string;
  };
  scraped_at: string;
  rows: InjuredPitcherRow[];
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

function getPitcherListHistoryEndpoint(): string {
  if (import.meta.env.DEV) {
    return '/api/pitcher-list/history';
  }
  return buildAppUrl('api/pitcher-list/history.json');
}

function getHitterListEndpoint(): string {
  if (import.meta.env.DEV) {
    return '/api/hitter-list/latest';
  }
  return buildAppUrl('api/hitter-list/latest.json');
}

function getHitterListHistoryEndpoint(): string {
  if (import.meta.env.DEV) {
    return '/api/hitter-list/history';
  }
  return buildAppUrl('api/hitter-list/history.json');
}

function getReliefListEndpoint(scoringMode: ReliefScoringMode): string {
  if (import.meta.env.DEV) {
    return `/api/relief-list/latest?scoring=${scoringMode}`;
  }
  return buildAppUrl(`api/relief-list/latest.${scoringMode}.json`);
}

function getReliefListHistoryEndpoint(scoringMode: ReliefScoringMode): string {
  if (import.meta.env.DEV) {
    return `/api/relief-list/history?scoring=${scoringMode}`;
  }
  return buildAppUrl(`api/relief-list/history.${scoringMode}.json`);
}

function getInjuredPitchersEndpoint(): string {
  if (import.meta.env.DEV) {
    return '/api/injured-pitchers/latest';
  }
  return buildAppUrl('api/injured-pitchers/latest.json');
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

export async function fetchPitcherListHistory(): Promise<PitcherListHistoryResponse> {
  let response: Response;

  try {
    response = await fetch(getPitcherListHistoryEndpoint());
  } catch (error) {
    throw formatPitcherListFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Pitcher List history API request failed (${response.status})`);
  }

  const payload = (await response.json()) as PitcherListHistoryResponse;
  if (!Array.isArray(payload.snapshots)) {
    throw new Error('Pitcher List history API payload is missing snapshots');
  }

  return payload;
}

export async function fetchLatestHitterList(): Promise<HitterListLatestResponse> {
  let response: Response;

  try {
    response = await fetch(getHitterListEndpoint());
  } catch (error) {
    throw formatPitcherListFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Hitter List API request failed (${response.status})`);
  }

  const payload = (await response.json()) as HitterListLatestResponse;
  if (!Array.isArray(payload.rows)) {
    throw new Error('Hitter List API payload is missing rows');
  }

  return payload;
}

export async function fetchHitterListHistory(): Promise<HitterListHistoryResponse> {
  let response: Response;

  try {
    response = await fetch(getHitterListHistoryEndpoint());
  } catch (error) {
    throw formatPitcherListFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Hitter List history API request failed (${response.status})`);
  }

  const payload = (await response.json()) as HitterListHistoryResponse;
  if (!Array.isArray(payload.snapshots)) {
    throw new Error('Hitter List history API payload is missing snapshots');
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

export async function fetchReliefListHistory(
  scoringMode: ReliefScoringMode = 'svhld'
): Promise<ReliefListHistoryResponse> {
  let response: Response;

  try {
    response = await fetch(getReliefListHistoryEndpoint(scoringMode));
  } catch (error) {
    throw formatPitcherListFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Relief List history API request failed (${response.status})`);
  }

  const payload = (await response.json()) as ReliefListHistoryResponse;
  if (!Array.isArray(payload.snapshots)) {
    throw new Error('Relief List history API payload is missing snapshots');
  }

  return payload;
}

export async function fetchLatestInjuredPitchers(): Promise<InjuredPitchersLatestResponse> {
  let response: Response;

  try {
    response = await fetch(getInjuredPitchersEndpoint());
  } catch (error) {
    throw formatPitcherListFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Injured pitchers API request failed (${response.status})`);
  }

  const payload = (await response.json()) as InjuredPitchersLatestResponse;
  if (!Array.isArray(payload.rows)) {
    throw new Error('Injured pitchers API payload is missing rows');
  }

  return payload;
}
