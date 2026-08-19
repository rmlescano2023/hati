import styles from './ModeToggle.module.css';

export type ModeOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: ModeOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
};

export function ModeToggle<T extends string>({ options, value, onChange, ariaLabel }: Props<T>) {
  return (
    <div className={styles.toggle} role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          className={`${styles.option} ${value === opt.value ? styles.active : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
