import { useEffect, useRef, type ReactNode } from 'react';
import styles from './OnboardingDialog.module.css';

type Props = {
  open: boolean;
  title: string;
  message: ReactNode;
  /** The buttons, in reading order. The primary one goes last. */
  children: ReactNode;
  /** What Escape does. Each dialog treats it as the gentler of its choices. */
  onDismiss: () => void;
  /** Stacks the buttons in a column on a phone, for a dialog with three of them. */
  stacked?: boolean;
};

/**
 * The plain modal the onboarding flow opens around the tour — once before it
 * starts, to offer the choice, and once after it finishes. "What's new" and
 * Collection's "Already settled?" question reuse it.
 *
 * Clicking the backdrop deliberately does nothing. The point of both dialogs is
 * the decision inside them, and a stray click outside was exactly the thing
 * that used to leave onboarding in a half-dismissed state.
 */
export function OnboardingDialog({
  open,
  title,
  message,
  children,
  onDismiss,
  stacked = false,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="onboarding-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
    >
      <div className={styles.body}>
        <h2 className={styles.title} id="onboarding-dialog-title">
          {title}
        </h2>
        <div className={styles.message}>{message}</div>
        <div className={`${styles.actions} ${stacked ? styles.stacked : ''}`}>{children}</div>
      </div>
    </dialog>
  );
}
