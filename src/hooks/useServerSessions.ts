import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Session } from '../types';
import {
  TimeoutError,
  WRITE_TIMEOUT_MS,
  addFailure,
  authorisedFetch,
  createPendingWrites,
  createSaveQueue,
  failedSessionIds,
  mergeLoaded,
  resolveFailure,
  revertedAny,
  sameSessionContent,
  withDeadline,
  type Failure,
} from '../lib/writeQueue';

export type SyncStatus = 'loading' | 'ready' | 'error';

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
  /** True when "Try again" replaced something whose write had failed. */
  reverted: boolean;
  /** Hides the reverted-edit note. */
  dismissReverted: () => void;
};

const ENDPOINT = '/api/sessions';

const SAVE_TIMEOUT = 'Saving is taking too long. Check your connection, then try again.';
const DELETE_TIMEOUT = 'Deleting is taking too long. Check your connection, then try again.';
const LOAD_TIMEOUT = 'Loading is taking too long. Check your connection, then try again.';

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

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
  const [loading, setLoading] = useState(true);
  /**
   * Every write or load that failed and hasn't been resolved, so a success on
   * one session can't hide a failure on another. The banner shows while any
   * is left.
   */
  const [failures, setFailures] = useState<readonly Failure[]>([]);
  const [reverted, setReverted] = useState(false);
  const [reloads, setReloads] = useState(0);

  /**
   * Sessions whose write had failed when "Try again" was pressed, checked
   * against the next successful load to see whether it rolled any back. They
   * build up until a load succeeds, so a retry whose load fails too still
   * reports the rollback on the retry after it.
   */
  const revertCandidates = useRef(new Set<string>());

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
    createPendingWrites((busy) => {
      if (busy) window.addEventListener('beforeunload', warnBeforeLeaving);
      else window.removeEventListener('beforeunload', warnBeforeLeaving);
    }),
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
    (path: string, init: RequestInit, signal?: AbortSignal) =>
      authorisedFetch(() => getToken(), fetch, path, init, signal),
    [getToken],
  );

  /** Records a failure. A new error replaces the reverted-edit note, as the banner takes its slot. */
  const fail = useCallback((failure: Failure) => {
    setFailures((f) => addFailure(f, failure));
    setReverted(false);
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        // The deadline covers the body too, so a late result is never applied.
        const body = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
          const res = await authedFetch(ENDPOINT, { method: 'GET' }, signal);
          if (!res.ok) throw new Error(`Could not load your data (${res.status}).`);
          return (await readJson(res)) as Session[];
        });
        if (cancelled) return;
        // A load never overrides a write the server hasn't confirmed, so
        // "Try again" during a save, create or delete doesn't undo it on screen.
        const before = sessionsRef.current;
        const after = mergeLoaded(
          Array.isArray(body) ? body : [],
          before,
          (id) => queue.isBusy(id) || creating.current.has(id),
          (id) => deleting.current.has(id),
        );
        const rolledBack = revertedAny(revertCandidates.current, before, after, sameSessionContent);
        revertCandidates.current = new Set();
        commit(after);
        setFailures((f) => resolveFailure(f, 'load', null));
        if (rolledBack) setReverted(true);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // The sessions on screen stay as they are: empty after a failed first
        // load, and the last good copy after a failed retry.
        fail({
          kind: 'load',
          sessionId: null,
          message:
            err instanceof TimeoutError
              ? LOAD_TIMEOUT
              : messageOf(err, 'Could not load your data.'),
        });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authedFetch, commit, fail, isLoaded, isSignedIn, queue, reloads]);

  /**
   * Sends one save, and never rejects because it reports its own errors. A
   * success resolves this session's earlier failure even with a newer copy
   * queued, because that copy holds every earlier edit. A plain failure with a
   * newer copy queued stays unreported, since that copy will report for
   * itself. A timeout is always reported, so the banner shows at 30 seconds
   * even while the user keeps editing, and the queue then sends the newer copy
   * as a fresh attempt.
   */
  const put = useCallback(
    async (session: Session) => {
      try {
        await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
          const res = await authedFetch(
            `${ENDPOINT}/${encodeURIComponent(session.id)}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(session),
            },
            signal,
          );
          if (!res.ok) throw new Error(`Could not save your changes (${res.status}).`);
        });
        setFailures((f) => resolveFailure(f, 'save', session.id));
      } catch (err) {
        const timedOut = err instanceof TimeoutError;
        if (!timedOut && queue.hasPending(session.id)) return;
        fail({
          kind: 'save',
          sessionId: session.id,
          message: timedOut ? SAVE_TIMEOUT : messageOf(err, 'Could not save your changes.'),
        });
      }
    },
    [authedFetch, fail, queue],
  );

  const enqueueSave = useCallback(
    (session: Session) => {
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
          await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
            const res = await authedFetch(
              ENDPOINT,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // The name chosen in the New Session prompt goes with the create, so
                // it is stored even if nothing else about the session is ever saved.
                body: JSON.stringify({ id: session.id, name: session.name }),
              },
              signal,
            );
            if (!res.ok) throw new Error(`Could not create the session (${res.status}).`);
          });
        } catch (err) {
          // Filed as a save, because a later save of this session creates the
          // row too and so resolves it.
          fail({
            kind: 'save',
            sessionId: session.id,
            message:
              err instanceof TimeoutError
                ? SAVE_TIMEOUT
                : messageOf(err, 'Could not create the session.'),
          });
        } finally {
          // The deadline settles a stuck create at 30 seconds, so a delete
          // waiting on it goes ahead then rather than never.
          creating.current.delete(session.id);
        }
      })();
      creating.current.set(session.id, create);
      pending.track(create);
    },
    [authedFetch, commit, fail, pending],
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
          // Only the request itself is timed. The waits above are other
          // writes' attempts, each with its own deadline.
          await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
            const res = await authedFetch(
              `${ENDPOINT}/${encodeURIComponent(sessionId)}`,
              { method: 'DELETE' },
              signal,
            );
            if (!res.ok && res.status !== 404) {
              throw new Error(`Could not delete the session (${res.status}).`);
            }
          });
        } catch (err) {
          fail({
            kind: 'delete',
            sessionId,
            message:
              err instanceof TimeoutError
                ? DELETE_TIMEOUT
                : messageOf(err, 'Could not delete the session.'),
          });
        } finally {
          deleting.current.delete(sessionId);
        }
      })();
      pending.track(remove);
    },
    [authedFetch, commit, fail, pending, queue],
  );

  const replaceAll = useCallback(
    (next: Session[]) => {
      // Dev-only, so a request per session is fine — there is no bulk
      // endpoint, and adding one for a seeder that never ships would be
      // server surface built for nobody.
      const prev = sessionsRef.current;
      commit(next);
      // No deadline here: the 30-second limit is for the user's own writes,
      // and a seed of many sessions can rightly take longer.
      const seed = (async () => {
        try {
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
          setFailures((f) => resolveFailure(f, 'seed', null));
        } catch (err) {
          fail({
            kind: 'seed',
            sessionId: null,
            message: messageOf(err, 'Could not seed sessions.'),
          });
        }
      })();
      pending.track(seed);
    },
    [authedFetch, commit, fail, pending, queue],
  );

  /**
   * Reloads from the server and clears every failure. The sessions whose
   * writes had failed are remembered, so the load can say whether it rolled
   * any of them back. A load failure alone adds none, so it never shows a note.
   */
  const retry = useCallback(() => {
    for (const id of failedSessionIds(failures)) revertCandidates.current.add(id);
    setFailures([]);
    setReverted(false);
    setReloads((n) => n + 1);
  }, [failures]);

  const dismissReverted = useCallback(() => setReverted(false), []);

  const status: SyncStatus = loading ? 'loading' : failures.length > 0 ? 'error' : 'ready';
  // One banner for every failure left, with the most recent one's message.
  const error = failures.length > 0 ? failures[failures.length - 1].message : null;

  return {
    sessions,
    mutateSession,
    addSession,
    removeSession,
    replaceAll,
    status,
    error,
    retry,
    reverted,
    dismissReverted,
  };
}
