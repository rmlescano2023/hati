import { parseActivityAt } from '../src/lib/activity.js';
import { PAYMENTS_PER_REQUEST_MAX } from '../src/lib/collection.js';
import { NICKNAMES_MAX, normaliseProfileName, type ProfileUpdate } from '../src/lib/profileName.js';
import { isInviteToken } from '../src/lib/joinedSessions.js';
import { isPracticeId } from '../src/lib/practiceId.js';
import { normaliseSessionName } from '../src/lib/sessionName.js';
import { parseSession } from '../src/lib/storage.js';
import type { ClaimDecision, NewClaim, NewPayment, Session } from '../src/types';

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
 * A practice session's id (tab-guides BR-TG3). Practice lives only in the browser, so a write
 * naming one is a client bug, refused with a 400 before it can reach the database.
 */
export function isPracticeSessionId(id: string): boolean {
  return isPracticeId(id);
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
  if (!Array.isArray(list) || list.length < 1 || list.length > PAYMENTS_PER_REQUEST_MAX)
    return null;

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

/**
 * What a `PUT /api/user` is for. No body is the onboarding mark, which is what
 * the tour and every older client send; the others name themselves. Anything
 * else is a 400, so a typo can never be read as "onboarded".
 */
export function parseUserMark(
  raw: unknown,
): 'onboarding' | 'whatsNew' | 'alreadySettled' | 'expensesGuide' | 'collectionGuide' | null {
  if (raw === undefined || raw === null) return 'onboarding';
  if (!isPlainObject(raw)) return null;
  return raw.mark === 'whatsNew' ||
    raw.mark === 'alreadySettled' ||
    raw.mark === 'expensesGuide' ||
    raw.mark === 'collectionGuide'
    ? raw.mark
    : null;
}

/** The `sessionId` of a query string: one short string, or null. */
export function parseSessionIdQuery(raw: unknown): string | null {
  return isShortText(raw) ? raw : null;
}

/**
 * Whether a session list asks for the sessions the caller joined too. Only the exact value `1`
 * does, so a tab still on an older bundle, which sends no flag, keeps getting owned sessions only.
 */
export function parseJoinedFlag(raw: unknown): boolean {
  return raw === '1';
}

export type InviteInput =
  | { kind: 'link'; sessionId: string; reset: boolean }
  | { kind: 'preview'; token: string }
  | { kind: 'join'; token: string; member: string };

/**
 * An invite request. The body is the whole action, so each of the three forms is exact and
 * anything that mixes them is a 400 rather than a guess: a request that names a session and
 * carries a token could otherwise be read as either, and "get the link" is organizer-only while
 * "preview" is open to any signed-in account.
 */
export function parseInviteInput(raw: unknown): InviteInput | null {
  if (!isPlainObject(raw)) return null;
  const { sessionId, reset, token, member } = raw;

  if (sessionId !== undefined) {
    if (!isShortText(sessionId) || token !== undefined || member !== undefined) return null;
    if (reset !== undefined && typeof reset !== 'boolean') return null;
    return { kind: 'link', sessionId, reset: reset === true };
  }

  if (reset !== undefined || !isInviteToken(token)) return null;
  if (member === undefined) return { kind: 'preview', token };
  return isShortText(member) ? { kind: 'join', token, member } : null;
}

/**
 * The query of a participant removal: the session and the member, both required. It is the whole
 * request, so a missing, empty or repeated (array) value is a 400.
 */
export function parseParticipantQuery(
  sessionId: unknown,
  member: unknown,
): { sessionId: string; member: string } | null {
  return isShortText(sessionId) && isShortText(member) ? { sessionId, member } : null;
}

/**
 * A request to say "I've paid", one claim or Mark all's batch. It is `parsePaymentsInput`'s rules
 * exactly, under its own field name: the same id, name, amount, count and no-duplicate-pair checks,
 * because a claim is money in waiting and the server must never guess an amount or a pair.
 */
export function parseClaimsInput(raw: unknown): { sessionId: string; claims: NewClaim[] } | null {
  if (!isPlainObject(raw)) return null;
  const parsed = parsePaymentsInput({ sessionId: raw.sessionId, payments: raw.claims });
  return parsed === null ? null : { sessionId: parsed.sessionId, claims: parsed.payments };
}

const CLAIM_ID = /^pay_[A-Za-z0-9]{1,64}$/;

/** A decision on one claim: which claim, and confirm or decline. Anything else is a 400. */
export function parseClaimDecision(raw: unknown): { id: string; decision: ClaimDecision } | null {
  if (!isPlainObject(raw)) return null;
  const { id, decision } = raw;
  if (typeof id !== 'string' || !CLAIM_ID.test(id)) return null;
  return decision === 'confirm' || decision === 'decline' ? { id, decision } : null;
}

/** The `id` of a claim query: one claim id, or null. */
export function parseClaimIdQuery(raw: unknown): string | null {
  return typeof raw === 'string' && CLAIM_ID.test(raw) ? raw : null;
}

/** Whether a session list is only the cheap "anything changed?" check. Only the exact value `1` is. */
export function parseCheckFlag(raw: unknown): boolean {
  return raw === '1';
}
