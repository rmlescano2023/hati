import type { ReactNode } from 'react';
import styles from './PageShell.module.css';

type Props = {
  header: ReactNode;
  nav: ReactNode;
  children: ReactNode;
};

export function PageShell({ header, nav, children }: Props) {
  return (
    <div className={styles.shell}>
      {header}
      {nav}
      <main className={styles.main}>{children}</main>
    </div>
  );
}
