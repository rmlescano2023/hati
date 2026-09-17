import { AppDataProvider } from '../../context/AppDataContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { Button } from '../shared/Button';
import { SessionTabs, type SessionTabId } from './SessionTabs';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { BreakdownPage } from '../../pages/BreakdownPage';
import { SummaryPage } from '../../pages/SummaryPage';
import { formatLongDate, joinNames } from '../../lib/format';
import styles from './SessionWorkspace.module.css';

type Props = {
  sessionId: string;
  tab: SessionTabId;
  onTabChange: (tab: SessionTabId) => void;
  onBack: () => void;
  onClosed: () => void;
};

/**
 * One open session. Everything below the provider still talks to `useAppData()`
 * and is unaware that sessions exist — swapping which session is open is purely
 * a matter of which `sessionId` this provider is given.
 */
export function SessionWorkspace({ sessionId, tab, onTabChange, onBack, onClosed }: Props) {
  const { sessions } = useSessionsStore();
  const session = sessions.find((s) => s.id === sessionId);

  return (
    <AppDataProvider sessionId={sessionId}>
      <div className={styles.bar}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← All sessions
        </Button>
        {session && (
          <div className={styles.meta}>
            <span className={styles.started}>
              Started {formatLongDate(session.createdAt.slice(0, 10))}
            </span>
            {session.members.length > 0 && (
              <span className={styles.members}>{joinNames(session.members)}</span>
            )}
          </div>
        )}
      </div>

      <SessionTabs active={tab} onChange={onTabChange} />

      {tab === 'expenses' && <ExpensesPage />}
      {tab === 'breakdown' && <BreakdownPage />}
      {tab === 'summary' && <SummaryPage onClosed={onClosed} />}
    </AppDataProvider>
  );
}
