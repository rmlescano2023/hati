import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  /** Lets a long message scroll inside the dialog, so the title and buttons stay on screen (What's new, BR-WC9). */
  scrollable?: boolean;
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
  scrollable = false,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // The notes hold nothing focusable, so without a tab stop a keyboard user can't scroll them in
  // every browser. It's added only while they overflow, so a dialog whose notes fit keeps the tab
  // order it has today. It's set after showModal, so the first focus still goes to the first
  // button, and the reset on close keeps a reopened dialog from starting with a stale tab stop.
  // The observer also catches a phone being turned.
  useEffect(() => {
    const message = messageRef.current;
    if (!scrollable || !open || !message || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setOverflows(message.scrollHeight > message.clientHeight);
    });
    observer.observe(message);
    return () => {
      observer.disconnect();
      setOverflows(false);
    };
  }, [open, scrollable]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={scrollable ? `${styles.dialog} ${styles.scrollable}` : styles.dialog}
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
        <div
          ref={messageRef}
          className={styles.message}
          tabIndex={scrollable && overflows ? 0 : undefined}
        >
          {message}
        </div>
        <div className={`${styles.actions} ${stacked ? styles.stacked : ''}`}>{children}</div>
      </div>
    </dialog>
  );
}
