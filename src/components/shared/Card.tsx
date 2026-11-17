import type { ReactNode } from 'react';
import styles from './Card.module.css';

type Props = {
  /** Small uppercase section label shown at the top of the card. */
  label?: string;
  /** Right-hand side of the card header (buttons, toggles). */
  actions?: ReactNode;
  className?: string;
  /** The onboarding tour's and the guides' target for this card, as a `data-tour` attribute. */
  'data-tour'?: string;
  children?: ReactNode;
};

export function Card({ label, actions, className, 'data-tour': dataTour, children }: Props) {
  const hasHeader = Boolean(label || actions);
  return (
    <section className={`${styles.card} ${className ?? ''}`} data-tour={dataTour}>
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
