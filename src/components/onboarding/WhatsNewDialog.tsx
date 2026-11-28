import { Button } from '../shared/Button';
import type { WhatsNewNotes } from '../../lib/whatsNew';
import { OnboardingDialog } from './OnboardingDialog';
import styles from './OnboardingDialog.module.css';

type Props = {
  open: boolean;
  notes: WhatsNewNotes;
  /** "Got it" and Escape. */
  onClose: () => void;
  /** "Show me how": the caller closes the dialog and starts the Expenses guide. */
  onShowMeHow: () => void;
};

/** The once-only "What's new" (BR-WC1 to WC5); Escape is "Got it". */
export function WhatsNewDialog({ open, notes, onClose, onShowMeHow }: Props) {
  const { latest, earlier, showMeHow } = notes;
  const note = (n: { title: string; body: string }) => (
    <span key={n.title}>
      <strong>{n.title}</strong> {n.body}
    </span>
  );

  return (
    <OnboardingDialog
      open={open}
      scrollable
      title="What's new in Hati"
      message={
        <div className={styles.points}>
          {/* Headings only when there is an "Earlier": one heading over one group says nothing,
              and the common case keeps its look. */}
          {earlier.length > 0 && <h3 className={styles.notesHeading}>Latest</h3>}
          {latest.map(note)}
          {earlier.length > 0 && <h3 className={styles.notesHeading}>Earlier</h3>}
          {earlier.map(note)}
        </div>
      }
      onDismiss={onClose}
    >
      {/* Without the Guides note there is no guide to start, so there is no "Show me how" to point at the wrong thing. */}
      {showMeHow ? (
        <>
          <Button variant="ghost" onClick={onClose}>
            Got it
          </Button>
          <Button variant="primary" onClick={onShowMeHow}>
            Show me how
          </Button>
        </>
      ) : (
        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      )}
    </OnboardingDialog>
  );
}
