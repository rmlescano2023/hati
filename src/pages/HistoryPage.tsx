import { useMemo, useState } from 'react';
import { SessionCard } from '../components/sessions/SessionCard';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { EmptyState } from '../components/shared/EmptyState';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { deleteSessionMessage } from '../lib/sessionLabel';
import styles from './HomePage.module.css';

type Props = {
  onOpenSession: (sessionId: string) => void;
};

/**
 * The archive. Deliberately just a scannable list — a session's records only
 * render once you open it, on `HistoryDetailPage`. Archived sessions can be
 * deleted from their cards, but never edited.
 */
export function HistoryPage({ onOpenSession }: Props) {
  const { sessions, deleteSession } = useSessionsStore();
  // Held by id and looked up on render, as on Home, so the confirmation always
  // reads the session's current name.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const closed = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'closed')
        // Most recently closed first.
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    [sessions],
  );
  const pendingDelete = closed.find((s) => s.id === pendingDeleteId) ?? null;

  if (closed.length === 0) {
    return (
      <EmptyState
        title="No archived sessions yet"
        description="Finish a session from its Summary tab and it will be filed here."
      />
    );
  }

  return (
    <>
      <h2 className={styles.heading}>Closed Sessions</h2>
      <div className={styles.list}>
        {closed.map((session) => (
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
