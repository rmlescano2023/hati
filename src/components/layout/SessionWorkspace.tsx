import { useEffect, useRef, useState } from 'react';
import { AppDataProvider } from '../../context/AppDataContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { Button } from '../shared/Button';
import { PencilIcon } from '../shared/icons';
import { SessionNameInput } from '../sessions/SessionNameInput';
import { SessionTabs, type SessionTabId } from './SessionTabs';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { BreakdownPage } from '../../pages/BreakdownPage';
import { SummaryPage } from '../../pages/SummaryPage';
import { sessionTitle } from '../../lib/sessionLabel';
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
  const { sessions, renameSession } = useSessionsStore();
  const session = sessions.find((s) => s.id === sessionId);
  const [renaming, setRenaming] = useState(false);
  const pencilRef = useRef<HTMLButtonElement>(null);
  // Set when an edit ends from the keyboard, so focus goes back to the pencil
  // rather than being dropped on the page.
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (!renaming && restoreFocus.current) {
      restoreFocus.current = false;
      pencilRef.current?.focus();
    }
  }, [renaming]);

  return (
    <AppDataProvider sessionId={sessionId}>
      <div className={styles.bar}>
        <Button variant="ghost" size="sm" data-tour="workspace-back" onClick={onBack}>
          ← Back to Home
        </Button>
        {session && (
          <div className={styles.titleBlock}>
            {renaming ? (
              <SessionNameInput
                className={styles.nameInput}
                initialName={session.name}
                onSave={(raw) => renameSession(sessionId, raw)}
                onClose={(via) => {
                  setRenaming(false);
                  if (via !== 'blur') restoreFocus.current = true;
                }}
              />
            ) : (
              <span className={styles.titles}>
                {session.name !== null && <span className={styles.name}>{session.name}</span>}
                <span className={styles.started}>{sessionTitle(session)}</span>
              </span>
            )}
            {session.status === 'draft' && !renaming && (
              <button
                type="button"
                ref={pencilRef}
                className={styles.rename}
                title="Rename session"
                aria-label="Rename session"
                onClick={() => setRenaming(true)}
              >
                <PencilIcon className={styles.icon} />
              </button>
            )}
          </div>
        )}
      </div>

      <SessionTabs
        active={tab}
        onChange={(t) => {
          // Closing the box first means its unmount saves the name even when
          // the browser doesn't blur it on the tap.
          setRenaming(false);
          onTabChange(t);
        }}
      />

      {tab === 'expenses' && <ExpensesPage />}
      {tab === 'breakdown' && <BreakdownPage />}
      {tab === 'summary' && <SummaryPage onClosed={onClosed} />}
    </AppDataProvider>
  );
}
