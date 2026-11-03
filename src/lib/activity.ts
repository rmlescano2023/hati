import type { Session } from '../types';

/** Milliseconds for an ISO time. An unreadable one counts as the epoch, so a comparator never returns NaN. */
const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * An activity time as the API and the parser accept it: a readable time from
 * 1970 on, normalised to ISO. Anything else is no time rather than an error,
 * so an older client's write is never rejected for lacking one.
 */
export function parseActivityAt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t >= 0 ? new Date(t).toISOString() : null;
}

/**
 * The time the server stores: the client's, so it reflects when the user
 * acted even if the request was slow, but never later than the server's own
 * clock, so a device set in the future cannot pin a session first (BR-7).
 */
export function clampActivityAt(sent: string | null, now: number): string | null {
  return sent === null ? null : new Date(Math.min(Date.parse(sent), now)).toISOString();
}

/** When the session was last touched, as far as Home can tell (BR-4, BR-5). */
export function sortTime(session: Session): number {
  let latest = ms(session.createdAt);
  if (session.activityAt !== null) latest = Math.max(latest, ms(session.activityAt));
  for (const record of session.records) latest = Math.max(latest, ms(record.createdAt));
  return latest;
}

/**
 * Home's order: most recently touched first, then the newer session, then the
 * lower id. Ids compare by code unit rather than locale, so every device
 * agrees (BR-6).
 */
export function compareByRecentActivity(a: Session, b: Session): number {
  return (
    sortTime(b) - sortTime(a) ||
    ms(b.createdAt) - ms(a.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The merged list after a load, keeping the on-screen activity time of any
 * session whose open hasn't reached the server yet, so that session doesn't
 * drop now and rise again on the next load (AC-6.4). Content is always the
 * merged copy's.
 */
export function keepOpenedActivity<S extends { id: string; activityAt: string | null }>(
  merged: S[],
  local: S[],
  isOpening: (id: string) => boolean,
): S[] {
  const localById = new Map(local.map((s) => [s.id, s]));
  return merged.map((s) => {
    const mine = localById.get(s.id)?.activityAt ?? null;
    if (!isOpening(s.id) || mine === null) return s;
    return s.activityAt !== null && ms(s.activityAt) >= ms(mine) ? s : { ...s, activityAt: mine };
  });
}
