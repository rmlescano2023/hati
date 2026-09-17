import { getGrandTotal } from '../../lib/calculations';
import {
  formatDateRange,
  formatLongDate,
  formatMoney,
  joinNames,
  pluralize,
} from '../../lib/format';
import type { Session } from '../../types';
import styles from './SessionCard.module.css';

/**
 * What the card leads with. A draft is identified by the stretch of days its
 * expenses cover, which is what you actually recognise a trip by; an empty one
 * has no span yet, so it falls back to when it was started. A closed session
 * leads with the date it was filed, matching History's heading.
 */
function title(session: Session): string {
  if (session.status === 'closed') {
    return formatLongDate((session.closedAt ?? session.createdAt).slice(0, 10));
  }
  if (session.records.length === 0) {
    return `Started ${formatLongDate(session.createdAt.slice(0, 10))}`;
  }
  const dates = session.records.map((r) => r.date).sort();
  return formatDateRange(dates[0], dates[dates.length - 1]);
}

type Props = {
  session: Session;
  onClick: () => void;
};

/**
 * One session as a scannable summary row — a draft on Home, a closed session on
 * History. Both lists lead somewhere, so the card is always a button. It leads
 * with whichever date matters for its state; the list's own heading ("In
 * Progress" / "Closed") says which, so the card doesn't repeat it.
 */
export function SessionCard({ session, onClick }: Props) {
  return (
    <button type="button" className={styles.card} onClick={onClick}>
      <span className={styles.top}>
        <span className={styles.date}>{title(session)}</span>
        <span className={styles.total}>{formatMoney(getGrandTotal(session.records))}</span>
      </span>
      <span className={styles.members}>
        {session.members.length > 0 ? joinNames(session.members) : 'No members yet'}
      </span>
      <span className={styles.count}>{pluralize(session.records.length, 'purchase')}</span>
    </button>
  );
}
