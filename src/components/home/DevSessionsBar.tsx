import { Button } from '../shared/Button';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { buildDemoSessions } from '../../lib/demoSessions';
import styles from './DevDataBar.module.css';

/**
 * Dev-only seeding for the launcher and History: a spread of drafts and closed
 * sessions, so both lists can be eyeballed without creating a dozen by hand.
 * Never rendered in a production build — `import.meta.env.DEV` is statically
 * false there, so this component and `demoSessions` are dropped by the bundler.
 */
export function DevSessionsBar() {
  const { sessions, replaceAllSessions } = useSessionsStore();

  const seed = (append: boolean) => {
    const demo = buildDemoSessions();
    replaceAllSessions(append ? [...sessions, ...demo] : demo);
  };

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Dev only</span>
      <Button size="sm" onClick={() => seed(false)}>
        Seed Sessions (replace)
      </Button>
      <Button size="sm" onClick={() => seed(true)}>
        Seed Sessions (add)
      </Button>
      <Button
        size="sm"
        variant="danger"
        disabled={sessions.length === 0}
        onClick={() => {
          if (window.confirm('Delete every session, including History? This cannot be undone.')) {
            replaceAllSessions([]);
          }
        }}
      >
        Clear All
      </Button>
    </div>
  );
}
