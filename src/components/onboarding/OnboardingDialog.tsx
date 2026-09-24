import { useEffect, useRef, type ReactNode } from 'react';
import styles from './OnboardingDialog.module.css';

type Props = {
  open: boolean;
  /** A node, not a string, so a word inside it can carry its own colour. */
  title: ReactNode;
  message: string;
  /** The buttons, in reading order. The primary one goes last. */
  children: ReactNode;
  /** What Escape does. Both dialogs treat it as the gentler of their choices. */
  onDismiss: () => void;
};

/**
 * The plain modal the onboarding flow opens around the tour — once before it
 * starts, to offer the choice, and once after it finishes.
 *
 * Clicking the backdrop deliberately does nothing. The point of both dialogs is
 * the decision inside them, and a stray click outside was exactly the thing
 * that used to leave onboarding in a half-dismissed state.
 */
export function OnboardingDialog({ open, title, message, children, onDismiss }: Props) {
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
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>{children}</div>
      </div>
    </dialog>
  );
}
