import { useEffect, useRef, type ReactNode } from 'react';
import confirmStyles from './ConfirmDialog.module.css';
import sheetStyles from '../sessions/NewSessionDialog.module.css';

type Props = {
  /** The id of the dialog's title. */
  labelledBy: string;
  /** Escape, the browser's own dismiss gestures and a click on the backdrop. */
  onCancel: () => void;
  children: ReactNode;
};

/**
 * The `<dialog>` shell of the profile, Finish and "Who are you" dialogs. It
 * behaves as `NewSessionDialog` does: open while mounted, dismissed by Escape
 * or a click that both starts and ends on the backdrop, and kept in the visible
 * part of a phone's screen while its keyboard is up. The content, title and
 * actions included, is the caller's.
 */
export function ModalDialog({ labelledBy, onCancel, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Whether the current press began on the backdrop. A drag that starts in the
  // dialog, say selecting typed text, and ends past its edge also fires its
  // click on the dialog element, and must not dismiss it.
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    // Guarded because StrictMode runs this twice, and `showModal` throws on a
    // dialog that is already open.
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // `showModal` focuses the first focusable element, which in a radio group
    // is its first radio even when another one is chosen. Tab would land on
    // the chosen one, so the dialog starts there too.
    const first = document.activeElement;
    if (first instanceof HTMLInputElement && first.type === 'radio' && !first.checked) {
      first.form
        ?.querySelector<HTMLInputElement>(
          `input[type="radio"][name="${CSS.escape(first.name)}"]:checked`,
        )
        ?.focus();
    }
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    const viewport = window.visualViewport;
    if (!dialog || !viewport) return;
    // The on-screen keyboard shrinks only the visible part of the page, so the
    // phone styles centre the dialog in what can actually be seen.
    const track = () => {
      dialog.style.setProperty('--visible-top', `${viewport.offsetTop}px`);
      dialog.style.setProperty('--visible-height', `${viewport.height}px`);
    };
    track();
    viewport.addEventListener('resize', track);
    viewport.addEventListener('scroll', track);
    return () => {
      viewport.removeEventListener('resize', track);
      viewport.removeEventListener('scroll', track);
    };
  }, []);

  const cancel = () => {
    // Closing before unmounting lets the browser hand focus back to the
    // control that opened the dialog.
    ref.current?.close();
    onCancel();
  };

  return (
    <dialog
      ref={ref}
      className={`${confirmStyles.dialog} ${sheetStyles.sheet}`}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        const outside = pressedBackdrop.current && e.target === ref.current;
        pressedBackdrop.current = false;
        if (outside) cancel();
      }}
    >
      {children}
    </dialog>
  );
}
