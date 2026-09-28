import type { ReactNode } from 'react';
import styles from './NavTabs.module.css';

export type TabId = 'home' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'history', label: 'History' },
];

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
  /** Right-hand side of the nav row — the New Session action. */
  actions?: ReactNode;
};

export function NavTabs({ active, onChange, actions }: Props) {
  return (
    <div className={styles.row}>
      <nav className={styles.nav} role="tablist" aria-label="Pages">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            data-tour={`nav-${id}`}
            className={`${styles.tab} ${active === id ? styles.active : ''}`}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {actions}
    </div>
  );
}
