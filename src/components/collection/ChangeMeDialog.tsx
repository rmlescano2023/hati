import { useState } from 'react';
import { Button } from '../shared/Button';
import { ModalDialog } from '../shared/ModalDialog';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { NOT_IN_SESSION, type Me } from '../../lib/collection';
import type { Session } from '../../types';
import { MePicker, offersRemember } from './MePicker';
import confirmStyles from '../shared/ConfirmDialog.module.css';
import styles from './ChangeMeDialog.module.css';

type Props = {
  session: Session;
  me: Me;
  onClose: () => void;
};

/**
 * Changes who the user is in one finished session. Payments belong to the
 * pair, not to who the user is, so a change never moves or deletes one; the
 * note says so when there are any to worry about (AC-5.5, BR-7).
 */
export function ChangeMeDialog({ session, me, onClose }: Props) {
  const { setMe } = useSessionsStore();
  const profile = useProfile();
  const [value, setValue] = useState<string | null>(
    me.kind === 'member' ? me.name : me.kind === 'notInSession' ? NOT_IN_SESSION : null,
  );
  const [remember, setRemember] = useState(true);

  return (
    <ModalDialog labelledBy="change-me-title" onCancel={onClose}>
      <form
        className={confirmStyles.body}
        onSubmit={(e) => {
          e.preventDefault();
          if (value === null) return;
          setMe(session.id, value);
          if (remember && offersRemember(profile, value)) void profile.save(value);
          onClose();
        }}
      >
        <h2 id="change-me-title" className={confirmStyles.title}>
          Who are you in this session?
        </h2>
        <MePicker
          legend="Which one are you?"
          members={session.members}
          value={value}
          onChange={setValue}
          remember={remember}
          onRememberChange={setRemember}
        />
        {session.payments.length > 0 && (
          <p className={styles.note}>
            Payments already recorded on this session stay saved. Only the ones on your lines show
            here, and switching back shows them again.
          </p>
        )}
        <div className={confirmStyles.actions}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={value === null}>
            Save
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
