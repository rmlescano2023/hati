import { useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { SESSION_NAME_MAX } from '../../lib/sessionName';
import confirmStyles from '../shared/ConfirmDialog.module.css';
import styles from './NewSessionDialog.module.css';

type Props = {
  onCancel: () => void;
  /** Raw text; the store tidies it, and blank means unnamed. */
  onCreate: (raw: string) => void;
};

/**
 * The "+ New Session" prompt. Naming is optional, so Create is always enabled
 * and an empty box simply makes an unnamed session. It is mounted only while
 * open, so every opening starts with an empty box.
 *
 * Built on `<dialog>` like `ConfirmDialog`, and dismissed the same ways: Cancel,
 * Escape or a click on the backdrop all close it without making a session.
 */
export function NewSessionDialog({ onCancel, onCreate }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState('');
  // A double tap on Create, or a held Enter, must still make one session.
  const submitted = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    // Guarded because StrictMode runs this twice, and `showModal` throws on a
    // dialog that is already open. It focuses the first focusable child, which
    // is the name box.
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const cancel = () => {
    // Closing before unmounting lets the browser hand focus back to the button
    // that opened the prompt.
    ref.current?.close();
    onCancel();
  };

  return (
    <dialog
      ref={ref}
      className={`${confirmStyles.dialog} ${styles.sheet}`}
      aria-labelledby="new-session-title"
      // Fires on Escape and on the browser's own dismiss gestures.
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      // Clicking the backdrop lands on the dialog element itself, never on its
      // contents, which is how a click outside is told apart from one inside.
      onClick={(e) => {
        if (e.target === ref.current) cancel();
      }}
    >
      <form
        className={confirmStyles.body}
        onSubmit={(e) => {
          e.preventDefault();
          if (submitted.current) return;
          submitted.current = true;
          onCreate(draft);
        }}
      >
        <h2 id="new-session-title" className={confirmStyles.title}>
          Name this session (optional)
        </h2>
        <input
          type="text"
          className={styles.input}
          aria-label="Session name"
          placeholder="e.g. Bali trip"
          maxLength={SESSION_NAME_MAX}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className={confirmStyles.actions}>
          <Button onClick={cancel}>Cancel</Button>
          <Button type="submit" variant="primary">
            Create
          </Button>
        </div>
      </form>
    </dialog>
  );
}
