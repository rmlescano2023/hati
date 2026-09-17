import { Button } from '../shared/Button';
import { useAppData } from '../../context/AppDataContext';
import styles from './CloseSessionButton.module.css';

const CONFIRM_MESSAGE = 'Close this session? It moves to History and can no longer be edited.';

/**
 * Archives the current session. Deliberately not a `danger` button — nothing is
 * deleted, the records just move to History — but it still confirms first,
 * since it clears the three working tabs.
 */
export function CloseSessionButton({ onClosed }: { onClosed: () => void }) {
  const { records, closeSession } = useAppData();

  const handleClick = () => {
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    closeSession();
    onClosed();
  };

  return (
    <div className={styles.wrap}>
      <Button size="lg" onClick={handleClick} disabled={records.length === 0}>
        Close Session
      </Button>
      <p className={styles.hint}>
        Files this session under History. You can still view it there, but it becomes read-only.
      </p>
    </div>
  );
}
