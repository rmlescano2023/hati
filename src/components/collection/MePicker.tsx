import { useId } from 'react';
import { useProfile } from '../../context/ProfileContext';
import { NOT_IN_SESSION } from '../../lib/collection';
import { sortNames } from '../../lib/format';
import styles from './MePicker.module.css';

type Props = {
  legend: string;
  members: string[];
  /** A member, `NOT_IN_SESSION`, or null for nothing chosen yet. */
  value: string | null;
  onChange: (value: string) => void;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
};

/**
 * Whether to offer "Remember as my name": only while no profile name is set
 * and a member is chosen (AC-4.4, AC-4.5). Callers use it to decide whether
 * the checkbox's value counts, since it is only meaningful while shown.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function offersRemember(
  profile: { status: string; displayName: string | null },
  value: string | null,
): boolean {
  return (
    profile.status === 'ready' &&
    profile.displayName === null &&
    value !== null &&
    value !== NOT_IN_SESSION
  );
}

/**
 * Which member the user is in a session, or that they aren't in it at all. Used
 * by the Finish dialog, a Needs setup card and "Change"; the choice is optional
 * wherever it appears, so nothing is preselected unless the caller says so.
 */
export function MePicker({ legend, members, value, onChange, remember, onRememberChange }: Props) {
  const profile = useProfile();
  const name = useId();
  const options = [
    ...sortNames(members).map((m) => ({ value: m, label: m })),
    { value: NOT_IN_SESSION, label: "I'm not in this session" },
  ];

  return (
    <div className={styles.picker}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{legend}</legend>
        {options.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.optionLabel}>{option.label}</span>
          </label>
        ))}
      </fieldset>
      {offersRemember(profile, value) && (
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => onRememberChange(e.target.checked)}
          />
          <span className={styles.optionLabel}>Remember as my name</span>
        </label>
      )}
    </div>
  );
}
