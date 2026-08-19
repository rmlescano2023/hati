import { Card } from '../shared/Card';
import { formatMoney } from '../../lib/format';
import { EPSILON } from '../../lib/money';
import type { NetBalance } from '../../types';
import styles from './NetBalanceCards.module.css';

export function NetBalanceCards({ balances }: { balances: NetBalance[] }) {
  return (
    <Card label="Net Balances">
      <div className={styles.grid}>
        {balances.map(({ member, amount }) => {
          const tone =
            amount > EPSILON ? styles.positive : amount < -EPSILON ? styles.negative : styles.zero;
          const caption =
            amount > EPSILON ? 'is owed back' : amount < -EPSILON ? 'owes' : 'settled up';
          return (
            <div className={styles.card} key={member}>
              <span className={styles.name}>{member}</span>
              <span className={`${styles.value} ${tone}`}>{formatMoney(Math.abs(amount))}</span>
              <span className={styles.sub}>{caption}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
