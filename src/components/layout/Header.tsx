import styles from './Header.module.css';
import { HatiLogo } from './HatiLogo';

export function Header() {
  return (
    <header className={styles.header}>
      <HatiLogo className={styles.logo} />
      <div className={styles.titles}>
        <h1 className={styles.title}>Hati</h1>
        <p className={styles.subtitle}>Track shared purchases and see who owes what.</p>
      </div>
    </header>
  );
}
