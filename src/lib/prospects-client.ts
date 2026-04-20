export type ProspectSourceName = 'mlb' | 'fangraphs' | 'prospects_live';

export interface ProspectSourceRow {
  source: ProspectSourceName;
  rank: number;
  player_name: string;
  org: string | null;
  positions: string[];
  age: number | null;
  eta: string | null;
  level: string | null;
  height: string | null;
  weight: string | null;
  bats: string | null;
  throws: string | null;
  fv: string | null;
  ofp: string | null;
  stats_summary: string | null;
  scouting_report: string | null;
  notes: string | null;
}

export interface ProspectSourceStatus {
  source: ProspectSourceName;
  title: string;
  source_url: string;
  published_at: string | null;
  scraped_at: string;
  status: 'ok' | 'error';
  row_count: number;
  error: string | null;
}

export interface ProspectsLatestResponse {
  title: string;
  scraped_at: string;
  sources: ProspectSourceStatus[];
  rows: ProspectSourceRow[];
}

function formatProspectsFetchError(error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      'Unable to reach prospect ranking sources. Confirm the app is running and reload the page.'
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

function getProspectsEndpoint(): string {
  if (import.meta.env.DEV) {
    return '/api/prospects/latest';
  }
  return buildAppUrl('api/prospects/latest.json');
}

export async function fetchLatestProspects(): Promise<ProspectsLatestResponse> {
  let response: Response;

  try {
    response = await fetch(getProspectsEndpoint());
  } catch (error) {
    throw formatProspectsFetchError(error);
  }

  if (!response.ok) {
    throw new Error(`Prospects API request failed (${response.status})`);
  }

  const payload = (await response.json()) as ProspectsLatestResponse;

  if (!Array.isArray(payload.rows)) {
    throw new Error('Prospects API payload is missing rows');
  }

  if (!Array.isArray(payload.sources)) {
    throw new Error('Prospects API payload is missing source statuses');
  }

  return payload;
}
