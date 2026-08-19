import styles from './NavTabs.module.css';

export type TabId = 'home' | 'breakdown' | 'summary';

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'summary', label: 'Summary' },
];

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
};

export function NavTabs({ active, onChange }: Props) {
  return (
    <nav className={styles.nav} role="tablist" aria-label="Pages">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          className={`${styles.tab} ${active === id ? styles.active : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
