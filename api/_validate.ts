import { parseActivityAt } from '../src/lib/activity.js';
import {
  NICKNAMES_MAX,
  normaliseProfileName,
  type ProfileUpdate,
} from '../src/lib/profileName.js';
import { normaliseSessionName } from '../src/lib/sessionName.js';
import { parseSession } from '../src/lib/storage.js';
import type { NewPayment, Session } from '../src/types';

/**
 * The validation boundary for a write.
 *
 * `parseAppData` used to hold this role over an entire account document; now
 * that a write names one session, validation is scoped to that session. It is
 * the same parser the browser uses, so a body that survives here is a body the
 * app can load.
 *
 * The id comes from the path rather than the body, so a client cannot write to
 * one session while claiming to be another.
 */
export function parseSessionInput(id: string, raw: unknown): Session | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const session = parseSession({ ...(raw as Record<string, unknown>), id });
  return session;
}

/**
 * The name a draft is created with. Never a reason to reject the request:
 * anything unusable is simply no name, so a bad name cannot cost the user
 * the session itself.
 */
export function parseSessionName(raw: unknown): string | null {
  return normaliseSessionName(raw);
}

/**
 * The activity time an open reports. It is the whole request, so unlike a
 * field inside a session, a missing or unreadable one is a 400 rather than null.
 */
export function parseActivityInput(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return parseActivityAt((raw as Record<string, unknown>).activityAt);
}

const isPlainObject = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw);

/** A name or id field: a non-empty string no longer than the server will store. */
const isShortText = (raw: unknown): raw is string =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= 200;

/** The largest value a Postgres `integer` holds. */
const MAX_CENTS = 2_147_483_647;

/**
 * A request to record payments. It is the whole write, and money, so anything
 * malformed is a 400 rather than a default: the server never guesses an amount
 * or a pair. Duplicates are rejected too, because one request records at most
 * one payment per line, and a repeated id would make the batch ambiguous.
 * Whether each pair is a real line, and fits what is left on it, is checked
 * against the stored session by the handler.
 */
export function parsePaymentsInput(
  raw: unknown,
): { sessionId: string; payments: NewPayment[] } | null {
  if (!isPlainObject(raw)) return null;
  const { sessionId, payments: list } = raw;
  if (!isShortText(sessionId)) return null;
  if (!Array.isArray(list) || list.length < 1 || list.length > 100) return null;

  const payments: NewPayment[] = [];
  const ids = new Set<string>();
  const pairs = new Set<string>();
  for (const entry of list) {
    if (!isPlainObject(entry)) return null;
    const { id, debtor, creditor, amountCents } = entry;
    if (typeof id !== 'string' || !/^pay_[A-Za-z0-9]{1,64}$/.test(id)) return null;
    if (!isShortText(debtor) || !isShortText(creditor) || debtor === creditor) return null;
    if (
      typeof amountCents !== 'number' ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < 1 ||
      amountCents > MAX_CENTS
    ) {
      return null;
    }
    const pair = JSON.stringify([debtor, creditor]);
    if (ids.has(id) || pairs.has(pair)) return null;
    ids.add(id);
    pairs.add(pair);
    payments.push({ id, debtor, creditor, amountCents });
  }
  return { sessionId, payments };
}

/**
 * A profile update: set the name, the other names or both, or add one other
 * name. It is the whole request, so a missing or mistyped field is a 400 rather
 * than a default; a blank name is a deliberate unset (AC-2.4). A list of more
 * than NICKNAMES_MAX is refused rather than cut, so a name the user thinks is
 * saved is never silently dropped (BR-N7).
 */
export function parseProfileInput(raw: unknown): ProfileUpdate | null {
  if (!isPlainObject(raw)) return null;
  const { displayName, nicknames, addNickname } = raw;

  if (addNickname !== undefined) {
    if (displayName !== undefined || nicknames !== undefined) return null;
    const name = normaliseProfileName(addNickname);
    return name === null ? null : { addNickname: name };
  }

  if (displayName === undefined && nicknames === undefined) return null;
  const update: { displayName?: string | null; nicknames?: string[] } = {};
  if (displayName !== undefined) {
    if (displayName !== null && typeof displayName !== 'string') return null;
    update.displayName = normaliseProfileName(displayName);
  }
  if (nicknames !== undefined) {
    if (!Array.isArray(nicknames) || nicknames.length > NICKNAMES_MAX) return null;
    if (!nicknames.every((n) => typeof n === 'string')) return null;
    update.nicknames = nicknames
      .map((n) => normaliseProfileName(n))
      .filter((n): n is string => n !== null);
  }
  return update;
}
