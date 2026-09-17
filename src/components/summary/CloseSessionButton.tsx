import { Button } from '../shared/Button';
import { useAppData } from '../../context/AppDataContext';
import styles from './CloseSessionButton.module.css';

const CONFIRM_MESSAGE =
  'Close this session? Its records will move to History, and Home, Breakdown and Summary will reset for a new session.';

/**
 * Archives the current session. Deliberately not a `danger` button — nothing is
 * deleted, the records just move to History — but it still confirms first,
 * since it clears the three working tabs.
 */
export function CloseSessionButton() {
  const { records, closeSession } = useAppData();

  const handleClick = () => {
    if (window.confirm(CONFIRM_MESSAGE)) closeSession();
  };

  return (
    <div className={styles.wrap}>
      <Button size="lg" onClick={handleClick} disabled={records.length === 0}>
        Close Session
      </Button>
      <p className={styles.hint}>
        Files these records under History and starts a fresh session. Your members stay.
      </p>
    </div>
  );
}
