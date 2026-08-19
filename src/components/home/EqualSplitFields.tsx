import { OwnerGrid } from '../shared/OwnerGrid';
import { formatMoney } from '../../lib/format';
import { splitEvenly } from '../../lib/money';
import styles from './EqualSplitFields.module.css';

type Props = {
  members: string[];
  price: string;
  onPriceChange: (raw: string) => void;
  owners: Record<string, boolean>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOwner: (member: string) => void;
  selectedCount: number;
};

export function EqualSplitFields({
  members,
  price,
  onPriceChange,
  owners,
  allSelected,
  onToggleAll,
  onToggleOwner,
  selectedCount,
}: Props) {
  const parsed = Number.parseFloat(price);
  const perHead =
    Number.isFinite(parsed) && parsed > 0 && selectedCount > 0
      ? splitEvenly(parsed, selectedCount)[0]
      : null;

  return (
    <div className={styles.wrap}>
      <div className={`${styles.field} ${styles.priceField}`}>
        <label htmlFor="item-price">Total Price (₱)</label>
        <input
          id="item-price"
          type="number"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label>
          Owner(s) — Split Equally Among{' '}
          {perHead !== null && <span className={styles.share}>({formatMoney(perHead)} each)</span>}
        </label>
        {members.length === 0 ? (
          <p className={styles.hint}>Add group members first.</p>
        ) : (
          <OwnerGrid
            members={members}
            selected={owners}
            allSelected={allSelected}
            onToggleAll={onToggleAll}
            onToggle={onToggleOwner}
          />
        )}
      </div>
    </div>
  );
}
