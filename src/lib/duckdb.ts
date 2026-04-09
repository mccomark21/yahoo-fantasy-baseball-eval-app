import * as duckdb from '@duckdb/duckdb-wasm';

let db: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);

    const worker = await duckdb.createWorker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const instance = new duckdb.AsyncDuckDB(logger, worker);
    await instance.instantiate(bundle.mainModule, bundle.pthreadWorker);

    db = instance;
    return instance;
  })();

  return initPromise;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  const database = await getDB();
  return database.connect();
}
