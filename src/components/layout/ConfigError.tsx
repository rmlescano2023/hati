import styles from './SignedOutScreen.module.css';

/**
 * Without a Clerk key there is no sign-in and so no app. Saying that plainly
 * beats `<ClerkProvider>`'s own crash, which reads as a bug rather than a
 * missing environment variable.
 */
export function ConfigError() {
  return (
    <div className={styles.screen}>
      <div className={styles.intro}>
        <h1 className={styles.title}>Hati is not configured</h1>
        <p className={styles.subtitle}>
          <code>VITE_CLERK_PUBLISHABLE_KEY</code> is missing. Pull the project's environment
          variables with <code>vercel env pull .env.local</code>, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
