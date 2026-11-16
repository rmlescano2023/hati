import { Fragment } from 'react';
import { Button } from '../shared/Button';
import { PencilIcon } from '../shared/icons';
import { useAppDataOptional } from '../../context/AppDataContext';
import { receiptRowLabel, receiptRows } from '../../lib/bill';
import { formatMoney, formatSignedMoney } from '../../lib/format';
import type { SavedItemRef } from '../../lib/staging';
import type { BreakdownGroup } from '../../types';
import styles from './BreakdownTable.module.css';

type Props = {
  group: BreakdownGroup;
  /** Alphabetical member columns. */
  members: string[];
  /** Frozen groups drop the Edit and remove-item controls. */
  editable?: boolean;
  /** Asks to edit a saved item; History passes none, and shows no Edit. */
  onEdit?: (ref: SavedItemRef) => void;
};

export function BreakdownTable({ group, members, editable = true, onEdit }: Props) {
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
          {group.rows.map((row) => {
            // Two copies of the same button, one by the name for a phone and one
            // beside × for a desktop. CSS displays exactly one at any width, and
            // `display: none` takes the other out of the tab order and the
            // accessibility tree.
            const editButton = (position: string) =>
              editable &&
              onEdit && (
                <Button
                  variant="icon"
                  className={`${styles.edit} ${position}`}
                  title="Edit item"
                  aria-label={`Edit ${row.item.name}`}
                  onClick={() =>
                    onEdit({ recordId: row.recordId, itemId: row.item.id, name: row.item.name })
                  }
                >
                  <PencilIcon className={styles.editIcon} />
                </Button>
              );

            // The receipt under the item, for an itemized item only (BR-CO14,
            // BR-CA34); the item's own row stays the one that is summed.
            const rows = receiptRows(row.item);

            return (
              <Fragment key={row.item.id}>
                <tr className={rows ? styles.hasLines : undefined}>
                  <td className={styles.itemCell}>
                    <div className={styles.itemWrap}>
                      <span className={styles.itemName}>{row.item.name}</span>
                      {editButton(styles.editInline)}
                    </div>
                  </td>
                  <td className={`${styles.num} ${styles.price}`}>{formatMoney(row.total)}</td>
                  {members.map((m) => {
                    const share = row.shares[m] ?? 0;
                    return (
                      <td key={m} className={`${styles.num} ${share > 0 ? '' : styles.muted}`}>
                        {share > 0 ? formatMoney(share) : '—'}
                      </td>
                    );
                  })}
                  {editable && (
                    <td className={styles.action}>
                      <span className={styles.actions}>
                        {editButton(styles.editAction)}
                        <Button
                          variant="icon"
                          title="Remove item"
                          aria-label={`Remove ${row.item.name}`}
                          onClick={() => data?.removeItem(row.recordId, row.item.id)}
                        >
                          ×
                        </Button>
                      </span>
                    </td>
                  )}
                </tr>
                {rows?.map((r, i) => {
                  const label = receiptRowLabel(r);
                  return (
                    <tr
                      key={`${row.item.id}:${i}`}
                      className={`${styles.lineRow} ${i === rows.length - 1 ? styles.lastLine : ''}`}
                    >
                      <td className={styles.lineName}>
                        {label.fallback ? (
                          <span className={styles.noName}>{label.text}</span>
                        ) : (
                          label.text
                        )}
                      </td>
                      {/* An own order's price is in its member's column; a shared order,
                          discount or charge prints its amount here (BR-CA35). */}
                      <td className={styles.num}>
                        {r.kind === 'order'
                          ? ''
                          : formatSignedMoney(r.kind === 'discount' ? -r.amount : r.amount)}
                      </td>
                      {members.map((m) => (
                        <td key={m} className={styles.num}>
                          {r.parts.has(m) ? formatSignedMoney(r.parts.get(m)!) : ''}
                        </td>
                      ))}
                      {editable && <td />}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
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
