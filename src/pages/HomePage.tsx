import { useMemo } from 'react';
import { Button } from '../components/shared/Button';
import { EmptyState } from '../components/shared/EmptyState';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { getGrandTotal } from '../lib/calculations';
import { formatLongDate, formatMoney, joinNames, pluralize } from '../lib/format';
import styles from './HomePage.module.css';

type Props = {
  onOpenSession: (sessionId: string) => void;
};

/**
 * The launcher. Lists every draft session so several trips or groups can run in
 * parallel, and starts new ones. Closed sessions live on the History tab.
 */
export function HomePage({ onOpenSession }: Props) {
  const { sessions, createSession } = useSessionsStore();

  const drafts = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'draft')
        // Most recently started first.
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sessions],
  );

  const startSession = () => onOpenSession(createSession());

  return (
    <>
      {drafts.length === 0 ? (
        <EmptyState
          title="No sessions in progress"
          description="Start one to add members and log what everyone spent."
        >
          <Button variant="primary" size="lg" onClick={startSession}>
            + New Session
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className={styles.list}>
            {drafts.map((session) => {
              const total = getGrandTotal(session.records);
              return (
                <button
                  type="button"
                  key={session.id}
                  className={styles.card}
                  onClick={() => onOpenSession(session.id)}
                >
                  <span className={styles.top}>
                    <span className={styles.date}>
                      {formatLongDate(session.createdAt.slice(0, 10))}
                    </span>
                    <span className={styles.total}>{formatMoney(total)}</span>
                  </span>
                  <span className={styles.members}>
                    {session.members.length > 0 ? joinNames(session.members) : 'No members yet'}
                  </span>
                  <span className={styles.count}>
                    {pluralize(session.records.length, 'purchase')}
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.actions}>
            <Button variant="primary" size="lg" onClick={startSession}>
              + New Session
            </Button>
          </div>
        </>
      )}
    </>
  );
}
