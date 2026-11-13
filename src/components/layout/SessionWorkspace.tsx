import { useEffect, useRef, useState } from 'react';
import { AppDataProvider } from '../../context/AppDataContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { PencilIcon } from '../shared/icons';
import { SessionNameInput } from '../sessions/SessionNameInput';
import { SessionTabs, type SessionTabId } from './SessionTabs';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { BreakdownPage } from '../../pages/BreakdownPage';
import { SummaryPage } from '../../pages/SummaryPage';
import { pluralize } from '../../lib/format';
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
  const { sessions, renameSession, sync } = useSessionsStore();
  const session = sessions.find((s) => s.id === sessionId);
  const [renaming, setRenaming] = useState(false);
  const pencilRef = useRef<HTMLButtonElement>(null);
  // Set when an edit ends from the keyboard, so focus goes back to the pencil
  // rather than being dropped on the page.
  const restoreFocus = useRef(false);
  // How many items are staged on the Expenses tab, reported by that page. Any
  // way out of the tab while it is above 0 asks first, where `leaveTo` holds
  // the place waiting on the answer.
  const [stagedCount, setStagedCount] = useState(0);
  const [leaveTo, setLeaveTo] = useState<SessionTabId | 'home' | null>(null);

  useEffect(() => {
    if (!renaming && restoreFocus.current) {
      restoreFocus.current = false;
      pencilRef.current?.focus();
    }
  }, [renaming]);

  return (
    <AppDataProvider
      sessionId={sessionId}
      onBack={() => {
        // The session is gone, not reverted, so a note about unsaved changes
        // left over from losing it would be wrong on every screen after this.
        sync.dismissReverted();
        onBack();
      }}
    >
      <div className={styles.bar}>
        <Button
          variant="ghost"
          size="sm"
          data-tour="workspace-back"
          onClick={() => (stagedCount > 0 ? setLeaveTo('home') : onBack())}
        >
          ← Back to Home
        </Button>
        {session && (
          <div className={styles.titleBlock}>
            {renaming ? (
              <span className={styles.renameBox}>
                <SessionNameInput
                  className={`${styles.nameInput} ${session.name === null ? styles.unnamedInput : ''}`}
                  initialName={session.name}
                  describedBy="session-name-hint"
                  onSave={(raw) => renameSession(sessionId, raw)}
                  onClose={(via) => {
                    setRenaming(false);
                    if (via !== 'blur') restoreFocus.current = true;
                  }}
                />
                {/* Worded for the primary pointer rather than the width, so a
                    touch laptop gets the keyboard wording. It is read when the
                    box opens, which is all the short-lived box needs. */}
                <span id="session-name-hint" className={styles.hint}>
                  {window.matchMedia('(pointer: coarse)').matches
                    ? 'Tap Done to save'
                    : 'Enter to save · Esc to cancel'}
                </span>
              </span>
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
          // The current tab is not a way out, so it never asks.
          if (stagedCount > 0 && t !== tab) setLeaveTo(t);
          else onTabChange(t);
        }}
      />

      {tab === 'expenses' && <ExpensesPage onStagedCountChange={setStagedCount} />}
      {tab === 'breakdown' && <BreakdownPage />}
      {tab === 'summary' && <SummaryPage onClosed={onClosed} />}

      <ConfirmDialog
        open={leaveTo !== null}
        title="Leave without saving?"
        message={`You have ${pluralize(stagedCount, 'staged item')} that ${stagedCount === 1 ? "isn't" : "aren't"} saved.`}
        confirmLabel="Discard and leave"
        cancelLabel="Stay"
        destructive
        onCancel={() => setLeaveTo(null)}
        onConfirm={() => {
          const to = leaveTo;
          setLeaveTo(null);
          // Leaving unmounts the Expenses page, which is what drops the staged
          // items. Nothing is saved.
          if (to === 'home') onBack();
          else if (to) onTabChange(to);
        }}
      />
    </AppDataProvider>
  );
}
