import { useMemo } from 'react';
import { SessionCard } from '../components/sessions/SessionCard';
import { EmptyState } from '../components/shared/EmptyState';
import { useSessionsStore } from '../context/SessionsStoreContext';
import styles from './HomePage.module.css';

type Props = {
  onOpenSession: (sessionId: string) => void;
};

/**
 * The launcher. Lists every draft session so several trips or groups can run in
 * parallel; closed sessions live on the History tab. New sessions are started
 * from the action in the nav row.
 */
export function HomePage({ onOpenSession }: Props) {
  const { sessions } = useSessionsStore();

  const drafts = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'draft')
        // Most recently started first.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessions],
  );

  if (drafts.length === 0) {
    return (
      <EmptyState
        title="No sessions in progress"
        description="Start one with “+ New Session” above to add members and log what everyone spent."
      />
    );
  }

  return (
    <>
      <h2 className={styles.heading}>In Progress</h2>
      <div className={styles.list}>
        {drafts.map((session) => (
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
