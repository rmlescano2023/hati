import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { ModalDialog } from '../shared/ModalDialog';
import { QrCode } from './QrCode';
import { useInvites } from '../../hooks/useInvites';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { compareNames } from '../../lib/format';
import { inviteIntro, joinedRowLine, removeMessage } from '../../lib/joinedSessions';
import { inviteUrl } from '../../lib/joinLink';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import type { Participant, Session } from '../../types';
import confirmStyles from '../shared/ConfirmDialog.module.css';
import pickerStyles from './MePicker.module.css';
import styles from './InviteMembersDialog.module.css';

type Props = {
  /** An owned, finished session. */
  session: Session;
  onClose: () => void;
};

const COPIED_MS = 2000;

/**
 * The organizer's invite dialog: the private link to copy, who has joined as which member, and
 * the two controls that take access back, Remove and Reset (US-1 to US-4). It shows each joiner's
 * Hati profile name and join date and nothing else (D3).
 *
 * The two confirmations are siblings of the dialog, not children, so a click or Escape inside one
 * never reaches the dialog under it.
 */
export function InviteMembersDialog({ session, onClose }: Props) {
  const { getLink } = useInvites();
  const { removeParticipant } = useSessionsStore();
  const title = sessionDisplayTitle(session);

  const [link, setLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState(false);
  // Null until fetched, so the store's copy shows meanwhile.
  const [list, setList] = useState<Participant[] | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Shown by the Copy button it is about, not down with the other errors.
  const [copyError, setCopyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [removing, setRemoving] = useState<Participant | null>(null);

  const linkEl = useRef<HTMLParagraphElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>();
  // An answer that lands after the dialog has closed is dropped.
  const alive = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLinkError(false);
    const result = await getLink(session.id, false);
    if (!alive.current) return;
    if (result) {
      setLink(inviteUrl(window.location.origin, result.token));
      setList(result.participants);
    } else {
      setLinkError(true);
    }
    setLoading(false);
  }, [getLink, session.id]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      clearTimeout(copiedTimer.current);
    };
  }, [load]);

  const participants = [...(list ?? session.participants ?? [])].sort((a, b) =>
    compareNames(a.member, b.member),
  );

  const copy = async () => {
    if (link === null) return;
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setNote('Link copied');
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // No clipboard, or it refused: leave the link selected for the user to copy.
      setCopyError("Couldn't copy. Select the link and copy it yourself.");
      if (linkEl.current) window.getSelection()?.selectAllChildren(linkEl.current);
    }
  };

  /** Replaces the link. Resolves whether it worked, and says so itself when it didn't. */
  const reset = async (): Promise<boolean> => {
    const result = await getLink(session.id, true);
    if (!alive.current) return false;
    if (!result) {
      setError("Couldn't reset the link. Try again.");
      return false;
    }
    setLink(inviteUrl(window.location.origin, result.token));
    setList(result.participants);
    setNote('Invite link reset.');
    return true;
  };

  const confirmReset = async () => {
    setResetting(false);
    setError(null);
    setBusy(true);
    await reset();
    if (alive.current) setBusy(false);
  };

  const confirmRemove = async (participant: Participant, alsoReset: boolean) => {
    setRemoving(null);
    setError(null);
    setBusy(true);
    if (await removeParticipant(session.id, participant.member)) {
      if (!alive.current) return;
      setList((current) =>
        (current ?? session.participants ?? []).filter((p) => p.member !== participant.member),
      );
      // Two requests (A5): if the reset fails after the removal went through, the row is already
      // gone and the dialog says so.
      if (alsoReset) await reset();
    } else if (alive.current) {
      setError(`Couldn't remove ${participant.member}. Try again.`);
    }
    if (alive.current) setBusy(false);
  };

  return (
    <>
      <ModalDialog labelledBy="invite-members-title" onCancel={onClose}>
        <div className={confirmStyles.body}>
          <h2 id="invite-members-title" className={confirmStyles.title}>
            Share with members
          </h2>
          <p className={confirmStyles.message}>{inviteIntro(title)}</p>

          {loading && <p className={confirmStyles.message}>Getting the link…</p>}
          {linkError && (
            <div className={styles.linkError}>
              <p role="alert" className={styles.error}>
                Couldn&apos;t get the invite link. Check your connection and try again.
              </p>
              <Button size="sm" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}
          {link !== null && !loading && (
            <>
              <figure className={styles.qrFigure}>
                <QrCode text={link} label={`QR code for the invite link to ${title}`} />
                <figcaption className={styles.qrCaption}>
                  Scan with a phone camera to join.
                </figcaption>
              </figure>
              <p ref={linkEl} className={styles.link}>
                {link}
              </p>
              <div>
                <Button onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Button>
              </div>
              {copyError !== null && (
                <p role="alert" className={styles.error}>
                  {copyError}
                </p>
              )}
            </>
          )}

          <h3 className={styles.heading}>Tracking on Hati</h3>
          {participants.length === 0 ? (
            <p className={confirmStyles.message}>Nobody has joined yet.</p>
          ) : (
            <ul className={styles.list}>
              {participants.map((p) => (
                <li key={p.member} className={styles.row}>
                  <span className={styles.rowText}>
                    <strong className={styles.member}>{p.member}</strong>
                    <span className={styles.rowMeta}>{joinedRowLine(p)}</span>
                  </span>
                  <Button
                    size="sm"
                    disabled={busy}
                    aria-label={`Remove ${p.member}'s account from ${title}`}
                    onClick={() => setRemoving(p)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {error !== null && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={confirmStyles.actions}>
            <Button disabled={busy || link === null} onClick={() => setResetting(true)}>
              Reset link
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
          <p role="status" className="visually-hidden">
            {note}
          </p>
        </div>
      </ModalDialog>

      <ConfirmDialog
        open={resetting}
        title="Reset the invite link?"
        message="The current link, and the QR on any statement you've already shared, will stop working. Members who already joined keep tracking. You'll get a new link to share."
        confirmLabel="Reset link"
        destructive
        onCancel={() => setResetting(false)}
        onConfirm={() => void confirmReset()}
      />

      {removing !== null && (
        <RemoveParticipantDialog
          participant={removing}
          title={title}
          hasPending={(session.claims ?? []).some((c) => c.debtor === removing.member)}
          onCancel={() => setRemoving(null)}
          onConfirm={(alsoReset) => void confirmRemove(removing, alsoReset)}
        />
      )}
    </>
  );
}

/**
 * Confirms taking a joined account out of the session, with the option to reset the link in the
 * same step, for when the link may have reached someone it shouldn't have. Cancel carries the
 * emphasis and Remove stays quiet, as in a destructive `ConfirmDialog`.
 */
function RemoveParticipantDialog({
  participant,
  title,
  hasPending,
  onCancel,
  onConfirm,
}: {
  participant: Participant;
  title: string;
  /** That account has said they paid something that is still waiting, which removing them withdraws. */
  hasPending: boolean;
  onCancel: () => void;
  onConfirm: (alsoReset: boolean) => void;
}) {
  const [alsoReset, setAlsoReset] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  // A destructive dialog opens on its way out, as `ConfirmDialog` does. The dialog's own first
  // focus lands on the checkbox, and Enter there must never be one keystroke from removing.
  useEffect(() => {
    body.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
  }, []);
  return (
    <ModalDialog labelledBy="remove-participant-title" onCancel={onCancel}>
      <div ref={body} className={confirmStyles.body}>
        <h2 id="remove-participant-title" className={confirmStyles.title}>
          Remove {participant.member}?
        </h2>
        <p className={confirmStyles.message}>{removeMessage(participant, title, hasPending)}</p>
        <label className={pickerStyles.option}>
          <input
            type="checkbox"
            checked={alsoReset}
            onChange={(e) => setAlsoReset(e.target.checked)}
          />
          <span className={pickerStyles.optionLabel}>Also reset the invite link</span>
        </label>
        <div className={confirmStyles.actions}>
          <Button data-cancel="" variant="primary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onConfirm(alsoReset)}>
            Remove
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
