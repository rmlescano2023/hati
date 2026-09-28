import { getGrandTotal } from '../../lib/calculations';
import { formatMoney, joinNames, pluralize } from '../../lib/format';
import { sessionTitle } from '../../lib/sessionLabel';
import type { Session } from '../../types';
import styles from './SessionCard.module.css';

type Props = {
  session: Session;
  onClick: () => void;
  /** When given, the card offers a delete action. Omitted, it doesn't. */
  onDelete?: () => void;
};

/** A bin rather than a cross: this removes the whole session, not one row. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={styles.icon}>
      <path
        d="M2.5 4h11M6.5 4V2.75A.75.75 0 0 1 7.25 2h1.5a.75.75 0 0 1 .75.75V4M6.5 7v4.5M9.5 7v4.5M3.75 4l.6 8.4a1.25 1.25 0 0 0 1.25 1.1h4.8a1.25 1.25 0 0 0 1.25-1.1l.6-8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One session as a scannable summary row — a draft on Home, a finished session
 * on History. Both lists lead somewhere, so the card is always a button, and
 * both name the session by the days its expenses cover; the list's own heading
 * says which kind of session you are looking at.
 *
 * Delete sits in the card's bottom corner but is a sibling of the card rather
 * than a child, laid over it: a button cannot nest inside another button, and
 * making the card a div instead would cost the keyboard behaviour a real
 * button gives for free.
 */
export function SessionCard({ session, onClick, onDelete }: Props) {
  return (
    <div className={styles.row}>
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
      {onDelete && (
        <button
          type="button"
          className={styles.delete}
          title="Delete session"
          aria-label={`Delete session ${sessionTitle(session)}`}
          onClick={onDelete}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
