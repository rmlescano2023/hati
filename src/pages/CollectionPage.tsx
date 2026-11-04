import { useEffect, useMemo, useRef, useState } from 'react';
import { CollectionCard } from '../components/collection/CollectionCard';
import type { FailedPayment } from '../components/collection/LineRow';
import { ProfileBanner } from '../components/profile/ProfileBanner';
import { Button } from '../components/shared/Button';
import { EmptyState } from '../components/shared/EmptyState';
import { useProfile } from '../context/ProfileContext';
import { useSessionsStore } from '../context/SessionsStoreContext';
import {
  buildCollection,
  formatCents,
  type Bucket,
  type CollectionCard as Card,
} from '../lib/collection';
import appStyles from '../App.module.css';
import homeStyles from './HomePage.module.css';
import styles from './CollectionPage.module.css';

type Props = {
  /** The session just finished, landed on open (AC-4.9). */
  openSessionId?: string;
  onEditProfile: () => void;
};

/**
 * Who has paid and who hasn't, for finished sessions only. Sessions Hati can't
 * place come first, so they get set up; then what is still outstanding, with
 * its totals; then what is settled, collapsed out of the way.
 */
export function CollectionPage({ openSessionId, onEditProfile }: Props) {
  const { sessions } = useSessionsStore();
  const profile = useProfile();
  const collection = useMemo(
    () => buildCollection(sessions, profile.displayName),
    [sessions, profile.displayName],
  );

  const [open, setOpen] = useState<Set<string>>(
    () => new Set(openSessionId !== undefined ? [openSessionId] : []),
  );
  // Keyed by session and line, so a failed form survives its card moving
  // between sections as the figures revert.
  const [failed, setFailed] = useState(new Map<string, FailedPayment>());
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

  // A payment that settles a session moves its card, and the focus with it, so
  // the move is announced and focus lands on the Settled toggle (AC-11.2).
  const lastPaid = useRef<string | null>(null);
  const buckets = useRef(new Map<string, Bucket>());
  useEffect(() => {
    const next = new Map<string, Bucket>();
    for (const c of [...collection.needsSetup, ...collection.outstanding, ...collection.settled]) {
      next.set(c.session.id, c.bucket);
    }
    const id = lastPaid.current;
    if (id !== null && buckets.current.get(id) === 'outstanding' && next.get(id) === 'settled') {
      setAnnouncement('Session fully settled. Moved to Settled.');
      settledToggle.current?.focus();
    }
    buckets.current = next;
  }, [collection]);

  const youLine = (
    <div className={styles.you}>
      {profile.displayName !== null ? (
        <>
          <span>
            You: <strong>{profile.displayName}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <Button variant="ghost" size="sm" aria-label="Edit your name" onClick={onEditProfile}>
            Edit
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" onClick={onEditProfile}>
          Add your name
        </Button>
      )}
    </div>
  );

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
  const total = needsSetup.length + outstanding.length + settled.length;

  const renderCard = (card: Card) => {
    const id = card.session.id;
    return (
      <CollectionCard
        key={id}
        card={card}
        expanded={open.has(id)}
        onToggle={() =>
          setOpen((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        failed={(lineKey) => {
          const entry = failed.get(`${id}|${lineKey}`);
          // A payment that landed after all, shown by a reload, is no longer a
          // failure, so its form doesn't reopen to be recorded again.
          return entry && !card.session.payments.some((p) => p.id === entry.id) ? entry : undefined;
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
        onPaid={() => {
          lastPaid.current = id;
        }}
      />
    );
  };

  return (
    <>
      <div className={styles.top}>
        {youLine}
        {profile.saveError !== null && (
          <p role="alert" className={styles.alert}>
            {profile.saveError}
          </p>
        )}
      </div>

      {total === 0 ? (
        <EmptyState
          title="Nothing to collect yet"
          description="Finish a session and it will show up here."
        />
      ) : (
        <>
          {profile.displayName === null && <ProfileBanner />}

          <div className={styles.strip}>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>Owed to you</span>
              <span className={styles.tileAmount}>{formatCents(collection.owedToYouCents)}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>You owe</span>
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

      <p role="status" className={styles.srOnly}>
        {announcement}
      </p>
    </>
  );
}
