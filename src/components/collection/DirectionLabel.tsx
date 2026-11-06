import type { ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from '../shared/icons';
import type { CollectionLine } from '../../lib/collection';
import styles from './DirectionLabel.module.css';

type Direction = CollectionLine['direction'];

const WORDS: Record<Direction, { label: string; hint: string }> = {
  owedToYou: { label: 'Owed to you', hint: 'they pay you' },
  youOwe: { label: 'You owe', hint: 'you pay them' },
};

type Props = {
  direction: Direction;
  /** Shows the hint under the label: the totals strip only. */
  hint?: boolean;
  /** Follows the label inside its colour, such as the card summary's amount. */
  children?: ReactNode;
  className?: string;
};

/**
 * Which way the money goes, in words, an arrow and a colour. The one place
 * these are defined, so the totals strip, the card summary and the group
 * headings always match. Only the strip shows the hint. The arrow is decorative: a screen reader reads the
 * words and then the hint.
 */
export function DirectionLabel({ direction, hint, children, className }: Props) {
  return (
    <span
      className={[styles.label, styles[direction], hint && styles.stacked, className]
        .filter(Boolean)
        .join(' ')}
    >
      <span className={styles.main}>
        {direction === 'owedToYou' ? (
          <ArrowDownIcon className={styles.arrow} />
        ) : (
          <ArrowUpIcon className={styles.arrow} />
        )}
        {WORDS[direction].label}
        {children}
      </span>
      {hint && <span className={styles.hint}>{WORDS[direction].hint}</span>}
    </span>
  );
}
