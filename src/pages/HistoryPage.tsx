import { useMemo, useState } from 'react';
import { SessionCard } from '../components/sessions/SessionCard';
import { Button } from '../components/shared/Button';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { EmptyState } from '../components/shared/EmptyState';
import { useProfile } from '../context/ProfileContext';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { buildCollection, historyStatus, isJoined } from '../lib/collection';
import { sharedByLine } from '../lib/joinedSessions';
import { deleteSessionMessage } from '../lib/sessionLabel';
import { showsEmptyState } from '../lib/writeQueue';
import appStyles from '../App.module.css';
import collectionStyles from './CollectionPage.module.css';
import styles from './HomePage.module.css';

type Props = {
  onOpenSession: (sessionId: string) => void;
};

/**
 * What is done: the sessions whose lines are all paid for this viewer and nothing waits on them,
 * newest settled first. A session that still has something left is in Collection, not here, and
 * it waits for the profile as Collection does, because which one a session is in depends on who
 * the viewer is in it. A session's records only render once you open it, on `HistoryDetailPage`.
 * An owned one can be deleted from its card, but never edited.
 */
export function HistoryPage({ onOpenSession }: Props) {
  const { sessions, deleteSession, sync } = useSessionsStore();
  const profile = useProfile();
  // Held by id and looked up on render, as on Home, so the confirmation always
  // reads the session's current name.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const settled = useMemo(
    () =>
      buildCollection(sessions, { displayName: profile.displayName, nicknames: profile.nicknames })
        .settled,
    [sessions, profile.displayName, profile.nicknames],
  );
  const pendingDelete = settled.find((c) => c.session.id === pendingDeleteId)?.session ?? null;

  if (profile.status === 'loading') {
    return (
      <div className={appStyles.loading} role="status">
        <span className={appStyles.spinner} aria-hidden="true" />
        Loading…
      </div>
    );
  }
  if (profile.status === 'error') {
    return (
      <div className={collectionStyles.loadError} role="alert">
        <p>Couldn&apos;t load your profile.</p>
        <Button onClick={profile.reload}>Try again</Button>
      </div>
    );
  }

  if (settled.length === 0) {
    // After a failed load the banner speaks instead of an empty state.
    return showsEmptyState(sync.loaded, settled.length) ? (
      <EmptyState
        title="Nothing settled yet"
        description="When a finished session is paid in full, it moves here from Collection."
      />
    ) : null;
  }

  return (
    <>
      <h2 className={styles.heading}>Settled sessions</h2>
      <div className={styles.list}>
        {settled.map((card) => {
          const { session } = card;
          const { status, stillOwed } = historyStatus(card);
          return (
            <SessionCard
              key={session.id}
              session={session}
              onClick={() => onOpenSession(session.id)}
              // A joined session is the organizer's to delete; a member stops tracking it from its
              // detail or from Collection (BR-V9).
              onDelete={isJoined(session) ? undefined : () => setPendingDeleteId(session.id)}
              sharedBy={isJoined(session) ? sharedByLine(session.organizerName ?? null) : undefined}
              status={status}
              note={stillOwed ? 'Some members still owe each other' : undefined}
            />
          );
        })}
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
