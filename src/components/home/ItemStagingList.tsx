import { Button } from '../shared/Button';
import { getItemShares, getItemTotal } from '../../lib/calculations';
import { compareNames, formatLongDate, formatMoney, pluralize } from '../../lib/format';
import { sumMoney } from '../../lib/money';
import type { StagedItem } from '../../lib/staging';
import styles from './ItemStagingList.module.css';

type Props = {
  items: StagedItem[];
  onRemove: (itemId: string) => void;
};

export function ItemStagingList({ items, onRemove }: Props) {
  const total = sumMoney(items.map((s) => getItemTotal(s.item)));

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
          {items.map(({ item, date, payorMode, payors }) => {
            const shares = getItemShares(item);
            const owners = Object.keys(shares).sort(compareNames);
            return (
              <div className={styles.row} key={item.id}>
                <div className={styles.itemCell}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.meta}>
                    {formatLongDate(date)} · Paid by{' '}
                    {payorMode === 'single'
                      ? payors[0].member
                      : payors.map((p) => `${p.member}: ${formatMoney(p.amount)}`).join(', ')}
                  </span>
                </div>
                <span className={styles.num}>{formatMoney(getItemTotal(item))}</span>
                <div className={styles.pills}>
                  {owners.map((owner) => (
                    <span className={styles.pill} key={owner}>
                      {item.mode === 'custom' ? `${owner}: ${formatMoney(shares[owner])}` : owner}
                    </span>
                  ))}
                </div>
                <span className={styles.actions}>
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
