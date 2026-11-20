import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import {
  claimedMembers,
  formatCents,
  isJoined,
  joinedMarkAll,
  markAllMessage,
  membersWithAccount,
  nicknamePrompt,
  openLinePayments,
  rememberOffer,
  type CollectionCard as Card,
  type CollectionLine,
} from '../../lib/collection';
import type { Claim } from '../../types';
import { formatLocalDate, formatLocalDateTime, sortNames } from '../../lib/format';
import { createId } from '../../lib/id';
import {
  confirmOthersMessage,
  declineMessage,
  deciderName,
  joinedMarkAllMessage,
  notOnHatiLine,
  saysTheyPaidOtherLine,
  sharedByLine,
  toConfirmCountLine,
  waitingSummaryLine,
} from '../../lib/joinedSessions';
import { isPracticeId } from '../../lib/practiceId';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import { ChangeMeDialog } from './ChangeMeDialog';
import { InviteMembersDialog } from './InviteMembersDialog';
import { StopTrackingButton } from './StopTrackingButton';
import { ExportSoaButton } from '../summary/ExportSoaButton';
import { LineRow, type FailedPayment } from './LineRow';
import { DirectionLabel } from './DirectionLabel';
import { MePicker } from './MePicker';
import styles from './CollectionCard.module.css';

type Props = {
  card: Card;
  expanded: boolean;
  onToggle: () => void;
  /** Failed payments by line key, for this card's lines. */
  failed: (lineKey: string) => FailedPayment | undefined;
  onFailed: (lineKey: string, failed: FailedPayment | null) => void;
  /** Called as a payment recorded here ends, `ok` once the server has it, so the page can announce the session settling. */
  onPaid: (ok: boolean) => void;
  /** Marks the session as already settled: a full payment on every pair. */
  onAlreadySettled: () => void;
  /** Called as a Needs setup card is confirmed, so the page can bring the user to where it lands. */
  onPlaced: () => void;
  /** Briefly outlined: this card has just been placed in this section. */
  placed: boolean;
  /** Called once a joined session has been left, so the page can announce it. */
  onLeft: (title: string) => void;
  /** Says something to a screen reader on the page's live region, which outlives a card that moves. */
  onAnnounce: (text: string) => void;
  /** Opens the session's detail page. Collection passes it; a guide's practice doesn't, so it has no View details. */
  onViewDetails?: (sessionId: string) => void;
  /** Fetches the invite link for the organizer's export, as History detail does. */
  inviteUrlFor?: (sessionId: string) => Promise<string | null>;
};

/** Rotates with the card's open state; the header's `aria-expanded` carries the meaning. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
    >
      <path
        d="m4 6 4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Every pair is paid and none of them is the user's, so there is nothing of theirs to show. */
const everyonesPaid = (card: Card): boolean =>
  card.pairCount > 0 && card.allPairsPaid && card.lineCount === 0;

/**
 * The part of the summary after the dates, which depends on the section. The
 * money figures show only while collapsed: expanded, every line shows its own.
 */
function summaryDetail(card: Card, expanded: boolean): string[] {
  // What is waiting on a claim shows on any card, in any section, beside the figures it isn't part of
  // (AC-23.4, AC-28.1).
  return [
    ...baseSummaryDetail(card, expanded),
    card.waitingCents > 0 ? waitingSummaryLine(card.waitingCents) : '',
  ];
}

function baseSummaryDetail(card: Card, expanded: boolean): string[] {
  const { owedToYou, youOwe } = card;
  if (card.bucket === 'needsSetup') return [];
  if (card.bucket === 'outstanding') {
    // A card with no lines of its own, open only for claims to confirm, has no "0 of 0 settled".
    return card.lineCount === 0 ? [] : [`${card.settledLineCount} of ${card.lineCount} settled`];
  }
  // A fully paid session where the user has no lines on screen: nobody owes
  // anybody, which is true whether they're not in it or Hati doesn't know who
  // they are (Q3, Q4).
  if (card.me.kind === 'notInSession') return everyonesPaid(card) ? ["Everyone's paid"] : [];
  if (card.me.kind === 'unknown') {
    return card.pairCount === 0 ? ["Nothing to collect. Everyone's even."] : ["Everyone's paid"];
  }
  if (card.lineCount === 0) return ["Nothing to collect. You're even with everyone."];
  return [
    `Settled ${formatLocalDate(card.settledAt)}`,
    expanded
      ? ''
      : [
          owedToYou.length > 0 && `Received ${formatCents(card.receivedCents)}`,
          youOwe.length > 0 && `Paid ${formatCents(card.paidOutCents)}`,
        ]
          .filter(Boolean)
          .join(' · '),
  ];
}

/**
 * What is left on each side of an Outstanding card, coloured and with an arrow
 * like the strip and the group headings. No hints here: the strip at the top
 * of the page explains the arrows once, and they would wrap this to several
 * lines on a phone. Each side wraps as a whole, never mid-amount, and the dot
 * between them belongs to the second side, so it can never end a line.
 */
function MoneySummary({ card }: { card: Card }) {
  const { owedToYou, youOwe } = card;
  return (
    <span className={styles.money}>
      <span className={styles.moneyRow}>
        {owedToYou.length > 0 && (
          <span className={styles.side}>
            <DirectionLabel direction="owedToYou">{` ${formatCents(card.owedToYouRemainingCents)}`}</DirectionLabel>
          </span>
        )}
        {youOwe.length > 0 && (
          <span className={styles.side}>
            {owedToYou.length > 0 && (
              <span aria-hidden="true" className={styles.sep}>
                ·
              </span>
            )}
            <DirectionLabel direction="youOwe">{` ${formatCents(card.youOweRemainingCents)}`}</DirectionLabel>
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * One finished session on Collection. A Needs setup card expands to the
 * question of who the user is and nothing else; the others summarise what is
 * left or what was settled, and expand to the lines themselves. Every card
 * starts collapsed, so a few unplaced sessions don't push the rest of the page
 * out of sight on a phone. A card placed automatically by the profile name,
 * with no lines, has nothing to expand, so it has no toggle. There is deliberately no delete here (AC-13.5):
 * deleting a session belongs to History.
 */
export function CollectionCard({
  card,
  expanded,
  onToggle,
  failed,
  onFailed,
  onPaid,
  onAlreadySettled,
  onPlaced,
  placed,
  onLeft,
  onAnnounce,
  onViewDetails,
  inviteUrlFor,
}: Props) {
  const { session } = card;
  const title = sessionDisplayTitle(session);
  // A session someone else organized: read-only, with Stop tracking where the organizer has Invite.
  const joined = isJoined(session);
  const [inviting, setInviting] = useState(false);
  const finished = `Finished ${formatLocalDate(session.closedAt ?? session.createdAt)}`;
  const bodyId = useId();
  const setup = card.bucket === 'needsSetup';
  // Only a card placed automatically by the profile name says nothing about who
  // the user is; every stored pick keeps its line, since Change is the only way
  // to undo one (BR-N5, round 2). An unknown "me" on a fully paid card has none
  // either, and must never read "You're not in this session".
  const hasLine = (card.me.kind === 'member' && card.me.picked) || card.me.kind === 'notInSession';
  // The line is shown inside the open card, never on a collapsed one, so a card
  // that has it but no lines still opens, to show just that.
  const allPaid = everyonesPaid(card);
  // A joined card always opens, for Stop tracking (BR-V5).
  const expandable =
    joined ||
    setup ||
    card.lineCount > 0 ||
    hasLine ||
    card.presettled ||
    allPaid ||
    card.forOthers.length > 0;

  // Placed in Mark all's row when that row shows, or in its own row when it doesn't. Only an
  // Outstanding card offers it: a settled session has nothing left to collect, and a card still in
  // Needs setup isn't placed yet (round 5). A practice session never shows it (AC-1.9), so the
  // Collection guide's Mark all row is exactly as it was.
  const share =
    !joined && card.bucket === 'outstanding' && !isPracticeId(session.id) ? (
      <Button
        variant="primary"
        className={styles.share}
        aria-label={`Share ${title} with members`}
        onClick={() => setInviting(true)}
      >
        Share with members
      </Button>
    ) : null;
  const summary = (
    <span className={styles.titles}>
      <span className={styles.title}>{title}</span>
      <span className={styles.meta}>{finished}</span>
      {joined && <span className={styles.meta}>{sharedByLine(session.organizerName ?? null)}</span>}
      {summaryDetail(card, expanded)
        .filter((part) => part !== '')
        .map((part) => (
          <span key={part} className={styles.detail}>
            {part}
          </span>
        ))}
      {card.bucket === 'outstanding' && !expanded && <MoneySummary card={card} />}
      {card.toConfirmCount > 0 && (
        <span className={styles.toConfirm}>
          <span aria-hidden="true">{card.toConfirmCount} to confirm</span>
          <span className="visually-hidden">{toConfirmCountLine(card.toConfirmCount)}</span>
        </span>
      )}
    </span>
  );

  // The "Already settled" button is a different element in each place it shows,
  // or gone, when the card opens or closes, so focus on it would fall back to
  // the page. It follows the button to its new place, or to the header's
  // toggle when the button has gone.
  const article = useRef<HTMLElement>(null);
  const buttonFocused = useRef(false);
  useEffect(() => {
    if (!buttonFocused.current) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target =
      article.current?.querySelector<HTMLButtonElement>('[data-already-settled]') ??
      article.current?.querySelector<HTMLButtonElement>('[aria-expanded]');
    target?.focus();
  }, [expanded]);
  const alreadySettled = (size: 'sm' | 'md'): ReactNode =>
    card.offersAlreadySettled ? (
      <Button
        size={size}
        data-already-settled=""
        aria-label={`Mark “${title}” as already settled`}
        onClick={onAlreadySettled}
        onFocus={() => {
          buttonFocused.current = true;
        }}
        onBlur={(e) => {
          // A blur from the button being replaced leaves it detached, and focus
          // should follow it; one from the user moving on clears it.
          if (e.currentTarget.isConnected) buttonFocused.current = false;
        }}
      >
        Already settled
      </Button>
    ) : null;

  return (
    <article
      ref={article}
      id={`collection-${session.id}`}
      className={`${styles.card} ${expandable ? (expanded ? styles.open : styles.clickable) : ''} ${placed ? styles.placed : ''}`}
    >
      <h3 className={styles.headerHeading}>
        {expandable ? (
          <button
            type="button"
            className={styles.header}
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={onToggle}
          >
            {summary}
            <Chevron open={expanded} />
          </button>
        ) : (
          <span className={`${styles.header} ${styles.static}`}>{summary}</span>
        )}
      </h3>

      {/* Collapsed, the button sits under the summary. Open, a Needs setup card moves it beside Confirm, and an Outstanding card drops it, so "Mark all as paid" stands alone. */}
      {!expanded && alreadySettled && (
        <div className={styles.alreadySettled}>{alreadySettled('sm')}</div>
      )}

      {expandable && expanded && setup && (
        <div id={bodyId} className={styles.body}>
          <ForOthers card={card} title={title} onPaid={onPaid} onAnnounce={onAnnounce} />
          <NeedsSetup card={card} onPlaced={onPlaced} extra={alreadySettled('md')} />
          {/* A card still in Needs setup can't be exported or shared yet, so it only gets the details (Q2). */}
          {onViewDetails && !isPracticeId(session.id) && (
            <div className={styles.detailsRow}>
              <Button
                aria-label={`View details of ${title}`}
                onClick={() => onViewDetails(session.id)}
              >
                View details
              </Button>
            </div>
          )}
        </div>
      )}

      {expandable && expanded && !setup && (
        <CollectionCardBody
          id={bodyId}
          card={card}
          title={title}
          place="card"
          failed={failed}
          onFailed={onFailed}
          onPaid={onPaid}
          onLeft={onLeft}
          onAnnounce={onAnnounce}
          share={share}
          inviteDialog={
            inviting && <InviteMembersDialog session={session} onClose={() => setInviting(false)} />
          }
          onViewDetails={onViewDetails}
          inviteUrlFor={inviteUrlFor}
        />
      )}
    </article>
  );
}

type BodyProps = {
  card: Card;
  title: string;
  /** On a Collection card, or on History detail under "Your payments" (BR-D2). */
  place: 'card' | 'history';
  /** The body's id, for the header button's `aria-controls`. */
  id?: string;
  failed: (lineKey: string) => FailedPayment | undefined;
  onFailed: (lineKey: string, failed: FailedPayment | null) => void;
  onPaid: (ok: boolean) => void;
  onLeft: (title: string) => void;
  onAnnounce: (text: string) => void;
  /** Share, as the card built it (null when this card doesn't offer it), and its dialog. */
  share?: ReactNode;
  inviteDialog?: ReactNode;
  onViewDetails?: (sessionId: string) => void;
  inviteUrlFor?: (sessionId: string) => Promise<string | null>;
  /** Called after the user's pick in this session has been changed, on History detail. */
  onChanged?: () => void;
};

/**
 * The open card's body. On a card it is everything it always was. On History detail
 * (`place="history"`) it is exactly "Your payments": who the user is, their lines with Undo, and
 * Undo "Already settled", with none of the actions that record, claim, share or export. Exported so
 * that detail page can reuse it rather than redraw the lines.
 */
export function CollectionCardBody({
  card,
  title,
  place,
  id,
  failed,
  onFailed,
  onPaid,
  onLeft,
  onAnnounce,
  share = null,
  inviteDialog,
  onViewDetails,
  inviteUrlFor,
  onChanged,
}: BodyProps) {
  const { session } = card;
  const joined = isJoined(session);
  const inHistory = place === 'history';
  const hasLine = (card.me.kind === 'member' && card.me.picked) || card.me.kind === 'notInSession';
  const allPaid = everyonesPaid(card);
  const markAllShown =
    (joined || card.bucket === 'outstanding') && card.owedToYouOpenCents + card.youOweOpenCents > 0;
  const groups: { direction: CollectionLine['direction']; lines: CollectionLine[] }[] = [
    { direction: 'owedToYou', lines: card.owedToYou },
    { direction: 'youOwe', lines: card.youOwe },
  ];

  return (
    <div id={id} className={styles.body}>
      {!inHistory && (
        <ForOthers card={card} title={title} onPaid={onPaid} onAnnounce={onAnnounce} />
      )}
      {joined ? (
        <div className={styles.youAre}>
          <span>
            You joined as <strong>{session.me}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <StopTrackingButton session={session} variant="link" onLeft={onLeft} />
        </div>
      ) : (
        hasLine && <YouAre card={card} title={title} onChanged={onChanged} />
      )}
      {groups
        .filter((g) => g.lines.length > 0)
        .map((group) => (
          <section
            key={group.direction}
            className={styles.group}
            data-tour={group.direction === 'owedToYou' ? 'collection-owed' : undefined}
          >
            <h4 className={styles.groupHeading}>
              <DirectionLabel direction={group.direction} />
            </h4>
            {group.lines.map((line) => (
              <LineRow
                key={line.key}
                sessionId={session.id}
                line={line}
                failed={failed(line.key)}
                onFailed={(f) => onFailed(line.key, f)}
                onPaid={onPaid}
                joined={joined}
                inHistory={inHistory}
                decider={deciderName(
                  line.creditor,
                  membersWithAccount(session),
                  session.organizerName ?? null,
                )}
                onAnnounce={onAnnounce}
              />
            ))}
          </section>
        ))}
      {allPaid && <p className={styles.detail}>Every line in this session is marked as paid.</p>}
      {!inHistory && markAllShown && (
        <MarkAll
          card={card}
          title={title}
          onPaid={onPaid}
          joined={joined}
          extra={joined ? null : share}
        />
      )}
      {!joined && card.presettled && (
        <UndoSettled card={card} title={title} onPaid={inHistory ? onPaid : undefined} />
      )}
      {!inHistory && share !== null && !markAllShown && (
        <div className={styles.shareRow}>{share}</div>
      )}
      {/* View details and the card's export: the last row, a sibling after Mark all's row and never
          inside the element the tour points at. Needs setup has its own, in the card. */}
      {!inHistory &&
        card.bucket === 'outstanding' &&
        onViewDetails &&
        !isPracticeId(session.id) && (
          <div className={styles.detailsRow}>
            <Button
              aria-label={`View details of ${title}`}
              onClick={() => onViewDetails(session.id)}
            >
              View details
            </Button>
            <ExportSoaButton
              layout="card"
              members={sortNames(session.members)}
              records={session.records}
              name={session.name}
              fileNameSuffix={(session.closedAt ?? session.createdAt).slice(0, 10)}
              getInviteUrl={joined || !inviteUrlFor ? undefined : () => inviteUrlFor(session.id)}
            />
          </div>
        )}
      {/* Outside every row, so it is never a flex item and never inside the tour target. */}
      {!inHistory && inviteDialog}
    </div>
  );
}

/**
 * Who the user is in the session, spelled out for any stored pick or "not in
 * this session", since Change is the only way to undo one. It sits at the top of
 * the open card, above the lines it decides, and never on a collapsed card. A
 * card placed automatically by the profile name says nothing; a wrong match
 * there is fixed by editing the name in Profile.
 */
function YouAre({
  card,
  title,
  onChanged,
}: {
  card: Card;
  title: string;
  /** Called after the pick has been saved, which on History detail can bring the session back. */
  onChanged?: () => void;
}) {
  const [changing, setChanging] = useState(false);
  return (
    <div className={styles.youAre}>
      {card.me.kind === 'member' ? (
        <span>
          You are <strong>{card.me.name}</strong>
        </span>
      ) : (
        <span>You&apos;re not in this session</span>
      )}
      <span aria-hidden="true">·</span>
      <Button
        variant="ghost"
        size="sm"
        className="link-action"
        aria-label={`Change who you are in ${title}`}
        onClick={() => setChanging(true)}
      >
        Change
      </Button>
      {changing && (
        <ChangeMeDialog
          session={card.session}
          me={card.me}
          onChanged={onChanged}
          onClose={() => setChanging(false)}
        />
      )}
    </div>
  );
}

/** Asks who the user is in a session Hati couldn't place (US-5). */
function NeedsSetup({
  card,
  onPlaced,
  extra,
}: {
  card: Card;
  onPlaced: () => void;
  /** "Already settled", when offered, beside Confirm. */
  extra: ReactNode;
}) {
  const { setMe } = useSessionsStore();
  const profile = useProfile();
  // The member a nickname matched, preselected for the user to confirm: a
  // friend can share the nickname, so it never places a session on its own.
  const suggested = card.me.kind === 'unknown' ? card.me.suggested : null;
  // Null means untouched, so a suggestion that arrives or goes while the card is
  // open (a remember saving, a name removed) is followed until a radio is tapped.
  const [choice, setChoice] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const selected = choice ?? suggested;

  return (
    <div className={styles.setup}>
      <MePicker
        legend={
          suggested !== null && selected === suggested
            ? nicknamePrompt(suggested)
            : 'Which one are you?'
        }
        members={card.session.members}
        value={selected}
        onChange={setChoice}
        remember={remember}
        onRememberChange={setRemember}
        unavailable={claimedMembers(card.session)}
      />
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={selected === null}
          onClick={() => {
            if (selected === null) return;
            onPlaced();
            setMe(card.session.id, selected);
            const offer = rememberOffer(profile, selected);
            if (remember && offer !== null) void profile.remember(selected, offer);
          }}
        >
          {selected !== null && selected === suggested ? "Yes, that's me" : 'Confirm'}
        </Button>
        {extra}
      </div>
    </div>
  );
}

/**
 * Undoes "already settled": removes every payment recorded when the session
 * was marked, in one request. It confirms first, and shows on every such card,
 * whether or not the user is in the session (Q3).
 */
function UndoSettled({
  card,
  title,
  onPaid,
}: {
  card: Card;
  title: string;
  /** Told how the undo ended, so History detail can wait for the server before it says the session is back. */
  onPaid?: (ok: boolean) => void;
}) {
  const { removeAllPayments } = useSessionsStore();
  const [confirming, setConfirming] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  return (
    <div ref={row} className={styles.markAll}>
      <Button aria-label={`Undo “already settled” on ${title}`} onClick={() => setConfirming(true)}>
        Undo “Already settled”
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Undo “already settled”?"
        message={`This removes the payments recorded when “${title}” was marked as settled. It goes back to being tracked.${(card.session.participants?.length ?? 0) > 0 ? ' Members tracking it on Hati will see their lines unpaid again.' : ''}`}
        confirmLabel="Undo"
        destructive
        onCancel={() => {
          setConfirming(false);
          // The dialog is removed rather than closed, so focus wouldn't return
          // to the button that opened it on its own.
          requestAnimationFrame(() => row.current?.querySelector('button')?.focus());
        }}
        onConfirm={() => {
          setConfirming(false);
          removeAllPayments(card.session.id, onPaid);
        }}
      />
    </div>
  );
}

/**
 * "To confirm for others": the organizer's claims to decide for creditors who have no account, so
 * their lines are on no card (BR-C2). It is the first thing in the open body, whether or not the
 * organizer has been placed, because an unanswered claim is the first thing to do. Confirming asks
 * first and has no undo here, since these lines aren't on this card (Q3); declining asks too.
 */
function ForOthers({
  card,
  title,
  onPaid,
  onAnnounce,
}: {
  card: Card;
  title: string;
  onPaid: (ok: boolean) => void;
  onAnnounce: (text: string) => void;
}) {
  const { decideClaim } = useSessionsStore();
  const [asking, setAsking] = useState<{ claim: Claim; decision: 'confirm' | 'decline' } | null>(
    null,
  );
  const [errors, setErrors] = useState(new Map<string, string>());
  if (card.forOthers.length === 0) return null;

  const decide = (claim: Claim, decision: 'confirm' | 'decline') => {
    setErrors(new Map());
    decideClaim(card.session.id, claim.id, decision, (result) => {
      onPaid(result.ok);
      if (result.ok) {
        if (decision === 'confirm') onAnnounce('Payment confirmed.');
        return;
      }
      // A refusal is shown on its entry, while it is still there; anything else is the banner's.
      if (result.code === undefined) return false;
      setErrors((current) => new Map(current).set(claim.id, result.message));
      return true;
    });
  };

  return (
    <section className={styles.group}>
      <h4 className={styles.groupHeading}>To confirm for others</h4>
      {card.forOthers.map((claim) => (
        <div key={claim.id} className={styles.other} data-to-confirm="">
          <span className={styles.otherText}>
            <span>{saysTheyPaidOtherLine(claim.debtor, claim.creditor, claim.amountCents)}</span>
            <span className={styles.otherMeta}>{formatLocalDateTime(claim.createdAt)}</span>
            <span className={styles.otherMeta}>{notOnHatiLine(claim.creditor)}</span>
            {errors.get(claim.id) && (
              <span role="alert" className={styles.otherError}>
                {errors.get(claim.id)}
              </span>
            )}
          </span>
          <span className={styles.otherActions}>
            <Button
              variant="primary"
              size="sm"
              aria-label={`Confirm ${formatCents(claim.amountCents)} from ${claim.debtor} to ${claim.creditor}`}
              onClick={() => setAsking({ claim, decision: 'confirm' })}
            >
              Confirm
            </Button>
            <Button
              size="sm"
              aria-label={`Decline ${formatCents(claim.amountCents)} from ${claim.debtor} to ${claim.creditor}`}
              onClick={() => setAsking({ claim, decision: 'decline' })}
            >
              Decline
            </Button>
          </span>
        </div>
      ))}
      <ConfirmDialog
        open={asking !== null}
        title={asking?.decision === 'decline' ? 'Decline this payment?' : 'Confirm this payment?'}
        message={
          asking === null
            ? ''
            : asking.decision === 'decline'
              ? declineMessage(
                  asking.claim.debtor,
                  asking.claim.creditor,
                  asking.claim.amountCents,
                  asking.claim.createdAt,
                  false,
                )
              : confirmOthersMessage(
                  asking.claim.debtor,
                  asking.claim.creditor,
                  asking.claim.amountCents,
                  title,
                )
        }
        confirmLabel={asking?.decision === 'decline' ? 'Decline' : 'Confirm'}
        destructive={asking?.decision === 'decline'}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          const answer = asking;
          setAsking(null);
          if (answer) decide(answer.claim, answer.decision);
        }}
      />
    </section>
  );
}

/**
 * Records what is left on every open line at once, one payment per line, all
 * or nothing (US-8b). It confirms first, because one tap can write many
 * payments; each can still be undone on its own.
 */
function MarkAll({
  card,
  title,
  onPaid,
  joined,
  extra,
}: {
  card: Card;
  title: string;
  onPaid: (ok: boolean) => void;
  joined: boolean;
  /** Share, when it goes in this row: straight after Mark all, which stays the row's first button. */
  extra?: ReactNode;
}) {
  const { addClaims, addPayments } = useSessionsStore();
  const [confirming, setConfirming] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={row}
      className={`${styles.markAll} ${extra ? styles.withShare : ''}`}
      data-tour="collection-mark-all"
    >
      <Button aria-label={`Mark all as paid in ${title}`} onClick={() => setConfirming(true)}>
        Mark all as paid
      </Button>
      {extra}
      <ConfirmDialog
        open={confirming}
        title="Mark everything as paid?"
        message={
          !confirming
            ? ''
            : joined
              ? joinedMarkAllMessage(title, card.owedToYouOpenCents, card.youOweOpenCents)
              : markAllMessage(card)
        }
        confirmLabel="Mark all as paid"
        onCancel={() => {
          setConfirming(false);
          // The dialog is removed rather than closed, so focus wouldn't return
          // to the button that opened it on its own.
          requestAnimationFrame(() => row.current?.querySelector('button')?.focus());
        }}
        onConfirm={() => {
          setConfirming(false);
          const withIds = <T extends object>(list: T[]) =>
            list.map((p) => ({ ...p, id: createId('pay') }));
          // The refusal itself is bannered by the store; this only reports the ending.
          const ended = (result: { ok: boolean }) => onPaid(result.ok);
          if (joined) {
            // What a member owes is only said, so it goes as claims; what is owed to them is
            // recorded. Two requests, each all or nothing, so each stands or falls on its own
            // (AC-27.4).
            const { claims, payments } = joinedMarkAll(card);
            if (claims.length > 0) void addClaims(card.session.id, withIds(claims), ended);
            if (payments.length > 0) void addPayments(card.session.id, withIds(payments), ended);
          } else {
            addPayments(card.session.id, withIds(openLinePayments(card)), ended);
          }
        }}
      />
    </div>
  );
}
