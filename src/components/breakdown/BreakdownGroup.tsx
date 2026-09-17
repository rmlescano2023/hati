import { Card } from '../shared/Card';
import { PayorBadge } from './PayorBadge';
import { BreakdownTable } from './BreakdownTable';
import { formatLongDate, formatMoney } from '../../lib/format';
import type { BreakdownGroup as Group } from '../../types';
import styles from './BreakdownGroup.module.css';

type Props = {
  group: Group;
  members: string[];
  /**
   * Whether this group's records are still inside the edit window. Every record
   * in a group shares one date, so editability is a single flag for the card.
   */
  editable?: boolean;
  /**
   * Why the card is read-only, which is not always its age: History renders
   * closed sessions read-only whatever the dates on them.
   */
  lockedReason?: 'age' | 'closed';
};

const LOCK_TITLE: Record<'age' | 'closed', string> = {
  age: 'Records older than 7 days are read-only',
  closed: 'This session is closed and can no longer be edited',
};

export function BreakdownGroup({ group, members, editable = true, lockedReason = 'age' }: Props) {
  return (
    <Card>
      <div className={styles.header}>
        <div className={styles.left}>
          <span className={styles.date}>{formatLongDate(group.date)}</span>
          <PayorBadge payors={group.payors} payorMode={group.payorMode} />
          {!editable && (
            <span className={styles.locked} title={LOCK_TITLE[lockedReason]}>
              Locked
            </span>
          )}
        </div>
        <div className={styles.right}>
          <span className={styles.totalLabel}>Total</span>
          <span className={styles.total}>{formatMoney(group.grandTotal)}</span>
        </div>
      </div>
      <BreakdownTable group={group} members={members} editable={editable} />
    </Card>
  );
}
