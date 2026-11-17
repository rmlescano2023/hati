import { newPayments, settlePayments } from './collection';
import type { NewPayment, Session } from '../types';

/**
 * The memory backend's reducers: what a guide's practice store does to its
 * sessions, as pure functions (tab-guides). Each returns a new array, or null
 * when nothing changed, and none of them touches the network, because a
 * practice session is never saved (BR-TG3).
 */

/**
 * `fn` applied to one session and stamped as activity, as a real save is; null when the session
 * is gone or `fn` changed nothing.
 */
export function mutateOne(
  sessions: Session[],
  sessionId: string,
  fn: (session: Session) => Session,
  now: string,
): Session[] | null {
  const index = sessions.findIndex((s) => s.id === sessionId);
  if (index === -1) return null;
  const changed = fn(sessions[index]);
  // The store's guards return the session unchanged to mean "no-op".
  if (changed === sessions[index]) return null;
  const next = [...sessions];
  next[index] = { ...changed, activityAt: now };
  return next;
}

/** One session with its payments replaced by `fn`'s answer; every other session is untouched. */
function withPayments(
  sessions: Session[],
  sessionId: string,
  fn: (session: Session) => Session['payments'],
): Session[] {
  return sessions.map((s) => (s.id === sessionId ? { ...s, payments: fn(s) } : s));
}

/** Adds the payments not already there, stamped `now` (`newPayments`). */
export function addPaymentsTo(
  sessions: Session[],
  sessionId: string,
  payments: NewPayment[],
  now: string,
): Session[] {
  return withPayments(sessions, sessionId, (s) => [
    ...s.payments,
    ...newPayments(s.payments, payments, now),
  ]);
}

export function removePaymentFrom(
  sessions: Session[],
  sessionId: string,
  paymentId: string,
): Session[] {
  return withPayments(sessions, sessionId, (s) => s.payments.filter((p) => p.id !== paymentId));
}

export function removeAllPaymentsFrom(sessions: Session[], sessionId: string): Session[] {
  return withPayments(sessions, sessionId, () => []);
}

/** Pays what's left on every pair, one payment each (`settlePayments`), with ids from `mintId`. */
export function settleOne(
  sessions: Session[],
  sessionId: string,
  mintId: () => string,
  now: string,
): Session[] {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return sessions;
  const entries = settlePayments(session).map((p) => ({ ...p, id: mintId() }));
  return addPaymentsTo(sessions, sessionId, entries, now);
}

/** Adds the sessions whose ids aren't there yet. */
export function appendNew(sessions: Session[], next: Session[]): Session[] {
  return [...sessions, ...next.filter((n) => !sessions.some((s) => s.id === n.id))];
}
