import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@clerk/clerk-react';
import { WRITE_TIMEOUT_MS, authorisedFetch, withDeadline } from '../lib/writeQueue';

type ProfileValue = {
  status: 'loading' | 'ready' | 'error';
  displayName: string | null;
  /** The last failed save's message, until a save succeeds (shown on Collection's "You:" line). */
  saveError: string | null;
  /** Not optimistic: resolves true once the server has stored it, and only then updates `displayName`. */
  save: (raw: string) => Promise<boolean>;
  reload: () => void;
};

const ENDPOINT = '/api/user';

const SAVE_FAILED = "Your name wasn't saved. Edit it to try again.";

const ProfileContext = createContext<ProfileValue | null>(null);

/**
 * The profile name Collection matches against each session's members.
 *
 * It doesn't share `useOnboarding`'s request. That hook is deliberately silent
 * on failure and does nothing else, while the profile needs a status and
 * saves. Two reads of a tiny endpoint at sign-in cost nothing, and leaving the
 * onboarding hook alone keeps it as it was.
 *
 * Saving is not optimistic: a wrong name would move sessions between sections
 * on screen, so the name changes only once the server has it.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<ProfileValue['status']>('loading');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const send = useCallback(
    (init: RequestInit, signal: AbortSignal) =>
      authorisedFetch(() => getToken(), fetch, ENDPOINT, init, signal),
    [getToken],
  );

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    (async () => {
      setStatus('loading');
      try {
        const body = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
          const res = await send({ method: 'GET' }, signal);
          if (!res.ok) throw new Error(`Could not load your profile (${res.status}).`);
          return (await res.json()) as { displayName?: unknown };
        });
        if (cancelled) return;
        setDisplayName(typeof body.displayName === 'string' ? body.displayName : null);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        if (import.meta.env.DEV) console.warn('profile: could not load', err);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, reloads, send]);

  const save = useCallback(
    async (raw: string): Promise<boolean> => {
      try {
        const body = await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
          const res = await send(
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ displayName: raw }),
            },
            signal,
          );
          if (!res.ok) throw new Error(`Could not save your name (${res.status}).`);
          return (await res.json()) as { displayName?: unknown };
        });
        setDisplayName(typeof body.displayName === 'string' ? body.displayName : null);
        setSaveError(null);
        return true;
      } catch {
        setSaveError(SAVE_FAILED);
        return false;
      }
    },
    [send],
  );

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const value = useMemo<ProfileValue>(
    () => ({ status, displayName, saveError, save, reload }),
    [status, displayName, saveError, save, reload],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
