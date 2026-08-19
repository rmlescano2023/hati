import { formatMoney } from '../../lib/format';
import type { PayorContribution, PayorMode } from '../../types';
import styles from './PayorBadge.module.css';

type Props = {
  payors: PayorContribution[];
  payorMode: PayorMode;
};

export function PayorBadge({ payors, payorMode }: Props) {
  if (payors.length === 0) return null;

  if (payorMode === 'single' || payors.length === 1) {
    return (
      <div className={styles.badges}>
        <span className={styles.badge}>Paid by {payors[0].member}</span>
      </div>
    );
  }

  return (
    <div className={styles.badges}>
      <span className={styles.prefix}>Paid by</span>
      {payors.map((p) => (
        <span className={styles.badge} key={p.member}>
          {p.member} <span className={styles.amount}>{formatMoney(p.amount)}</span>
        </span>
      ))}
    </div>
  );
}
