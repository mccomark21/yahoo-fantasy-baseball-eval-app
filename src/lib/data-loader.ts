import { getDB } from './duckdb';

const YAHOO_CSV_URL =
  'https://raw.githubusercontent.com/mccomark21/yahoo-fantasy-data-hub/main/data/fantasy_baseball_latest.csv';
const PYBASEBALL_PARQUET_URL =
  'https://raw.githubusercontent.com/mccomark21/pybaseball-data-hub/main/data/processed/batter_game_log_enriched.parquet';
const PROSPECTS_SNAPSHOT_PARQUET_URL =
  'https://raw.githubusercontent.com/mccomark21/pybaseball-data-hub/main/data/processed/prospects_snapshot.parquet?v=20260428';

const CACHE_DB_NAME = 'fantasy-eval-cache';
const CACHE_STORE = 'files';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CachePolicy {
  ttlMs: number;
  requireSameLocalDay?: boolean;
}

const DEFAULT_CACHE_POLICY: CachePolicy = {
  ttlMs: CACHE_TTL_MS,
};

const YAHOO_CACHE_POLICY: CachePolicy = {
  ttlMs: CACHE_TTL_MS,
  requireSameLocalDay: true,
};

interface CacheEntry {
  data: ArrayBuffer;
  timestamp: number;
}

function toLocalDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(CACHE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCached(key: string, policy: CachePolicy = DEFAULT_CACHE_POLICY): Promise<ArrayBuffer | null> {
  try {
    const cacheDB = await openCacheDB();
    return new Promise((resolve) => {
      const tx = cacheDB.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        const cacheIsFresh =
          entry && Date.now() - entry.timestamp < policy.ttlMs;
        const sameDayOrNotRequired =
          !policy.requireSameLocalDay ||
          (entry != null && toLocalDayKey(entry.timestamp) === toLocalDayKey(Date.now()));

        if (entry && cacheIsFresh && sameDayOrNotRequired) {
          resolve(entry.data);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setCache(key: string, data: ArrayBuffer): Promise<void> {
  try {
    const cacheDB = await openCacheDB();
    const tx = cacheDB.transaction(CACHE_STORE, 'readwrite');
    const store = tx.objectStore(CACHE_STORE);
    store.put({ data, timestamp: Date.now() } satisfies CacheEntry, key);
  } catch {
    // Cache write failure is non-critical
  }
}

async function fetchWithCache(url: string, policy: CachePolicy = DEFAULT_CACHE_POLICY): Promise<Uint8Array> {
  const cached = await getCached(url, policy);
  if (cached) {
    console.log(`[cache hit] ${url}`);
    return new Uint8Array(cached);
  }

  console.log(`[fetching] ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  await setCache(url, buf);
  return new Uint8Array(buf);
}

/**
 * Manual name-alias map: keys are normalized Yahoo names, values are the
 * corresponding normalized pybaseball names.  Add entries here whenever a
 * player's Yahoo display name doesn't match the pybaseball "Last, First"
 * format after normalization.
 *
 * To diagnose new mismatches open the browser console after load — any
 * Yahoo batters with no game-log match are logged automatically.
 */
const NAME_ALIASES: Record<string, string> = {
  // JJ Wetherholt and Kazuma Okamoto are NOT in the pybaseball enriched
  // parquet at all (missing from Statcast player ID system).  Aliases
  // won't help — they need to be added to the pybaseball player_index
  // upstream.  Keeping this map for future name-format mismatches.
};

/** Build a SQL CASE expression that remaps norm_name via NAME_ALIASES. */
function buildAliasCase(inputExpr: string): string {
  const entries = Object.entries(NAME_ALIASES);
  if (entries.length === 0) return inputExpr;

  const whens = entries
    .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
    .join(' ');
  return `CASE ${inputExpr} ${whens} ELSE ${inputExpr} END`;
}

export async function loadData(): Promise<void> {
  const db = await getDB();

  const [csvBytes, parquetBytes, prospectsBytes] = await Promise.all([
    fetchWithCache(YAHOO_CSV_URL, YAHOO_CACHE_POLICY),
    fetchWithCache(PYBASEBALL_PARQUET_URL),
    fetchWithCache(PROSPECTS_SNAPSHOT_PARQUET_URL),
  ]);

  await db.registerFileBuffer('yahoo.csv', csvBytes);
  await db.registerFileBuffer('game_logs.parquet', parquetBytes);
  await db.registerFileBuffer('prospects_snapshot.parquet', prospectsBytes);

  const conn = await db.connect();
  try {
    // Normalization pipeline shared by both tables:
    // 1. STRIP_ACCENTS — transliterate diacritics to ASCII (á→a, ñ→n, etc.)
    // 2. Remove name suffixes (Jr, Sr, II, III, IV)
    // 3. Strip remaining non-alpha/non-space characters
    // 4. Lower-case

    const yahooRawNorm = `LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              STRIP_ACCENTS(player_name),
              '\\s+(Jr\\.?|Sr\\.?|II|III|IV)$', '', 'i'),
            '[^a-zA-Z ]', '', 'g'
          )
        )`;

    await conn.query(`
      CREATE OR REPLACE TABLE yahoo AS
      WITH yahoo_src AS (
        SELECT *,
          ${buildAliasCase(yahooRawNorm)} AS norm_name,
          ROW_NUMBER() OVER () AS source_row_num
        FROM read_csv_auto('yahoo.csv')
      ),
      yahoo_ranked AS (
        SELECT *,
          CASE
            WHEN primary_position NOT IN ('SP', 'RP')
              THEN ROW_NUMBER() OVER (
                PARTITION BY league_name, norm_name
                ORDER BY source_row_num DESC
              )
            ELSE 1
          END AS keep_rank
        FROM yahoo_src
      )
      SELECT * EXCLUDE (source_row_num, keep_rank)
      FROM yahoo_ranked
      WHERE keep_rank = 1
    `);

    await conn.query(`
      CREATE OR REPLACE TABLE game_logs AS
      SELECT *,
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              TRIM(SPLIT_PART(STRIP_ACCENTS(player_name), ',', 2))
              || ' ' ||
              TRIM(SPLIT_PART(STRIP_ACCENTS(player_name), ',', 1)),
              '\\s+(Jr\\.?|Sr\\.?|II|III|IV)$', '', 'i'
            ),
            '[^a-zA-Z ]', '', 'g'
          )
        ) AS norm_name
      FROM read_parquet('game_logs.parquet')
    `);

    await conn.query(`
      CREATE OR REPLACE TABLE prospects AS
      SELECT *
      FROM read_parquet('prospects_snapshot.parquet')
    `);

    // Verify tables loaded
    const yahooCount = await conn.query('SELECT COUNT(*) as cnt FROM yahoo');
    const logsCount = await conn.query('SELECT COUNT(*) as cnt FROM game_logs');
    const prospectsCount = await conn.query('SELECT COUNT(*) as cnt FROM prospects');
    console.log(
      `[data] yahoo: ${yahooCount.toArray()[0].cnt} rows, game_logs: ${logsCount.toArray()[0].cnt} rows, prospects: ${prospectsCount.toArray()[0].cnt} rows`
    );

    // Diagnostic: log Yahoo batters with no game-log match
    const unmatched = await conn.query(`
      SELECT DISTINCT y.player_name, y.norm_name
      FROM yahoo y
      LEFT JOIN game_logs g ON y.norm_name = g.norm_name
      WHERE g.norm_name IS NULL
        AND y.primary_position NOT IN ('SP', 'RP')
      ORDER BY y.player_name
    `);
    const rows = unmatched.toArray();
    if (rows.length > 0) {
      console.warn(
        `[data] ${rows.length} Yahoo batter(s) have no Statcast match:`,
        rows.map((r) => `${r.player_name} (norm: "${r.norm_name}")`),
      );
    }
  } finally {
    await conn.close();
  }
}
