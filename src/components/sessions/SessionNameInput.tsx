import { useEffect, useRef, useState } from 'react';
import { SESSION_NAME_MAX } from '../../lib/sessionName';
import styles from './SessionNameInput.module.css';

type Props = {
  /** The saved name; null shows an empty box with the placeholder. */
  initialName: string | null;
  className?: string;
  /** Raw text. May be called more than once with the same value: the store makes repeats a no-op. */
  onSave: (raw: string) => void;
  /** The edit is over. Keyboard endings return focus to the pencil. */
  onClose: (via: 'enter' | 'escape' | 'blur') => void;
};

/**
 * The inline rename box on a Home card and in the session header. It mounts
 * only once the pencil is tapped and unmounts when the edit ends, which is why
 * it isn't `EditableCell`: that one is always mounted, drops an empty value
 * rather than saving it, and clearing a name has to save no name.
 */
export function SessionNameInput({ initialName, className, onSave, onClose }: Props) {
  const [draft, setDraft] = useState(initialName ?? '');
  const ref = useRef<HTMLInputElement>(null);
  const draftRef = useRef(draft);
  const onSaveRef = useRef(onSave);
  // The first ending wins: Enter or Escape unmounts the box, and the blur that
  // can follow must not save a second time, or save after an Escape.
  const finished = useRef(false);

  useEffect(() => {
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    // Unmounting without a blur first still saves. iOS Safari does not always
    // blur the box when another button is tapped, and the parent unmounts it
    // instead. A save of the untouched name, as StrictMode's rehearsal makes,
    // is a no-op in the store.
    return () => {
      if (!finished.current) onSaveRef.current(draftRef.current);
    };
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      className={[styles.input, className].filter(Boolean).join(' ')}
      aria-label="Session name"
      placeholder="Name this session"
      maxLength={SESSION_NAME_MAX}
      value={draft}
      onChange={(e) => {
        draftRef.current = e.target.value;
        setDraft(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finished.current = true;
          onSave(draft);
          onClose('enter');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finished.current = true;
          onClose('escape');
        }
      }}
      onBlur={() => {
        if (finished.current) return;
        finished.current = true;
        onSave(draft);
        onClose('blur');
      }}
    />
  );
}
