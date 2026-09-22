import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { EMPTY_DATA, parseAppData } from '../lib/storage';
import type { AppData } from '../types';

export type SyncStatus = 'loading' | 'ready' | 'saving' | 'error';

type Result = {
  data: AppData;
  setData: (updater: AppData | ((prev: AppData) => AppData)) => void;
  status: SyncStatus;
  /** Present when the last load or save failed. */
  error: string | null;
  retry: () => void;
};

const ENDPOINT = '/api/app-data';

/**
 * The server-backed twin of `useLocalStorageState`: same `[data, setData]`
 * contract, so the sessions store cannot tell the difference.
 *
 * Writes are optimistic — state updates immediately and the PUT follows — which
 * keeps the app feeling exactly as instant as it did on `localStorage`. The
 * cost is that a failed save is discovered after the fact, so the status and
 * error are surfaced for the UI to report rather than swallowed.
 */
export function useServerAppData(): Result {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [data, setValue] = useState<AppData>(EMPTY_DATA);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  /**
   * The newest blob a save was started for. A slow PUT that lands after a newer
   * one must not be allowed to report success for state that has moved on, and
   * saves are fired from event handlers rather than queued, so ordering is
   * tracked by sequence rather than assumed.
   */
  const saveSeq = useRef(0);

  const authedFetch = useCallback(
    async (init: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in.');
      return fetch(ENDPOINT, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
    },
    [getToken],
  );

  // Load once signed in, and again on an explicit retry.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      setStatus('loading');
      setError(null);
      try {
        const res = await authedFetch({ method: 'GET' });
        if (!res.ok) throw new Error(`Could not load your data (${res.status}).`);
        const body = await res.json();
        if (cancelled) return;
        // The same defensive parse the browser used against localStorage: the
        // response is still just JSON from somewhere else.
        setValue(parseAppData(JSON.stringify(body)));
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your data.');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authedFetch, isLoaded, isSignedIn, reloads]);

  const save = useCallback(
    async (next: AppData) => {
      const seq = (saveSeq.current += 1);
      setStatus('saving');
      try {
        const res = await authedFetch({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error(`Could not save your changes (${res.status}).`);
        // A newer save is already in flight; let that one report the outcome.
        if (seq !== saveSeq.current) return;
        setError(null);
        setStatus('ready');
      } catch (err) {
        if (seq !== saveSeq.current) return;
        setError(err instanceof Error ? err.message : 'Could not save your changes.');
        setStatus('error');
      }
    },
    [authedFetch],
  );

  const setData = useCallback(
    (updater: AppData | ((prev: AppData) => AppData)) => {
      setValue((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        // An updater that changes nothing (every no-op guard in the store
        // returns `prev`) must not cost a network round trip.
        if (next === prev) return prev;
        void save(next);
        return next;
      });
    },
    [save],
  );

  const retry = useCallback(() => setReloads((n) => n + 1), []);

  return { data, setData, status, error, retry };
}
