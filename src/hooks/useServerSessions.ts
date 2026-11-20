import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Claim, ClaimDecision, NewClaim, NewPayment, Payment, Session } from '../types';
import { keepOpenedActivity } from '../lib/activity';
import { sessionDisplayTitle } from '../lib/sessionLabel';
import {
  isFullyPaid,
  isJoined,
  mergeServerPayments,
  newClaims,
  newPayments,
  settlePayments,
} from '../lib/collection';
import { createId } from '../lib/id';
import {
  DELETED_ELSEWHERE,
  ALREADY_SETTLED,
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
  discardsFailedCreate,
  failedMessage,
  failedLeaveIds,
  failedSessionIds,
  keepLocalClaims,
  keepLocalPayments,
  lineKey,
  mergeLoaded,
  messageOf,
  needsRefresh,
  recordFailedMessage,
  CHECK_INTERVAL_MS,
  IDLE_PAUSE_MS,
  checksForChanges,
  reloadsOnReturn,
  resolveAlreadySettled,
  resolveFailure,
  resolveSuperseded,
  restoreAt,
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

/** What the sessions store runs on: the server's sessions, or a guide's practice ones in memory. */
export type SessionsBackend = {
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
  /**
   * Add a session locally and create it on the server in the background. When
   * the create fails and the session has not been edited, passing `onDiscarded`
   * takes the session off the screen again and calls it, so the caller can
   * leave the session's workspace. Without it, or once the session has been
   * edited, the session stays and the next save sends the create again.
   */
  addSession: (session: Session, onDiscarded?: () => void) => void;
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
  removeAllPayments: (sessionId: string, onSettled?: (ok: boolean) => void) => void;
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
  /**
   * A joined debtor's "I've paid": pending claims on screen at once, and on the server in the
   * background, all or nothing. Like `addPayments`, the caller mints the ids, a failure takes them
   * off again, and `options.quiet` leaves the banner to the caller (Mark all's batch).
   */
  addClaims: (
    sessionId: string,
    claims: NewClaim[],
    onSettled?: (result: PaymentResult) => boolean | void,
    options?: { quiet?: boolean },
  ) => Promise<void>;
  /**
   * The creditor, or the organizer for a creditor with no account, confirms or declines a claim. A
   * confirm puts the payment on screen and takes the claim off in one change, and a failure puts
   * both back.
   */
  decideClaim: (
    sessionId: string,
    claimId: string,
    decision: ClaimDecision,
    onSettled?: (result: PaymentResult) => boolean | void,
  ) => void;
  /** The sender withdraws a pending claim, or dismisses a declined one; on screen at once. */
  removeClaim: (
    sessionId: string,
    claimId: string,
    onSettled?: (result: PaymentResult) => boolean | void,
  ) => void;
  /** Dev-only seeding: swap the whole list, session by session. */
  replaceAll: (next: Session[]) => void;
  /**
   * Puts a session the server has just joined this account to on screen, and keeps it there
   * against a load that read the list before the join landed.
   */
  addJoinedSession: (session: Session) => void;
  /**
   * Stops tracking a joined session: gone from the screen at once, and on the server in the
   * background. A failure brings it back and is reported in the banner.
   */
  leaveSession: (sessionId: string) => void;
  /**
   * The organizer takes a joined account out of their session. Resolves true once the server has
   * removed it, and the on-screen list of who joined follows; false on any failure, which the
   * dialog reports itself.
   */
  removeParticipant: (sessionId: string, member: string) => Promise<boolean>;
  status: SyncStatus;
  /**
   * True once a load has succeeded, and from then on. Until then an empty list
   * means nothing arrived rather than that there is nothing to show.
   */
  loaded: boolean;
  error: string | null;
  /** True when retrying can't help, so the banner's button reloads and says "Refresh". */
  refresh: boolean;
  retry: () => void;
  /** True when "Try again" replaced something whose write had failed. */
  reverted: boolean;
  /** Hides the reverted-edit note. */
  dismissReverted: () => void;
};

const ENDPOINT = '/api/sessions';

/** Sessions the account joined are asked for explicitly, so a tab on an older bundle is never sent them. */
const LOAD_ENDPOINT = `${ENDPOINT}?joined=1`;

const PARTICIPANTS_ENDPOINT = '/api/participants';

const SAVE_TIMEOUT = 'Saving is taking too long. Check your connection, then try again.';
const CREATE_TIMEOUT =
  'Creating the session is taking too long. Check your connection, then try again.';
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
type PaymentErrorBody = { error?: unknown; code?: unknown; payments?: unknown; claims?: unknown };

const CLAIMS_ENDPOINT = '/api/claims';

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
export function useServerSessions(): SessionsBackend {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  /**
   * Every write or load that failed and hasn't been resolved, so a success on
   * one session can't hide a failure on another. The banner shows while any
   * is left.
   */
  const [failures, setFailures] = useState<readonly Failure[]>([]);
  const [reverted, setReverted] = useState(false);
  const [reloads, setReloads] = useState(0);

  /**
   * When the last load of any kind started, so a return to the tab inside the window doesn't
   * reload again (see `reloadsOnReturn`). Null until the first load.
   */
  const lastLoadAt = useRef<number | null>(null);
  /**
   * Set by the return-to-tab reload for the load it starts. A quiet load never shows the loading
   * state and says nothing when it fails: nothing the user did has failed, and the next return
   * tries again (A4).
   */
  const quietLoad = useRef(false);
  /** The server's fingerprint of the last load, or null (none yet, or an older server). */
  const loadedState = useRef<string | null>(null);
  /** When the user last did anything (pointer, key or touch); the check pauses when it is long ago. */
  const lastInputAt = useRef(Date.now());
  const checking = useRef(false);
  /** A load is running, which a change found by the check must not cancel. */
  const loadRunning = useRef(false);

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

    const quiet = quietLoad.current;
    quietLoad.current = false;

    (async () => {
      if (!quiet) setLoading(true);
      loadRunning.current = true;
      lastLoadAt.current = Date.now();
      settledDuringLoad.current.clear();
      try {
        // The deadline covers the body too, so a late result is never applied.
        const { body, state } = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
          const res = await authedFetch(LOAD_ENDPOINT, { method: 'GET' }, signal);
          if (!res.ok) throw new FriendlyError(failedMessage('load your data', res.status));
          return {
            body: (await readJson(res)) as Session[],
            // What this load saw, for the check to compare with. An older server sends none.
            state: res.headers.get('X-Hati-State'),
          };
        });
        if (cancelled) return;
        loadedState.current = state;
        // A load never overrides a write the server hasn't confirmed, so
        // "Try again" during a save, create or delete doesn't undo it on screen.
        const before = sessionsRef.current;
        // A session whose save had failed takes the server's copy even when a
        // payment settled on it during this load, so its rollback is applied
        // and reported; only its payments come from the screen.
        const rollingBack = (id: string) =>
          settledDuringLoad.current.has(id) && revertCandidates.current.has(id);
        const after = keepOpenedActivity(
          // A confirm changes the payments and the claims together, so the two are kept together
          // by the same predicate: one without the other would show it as both.
          keepLocalClaims(
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
        setLoaded(true);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        // The screen keeps its last good copy either way, and a quiet load adds nothing to it.
        if (quiet) return;
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
    })().finally(() => {
      // A newer load has already marked itself running, so only the current one clears it.
      if (!cancelled) loadRunning.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [authedFetch, commit, fail, isLoaded, isSignedIn, queue, reloads]);

  // Coming back to the tab after a while reloads quietly, so a joined member sees the payments the
  // organizer has recorded since (D2). It waits for a settled screen: while the first load or a
  // retry is running, or a failure is on the banner, the reload would cancel the one in flight or
  // silently replace an edit the user was told did not save, and "Try again" is for that.
  const canReloadQuietly = loaded && !loading && failures.length === 0;

  /** Starts the quiet reload, which the load effect then runs; never over a load already running. */
  const reloadQuietly = useCallback(() => {
    quietLoad.current = true;
    setReloads((n) => n + 1);
  }, []);

  /**
   * Asks the server whether anything this account can see has changed, and reloads quietly if so.
   * A failed or timed-out check says nothing (A4): the next tick tries again. A change is shown at
   * once, without waiting for the 30-second window, because it is known.
   */
  const checkForChanges = useCallback(async () => {
    checking.current = true;
    try {
      const sentFor = loadedState.current;
      const { state } = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
        const res = await authedFetch(`${LOAD_ENDPOINT}&check=1`, { method: 'GET' }, signal);
        if (!res.ok) throw new Error('The check failed.');
        return (await res.json()) as { state?: unknown };
      });
      // A load that landed while the check was out has already brought the newer state.
      if (
        typeof state === 'string' &&
        loadedState.current === sentFor &&
        state !== sentFor &&
        !loadRunning.current
      ) {
        reloadQuietly();
      }
    } catch {
      // Nothing the user did has failed, so nothing is said.
    } finally {
      checking.current = false;
    }
  }, [authedFetch, reloadQuietly]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !canReloadQuietly) return;
    const visible = () => document.visibilityState === 'visible';
    // Coming back reloads (after the 30-second window), and so does clicking into the window: two
    // windows side by side never fire visibilitychange, but clicking into one fires focus.
    const onReturn = () => {
      if (!visible()) return;
      lastInputAt.current = Date.now();
      if (!reloadsOnReturn(lastLoadAt.current, Date.now())) return;
      reloadQuietly();
    };
    const tick = () => {
      if (
        checksForChanges({
          visible: visible(),
          canReload: true,
          state: loadedState.current,
          checking: checking.current,
          lastInputAt: lastInputAt.current,
          now: Date.now(),
        })
      ) {
        void checkForChanges();
      }
    };
    // Input after the pause resumes the check at once rather than at the next tick.
    const onInput = () => {
      const now = Date.now();
      const wasIdle = now - lastInputAt.current >= IDLE_PAUSE_MS;
      lastInputAt.current = now;
      if (wasIdle) tick();
    };
    const inputs = ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;
    for (const type of inputs) window.addEventListener(type, onInput, { passive: true });
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    const timer = setInterval(tick, CHECK_INTERVAL_MS);
    return () => {
      for (const type of inputs) window.removeEventListener(type, onInput);
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      clearInterval(timer);
    };
  }, [isLoaded, isSignedIn, canReloadQuietly, checkForChanges, reloadQuietly]);

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
    (session: Session, onDiscarded?: () => void) => {
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
            if (!res.ok) throw new FriendlyError(failedMessage('create the session', res.status));
          });
          // A failed create has nothing left to report once another one lands.
          setFailures((f) => resolveFailure(f, 'create', null));
        } catch (err) {
          const timedOut = err instanceof TimeoutError;
          if (
            discardsFailedCreate({
              optedIn: onDiscarded !== undefined,
              onScreen: sessionsRef.current.some((s) => s.id === session.id),
              // Any edit queues a save, which waits behind this create, so a
              // busy queue means the user has put something in the session.
              edited: queue.isBusy(session.id),
            })
          ) {
            commit(sessionsRef.current.filter((s) => s.id !== session.id));
            // A create that timed out may still land, which would leave an empty
            // session behind to reappear on the next load. A delete after it is
            // a cheap best effort, and a 404 means there was nothing to remove.
            // It is held in `deleting` so a load meanwhile doesn't bring it back.
            deleting.current.add(session.id);
            void withDeadline(WRITE_TIMEOUT_MS, (signal) =>
              authedFetch(
                `${ENDPOINT}/${encodeURIComponent(session.id)}`,
                { method: 'DELETE' },
                signal,
              ),
            )
              .catch(() => {})
              .finally(() => deleting.current.delete(session.id));
            // Not filed against the session, which is gone, so "Try again"
            // neither looks for it nor reports it as a reverted edit.
            fail({
              kind: 'create',
              sessionId: null,
              message: timedOut ? CREATE_TIMEOUT : messageOf(err, 'Could not create the session.'),
            });
            onDiscarded?.();
          } else {
            // Filed as a save, because the next save of this session sends the
            // create again before saving, and its success resolves this failure.
            uncreated.current.add(session.id);
            fail({
              kind: 'save',
              sessionId: session.id,
              message: timedOut ? SAVE_TIMEOUT : messageOf(err, 'Could not create the session.'),
            });
          }
        } finally {
          // The deadline settles a stuck create at 30 seconds, so a delete
          // waiting on it goes ahead then rather than never.
          creating.current.delete(session.id);
        }
      })();
      creating.current.set(session.id, create);
      pending.track(create);
    },
    [authedFetch, commit, fail, pending, queue],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      // Kept so a failed delete can put the card back where it was.
      const index = sessionsRef.current.findIndex((s) => s.id === sessionId);
      const removed = sessionsRef.current[index];
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
              throw new FriendlyError(failedMessage('delete the session', res.status));
            }
          });
          // The user can delete it again after a failure, which this answers.
          setFailures((f) => resolveFailure(f, 'delete', sessionId));
        } catch (err) {
          // The session is still on the server, so it comes back at once rather
          // than only after "Try again". `deleting` still holds it up to here,
          // so a load landing meanwhile can't fight the restore.
          if (removed) commit(restoreAt(sessionsRef.current, removed, index));
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
      // Once the session has any payment on screen, "Already settled" is no
      // longer offered for it, so a failure telling the user to tap it can go.
      if ((sessionsRef.current.find((s) => s.id === sessionId)?.payments.length ?? 0) > 0) {
        setFailures((f) => resolveAlreadySettled(f, sessionId));
      }
    },
    [writeOrder],
  );

  /** Reports a payment failure, unless later successes have already answered it. */
  const paymentFailed = useCallback(
    (
      sessionId: string,
      seq: number,
      lines: readonly string[],
      message: string,
      refresh?: boolean,
    ) => {
      if (!writeOrder.superseded(sessionId, seq, lines)) {
        fail({ kind: 'payment', sessionId, message, seq, lines, refresh });
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
            // The server refused the payment itself, so trying it again can't
            // work; reloading shows how the line really stands.
            refusal !== null,
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
          // A session that has payments by now isn't offered "Already settled"
          // any more, so there is nothing for the message to send the user to.
          const now = sessionsRef.current.find((s) => s.id === id);
          if (!now || now.payments.length > 0) continue;
          paymentFailed(id, started.get(id) ?? 0, [ALREADY_SETTLED], message);
        }
      }
      return { settled, failed };
    },
    [addPayments, paymentFailed, writeOrder],
  );

  const removeAllPayments = useCallback(
    (sessionId: string, onSettled?: (ok: boolean) => void) => {
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
            onSettled?.(true);
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
        onSettled?.(false);
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

  /** Replaces one session's claims and, with them, its payments, in one change, if the session is still there. */
  const setLedger = useCallback(
    (
      sessionId: string,
      fn: (ledger: { payments: Payment[]; claims: Claim[] }) => {
        payments: Payment[];
        claims: Claim[];
      },
    ) => {
      commit(
        sessionsRef.current.map((s) =>
          s.id === sessionId
            ? { ...s, ...fn({ payments: s.payments, claims: s.claims ?? [] }) }
            : s,
        ),
      );
    },
    [commit],
  );

  /**
   * Sends one claims request and reads a refusal's body, which carries the ledger as the caller may
   * see it. The deadline covers the body too.
   */
  const claimRequest = useCallback(
    (path: string, init: RequestInit) =>
      withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
        const res = await authedFetch(path, init, signal);
        const type = res.headers.get('content-type') ?? '';
        const json =
          !res.ok && type.includes('application/json')
            ? ((await res.json()) as PaymentErrorBody)
            : null;
        return { status: res.status, body: json };
      }),
    [authedFetch],
  );

  /**
   * After a refusal that came with the server's ledger, the line shows that rather than waiting for
   * a reload: its payments and claims, minus any undo or withdraw still in flight, plus any other
   * add still in flight that the server hasn't got yet.
   */
  const applyServerLedger = useCallback(
    (sessionId: string, body: PaymentErrorBody | null, ids: Set<string>) => {
      if (!body || !Array.isArray(body.payments) || !Array.isArray(body.claims)) return false;
      const serverPayments = body.payments as Payment[];
      const serverClaims = body.claims as Claim[];
      const adding_ = (id: string) => adding.current.has(id) && !ids.has(id);
      const removing_ = (id: string) => removing.current.has(id);
      setLedger(sessionId, ({ payments, claims }) => ({
        payments: mergeServerPayments(payments, serverPayments, adding_, removing_),
        claims: mergeServerPayments(claims, serverClaims, adding_, removing_),
      }));
      return true;
    },
    [setLedger],
  );

  /** How a claim write ended, for the caller's own message and the banner. */
  const claimOutcome = useCallback(
    (
      sessionId: string,
      status: number | null,
      body: PaymentErrorBody | null,
      timedOut: boolean,
      fallback: string,
      onSettled: ((result: PaymentResult) => boolean | void) | undefined,
    ) => {
      // Only a refusal of the claim itself has words worth showing; anything else is the banner's.
      const refusal =
        (status === 409 || (status === 404 && body?.code === 'not_pending')) &&
        typeof body?.error === 'string'
          ? body.error
          : null;
      const message =
        refusal ??
        (status === 404
          ? DELETED_ELSEWHERE
          : status === 401
            ? SIGNED_OUT
            : timedOut
              ? 'This is taking too long. Check your connection and try again.'
              : fallback);
      const shown =
        onSettled?.({
          ok: false,
          message,
          payments: paymentsOf(sessionsRef.current, sessionId),
          code: typeof body?.code === 'string' ? body.code : undefined,
          status,
        }) === true;
      return { refusal, shown };
    },
    [],
  );

  const addClaims = useCallback(
    (
      sessionId: string,
      claims: NewClaim[],
      onSettled?: (result: PaymentResult) => boolean | void,
      options?: { quiet?: boolean },
    ): Promise<void> => {
      const session = sessionsRef.current.find((s) => s.id === sessionId);
      if (!session) {
        onSettled?.({ ok: false, message: 'This session is gone.', payments: [], status: null });
        return Promise.resolve();
      }
      // Only what this call put on screen is ever taken off again; a retry's claim is the server's.
      const added = newClaims(session.claims ?? [], claims, new Date().toISOString());
      setLedger(sessionId, ({ payments, claims: list }) => ({
        payments,
        claims: [...list, ...added],
      }));
      countPaying(sessionId, 1);
      const ids = new Set(added.map((c) => c.id));
      const seq = writeOrder.start();
      const lines = claims.map(lineKey);
      const title = sessionDisplayTitle(session);

      const work = (async () => {
        let status: number | null = null;
        let body: PaymentErrorBody | null = null;
        let timedOut = false;
        try {
          const result = await claimRequest(CLAIMS_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, claims }),
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
        }

        // Every other ending takes the claims off again, so nothing shows as waiting that wasn't sent.
        setLedger(sessionId, ({ payments, claims: list }) => ({
          payments,
          claims: list.filter((c) => !ids.has(c.id)),
        }));
        applyServerLedger(sessionId, body, ids);
        const current = sessionsRef.current.find((s) => s.id === sessionId);
        if (!current) return;

        const batch = claims.length > 1;
        const { refusal, shown } = claimOutcome(
          sessionId,
          status,
          body,
          timedOut,
          batch
            ? "Couldn't send what you've paid. Nothing was sent. Try again."
            : `Couldn't send what you've paid to ${claims[0].creditor} in “${title}”. Try again.`,
          onSettled,
        );
        if (!options?.quiet && (refusal === null || !shown)) {
          paymentFailed(
            sessionId,
            seq,
            lines,
            refusal !== null
              ? batch
                ? `What you've paid in “${title}” wasn't sent. ${refusal}`
                : `What you've paid to ${claims[0].creditor} in “${title}” wasn't sent. ${refusal}`
              : timedOut
                ? PAYMENTS_TIMEOUT
                : batch
                  ? "Couldn't send what you've paid. Nothing was sent. Try again."
                  : `Couldn't send what you've paid to ${claims[0].creditor} in “${title}”. Try again.`,
            refusal !== null,
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
      applyServerLedger,
      claimOutcome,
      claimRequest,
      countPaying,
      paymentFailed,
      paymentSucceeded,
      pending,
      setLedger,
      writeOrder,
    ],
  );

  const decideClaim = useCallback(
    (
      sessionId: string,
      claimId: string,
      decision: ClaimDecision,
      onSettled?: (result: PaymentResult) => boolean | void,
    ) => {
      const claim = sessionsRef.current
        .find((s) => s.id === sessionId)
        ?.claims?.find((c) => c.id === claimId);
      if (!claim) return;
      const confirming = decision === 'confirm';
      // A confirm turns the claim into a payment of the same id and the debtor's time (BR-C7), so
      // the payment goes on and the claim comes off in one change, and both come back together.
      const payment: Payment = {
        id: claim.id,
        debtor: claim.debtor,
        creditor: claim.creditor,
        amountCents: claim.amountCents,
        createdAt: claim.createdAt,
      };
      setLedger(sessionId, ({ payments, claims }) => ({
        payments: confirming ? [...payments, payment] : payments,
        claims: claims.filter((c) => c.id !== claimId),
      }));
      countPaying(sessionId, 1);
      const seq = writeOrder.start();
      const lines = [lineKey(claim)];
      const ids = new Set([claimId]);

      const work = (async () => {
        let status: number | null = null;
        let body: PaymentErrorBody | null = null;
        let timedOut = false;
        try {
          const result = await claimRequest(CLAIMS_ENDPOINT, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: claimId, decision }),
          });
          if (result.status === 200) {
            paymentSucceeded(sessionId, seq, lines);
            onSettled?.({ ok: true });
            return;
          }
          status = result.status;
          body = result.body;
        } catch (err) {
          timedOut = err instanceof TimeoutError;
        }

        if (!sessionsRef.current.some((s) => s.id === sessionId)) return;
        // With the server's ledger the line shows how it really stands. A claim that is no longer
        // waiting has gone for good. Anything else puts the claim, and the payment, back as they were.
        const redrawn = applyServerLedger(sessionId, body, ids);
        if (!redrawn && !(status === 404 && body?.code === 'not_pending')) {
          setLedger(sessionId, ({ payments, claims }) => ({
            payments: confirming ? payments.filter((p) => p.id !== claimId) : payments,
            claims: claims.some((c) => c.id === claimId) ? claims : [...claims, claim],
          }));
        } else if (!redrawn) {
          setLedger(sessionId, ({ payments, claims }) => ({
            payments: confirming ? payments.filter((p) => p.id !== claimId) : payments,
            claims,
          }));
        }
        const fallback = confirming
          ? `Couldn't confirm the payment from ${claim.debtor}. Try again.`
          : `Couldn't decline the payment from ${claim.debtor}. Try again.`;
        const { refusal, shown } = claimOutcome(
          sessionId,
          status,
          body,
          timedOut,
          fallback,
          onSettled,
        );
        if (refusal === null || !shown) {
          paymentFailed(
            sessionId,
            seq,
            lines,
            refusal ?? (timedOut ? PAYMENT_TIMEOUT : fallback),
            refusal !== null,
          );
        }
      })().finally(() => {
        settledDuringLoad.current.add(sessionId);
        countPaying(sessionId, -1);
        adding.current.delete(claimId);
      });
      // An undo of the payment a confirm just put on screen waits for it to land.
      if (confirming) adding.current.set(claimId, work);
      pending.track(work);
    },
    [
      applyServerLedger,
      claimOutcome,
      claimRequest,
      countPaying,
      paymentFailed,
      paymentSucceeded,
      pending,
      setLedger,
      writeOrder,
    ],
  );

  const removeClaim = useCallback(
    (sessionId: string, claimId: string, onSettled?: (result: PaymentResult) => boolean | void) => {
      const claim = sessionsRef.current
        .find((s) => s.id === sessionId)
        ?.claims?.find((c) => c.id === claimId);
      if (!claim) return;
      setLedger(sessionId, ({ payments, claims }) => ({
        payments,
        claims: claims.filter((c) => c.id !== claimId),
      }));
      countPaying(sessionId, 1);
      const seq = writeOrder.start();
      const lines = [lineKey(claim)];
      const ids = new Set([claimId]);
      removing.current.add(claimId);

      const work = (async () => {
        let status: number | null = null;
        let body: PaymentErrorBody | null = null;
        let timedOut = false;
        try {
          // A withdraw of a claim still being sent waits for it, or it would find nothing to delete.
          await adding.current.get(claimId);
          const result = await claimRequest(
            `${CLAIMS_ENDPOINT}?id=${encodeURIComponent(claimId)}`,
            { method: 'DELETE' },
          );
          // Not found means it is already gone, which is what was asked.
          if (result.status === 204 || result.status === 404) {
            paymentSucceeded(sessionId, seq, lines);
            onSettled?.({ ok: true });
            return;
          }
          status = result.status;
          body = result.body;
        } catch (err) {
          timedOut = err instanceof TimeoutError;
        }

        if (!sessionsRef.current.some((s) => s.id === sessionId)) return;
        // Confirmed meanwhile: the server's ledger shows it as the payment it became.
        if (!applyServerLedger(sessionId, body, ids)) {
          setLedger(sessionId, ({ payments, claims }) => ({
            payments,
            claims: claims.some((c) => c.id === claimId) ? claims : [...claims, claim],
          }));
        }
        const fallback =
          claim.status === 'declined'
            ? `Couldn't dismiss the note about your payment to ${claim.creditor}. Try again.`
            : `Couldn't withdraw your payment to ${claim.creditor}. Try again.`;
        const { refusal, shown } = claimOutcome(
          sessionId,
          status,
          body,
          timedOut,
          fallback,
          onSettled,
        );
        if (refusal === null || !shown) {
          paymentFailed(
            sessionId,
            seq,
            lines,
            refusal ?? (timedOut ? UNDO_TIMEOUT : fallback),
            refusal !== null,
          );
        }
      })().finally(() => {
        settledDuringLoad.current.add(sessionId);
        countPaying(sessionId, -1);
        removing.current.delete(claimId);
      });
      pending.track(work);
    },
    [
      applyServerLedger,
      claimOutcome,
      claimRequest,
      countPaying,
      paymentFailed,
      paymentSucceeded,
      pending,
      setLedger,
      writeOrder,
    ],
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
      // Sessions the account joined are never the dev bar's to delete: they are the organizer's, so
      // they stay on screen and no DELETE is sent for them.
      const all = sessionsRef.current;
      const prev = all.filter((s) => !isJoined(s));
      commit([...next, ...all.filter(isJoined)]);
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

  const addJoinedSession = useCallback(
    (session: Session) => {
      commit([...sessionsRef.current.filter((s) => s.id !== session.id), session]);
      // A load that read the list before the join landed would drop it again. Like a payment, it
      // is on screen already and the server has it, so the load keeps this copy.
      settledDuringLoad.current.add(session.id);
    },
    [commit],
  );

  /**
   * Sessions whose Stop tracking is currently failed, so "Try again" sends the stop itself.
   * Unlike an organizer's failed delete, which is restored and reloaded, a stop the user asked for
   * is still what they want.
   */
  const leavingFailed = useRef(new Set<string>());

  const leaveSession = useCallback(
    (sessionId: string) => {
      const index = sessionsRef.current.findIndex((s) => s.id === sessionId);
      const left = sessionsRef.current[index];
      // Nothing to leave if it isn't there, or isn't one the account joined: a member's own
      // member is named by the session, and an owner has no place to leave.
      if (!left || !isJoined(left) || left.me === null) return;
      const member = left.me;
      const title = sessionDisplayTitle(left);
      commit(sessionsRef.current.filter((s) => s.id !== sessionId));
      deleting.current.add(sessionId);
      const leave = (async () => {
        try {
          await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
            const res = await authedFetch(
              `${PARTICIPANTS_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}&member=${encodeURIComponent(member)}`,
              { method: 'DELETE' },
              signal,
            );
            // A 404 means the session or the place in it has already gone, which is what was asked.
            if (!res.ok && res.status !== 404) throw new Error('The server refused it.');
          });
          leavingFailed.current.delete(sessionId);
          setFailures((f) => resolveFailure(f, 'delete', sessionId));
        } catch {
          leavingFailed.current.add(sessionId);
          // Still tracking it on the server, so it comes back at once, as a failed delete's does.
          commit(restoreAt(sessionsRef.current, left, index));
          fail({
            kind: 'delete',
            sessionId,
            message: `Couldn't stop tracking “${title}”. Try again.`,
          });
        } finally {
          deleting.current.delete(sessionId);
        }
      })();
      pending.track(leave);
    },
    [authedFetch, commit, fail, pending],
  );

  const removeParticipant = useCallback(
    async (sessionId: string, member: string): Promise<boolean> => {
      try {
        const removed = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
          const res = await authedFetch(
            `${PARTICIPANTS_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}&member=${encodeURIComponent(member)}`,
            { method: 'DELETE' },
            signal,
          );
          return res.ok;
        });
        if (removed) {
          // The member is claimable again, so the pickers and the delete warning must stop counting them.
          commit(
            sessionsRef.current.map((s) =>
              s.id === sessionId
                ? { ...s, participants: (s.participants ?? []).filter((p) => p.member !== member) }
                : s,
            ),
          );
        }
        return removed;
      } catch {
        return false;
      }
    },
    [authedFetch, commit],
  );

  /**
   * Reloads from the server and clears every failure. The sessions whose
   * writes had failed are remembered, so the load can say whether it rolled
   * any of them back. A load failure alone adds none, so it never shows a note.
   */
  const retry = useCallback(() => {
    const stops = failedLeaveIds(failures, leavingFailed.current);
    for (const id of failedSessionIds(failures)) {
      if (!stops.includes(id)) revertCandidates.current.add(id);
    }
    setFailures([]);
    setReverted(false);
    // A failed stop is sent again, not just reloaded. It takes the session off the screen and
    // holds it there against the reload below.
    for (const id of stops) leaveSession(id);
    setReloads((n) => n + 1);
  }, [failures, leaveSession]);

  const dismissReverted = useCallback(() => setReverted(false), []);

  const status: SyncStatus = loading ? 'loading' : failures.length > 0 ? 'error' : 'ready';
  // One banner for every failure left, with the most recent one's message.
  const error = failures.length > 0 ? failures[failures.length - 1].message : null;
  const refresh = needsRefresh(failures[failures.length - 1]);

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
    addClaims,
    decideClaim,
    removeClaim,
    isPaying,
    replaceAll,
    appendAll,
    addJoinedSession,
    leaveSession,
    removeParticipant,
    status,
    loaded,
    error,
    refresh,
    retry,
    reverted,
    dismissReverted,
  };
}
