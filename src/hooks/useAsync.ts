import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { publicErrorMessage, toErrorMessage } from '@/lib/errors';

export interface AsyncState<T> {
  data: T | undefined;
  /** Detailed message, suitable for the admin. */
  error: string | null;
  /** Neutral message for public visitors (no technical detail). */
  publicError: string | null;
  loading: boolean;
}

/**
 * Runs an async loader when `deps` change and exposes loading/error/data,
 * plus `reload()` and `setData()` for optimistic updates after mutations.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: null, publicError: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null, publicError: null }));
    loaderRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, publicError: null, loading: false });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ data: undefined, error: toErrorMessage(err), publicError: publicErrorMessage(err), loading: false });
        }
      });
    return () => {
      cancelled = true;
    };
    // `deps` is spread intentionally: callers pass the values the loader depends on.
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: (prev: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, reload, setData };
}
