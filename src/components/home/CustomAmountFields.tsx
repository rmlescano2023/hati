import { Button } from '../shared/Button';
import { ClearableInput } from '../shared/ClearableInput';
import { OwnerGrid } from '../shared/OwnerGrid';
import { formatMoney } from '../../lib/format';
import {
  ORDER_NAME_MAX,
  linesOf,
  normaliseOrderName,
  type LineDraft,
  type LinesDraft,
} from '../../lib/orderLines';
import styles from './CustomAmountFields.module.css';

type Props = {
  members: string[];
  /** The target total the picked members' lines should add up to. */
  totalAmount: string;
  onTotalAmountChange: (raw: string) => void;
  onFillRemainder: () => void;
  owners: Record<string, boolean>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOwner: (member: string) => void;
  /** Who is in the item, alphabetically; each gets a block of order lines. */
  picked: string[];
  lines: LinesDraft;
  onLineChange: (
    member: string,
    index: number,
    patch: Partial<Pick<LineDraft, 'name' | 'price'>>,
  ) => void;
  onAddLine: (member: string) => void;
  onRemoveLine: (member: string, index: number) => void;
  /** Sum of the picked members' priced lines. */
  enteredTotal: number;
  blankCount: number;
  remainder: number;
  /** The first order with a name and no price, or null. */
  missingPrice: string | null;
};

export function CustomAmountFields({
  members,
  totalAmount,
  onTotalAmountChange,
  onFillRemainder,
  owners,
  allSelected,
  onToggleAll,
  onToggleOwner,
  picked,
  lines,
  onLineChange,
  onAddLine,
  onRemoveLine,
  enteredTotal,
  blankCount,
  remainder,
  missingPrice,
}: Props) {
  if (members.length === 0) {
    return <p className={styles.hint}>Add group members first.</p>;
  }

  const target = Number.parseFloat(totalAmount);
  const hasTarget = Number.isFinite(target) && target > 0;
  const mismatch = hasTarget && Math.abs(target - enteredTotal) >= 0.01;
  const canFill = hasTarget && blankCount > 0 && remainder > 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <div className={`${styles.field} ${styles.totalField}`}>
          <label htmlFor="custom-total">Total Amount (₱)</label>
          <ClearableInput
            id="custom-total"
            clearLabel="Clear total amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={totalAmount}
            onChange={(e) => onTotalAmountChange(e.target.value)}
          />
        </div>
        <Button
          onClick={onFillRemainder}
          disabled={!canFill}
          title={
            canFill
              ? `Split ${formatMoney(remainder)} across ${blankCount} blank member${
                  blankCount === 1 ? '' : 's'
                }`
              : 'Enter a total amount and leave at least one member blank'
          }
        >
          Fill Remainder
        </Button>
      </div>

      <div className={styles.field}>
        <label>Who&apos;s in this item</label>
        <OwnerGrid
          members={members}
          selected={owners}
          allSelected={allSelected}
          onToggleAll={onToggleAll}
          onToggle={onToggleOwner}
        />
      </div>

      <div className={styles.blocks}>
        {picked.map((m) => {
          const memberLines = linesOf(lines, m);
          return (
            <div className={styles.block} key={m}>
              <span className={styles.blockName}>{m}</span>
              {memberLines.map((line, i) => {
                const orderName = normaliseOrderName(line.name);
                return (
                  <div className={styles.line} key={line.key}>
                    <ClearableInput
                      type="text"
                      clearLabel={`Clear ${m}'s order ${i + 1} name`}
                      compactClear
                      maxLength={ORDER_NAME_MAX}
                      placeholder="Order (optional)"
                      aria-label={`${m}'s order ${i + 1} name`}
                      value={line.name}
                      onChange={(e) => onLineChange(m, i, { name: e.target.value })}
                    />
                    <ClearableInput
                      type="number"
                      className={styles.priceBox}
                      clearLabel={`Clear ${m}'s order ${i + 1} price`}
                      compactClear
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      aria-label={`${m}'s order ${i + 1} price`}
                      value={line.price}
                      onChange={(e) => onLineChange(m, i, { price: e.target.value })}
                    />
                    {/* A member always keeps one line, so a lone line has no ×. */}
                    {memberLines.length > 1 && (
                      <Button
                        variant="icon"
                        title="Remove order"
                        aria-label={
                          orderName ? `Remove ${m}'s order ${orderName}` : `Remove ${m}'s order`
                        }
                        onClick={() => onRemoveLine(m, i)}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className={styles.addOrder}
                aria-label={`Add order for ${m}`}
                onClick={() => onAddLine(m)}
              >
                + Add order
              </Button>
            </div>
          );
        })}
      </div>

      {missingPrice !== null && (
        <p className={styles.lineHint}>Add a price for {missingPrice} or remove it</p>
      )}

      <div className={styles.footer}>
        <span>Entered</span>
        <span className={`${styles.sum} ${mismatch ? styles.mismatch : ''}`}>
          {formatMoney(enteredTotal)}
        </span>
        {mismatch && <span className={styles.mismatch}>of {formatMoney(target)}</span>}
      </div>
    </div>
  );
}
