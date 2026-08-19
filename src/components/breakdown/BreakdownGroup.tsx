import { Card } from '../shared/Card';
import { PayorBadge } from './PayorBadge';
import { BreakdownTable } from './BreakdownTable';
import { formatLongDate, formatMoney } from '../../lib/format';
import type { BreakdownGroup as Group } from '../../types';
import styles from './BreakdownGroup.module.css';

type Props = {
  group: Group;
  members: string[];
};

export function BreakdownGroup({ group, members }: Props) {
  return (
    <Card>
      <div className={styles.header}>
        <div className={styles.left}>
          <span className={styles.date}>{formatLongDate(group.date)}</span>
          <PayorBadge payors={group.payors} payorMode={group.payorMode} />
        </div>
        <div className={styles.right}>
          <span className={styles.totalLabel}>Total</span>
          <span className={styles.total}>{formatMoney(group.grandTotal)}</span>
        </div>
      </div>
      <BreakdownTable group={group} members={members} />
    </Card>
  );
}
