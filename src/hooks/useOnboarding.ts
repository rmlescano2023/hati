import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
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
        };
        if (cancelled) return;
        setShouldRun(body.onboardedAt === null);
        setNewDue(whatsNewDue(body.onboardedAt, body.whatsNewVersion));
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

  return { shouldRun, markSeen, whatsNewDue: newDue, markWhatsNewSeen };
}
