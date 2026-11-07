import { compareNames, sortNames, toTitleCase } from './format.js';

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

/** The most other names an account keeps (BR-N7). */
export const NICKNAMES_MAX = 3;

const sameName = (a: string, b: string): boolean => compareNames(a, b) === 0;

/**
 * Other names as they are stored: each tidied like the profile name, blanks
 * dropped, one per name ignoring case and accents, none equal to the profile
 * name, and sorted as member lists are (BR-N6, BR-N8, BR-N9). It doesn't cap
 * the count; the callers refuse a list that is too long instead of cutting it.
 */
export function cleanNicknames(raw: readonly string[], displayName: string | null): string[] {
  const kept: string[] = [];
  for (const entry of raw) {
    const name = normaliseProfileName(entry);
    if (name === null) continue;
    if (displayName !== null && sameName(name, displayName)) continue;
    if (kept.some((k) => sameName(k, name))) continue;
    kept.push(name);
  }
  return sortNames(kept);
}

export type StoredProfile = { displayName: string | null; nicknames: string[] };

/** A profile write: set either field or both, or add one other name (BR-N11). */
export type ProfileUpdate =
  { displayName?: string | null; nicknames?: string[] } | { addNickname: string };

/**
 * What a write leaves stored, or null when an add would go past the limit.
 * Only the fields the write names change, so a tab on the previous bundle,
 * which only sends the name, never wipes the other names (BR-N13).
 */
export function applyProfileUpdate(
  stored: StoredProfile,
  update: ProfileUpdate,
): StoredProfile | null {
  if ('addNickname' in update) {
    const current = cleanNicknames(stored.nicknames, stored.displayName);
    const known =
      (stored.displayName !== null && sameName(update.addNickname, stored.displayName)) ||
      current.some((n) => sameName(update.addNickname, n));
    if (known) return { displayName: stored.displayName, nicknames: current };
    if (current.length >= NICKNAMES_MAX) return null;
    return {
      displayName: stored.displayName,
      nicknames: cleanNicknames([...current, update.addNickname], stored.displayName),
    };
  }
  const displayName = update.displayName !== undefined ? update.displayName : stored.displayName;
  return {
    displayName,
    nicknames: cleanNicknames(update.nicknames ?? stored.nicknames, displayName),
  };
}
