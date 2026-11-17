import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppDataProvider } from '../../context/AppDataContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { HelpIcon, PencilIcon } from '../shared/icons';
import { SessionNameInput } from '../sessions/SessionNameInput';
import { SessionTabs, type SessionTabId } from './SessionTabs';
import { ExpensesPage } from '../../pages/ExpensesPage';
import { BreakdownPage } from '../../pages/BreakdownPage';
import { SummaryPage } from '../../pages/SummaryPage';
import { sessionTitle } from '../../lib/sessionLabel';
import {
  leaveMessage,
  paidByMemory,
  type PaidByPicks,
  type PurchaseFormSeed,
  type SavedItemRef,
  type StagedItem,
} from '../../lib/staging';
import styles from './SessionWorkspace.module.css';

type Props = {
  sessionId: string;
  /** Every session's remembered Paid By pick, held by the app (app-fixes item 3). */
  paidByPicks: PaidByPicks;
  tab: SessionTabId;
  onTabChange: (tab: SessionTabId) => void;
  onBack: () => void;
  onClosed: () => void;
  /** Starts the Expenses guide. "?" shows on the Expenses tab only while this is given. */
  onHelp?: () => void;
  /** The "Leave without saving?" message while there's unsaved work, else null, so the app can ask before a tutorial. */
  onUnsavedChange?: (message: string | null) => void;
  /** A guide's practice: no leave prompts or reload warning, and the scene's seed (tab-guides). */
  practice?: { seed?: PurchaseFormSeed; initialStaged?: StagedItem[] };
};

/** The "Edit item" prompt's message (BR-CO25, amended by bill-ux-polish-2 item 6). */
export const EDIT_ITEM_MESSAGE =
  'It opens on the Expenses tab with its date and Paid By. Breakdown keeps it as it is until you press Save Edits. Cancel brings you back to Breakdown.';

/**
 * One open session. Everything below the provider still talks to `useAppData()`
 * and is unaware that sessions exist — swapping which session is open is purely
 * a matter of which `sessionId` this provider is given.
 */
export function SessionWorkspace({
  sessionId,
  paidByPicks,
  tab,
  onTabChange,
  onBack,
  onClosed,
  onHelp,
  onUnsavedChange,
  practice,
}: Props) {
  const { sessions, renameSession, sync } = useSessionsStore();
  const paidBy = useMemo(() => paidByMemory(paidByPicks, sessionId), [paidByPicks, sessionId]);
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
  /** The saved item the user chose to edit; meaningful only on the Expenses tab (BR-CO27). */
  const [savedEdit, setSavedEdit] = useState<SavedItemRef | null>(null);
  /** The item whose Edit prompt is open. */
  const [editPrompt, setEditPrompt] = useState<SavedItemRef | null>(null);
  /** Shown on Breakdown after an edit closed because its item had gone (BR-CO35). */
  const [notice, setNotice] = useState<string | null>(null);

  // Any way off the tab ends the edit, the tour's setScreen included, so a
  // stale one can never come back on the next visit to Expenses. The notice
  // belongs to the Breakdown visit it was shown on.
  useEffect(() => {
    if (tab !== 'expenses') setSavedEdit(null);
    if (tab !== 'breakdown') setNotice(null);
  }, [tab]);

  // An edit of a saved item is unsaved work just as a staged item is. Practice is never saved,
  // so neither Back nor a tab asks (BR-TG21).
  const hasUnsaved = !practice && (stagedCount > 0 || savedEdit !== null);

  // The app asks the same question before a tutorial replaces this screen, so it is told what
  // there is to lose, and told again that there's nothing once this unmounts.
  const unsavedMessage = hasUnsaved ? leaveMessage(savedEdit, stagedCount) : null;
  useEffect(() => {
    onUnsavedChange?.(unsavedMessage);
  }, [onUnsavedChange, unsavedMessage]);
  useEffect(() => () => onUnsavedChange?.(null), [onUnsavedChange]);

  const endSavedEdit = useCallback(
    (removed: boolean) => {
      if (removed && savedEdit) setNotice(`${savedEdit.name} was removed, so the edit was closed.`);
      setSavedEdit(null);
      onTabChange('breakdown');
    },
    [savedEdit, onTabChange],
  );

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
          onClick={() => (hasUnsaved ? setLeaveTo('home') : onBack())}
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
                {/* A third line in the title stack, under the date. The accessible name
                    contains the visible text, so a voice user saying "click Need help" finds it. */}
                {tab === 'expenses' && onHelp && (
                  <button
                    type="button"
                    id="workspace-help"
                    className={styles.help}
                    aria-label="Need help? See how to log expenses"
                    onClick={onHelp}
                  >
                    Need help?
                    <HelpIcon className={styles.helpIcon} />
                  </button>
                )}
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
          if (hasUnsaved && t !== tab) setLeaveTo(t);
          else onTabChange(t);
        }}
      />

      {tab === 'breakdown' && notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}

      {tab === 'expenses' && (
        <ExpensesPage
          onStagedCountChange={setStagedCount}
          savedEdit={savedEdit}
          onSavedEditEnd={endSavedEdit}
          paidBy={paidBy}
          practice={practice}
          onHelp={onHelp}
        />
      )}
      {tab === 'breakdown' && <BreakdownPage onEditItem={setEditPrompt} />}
      {tab === 'summary' && <SummaryPage onClosed={onClosed} />}

      <ConfirmDialog
        open={leaveTo !== null}
        title="Leave without saving?"
        message={leaveMessage(savedEdit, stagedCount)}
        confirmLabel="Discard and leave"
        cancelLabel="Stay"
        destructive
        onCancel={() => setLeaveTo(null)}
        onConfirm={() => {
          const to = leaveTo;
          setLeaveTo(null);
          // Leaving unmounts the Expenses page, which is what drops the staged
          // items, and the tab effect above ends a saved-item edit. Nothing is saved.
          if (to === 'home') onBack();
          else if (to) onTabChange(to);
        }}
      />

      {/* Breakdown is on screen only after Expenses has unmounted, which drops
          its staged items and typed fields, so there is never anything half-done
          to warn about when Edit is pressed (BR-CO26). */}
      <ConfirmDialog
        open={editPrompt !== null}
        title={`Edit ${editPrompt?.name ?? ''}?`}
        message={EDIT_ITEM_MESSAGE}
        confirmLabel="Edit item"
        onCancel={() => setEditPrompt(null)}
        onConfirm={() => {
          setSavedEdit(editPrompt);
          setEditPrompt(null);
          onTabChange('expenses');
        }}
      />
    </AppDataProvider>
  );
}
