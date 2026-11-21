import { formatDateRange, formatLongDate, pluralize } from './format.js';
import type { PurchaseRecord, Session } from '../types';

/**
 * The part of a session its title is made from. The invite preview is built on the server from
 * a session's row and its record dates, with no whole `Session` to hand.
 */
type Titled = Pick<Session, 'name' | 'status' | 'closedAt' | 'createdAt'> & {
  records: Pick<PurchaseRecord, 'date'>[];
};

/**
 * How a session is named wherever it is listed or opened — its card on Home and
 * History, the workspace header, and a finished session's detail screen.
 *
 * A session is identified by the stretch of days its expenses cover, which is
 * what you actually recognise a trip by, and is the only date that reflects the
 * data itself. Neither timestamp does: `createdAt` is stamped when the session
 * record was made, which for a session migrated from a pre-sessions blob is the
 * moment of the upgrade, and `closedAt` only says when you got round to filing
 * it. A session with no records has no span, so it falls back to whichever
 * timestamp applies.
 */
export function sessionTitle(session: Titled): string {
  if (session.records.length > 0) {
    const dates = session.records.map((r) => r.date).sort();
    return formatDateRange(dates[0], dates[dates.length - 1]);
  }
  if (session.status === 'closed') {
    return formatLongDate((session.closedAt ?? session.createdAt).slice(0, 10));
  }
  return `Started ${formatLongDate(session.createdAt.slice(0, 10))}`;
}

/** The session's own name when it has one, otherwise the dates it covers. */
export function sessionDisplayTitle(session: Titled): string {
  return session.name ?? sessionTitle(session);
}

/**
 * The delete confirmation's message, shared by Home and History so both say the
 * same thing. Only a closed session with purchases warns about its statement:
 * one with no purchases never had a statement to download. A closed session
 * also leaves Collection while it is there, and takes every recorded payment with it, shown there
 * or not, so it names them and says they can't be recovered (BR-19). A session already in History
 * (`place`) has nothing in Collection to leave, so that clause goes.
 */
export function deleteSessionMessage(
  session: Session,
  place: 'collection' | 'history' = 'collection',
): string {
  const n = session.records.length;
  const m = session.members.length;
  if (n > 0) {
    const title = sessionDisplayTitle(session);
    const purchases = pluralize(n, 'purchase');
    if (session.status !== 'closed') {
      return `“${title}” and its ${purchases} will be deleted. This cannot be undone.`;
    }
    const p = session.payments.length;
    // Members who joined lose it too, so the organizer is told before confirming (D5). Read
    // from the field directly: importing `claimedMembers` would make an import cycle.
    const t = session.participants?.length ?? 0;
    const tracking = `${pluralize(t, 'member')} ${t === 1 ? 'is' : 'are'} tracking it on Hati, and it will disappear from their Collection and History too.`;
    if (p > 0) {
      return `“${title}” and its ${purchases} will be deleted, along with its ${pluralize(p, 'recorded payment')}. ${t > 0 ? `${tracking} ` : ''}Its statement can no longer be downloaded and the payments cannot be recovered. This cannot be undone.`;
    }
    if (t > 0) {
      return `“${title}” and its ${purchases} will be deleted, and its statement can no longer be downloaded. ${tracking} This cannot be undone.`;
    }
    if (place === 'history') {
      return `“${title}” and its ${purchases} will be deleted, and its statement can no longer be downloaded. This cannot be undone.`;
    }
    return `“${title}” and its ${purchases} will be deleted, and its statement can no longer be downloaded, and it will leave Collection. This cannot be undone.`;
  }
  const subject = session.name !== null ? `“${session.name}”` : 'This session';
  if (m > 0) {
    return `${subject} has ${pluralize(m, 'member')} but no purchases yet. Deleting it cannot be undone.`;
  }
  return `${subject} is empty. Deleting it cannot be undone.`;
}
