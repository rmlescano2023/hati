import { lazy, Suspense, useMemo, useState } from 'react';
import { SessionCard } from '../components/sessions/SessionCard';
import { Button } from '../components/shared/Button';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { EmptyState } from '../components/shared/EmptyState';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { pluralize } from '../lib/format';
import { sessionTitle } from '../lib/sessionLabel';
import type { Session } from '../types';
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
};

/**
 * The launcher. Lists every draft session so several trips or groups can run in
 * parallel; closed sessions live on the History tab. New sessions are started
 * from the action in the nav row.
 */
export function HomePage({ onOpenSession, onNewSession }: Props) {
  const { sessions, deleteSession } = useSessionsStore();
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);

  const drafts = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'draft')
        // Most recently started first.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessions],
  );

  const devBar = DevSessionsBar && (
    <Suspense fallback={null}>
      <DevSessionsBar />
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
          <Button variant="primary" size="lg" onClick={onNewSession}>
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
      <div className={styles.list}>
        {drafts.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onClick={() => onOpenSession(session.id)}
            onDelete={() => setPendingDelete(session)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this session?"
        message={
          pendingDelete && pendingDelete.records.length > 0
            ? `“${sessionTitle(pendingDelete)}” and its ${pluralize(pendingDelete.records.length, 'purchase')} will be deleted. This cannot be undone.`
            : 'This session is empty. Deleting it cannot be undone.'
        }
        confirmLabel="Delete Session"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteSession(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
