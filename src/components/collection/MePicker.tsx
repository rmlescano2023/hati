import { useId, type ReactNode } from 'react';
import { useProfile } from '../../context/ProfileContext';
import { NOT_IN_SESSION, rememberOffer, type RememberOffer } from '../../lib/collection';
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
  /** Members that can't be picked. They are shown disabled. */
  unavailable?: string[];
  /**
   * Which unavailable members are labelled "on Hati": the ones an account joined as. Defaults to
   * all of them. The organizer's own member is unavailable but not labelled.
   */
  onHati?: string[];
  /** Shown directly under the members, before the Remember checkbox. */
  afterMembers?: ReactNode;
  /** Whether "I'm not in this session" is offered. A joiner is in the session by definition. */
  offerNotInSession?: boolean;
};

/**
 * Which member the user is in a session, or that they aren't in it at all. Used
 * by the Finish dialog, a Needs setup card and "Change"; the choice is optional
 * wherever it appears, so nothing is preselected unless the caller says so.
 */
export function MePicker({
  legend,
  members,
  value,
  onChange,
  remember,
  onRememberChange,
  unavailable = [],
  onHati = unavailable,
  afterMembers,
  offerNotInSession = true,
}: Props) {
  const profile = useProfile();
  const name = useId();
  const offer = rememberOffer(profile, value);
  const options = [
    ...sortNames(members).map((m) =>
      unavailable.includes(m)
        ? { value: m, label: onHati.includes(m) ? `${m} · on Hati` : m, disabled: true }
        : { value: m, label: m, disabled: false },
    ),
    ...(offerNotInSession
      ? [{ value: NOT_IN_SESSION, label: "I'm not in this session", disabled: false }]
      : []),
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
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            <span
              className={
                option.disabled
                  ? `${styles.optionLabel} ${styles.optionDisabled}`
                  : styles.optionLabel
              }
            >
              {option.label}
            </span>
          </label>
        ))}
      </fieldset>
      {afterMembers}
      {offer !== null && (
        <RememberOption
          offer={offer}
          value={value}
          checked={remember}
          onChange={onRememberChange}
        />
      )}
    </div>
  );
}

/** The "Remember" checkbox a picker offers for its selection; the caller decides when to show it. */
export function RememberOption({
  offer,
  value,
  checked,
  onChange,
}: {
  offer: RememberOffer;
  value: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.option}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.optionLabel}>
        {offer === 'name' ? 'Remember as my name' : `Remember “${value}” as another name for me`}
      </span>
    </label>
  );
}
