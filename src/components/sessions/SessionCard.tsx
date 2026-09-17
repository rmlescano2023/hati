import { getGrandTotal } from '../../lib/calculations';
import { formatMoney, joinNames, pluralize } from '../../lib/format';
import { sessionTitle } from '../../lib/sessionLabel';
import type { Session } from '../../types';
import styles from './SessionCard.module.css';

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
        <span className={styles.date}>{sessionTitle(session)}</span>
        <span className={styles.total}>{formatMoney(getGrandTotal(session.records))}</span>
      </span>
      <span className={styles.members}>
        {session.members.length > 0 ? joinNames(session.members) : 'No members yet'}
      </span>
      <span className={styles.count}>{pluralize(session.records.length, 'purchase')}</span>
    </button>
  );
}
