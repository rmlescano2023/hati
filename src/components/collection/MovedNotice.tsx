import { Button } from '../shared/Button';
import { movedManyLine, movedToHistoryLine } from '../../lib/joinedSessions';
import styles from './MovedNotice.module.css';

export type Moved = { id: string; title: string } | { count: number };

/**
 * Says that the viewer's own action moved a session to History, with a way to open it. It is
 * Collection's notice wherever the page has room for one, including the empty states when the card
 * that moved was the last one (US-H8), and it takes focus when no card is left to take it.
 */
export function MovedNotice({
  moved,
  onOpenInHistory,
}: {
  moved: Moved;
  onOpenInHistory: (sessionId: string) => void;
}) {
  return (
    <div id="collection-moved" tabIndex={-1} className={styles.moved}>
      {'id' in moved ? (
        <>
          <p>{movedToHistoryLine(moved.title)}</p>
          <Button
            size="sm"
            aria-label={`Open ${moved.title} in History`}
            onClick={() => onOpenInHistory(moved.id)}
          >
            Open
          </Button>
        </>
      ) : (
        <p>{movedManyLine(moved.count)}</p>
      )}
    </div>
  );
}
