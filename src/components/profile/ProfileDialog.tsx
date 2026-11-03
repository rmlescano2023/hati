import { useId, useState } from 'react';
import { Button } from '../shared/Button';
import { ModalDialog } from '../shared/ModalDialog';
import { useProfile } from '../../context/ProfileContext';
import { ProfileNameField } from './ProfileNameField';
import confirmStyles from '../shared/ConfirmDialog.module.css';
import styles from './ProfileDialog.module.css';

type Props = {
  onClose: () => void;
};

/**
 * Sets or clears the profile name. Mounted only while open, so every opening
 * starts from the stored name. Saving waits for the server, because the name
 * decides which sessions are whose on Collection; Cancel and Escape save
 * nothing (AC-2.5).
 */
export function ProfileDialog({ onClose }: Props) {
  const { displayName, save } = useProfile();
  const [draft, setDraft] = useState(displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = useId();

  return (
    <ModalDialog labelledBy="profile-title" onCancel={onClose}>
      <form
        className={confirmStyles.body}
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          setFailed(false);
          // An empty field is saved too: it unsets the name (AC-2.4).
          const ok = await save(draft);
          setSaving(false);
          if (ok) onClose();
          else setFailed(true);
        }}
      >
        <h2 id="profile-title" className={confirmStyles.title}>
          Your name
        </h2>
        <ProfileNameField value={draft} onChange={setDraft} inputId={inputId} autoFocus />
        {failed && (
          <p role="alert" className={styles.error}>
            Couldn&apos;t save your name. Check your connection and try again.
          </p>
        )}
        <div className={confirmStyles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
