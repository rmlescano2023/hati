import { lazy, Suspense, useMemo, useState } from 'react';
import { SessionCard } from '../components/sessions/SessionCard';
import { Button } from '../components/shared/Button';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { EmptyState } from '../components/shared/EmptyState';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { compareByRecentActivity } from '../lib/activity';
import { deleteSessionMessage } from '../lib/sessionLabel';
import styles from './HomePage.module.css';

// Dev-only: `import.meta.env.DEV` is statically false in a production build, so
// this branch and everything it pulls in are dropped at build time.
const DevSessionsBar = import.meta.env.DEV
  ? lazy(() =>
      import('../components/home/DevSessionsBar').then((m) => ({ default: m.DevSessionsBar })),
    )
  : null;

type Props = {
  onOpenSession: (sessionId: string) => void;
  /** Starts a session and opens it — the same action the nav row offers. */
  onNewSession: () => void;
  /** Dev-only: starts the onboarding tour without touching the account flag. */
  onPreviewTour?: () => void;
  onPreviewWhatsNew?: () => void;
  onAskAlreadySettled?: () => void;
};

/**
 * The launcher. Lists every draft session so several trips or groups can run in
 * parallel; closed sessions live on the History tab. New sessions are started
 * from the action in the nav row.
 */
export function HomePage({
  onOpenSession,
  onNewSession,
  onPreviewTour,
  onPreviewWhatsNew,
  onAskAlreadySettled,
}: Props) {
  const { sessions, deleteSession } = useSessionsStore();
  // Held by id and looked up on render, so the confirmation always reads the
  // session's current name.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const drafts = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'draft')
        // Most recently opened or changed first (see compareByRecentActivity).
        .sort(compareByRecentActivity),
    [sessions],
  );
  const pendingDelete = drafts.find((s) => s.id === pendingDeleteId) ?? null;

  const devBar = DevSessionsBar && (
    <Suspense fallback={null}>
      <DevSessionsBar
        onPreviewTour={onPreviewTour}
        onPreviewWhatsNew={onPreviewWhatsNew}
        onAskAlreadySettled={onAskAlreadySettled}
      />
    </Suspense>
  );

  if (drafts.length === 0) {
    return (
      <>
        {devBar}
        <EmptyState
          title="No sessions in progress"
          description="Start one to add members and log what everyone spent."
        >
          <Button variant="primary" size="lg" data-tour="new-session" onClick={onNewSession}>
            + New Session
          </Button>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {devBar}
      <h2 className={styles.heading}>In Progress</h2>
      <div className={styles.list} data-tour="session-list">
        {drafts.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onClick={() => onOpenSession(session.id)}
            onDelete={() => setPendingDeleteId(session.id)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this session?"
        message={pendingDelete ? deleteSessionMessage(pendingDelete) : ''}
        confirmLabel="Delete Session"
        destructive
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDelete) deleteSession(pendingDelete.id);
          setPendingDeleteId(null);
        }}
      />
    </>
  );
}
