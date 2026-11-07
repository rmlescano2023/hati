import { Button } from '../shared/Button';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { buildDemoSessions, buildNeedsSetupSessions } from '../../lib/demoSessions';
import styles from './DevDataBar.module.css';

type Props = {
  /** Runs the onboarding tour regardless of whether this account has seen it. */
  onPreviewTour?: () => void;
  /** Opens "What's new" without writing the seen marker, so it can be previewed again. */
  onPreviewWhatsNew?: () => void;
  /** Opens Collection with the "Already settled?" question, even if it was answered. */
  onAskAlreadySettled?: () => void;
};

/**
 * Dev-only seeding for the launcher and History: a spread of drafts and closed
 * sessions, so both lists can be eyeballed without creating a dozen by hand,
 * and a few unplaced ones for Collection's Needs setup question.
 *
 * The two "add" seeds only ever append, so they are safe on the shared
 * database. "Seed Sessions (replace)" and "Clear All" delete every session of
 * the signed-in account, real ones included, with their payments, so never use
 * them on an account that holds real data.
 *
 * Never rendered in a production build — `import.meta.env.DEV` is statically
 * false there, so this component and `demoSessions` are dropped by the bundler.
 */
export function DevSessionsBar({ onPreviewTour, onPreviewWhatsNew, onAskAlreadySettled }: Props) {
  const { sessions, replaceAllSessions, appendSessions } = useSessionsStore();

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Dev only</span>
      <Button size="sm" onClick={() => replaceAllSessions(buildDemoSessions())}>
        Seed Sessions (replace)
      </Button>
      <Button size="sm" onClick={() => appendSessions(buildDemoSessions())}>
        Seed Sessions (add)
      </Button>
      <Button size="sm" onClick={() => appendSessions(buildNeedsSetupSessions())}>
        Seed Needs setup (add)
      </Button>
      {onPreviewTour && (
        <Button size="sm" onClick={onPreviewTour}>
          Preview Tour
        </Button>
      )}
      {onPreviewWhatsNew && (
        <Button size="sm" onClick={onPreviewWhatsNew}>
          Preview What&apos;s new
        </Button>
      )}
      {onAskAlreadySettled && (
        <Button size="sm" onClick={onAskAlreadySettled}>
          Ask Already settled
        </Button>
      )}
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
