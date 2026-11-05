import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Session } from '../types';
import { keepOpenedActivity } from '../lib/activity';
import {
  TimeoutError,
  WRITE_TIMEOUT_MS,
  addFailure,
  authorisedFetch,
  createPendingWrites,
  createSaveConfirmations,
  createSaveQueue,
  failedSessionIds,
  mergeLoaded,
  resolveFailure,
  revertedAny,
  sameSessionContent,
  saveFailedMessage,
  saveOnceCreated,
  withDeadline,
  type Failure,
} from '../lib/writeQueue';

export type SyncStatus = 'loading' | 'ready' | 'error';

type Result = {
  sessions: Session[];
  /**
   * Apply `fn` to one session and persist just that session. Returning the
   * session unchanged makes the whole thing a no-op, network included.
   * `onSettled` hears true once the server accepts a save carrying this edit,
   * or false once a failure is reported for it (see `createSaveConfirmations`).
   */
  mutateSession: (
    sessionId: string,
    fn: (session: Session) => Session,
    onSettled?: (saved: boolean) => void,
  ) => void;
  /** Add a session locally and create it on the server in the background. */
  addSession: (session: Session) => void;
  removeSession: (sessionId: string) => void;
  /**
   * Marks a session as just opened, on screen at once and on the server in the
   * background. It is best effort and silent: it never joins the save queue,
   * the leave prompt, the confirmations or the failures, so an open can't make
   * anything read "Saving…", "Saved" or "Not saved." (BR-8, BR-9).
   */
  recordOpen: (sessionId: string) => void;
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

  /** Who is waiting to hear whether their edit reached the server, kept in step with `queue`. */
  const [confirmations] = useState(() => createSaveConfirmations());

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
   * Sessions whose create failed. A save never creates a session, so the next
   * save of one of these sends the create again first.
   */
  const uncreated = useRef(new Set<string>());

  /**
   * Deletes still in flight, by session id. A load that lands before the
   * server has applied one would otherwise show the deleted session again.
   */
  const deleting = useRef(new Set<string>());

  /**
   * Opens still in flight, by session id, counted because a session can be
   * opened again before the first request returns. A load landing meanwhile
   * keeps their on-screen activity time (see `keepOpenedActivity`).
   */
  const opening = useRef(new Map<string, number>());

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
        const after = keepOpenedActivity(
          mergeLoaded(
            Array.isArray(body) ? body : [],
            before,
            (id) => queue.isBusy(id) || creating.current.has(id),
            (id) => deleting.current.has(id),
          ),
          before,
          (id) => opening.current.has(id),
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
      confirmations.sending(session.id);
      try {
        // The create has its own deadline, so only this save's own requests are timed.
        await saveOnceCreated(
          creating.current.get(session.id),
          () => uncreated.current.has(session.id),
          (createFirst) =>
            withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
              if (createFirst) {
                // Safe to repeat: a create that did land after all makes this a no-op.
                const created = await authedFetch(
                  ENDPOINT,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: session.id, name: session.name }),
                  },
                  signal,
                );
                if (!created.ok) throw new Error(saveFailedMessage(created.status));
                // The row exists now, even if the save below fails.
                uncreated.current.delete(session.id);
              }
              const res = await authedFetch(
                `${ENDPOINT}/${encodeURIComponent(session.id)}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(session),
                },
                signal,
              );
              if (!res.ok) throw new Error(saveFailedMessage(res.status));
            }),
        );
        setFailures((f) => resolveFailure(f, 'save', session.id));
        confirmations.saved(session.id);
      } catch (err) {
        const timedOut = err instanceof TimeoutError;
        if (!timedOut && queue.hasPending(session.id)) {
          confirmations.superseded(session.id);
          return;
        }
        fail({
          kind: 'save',
          sessionId: session.id,
          message: timedOut ? SAVE_TIMEOUT : messageOf(err, 'Could not save your changes.'),
        });
        confirmations.failed(session.id);
      }
    },
    [authedFetch, confirmations, fail, queue],
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
    (
      sessionId: string,
      fn: (session: Session) => Session,
      onSettled?: (saved: boolean) => void,
    ) => {
      const prev = sessionsRef.current;
      const index = prev.findIndex((s) => s.id === sessionId);
      // Nothing is saved in either early return, so the caller hears false
      // rather than waiting on a save that will never come.
      if (index === -1) {
        onSettled?.(false);
        return;
      }
      const changed = fn(prev[index]);
      // The store's guards return the session unchanged to mean "no-op";
      // that must not cost a round trip.
      if (changed === prev[index]) {
        onSettled?.(false);
        return;
      }
      // Every saved change is activity (BR-1). The time is the edit's own, so a
      // save that lands late still reflects when the user acted.
      const next = { ...changed, activityAt: new Date().toISOString() };
      const copy = [...prev];
      copy[index] = next;
      commit(copy);
      // Before the enqueue, because an idle queue starts the save at once and
      // the wait must join that save rather than the one after it.
      if (onSettled) confirmations.wait(sessionId, onSettled);
      enqueueSave(next);
    },
    [commit, confirmations, enqueueSave],
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
          // Filed as a save, because the next save of this session sends the
          // create again before saving, and its success resolves this failure.
          uncreated.current.add(session.id);
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
          // So a save can't land after the delete, where it would be refused as
          // deleted elsewhere, or re-create a session whose create failed, the
          // delete waits for the session's saves as well.
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

  const recordOpen = useCallback(
    (sessionId: string) => {
      const prev = sessionsRef.current;
      const session = prev.find((s) => s.id === sessionId);
      if (!session) return;
      const activityAt = new Date().toISOString();
      commit(prev.map((s) => (s === session ? { ...session, activityAt } : s)));
      opening.current.set(sessionId, (opening.current.get(sessionId) ?? 0) + 1);
      void (async () => {
        try {
          // A create still in flight lands first, so the open finds its row.
          await creating.current.get(sessionId);
          // The response isn't read: any status, a 404 for a session deleted
          // meanwhile included, is the end of it.
          await withDeadline(WRITE_TIMEOUT_MS, (signal) =>
            authedFetch(
              `${ENDPOINT}/${encodeURIComponent(sessionId)}`,
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activityAt }),
                // Lets an open already on its way finish if the tab closes.
                keepalive: true,
              },
              signal,
            ),
          );
        } catch {
          // An open is best effort and never visible, so a failure is neither
          // reported nor retried (BR-8). The next load shows the server's order.
        } finally {
          const left = (opening.current.get(sessionId) ?? 1) - 1;
          if (left > 0) opening.current.set(sessionId, left);
          else opening.current.delete(sessionId);
        }
      })();
    },
    [authedFetch, commit],
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
            // As with a single delete, a save landing afterwards would be
            // refused as deleted elsewhere, or re-create a session whose
            // create failed.
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
    recordOpen,
    replaceAll,
    status,
    error,
    retry,
    reverted,
    dismissReverted,
  };
}
