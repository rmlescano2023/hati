import type { ReactNode } from 'react';
import styles from './Card.module.css';

type Props = {
  /** Small uppercase section label shown at the top of the card. */
  label?: string;
  /** Right-hand side of the card header (buttons, toggles). */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function Card({ label, actions, className, children }: Props) {
  const hasHeader = Boolean(label || actions);
  return (
    <section className={`${styles.card} ${className ?? ''}`}>
      {hasHeader && (
        <div className={styles.header}>
          <h2 className={styles.label}>{label}</h2>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
