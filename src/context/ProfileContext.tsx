import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { RememberOffer } from '../lib/collection';
import { NICKNAMES_MAX } from '../lib/profileName';
import { WRITE_TIMEOUT_MS, authorisedFetch, withDeadline } from '../lib/writeQueue';

type ProfileValue = {
  status: 'loading' | 'ready' | 'error';
  displayName: string | null;
  /** Other names the user goes by, tidied and sorted; empty when none. */
  nicknames: string[];
  /** The last failed remember's message, until a profile save succeeds or it's dismissed. Shown on Collection. */
  saveError: string | null;
  /**
   * The Profile dialog and the banner: stores exactly the fields given, raw as
   * typed. Not optimistic: resolves true once the server has stored them, and
   * only then updates the names. A failure is the caller's to show.
   */
  save: (update: { displayName?: string; nicknames?: string[] }) => Promise<boolean>;
  /**
   * A picker's "Remember": as the profile name, or added to the other names.
   * Never awaited by its callers; a failure sets `saveError`.
   */
  remember: (name: string, as: RememberOffer) => Promise<void>;
  dismissSaveError: () => void;
  reload: () => void;
};

const ENDPOINT = '/api/user';

/** The other names from a response: whatever strings it holds, or none. */
const namesFrom = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((n): n is string => typeof n === 'string') : [];

const ProfileContext = createContext<ProfileValue | null>(null);

/**
 * The profile name and other names Collection matches against each session's members.
 *
 * It doesn't share `useOnboarding`'s request. That hook is deliberately silent
 * on failure and does nothing else, while the profile needs a status and
 * saves. Two reads of a tiny endpoint at sign-in cost nothing, and leaving the
 * onboarding hook alone keeps it as it was.
 *
 * Saving is not optimistic: a wrong name would move sessions between sections
 * on screen, so the names change only once the server has them.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [status, setStatus] = useState<ProfileValue['status']>('loading');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nicknames, setNicknames] = useState<string[]>([]);
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
          return (await res.json()) as { displayName?: unknown; nicknames?: unknown };
        });
        if (cancelled) return;
        setDisplayName(typeof body.displayName === 'string' ? body.displayName : null);
        setNicknames(namesFrom(body.nicknames));
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

  // One PATCH at a time. Each waits for the one before to settle, so the
  // replies arrive in the order the server applied them and an older reply can
  // never overwrite a newer one (AC-N4.8). Its deadline starts when it does.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const patch = useCallback(
    (body: object): Promise<{ ok: true } | { ok: false; code?: string }> => {
      const run = async (): Promise<{ ok: true } | { ok: false; code?: string }> => {
        try {
          return await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
            const res = await send(
              {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              },
              signal,
            );
            if (!res.ok) {
              const err = (await res.json().catch(() => null)) as { code?: unknown } | null;
              return {
                ok: false as const,
                code: typeof err?.code === 'string' ? err.code : undefined,
              };
            }
            const stored = (await res.json()) as { displayName?: unknown; nicknames?: unknown };
            setDisplayName(typeof stored.displayName === 'string' ? stored.displayName : null);
            setNicknames(namesFrom(stored.nicknames));
            setSaveError(null);
            return { ok: true as const };
          });
        } catch {
          return { ok: false };
        }
      };
      const result = queue.current.then(run);
      queue.current = result;
      return result;
    },
    [send],
  );

  const save = useCallback(
    async (update: { displayName?: string; nicknames?: string[] }): Promise<boolean> =>
      (await patch(update)).ok,
    [patch],
  );

  const remember = useCallback(
    async (name: string, as: RememberOffer): Promise<void> => {
      const result = await patch(as === 'name' ? { displayName: name } : { addNickname: name });
      if (result.ok) return;
      setSaveError(
        result.code === 'too_many_names'
          ? `“${name}” wasn't saved: you already have ${NICKNAMES_MAX} other names. Remove one in Profile to make room.`
          : as === 'nickname'
            ? `“${name}” wasn't saved as one of your names. Add it in Profile to try again.`
            : `“${name}” wasn't saved as your name. Enter it in Profile to try again.`,
      );
    },
    [patch],
  );

  const dismissSaveError = useCallback(() => setSaveError(null), []);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  const value = useMemo<ProfileValue>(
    () => ({
      status,
      displayName,
      nicknames,
      saveError,
      save,
      remember,
      dismissSaveError,
      reload,
    }),
    [status, displayName, nicknames, saveError, save, remember, dismissSaveError, reload],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
