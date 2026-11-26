/**
 * The invite link in the browser: reading `?join=` off the address, holding it through sign-in,
 * and building the link the organizer shares. Browser only: it is never imported by `api/`,
 * whose typecheck has no DOM library, which is why the token's shape check lives in
 * `joinedSessions.ts`.
 */

export const JOIN_STASH_KEY = 'hati:join';
/** Long enough to sign up and verify an email, short enough that a forgotten link isn't replayed days later. */
export const JOIN_STASH_MS = 60 * 60 * 1000;
/** Far beyond a real token, so a stuffed address can't fill storage. */
export const JOIN_RAW_MAX = 64;

/**
 * The `join` value of an address's query string, cut to `JOIN_RAW_MAX`. Null when there is none.
 * A present but empty one counts: it is an invite attempt, and reads as a dead link.
 */
export function readJoinParam(search: string): string | null {
  const value = new URLSearchParams(search).get('join');
  return value === null ? null : value.slice(0, JOIN_RAW_MAX);
}

/** The address without `join`, keeping the other parameters and the hash that Clerk's routing uses. */
export function withoutJoinParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('join');
  return url.pathname + url.search + url.hash;
}

export type JoinStorage = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
};

/** `localStorage`, or null where the browser refuses it (a private window, blocked site data). */
export function browserStorage(): JoinStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Remembers the raw token and when it arrived. A storage that fails means no stash, never an error. */
export function stashJoin(storage: JoinStorage | null, raw: string, now: number): void {
  try {
    storage?.setItem(JOIN_STASH_KEY, JSON.stringify({ raw, at: now }));
  } catch {
    // Without a stash the link is lost at the next sign-in redirect, and the invite must be opened again.
  }
}

/** The stashed token while it is under an hour old, else null. A pure read: it never writes or removes. */
export function peekJoin(storage: JoinStorage | null, now: number): string | null {
  try {
    const text = storage?.getItem(JOIN_STASH_KEY);
    if (!text) return null;
    const stash: unknown = JSON.parse(text);
    if (typeof stash !== 'object' || stash === null) return null;
    const { raw, at } = stash as { raw?: unknown; at?: unknown };
    if (typeof raw !== 'string' || typeof at !== 'number') return null;
    return now - at < JOIN_STASH_MS ? raw : null;
  } catch {
    return null;
  }
}

export function clearJoin(storage: JoinStorage | null): void {
  try {
    storage?.removeItem(JOIN_STASH_KEY);
  } catch {
    // Nothing to clear if the storage can't be reached.
  }
}

/** The link the organizer shares, on whichever address the app is open at (D9). */
export const inviteUrl = (origin: string, token: string): string => `${origin}/?join=${token}`;
