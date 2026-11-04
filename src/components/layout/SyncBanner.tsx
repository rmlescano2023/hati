import { Button } from '../shared/Button';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import styles from './SyncBanner.module.css';

/**
 * On `localStorage` a write essentially could not fail. Against a server it
 * can, and an optimistic update means the screen already shows the change — so
 * a failure has to be said out loud rather than left to be discovered when the
 * data is gone on the next load.
 */
export function SyncBanner({ sticky = false }: { sticky?: boolean }) {
  const { sync } = useSessionsStore();
  // On Collection a failure is usually a payment made far down the page, so
  // the banner stays in view as the page scrolls rather than reporting it
  // where nobody is looking. Elsewhere it stays where it always was.
  const stickyClass = sticky ? ` ${styles.sticky}` : '';
  // "Try again" reloads the server's copy, which can quietly undo an edit that
  // never landed. Saying so tells the user to redo it rather than assume it
  // saved. The error banner takes precedence, so only one strip shows.
  if (sync.status !== 'error' && sync.reverted) {
    return (
      <div className={`${styles.banner} ${styles.note}${stickyClass}`} role="status">
        <span className={styles.noteMessage}>
          {"Some recent changes weren't saved. Showing your last saved version."}
        </span>
        <Button size="sm" variant="ghost" onClick={sync.dismissReverted}>
          Dismiss
        </Button>
      </div>
    );
  }
  if (sync.status !== 'error') return null;

  return (
    <div className={`${styles.banner}${stickyClass}`} role="alert">
      <span className={styles.message}>{sync.error ?? 'Could not reach the server.'}</span>
      <Button size="sm" onClick={sync.retry}>
        Try again
      </Button>
    </div>
  );
}
