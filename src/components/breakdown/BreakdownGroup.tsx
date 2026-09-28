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
   * Read-only means one thing now: the session is closed. Open sessions stay
   * editable however old their purchases are.
   */
  editable?: boolean;
};

const LOCKED_TITLE = 'This session is closed and can no longer be edited';

export function BreakdownGroup({ group, members, editable = true }: Props) {
  return (
    <Card>
      <div className={styles.header}>
        <div className={styles.left}>
          <span className={styles.date}>{formatLongDate(group.date)}</span>
          <PayorBadge payors={group.payors} payorMode={group.payorMode} />
          {!editable && (
            <span className={styles.locked} title={LOCKED_TITLE}>
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
