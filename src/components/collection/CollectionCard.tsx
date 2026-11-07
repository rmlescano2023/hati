import { useId, useState } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useProfile } from '../../context/ProfileContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import {
  formatCents,
  markAllMessage,
  nicknamePrompt,
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
  /** Called as a Needs setup card is confirmed, so the page can bring the user to where it lands. */
  onPlaced: () => void;
  /** Briefly outlined: this card has just been placed in this section. */
  placed: boolean;
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

/**
 * The part of the summary after the dates, which depends on the section. The
 * money figures show only while collapsed: expanded, every line shows its own.
 */
function summaryDetail(card: Card, expanded: boolean): string[] {
  const { owedToYou, youOwe } = card;
  if (card.bucket === 'needsSetup') return [];
  if (card.bucket === 'outstanding') {
    return [`${card.settledLineCount} of ${card.lineCount} settled`];
  }
  // Nothing to summarise: the card has no lines, and opening it says why.
  if (card.me.kind === 'notInSession') return [];
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
  onPlaced,
  placed,
}: Props) {
  const { session } = card;
  const title = sessionDisplayTitle(session);
  const finished = `Finished ${formatLocalDate(session.closedAt ?? session.createdAt)}`;
  const bodyId = useId();
  const setup = card.bucket === 'needsSetup';
  // Only a card placed automatically by the profile name says nothing about who
  // the user is; every stored pick keeps its line, since Change is the only way
  // to undo one (BR-N5, round 2).
  const quiet = card.me.kind === 'member' && !card.me.picked;
  // The line is shown inside the open card, never on a collapsed one, so a card
  // that has it but no lines still opens, to show just that.
  const hasLine = !setup && !quiet;
  const expandable = setup || card.lineCount > 0 || hasLine;

  const summary = (
    <span className={styles.titles}>
      <span className={styles.title}>{title}</span>
      <span className={styles.meta}>{finished}</span>
      {summaryDetail(card, expanded)
        .filter((part) => part !== '')
        .map((part) => (
          <span key={part} className={styles.detail}>
            {part}
          </span>
        ))}
      {card.bucket === 'outstanding' && !expanded && <MoneySummary card={card} />}
    </span>
  );

  const groups: { direction: CollectionLine['direction']; lines: CollectionLine[] }[] = [
    { direction: 'owedToYou', lines: card.owedToYou },
    { direction: 'youOwe', lines: card.youOwe },
  ];

  return (
    <article
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

      {expandable && expanded && setup && (
        <div id={bodyId} className={styles.body}>
          <NeedsSetup card={card} onPlaced={onPlaced} />
        </div>
      )}

      {expandable && expanded && !setup && (
        <div id={bodyId} className={styles.body}>
          {hasLine && <YouAre card={card} title={title} />}
          {groups
            .filter((g) => g.lines.length > 0)
            .map((group) => (
              <section key={group.direction} className={styles.group}>
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

/**
 * Who the user is in the session, spelled out for any stored pick or "not in
 * this session", since Change is the only way to undo one. It sits at the top of
 * the open card, above the lines it decides, and never on a collapsed card. A
 * card placed automatically by the profile name says nothing; a wrong match
 * there is fixed by editing the name in Profile.
 */
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
function NeedsSetup({ card, onPlaced }: { card: Card; onPlaced: () => void }) {
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
        legend={suggested !== null ? nicknamePrompt(suggested) : 'Which one are you?'}
        members={card.session.members}
        value={selected}
        onChange={setChoice}
        remember={remember}
        onRememberChange={setRemember}
      />
      <div>
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
