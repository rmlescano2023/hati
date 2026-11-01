import type { Session } from '../types';

/** The longest a session name can be, in characters, once tidied. */
export const SESSION_NAME_MAX = 60;

/**
 * The one rule for what a session name is, shared by the server's parser, the
 * create request and every rename, so a name means the same thing wherever it
 * was typed. Anything unusable is no name rather than an error, because a bad
 * name should never cost the user the session itself.
 */
export function normaliseSessionName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Control characters become spaces as well as whitespace runs: Postgres
  // `text` rejects U+0000, so this is also what keeps a NUL from failing a save.
  const tidy = raw.replace(/[\s\p{Cc}]+/gu, ' ').trim();
  if (!tidy) return null;
  // Counting code points rather than UTF-16 units means a cut never leaves half
  // of an emoji behind as a lone surrogate.
  return Array.from(tidy).slice(0, SESSION_NAME_MAX).join('').trimEnd();
}

/**
 * The session with this name applied, or the very same object when nothing
 * would change. Returning the same object is what makes an unchanged save, or
 * a repeated one, send no request: the store treats it as a no-op. Closed
 * sessions keep the name they were filed with.
 */
export function applySessionName(session: Session, raw: string): Session {
  if (session.status !== 'draft') return session;
  const name = normaliseSessionName(raw);
  return name === session.name ? session : { ...session, name };
}
