import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlreadySettledDialog } from '../components/collection/AlreadySettledDialog';
import { CollectionCard } from '../components/collection/CollectionCard';
import { DirectionLabel } from '../components/collection/DirectionLabel';
import type { FailedPayment } from '../components/collection/LineRow';
import { ProfileBanner } from '../components/profile/ProfileBanner';
import { Button } from '../components/shared/Button';
import { EmptyState } from '../components/shared/EmptyState';
import { useProfile } from '../context/ProfileContext';
import { useSessionsStore } from '../context/SessionsStoreContext';
import {
  announcesSettled,
  buildCollection,
  formatCents,
  pairPaymentIds,
  type CollectionCard as Card,
} from '../lib/collection';
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
};

/**
 * Who has paid and who hasn't, for finished sessions only. Sessions Hati can't
 * place come first, so they get set up; then what is still outstanding, with
 * its totals; then what is settled, collapsed out of the way.
 */
export function CollectionPage({ openSessionId, canAsk, previewSettled = false }: Props) {
  const { sessions, settleSessions, isPaying } = useSessionsStore();
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
  const [settledOpen, setSettledOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const settledToggle = useRef<HTMLButtonElement>(null);

  // Landing from Finish: once the profile has placed the session, open the
  // Settled section if that is where it landed, then scroll to its card.
  const [landing, setLanding] = useState(openSessionId !== undefined);
  useEffect(() => {
    if (!landing || profile.status !== 'ready') return;
    if (!settledOpen && collection.settled.some((c) => c.session.id === openSessionId)) {
      setSettledOpen(true);
      return;
    }
    document.getElementById(`collection-${openSessionId}`)?.scrollIntoView({ block: 'start' });
    setLanding(false);
  }, [collection, landing, openSessionId, profile.status, settledOpen]);

  // Confirming a Needs setup card moves it to another section, possibly far down
  // the page or into the collapsed Settled section. Once it has moved, bring the
  // user to it and outline it briefly, so the card doesn't just vanish.
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
    if (card.bucket === 'settled' && !settledOpen) {
      setSettledOpen(true);
      return;
    }
    placing.current = null;
    document.getElementById(`collection-${id}`)?.scrollIntoView({ block: 'start' });
    setPlacedId(id);
  }, [cards, settledOpen]);
  useEffect(() => {
    if (placedId === null) return;
    const timer = setTimeout(() => setPlacedId(null), 1600);
    return () => clearTimeout(timer);
  }, [placedId]);

  // A payment that settles a session moves its card, and the focus with it, so
  // the move is announced and focus lands on the Settled toggle (AC-11.2). That
  // happens only once the server has confirmed the payment and the card really is
  // in Settled: the optimistic move alone says nothing, since a refused payment
  // puts the card back and an announcement could not be taken back. A second
  // payment on the session still in flight is part of that optimistic move, so
  // the announcement waits for the last one to end, which reports in its turn.
  const [confirmedPaid, setConfirmedPaid] = useState<string | null>(null);
  useEffect(() => {
    if (confirmedPaid === null) return;
    setConfirmedPaid(null);
    if (!announcesSettled(isPaying(confirmedPaid), cards.get(confirmedPaid)?.bucket)) return;
    setAnnouncement('Session fully settled. Moved to Settled.');
    requestAnimationFrame(() => settledToggle.current?.focus());
  }, [confirmedPaid, cards, isPaying]);
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

  if (profile.status === 'loading') {
    return (
      <div className={appStyles.loading} role="status">
        <span className={appStyles.spinner} aria-hidden="true" />
        Loading…
      </div>
    );
  }

  // Guessing without the profile would put every matched session under Needs
  // setup, so nothing is shown until it loads (A6).
  if (profile.status === 'error') {
    return (
      <div className={styles.loadError} role="alert">
        <p>Couldn&apos;t load your profile.</p>
        <Button onClick={profile.reload}>Try again</Button>
      </div>
    );
  }

  const { needsSetup, outstanding, settled } = collection;
  const askOpen =
    canAsk &&
    profile.status === 'ready' &&
    (previewSettled ? !previewDone : !profile.alreadySettledAnswered) &&
    collection.alreadySettledOffers.length > 0;
  // Marks sessions as already settled, then announces and moves focus only for
  // the ones that really ended up Settled once the server answered. A mark that
  // failed puts its card back, and one another device only part paid stays where
  // it is, so neither is announced (the optimistic move alone says nothing).
  const markSettled = async (ids: string[]) => {
    setAnnouncement('');
    const { settled: done } = await settleSessions(ids);
    if (done.length > 0) {
      setAnnouncement(
        done.length === 1
          ? 'Session fully settled. Moved to Settled.'
          : `${done.length} sessions moved to Settled.`,
      );
      requestAnimationFrame(() => settledToggle.current?.focus());
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
  const total = needsSetup.length + outstanding.length + settled.length;

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
      />
    );
  };

  return (
    <>
      {total === 0 ? (
        <EmptyState
          title="Nothing to collect yet"
          description="Finish a session and it will show up here."
        />
      ) : (
        <>
          {profile.displayName === null && <ProfileBanner />}

          <section>
            <h2 className={homeStyles.heading}>Summary</h2>
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
            <section className={styles.section}>
              <h2 className={homeStyles.heading}>{`Needs setup (${needsSetup.length})`}</h2>
              <div className={homeStyles.list}>{needsSetup.map(renderCard)}</div>
            </section>
          )}

          {(outstanding.length > 0 || settled.length > 0) && (
            <section className={styles.section}>
              <h2 className={homeStyles.heading}>{`Outstanding (${outstanding.length})`}</h2>
              {outstanding.length > 0 ? (
                <div className={homeStyles.list}>{outstanding.map(renderCard)}</div>
              ) : (
                <p className={styles.quiet}>Nothing outstanding. Everything is settled.</p>
              )}
            </section>
          )}

          {settled.length > 0 && (
            <section className={styles.section}>
              <h2 className={`${homeStyles.heading} ${styles.settledHeading}`}>
                <button
                  ref={settledToggle}
                  type="button"
                  className={styles.settledToggle}
                  aria-expanded={settledOpen}
                  aria-controls="collection-settled"
                  onClick={() => setSettledOpen((v) => !v)}
                >
                  {`Settled (${settled.length})`}
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    focusable="false"
                    className={`${styles.chevron} ${settledOpen ? styles.chevronOpen : ''}`}
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
                </button>
              </h2>
              {settledOpen && (
                <div id="collection-settled" className={homeStyles.list}>
                  {settled.map(renderCard)}
                </div>
              )}
            </section>
          )}
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
