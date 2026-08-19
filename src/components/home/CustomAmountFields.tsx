import { Button } from '../shared/Button';
import { formatMoney } from '../../lib/format';
import styles from './CustomAmountFields.module.css';

type Props = {
  members: string[];
  /** The target total the per-member amounts should add up to. */
  totalAmount: string;
  onTotalAmountChange: (raw: string) => void;
  amounts: Record<string, string>;
  onAmountChange: (member: string, raw: string) => void;
  onFillRemainder: () => void;
  /** Sum of the entered per-member amounts. */
  enteredTotal: number;
  blankCount: number;
  remainder: number;
};

export function CustomAmountFields({
  members,
  totalAmount,
  onTotalAmountChange,
  amounts,
  onAmountChange,
  onFillRemainder,
  enteredTotal,
  blankCount,
  remainder,
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
          <input
            id="custom-total"
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

      <div className={styles.grid}>
        {members.map((m) => (
          <div className={`${styles.field} ${styles.memberField}`} key={m}>
            <label htmlFor={`custom-${m}`}>{m}</label>
            <input
              id={`custom-${m}`}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amounts[m] ?? ''}
              onChange={(e) => onAmountChange(m, e.target.value)}
            />
          </div>
        ))}
      </div>

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
