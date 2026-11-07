import { useState } from 'react';
import { Button } from '../shared/Button';
import { ModalDialog } from '../shared/ModalDialog';
import { MePicker } from '../collection/MePicker';
import { useProfile } from '../../context/ProfileContext';
import {
  matchMember,
  nicknamePrompt,
  rememberOffer,
  type RememberOffer,
} from '../../lib/collection';
import confirmStyles from '../shared/ConfirmDialog.module.css';
import styles from './FinishSessionDialog.module.css';

type Props = {
  members: string[];
  onCancel: () => void;
  /**
   * `me` is the pick to store, or null for none; `remember` is the offer to act
   * on, or null: wherever the checkbox wasn't shown or was unticked.
   */
  onConfirm: (me: string | null, remember: RememberOffer | null) => void;
};

/**
 * Finishing locks the numbers and starts collecting, so it is where Hati asks
 * who the user is in the session. Asking never blocks finishing (BR-6): a
 * profile-name match finishes without asking; otherwise the picker asks,
 * preselecting a nickname match, and the choice can be left for later, when the
 * session waits in Needs setup.
 */
export function FinishSessionDialog({ members, onCancel, onConfirm }: Props) {
  const profile = useProfile();
  const match = profile.status === 'ready' ? matchMember(members, profile) : null;
  // Null means untouched. A nickname match is preselected for the user to
  // confirm, since a friend can share the nickname.
  const [value, setValue] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const suggested = match?.via === 'nickname' ? match.member : null;
  const selected = value ?? suggested;
  // A choice made here stands, even if the profile loads a match afterwards.
  const picking = value !== null || match?.via !== 'profile';

  return (
    <ModalDialog labelledBy="finish-title" onCancel={onCancel}>
      <form
        className={confirmStyles.body}
        onSubmit={(e) => {
          e.preventDefault();
          // A profile-name match stores no pick, so the session follows the
          // profile name from then on (A1). An open picker stores what it
          // holds, which counts as confirming a preselected nickname.
          if (picking) onConfirm(selected, remember ? rememberOffer(profile, selected) : null);
          else onConfirm(null, null);
        }}
      >
        <h2 id="finish-title" className={confirmStyles.title}>
          Finish this session?
        </h2>
        <p className={confirmStyles.message}>
          The numbers become final and can no longer be edited. You can track who has paid in
          Collection, and the session is filed in History.
        </p>
        {picking && (
          <div className={styles.picker}>
            <MePicker
              legend={
                suggested !== null && selected === suggested
                  ? nicknamePrompt(suggested)
                  : 'Which one are you?'
              }
              members={members}
              value={selected}
              onChange={setValue}
              remember={remember}
              onRememberChange={setRemember}
            />
          </div>
        )}
        <div className={confirmStyles.actions}>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">
            Finish Session
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}
