import { useEffect, useState } from 'react';
import styles from './EditableCell.module.css';

type BaseProps = {
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
};

type TextProps = BaseProps & {
  kind: 'text';
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
};

type MoneyProps = BaseProps & {
  kind: 'money';
  value: number;
  onCommit: (next: number) => void;
  /** What to show when the value is zero and the cell is not focused. */
  emptyDisplay?: string;
  /** Formatter used for the resting (unfocused) display. */
  format: (value: number) => string;
};

type Props = TextProps | MoneyProps;

/**
 * An input that sits flush inside a table cell: it shows a formatted resting
 * value, switches to the raw editable value on focus, commits on blur/Enter and
 * reverts on Escape.
 */
export function EditableCell(props: Props) {
  const { disabled = false, ariaLabel, className } = props;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const rawValue = props.kind === 'text' ? props.value : String(props.value);

  // Keep the draft in sync when the underlying value changes while not editing.
  useEffect(() => {
    if (!focused) setDraft(rawValue);
  }, [rawValue, focused]);

  const restingDisplay =
    props.kind === 'text'
      ? props.value
      : props.value === 0
        ? (props.emptyDisplay ?? props.format(0))
        : props.format(props.value);

  const commit = (raw: string) => {
    if (props.kind === 'text') {
      const next = raw.trim();
      if (next && next !== props.value) props.onCommit(next);
      return;
    }
    const parsed = Number.parseFloat(raw);
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : props.value;
    if (next !== props.value) props.onCommit(next);
  };

  const invalid =
    focused &&
    props.kind === 'money' &&
    draft.trim() !== '' &&
    !(Number.isFinite(Number.parseFloat(draft)) && Number.parseFloat(draft) >= 0);

  const classes = [
    styles.cell,
    props.kind === 'money' ? styles.numeric : '',
    !focused && props.kind === 'money' && props.value === 0 ? styles.muted : '',
    invalid ? styles.invalid : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <input
      type="text"
      inputMode={props.kind === 'money' ? 'decimal' : 'text'}
      className={classes}
      aria-label={ariaLabel}
      disabled={disabled}
      placeholder={props.kind === 'text' ? props.placeholder : undefined}
      value={focused ? draft : restingDisplay}
      onFocus={(e) => {
        setDraft(rawValue);
        setFocused(true);
        // Select-all so typing replaces the value, matching spreadsheet behaviour.
        requestAnimationFrame(() => e.target.select?.());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          setDraft(rawValue);
          setFocused(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
