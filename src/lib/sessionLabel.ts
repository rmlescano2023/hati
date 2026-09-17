import { formatDateRange, formatLongDate } from './format';
import type { Session } from '../types';

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
export function sessionTitle(session: Session): string {
  if (session.records.length > 0) {
    const dates = session.records.map((r) => r.date).sort();
    return formatDateRange(dates[0], dates[dates.length - 1]);
  }
  if (session.status === 'closed') {
    return formatLongDate((session.closedAt ?? session.createdAt).slice(0, 10));
  }
  return `Started ${formatLongDate(session.createdAt.slice(0, 10))}`;
}
