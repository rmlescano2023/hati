import styles from './DateRangeFilter.module.css';

type Props = {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  /** Bounds of the archived data, used to clamp the pickers. */
  min: string;
  max: string;
  onReset: () => void;
  /** Whether the current range differs from the full span. */
  narrowed: boolean;
};

export function DateRangeFilter({
  start,
  end,
  onStartChange,
  onEndChange,
  min,
  max,
  onReset,
  narrowed,
}: Props) {
  return (
    <div className={styles.filter}>
      <div className={styles.field}>
        <label htmlFor="history-start">From</label>
        <input
          id="history-start"
          type="date"
          value={start}
          min={min}
          max={end}
          onChange={(e) => onStartChange(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="history-end">To</label>
        <input
          id="history-end"
          type="date"
          value={end}
          min={start}
          max={max}
          onChange={(e) => onEndChange(e.target.value)}
        />
      </div>
      {narrowed && (
        <button type="button" className={styles.reset} onClick={onReset}>
          Reset range
        </button>
      )}
    </div>
  );
}
