import { getDB } from './duckdb';

const YAHOO_CSV_URL =
  'https://raw.githubusercontent.com/mccomark21/yahoo-fantasy-data-hub/main/data/fantasy_baseball_latest.csv';
const PYBASEBALL_PARQUET_URL =
  'https://raw.githubusercontent.com/mccomark21/pybaseball-data-hub/main/data/processed/batter_game_log_enriched.parquet';

const CACHE_DB_NAME = 'fantasy-eval-cache';
const CACHE_STORE = 'files';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CacheEntry {
  data: ArrayBuffer;
  timestamp: number;
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

async function getCached(key: string): Promise<ArrayBuffer | null> {
  try {
    const cacheDB = await openCacheDB();
    return new Promise((resolve) => {
      const tx = cacheDB.transaction(CACHE_STORE, 'readonly');
      const store = tx.objectStore(CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
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

async function fetchWithCache(url: string): Promise<Uint8Array> {
  const cached = await getCached(url);
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

export async function loadData(): Promise<void> {
  const db = await getDB();

  const [csvBytes, parquetBytes] = await Promise.all([
    fetchWithCache(YAHOO_CSV_URL),
    fetchWithCache(PYBASEBALL_PARQUET_URL),
  ]);

  await db.registerFileBuffer('yahoo.csv', csvBytes);
  await db.registerFileBuffer('game_logs.parquet', parquetBytes);

  const conn = await db.connect();
  try {
    await conn.query(`
      CREATE OR REPLACE TABLE yahoo AS
      SELECT *,
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(player_name, '\s+(Jr\.?|Sr\.?|II|III|IV)$', '', 'i'),
            '[^a-zA-Z ]', '', 'g'
          )
        ) AS norm_name
      FROM read_csv_auto('yahoo.csv')
    `);

    await conn.query(`
      CREATE OR REPLACE TABLE game_logs AS
      SELECT *,
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              TRIM(SPLIT_PART(player_name, ',', 2)) || ' ' || TRIM(SPLIT_PART(player_name, ',', 1)),
              '\s+(Jr\.?|Sr\.?|II|III|IV)$', '', 'i'
            ),
            '[^a-zA-Z ]', '', 'g'
          )
        ) AS norm_name
      FROM read_parquet('game_logs.parquet')
    `);

    // Verify tables loaded
    const yahooCount = await conn.query('SELECT COUNT(*) as cnt FROM yahoo');
    const logsCount = await conn.query('SELECT COUNT(*) as cnt FROM game_logs');
    console.log(
      `[data] yahoo: ${yahooCount.toArray()[0].cnt} rows, game_logs: ${logsCount.toArray()[0].cnt} rows`
    );
  } finally {
    await conn.close();
  }
}
