import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Session } from '../types';

export type SyncStatus = 'loading' | 'ready' | 'saving' | 'error';

type Result = {
  sessions: Session[];
  /**
   * Apply `fn` to one session and persist just that session. Returning the
   * session unchanged makes the whole thing a no-op, network included.
   */
  mutateSession: (sessionId: string, fn: (session: Session) => Session) => void;
  /** Add a session locally and create it on the server in the background. */
  addSession: (session: Session) => void;
  removeSession: (sessionId: string) => void;
  /** Dev-only seeding: swap the whole list, session by session. */
  replaceAll: (next: Session[]) => void;
  status: SyncStatus;
  error: string | null;
  retry: () => void;
};

const ENDPOINT = '/api/sessions';

/**
 * Plain `vite` does not serve `/api`, so a request for it is answered with the
 * endpoint's own TypeScript source. Parsing that as JSON fails deep inside
 * with "Unexpected token 'i'", which says nothing about the actual problem —
 * that the API is not running.
 */
async function readJson(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error(
      import.meta.env.DEV
        ? 'The API is not running. Start it with `npm run dev:full` rather than `npm run dev`.'
        : 'The server sent something unexpected.',
    );
  }
  return res.json();
}

/**
 * The store's persistence seam, scoped to one session per write.
 *
 * The blob version rewrote an account's entire history on every keystroke that
 * committed. A write now names the session it touched, so editing one item's
 * price sends one session rather than all of them.
 *
 * Writes stay optimistic — state updates immediately and the request follows —
 * which is what keeps the app feeling as instant as it did on `localStorage`.
 * The cost is that a failure is discovered after the fact, so status and error
 * are surfaced rather than swallowed.
 */
export function useServerSessions(): Result {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  /**
   * Per-session write sequence. A slow request for one session must not report
   * success for state that has since moved on, and two sessions being written
   * at once must not interfere.
   */
  const seq = useRef(new Map<string, number>());

  const authedFetch = useCallback(
    async (path: string, init: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in.');
      return fetch(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
    },
    [getToken],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      setStatus('loading');
      setError(null);
      try {
        const res = await authedFetch(ENDPOINT, { method: 'GET' });
        if (!res.ok) throw new Error(`Could not load your data (${res.status}).`);
        const body = (await readJson(res)) as Session[];
        if (cancelled) return;
        setSessions(Array.isArray(body) ? body : []);
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
    async (session: Session) => {
      const mine = (seq.current.get(session.id) ?? 0) + 1;
      seq.current.set(session.id, mine);
      setStatus('saving');
      try {
        const res = await authedFetch(`${ENDPOINT}/${encodeURIComponent(session.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session),
        });
        if (!res.ok) throw new Error(`Could not save your changes (${res.status}).`);
        if (seq.current.get(session.id) !== mine) return;
        setError(null);
        setStatus('ready');
      } catch (err) {
        if (seq.current.get(session.id) !== mine) return;
        setError(err instanceof Error ? err.message : 'Could not save your changes.');
        setStatus('error');
      }
    },
    [authedFetch],
  );

  const mutateSession = useCallback(
    (sessionId: string, fn: (session: Session) => Session) => {
      setSessions((prev) => {
        const index = prev.findIndex((s) => s.id === sessionId);
        if (index === -1) return prev;
        const next = fn(prev[index]);
        // The store's guards return the session unchanged to mean "no-op";
        // that must not cost a round trip.
        if (next === prev[index]) return prev;
        const copy = [...prev];
        copy[index] = next;
        void save(next);
        return copy;
      });
    },
    [save],
  );

  const addSession = useCallback(
    (session: Session) => {
      setSessions((prev) => [...prev, session]);
      // The caller has already navigated into it, so this catches up rather
      // than being awaited.
      void (async () => {
        try {
          const res = await authedFetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: session.id }),
          });
          if (!res.ok) throw new Error(`Could not create the session (${res.status}).`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not create the session.');
          setStatus('error');
        }
      })();
    },
    [authedFetch],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      void (async () => {
        try {
          const res = await authedFetch(`${ENDPOINT}/${encodeURIComponent(sessionId)}`, {
            method: 'DELETE',
          });
          if (!res.ok && res.status !== 404) {
            throw new Error(`Could not delete the session (${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not delete the session.');
          setStatus('error');
        }
      })();
    },
    [authedFetch],
  );

  const replaceAll = useCallback(
    (next: Session[]) => {
      // Dev-only, so a request per session is fine — there is no bulk
      // endpoint, and adding one for a seeder that never ships would be
      // server surface built for nobody.
      setSessions((prev) => {
        void (async () => {
          try {
            setStatus('saving');
            for (const old of prev) {
              await authedFetch(`${ENDPOINT}/${encodeURIComponent(old.id)}`, {
                method: 'DELETE',
              });
            }
            for (const session of next) {
              await authedFetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: session.id }),
              });
              await authedFetch(`${ENDPOINT}/${encodeURIComponent(session.id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(session),
              });
            }
            setError(null);
            setStatus('ready');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not seed sessions.');
            setStatus('error');
          }
        })();
        return next;
      });
    },
    [authedFetch],
  );

  const retry = useCallback(() => setReloads((n) => n + 1), []);

  return {
    sessions,
    mutateSession,
    addSession,
    removeSession,
    replaceAll,
    status,
    error,
    retry,
  };
}
