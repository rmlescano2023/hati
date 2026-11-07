import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { NewPayment, Payment, Session } from '../types';
import { keepOpenedActivity } from '../lib/activity';
import { sessionDisplayTitle } from '../lib/sessionLabel';
import { isFullyPaid, mergeServerPayments, newPayments, settlePayments } from '../lib/collection';
import { createId } from '../lib/id';
import {
  DELETED_ELSEWHERE,
  DELETED_ELSEWHERE_MANY,
  FriendlyError,
  SIGNED_OUT,
  TimeoutError,
  WRITE_TIMEOUT_MS,
  WHOLE_SESSION,
  addFailure,
  authorisedFetch,
  createPendingWrites,
  createWriteOrder,
  createSaveConfirmations,
  createSaveQueue,
  failedSessionIds,
  keepLocalPayments,
  lineKey,
  mergeLoaded,
  messageOf,
  recordFailedMessage,
  resolveFailure,
  resolveSuperseded,
  revertedAny,
  sameSessionContent,
  saveFailedMessage,
  saveOnceCreated,
  withDeadline,
  type Failure,
} from '../lib/writeQueue';

export type SyncStatus = 'loading' | 'ready' | 'error';

/** How one payment write ended, for a message shown where it was made. */
export type PaymentResult =
  | { ok: true }
  /**
   * `payments` is the session's as they stand after the failure, reverted or
   * refreshed. `code` is the server's reason for a refusal, such as
   * `over_remaining`, when it gave one. `status` is the HTTP status of the
   * answer, or null when none came (no connection, a timeout).
   */
  | { ok: false; message: string; payments: Payment[]; code?: string; status: number | null };

/**
 * What a refused request was, for a banner read away from the line: the pair
 * for one payment, or just the session for Mark all.
 */
const refusedWhat = (payments: NewPayment[], title: string): string =>
  payments.length === 1
    ? `Payment from ${payments[0].debtor} to ${payments[0].creditor} in “${title}”`
    : `Payments in “${title}”`;

/** The payments a session has on screen, or none once it has gone. */
const paymentsOf = (sessions: Session[], sessionId: string): Payment[] =>
  sessions.find((s) => s.id === sessionId)?.payments ?? [];

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
  /**
   * Records payments on a finished session, on screen at once and on the
   * server in the background, all or nothing. The caller mints the ids, so a
   * retry after a failure can reuse them and never records one twice. A
   * failure takes them off the screen again and is reported in the banner;
   * `onSettled` hears how it ended, with a message for the form. A refusal,
   * such as a line already paid in full, skips the banner only when
   * `onSettled` returns true to say it showed the message itself, so one is
   * never lost to a form that has gone from the screen. It returns how the
   * write ended, a promise that never rejects; with `quiet` it never reports a
   * failure in the banner, so the caller reports it once for a batch.
   */
  addPayments: (
    sessionId: string,
    payments: NewPayment[],
    onSettled?: (result: PaymentResult) => boolean | void,
    options?: { quiet?: boolean },
  ) => Promise<void>;
  /**
   * Marks sessions as already settled: for each, one request recording a full
   * payment on every settlement pair, all or nothing, on screen at once. A
   * session another device already settled counts as done. `settled` lists
   * only the sessions that really end up fully paid after the server's answer;
   * failures are reported once, in the banner, and listed in `failed`
   * (BR-S14, BR-S15).
   */
  settleSessions: (sessionIds: string[]) => Promise<{ settled: string[]; failed: string[] }>;
  /**
   * Undoes "already settled": removes every payment of a session in one
   * request, on screen at once. All or nothing on the server, so a failure
   * puts them all back and "Try again" always shows what the server has.
   */
  removeAllPayments: (sessionId: string) => void;
  /**
   * Dev-only seeding that only ever adds: sessions already there are left
   * alone, and nothing is deleted, so it is safe on a database with real data.
   */
  appendAll: (next: Session[]) => void;
  /** Whether a payment write for this session, an undo included, is still waiting on the server. */
  isPaying: (sessionId: string) => boolean;
  /** Undoes one payment, on screen at once; a failure puts it back and is reported. */
  removePayment: (
    sessionId: string,
    paymentId: string,
    onSettled?: (result: PaymentResult) => void,
  ) => void;
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
const PAYMENT_TIMEOUT =
  'Recording the payment is taking too long. Tap Try again to see whether it was saved.';
const PAYMENTS_TIMEOUT =
  'Recording the payments is taking too long. Tap Try again to see whether they were saved.';
const UNDO_TIMEOUT =
  'Undoing the payment is taking too long. Tap Try again to see whether it was undone.';
const UNDO_ALL_TIMEOUT =
  'Undoing “already settled” is taking too long. Tap Try again to see whether it was undone.';

const PAYMENTS_ENDPOINT = '/api/payments';

/** What a refused payment request may say, read only as far as it is needed. */
type PaymentErrorBody = { error?: unknown; code?: unknown; payments?: unknown };

/**
 * Plain `vite` does not serve `/api`, so a request for it is answered with the
 * endpoint's own TypeScript source. Parsing that as JSON fails deep inside
 * with "Unexpected token 'i'", which says nothing about the actual problem —
 * that the API is not running.
 */
async function readJson(res: Response): Promise<unknown> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new FriendlyError(
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

  /**
   * Payment writes still in flight, counted by session id. A load landing
   * meanwhile keeps that session's on-screen copy, so an optimistic payment
   * isn't wiped before the server has it.
   */
  const paying = useRef(new Map<string, number>());
  /** Which payment write started when, so a success clears only the failures it follows. */
  const [writeOrder] = useState(() => createWriteOrder());
  /** Adds in flight by payment id, so an undo waits for its add to land first. */
  const adding = useRef(new Map<string, Promise<unknown>>());
  /** Undos in flight by payment id, kept out of a refresh after a rejected add. */
  const removing = useRef(new Set<string>());

  /**
   * Sessions with a payment, undo or save that settled after the current load
   * was sent. The server read that load's copy before the write landed, so
   * applying it would hide a payment the server has, or bring back one it
   * deleted. Their on-screen copy, which already shows the outcome, is kept
   * until the next load. Collection stays usable during "Try again", which is
   * what makes this window reachable.
   */
  const settledDuringLoad = useRef(new Set<string>());

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
      settledDuringLoad.current.clear();
      try {
        // The deadline covers the body too, so a late result is never applied.
        const body = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
          const res = await authedFetch(ENDPOINT, { method: 'GET' }, signal);
          if (!res.ok) throw new FriendlyError(`Could not load your data (${res.status}).`);
          return (await readJson(res)) as Session[];
        });
        if (cancelled) return;
        // A load never overrides a write the server hasn't confirmed, so
        // "Try again" during a save, create or delete doesn't undo it on screen.
        const before = sessionsRef.current;
        // A session whose save had failed takes the server's copy even when a
        // payment settled on it during this load, so its rollback is applied
        // and reported; only its payments come from the screen.
        const rollingBack = (id: string) =>
          settledDuringLoad.current.has(id) && revertCandidates.current.has(id);
        const after = keepOpenedActivity(
          keepLocalPayments(
            mergeLoaded(
              Array.isArray(body) ? body : [],
              before,
              (id) =>
                queue.isBusy(id) ||
                creating.current.has(id) ||
                paying.current.has(id) ||
                (settledDuringLoad.current.has(id) && !rollingBack(id)),
              (id) => deleting.current.has(id),
            ),
            before,
            rollingBack,
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
                if (!created.ok) throw new FriendlyError(saveFailedMessage(created.status));
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
              if (!res.ok) throw new FriendlyError(saveFailedMessage(res.status));
            }),
        );
        setFailures((f) => resolveFailure(f, 'save', session.id));
        settledDuringLoad.current.add(session.id);
        // A save that lands carries every earlier edit, so an earlier failure
        // on this session has nothing left to roll back.
        revertCandidates.current.delete(session.id);
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
            if (!res.ok) throw new FriendlyError(`Could not create the session (${res.status}).`);
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
              throw new FriendlyError(`Could not delete the session (${res.status}).`);
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

  /** Replaces one session's payments on screen, if the session is still there. */
  const setPayments = useCallback(
    (sessionId: string, fn: (payments: Payment[]) => Payment[]) => {
      commit(
        sessionsRef.current.map((s) =>
          s.id === sessionId ? { ...s, payments: fn(s.payments) } : s,
        ),
      );
    },
    [commit],
  );

  /** Counts one payment write in or out of `paying`. */
  const countPaying = useCallback((sessionId: string, step: 1 | -1) => {
    const left = (paying.current.get(sessionId) ?? 0) + step;
    if (left > 0) paying.current.set(sessionId, left);
    else paying.current.delete(sessionId);
  }, []);

  const isPaying = useCallback((sessionId: string) => paying.current.has(sessionId), []);

  /** A payment write succeeded: it answers the failures it follows and covers (see `createWriteOrder`). */
  const paymentSucceeded = useCallback(
    (sessionId: string, seq: number, lines: readonly string[]) => {
      writeOrder.succeeded(sessionId, seq, lines);
      setFailures((f) => resolveSuperseded(f, writeOrder, sessionId));
    },
    [writeOrder],
  );

  /** Reports a payment failure, unless later successes have already answered it. */
  const paymentFailed = useCallback(
    (sessionId: string, seq: number, lines: readonly string[], message: string) => {
      if (!writeOrder.superseded(sessionId, seq, lines)) {
        fail({ kind: 'payment', sessionId, message, seq, lines });
      }
    },
    [fail, writeOrder],
  );

  const addPayments = useCallback(
    (
      sessionId: string,
      payments: NewPayment[],
      onSettled?: (result: PaymentResult) => boolean | void,
      // `seq` and `wholeSession` are for `settleSessions`, which numbers its
      // write once and covers the whole session rather than the lines it pays.
      options?: { quiet?: boolean; seq?: number; wholeSession?: boolean },
    ): Promise<void> => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session) {
        onSettled?.({ ok: false, message: 'This session is gone.', payments: [], status: null });
        return Promise.resolve();
      }
      // The whole request is still sent, since the server skips what it has,
      // but only what this call put on screen is ever taken off again.
      const added = newPayments(session.payments, payments, new Date().toISOString());
      setPayments(sessionId, (list) => [...list, ...added]);
      countPaying(sessionId, 1);
      const ids = new Set(added.map((p) => p.id));
      const seq = options?.seq ?? writeOrder.start();
      const lines = options?.wholeSession ? [WHOLE_SESSION] : payments.map(lineKey);

      const work = (async () => {
        let status: number | null = null;
        let body: PaymentErrorBody | null = null;
        let timedOut = false;
        let thrown: unknown = null;
        try {
          // The Finish save must land first, or the server still sees a draft.
          await creating.current.get(sessionId);
          await queue.settled(sessionId);
          const result = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
            const res = await authedFetch(
              PAYMENTS_ENDPOINT,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, payments }),
              },
              signal,
            );
            const type = res.headers.get('content-type') ?? '';
            const json =
              !res.ok && type.includes('application/json')
                ? ((await res.json()) as PaymentErrorBody)
                : null;
            return { status: res.status, body: json };
          });
          if (result.status === 201) {
            paymentSucceeded(sessionId, seq, lines);
            onSettled?.({ ok: true });
            return;
          }
          status = result.status;
          body = result.body;
        } catch (err) {
          timedOut = err instanceof TimeoutError;
          thrown = err;
        }

        // Every other ending takes the payments off again, so the figures
        // never show money that wasn't recorded.
        setPayments(sessionId, (list) => list.filter((p) => !ids.has(p.id)));
        if (body?.code === 'over_remaining' && Array.isArray(body.payments)) {
          // The line had less left than this device thought, so it shows the
          // server's payments rather than waiting for a reload (AC-7.12).
          const server = body.payments as Payment[];
          setPayments(sessionId, (list) =>
            mergeServerPayments(
              list,
              server,
              (id) => adding.current.has(id) && !ids.has(id),
              (id) => removing.current.has(id),
            ),
          );
        }
        // A session deleted meanwhile took its payments with it: nothing to report.
        const current = sessionsRef.current.find((s) => s.id === sessionId);
        if (!current) return;

        const refusal = status === 409 && typeof body?.error === 'string' ? body.error : null;
        const shownByCaller =
          onSettled?.({
            ok: false,
            message:
              refusal ??
              (status === 404
                ? DELETED_ELSEWHERE
                : status === 401
                  ? SIGNED_OUT
                  : timedOut
                    ? 'This is taking too long. Check your connection and try again.'
                    : 'Not recorded. Check your connection and try again.'),
            payments: paymentsOf(sessionsRef.current, sessionId),
            code: typeof body?.code === 'string' ? body.code : undefined,
            status,
          }) === true;
        // A refusal shown on the form the user just saved isn't repeated. Any
        // other failure, or a refusal whose form is gone, goes to the banner,
        // which stays in view and offers "Try again". A quiet write leaves
        // the report to its caller. A failure that lands after later successes
        // answered it is already out of date, so it isn't shown.
        if (!options?.quiet && (refusal === null || !shownByCaller)) {
          paymentFailed(
            sessionId,
            seq,
            lines,
            timedOut
              ? payments.length === 1
                ? PAYMENT_TIMEOUT
                : PAYMENTS_TIMEOUT
              : refusal !== null
                ? `${refusedWhat(payments, sessionDisplayTitle(current))} not recorded. ${refusal}`
                : recordFailedMessage(payments.length, status, thrown),
          );
        }
      })().finally(() => {
        settledDuringLoad.current.add(sessionId);
        countPaying(sessionId, -1);
        for (const id of ids) adding.current.delete(id);
      });
      for (const id of ids) adding.current.set(id, work);
      pending.track(work);
      return work;
    },
    [
      authedFetch,
      countPaying,
      paymentFailed,
      paymentSucceeded,
      pending,
      queue,
      setPayments,
      writeOrder,
    ],
  );

  const settleSessions = useCallback(
    async (sessionIds: string[]): Promise<{ settled: string[]; failed: string[] }> => {
      const settled: string[] = [];
      const failed: string[] = [];
      // How each failed session's write ended, and when it started.
      const statuses = new Map<string, number | null>();
      const started = new Map<string, number>();
      await Promise.all(
        sessionIds.map(async (id) => {
          const session = sessionsRef.current.find((s) => s.id === id);
          // Gone, or already has a payment: another device got there first (BR-S15).
          if (!session || session.payments.length > 0) return;
          const entries = settlePayments(session).map((p) => ({ ...p, id: createId('pay') }));
          if (entries.length === 0) return;
          let ok = true;
          const seq = writeOrder.start();
          started.set(id, seq);
          await addPayments(
            id,
            entries,
            (result) => {
              // `over_remaining` means it was settled elsewhere meanwhile, and
              // `addPayments` has merged the server's payments in. A session
              // deleted meanwhile has nothing to report either.
              const gone = !sessionsRef.current.some((s) => s.id === id);
              if (!result.ok && result.code !== 'over_remaining' && !gone) {
                ok = false;
                statuses.set(id, result.status);
              }
              // So no refusal is bannered here: the batch reports once.
              return true;
            },
            { quiet: true, seq, wholeSession: true },
          );
          // Settled only if every pair really is paid once the server's answer is
          // merged: another device may have recorded just part of it, and the
          // session then stays where it is, neither settled nor failed.
          const now = sessionsRef.current.find((s) => s.id === id);
          if (!ok) failed.push(id);
          else if (now && isFullyPaid(now)) settled.push(id);
        }),
      );
      if (failed.length > 0) {
        const title = (id: string) => {
          const s = sessionsRef.current.find((x) => x.id === id);
          return s ? sessionDisplayTitle(s) : '';
        };
        // Retrying a session that no longer exists can never work, and a
        // signed-out user must sign in first, so those are told apart from a
        // failure that might pass on a second try.
        const every = (status: number) => failed.every((id) => statuses.get(id) === status);
        const message = every(404)
          ? failed.length === 1
            ? DELETED_ELSEWHERE
            : DELETED_ELSEWHERE_MANY
          : every(401)
            ? SIGNED_OUT
            : failed.length === 1
              ? `Couldn't mark “${title(failed[0])}” as settled. Tap “Already settled” on it to try again.`
              : `Couldn't mark ${failed.length} sessions as settled. Tap “Already settled” on each to try again.`;
        // Filed against each session, not the batch, so a later whole-session
        // success on one clears it, and it stays while any of them is failing.
        for (const id of failed) {
          paymentFailed(id, started.get(id) ?? 0, [WHOLE_SESSION], message);
        }
      }
      return { settled, failed };
    },
    [addPayments, paymentFailed, writeOrder],
  );

  const removeAllPayments = useCallback(
    (sessionId: string) => {
      const snapshot = sessionsRef.current.find((s) => s.id === sessionId)?.payments ?? [];
      if (snapshot.length === 0) return;
      setPayments(sessionId, () => []);
      countPaying(sessionId, 1);
      const seq = writeOrder.start();
      const ids = snapshot.map((p) => p.id);
      for (const id of ids) removing.current.add(id);

      const work = (async () => {
        let status: number | null = null;
        let timedOut = false;
        try {
          // Payments still being recorded land first, or the delete misses them.
          await Promise.all(ids.map((id) => adding.current.get(id)));
          status = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
            const res = await authedFetch(
              `${PAYMENTS_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`,
              { method: 'DELETE' },
              signal,
            );
            return res.status;
          });
          // Not found means there is nothing left to undo, which is done too.
          if (status === 204 || status === 404) {
            paymentSucceeded(sessionId, seq, [WHOLE_SESSION]);
            return;
          }
        } catch (err) {
          timedOut = err instanceof TimeoutError;
        }

        if (!sessionsRef.current.some((s) => s.id === sessionId)) return;
        setPayments(sessionId, (list) => [
          ...list,
          ...snapshot.filter((p) => !list.some((x) => x.id === p.id)),
        ]);
        paymentFailed(
          sessionId,
          seq,
          [WHOLE_SESSION],
          timedOut
            ? UNDO_ALL_TIMEOUT
            : status === 401
              ? SIGNED_OUT
              : "Couldn't undo “already settled”, so its payments are still recorded.",
        );
      })().finally(() => {
        settledDuringLoad.current.add(sessionId);
        countPaying(sessionId, -1);
        for (const id of ids) removing.current.delete(id);
      });
      pending.track(work);
    },
    [authedFetch, countPaying, paymentFailed, paymentSucceeded, pending, setPayments, writeOrder],
  );

  const removePayment = useCallback(
    (sessionId: string, paymentId: string, onSettled?: (result: PaymentResult) => void) => {
      const payment = sessionsRef.current
        .find((s) => s.id === sessionId)
        ?.payments.find((p) => p.id === paymentId);
      if (!payment) return;
      setPayments(sessionId, (list) => list.filter((p) => p.id !== paymentId));
      countPaying(sessionId, 1);
      const seq = writeOrder.start();
      removing.current.add(paymentId);

      const work = (async () => {
        let status: number | null = null;
        let timedOut = false;
        try {
          // An undo of a payment still being recorded would find nothing to
          // delete, and the add would then land after it.
          await adding.current.get(paymentId);
          status = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
            const res = await authedFetch(
              `${PAYMENTS_ENDPOINT}/${encodeURIComponent(paymentId)}`,
              { method: 'DELETE' },
              signal,
            );
            return res.status;
          });
          // Not found means there is nothing left to undo, which is done too.
          if (status === 204 || status === 404) {
            paymentSucceeded(sessionId, seq, [lineKey(payment)]);
            onSettled?.({ ok: true });
            return;
          }
        } catch (err) {
          timedOut = err instanceof TimeoutError;
        }

        if (!sessionsRef.current.some((s) => s.id === sessionId)) return;
        setPayments(sessionId, (list) =>
          list.some((p) => p.id === paymentId) ? list : [...list, payment],
        );
        const message = timedOut
          ? UNDO_TIMEOUT
          : status === 401
            ? SIGNED_OUT
            : "Couldn't undo the payment, so it's still recorded.";
        paymentFailed(sessionId, seq, [lineKey(payment)], message);
        onSettled?.({
          ok: false,
          message,
          payments: paymentsOf(sessionsRef.current, sessionId),
          status,
        });
      })().finally(() => {
        settledDuringLoad.current.add(sessionId);
        countPaying(sessionId, -1);
        removing.current.delete(paymentId);
      });
      pending.track(work);
    },
    [authedFetch, countPaying, paymentFailed, paymentSucceeded, pending, setPayments, writeOrder],
  );

  /** Creates one seeded session on the server: the row, its content, then its payments. */
  const seedOne = useCallback(
    async (session: Session) => {
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
      // A save never carries payments, so seeded ones go through their own endpoint.
      if (session.payments.length > 0) {
        await authedFetch(PAYMENTS_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.id,
            payments: session.payments.map(({ id, debtor, creditor, amountCents }) => ({
              id,
              debtor,
              creditor,
              amountCents,
            })),
          }),
        });
      }
    },
    [authedFetch],
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
          for (const session of next) await seedOne(session);
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
    [authedFetch, commit, fail, pending, queue, seedOne],
  );

  const appendAll = useCallback(
    (next: Session[]) => {
      // Only sessions that aren't there yet, and never a DELETE or a PUT of one
      // that is: the database may hold real data, and re-saving an existing
      // session could change it.
      const fresh = next.filter((s) => !sessionsRef.current.some((p) => p.id === s.id));
      commit([...sessionsRef.current, ...fresh]);
      const seed = (async () => {
        try {
          for (const session of fresh) await seedOne(session);
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
    [commit, fail, pending, seedOne],
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
    addPayments,
    settleSessions,
    removeAllPayments,
    removePayment,
    isPaying,
    replaceAll,
    appendAll,
    status,
    error,
    retry,
    reverted,
    dismissReverted,
  };
}
