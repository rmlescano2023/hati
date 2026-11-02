import { useEffect, useState } from 'react';
import { UserButton } from '@clerk/clerk-react';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { createDelayedFlag } from '../../lib/delayedFlag';
import styles from './Header.module.css';
import { HatiLogo } from './HatiLogo';

export function Header() {
  const { sync } = useSessionsStore();
  const [cue, setCue] = useState(false);
  // Shown only after 400ms of waiting, so a fast save never flashes it, and
  // held for 600ms once shown, so a slow one never flickers.
  const [flag] = useState(() => createDelayedFlag(400, 600, setCue));
  useEffect(() => flag.set(sync.pending), [flag, sync.pending]);
  useEffect(() => () => flag.dispose(), [flag]);
  // One status at a time: the error banner, then the reverted note, then this.
  const showCue = cue && sync.status !== 'error' && !sync.reverted;

  return (
    <header className={styles.header}>
      <HatiLogo className={styles.logo} />
      <div className={styles.titles}>
        <h1 className={styles.title}>Hati</h1>
        <p className={styles.subtitle}>Track shared purchases and see who owes what.</p>
      </div>
      {/* The live region stays mounted and only its text changes, so a screen
          reader announces the cue once when it appears, not on every save. */}
      <span className={styles.status} role="status">
        {showCue && (
          <span className={styles.saving}>
            <span className={styles.dot} aria-hidden="true" />
            Saving…
          </span>
        )}
      </span>
      {/* Clerk's own menu, carrying account management and sign-out. */}
      <UserButton afterSignOutUrl="/" />
    </header>
  );
}
