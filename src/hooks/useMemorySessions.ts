import { useCallback, useMemo, useRef, useState } from 'react';
import { createId } from '../lib/id';
import { isFullyPaid } from '../lib/collection';
import {
  addPaymentsTo,
  appendNew,
  mutateOne,
  removeAllPaymentsFrom,
  removePaymentFrom,
  settleOne,
} from '../lib/memorySessions';
import type { PaymentResult, SessionsBackend } from './useServerSessions';
import type { NewPayment, Session } from '../types';

const noop = () => {};

/**
 * A guide's practice backend: the same shape as `useServerSessions`, over memory, with no
 * network code at all (tab-guides BR-TG3). Nothing here is ever loaded, saved or sent, so a
 * practice session can't reach the account however the screen above it behaves.
 *
 * The list is kept in a ref beside the state and written only by `commit`, as the server hook
 * does, so a StrictMode double-run of an updater can't apply an edit twice.
 */
export function useMemorySessions(seed: Session[]): SessionsBackend {
  const [sessions, setSessions] = useState<Session[]>(seed);
  const sessionsRef = useRef<Session[]>(seed);
  const commit = useCallback((next: Session[]) => {
    sessionsRef.current = next;
    setSessions(next);
  }, []);

  const mutateSession = useCallback(
    (
      sessionId: string,
      fn: (session: Session) => Session,
      onSettled?: (saved: boolean) => void,
    ) => {
      const next = mutateOne(sessionsRef.current, sessionId, fn, new Date().toISOString());
      if (next !== null) commit(next);
      // Synchronous, after the commit: the card dispatches "saving" before it adds the records,
      // so settling at once is what makes it read "Saved." rather than stay on "Saving…".
      onSettled?.(next !== null);
    },
    [commit],
  );

  const addSession = useCallback(
    (session: Session) => {
      commit(appendNew(sessionsRef.current, [session]));
    },
    [commit],
  );

  const removeSession = useCallback(
    (sessionId: string) => {
      commit(sessionsRef.current.filter((s) => s.id !== sessionId));
    },
    [commit],
  );

  const addPayments = useCallback(
    (
      sessionId: string,
      payments: NewPayment[],
      onSettled?: (result: PaymentResult) => boolean | void,
    ): Promise<void> => {
      commit(addPaymentsTo(sessionsRef.current, sessionId, payments, new Date().toISOString()));
      onSettled?.({ ok: true });
      return Promise.resolve();
    },
    [commit],
  );

  const settleSessions = useCallback(
    async (sessionIds: string[]) => {
      let next = sessionsRef.current;
      const now = new Date().toISOString();
      for (const id of sessionIds) {
        const session = next.find((s) => s.id === id);
        if (!session || isFullyPaid(session)) continue;
        next = settleOne(next, id, () => createId('pay'), now);
      }
      commit(next);
      return {
        settled: sessionIds.filter((id) => {
          const session = next.find((s) => s.id === id);
          return session !== undefined && isFullyPaid(session);
        }),
        failed: [],
      };
    },
    [commit],
  );

  const removeAllPayments = useCallback(
    (sessionId: string) => {
      commit(removeAllPaymentsFrom(sessionsRef.current, sessionId));
    },
    [commit],
  );

  const removePayment = useCallback(
    (sessionId: string, paymentId: string, onSettled?: (result: PaymentResult) => void) => {
      commit(removePaymentFrom(sessionsRef.current, sessionId, paymentId));
      onSettled?.({ ok: true });
    },
    [commit],
  );

  const replaceAll = useCallback((next: Session[]) => commit(next), [commit]);
  const appendAll = useCallback(
    (next: Session[]) => commit(appendNew(sessionsRef.current, next)),
    [commit],
  );

  return useMemo<SessionsBackend>(
    () => ({
      sessions,
      mutateSession,
      addSession,
      removeSession,
      // Opening a practice session is not activity: there is nothing to sort or save (BR-TG19).
      recordOpen: noop,
      addPayments,
      settleSessions,
      removeAllPayments,
      removePayment,
      isPaying: () => false,
      replaceAll,
      appendAll,
      // A practice session is never joined and has no one to remove, so these do nothing (BR-G9).
      addJoinedSession: noop,
      leaveSession: noop,
      removeParticipant: () => Promise.resolve(false),
      status: 'ready',
      loaded: true,
      error: null,
      refresh: false,
      retry: noop,
      reverted: false,
      dismissReverted: noop,
    }),
    [
      sessions,
      mutateSession,
      addSession,
      removeSession,
      addPayments,
      settleSessions,
      removeAllPayments,
      removePayment,
      replaceAll,
      appendAll,
    ],
  );
}
