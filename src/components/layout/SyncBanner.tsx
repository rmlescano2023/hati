import type { ReactNode } from 'react';
import { Button } from '../shared/Button';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import styles from './SyncBanner.module.css';

/**
 * On `localStorage` a write essentially could not fail. Against a server it
 * can, and an optimistic update means the screen already shows the change — so
 * a failure has to be said out loud rather than left to be discovered when the
 * data is gone on the next load.
 */
export function SyncBanner({
  sticky = false,
  showProfileError = false,
}: {
  sticky?: boolean;
  /** Collection only: also report a name a picker couldn't remember. */
  showProfileError?: boolean;
}) {
  const { sync } = useSessionsStore();
  const profile = useProfile();

  // "Try again" reloads the server's copy, which can quietly undo an edit that
  // never landed. Saying so tells the user to redo it rather than assume it
  // saved. The error banner takes precedence, so only one sync strip shows.
  let syncStrip: ReactNode = null;
  if (sync.status === 'error') {
    syncStrip = (
      <div className={styles.banner} role="alert">
        <span className={styles.message}>{sync.error ?? 'Could not reach the server.'}</span>
        <Button size="sm" onClick={sync.retry}>
          Try again
        </Button>
      </div>
    );
  } else if (sync.reverted) {
    syncStrip = (
      <div className={`${styles.banner} ${styles.note}`} role="status">
        <span className={styles.noteMessage}>
          {"Some recent changes weren't saved. Showing your last saved version."}
        </span>
        <Button size="sm" variant="ghost" onClick={sync.dismissReverted}>
          Dismiss
        </Button>
      </div>
    );
  }

  // A pick made on Collection can finish saving its name some seconds later,
  // after the page has scrolled, so the failure is reported in this pinned
  // strip rather than on the card, which may have moved to another section.
  const profileStrip =
    showProfileError && profile.saveError !== null ? (
      <div className={styles.banner} role="alert">
        <span className={styles.message}>{profile.saveError}</span>
        <Button size="sm" variant="ghost" onClick={profile.dismissSaveError}>
          Dismiss
        </Button>
      </div>
    ) : null;

  if (syncStrip === null && profileStrip === null) return null;

  // On Collection a failure is usually a payment made far down the page, so
  // the strips stay in view as the page scrolls rather than reporting it where
  // nobody is looking. Elsewhere they stay where they always were. They share
  // one container, so two at once stack instead of overlapping.
  return (
    <div className={`${styles.stack}${sticky ? ` ${styles.sticky}` : ''}`}>
      {syncStrip}
      {profileStrip}
    </div>
  );
}
