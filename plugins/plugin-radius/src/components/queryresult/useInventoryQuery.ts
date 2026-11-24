import { useEffect, useMemo } from 'react';
import useAsyncRetry from 'react-use/lib/useAsyncRetry';

// Callers memoize query so retained data belongs to that request only.
export function useInventoryQuery<T>(query: (previous?: T) => Promise<T>) {
  const retained = useMemo<{ query: typeof query; value?: T }>(
    () => ({ query }),
    [query],
  );
  const state = useAsyncRetry(async () => {
    try {
      return { query, value: await query(retained.value), error: undefined };
    } catch (error) {
      return {
        query,
        value: undefined,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }, [query, retained]);
  const result =
    state.value?.query === retained.query ? state.value : undefined;

  useEffect(() => {
    if (result?.value !== undefined) {
      retained.value = result.value;
    }
  }, [retained, result]);

  return {
    value: result?.value ?? retained.value,
    error: result?.error,
    loading: state.loading || !result,
    retry: state.retry,
  };
}
