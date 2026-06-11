import { useCallback, useEffect, useState } from 'react';
import { loadData } from './data-loader';

/**
 * Explicit status for the DuckDB data-loading lifecycle.
 *
 * - `unloaded`  Initial state before the load has started.
 * - `loading`   `loadData()` is in-flight.
 * - `ready`     All files are registered in DuckDB and queries can run.
 * - `error`     The load failed; inspect `error` for details.
 */
export type DataSourceStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export interface UseLoadDataResult {
  status: DataSourceStatus;
  error: string | null;
  retry: () => void;
}

/**
 * Kicks off the DuckDB data load once on mount and tracks its status.
 *
 * Consumers should gate any queries on `status === 'ready'`.
 * Call `retry()` to re-attempt after an error.
 */
export function useLoadData(): UseLoadDataResult {
  const [status, setStatus] = useState<DataSourceStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setError(null);
    loadData()
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  const retry = useCallback(() => setRetryCount((c) => c + 1), []);

  return { status, error, retry };
}
