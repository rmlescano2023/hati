import { formatDateRange, formatLongDate } from './format';
import type { Session } from '../types';

/**
 * How a session is named wherever it is listed or opened — its card on Home and
 * History, and the workspace header.
 *
 * A session is identified by the stretch of days its expenses cover, which is
 * what you actually recognise a trip by, and is the only date that reflects the
 * data itself: `createdAt` is stamped when the session record was made, which
 * for a session migrated from a pre-sessions blob is the moment of the upgrade
 * rather than anything to do with the expenses inside it.
 *
 * A closed session leads with the date it was filed instead, matching History's
 * heading and its sort order. An empty draft has no span yet, so it falls back
 * to when it was started.
 */
export function sessionTitle(session: Session): string {
  if (session.status === 'closed') {
    return formatLongDate((session.closedAt ?? session.createdAt).slice(0, 10));
  }
  if (session.records.length === 0) {
    return `Started ${formatLongDate(session.createdAt.slice(0, 10))}`;
  }
  const dates = session.records.map((r) => r.date).sort();
  return formatDateRange(dates[0], dates[dates.length - 1]);
}
