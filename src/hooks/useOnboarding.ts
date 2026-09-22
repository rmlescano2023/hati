import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-react';

type Result = {
  /** True once we know the tour has never been finished or skipped. */
  shouldRun: boolean;
  /** Marks it seen. Finishing and skipping are the same outcome. */
  markSeen: () => void;
};

const ENDPOINT = '/api/user';

/**
 * Whether to run the onboarding tour, from a real flag on the account rather
 * than something inferred like "has no sessions" — so it follows the account
 * across devices and cannot be re-triggered by clearing data.
 *
 * A failure here is deliberately quiet: not knowing whether someone has seen
 * the tour is not a reason to interrupt them, so the tour simply does not run.
 */
export function useOnboarding(): Result {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [shouldRun, setShouldRun] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(ENDPOINT, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const body = (await res.json()) as { onboardedAt: string | null };
        if (!cancelled) setShouldRun(body.onboardedAt === null);
      } catch {
        // Quietly leave the tour off.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const markSeen = useCallback(() => {
    // Hide it immediately; the request is bookkeeping for the next sign-in.
    setShouldRun(false);
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        await fetch(ENDPOINT, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Worst case it runs once more next time.
      }
    })();
  }, [getToken]);

  return { shouldRun, markSeen };
}
