import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

type Props = {
  title: string;
  description?: string;
  children?: ReactNode;
};

export function EmptyState({ title, description, children }: Props) {
  return (
    <div className={styles.empty}>
      <strong className={styles.title}>{title}</strong>
      {description && <span>{description}</span>}
      {children}
    </div>
  );
}
