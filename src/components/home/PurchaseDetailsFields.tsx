import { PayorModeFields } from './PayorModeFields';
import type { PayorMode } from '../../types';
import styles from './PurchaseDetailsFields.module.css';

type Props = {
  members: string[];
  date: string;
  onDateChange: (date: string) => void;
  payorMode: PayorMode;
  onPayorModeChange: (mode: PayorMode) => void;
  singlePayor: string;
  onSinglePayorChange: (member: string) => void;
  contributions: Record<string, string>;
  onContributionChange: (member: string, raw: string) => void;
  stagedTotal: number;
};

export function PurchaseDetailsFields({
  members,
  date,
  onDateChange,
  payorMode,
  onPayorModeChange,
  singlePayor,
  onSinglePayorChange,
  contributions,
  onContributionChange,
  stagedTotal,
}: Props) {
  return (
    <div className={styles.grid}>
      <div className={styles.dateField}>
        <label htmlFor="purchase-date">Date</label>
        <input
          id="purchase-date"
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
        />
      </div>

      <PayorModeFields
        members={members}
        payorMode={payorMode}
        onPayorModeChange={onPayorModeChange}
        singlePayor={singlePayor}
        onSinglePayorChange={onSinglePayorChange}
        contributions={contributions}
        onContributionChange={onContributionChange}
        stagedTotal={stagedTotal}
      />
    </div>
  );
}
