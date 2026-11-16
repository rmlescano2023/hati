import styles from './OwnerPill.module.css';

type Props = {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
};

export function OwnerPill({ label, checked, disabled = false, onChange }: Props) {
  const classes = [styles.pill, checked ? styles.checked : '', disabled ? styles.disabled : '']
    .filter(Boolean)
    .join(' ');

  return (
    <label className={classes}>
      <input
        type="checkbox"
        // Hidden from sight but still in the tab order, so Tab reaches the pill and Space toggles
        // it (app-fixes item 1). `display: none` took it out of the tab order.
        className="visually-hidden"
        checked={checked}
        disabled={disabled}
        onChange={disabled ? undefined : onChange}
      />
      <span className={styles.dot} />
      {label}
    </label>
  );
}
