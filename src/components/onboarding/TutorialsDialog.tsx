import { Button } from '../shared/Button';
import { OnboardingDialog } from './OnboardingDialog';
import styles from './TutorialsDialog.module.css';

/** The tutorials the account menu offers, each one a replay or a guide. */
export type Tutorial = 'overview' | 'expenses';

const TUTORIALS: { id: Tutorial; label: string; description: string }[] = [
  { id: 'overview', label: 'App overview', description: "A one-minute tour of Hati's screens." },
  {
    id: 'expenses',
    label: 'Logging expenses',
    description:
      'Adding people and purchases, including receipts with shared dishes and discounts.',
  },
];

type Props = {
  onChoose: (tutorial: Tutorial) => void;
  /** Close and Escape both: neither starts anything. */
  onClose: () => void;
};

/** Profile → Tutorials: one button per tutorial, with a line saying what it covers. */
export function TutorialsDialog({ onChoose, onClose }: Props) {
  return (
    <OnboardingDialog
      open
      title="Tutorials"
      message={
        <span className={styles.list}>
          {TUTORIALS.map(({ id, label, description }) => (
            <button type="button" className={styles.choice} key={id} onClick={() => onChoose(id)}>
              <span className={styles.choiceLabel}>{label}</span>
              <span className={styles.choiceDescription}>{description}</span>
            </button>
          ))}
        </span>
      }
      onDismiss={onClose}
    >
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
    </OnboardingDialog>
  );
}
