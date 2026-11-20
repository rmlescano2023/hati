import { useEffect, useRef, useState } from 'react';
import { MePicker, RememberOption } from '../collection/MePicker';
import { Button } from '../shared/Button';
import { useProfile } from '../../context/ProfileContext';
import { rememberOffer } from '../../lib/collection';
import { formatLocalDate, pluralize } from '../../lib/format';
import {
  JOIN_SHARED_REST,
  joinMatch,
  joinPromptView,
  joinReadOnlyLine,
  joinSharedLine,
  nameTakenLine,
} from '../../lib/joinedSessions';
import type { InvitePreview } from '../../types';
import confirm from '../shared/ConfirmDialog.module.css';
import styles from './JoinFlow.module.css';

type Props = {
  preview: InvitePreview;
  busy: boolean;
  error: string | null;
  /** Join as `member`; `remember` is true when the Remember checkbox was shown and ticked. */
  onJoin: (member: string, remember: boolean) => void;
  onCancel: () => void;
  /** Open on the list rather than the confirm, as after someone else took the matched member. */
  startWithList?: boolean;
};

/**
 * The join dialog's body, in one of two views. When the joiner's name points at exactly one member
 * they can still be, it is a confirm: "Join “Bali Trip” as Ben?", with a quiet way to say it isn't
 * them. Otherwise, or after "Not you?", it is the list. The organizer's member is never in either,
 * because the preview doesn't carry it (round 4).
 */
export function JoinPick({ preview, busy, error, onJoin, onCancel, startWithList = false }: Props) {
  const profile = useProfile();
  const [wantsList, setWantsList] = useState(startWithList);
  const [choice, setChoice] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const body = useRef<HTMLDivElement>(null);

  const match = profile.status === 'ready' ? joinMatch(preview, profile) : null;
  const view = joinPromptView(match, wantsList);
  const selected = view === 'confirm' ? match : choice;
  const offer = rememberOffer(profile, selected);

  // Focus goes to Join on the confirm and to the first choice in the list, after the dialog has
  // opened and again when the view switches.
  useEffect(() => {
    const el = body.current;
    const target =
      view === 'confirm'
        ? el?.querySelector<HTMLElement>('[data-join]')
        : el?.querySelector<HTMLElement>('input[type="radio"]:not(:disabled)');
    // After the dialog's own opening, which would otherwise take focus back to its first control.
    const frame = requestAnimationFrame(() => target?.focus());
    return () => cancelAnimationFrame(frame);
  }, [view]);

  return (
    <div
      ref={body}
      className={view === 'confirm' ? `${confirm.body} ${styles.centred}` : confirm.body}
    >
      <h2 id="join-title" className={confirm.title}>
        {view === 'confirm' ? `Join “${preview.title}” as ${match}?` : `Join “${preview.title}”?`}
      </h2>
      <p className={confirm.message}>
        Finished {formatLocalDate(preview.closedAt)} · {pluralize(preview.memberCount, 'member')}
      </p>
      <p className={`${confirm.message} ${styles.bodyText}`}>
        {preview.organizerName === null ? (
          joinSharedLine(null)
        ) : (
          <>
            <strong className={styles.sharer}>{preview.organizerName}</strong>
            {JOIN_SHARED_REST}
          </>
        )}
      </p>
      <p className={`${confirm.message} ${styles.bodyText}`}>
        {joinReadOnlyLine(preview.organizerName)}
      </p>

      {view === 'list' && (
        <div className={styles.members}>
          <MePicker
            legend="Which one are you?"
            members={preview.members}
            unavailable={preview.onHati}
            afterMembers={
              preview.onHati.length > 0 && (
                <p className={confirm.message}>{nameTakenLine(preview.organizerName)}</p>
              )
            }
            offerNotInSession={false}
            value={choice}
            onChange={setChoice}
            remember={remember}
            onRememberChange={setRemember}
          />
        </div>
      )}
      {view === 'confirm' && offer !== null && (
        <div className={styles.rememberRow}>
          <RememberOption
            offer={offer}
            value={selected}
            checked={remember}
            onChange={setRemember}
          />
        </div>
      )}

      {error !== null && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div
        className={
          view === 'confirm' ? `${confirm.actions} ${styles.actionsCentred}` : confirm.actions
        }
      >
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          data-join=""
          variant="primary"
          disabled={selected === null || busy}
          onClick={() => selected !== null && onJoin(selected, remember && offer !== null)}
        >
          {busy ? 'Joining…' : 'Join'}
        </Button>
      </div>
      {view === 'confirm' && (
        <Button
          variant="ghost"
          size="sm"
          className={`link-action ${styles.notYou}`}
          aria-label={`Not ${match}? Choose another member`}
          onClick={() => setWantsList(true)}
        >
          Not {match}?
        </Button>
      )}
    </div>
  );
}
