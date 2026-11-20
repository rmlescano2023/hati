import { useEffect, useRef, useState } from 'react';
import { MePicker } from '../collection/MePicker';
import { Button } from '../shared/Button';
import { ModalDialog } from '../shared/ModalDialog';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { useInvites } from '../../hooks/useInvites';
import { nicknamePrompt, rememberOffer } from '../../lib/collection';
import { formatLocalDate, pluralize } from '../../lib/format';
import {
  alreadyMessage,
  everyoneJoinedMessage,
  isInviteToken,
  joinPreselect,
  joinReadOnlyLine,
  joinSharedLine,
  joinStage,
  nameTakenLine,
  ownMessage,
  takenMessage,
} from '../../lib/joinedSessions';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import type { InvitePreview, JoinAnswer } from '../../types';
import confirm from '../shared/ConfirmDialog.module.css';
import styles from './JoinFlow.module.css';

type Props = {
  /** The token as it came off the address, not yet checked. */
  raw: string;
  /** Where to land, or null to stay where the user is (Cancel, Close, OK and Escape). */
  onClose: (to: { openSessionId: string; announce?: string } | null) => void;
};

type Stage = 'checking' | 'failed' | 'dead' | 'own' | 'already' | 'full' | 'pick';

/** What the dialog is showing, with the answer that decided it. */
type View = { stage: Stage; answer: JoinAnswer | null };

const COULDNT_JOIN = "Couldn't join. Check your connection and try again.";

/**
 * Everything that happens between opening an invite link and landing in Collection: checking the
 * link, then one dialog for whichever of seven outcomes it came to. It is shown only once the
 * sessions and the profile have loaded (see `joinFlowReady`), so the preselect has both to go on.
 * Nothing is created until the user taps Join (AC-6.10).
 */
export function JoinFlow({ raw, onClose }: Props) {
  const invites = useInvites();
  const { addJoinedSession } = useSessionsStore();
  const profile = useProfile();

  const [view, setView] = useState<View>(() =>
    isInviteToken(raw)
      ? { stage: 'checking', answer: null }
      : { stage: 'dead', answer: { outcome: 'dead' } },
  );
  // Bumped by "Try again", which checks the link once more.
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A second tap before the first answer must send nothing, and state alone is a render behind.
  const joining = useRef(false);
  // An answer that lands after the flow has closed is ignored (A2).
  const closed = useRef(false);
  // The requests are used from effects and handlers, which must not re-run when `getToken` changes.
  const invitesRef = useRef(invites);
  useEffect(() => {
    invitesRef.current = invites;
  });

  useEffect(() => {
    closed.current = false;
    if (!isInviteToken(raw)) return;
    void (async () => {
      const answer = await invitesRef.current.preview(raw);
      if (closed.current) return;
      setView({ stage: joinStage(answer) as Stage, answer });
    })();
    return () => {
      closed.current = true;
    };
  }, [raw, attempt]);

  const close = (to: Parameters<Props['onClose']>[0]) => {
    closed.current = true;
    onClose(to);
  };

  const { stage, answer } = view;
  const preview: InvitePreview | null =
    answer !== null && (answer.outcome === 'open' || answer.outcome === 'taken')
      ? answer.preview
      : null;

  const simple = (
    key: string,
    title: string,
    message: string | null,
    buttons: { label: string; primary?: boolean; onClick: () => void }[],
  ) => (
    <ModalDialog key={key} labelledBy="join-title" onCancel={buttons[0].onClick}>
      <div className={confirm.body}>
        <h2 id="join-title" className={confirm.title}>
          {title}
        </h2>
        {message !== null && <p className={confirm.message}>{message}</p>}
        <div className={confirm.actions}>
          {buttons.map((b) => (
            <Button key={b.label} variant={b.primary ? 'primary' : 'default'} onClick={b.onClick}>
              {b.label}
            </Button>
          ))}
        </div>
      </div>
    </ModalDialog>
  );

  const stay = () => close(null);

  if (stage === 'checking') {
    return simple('checking', 'Checking the invite link…', null, [
      { label: 'Cancel', onClick: stay },
    ]);
  }
  if (stage === 'failed') {
    return simple(
      'failed',
      "Couldn't check the invite link",
      'Check your connection and try again.',
      [
        { label: 'Close', onClick: stay },
        {
          label: 'Try again',
          primary: true,
          onClick: () => {
            setView({ stage: 'checking', answer: null });
            setAttempt((n) => n + 1);
          },
        },
      ],
    );
  }
  if (stage === 'dead') {
    return simple(
      'dead',
      "This link doesn't work any more",
      'The organizer may have reset it or deleted the session. Ask them for a new link.',
      [{ label: 'OK', primary: true, onClick: stay }],
    );
  }
  if (answer?.outcome === 'own') {
    return simple('own', 'This is your session', ownMessage(answer.title), [
      { label: 'Close', onClick: stay },
      {
        label: 'Open in Collection',
        primary: true,
        onClick: () => close({ openSessionId: answer.sessionId }),
      },
    ]);
  }
  if (answer?.outcome === 'already') {
    return simple(
      'already',
      "You're already tracking this session",
      alreadyMessage(answer.title, answer.member),
      [
        { label: 'Close', onClick: stay },
        {
          label: 'Open in Collection',
          primary: true,
          onClick: () => close({ openSessionId: answer.sessionId }),
        },
      ],
    );
  }
  if (stage === 'full' && preview !== null) {
    return simple(
      'full',
      'Everyone has already joined',
      everyoneJoinedMessage(preview.title, preview.organizerName),
      [{ label: 'OK', primary: true, onClick: stay }],
    );
  }
  if (preview === null) return null;

  // The picker: preselected from the profile name, suggested from a nickname, else left to the user.
  const pre =
    profile.status === 'ready' ? joinPreselect(preview, profile) : { value: null, suggested: null };
  const selected = choice ?? pre.value ?? pre.suggested;
  const offer = rememberOffer(profile, selected);

  const join = async () => {
    if (selected === null || joining.current) return;
    joining.current = true;
    setBusy(true);
    setError(null);
    const result = await invitesRef.current.join(raw, selected);
    joining.current = false;
    if (closed.current) return;
    setBusy(false);
    switch (result.outcome) {
      case 'joined':
        addJoinedSession(result.session);
        // Saved only now, so a refused or failed join writes nothing to the profile (A3).
        if (remember && offer !== null) void profile.remember(selected, offer);
        close({
          openSessionId: result.session.id,
          announce: `Joined ${sessionDisplayTitle(result.session)}.`,
        });
        return;
      case 'taken': {
        // Someone joined as that member first: the list refreshes and nothing is selected (AC-6.8).
        setChoice(null);
        const next = joinStage(result) as Stage;
        setView({ stage: next, answer: result });
        if (next === 'pick') setError(takenMessage(selected));
        return;
      }
      case 'own':
      case 'already':
      case 'dead':
        // Another device or a reset got there first.
        setView({ stage: joinStage(result) as Stage, answer: result });
        return;
      default:
        setError(COULDNT_JOIN);
    }
  };

  return (
    <ModalDialog key="pick" labelledBy="join-title" onCancel={stay}>
      <div className={confirm.body}>
        <h2 id="join-title" className={confirm.title}>
          {`Join “${preview.title}”?`}
        </h2>
        <p className={confirm.message}>
          Finished {formatLocalDate(preview.closedAt)} ·{' '}
          {pluralize(preview.members.length, 'member')}
        </p>
        <p className={confirm.message}>{joinSharedLine(preview.organizerName)}</p>
        <p className={confirm.message}>{joinReadOnlyLine(preview.organizerName)}</p>
        <div className={styles.members}>
          <MePicker
            legend={
              pre.suggested !== null && selected === pre.suggested
                ? nicknamePrompt(pre.suggested)
                : 'Which one are you?'
            }
            members={preview.members}
            unavailable={preview.unavailable}
            onHati={preview.onHati}
            afterMembers={
              preview.onHati.length > 0 && (
                <p className={confirm.message}>{nameTakenLine(preview.organizerName)}</p>
              )
            }
            offerNotInSession={false}
            value={selected}
            onChange={setChoice}
            remember={remember}
            onRememberChange={setRemember}
          />
        </div>
        {error !== null && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={confirm.actions}>
          <Button onClick={stay}>Cancel</Button>
          <Button
            variant="primary"
            disabled={selected === null || busy}
            onClick={() => void join()}
          >
            {busy ? 'Joining…' : 'Join'}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
