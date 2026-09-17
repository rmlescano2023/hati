import { EditableCell } from '../shared/EditableCell';
import { Button } from '../shared/Button';
import { useAppDataOptional } from '../../context/AppDataContext';
import { formatMoney } from '../../lib/format';
import type { BreakdownGroup } from '../../types';
import styles from './BreakdownTable.module.css';

type Props = {
  group: BreakdownGroup;
  /** Alphabetical member columns. */
  members: string[];
  /** Frozen groups render read-only cells and drop the remove-item column. */
  editable?: boolean;
};

export function BreakdownTable({ group, members, editable = true }: Props) {
  // Null on the History page, which renders these cards read-only and outside
  // any session; every call below is gated on `editable` regardless.
  const data = useAppDataOptional();

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.itemCol}>Item</th>
            <th className={`${styles.priceCol} ${styles.r}`}>Item Total</th>
            {members.map((m) => (
              <th key={m} className={`${styles.memberCol} ${styles.r}`}>
                {m}
              </th>
            ))}
            {editable && <th className={styles.actionCol} aria-label="Actions" />}
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
                  disabled={!editable}
                  onCommit={(name) => data?.updateItemName(row.recordId, row.item.id, name)}
                />
              </td>
              <td>
                <EditableCell
                  kind="money"
                  value={row.total}
                  format={formatMoney}
                  className={styles.priceInput}
                  ariaLabel={`Item total for ${row.item.name}`}
                  disabled={!editable}
                  onCommit={(total) => data?.updateItemTotal(row.recordId, row.item.id, total)}
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
                    disabled={!editable}
                    onCommit={(amount) =>
                      data?.updateItemMemberAmount(row.recordId, row.item.id, m, amount)
                    }
                  />
                </td>
              ))}
              {editable && (
                <td className={styles.action}>
                  <Button
                    variant="icon"
                    title="Remove item"
                    aria-label={`Remove ${row.item.name}`}
                    onClick={() => data?.removeItem(row.recordId, row.item.id)}
                  >
                    ×
                  </Button>
                </td>
              )}
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <td>
              <span className={styles.totalLabel}>Total</span>
            </td>
            <td className={styles.totalValue}>{formatMoney(group.grandTotal)}</td>
            {members.map((m) => (
              <td
                key={m}
                className={`${styles.totalValue} ${group.totals[m] > 0 ? '' : styles.empty}`}
              >
                {group.totals[m] > 0 ? formatMoney(group.totals[m]) : '—'}
              </td>
            ))}
            {editable && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
