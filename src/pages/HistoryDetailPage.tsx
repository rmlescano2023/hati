import { useEffect, useState } from 'react';
import { BreakdownGroup } from '../components/breakdown/BreakdownGroup';
import { EmptyState } from '../components/shared/EmptyState';
import { Button } from '../components/shared/Button';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { CollectionCardBody } from '../components/collection/CollectionCard';
import { InviteMembersDialog } from '../components/collection/InviteMembersDialog';
import { StopTrackingButton } from '../components/collection/StopTrackingButton';
import { ExportSoaButton } from '../components/summary/ExportSoaButton';
import { useProfile } from '../context/ProfileContext';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { groupRecordsForBreakdown } from '../lib/calculations';
import { buildCard, cameBack, everyLinePaid, isJoined } from '../lib/collection';
import { compareNames, formatLongDate, joinNames, sortNames } from '../lib/format';
import { backInCollectionLine, nothingToDoLine, sharedByLine } from '../lib/joinedSessions';
import { deleteSessionMessage, sessionDisplayTitle, sessionTitle } from '../lib/sessionLabel';
import styles from './HistoryDetailPage.module.css';

type Props = {
  sessionId: string;
  /** Where the reader came from, which the back button names and returns to. */
  back: 'history' | 'collection';
  /** Set when an arrival landed here because the session is already in History (AC-H9.2). */
  notice?: 'nothingToDo';
  onBack: () => void;
  /** Opens the session on Collection, from the notice that says it is back there. */
  onOpenInCollection?: (sessionId: string) => void;
  /** Called once the organizer has deleted the session from here, to go back where they came from. */
  onDeleted?: () => void;
  /** Called once a joined session has been left from here, so the app can go back and announce it. */
  onLeft?: (title: string) => void;
  /** The organizer's invite link for a session, or null when it can't be had. Absent in tests. */
  inviteUrlFor?: (sessionId: string) => Promise<string | null>;
};

const noop = () => {};
const noFailure = () => undefined;

/**
 * One finished session in full, and the one detail screen of the app: reached from History, or from
 * "View details" on a card. For a session that is in the viewer's History it shows "Your
 * payments", so a payment can still be undone, and says so when an undo or a changed pick brings
 * the session back to Collection. The organizer can share it while some line is unpaid, and delete
 * it; a member who joined can stop tracking it. The breakdown below is read-only.
 */
export function HistoryDetailPage({
  sessionId,
  back,
  notice,
  onBack,
  onOpenInCollection = noop,
  onDeleted = noop,
  onLeft = noop,
  inviteUrlFor,
}: Props) {
  const { sessions, deleteSession, isPaying } = useSessionsStore();
  const profile = useProfile();
  const [inviting, setInviting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Whether the page has seen the session in History, so "Your payments" stays while an undo is
  // out, when the line goes unpaid on screen before the server has answered.
  const [sawSettled, setSawSettled] = useState(false);
  // Why the session is back in Collection, once it is: an undo, or a changed pick.
  const [returned, setReturned] = useState<'undo' | 'change' | null>(null);
  // How the last undo ended, and that a pick was just changed, each read in the effect below once
  // the render that follows has the session's new bucket.
  const [ended, setEnded] = useState<boolean | null>(null);
  const [changed, setChanged] = useState(false);
  const session = sessions.find((s) => s.id === sessionId);
  const card =
    session && profile.status === 'ready'
      ? buildCard(session, { displayName: profile.displayName, nicknames: profile.nicknames })
      : null;
  const bucket = card?.bucket ?? null;
  if (bucket === 'settled' && !sawSettled) setSawSettled(true);

  useEffect(() => {
    if (ended === null && !changed) return;
    // A write still in flight will report in its turn, so only the last one decides (EH-7).
    if (ended !== null && isPaying(sessionId)) return;
    if (changed && bucket !== null && bucket !== 'settled') setReturned('change');
    else if (ended === true && bucket !== null && cameBack('settled', bucket)) setReturned('undo');
    setEnded(null);
    setChanged(false);
  }, [bucket, changed, ended, isPaying, sessionId]);

  const backLabel = back === 'history' ? '← History' : '← Collection';
  if (!session) {
    return (
      <EmptyState title="Session not found" description="It may have been removed elsewhere.">
        <Button onClick={onBack}>{backLabel}</Button>
      </EmptyState>
    );
  }

  const title = sessionDisplayTitle(session);
  const closedOn = (session.closedAt ?? session.createdAt).slice(0, 10);
  const members = [...session.members].sort(compareNames);
  const joined = isJoined(session);
  // The link lives while any line in the whole session is unpaid, whoever's it is (BR-L1), so an
  // organizer whose own lines are paid keeps Share while others still owe each other.
  const livingLink = !joined && !everyLinePaid(session);
  const showYourPayments =
    card !== null &&
    returned === null &&
    (bucket === 'settled' || (sawSettled && isPaying(sessionId)));
  const noticeText =
    returned !== null
      ? backInCollectionLine(title, returned)
      : notice === 'nothingToDo'
        ? nothingToDoLine(title)
        : '';

  return (
    <>
      <div className={styles.bar}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {backLabel}
        </Button>
      </div>

      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 className={styles.heading}>
            <span className={styles.date}>{title}</span>
          </h2>
          {session.name !== null && <p className={styles.dates}>{sessionTitle(session)}</p>}
          <p className={styles.meta}>
            Finished {formatLongDate(closedOn)}
            {members.length > 0 && <> · {joinNames(members)}</>}
          </p>
          {!joined && !livingLink && card !== null && card.pairCount > 0 && (
            <p className={styles.meta}>Everyone has paid, so the invite link no longer works.</p>
          )}
          {joined && (
            <p className={styles.meta}>
              {sharedByLine(session.organizerName ?? null)} · You joined as {session.me}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <ExportSoaButton
            layout="inline"
            variant="default"
            members={sortNames(session.members)}
            records={session.records}
            name={session.name}
            fileNameSuffix={closedOn}
            getInviteUrl={livingLink && inviteUrlFor ? () => inviteUrlFor(session.id) : undefined}
          />
          {joined ? (
            <StopTrackingButton
              session={session}
              variant="button"
              className={styles.secondary}
              onLeft={onLeft}
            />
          ) : (
            <>
              {livingLink && (
                <Button
                  variant="primary"
                  size="lg"
                  className={styles.secondary}
                  onClick={() => setInviting(true)}
                >
                  Share with members
                </Button>
              )}
              <Button
                variant="ghost"
                size="lg"
                className={`${styles.secondary} ${styles.delete}`}
                aria-label={`Delete session ${title}`}
                onClick={() => setDeleting(true)}
              >
                Delete session
              </Button>
            </>
          )}
        </div>
      </header>
      {inviting && <InviteMembersDialog session={session} onClose={() => setInviting(false)} />}
      <ConfirmDialog
        open={deleting}
        title="Delete this session?"
        message={deleting ? deleteSessionMessage(session, bucket === 'settled' ? 'history' : 'collection') : ''}
        confirmLabel="Delete Session"
        destructive
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          deleteSession(session.id);
          onDeleted();
        }}
      />

      {noticeText !== '' && (
        <div className={styles.notice}>
          <p>{noticeText}</p>
          {returned !== null && (
            <Button size="sm" onClick={() => onOpenInCollection(session.id)}>
              Open in Collection
            </Button>
          )}
        </div>
      )}
      {/* Always mounted, so the same text is read out when it appears (AC-H6.1). */}
      <p role="status" className="visually-hidden">
        {noticeText}
      </p>

      {showYourPayments && card !== null && (
        <section aria-labelledby="your-payments" className={styles.yourPayments}>
          <h3 id="your-payments" className={styles.sectionHeading}>
            Your payments
          </h3>
          <CollectionCardBody
            card={card}
            title={title}
            place="history"
            failed={noFailure}
            onFailed={noop}
            onPaid={(ok) => setEnded(ok)}
            onLeft={onLeft}
            onAnnounce={noop}
            onChanged={() => setChanged(true)}
          />
        </section>
      )}

      {groupRecordsForBreakdown(session.records, sortNames(session.members)).map((group) => (
        <BreakdownGroup
          key={group.key}
          group={group}
          members={members}
          editable={false}
        />
      ))}
    </>
  );
}
