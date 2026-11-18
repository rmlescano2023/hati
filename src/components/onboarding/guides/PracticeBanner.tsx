import { useEffect, useState } from 'react';
import { Button } from '../../shared/Button';
import styles from './PracticeBanner.module.css';

/**
 * Where a guide puts a step's target below the top of the screen when it scrolls to it: clear of
 * the sticky banner (about 95px on a phone, where it wraps to two lines, with its 8px top), the
 * spotlight's 10px padding, and a small gap.
 */
export const PRACTICE_SCROLL_OFFSET = 120;

/** The same, as a fixed figure for choosing the side of a target before the banner is measured. */
export const PRACTICE_FLIP_TOP = 104;

/**
 * The strip above a guide's practice screen: what it is, and the way out that doesn't depend on
 * the tooltip (BR-TG23).
 */
export function PracticeBanner({ onEnd }: { onEnd: () => void }) {
  // Filled in after mount, so a screen reader announces it once as the guide starts:
  // text already in a live region when it mounts isn't reliably read.
  const [text, setText] = useState('');
  useEffect(() => setText('Practice session. Nothing here is saved.'), []);
  // The page's own scrolls (landing on a card, bringing a confirmed card into view) put it at the
  // very top of the screen, which is under this sticky banner. Scroll padding makes every such
  // scroll stop below the banner instead, and it goes with the practice.
  useEffect(() => {
    const root = document.documentElement;
    root.style.scrollPaddingTop = `${PRACTICE_FLIP_TOP}px`;
    return () => {
      root.style.removeProperty('scroll-padding-top');
    };
  }, []);
  return (
    <div className={styles.banner} data-practice-banner>
      <span className={styles.message} role="status">
        {text}
      </span>
      <Button size="sm" variant="ghost" onClick={onEnd}>
        End practice
      </Button>
    </div>
  );
}
