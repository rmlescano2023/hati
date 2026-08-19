import { OwnerPill } from './OwnerPill';
import styles from './OwnerGrid.module.css';

type Props = {
  members: string[];
  selected: Record<string, boolean>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggle: (member: string) => void;
  allLabel?: string;
};

/**
 * The owner checkbox grid: a leading "All Members" pill that, when checked,
 * disables (and visually selects) every individual member pill.
 */
export function OwnerGrid({
  members,
  selected,
  allSelected,
  onToggleAll,
  onToggle,
  allLabel = 'All Members',
}: Props) {
  return (
    <div className={styles.grid}>
      <OwnerPill label={allLabel} checked={allSelected} onChange={onToggleAll} />
      {members.map((m) => (
        <OwnerPill
          key={m}
          label={m}
          checked={allSelected || Boolean(selected[m])}
          disabled={allSelected}
          onChange={() => onToggle(m)}
        />
      ))}
    </div>
  );
}
