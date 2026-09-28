import { useState } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../../context/AppDataContext';
import styles from './CloseSessionButton.module.css';

/**
 * Archives the current session. Deliberately not a `danger` button — nothing is
 * deleted, the records just move to History — but it still confirms first,
 * since it is the one action that takes a session out of editing for good.
 */
export function CloseSessionButton({ onClosed }: { onClosed: () => void }) {
  const { records, closeSession } = useAppData();
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
      <p className={styles.hint}>Files this session under History.</p>

      <ConfirmDialog
        open={confirming}
        title="Finish this session?"
        message="It moves to History and can no longer be edited."
        confirmLabel="Finish Session"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          closeSession();
          onClosed();
        }}
      />
    </div>
  );
}
