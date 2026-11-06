import { useId, useState } from 'react';
import { Button } from '../shared/Button';
import { CloseIcon } from '../shared/icons';
import { ModalDialog } from '../shared/ModalDialog';
import { useProfile } from '../../context/ProfileContext';
import { isKnownName } from '../../lib/collection';
import { sortNames } from '../../lib/format';
import { NICKNAMES_MAX, PROFILE_NAME_MAX, normaliseProfileName } from '../../lib/profileName';
import { ProfileNameField } from './ProfileNameField';
import confirmStyles from '../shared/ConfirmDialog.module.css';
import styles from './ProfileDialog.module.css';

type Props = {
  onClose: () => void;
};

/**
 * Sets or clears the profile name, and the other names the user goes by.
 * Mounted only while open, so every opening starts from what is stored. Saving
 * waits for the server, because the names decide which sessions are whose on
 * Collection; Cancel and Escape save nothing (AC-2.5).
 *
 * The form is only shown once the profile has loaded. Starting it from a
 * profile that failed to load would show blanks, and saving those would
 * replace the stored name and other names with nothing (E14).
 */
export function ProfileDialog({ onClose }: Props) {
  const profile = useProfile();

  return (
    <ModalDialog labelledBy="profile-title" onCancel={onClose}>
      {profile.status === 'ready' ? (
        <ProfileForm onClose={onClose} />
      ) : (
        <div className={confirmStyles.body}>
          <h2 id="profile-title" className={confirmStyles.title}>
            Your name
          </h2>
          {profile.status === 'loading' ? (
            <p role="status" className={confirmStyles.message}>
              Loading your profile…
            </p>
          ) : (
            <p role="alert" className={confirmStyles.message}>
              Couldn&apos;t load your profile.
            </p>
          )}
          <div className={confirmStyles.actions}>
            <Button onClick={onClose}>Cancel</Button>
            {profile.status === 'error' && (
              <Button variant="primary" onClick={profile.reload}>
                Try again
              </Button>
            )}
          </div>
        </div>
      )}
    </ModalDialog>
  );
}

function ProfileForm({ onClose }: Props) {
  const { displayName, nicknames, save } = useProfile();
  const [name, setName] = useState(displayName ?? '');
  const [others, setOthers] = useState(nicknames);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputId = useId();
  const othersId = useId();
  const dupId = useId();

  const addPending = () => {
    const added = normaliseProfileName(pending);
    if (added === null) return;
    if (isKnownName(added, { displayName: normaliseProfileName(name), nicknames: others })) {
      setDuplicate(true);
      return;
    }
    setOthers(sortNames([...others, added]));
    setPending('');
  };

  return (
    <form
      className={confirmStyles.body}
      onSubmit={async (e) => {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        setFailed(false);
        // A name typed but not yet added is included; the server drops it if
        // it's a duplicate.
        const extra = normaliseProfileName(pending);
        const list = extra !== null && others.length < NICKNAMES_MAX ? [...others, extra] : others;
        // An empty name field is saved too: it unsets the name (AC-2.4).
        const ok = await save({ displayName: name, nicknames: list });
        setSaving(false);
        if (ok) onClose();
        else setFailed(true);
      }}
    >
      <h2 id="profile-title" className={confirmStyles.title}>
        Your name
      </h2>
      <ProfileNameField value={name} onChange={setName} inputId={inputId} autoFocus />

      <section aria-labelledby={othersId} className={styles.others}>
        <h3 id={othersId} className={styles.othersHeading}>
          Other names you go by
        </h3>
        {others.length > 0 && (
          <ul className={styles.list}>
            {others.map((n) => (
              <li key={n} className={styles.item}>
                <span className={styles.itemName}>{n}</span>
                <Button
                  variant="icon"
                  size="sm"
                  className={styles.remove}
                  aria-label={`Remove ${n}`}
                  onClick={() => setOthers(others.filter((o) => o !== n))}
                >
                  <CloseIcon className={styles.removeIcon} />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {others.length >= NICKNAMES_MAX ? (
          <>
            <div>
              <Button size="sm" variant="ghost" disabled>
                Add a name
              </Button>
            </div>
            <p className={styles.note}>You can keep up to {NICKNAMES_MAX} other names.</p>
          </>
        ) : !adding ? (
          <div>
            <Button
              size="sm"
              variant="ghost"
              className="link-action"
              onClick={() => setAdding(true)}
            >
              Add a name
            </Button>
          </div>
        ) : (
          <>
            <div className={styles.addRow}>
              <input
                type="text"
                autoComplete="off"
                maxLength={PROFILE_NAME_MAX}
                aria-label="Another name you go by"
                aria-describedby={duplicate ? dupId : undefined}
                value={pending}
                autoFocus
                onChange={(e) => {
                  setPending(e.target.value);
                  setDuplicate(false);
                }}
                onKeyDown={(e) => {
                  // Enter adds the name; it must not submit the whole dialog (AC-N5.2).
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPending();
                  }
                }}
              />
              <Button
                size="sm"
                disabled={normaliseProfileName(pending) === null}
                onClick={addPending}
              >
                Add
              </Button>
            </div>
            {duplicate && (
              <p id={dupId} role="alert" className={styles.error}>
                That&apos;s already one of your names.
              </p>
            )}
          </>
        )}
      </section>

      {failed && (
        <p role="alert" className={styles.error}>
          Couldn&apos;t save your profile. Check your connection and try again.
        </p>
      )}
      <div className={confirmStyles.actions}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
