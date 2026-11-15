import { useRef, useState, type InputHTMLAttributes } from 'react';
import { ClearIcon } from './icons';
import styles from './ClearableInput.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'className' | 'onInput'> & {
  /** The controlled value, as for a plain input. */
  value: string;
  /** The clear button's accessible name, e.g. "Clear item name". */
  clearLabel: string;
  /** Keeps the phone tap area 24px wide, for a box too narrow for 44px. */
  compactClear?: boolean;
  /** Class for the wrapper, which takes the input's place in the parent's layout. */
  className?: string;
};

/**
 * An input with a circled × at its right edge while it shows any text. The
 * × empties the box through the box's own onChange, so everything derived from
 * it updates exactly as if the text had been deleted by hand.
 */
export function ClearableInput({
  value,
  clearLabel,
  compactClear,
  className,
  disabled,
  readOnly,
  ...inputProps
}: Props) {
  // A number box holding text the browser can't read (`-`, `1e`) reports a
  // value of "", so React fires no onChange and `value` alone can't say the
  // box has text. The native input event still fires, and validity says so.
  const [badInput, setBadInput] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const filled = !disabled && !readOnly && (value !== '' || badInput);

  const clear = () => {
    const input = inputRef.current;
    if (!input) return;
    // React tracks the last value it saw through its own `value` property on
    // the element, so assigning `input.value = ''` would leave that tracker
    // holding the old text and the input event below would read as no change.
    // Going through the prototype's setter keeps the tracker stale, which makes
    // the event run the field's own onChange with an empty value: the same path
    // as deleting by hand. The descriptor is looked up here, not at module
    // scope, so importing this file under Node doesn't touch HTMLInputElement.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    setBadInput(false);
    input.focus();
  };

  return (
    <div
      className={[styles.wrap, compactClear ? styles.compact : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      data-filled={filled ? 'true' : undefined}
    >
      <input
        {...inputProps}
        ref={inputRef}
        className={styles.input}
        value={value}
        disabled={disabled}
        readOnly={readOnly}
        onInput={(e) => setBadInput(e.currentTarget.validity.badInput)}
      />
      {filled && (
        <button
          type="button"
          className={styles.clear}
          aria-label={clearLabel}
          tabIndex={-1}
          // Keeps a focused box focused through the tap, so a phone keyboard stays up.
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
        >
          <ClearIcon />
        </button>
      )}
    </div>
  );
}
