import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { Guide, GuideSeen } from '../lib/guideOffer';
import { whatsNewDue } from '../lib/whatsNew';

type Result = {
  /** True once we know the tour has never been finished or skipped. */
  shouldRun: boolean;
  /** Marks it seen. Finishing and skipping are the same outcome. */
  markSeen: () => void;
  /** True once we know this returning account hasn't seen the current "What's new". */
  whatsNewDue: boolean;
  /** Marks the current "What's new" seen. */
  markWhatsNewSeen: () => void;
  /** Whether each guide was started or its offer declined; null until read, and for good if the read failed (AC-TG9.8). */
  guideSeen: GuideSeen;
  /** Records that a guide started or its offer was declined, on screen at once; silent on failure (BR-TG5, BR-TG12). */
  markGuideSeen: (guide: Guide) => void;
};

const ENDPOINT = '/api/user';

/**
 * Whether to run the onboarding tour, from a real flag on the account rather
 * than something inferred like "has no sessions" — so it follows the account
 * across devices and cannot be re-triggered by clearing data.
 *
 * A failure here is deliberately quiet: not knowing whether someone has seen
 * the tour is not a reason to interrupt them, so the tour simply does not run.
 *
 * "What's new" comes from the same read, so the welcome, the tour and it can't
 * race: a new account gets the tour and never sees it, and a returning one
 * sees it once.
 */
export function useOnboarding(): Result {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [shouldRun, setShouldRun] = useState(false);
  const [newDue, setNewDue] = useState(false);
  const [guideSeen, setGuideSeen] = useState<GuideSeen>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const body = (await res.json()) as {
          onboardedAt: string | null;
          whatsNewVersion?: unknown;
          expensesGuideSeenAt?: unknown;
          collectionGuideSeenAt?: unknown;
        };
        if (cancelled) return;
        setShouldRun(body.onboardedAt === null);
        setNewDue(whatsNewDue(body.onboardedAt, body.whatsNewVersion));
        setGuideSeen({
          expenses: body.expensesGuideSeenAt != null,
          collection: body.collectionGuideSeenAt != null,
        });
      } catch (err) {
        // Not knowing whether someone has seen the tour is no reason to
        // interrupt them, so the tour stays off — but say so in development,
        // because a silent failure here looks identical to a broken tour.
        if (import.meta.env.DEV) console.warn('onboarding: could not read user state', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const markSeen = useCallback(() => {
    // Hide it immediately; the request is bookkeeping for the next sign-in.
    setShouldRun(false);
    // The server stamps What's new with it, so a new account never sees it.
    setNewDue(false);
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await fetch(ENDPOINT, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        // Worst case it runs once more next time.
        if (import.meta.env.DEV) console.warn('onboarding: could not save user state', err);
      }
    })();
  }, [getToken]);

  const markWhatsNewSeen = useCallback(() => {
    setNewDue(false);
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await fetch(ENDPOINT, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark: 'whatsNew' }),
        });
      } catch (err) {
        // Worst case it shows once more.
        if (import.meta.env.DEV) console.warn("onboarding: could not save what's new", err);
      }
    })();
  }, [getToken]);

  const markGuideSeen = useCallback(
    (guide: Guide) => {
      // Already known to be set: the column keeps its first time anyway, so a replay from
      // "Need help?" costs no write.
      if (guideSeen?.[guide]) return;
      // Shown at once, so the offer can't reopen while the request is on its way.
      setGuideSeen((s) => (s === null ? s : { ...s, [guide]: true }));
      void (async () => {
        try {
          const token = await getToken();
          if (!token) return;
          await fetch(ENDPOINT, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mark: guide === 'expenses' ? 'expensesGuide' : 'collectionGuide',
            }),
          });
        } catch (err) {
          // Worst case the offer shows once more.
          if (import.meta.env.DEV) console.warn('onboarding: could not save the guide mark', err);
        }
      })();
    },
    [getToken, guideSeen],
  );

  return { shouldRun, markSeen, whatsNewDue: newDue, markWhatsNewSeen, guideSeen, markGuideSeen };
}
