import { useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { ModalDialog } from '../shared/ModalDialog';
import { MePicker } from '../collection/MePicker';
import { useProfile } from '../../context/ProfileContext';
import { matchMember, rememberOffer, type RememberOffer } from '../../lib/collection';
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
 * match is shown with a way to change it, and without one the choice can be
 * left for later, when the session waits in Needs setup.
 */
export function FinishSessionDialog({ members, onCancel, onConfirm }: Props) {
  const profile = useProfile();
  const match = profile.status === 'ready' ? matchMember(members, profile) : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const picking = pickerOpen || match === null;
  const form = useRef<HTMLFormElement>(null);

  // "Change" disappears as the picker opens, which would drop keyboard focus
  // onto the page, so it moves to the chosen radio, or the first one.
  useEffect(() => {
    const el = form.current;
    if (!pickerOpen || !el || el.contains(document.activeElement)) return;
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    ([...radios].find((r) => r.checked) ?? radios[0])?.focus();
  }, [pickerOpen]);

  return (
    <ModalDialog labelledBy="finish-title" onCancel={onCancel}>
      <form
        ref={form}
        className={confirmStyles.body}
        onSubmit={(e) => {
          e.preventDefault();
          // A shown match stores no pick, so the session follows the user's
          // names from then on (A1). An open picker stores what it holds.
          if (picking) onConfirm(value, remember ? rememberOffer(profile, value) : null);
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
        {picking ? (
          <div className={styles.picker}>
            <MePicker
              legend="Which one are you?"
              members={members}
              value={value}
              onChange={(v) => {
                setValue(v);
                // A choice made here stands, even if the profile loads a match afterwards.
                setPickerOpen(true);
              }}
              remember={remember}
              onRememberChange={setRemember}
            />
          </div>
        ) : (
          <p className={styles.collecting}>
            <span>
              Collecting as <strong>{match}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <Button
              variant="ghost"
              size="sm"
              className="link-action"
              onClick={() => {
                setValue(match);
                setPickerOpen(true);
              }}
            >
              Change
            </Button>
          </p>
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
