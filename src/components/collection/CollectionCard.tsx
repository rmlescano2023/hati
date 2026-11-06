import { useId, useState } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import {
  formatCents,
  markAllMessage,
  openLinePayments,
  rememberOffer,
  type CollectionCard as Card,
  type CollectionLine,
} from '../../lib/collection';
import { formatLocalDate } from '../../lib/format';
import { createId } from '../../lib/id';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import { ChangeMeDialog } from './ChangeMeDialog';
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
    return [`${card.settledLineCount} of ${card.lineCount} settled`];
  }
  // The "You're not in this session · Change" line under it already says so.
  if (card.me.kind === 'notInSession') return [];
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
 * What is left on each side of an Outstanding card, coloured and with an arrow
 * like the strip and the group headings. No hints here: the strip at the top
 * of the page explains the arrows once, and they would wrap this to several
 * lines on a phone. Each side wraps as a whole, never mid-amount.
 */
function MoneySummary({ card }: { card: Card }) {
  const { owedToYou, youOwe } = card;
  return (
    <span className={styles.money}>
      {owedToYou.length > 0 && (
        <DirectionLabel direction="owedToYou">{` ${formatCents(card.owedToYouRemainingCents)}`}</DirectionLabel>
      )}
      {owedToYou.length > 0 && youOwe.length > 0 && (
        <span aria-hidden="true" className={styles.sep}>
          ·
        </span>
      )}
      {youOwe.length > 0 && (
        <DirectionLabel direction="youOwe">{` ${formatCents(card.youOweRemainingCents)}`}</DirectionLabel>
      )}
    </span>
  );
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
  // A card placed by one of the user's own names doesn't say who they are on
  // every card; it only offers "Not you? Change" (BR-N5).
  const quiet = card.me.kind === 'member' && card.me.recognised;

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
      {card.bucket === 'outstanding' && <MoneySummary card={card} />}
    </span>
  );

  const groups: { direction: CollectionLine['direction']; lines: CollectionLine[] }[] = [
    { direction: 'owedToYou', lines: card.owedToYou },
    { direction: 'youOwe', lines: card.youOwe },
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

      {/* A quiet card's line waits at the bottom of its expanded body; with no body, it stays here. */}
      {!setup && (!quiet || !expandable) && <YouAre card={card} title={title} quiet={quiet} />}

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
              <section key={group.direction} className={styles.group}>
                <h4 className={styles.groupHeading}>
                  <DirectionLabel direction={group.direction} hint="inline" />
                </h4>
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
          {quiet && <YouAre card={card} title={title} quiet />}
        </div>
      )}
    </article>
  );
}

/**
 * Who the user is in the session. Spelled out on the card for a one-off pick
 * or "not in this session"; a card placed by one of the user's own names only
 * offers "Not you? Change", once expanded, since repeating their own name on
 * every card is noise (US-N1).
 */
function YouAre({ card, title, quiet }: { card: Card; title: string; quiet: boolean }) {
  const [changing, setChanging] = useState(false);
  return (
    <div className={styles.youAre}>
      {quiet && card.me.kind === 'member' ? (
        <>
          <span>Not you?</span>
          <Button
            variant="ghost"
            size="sm"
            className="link-action"
            aria-label={`Change who you are in ${title}. Now: ${card.me.name}`}
            onClick={() => setChanging(true)}
          >
            Change
          </Button>
        </>
      ) : (
        <>
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
        </>
      )}
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
            const offer = rememberOffer(profile, choice);
            if (remember && offer !== null) void profile.remember(choice, offer);
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
