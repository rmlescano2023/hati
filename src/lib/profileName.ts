import { toTitleCase } from './format.js';

/** The longest a profile name can be, in characters, once tidied. */
export const PROFILE_NAME_MAX = 60;

/**
 * The one rule for the profile name, shared by the server and the field, so it
 * is stored the way member names are entered: tidied and title-cased (BR-3).
 * A blank name is no name, which is how a name is unset.
 */
export function normaliseProfileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // Control characters become spaces as well as whitespace runs: Postgres
  // `text` rejects U+0000, so this is also what keeps a NUL from failing a save.
  const tidy = raw.replace(/[\s\p{Cc}]+/gu, ' ').trim();
  if (!tidy) return null;
  // Counting code points rather than UTF-16 units means a cut never leaves half
  // of an emoji behind as a lone surrogate.
  return Array.from(toTitleCase(tidy)).slice(0, PROFILE_NAME_MAX).join('').trimEnd();
}
