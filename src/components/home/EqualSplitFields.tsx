import { OwnerGrid } from '../shared/OwnerGrid';
import { formatMoney } from '../../lib/format';
import { splitEvenly } from '../../lib/money';
import styles from './EqualSplitFields.module.css';

type Props = {
  members: string[];
  /** The item's total price, owned by ItemModeFields; used for the per-head share. */
  price: string;
  owners: Record<string, boolean>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOwner: (member: string) => void;
  selectedCount: number;
};

export function EqualSplitFields({
  members,
  price,
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
        {/* Equal Split can't take a discount off one person; Custom Amounts can, with a
            shared order for everyone and a discount for that person. */}
        {members.length > 0 && selectedCount > 0 && (
          <p className={styles.hint}>
            Need a discount for one person? Switch to Custom Amounts and add a shared order.
          </p>
        )}
      </div>
    </div>
  );
}
