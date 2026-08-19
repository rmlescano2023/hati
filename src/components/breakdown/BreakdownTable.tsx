import { EditableCell } from '../shared/EditableCell';
import { Button } from '../shared/Button';
import { useAppData } from '../../context/AppDataContext';
import { formatMoney } from '../../lib/format';
import type { BreakdownGroup } from '../../types';
import styles from './BreakdownTable.module.css';

type Props = {
  group: BreakdownGroup;
  /** Alphabetical member columns. */
  members: string[];
};

export function BreakdownTable({ group, members }: Props) {
  const { updateItemName, updateItemTotal, updateItemMemberAmount, removeItem } = useAppData();

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.itemCol}>Item</th>
            <th className={`${styles.priceCol} ${styles.r}`}>Price</th>
            {members.map((m) => (
              <th key={m} className={`${styles.memberCol} ${styles.r}`}>
                {m}
              </th>
            ))}
            <th className={styles.actionCol} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => (
            <tr key={row.item.id}>
              <td>
                <EditableCell
                  kind="text"
                  value={row.item.name}
                  ariaLabel={`Item name for ${row.item.name}`}
                  onCommit={(name) => updateItemName(row.recordId, row.item.id, name)}
                />
              </td>
              <td>
                <EditableCell
                  kind="money"
                  value={row.total}
                  format={formatMoney}
                  ariaLabel={`Price of ${row.item.name}`}
                  onCommit={(total) => updateItemTotal(row.recordId, row.item.id, total)}
                />
              </td>
              {members.map((m) => (
                <td key={m}>
                  <EditableCell
                    kind="money"
                    value={row.shares[m] ?? 0}
                    format={formatMoney}
                    emptyDisplay="—"
                    ariaLabel={`${m}'s share of ${row.item.name}`}
                    onCommit={(amount) =>
                      updateItemMemberAmount(row.recordId, row.item.id, m, amount)
                    }
                  />
                </td>
              ))}
              <td className={styles.action}>
                <Button
                  variant="icon"
                  title="Remove item"
                  aria-label={`Remove ${row.item.name}`}
                  onClick={() => removeItem(row.recordId, row.item.id)}
                >
                  ×
                </Button>
              </td>
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <td>
              <span className={styles.totalLabel}>Total</span>
            </td>
            <td className={styles.dash}>{formatMoney(group.grandTotal)}</td>
            {members.map((m) => (
              <td key={m} className={styles.dash}>
                {group.totals[m] > 0 ? formatMoney(group.totals[m]) : '—'}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
