import { PayorModeFields } from './PayorModeFields';
import { formatLongDate } from '../../lib/format';
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

/** Matches the max-width query in PurchaseDetailsFields.module.css. */
const MOBILE = '(max-width: 640px)';

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
        {/* On a phone the native control's own text is hidden and this shows
            instead: a phone's date input picks its own short format and
            alignment, and neither can be styled. The input still sits on top,
            invisible, so a tap opens the phone's date picker. */}
        <div className={styles.dateBox}>
          <span className={styles.dateDisplay} aria-hidden="true">
            {date ? formatLongDate(date) : 'Select a date'}
          </span>
          <input
            id="purchase-date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            onClick={(e) => {
              // Phones open the picker on any tap; a desktop browser emulating
              // one only does from its icon, which the overlay hides.
              if (!window.matchMedia(MOBILE).matches) return;
              try {
                e.currentTarget.showPicker();
              } catch {
                // Unsupported or already open: the native tap still works.
              }
            }}
          />
        </div>
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
