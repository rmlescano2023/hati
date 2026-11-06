import { PROFILE_NAME_MAX } from '../../lib/profileName';
import styles from './ProfileNameField.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  inputId: string;
  autoFocus?: boolean;
};

/**
 * The profile name's field, shared by the dialog and Collection's nudge. It asks
 * for the name the group typed into its member lists, which may not be the one
 * the account was signed up with (BR-3).
 */
export function ProfileNameField({ value, onChange, inputId, autoFocus }: Props) {
  const helpId = `${inputId}-help`;

  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        Your name
      </label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        // Truncates rather than erroring, the same limit the server applies (AC-2.6).
        maxLength={PROFILE_NAME_MAX}
        value={value}
        autoFocus={autoFocus}
        aria-describedby={helpId}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={helpId} className={styles.help}>
        Use the name your group calls you, exactly as it appears in your session member lists.
      </p>
    </div>
  );
}
