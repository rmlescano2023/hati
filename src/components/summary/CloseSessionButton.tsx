import { useState } from 'react';
import { Button } from '../shared/Button';
import { useAppData } from '../../context/AppDataContext';
import { useProfile } from '../../context/ProfileContext';
import { NOT_IN_SESSION } from '../../lib/collection';
import { FinishSessionDialog } from './FinishSessionDialog';
import styles from './CloseSessionButton.module.css';

/**
 * Archives the current session. Deliberately not a `danger` button — nothing is
 * deleted, the records just move to History — but it still confirms first,
 * since it is the one action that takes a session out of editing for good.
 */
export function CloseSessionButton({ onClosed }: { onClosed: () => void }) {
  const { records, members, closeSession } = useAppData();
  const profile = useProfile();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={styles.wrap}>
      <Button
        size="lg"
        data-tour="finish-session"
        onClick={() => setConfirming(true)}
        disabled={records.length === 0}
      >
        Finish Session
      </Button>
      <p className={styles.hint}>Locks the numbers and starts collecting.</p>

      {confirming && (
        <FinishSessionDialog
          members={members}
          onCancel={() => setConfirming(false)}
          onConfirm={(me, remember) => {
            setConfirming(false);
            closeSession(me);
            // Not awaited: the session is finished either way, and a failed
            // save shows on Collection's "You:" line (A2).
            if (remember && me !== null && me !== NOT_IN_SESSION) void profile.save(me);
            onClosed();
          }}
        />
      )}
    </div>
  );
}
