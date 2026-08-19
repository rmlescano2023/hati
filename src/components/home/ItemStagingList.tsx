import { Button } from '../shared/Button';
import { getItemShares, getItemTotal } from '../../lib/calculations';
import { compareNames, formatMoney, pluralize } from '../../lib/format';
import { sumMoney } from '../../lib/money';
import type { PurchaseItem } from '../../types';
import styles from './ItemStagingList.module.css';

type Props = {
  items: PurchaseItem[];
  onRemove: (itemId: string) => void;
};

export function ItemStagingList({ items, onRemove }: Props) {
  const total = sumMoney(items.map(getItemTotal));

  return (
    <>
      {/* Total sits above the list so it never shifts as rows are added. */}
      <div className={styles.totalBar}>
        <span className={styles.totalLabel}>{pluralize(items.length, 'item')} staged</span>
        <span className={styles.totalValue}>{formatMoney(total)}</span>
      </div>

      {items.length > 0 && (
        <div className={styles.list}>
          <div className={styles.head}>
            <span>Item</span>
            <span className={styles.r}>Price</span>
            <span>Owners / Amounts</span>
            <span />
          </div>
          {items.map((item) => {
            const shares = getItemShares(item);
            const owners = Object.keys(shares).sort(compareNames);
            return (
              <div className={styles.row} key={item.id}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.num}>{formatMoney(getItemTotal(item))}</span>
                <div className={styles.pills}>
                  {owners.map((owner) => (
                    <span className={styles.pill} key={owner}>
                      {item.mode === 'custom' ? `${owner}: ${formatMoney(shares[owner])}` : owner}
                    </span>
                  ))}
                </div>
                <span className={styles.removeCell}>
                  <Button
                    variant="icon"
                    onClick={() => onRemove(item.id)}
                    title="Remove item"
                    aria-label={`Remove ${item.name}`}
                  >
                    ×
                  </Button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
