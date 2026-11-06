import { useId, useState } from 'react';
import { Button } from '../shared/Button';
import { useProfile } from '../../context/ProfileContext';
import { normaliseProfileName } from '../../lib/profileName';
import { ProfileNameField } from './ProfileNameField';
import dialogStyles from './ProfileDialog.module.css';
import styles from './ProfileBanner.module.css';

/**
 * The nudge at the top of Collection while no profile name is set (US-3). A
 * block in the page rather than a dialog, with nothing focused and no dismiss:
 * the rest of the page stays usable, and the sessions it can't place wait in
 * Needs setup until a name or a pick places them.
 */
export function ProfileBanner() {
  const { save } = useProfile();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = useId();
  const headingId = useId();

  return (
    <form
      className={styles.banner}
      aria-labelledby={headingId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving || normaliseProfileName(draft) === null) return;
        setSaving(true);
        setFailed(false);
        const ok = await save({ displayName: draft });
        // A success unmounts the banner, since the name is now set.
        setSaving(false);
        if (!ok) setFailed(true);
      }}
    >
      <h2 id={headingId} className={styles.heading}>
        What should Hati call you?
      </h2>
      <ProfileNameField value={draft} onChange={setDraft} inputId={inputId} />
      {failed && (
        <p role="alert" className={dialogStyles.error}>
          Couldn&apos;t save your name. Check your connection and try again.
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="primary"
          disabled={saving || normaliseProfileName(draft) === null}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
