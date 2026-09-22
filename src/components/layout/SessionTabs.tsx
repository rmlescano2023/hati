import styles from './NavTabs.module.css';

export type SessionTabId = 'expenses' | 'breakdown' | 'summary';

const TABS: { id: SessionTabId; label: string }[] = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'summary', label: 'Summary' },
];

type Props = {
  active: SessionTabId;
  onChange: (tab: SessionTabId) => void;
};

/**
 * The workspace's inner nav. Shares NavTabs' styling so both read as one system,
 * including the `.row` wrapper that carries the spacing below the tabs.
 */
export function SessionTabs({ active, onChange }: Props) {
  return (
    <div className={styles.row}>
      <nav className={styles.nav} role="tablist" aria-label="Session">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            data-tour={`tab-${id}`}
            className={`${styles.tab} ${active === id ? styles.active : ''}`}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
