import { formatMoney } from '../../lib/format';
import type { Settlement } from '../../types';
import styles from './SettlementCard.module.css';

export function SettlementCard({ settlement }: { settlement: Settlement }) {
  const { debtor, lines, total } = settlement;

  return (
    <div className={styles.block}>
      <p className={styles.head}>
        <span className={styles.debtor}>{debtor}</span> needs to pay
      </p>
      <ul className={styles.lines}>
        {lines.map((line) => (
          <li className={styles.line} key={line.creditor}>
            <span>
              <span className={styles.creditor}>{line.creditor}</span>
            </span>
            <span className={styles.lineAmount}>{formatMoney(line.amount)}</span>
          </li>
        ))}
      </ul>
      {lines.length > 1 && (
        <div className={styles.total}>
          <span className={styles.totalLabel}>Total</span>
          <span className={styles.totalAmount}>{formatMoney(total)}</span>
        </div>
      )}
    </div>
  );
}
