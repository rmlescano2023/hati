import { ModeToggle } from '../shared/ModeToggle';
import { formatMoney } from '../../lib/format';
import type { PayorMode } from '../../types';
import styles from './PayorModeFields.module.css';

type Props = {
  members: string[];
  payorMode: PayorMode;
  onPayorModeChange: (mode: PayorMode) => void;
  singlePayor: string;
  onSinglePayorChange: (member: string) => void;
  contributions: Record<string, string>;
  onContributionChange: (member: string, raw: string) => void;
  /** The price of the item being added, which the contributions have to cover. */
  itemTotal: number;
  /** What the contributions add up to, read the way the Add Item check reads them. */
  contributed: number;
};

export function PayorModeFields({
  members,
  payorMode,
  onPayorModeChange,
  singlePayor,
  onSinglePayorChange,
  contributions,
  onContributionChange,
  itemTotal,
  contributed,
}: Props) {
  const mismatch = itemTotal > 0 && Math.abs(contributed - itemTotal) >= 0.01;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className={styles.label}>Paid By</span>
        <ModeToggle
          ariaLabel="Payor mode"
          value={payorMode}
          onChange={onPayorModeChange}
          options={[
            { value: 'single', label: 'One Payor' },
            { value: 'multiple', label: 'Multiple Payors' },
          ]}
        />
      </div>

      {members.length === 0 ? (
        <p className={styles.hint}>Add group members first.</p>
      ) : payorMode === 'single' ? (
        <select
          aria-label="Paid by"
          value={singlePayor}
          onChange={(e) => onSinglePayorChange(e.target.value)}
        >
          <option value="">— Select —</option>
          {members.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      ) : (
        <>
          <div className={styles.contribGrid}>
            {members.map((m) => (
              <div className={styles.contribRow} key={m}>
                <label htmlFor={`contrib-${m}`}>{m}</label>
                <input
                  id={`contrib-${m}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={contributions[m] ?? ''}
                  onChange={(e) => onContributionChange(m, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className={styles.footer}>
            <span>Contributed</span>
            <span className={`${styles.amount} ${mismatch ? styles.mismatch : ''}`}>
              {formatMoney(contributed)}
            </span>
            {mismatch && <span className={styles.mismatch}>of {formatMoney(itemTotal)}</span>}
          </div>
        </>
      )}
    </div>
  );
}
