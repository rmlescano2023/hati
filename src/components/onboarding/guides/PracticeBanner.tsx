import { useEffect, useState } from 'react';
import { Button } from '../../shared/Button';
import styles from './PracticeBanner.module.css';

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
