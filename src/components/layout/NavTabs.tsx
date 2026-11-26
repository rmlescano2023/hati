import type { ComponentType, ReactNode } from 'react';
import { toConfirmCountLine } from '../../lib/joinedSessions';
import { CollectionIcon, HistoryIcon, HomeIcon } from '../shared/icons';
import styles from './NavTabs.module.css';

export type TabId = 'home' | 'collection' | 'history';

const TABS: { id: TabId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'collection', label: 'Collection', Icon: CollectionIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
];

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
  /** Right-hand side of the nav row — the New Session action. */
  actions?: ReactNode;
  /** A small count on a tab, such as the payments waiting for this account's answer on Collection. */
  counts?: Partial<Record<TabId, number>>;
};

export function NavTabs({ active, onChange, actions, counts = {} }: Props) {
  return (
    <div className={styles.row}>
      <nav className={styles.nav} role="tablist" aria-label="Pages">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            data-tour={`nav-${id}`}
            className={`${styles.tab} ${active === id ? styles.active : ''}`}
            onClick={() => onChange(id)}
          >
            <Icon className={styles.tabIcon} />
            <span className={styles.tabLabel}>{label}</span>
            {(counts[id] ?? 0) > 0 && (
              <>
                <span className={styles.count} aria-hidden="true">
                  {(counts[id] ?? 0) > 99 ? '99+' : counts[id]}
                </span>
                <span className="visually-hidden">{`, ${toConfirmCountLine(counts[id] ?? 0)}`}</span>
              </>
            )}
          </button>
        ))}
      </nav>
      {actions}
    </div>
  );
}
