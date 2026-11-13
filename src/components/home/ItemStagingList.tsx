import { Button } from '../shared/Button';
import { PencilIcon } from '../shared/icons';
import { getItemShares, getItemTotal } from '../../lib/calculations';
import { compareNames, formatLongDate, formatMoney, pluralize } from '../../lib/format';
import { sumMoney } from '../../lib/money';
import type { StagedItem } from '../../lib/staging';
import styles from './ItemStagingList.module.css';

type Props = {
  items: StagedItem[];
  /** The row being edited, if any. While one is, every row's Edit and × are locked. */
  editingId: string | null;
  onEdit: (itemId: string) => void;
  onRemove: (itemId: string) => void;
};

export function ItemStagingList({ items, editingId, onEdit, onRemove }: Props) {
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
              <div
                className={`${styles.row} ${item.id === editingId ? styles.editing : ''}`}
                key={item.id}
              >
                <div className={styles.itemCell}>
                  <span className={styles.name}>{item.name}</span>
                  {/* Words as well as the highlight, so the state doesn't rest on colour. */}
                  {item.id === editingId && <span className={styles.editingTag}>Editing</span>}
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
                    className={styles.edit}
                    id={`edit-${item.id}`}
                    onClick={() => onEdit(item.id)}
                    disabled={editingId !== null}
                    title="Edit item"
                    aria-label={`Edit ${item.name}`}
                  >
                    <PencilIcon className={styles.editIcon} />
                  </Button>
                  <Button
                    variant="icon"
                    disabled={editingId !== null}
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
