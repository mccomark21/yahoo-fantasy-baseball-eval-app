import { useCallback, useState } from 'react';

interface RunAsyncTaskOptions<T> {
  task: () => Promise<T>;
  onSuccess: (value: T) => void;
  onError?: () => void;
}

export function useAsyncTask() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async <T>({ task, onSuccess, onError }: RunAsyncTaskOptions<T>) => {
    setLoading(true);
    setError(null);

    try {
      const value = await task();
      onSuccess(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onError?.();
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    run,
  };
}
