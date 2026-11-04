import { useId, useState } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import {
  formatCents,
  markAllMessage,
  openLinePayments,
  type CollectionCard as Card,
  type CollectionLine,
} from '../../lib/collection';
import { formatLocalDate } from '../../lib/format';
import { createId } from '../../lib/id';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import { ChangeMeDialog } from './ChangeMeDialog';
import { LineRow, type FailedPayment } from './LineRow';
import { MePicker, offersRemember } from './MePicker';
import styles from './CollectionCard.module.css';

type Props = {
  card: Card;
  expanded: boolean;
  onToggle: () => void;
  /** Failed payments by line key, for this card's lines. */
  failed: (lineKey: string) => FailedPayment | undefined;
  onFailed: (lineKey: string, failed: FailedPayment | null) => void;
  /** Called as a payment is recorded here, so the page can announce the session settling. */
  onPaid: () => void;
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

/** The part of the summary after the dates, which depends on the section. */
function summaryDetail(card: Card): string[] {
  const { owedToYou, youOwe } = card;
  if (card.bucket === 'needsSetup') return [];
  if (card.bucket === 'outstanding') {
    return [
      `${card.settledLineCount} of ${card.lineCount} settled`,
      [
        owedToYou.length > 0 && `Owed to you ${formatCents(card.owedToYouRemainingCents)}`,
        youOwe.length > 0 && `You owe ${formatCents(card.youOweRemainingCents)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ];
  }
  if (card.me.kind === 'notInSession') return ["You're not in this session"];
  if (card.lineCount === 0) return ["Nothing to collect. You're even with everyone."];
  return [
    `Settled ${formatLocalDate(card.settledAt)}`,
    [
      owedToYou.length > 0 && `Received ${formatCents(card.receivedCents)}`,
      youOwe.length > 0 && `Paid ${formatCents(card.paidOutCents)}`,
    ]
      .filter(Boolean)
      .join(' · '),
  ];
}

/**
 * One finished session on Collection. A Needs setup card expands to the
 * question of who the user is and nothing else; the others summarise what is
 * left or what was settled, and expand to the lines themselves. Every card
 * starts collapsed, so a few unplaced sessions don't push the rest of the page
 * out of sight on a phone. A settled card with no lines has nothing to expand,
 * so it has no toggle. There is deliberately no delete here (AC-13.5):
 * deleting a session belongs to History.
 */
export function CollectionCard({ card, expanded, onToggle, failed, onFailed, onPaid }: Props) {
  const { session } = card;
  const title = sessionDisplayTitle(session);
  const finished = `Finished ${formatLocalDate(session.closedAt ?? session.createdAt)}`;
  const bodyId = useId();
  const setup = card.bucket === 'needsSetup';
  const expandable = setup || card.lineCount > 0;

  const summary = (
    <span className={styles.titles}>
      <span className={styles.title}>{title}</span>
      <span className={styles.meta}>{finished}</span>
      {summaryDetail(card)
        .filter((part) => part !== '')
        .map((part) => (
          <span key={part} className={styles.detail}>
            {part}
          </span>
        ))}
    </span>
  );

  const groups: { heading: string; lines: CollectionLine[] }[] = [
    { heading: 'Owed to you', lines: card.owedToYou },
    { heading: 'You owe', lines: card.youOwe },
  ];

  return (
    <article id={`collection-${session.id}`} className={styles.card}>
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

      {!setup && <YouAre card={card} title={title} />}

      {expandable && expanded && setup && (
        <div id={bodyId} className={styles.body}>
          <NeedsSetup card={card} />
        </div>
      )}

      {expandable && expanded && !setup && (
        <div id={bodyId} className={styles.body}>
          {groups
            .filter((g) => g.lines.length > 0)
            .map((group) => (
              <section key={group.heading} className={styles.group}>
                <h4 className={styles.groupHeading}>{group.heading}</h4>
                {group.lines.map((line) => (
                  <LineRow
                    key={line.key}
                    sessionId={session.id}
                    line={line}
                    failed={failed(line.key)}
                    onFailed={(f) => onFailed(line.key, f)}
                    onPaid={onPaid}
                  />
                ))}
              </section>
            ))}
          {card.bucket === 'outstanding' && <MarkAll card={card} title={title} onPaid={onPaid} />}
        </div>
      )}
    </article>
  );
}

/** "You are Renmar · Change", visible collapsed too, so a wrong match is easy to spot (AC-5.4). */
function YouAre({ card, title }: { card: Card; title: string }) {
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
        <ChangeMeDialog session={card.session} me={card.me} onClose={() => setChanging(false)} />
      )}
    </div>
  );
}

/** Asks who the user is in a session Hati couldn't place (US-5). */
function NeedsSetup({ card }: { card: Card }) {
  const { setMe } = useSessionsStore();
  const profile = useProfile();
  const [choice, setChoice] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);

  return (
    <div className={styles.setup}>
      <MePicker
        legend="Which one are you?"
        members={card.session.members}
        value={choice}
        onChange={setChoice}
        remember={remember}
        onRememberChange={setRemember}
      />
      <div>
        <Button
          variant="primary"
          disabled={choice === null}
          onClick={() => {
            if (choice === null) return;
            setMe(card.session.id, choice);
            if (remember && offersRemember(profile, choice)) void profile.save(choice);
          }}
        >
          Confirm
        </Button>
      </div>
    </div>
  );
}

/**
 * Records what is left on every open line at once, one payment per line, all
 * or nothing (US-8b). It confirms first, because one tap can write many
 * payments; each can still be undone on its own.
 */
function MarkAll({ card, title, onPaid }: { card: Card; title: string; onPaid: () => void }) {
  const { addPayments } = useSessionsStore();
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={styles.markAll}>
      <Button aria-label={`Mark all as paid in ${title}`} onClick={() => setConfirming(true)}>
        Mark all as paid
      </Button>
      <ConfirmDialog
        open={confirming}
        title="Mark everything as paid?"
        message={confirming ? markAllMessage(card) : ''}
        confirmLabel="Mark all as paid"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onPaid();
          addPayments(
            card.session.id,
            openLinePayments(card).map((p) => ({ ...p, id: createId('pay') })),
          );
        }}
      />
    </div>
  );
}
