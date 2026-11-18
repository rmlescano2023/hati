import { useEffect, useState } from 'react';
import { Button } from '../../shared/Button';
import styles from './PracticeBanner.module.css';

/**
 * Where a guide puts a step's target below the top of the screen when it scrolls to it: clear of
 * the sticky banner (about 95px on a phone, where it wraps to two lines, with its 8px top), the
 * spotlight's 10px padding, and a small gap.
 */
export const PRACTICE_SCROLL_OFFSET = 120;

/**
 * The strip above a guide's practice screen: what it is, and the way out that doesn't depend on
 * the tooltip (BR-TG23).
 */
export function PracticeBanner({ onEnd }: { onEnd: () => void }) {
  // Filled in after mount, so a screen reader announces it once as the guide starts:
  // text already in a live region when it mounts isn't reliably read.
  const [text, setText] = useState('');
  useEffect(() => setText('Practice session. Nothing here is saved.'), []);
  return (
    <div className={styles.banner}>
      <span className={styles.message} role="status">
        {text}
      </span>
      <Button size="sm" variant="ghost" onClick={onEnd}>
        End practice
      </Button>
    </div>
  );
}
