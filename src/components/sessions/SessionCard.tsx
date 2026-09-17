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
 * One session as a scannable summary row — a draft on Home, a finished session
 * on History. Both lists lead somewhere, so the card is always a button, and
 * both name the session by the days its expenses cover; the list's own heading
 * says which kind of session you are looking at.
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
