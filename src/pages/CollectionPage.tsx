import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlreadySettledDialog } from '../components/collection/AlreadySettledDialog';
import { CollectionCard } from '../components/collection/CollectionCard';
import { DirectionLabel } from '../components/collection/DirectionLabel';
import type { FailedPayment } from '../components/collection/LineRow';
import { ProfileBanner } from '../components/profile/ProfileBanner';
import { Button } from '../components/shared/Button';
import { EmptyState } from '../components/shared/EmptyState';
import { HelpIcon } from '../components/shared/icons';
import { useProfile } from '../context/ProfileContext';
import { useSessionsStore } from '../context/SessionsStoreContext';
import {
  announcesSettled,
  autoOpenTarget,
  buildCollection,
  formatCents,
  pairPaymentIds,
  type CollectionCard as Card,
} from '../lib/collection';
import { movedManyLine, movedToHistoryLine } from '../lib/joinedSessions';
import { sessionDisplayTitle } from '../lib/sessionLabel';
import { showsEmptyState } from '../lib/writeQueue';
import appStyles from '../App.module.css';
import homeStyles from './HomePage.module.css';
import styles from './CollectionPage.module.css';

type Props = {
  /** The session just finished, landed on open (AC-4.9). */
  openSessionId?: string;
  /** Whether a one-time question may open: not over the tour, What's new or another dialog. */
  canAsk: boolean;
  /** Dev-only: ask "Already settled?" even if it was answered, and store no answer. */
  previewSettled?: boolean;
  /** Starts the Collection guide. "Need help?" shows only while this is given (AC-TG8.1). */
  onHelp?: () => void;
  /**
   * Told whether the once-only guide offer may open: the profile has loaded, and "Already settled?"
   * is neither due nor asked this visit (BR-TG8, BR-TG9). False again on unmount.
   */
  onOfferClear?: (clear: boolean) => void;
  /**
   * Open the first card with a claim waiting for this account when the page is reached. Off by
   * default, so a guide never opens one; a page reached for a particular session (Finish, a join)
   * opens that one instead.
   */
  autoOpen?: boolean;
  /**
   * How the page was reached for `openSessionId`: finishing a session, joining one, or "Open in
   * Collection". Only an arrival may redirect a card that is already in History to its detail page;
   * every way back from the detail page passes none, so it can't bounce the reader (BR-A2).
   */
  arrival?: 'finish' | 'join' | 'open';
  /** Opens a card's detail page, from "View details". Absent in a guide, which has none. */
  onViewDetails?: (sessionId: string) => void;
  /** Opens a session's detail page from the move notice. Absent in a guide. */
  onOpenInHistory?: (sessionId: string) => void;
  /** Called when an arrival lands on a card that is already in History, to show its detail page. */
  onArriveSettled?: (sessionId: string) => void;
  /** Fetches the invite link for an organizer's export from a card. */
  inviteUrlFor?: (sessionId: string) => Promise<string | null>;
};

/**
 * Who has paid and who hasn't, for finished sessions that still have something left for this
 * viewer. Sessions Hati can't place come first, so they get set up; then what is still outstanding,
 * with its totals. A session whose lines are all paid is in History, not here.
 */
export function CollectionPage({
  openSessionId,
  canAsk,
  previewSettled = false,
  onHelp,
  onOfferClear,
  autoOpen = false,
  arrival,
  onViewDetails,
  onOpenInHistory,
  onArriveSettled,
  inviteUrlFor,
}: Props) {
  const { sessions, settleSessions, isPaying, sync } = useSessionsStore();
  const profile = useProfile();
  const collection = useMemo(
    () =>
      buildCollection(sessions, { displayName: profile.displayName, nicknames: profile.nicknames }),
    [sessions, profile.displayName, profile.nicknames],
  );

  // One card at a time: opening one closes the other, so the page never grows
  // into several long bodies on a phone (owner, round 2).
  const [openId, setOpenId] = useState<string | null>(openSessionId ?? null);
  const toggled = useRef(false);
  // Closing a long card above the one just opened moves the opened card up the
  // page, possibly out of view, and Safari has no scroll anchoring to correct
  // it. Only after a tap, so the landing scroll and re-sorts are left alone.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    if (openId === null) return;
    const el = document.getElementById(`collection-${openId}`);
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  }, [openId]);
  // Keyed by session and line, so a failed form survives its card moving
  // between sections as the figures revert.
  const [failed, setFailed] = useState(new Map<string, FailedPayment>());

  const cards = useMemo(
    () =>
      new Map(
        [...collection.needsSetup, ...collection.outstanding, ...collection.settled].map((c) => [
          c.session.id,
          c,
        ]),
      ),
    [collection],
  );
  /**
   * Whether a failed payment still describes its line: the line is still
   * there and has the payments it was refused against. A later payment, Mark
   * all, an undo, or the refused payment turning out to have landed after
   * all, each changes them, and the refusal then goes.
   */
  const isLive = useCallback(
    (key: string, entry: FailedPayment) => {
      const cut = key.indexOf('|');
      const card = cards.get(key.slice(0, cut));
      const line =
        card && [...card.owedToYou, ...card.youOwe].find((l) => l.key === key.slice(cut + 1));
      return (
        line !== undefined &&
        pairPaymentIds(line.payments, line.debtor, line.creditor) === entry.against
      );
    },
    [cards],
  );

  // Dead ones are dropped from the page's state as well as from the screen,
  // wherever their card is, open, collapsed or in a closed Settled section.
  useEffect(() => {
    setFailed((current) => {
      const next = new Map([...current].filter(([key, entry]) => isLive(key, entry)));
      return next.size === current.size ? current : next;
    });
  }, [isLive]);
  const [announcement, setAnnouncement] = useState('');
  /** A card the viewer's own action just moved to History, said at the top of Outstanding (US-H8). */
  const [moved, setMoved] = useState<{ id: string; title: string } | { count: number } | null>(
    null,
  );
  // The cards each section held on the previous render, so the move can tell where a card was and
  // what is now at that place. Updated last in the render's effects, after the ones that read it.
  const lastLists = useRef({ needsSetup: [] as string[], outstanding: [] as string[] });
  const latestLists = useRef(lastLists.current);
  latestLists.current = {
    needsSetup: collection.needsSetup.map((c) => c.session.id),
    outstanding: collection.outstanding.map((c) => c.session.id),
  };
  /**
   * Says that sessions moved to History, and brings focus to what is now where the first one was:
   * the next card in its section, or the Outstanding heading when there is none (AC-H8.4). `before`
   * is the sections as they were.
   */
  const titleOf = (id: string) => {
    const session = sessions.find((x) => x.id === id);
    return session ? sessionDisplayTitle(session) : 'This session';
  };
  const announceMove = (ids: string[], before: { needsSetup: string[]; outstanding: string[] }) => {
    if (ids.length === 0) return;
    const title = ids.length === 1 ? titleOf(ids[0]) : '';
    setAnnouncement(ids.length === 1 ? movedToHistoryLine(title) : movedManyLine(ids.length));
    setMoved(ids.length === 1 ? { id: ids[0], title } : { count: ids.length });
    const section = before.needsSetup.includes(ids[0]) ? 'needsSetup' : 'outstanding';
    const index = before[section].indexOf(ids[0]);
    requestAnimationFrame(() => {
      const next = latestLists.current[section][index];
      const target = next
        ? document.querySelector<HTMLElement>(`#collection-${next} [aria-expanded]`)
        : document.getElementById('collection-outstanding-heading');
      target?.focus();
    });
  };

  // Landing from Finish, a join, or on the first card with a claim waiting: once the profile has
  // placed the session, scroll to its card. A card that is already in History has no place here, so
  // an arrival hands it to the detail page instead (BR-A1); no arrival means no redirect, so a way
  // back from the detail page can't bounce the reader.
  const [landingId, setLandingId] = useState<string | null>(openSessionId ?? null);
  useEffect(() => {
    if (landingId === null || profile.status !== 'ready') return;
    if (collection.settled.some((c) => c.session.id === landingId)) {
      if (arrival !== undefined) onArriveSettled?.(landingId);
      setLandingId(null);
      return;
    }
    document.getElementById(`collection-${landingId}`)?.scrollIntoView({ block: 'start' });
    setLandingId(null);
  }, [arrival, collection, landingId, onArriveSettled, profile.status]);

  // Arriving opens the first card with a claim waiting, once, when the profile has placed them. A
  // claim that arrives while the page is already open changes the badge and the count, and opens
  // nothing: only an arrival does (round 3).
  const autoOpened = useRef(false);
  useEffect(() => {
    if (autoOpened.current || profile.status !== 'ready') return;
    autoOpened.current = true;
    const id = autoOpenTarget(collection, { openSessionId, autoOpen });
    if (id === null) return;
    setOpenId(id);
    setLandingId(id);
  }, [autoOpen, collection, openSessionId, profile.status]);

  // Confirming a Needs setup card moves it to another section, possibly far down the page, or to
  // History. Once it has moved, bring the user to it and outline it briefly, or say it moved to
  // History, so the card doesn't just vanish.
  const placing = useRef<string | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  useEffect(() => {
    const id = placing.current;
    if (id === null) return;
    const card = cards.get(id);
    // Still unplaced (or gone) once the pick has landed: nothing moved, so
    // there's nowhere to bring the user.
    if (!card || card.bucket === 'needsSetup') {
      placing.current = null;
      return;
    }
    placing.current = null;
    if (card.bucket === 'settled') {
      announceMove([id], lastLists.current);
      return;
    }
    document.getElementById(`collection-${id}`)?.scrollIntoView({ block: 'start' });
    setPlacedId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announceMove reads the latest render's lists through refs.
  }, [cards]);
  useEffect(() => {
    if (placedId === null) return;
    const timer = setTimeout(() => setPlacedId(null), 1600);
    return () => clearTimeout(timer);
  }, [placedId]);

  // A payment that settles a session moves its card to History, so the move is announced and focus
  // goes to the next card. That happens only once the server has confirmed the payment and the card
  // really is settled: the optimistic move alone says nothing, since a refused payment puts the
  // card back and an announcement could not be taken back. A second payment on the session still in
  // flight is part of that optimistic move, so the announcement waits for the last one to end,
  // which reports in its turn.
  const [confirmedPaid, setConfirmedPaid] = useState<string | null>(null);
  useEffect(() => {
    if (confirmedPaid === null) return;
    setConfirmedPaid(null);
    if (!announcesSettled(isPaying(confirmedPaid), cards.get(confirmedPaid)?.bucket)) return;
    announceMove([confirmedPaid], lastLists.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- announceMove reads the latest render's lists through refs.
  }, [confirmedPaid, cards, isPaying]);
  // Last, so the effects above read the sections as they were before this render.
  useEffect(() => {
    lastLists.current = latestLists.current;
  });
  // How a payment ended. The live region is emptied first, so a refusal leaves
  // nothing in it and a second identical announcement is read again. A refused
  // payment puts its card or line back, and focus goes to the card's header
  // unless a form already took it, rather than being lost with the button.
  const paymentEnded = (id: string, ok: boolean) => {
    setAnnouncement('');
    if (ok) {
      setConfirmedPaid(id);
      return;
    }
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      document.querySelector<HTMLElement>(`#collection-${id} [aria-expanded]`)?.focus();
    });
  };

  // The one-time "Already settled?" question. It's asked about the sessions
  // finished before Collection, live, so the count is true when it opens.
  const [previewDone, setPreviewDone] = useState(false);
  const settledDue =
    profile.status === 'ready' &&
    (previewSettled ? !previewDone : !profile.alreadySettledAnswered) &&
    collection.alreadySettledOffers.length > 0;
  // A page mount is one visit, so this remembers that the question showed on it. The guide offer
  // then waits for the next visit rather than opening the moment the question is answered.
  const [asked, setAsked] = useState(false);
  if (canAsk && settledDue && !asked) setAsked(true);
  const offerClear = profile.status === 'ready' && !settledDue && !asked;
  useEffect(() => {
    onOfferClear?.(offerClear);
  }, [onOfferClear, offerClear]);
  useEffect(() => () => onOfferClear?.(false), [onOfferClear]);

  if (profile.status === 'loading') {
    return (
      <div className={appStyles.loading} role="status">
        <span className={appStyles.spinner} aria-hidden="true" />
        Loading…
      </div>
    );
  }

  // Beside the page's first heading, as on Expenses (OQ-TG2). The accessible name contains the
  // visible text, so a voice user saying "click Need help" finds it.
  const help = onHelp && (
    <button
      type="button"
      id="collection-help"
      className={styles.help}
      aria-label="Need help? See how to track payments"
      onClick={onHelp}
    >
      Need help?
      <HelpIcon className={styles.helpIcon} />
    </button>
  );

  // Guessing without the profile would put every matched session under Needs
  // setup, so nothing is shown until it loads (A6).
  if (profile.status === 'error') {
    return (
      <>
        <div className={styles.helpRow}>{help}</div>
        <div className={styles.loadError} role="alert">
          <p>Couldn&apos;t load your profile.</p>
          <Button onClick={profile.reload}>Try again</Button>
        </div>
      </>
    );
  }

  const { needsSetup, outstanding, settled } = collection;
  const askOpen = canAsk && settledDue;
  // Marks sessions as already settled, then says they moved to History and brings focus on, only
  // for the ones that really ended up settled once the server answered. A mark that failed puts its
  // card back, and one another device only part paid stays where it is, so neither is announced
  // (the optimistic move alone says nothing).
  const markSettled = async (ids: string[]) => {
    setAnnouncement('');
    const before = {
      needsSetup: needsSetup.map((c) => c.session.id),
      outstanding: outstanding.map((c) => c.session.id),
    };
    const { settled: done } = await settleSessions(ids);
    if (done.length > 0) {
      announceMove(done, before);
    } else if (ids.length === 1) {
      // The card came back, so focus goes to it rather than being lost with the
      // button it was on.
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`#collection-${ids[0]} [aria-expanded]`)?.focus(),
      );
    }
  };
  const answerAlreadySettled = ({ settle }: { settle: string[] }) => {
    // Stored whatever the answer, so it isn't asked again (BR-S14). A preview
    // stores nothing, and its "Yes" or "Mark" still records real payments.
    if (previewSettled) setPreviewDone(true);
    else profile.answerAlreadySettled();
    if (settle.length > 0) void markSettled(settle);
  };
  // Only what still has something left is a card here; settled sessions are in History.
  const total = needsSetup.length + outstanding.length;

  const renderCard = (card: Card) => {
    const id = card.session.id;
    return (
      <CollectionCard
        key={id}
        card={card}
        expanded={openId === id}
        onToggle={() => {
          toggled.current = true;
          setOpenId((current) => (current === id ? null : id));
        }}
        failed={(lineKey) => {
          const key = `${id}|${lineKey}`;
          const entry = failed.get(key);
          // Checked here too, so a dead one never shows for the render
          // before the effect above drops it.
          return entry && isLive(key, entry) ? entry : undefined;
        }}
        onFailed={(lineKey, entry) =>
          setFailed((current) => {
            const key = `${id}|${lineKey}`;
            if (entry === null && !current.has(key)) return current;
            const next = new Map(current);
            if (entry === null) next.delete(key);
            else next.set(key, entry);
            return next;
          })
        }
        onPaid={(ok) => paymentEnded(id, ok)}
        onAlreadySettled={() => void markSettled([id])}
        onPlaced={() => {
          placing.current = id;
        }}
        placed={placedId === id}
        onLeft={(title) => setAnnouncement(`Stopped tracking ${title}.`)}
        onAnnounce={setAnnouncement}
        onViewDetails={onViewDetails}
        inviteUrlFor={inviteUrlFor}
      />
    );
  };

  return (
    <>
      {total === 0 ? (
        <>
          <div className={styles.helpRow}>{help}</div>
          {/* After a failed load the banner speaks instead of an empty state. */}
          {showsEmptyState(sync.loaded, total) &&
            (settled.length > 0 ? (
              <EmptyState
                title="All settled"
                description="Everything is paid. Settled sessions are in History."
              />
            ) : (
              <EmptyState
                title="Nothing to collect yet"
                description="Finish a session and it will show up here."
              />
            ))}
        </>
      ) : (
        <>
          {profile.displayName === null && <ProfileBanner />}

          <section data-tour="collection-totals">
            <div className={styles.headRow}>
              <h2 className={homeStyles.heading}>Summary</h2>
              {help}
            </div>
            <div className={styles.strip}>
              <div className={styles.tile}>
                <DirectionLabel direction="owedToYou" hint className={styles.tileLabel} />
                <span className={styles.tileAmount}>{formatCents(collection.owedToYouCents)}</span>
              </div>
              <div className={styles.tile}>
                <DirectionLabel direction="youOwe" hint className={styles.tileLabel} />
                <span className={styles.tileAmount}>{formatCents(collection.youOweCents)}</span>
              </div>
            </div>
            {needsSetup.length > 0 && (
              <p className={styles.stripNote}>
                {needsSetup.length === 1
                  ? 'Not counting 1 session that needs setup'
                  : `Not counting ${needsSetup.length} sessions that need setup`}
              </p>
            )}
          </section>

          {needsSetup.length > 0 && (
            <section className={styles.section} data-tour="collection-unsettled">
              <h2 className={homeStyles.heading}>{`Needs setup (${needsSetup.length})`}</h2>
              <div className={homeStyles.list}>{needsSetup.map(renderCard)}</div>
            </section>
          )}

          <section className={styles.section}>
            <h2
              id="collection-outstanding-heading"
              tabIndex={-1}
              className={homeStyles.heading}
            >{`Outstanding (${outstanding.length})`}</h2>
            {moved !== null && onOpenInHistory && (
              <div className={styles.moved}>
                {'id' in moved ? (
                  <>
                    <p>{movedToHistoryLine(moved.title)}</p>
                    <Button
                      size="sm"
                      aria-label={`Open ${moved.title} in History`}
                      onClick={() => onOpenInHistory(moved.id)}
                    >
                      Open
                    </Button>
                  </>
                ) : (
                  <p>{movedManyLine(moved.count)}</p>
                )}
              </div>
            )}
            {outstanding.length > 0 ? (
              <div className={homeStyles.list} data-tour="collection-outstanding">
                {outstanding.map(renderCard)}
              </div>
            ) : (
              <p className={styles.quiet} data-tour="collection-done">
                Nothing outstanding. Sessions that are paid in full are in History.
              </p>
            )}
          </section>
        </>
      )}

      {askOpen && (
        <AlreadySettledDialog
          offers={collection.alreadySettledOffers}
          onAnswer={answerAlreadySettled}
        />
      )}

      <p role="status" className={styles.srOnly}>
        {announcement}
      </p>
    </>
  );
}
