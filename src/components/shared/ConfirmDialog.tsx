import { useEffect, useRef } from 'react';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Styles the confirm action as destructive. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * An in-app replacement for `window.confirm`. Built on `<dialog>` so the
 * browser handles the modal behaviour that matters — focus trapping, Escape to
 * dismiss, inertness of the page behind — rather than reimplementing it.
 *
 * A destructive dialog leans towards the way out: Cancel is focused and carries
 * the emphasis, while the destructive action stays visually quiet. Anything
 * else emphasises its own action instead.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // `showModal` throws if the dialog is already open, and `close` on a closed
    // one is a no-op, so both are guarded on the current state.
    if (open && !dialog.open) {
      dialog.showModal();
      // `showModal` focuses the first focusable child, which is Cancel. That is
      // what a destructive dialog wants; anything else should offer its action.
      // React does not render `autoFocus` as a real attribute, so this is set
      // here rather than on the element.
      if (!destructive) dialog.querySelector<HTMLButtonElement>('[data-confirm]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, destructive]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      // Fires on Escape and on the browser's own dismiss gestures.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // Clicking the backdrop lands on the dialog element itself, never on its
      // contents, which is how a click outside is told apart from one inside.
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className={styles.body}>
        <h2 className={styles.title} id="confirm-title">
          {title}
        </h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          {/* A destructive dialog emphasises the way out: Cancel is the filled
              action and the destructive one stays quiet, so the safe choice is
              what the eye lands on first. */}
          <Button variant={destructive ? 'primary' : 'default'} onClick={onCancel}>
            Cancel
          </Button>
          <Button data-confirm="" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
