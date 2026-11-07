/** The release whose "What's new" is current. A later release bumps it, and each account sees that one once. */
export const WHATS_NEW_VERSION = 1;

/**
 * Whether this account is due the current "What's new": already onboarded
 * (a new account gets the tour instead, BR-W3), and hasn't seen this version
 * (BR-W1, BR-W2). Anything unreadable counts as not seen.
 */
export function whatsNewDue(onboardedAt: unknown, seenVersion: unknown): boolean {
  const seen = typeof seenVersion === 'number' ? seenVersion : 0;
  return onboardedAt !== null && onboardedAt !== undefined && seen < WHATS_NEW_VERSION;
}
