import { useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { ModalDialog } from '../shared/ModalDialog';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { useInvites } from '../../hooks/useInvites';
import { buildCard, rememberOffer } from '../../lib/collection';
import {
  alreadyMessage,
  everyoneJoinedMessage,
  isInviteToken,
  joinStage,
  ownMessage,
  takenMessage,
} from '../../lib/joinedSessions';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import type { InvitePreview, JoinAnswer } from '../../types';
import confirm from '../shared/ConfirmDialog.module.css';
import { JoinPick } from './JoinPick';

type Props = {
  /** The token as it came off the address, not yet checked. */
  raw: string;
  /** Where to land, or null to stay where the user is (Cancel, Close, OK and Escape). `arrival` says how it was reached. */
  onClose: (
    to: { openSessionId: string; announce?: string; arrival?: 'finish' | 'join' | 'open' } | null,
  ) => void;
};

type Stage = 'checking' | 'failed' | 'dead' | 'own' | 'already' | 'full' | 'paid' | 'pick';

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
  const { addJoinedSession, sessions } = useSessionsStore();
  const profile = useProfile();

  const [view, setView] = useState<View>(() =>
    isInviteToken(raw)
      ? { stage: 'checking', answer: null }
      : { stage: 'dead', answer: { outcome: 'dead' } },
  );
  // Bumped by "Try again", which checks the link once more.
  const [attempt, setAttempt] = useState(0);
  // How many times someone else has taken the member picked, so the dialog reopens on the list.
  const [taken, setTaken] = useState(0);
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

  // Where a session the account already has is: History when it is settled for them, so the button
  // says so and the card isn't a dead end on Collection (AC-H9.5, AC-H11.5).
  const placeOf = (sessionId: string): 'collection' | 'history' => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || profile.status !== 'ready') return 'collection';
    const bucket = buildCard(session, {
      displayName: profile.displayName,
      nicknames: profile.nicknames,
    }).bucket;
    return bucket === 'settled' ? 'history' : 'collection';
  };
  const openLabel = (sessionId: string) =>
    placeOf(sessionId) === 'history' ? 'Open in History' : 'Open in Collection';

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
  if (stage === 'paid') {
    return simple(
      'paid',
      'Everyone has paid',
      "Every line in this session is paid, so there's nothing left to track and the link no longer works.",
      [{ label: 'OK', primary: true, onClick: stay }],
    );
  }
  if (answer?.outcome === 'own') {
    return simple(
      'own',
      'This is your session',
      ownMessage(answer.title, placeOf(answer.sessionId)),
      [
        { label: 'Close', onClick: stay },
        {
          label: openLabel(answer.sessionId),
          primary: true,
          onClick: () => close({ openSessionId: answer.sessionId, arrival: 'open' }),
        },
      ],
    );
  }
  if (answer?.outcome === 'already') {
    return simple(
      'already',
      "You're already tracking this session",
      alreadyMessage(answer.title, answer.member, placeOf(answer.sessionId)),
      [
        { label: 'Close', onClick: stay },
        {
          label: openLabel(answer.sessionId),
          primary: true,
          onClick: () => close({ openSessionId: answer.sessionId, arrival: 'open' }),
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

  const join = async (member: string, remember: boolean) => {
    if (joining.current) return;
    joining.current = true;
    setBusy(true);
    setError(null);
    const result = await invitesRef.current.join(raw, member);
    joining.current = false;
    if (closed.current) return;
    setBusy(false);
    switch (result.outcome) {
      case 'joined': {
        addJoinedSession(result.session);
        // Saved only now, so a refused or failed join writes nothing to the profile (A3). The
        // dialog worked out whether the checkbox was shown, so `remember` already says it counts.
        const offer = rememberOffer(profile, member);
        if (remember && offer !== null) void profile.remember(member, offer);
        close({
          openSessionId: result.session.id,
          announce: `Joined ${sessionDisplayTitle(result.session)}.`,
          arrival: 'join',
        });
        return;
      }
      case 'taken': {
        // Someone joined as that member first: the list refreshes, nothing is selected, and it
        // opens on the list rather than the confirm (AC-6.8).
        const next = joinStage(result) as Stage;
        setView({ stage: next, answer: result });
        setTaken((n) => n + 1);
        if (next === 'pick') setError(takenMessage(member));
        return;
      }
      case 'own':
      case 'already':
      case 'dead':
      case 'paid':
        // Another device, a reset, or the last payment got there first.
        setView({ stage: joinStage(result) as Stage, answer: result });
        return;
      default:
        setError(COULDNT_JOIN);
    }
  };

  return (
    <ModalDialog key="pick" labelledBy="join-title" onCancel={stay}>
      <JoinPick
        key={`pick-${taken}`}
        preview={preview}
        busy={busy}
        error={error}
        onJoin={(member, remember) => void join(member, remember)}
        onCancel={stay}
        startWithList={taken > 0}
      />
    </ModalDialog>
  );
}
