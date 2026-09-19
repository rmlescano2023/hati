import { SignIn } from '@clerk/clerk-react';
import { HatiLogo } from './HatiLogo';
import styles from './SignedOutScreen.module.css';

/** What you get before signing in: the app's identity, and Clerk's own form. */
export function SignedOutScreen() {
  return (
    <div className={styles.screen}>
      <div className={styles.intro}>
        <HatiLogo className={styles.logo} />
        <h1 className={styles.title}>Hati</h1>
        <p className={styles.subtitle}>
          Track shared purchases and see who owes what. Sign in to reach your sessions from any
          device.
        </p>
      </div>
      <SignIn routing="hash" />
    </div>
  );
}
