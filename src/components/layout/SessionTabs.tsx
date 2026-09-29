import type { ComponentType } from 'react';
import { BreakdownIcon, ExpensesIcon, SummaryIcon } from '../shared/icons';
import styles from './NavTabs.module.css';

export type SessionTabId = 'expenses' | 'breakdown' | 'summary';

const TABS: { id: SessionTabId; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: 'expenses', label: 'Expenses', Icon: ExpensesIcon },
  { id: 'breakdown', label: 'Breakdown', Icon: BreakdownIcon },
  { id: 'summary', label: 'Summary', Icon: SummaryIcon },
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
    <div className={`${styles.row} ${styles.rowCentered}`}>
      <nav className={styles.nav} role="tablist" aria-label="Session">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active === id}
            data-tour={`tab-${id}`}
            className={`${styles.tab} ${active === id ? styles.active : ''}`}
            onClick={() => onChange(id)}
          >
            <Icon className={styles.tabIcon} />
            <span className={styles.tabLabel}>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
