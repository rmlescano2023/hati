import { useMemo } from 'react';
import { SessionCard } from '../components/sessions/SessionCard';
import { EmptyState } from '../components/shared/EmptyState';
import { useSessionsStore } from '../context/SessionsStoreContext';
import styles from './HomePage.module.css';

type Props = {
  onOpenSession: (sessionId: string) => void;
};

/**
 * The archive. Deliberately just a scannable list — a session's records only
 * render once you open it, on `HistoryDetailPage`.
 */
export function HistoryPage({ onOpenSession }: Props) {
  const { sessions } = useSessionsStore();

  const closed = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'closed')
        // Most recently closed first.
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    [sessions],
  );

  if (closed.length === 0) {
    return (
      <EmptyState
        title="No archived sessions yet"
        description="Close a session from its Summary tab and it will be filed here."
      />
    );
  }

  return (
    <>
      <h2 className={styles.heading}>Closed</h2>
      <div className={styles.list}>
        {closed.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onClick={() => onOpenSession(session.id)}
          />
        ))}
      </div>
    </>
  );
}
