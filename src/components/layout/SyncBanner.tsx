import { Button } from '../shared/Button';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import styles from './SyncBanner.module.css';

/**
 * On `localStorage` a write essentially could not fail. Against a server it
 * can, and an optimistic update means the screen already shows the change — so
 * a failure has to be said out loud rather than left to be discovered when the
 * data is gone on the next load.
 */
export function SyncBanner() {
  const { sync } = useSessionsStore();
  if (sync.status !== 'error') return null;

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.message}>{sync.error ?? 'Could not reach the server.'}</span>
      <Button size="sm" onClick={sync.retry}>
        Try again
      </Button>
    </div>
  );
}
