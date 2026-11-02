import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Session } from '../types';
import { createPendingWrites, createSaveQueue, mergeLoaded } from '../lib/writeQueue';

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

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Older Chrome and Safari still need returnValue set to show the prompt.
  event.returnValue = '';
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
 *
 * Saves for one session go one at a time, and edits made meanwhile fold into
 * one follow-up carrying the latest copy, so the server can never end on a
 * stale one. While any write is unconfirmed, leaving or reloading the page
 * asks first, because a reload cuts the request off and the next load would
 * show the server's older copy.
 */
export function useServerSessions(): Result {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  /**
   * The latest list, readable outside a render. A save must be sent exactly
   * once per edit, and StrictMode may run a state updater twice, so every
   * write reads and replaces this rather than using an updater. `commit` is
   * the one place that writes `sessions`, which keeps the two in step.
   */
  const sessionsRef = useRef<Session[]>([]);
  const commit = useCallback((next: Session[]) => {
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  /**
   * One save at a time per session. The server applies overlapping saves in
   * whatever order they reach the row lock, so without this a stale copy
   * could land last.
   */
  const [queue] = useState(() => createSaveQueue<Session>());

  /**
   * Every write the server hasn't confirmed yet. The leave prompt is attached
   * only while there is one, which keeps the page eligible for the
   * back/forward cache the rest of the time.
   */
  const [pending] = useState(() =>
    createPendingWrites((busy) =>
      busy
        ? window.addEventListener('beforeunload', warnBeforeLeaving)
        : window.removeEventListener('beforeunload', warnBeforeLeaving),
    ),
  );

  /**
   * Creates still in flight, by session id. A delete sent before its create has
   * landed finds nothing to delete, and the create then leaves the session
   * behind on the server, so a delete waits for the create first. The tour
   * deletes the session it made as soon as it ends, which is how this shows up.
   */
  const creating = useRef(new Map<string, Promise<unknown>>());

  /**
   * Deletes still in flight, by session id. A load that lands before the
   * server has applied one would otherwise show the deleted session again.
   */
  const deleting = useRef(new Set<string>());

  // Signing out unmounts the provider, possibly mid-save, and the prompt must
  // not outlive it.
  useEffect(() => () => window.removeEventListener('beforeunload', warnBeforeLeaving), []);

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
        // A load never overrides a write the server hasn't confirmed, so
        // "Try again" during a save, create or delete doesn't undo it on screen.
        commit(
          mergeLoaded(
            Array.isArray(body) ? body : [],
            sessionsRef.current,
            (id) => queue.isBusy(id) || creating.current.has(id),
            (id) => deleting.current.has(id),
          ),
        );
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
  }, [authedFetch, commit, isLoaded, isSignedIn, queue, reloads]);

  /**
   * Sends one save, and never rejects because it reports its own errors. A
   * result that a newer queued copy will supersede leaves the status alone, so
   * a slow request can't report success for state that has since moved on.
   */
  const put = useCallback(
    async (session: Session) => {
      try {
        const res = await authedFetch(`${ENDPOINT}/${encodeURIComponent(session.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(session),
        });
        if (!res.ok) throw new Error(`Could not save your changes (${res.status}).`);
        if (queue.hasPending(session.id)) return;
        setError(null);
        setStatus('ready');
      } catch (err) {
        if (queue.hasPending(session.id)) return;
        setError(err instanceof Error ? err.message : 'Could not save your changes.');
        setStatus('error');
      }
    },
    [authedFetch, queue],
  );

  const enqueueSave = useCallback(
    (session: Session) => {
      setStatus('saving');
      // A save folded into a running drain is covered by that drain's tracking.
      const drain = queue.enqueue(session.id, session, put);
      if (drain) pending.track(drain);
    },
    [pending, put, queue],
  );

  const mutateSession = useCallback(
    (sessionId: string, fn: (session: Session) => Session) => {
      const prev = sessionsRef.current;
      const index = prev.findIndex((s) => s.id === sessionId);
      if (index === -1) return;
      const next = fn(prev[index]);
      // The store's guards return the session unchanged to mean "no-op";
      // that must not cost a round trip.
      if (next === prev[index]) return;
      const copy = [...prev];
      copy[index] = next;
      commit(copy);
      enqueueSave(next);
    },
    [commit, enqueueSave],
  );

  const addSession = useCallback(
    (session: Session) => {
      commit([...sessionsRef.current, session]);
      // The caller has already navigated into it, so this catches up rather
      // than being awaited.
      const create = (async () => {
        try {
          const res = await authedFetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // The name chosen in the New Session prompt goes with the create, so
            // it is stored even if nothing else about the session is ever saved.
            body: JSON.stringify({ id: session.id, name: session.name }),
          });
          if (!res.ok) throw new Error(`Could not create the session (${res.status}).`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not create the session.');
          setStatus('error');
        } finally {
          creating.current.delete(session.id);
        }
      })();
      creating.current.set(session.id, create);
      pending.track(create);
    },
    [authedFetch, commit, pending],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      commit(sessionsRef.current.filter((s) => s.id !== sessionId));
      deleting.current.add(sessionId);
      const remove = (async () => {
        try {
          await creating.current.get(sessionId);
          // A save that lands after the delete would insert the session
          // again, so the delete waits for the session's saves as well.
          await queue.settled(sessionId);
          const res = await authedFetch(`${ENDPOINT}/${encodeURIComponent(sessionId)}`, {
            method: 'DELETE',
          });
          if (!res.ok && res.status !== 404) {
            throw new Error(`Could not delete the session (${res.status}).`);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not delete the session.');
          setStatus('error');
        } finally {
          deleting.current.delete(sessionId);
        }
      })();
      pending.track(remove);
    },
    [authedFetch, commit, pending, queue],
  );

  const replaceAll = useCallback(
    (next: Session[]) => {
      // Dev-only, so a request per session is fine — there is no bulk
      // endpoint, and adding one for a seeder that never ships would be
      // server surface built for nobody.
      const prev = sessionsRef.current;
      commit(next);
      const seed = (async () => {
        try {
          setStatus('saving');
          for (const old of prev) {
            // As with a single delete, a save landing afterwards would bring
            // the old session back.
            await queue.settled(old.id);
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
      pending.track(seed);
    },
    [authedFetch, commit, pending, queue],
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
