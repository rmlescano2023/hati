import { useState } from 'react';
import { SignIn } from '@clerk/clerk-react';
import { browserStorage, peekJoin } from '../../lib/joinLink';
import { HatiLogo } from './HatiLogo';
import styles from './SignedOutScreen.module.css';

/** What you get before signing in: the app's identity, and Clerk's own form. */
export function SignedOutScreen() {
  // Read once, so the line stays put while the user signs in. It never names the session or its
  // members: only someone who is signed in may see what the link opens (BR-J3).
  const [invited] = useState(() => peekJoin(browserStorage(), Date.now()) !== null);
  return (
    <div className={styles.screen}>
      <div className={styles.intro}>
        <HatiLogo className={styles.logo} />
        <h1 className={styles.title}>Hati</h1>
        <p className={styles.subtitle}>
          Track shared purchases and see who owes what. Sign in to reach your sessions from any
          device.
        </p>
        {invited && (
          <p className={styles.invited}>
            Sign in or create an account to join the session you were invited to.
          </p>
        )}
      </div>
      <SignIn routing="hash" />
    </div>
  );
}
