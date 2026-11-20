import { getFinalSettlement, getNettedOwedMatrix, getRawOwedMatrix } from './calculations.js';
import { compareNames, formatLocalDate, formatMoney, sortNames } from './format.js';
import { roundMoney } from './money.js';
import { NICKNAMES_MAX, normaliseProfileName } from './profileName.js';
import { sessionDisplayTitle } from './sessionLabel.js';
import type { Claim, NewClaim, NewPayment, Payment, Session } from '../types';

/**
 * Everything Collection shows is derived here, on every render, from the
 * sessions, their payments and the user's names. Nothing derived is stored, so
 * a pick, a rename or an undo can never leave a stale figure behind.
 *
 * Money is whole centavos throughout. Line amounts come from the settlement
 * code in pesos and convert once; from then on sums and differences are integer
 * arithmetic, so there is no float dust to round away (BR-11).
 */

/**
 * Stored in `Session.me` when the user said they are not in the session. A
 * member name is never empty (`addMember` rejects one), so it can't collide.
 */
export const NOT_IN_SESSION = '';

/**
 * The most payments one request records. It covers every pair of a 20-member
 * group (190), so marking such a session settled is still one all-or-nothing
 * request (BR-S2).
 */
export const PAYMENTS_PER_REQUEST_MAX = 200;

export const toCents = (pesos: number): number => Math.round(roundMoney(pesos) * 100);
export const formatCents = (cents: number): string => formatMoney(cents / 100);

/** Milliseconds for an ISO time. An unreadable one counts as the epoch, so a comparator never returns NaN. */
const ms = (iso: string | null): number => {
  const t = iso === null ? Number.NaN : Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** Ids compare by code unit rather than locale, so every device agrees on a tie. */
const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The stored pick as the parser accepts it: the not-in-session marker or one
 * of the session's own members, exactly. Anything else is no pick rather than
 * an error, so an older client's save is never rejected for it.
 */
export function parseMe(raw: unknown, members: string[]): string | null {
  if (raw === NOT_IN_SESSION) return NOT_IN_SESSION;
  return typeof raw === 'string' && members.includes(raw) ? raw : null;
}

/** The names Hati recognises the user by: the profile name, if set, and their other names (BR-N1). */
export type KnownNames = { displayName: string | null; nicknames: string[] };

const sameName = (a: string, b: string): boolean => compareNames(a, b) === 0;

/** Whether a name is one of the user's own, ignoring case and accents but not spaces (BR-N2). */
export function isKnownName(name: string, names: KnownNames): boolean {
  return (
    (names.displayName !== null && sameName(name, names.displayName)) ||
    names.nicknames.some((n) => sameName(name, n))
  );
}

/** One member matched by the user's names, and by which: only a profile-name hit places a session. */
export type Match = { member: string; via: 'profile' | 'nickname' };

/**
 * The one member who is the user. The profile name decides first: one hit
 * places the session, and more than one is ambiguous, so nothing is guessed
 * (BR-4). Only when it matches no member do the other names count, with the
 * same one-hit rule (owner, Q1), so saving a nickname never unplaces a session
 * the profile name already placed. Hits are counted by member, so one member
 * matching two of the names is still one hit. A nickname hit is only a
 * suggestion, confirmed by the user, because a friend can share the nickname
 * (owner, round 2).
 */
export function matchMember(members: string[], names: KnownNames): Match | null {
  const { displayName } = names;
  const byName = displayName === null ? [] : members.filter((m) => sameName(m, displayName));
  if (byName.length > 0) return byName.length === 1 ? { member: byName[0], via: 'profile' } : null;
  const byNickname = members.filter((m) => names.nicknames.some((n) => sameName(m, n)));
  return byNickname.length === 1 ? { member: byNickname[0], via: 'nickname' } : null;
}

export type Me =
  | { kind: 'member'; name: string; picked: boolean }
  /** `suggested`: the one member matched by a nickname alone, preselected for the user to confirm. */
  | { kind: 'unknown'; suggested: string | null }
  | { kind: 'notInSession' };

/** Whether the account joined this session rather than owning it. Never test `role === 'owner'`: an absent role is an owner. */
export const isJoined = (session: Pick<Session, 'role'>): boolean => session.role === 'participant';

/** The members an account has joined the session as. Only an owned session lists any. */
export const claimedMembers = (session: Pick<Session, 'participants'>): string[] =>
  (session.participants ?? []).map((p) => p.member);

/**
 * BR-N4: an explicit pick, then a profile-name match, then unknown (Needs
 * setup), with a nickname match as the suggestion. The match skips members
 * someone has joined as, so the organizer and a participant are never both
 * the same person while the pick is unset (AC-14.2).
 */
export function resolveMe(
  session: Pick<Session, 'me' | 'members' | 'participants'>,
  names: KnownNames,
): Me {
  if (session.me === NOT_IN_SESSION) return { kind: 'notInSession' };
  if (session.me !== null && session.members.includes(session.me)) {
    return { kind: 'member', name: session.me, picked: true };
  }
  const claimed = claimedMembers(session);
  const match = matchMember(
    session.members.filter((m) => !claimed.includes(m)),
    names,
  );
  if (match === null) return { kind: 'unknown', suggested: null };
  return match.via === 'profile'
    ? { kind: 'member', name: match.member, picked: false }
    : { kind: 'unknown', suggested: match.member };
}

/** The question a Needs setup card or the Finish picker asks about a nickname match. */
export const nicknamePrompt = (member: string): string =>
  `You go by “${member}” — is that you here?`;

/** Which "Remember" checkbox a picker offers for its selection, if any. */
export type RememberOffer = 'name' | 'nickname';

/**
 * "Remember as my name" while no profile name is set, otherwise "Remember
 * “X” as another name for me", and only for a member Hati doesn't already
 * know (BR-N10). Callers use it both to show the checkbox and to decide
 * whether its value counts, since it only means something while shown.
 */
export function rememberOffer(
  profile: KnownNames & { status: string },
  value: string | null,
): RememberOffer | null {
  if (profile.status !== 'ready' || value === null || value === NOT_IN_SESSION) return null;
  if (isKnownName(value, profile)) return null;
  // The name is stored tidied. One that tidies into something else, such as a
  // member name past 60 characters or with doubled spaces, would never match
  // again, so it isn't offered (BR-N6, E15).
  const stored = normaliseProfileName(value);
  if (stored === null || !sameName(stored, value)) return null;
  if (profile.displayName === null) return 'name';
  return profile.nicknames.length < NICKNAMES_MAX ? 'nickname' : null;
}

export type SettlementPair = { debtor: string; creditor: string; amountCents: number };

/** Every settlement line of the session, the same ones the Summary and the PDF show. */
export function settlementPairs(session: Pick<Session, 'members' | 'records'>): SettlementPair[] {
  const members = sortNames(session.members);
  const netted = getNettedOwedMatrix(getRawOwedMatrix(session.records, members));
  return getFinalSettlement(netted, members).flatMap((s) =>
    s.lines
      .map((l) => ({ debtor: s.debtor, creditor: l.creditor, amountCents: toCents(l.amount) }))
      .filter((p) => p.amountCents > 0),
  );
}

export type LineStatus = 'unpaid' | 'partial' | 'paid';

export type CollectionLine = {
  /** Unique within a session: the pair, which is what payments belong to. */
  key: string;
  direction: 'owedToYou' | 'youOwe';
  /** The other person on the line. */
  other: string;
  debtor: string;
  creditor: string;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  /** Only above 0 if the numbers changed after a payment (BR-15). */
  overpaidCents: number;
  status: LineStatus;
  /** This pair's payments, newest first. */
  payments: Payment[];
  /** Pending claims on this pair that this account can see, newest first. */
  claims: Claim[];
  /** This account's own declined claims on this pair, newest first (a debtor participant only). */
  declined: Claim[];
  /** P: the pending claims on this pair. Never part of paid, remaining or status (BR-C14). */
  pendingCents: number;
  /** What can still be claimed or recorded on it: max(0, remaining − P) (BR-C11, BR-C13). */
  openCents: number;
};

export type Bucket = 'needsSetup' | 'outstanding' | 'settled';

export type CollectionCard = {
  session: Session;
  me: Me;
  bucket: Bucket;
  owedToYou: CollectionLine[];
  youOwe: CollectionLine[];
  /** For "X of Y settled", counting both directions (BR-12). */
  lineCount: number;
  settledLineCount: number;
  owedToYouRemainingCents: number;
  youOweRemainingCents: number;
  /** The counted payments on each side. */
  receivedCents: number;
  paidOutCents: number;
  /** The last counted payment, or the finish time when there is none. */
  settledAt: string;
  /** How many settlement pairs the session has, the user's or not. */
  pairCount: number;
  /**
   * Every pair is fully paid. True when there are none. False on a joined session, which is only
   * sent the payments on its own lines, so it can't know about the others (D1).
   */
  allPairsPaid: boolean;
  /**
   * Finished before Collection, with at least one pair, and every pair paid:
   * how a session marked "already settled" looks (S-A1). It gets the card's
   * Undo and sorts by its finish date (Q3).
   */
  presettled: boolean;
  /** BR-S1: offered "Already settled", on the card and in the question. */
  offersAlreadySettled: boolean;
  /** The organizer's "To confirm for others": pending claims they decide that aren't on their own lines. */
  forOthers: Claim[];
  /** Claims waiting on this account: pending claims on its Owed to you lines, plus `forOthers`. */
  toConfirmCount: number;
  /** This account's own pending claims on its You owe lines (AC-28.1). */
  waitingCents: number;
  /** What can still be claimed or recorded on each side: remaining minus pending (BR-C13). */
  owedToYouOpenCents: number;
  youOweOpenCents: number;
};

/**
 * The members who have an account on the session: someone joined as them, or they are the
 * organizer's stored pick. It decides whose name a claim waits on (BR-C19). On an owned session it
 * is worked out here, the same rule the server uses for a participant's `withAccount`; it isn't
 * `unavailableMembers`, because that file imports this one.
 */
export function membersWithAccount(
  session: Pick<Session, 'role' | 'members' | 'me' | 'participants' | 'withAccount'>,
): string[] {
  if (isJoined(session)) return session.withAccount ?? [];
  const claimed = claimedMembers(session);
  return session.members.filter((m) => claimed.includes(m) || m === session.me);
}

/** Newest first, ties by id, as payments are. */
const newestFirst = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  ms(b.createdAt) - ms(a.createdAt) || byId(b.id, a.id);

function buildLine(
  pair: SettlementPair,
  direction: CollectionLine['direction'],
  payments: Payment[],
  claims: Claim[],
): CollectionLine {
  // A payment counts only on its exact pair; any other is hidden, not lost (BR-15).
  const mine = payments
    .filter((p) => p.debtor === pair.debtor && p.creditor === pair.creditor)
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || byId(b.id, a.id));
  const paidCents = mine.reduce((sum, p) => sum + p.amountCents, 0);
  const remainingCents = Math.max(0, pair.amountCents - paidCents);
  // Claims are said, not agreed, so they sit beside the figures and are never added to them.
  const onPair = claims
    .filter((c) => c.debtor === pair.debtor && c.creditor === pair.creditor)
    .sort(newestFirst);
  const pending = onPair.filter((c) => c.status === 'pending');
  const pendingCents = pending.reduce((sum, c) => sum + c.amountCents, 0);
  return {
    key: JSON.stringify([pair.debtor, pair.creditor]),
    direction,
    other: direction === 'owedToYou' ? pair.debtor : pair.creditor,
    debtor: pair.debtor,
    creditor: pair.creditor,
    amountCents: pair.amountCents,
    paidCents,
    remainingCents,
    overpaidCents: Math.max(0, paidCents - pair.amountCents),
    status: paidCents === 0 ? 'unpaid' : remainingCents > 0 ? 'partial' : 'paid',
    payments: mine,
    claims: pending,
    declined: onPair.filter((c) => c.status === 'declined'),
    pendingCents,
    openCents: Math.max(0, remainingCents - pendingCents),
  };
}

/** Lines with something left first, then alphabetical (BR-17a). */
const lineOrder = (a: CollectionLine, b: CollectionLine): number =>
  Number(b.remainingCents > 0) - Number(a.remainingCents > 0) || compareNames(a.other, b.other);

const sumRemaining = (lines: CollectionLine[]) =>
  lines.reduce((sum, l) => sum + l.remainingCents, 0);
const sumPaid = (lines: CollectionLine[]) => lines.reduce((sum, l) => sum + l.paidCents, 0);
const sumOpen = (lines: CollectionLine[]) => lines.reduce((sum, l) => sum + l.openCents, 0);

/** A joined session's `me` is the member it joined as, so the user's own names are never consulted (BR-V2). */
const NO_NAMES: KnownNames = { displayName: null, nicknames: [] };

export function buildCard(session: Session, names: KnownNames): CollectionCard {
  const joined = isJoined(session);
  const me = resolveMe(session, joined ? NO_NAMES : names);
  const finishedAt = session.closedAt ?? session.createdAt;
  const owedToYou: CollectionLine[] = [];
  const youOwe: CollectionLine[] = [];
  // Every pair, the user's or not: whether the session is settled depends on
  // all of them, and so does marking it settled.
  const pairs = settlementPairs(session);
  const claims = session.claims ?? [];

  if (me.kind === 'member') {
    // Only the lines involving the user are theirs to track (BR-2).
    for (const pair of pairs) {
      if (pair.creditor === me.name) {
        owedToYou.push(buildLine(pair, 'owedToYou', session.payments, claims));
      } else if (pair.debtor === me.name) {
        youOwe.push(buildLine(pair, 'youOwe', session.payments, claims));
      }
    }
    owedToYou.sort(lineOrder);
    youOwe.sort(lineOrder);
  }

  const lines = [...owedToYou, ...youOwe];
  const settledLineCount = lines.filter((l) => l.status === 'paid').length;
  const latest = lines
    .flatMap((l) => l.payments)
    .reduce<Payment | null>(
      (best, p) => (best === null || ms(p.createdAt) > ms(best.createdAt) ? p : best),
      null,
    );

  const paidOn = (pair: SettlementPair) =>
    session.payments
      .filter((p) => p.debtor === pair.debtor && p.creditor === pair.creditor)
      .reduce((sum, p) => sum + p.amountCents, 0);
  const allPairsPaid = !joined && pairs.every((p) => paidOn(p) >= p.amountCents);

  // The claims this account has to answer: those on its own Owed to you lines, and, for the
  // organizer, those to creditors with no account, whose lines aren't on any card (BR-C2). Never a
  // claim to a participant, who decides their own.
  const withAccount = membersWithAccount(session);
  const ownPairs = new Set(lines.map((l) => l.key));
  const forOthers = joined
    ? []
    : claims
        .filter(
          (c) =>
            c.status === 'pending' &&
            !withAccount.includes(c.creditor) &&
            !ownPairs.has(JSON.stringify([c.debtor, c.creditor])),
        )
        .sort(newestFirst);
  const toConfirmCount = owedToYou.reduce((sum, l) => sum + l.claims.length, 0) + forOthers.length;
  const waiting = toConfirmCount > 0;

  // Every pair paid means nothing is left to collect from anyone, so there is
  // no reason to ask who the user is (BR-S3). A joined session already knows
  // who the user is, so it is bucketed from the user's own lines alone (BR-V3). A claim waiting
  // on this account keeps the card out of Settled, where it would go unseen (BR-C15).
  const bucket: Bucket = joined
    ? settledLineCount === lines.length && !waiting
      ? 'settled'
      : 'outstanding'
    : allPairsPaid && !waiting
      ? 'settled'
      : me.kind === 'unknown'
        ? 'needsSetup'
        : settledLineCount === lines.length && !waiting
          ? 'settled'
          : 'outstanding';

  return {
    session,
    me,
    bucket,
    owedToYou,
    youOwe,
    lineCount: lines.length,
    settledLineCount,
    owedToYouRemainingCents: sumRemaining(owedToYou),
    youOweRemainingCents: sumRemaining(youOwe),
    receivedCents: sumPaid(owedToYou),
    paidOutCents: sumPaid(youOwe),
    forOthers,
    toConfirmCount,
    waitingCents: youOwe.reduce((sum, l) => sum + l.pendingCents, 0),
    owedToYouOpenCents: sumOpen(owedToYou),
    youOweOpenCents: sumOpen(youOwe),
    settledAt: latest?.createdAt ?? finishedAt,
    pairCount: pairs.length,
    allPairsPaid,
    presettled: !joined && !session.finishedWithCollection && pairs.length > 0 && allPairsPaid,
    offersAlreadySettled:
      !joined &&
      !session.finishedWithCollection &&
      session.payments.length === 0 &&
      claims.length === 0 &&
      pairs.length > 0 &&
      pairs.length <= PAYMENTS_PER_REQUEST_MAX &&
      bucket !== 'settled',
  };
}

/**
 * What marking a session "already settled" records: one payment per pair at
 * what is left on it, in settlement order, whoever the user is (BR-S2). An
 * eligible session has no payments, so each is the pair's full amount.
 */
export function settlePayments(
  session: Pick<Session, 'members' | 'records' | 'payments'>,
): Omit<NewPayment, 'id'>[] {
  return settlementPairs(session).flatMap((pair) => {
    const paid = session.payments
      .filter((p) => p.debtor === pair.debtor && p.creditor === pair.creditor)
      .reduce((sum, p) => sum + p.amountCents, 0);
    const remaining = pair.amountCents - paid;
    return remaining > 0
      ? [{ debtor: pair.debtor, creditor: pair.creditor, amountCents: remaining }]
      : [];
  });
}

/**
 * Whether the session has pairs and every one of them is paid in full: what it
 * means to have ended up settled after marking it so. It is checked against the
 * payments on screen after the server's answer is merged, so a partial payment
 * recorded on another device doesn't count.
 */
export function isFullyPaid(session: Pick<Session, 'members' | 'records' | 'payments'>): boolean {
  return settlementPairs(session).length > 0 && settlePayments(session).length === 0;
}

/**
 * Whether every settlement line of the session is paid in full by confirmed payments, with a session
 * that has no lines counting as paid: an invite link has nothing left to track once this holds
 * (BR-L1, BR-L5). Unlike `isFullyPaid`, which is about having been marked settled, an empty
 * session is paid here. An overpaid pair counts as paid, and a pending claim pays nothing.
 */
export function everyLinePaid(session: Pick<Session, 'members' | 'records' | 'payments'>): boolean {
  return settlementPairs(session).every((pair) => {
    const paid = session.payments
      .filter((p) => p.debtor === pair.debtor && p.creditor === pair.creditor)
      .reduce((sum, p) => sum + p.amountCents, 0);
    return paid >= pair.amountCents;
  });
}

/**
 * The status line of a card in History, and whether it is settled only for this viewer: the first
 * of these that applies (A1). `stillOwed` is for an organizer whose own lines are paid while others
 * still owe each other, which the card notes.
 */
export function historyStatus(card: CollectionCard): { status: string; stillOwed: boolean } {
  const status = card.presettled
    ? 'Marked as already settled'
    : card.me.kind === 'notInSession'
      ? "You weren't in this session"
      : card.pairCount === 0
        ? "Nothing to collect. Everyone's even."
        : card.me.kind === 'unknown'
          ? "Everyone's paid"
          : card.lineCount === 0
            ? 'You were even with everyone'
            : `Settled ${formatLocalDate(card.settledAt)}`;
  return { status, stillOwed: !isJoined(card.session) && !everyLinePaid(card.session) };
}

/** The sessions whose card was in Collection (Needs setup or Outstanding) before and is in History now. */
export function movesFromCollection(prev: Collection, next: Collection): string[] {
  const was = new Set([...prev.needsSetup, ...prev.outstanding].map((c) => c.session.id));
  return next.settled.map((c) => c.session.id).filter((id) => was.has(id));
}

/** Whether a card that was in History is back in Collection: an undo, or a changed pick, undid it. */
export const cameBack = (prevBucket: Bucket, nextBucket: Bucket): boolean =>
  prevBucket === 'settled' && nextBucket !== 'settled';

export type Collection = {
  needsSetup: CollectionCard[];
  outstanding: CollectionCard[];
  settled: CollectionCard[];
  /** Remaining on Outstanding cards only (BR-14). */
  owedToYouCents: number;
  youOweCents: number;
  /** The cards offered "Already settled", newest finished first (BR-S1, BR-S9). */
  alreadySettledOffers: CollectionCard[];
};

/** Finished sessions only (BR-1), sectioned and ordered as BR-17a sets out. */
export function buildCollection(sessions: Session[], names: KnownNames): Collection {
  const cards = sessions.filter((s) => s.status === 'closed').map((s) => buildCard(s, names));
  const byFinished = (a: CollectionCard, b: CollectionCard) =>
    ms(b.session.closedAt) - ms(a.session.closedAt) || byId(a.session.id, b.session.id);
  // A session marked already settled sorts by when it was finished, not when it
  // was marked, so marking a batch doesn't push recently collected sessions
  // down (Q3).
  const settledOn = (c: CollectionCard) => (c.presettled ? c.session.closedAt : c.settledAt);
  const bySettled = (a: CollectionCard, b: CollectionCard) =>
    ms(settledOn(b)) - ms(settledOn(a)) ||
    ms(b.session.closedAt) - ms(a.session.closedAt) ||
    byId(a.session.id, b.session.id);

  const outstanding = cards.filter((c) => c.bucket === 'outstanding').sort(byFinished);
  return {
    needsSetup: cards.filter((c) => c.bucket === 'needsSetup').sort(byFinished),
    outstanding,
    settled: cards.filter((c) => c.bucket === 'settled').sort(bySettled),
    owedToYouCents: outstanding.reduce((sum, c) => sum + c.owedToYouRemainingCents, 0),
    youOweCents: outstanding.reduce((sum, c) => sum + c.youOweRemainingCents, 0),
    alreadySettledOffers: cards.filter((c) => c.offersAlreadySettled).sort(byFinished),
  };
}

/**
 * How many claims are waiting for this account's answer across every card: the ones it is offered
 * Confirm and Decline for (BR-C2). A waiting card is never in Settled (BR-C15), but it is summed
 * for safety.
 */
export const waitingForMeCount = (collection: Collection): number =>
  [...collection.needsSetup, ...collection.outstanding, ...collection.settled].reduce(
    (sum, card) => sum + card.toConfirmCount,
    0,
  );

/**
 * The card Collection opens on arrival: the first with a claim waiting, in page order (Needs setup,
 * Outstanding, then Settled). None when the page was reached for a particular session (Finish, a
 * join), which wins, or when the caller doesn't want it, as in a guide.
 */
export function autoOpenTarget(
  collection: Collection,
  options: { openSessionId: string | undefined; autoOpen: boolean },
): string | null {
  if (!options.autoOpen || options.openSessionId !== undefined) return null;
  const first = [...collection.needsSetup, ...collection.outstanding, ...collection.settled].find(
    (card) => card.toConfirmCount > 0,
  );
  return first?.session.id ?? null;
}

export type ParsedAmount = { ok: true; cents: number } | { ok: false; message: string };

/**
 * A typed payment amount, in centavos. Integer parsing only, never
 * `parseFloat`, so "33.34" is exactly 3334 and the cap compares exactly (BR-12).
 */
export function parsePaymentAmount(raw: string, remainingCents: number): ParsedAmount {
  const greater = 'Enter an amount greater than ₱0.00.';
  // The same characters `parseAmount` forgives, so "₱1,000" reads as typed (AC-7.8).
  const cleaned = raw.replace(/[₱,\s]/g, '');
  if (cleaned === '') return { ok: false, message: greater };

  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return { ok: false, message: 'Enter a number.' };
  const [, sign, whole, fraction = ''] = match;
  if (whole === '' && fraction === '') return { ok: false, message: 'Enter a number.' };
  if (fraction.length > 2) return { ok: false, message: 'Use at most 2 decimal places.' };

  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'));
  if (sign === '-' || cents <= 0) return { ok: false, message: greater };
  if (cents > remainingCents) {
    return { ok: false, message: `That's more than what's left (${formatCents(remainingCents)}).` };
  }
  return { ok: true, cents };
}

/**
 * One payment per line with something open, at what is open: what the organizer's Mark all as paid
 * records. Open is what is left minus what is pending, so a pending claim can still be confirmed
 * afterwards (BR-C13), and a line with nothing open is skipped.
 */
export function openLinePayments(card: CollectionCard): Omit<NewPayment, 'id'>[] {
  return [...card.owedToYou, ...card.youOwe]
    .filter((l) => l.openCents > 0)
    .map((l) => ({ debtor: l.debtor, creditor: l.creditor, amountCents: l.openCents }));
}

/**
 * What Mark all as paid sends on a joined card (AC-27.3): a claim per You owe line, which the
 * creditor must confirm, and a payment per Owed to you line, which counts at once. Each is at what
 * is open on the line, and a line with nothing open is skipped.
 */
export function joinedMarkAll(card: CollectionCard): {
  claims: Omit<NewClaim, 'id'>[];
  payments: Omit<NewPayment, 'id'>[];
} {
  const send = (l: CollectionLine) => ({
    debtor: l.debtor,
    creditor: l.creditor,
    amountCents: l.openCents,
  });
  return {
    claims: card.youOwe.filter((l) => l.openCents > 0).map(send),
    payments: card.owedToYou.filter((l) => l.openCents > 0).map(send),
  };
}

/**
 * A typed amount on a line, checked against what is open on it rather than what is left. Over the
 * cap with something pending, the message says so, because "more than what's left" alone would
 * look like a wrong figure when the rest is merely waiting (AC-20.4, AC-26.2). Every other message
 * is `parsePaymentAmount`'s.
 */
export function parseLineAmount(
  raw: string,
  line: Pick<CollectionLine, 'openCents' | 'pendingCents'>,
  side: 'debtor' | 'creditor',
): ParsedAmount {
  const parsed = parsePaymentAmount(raw, line.openCents);
  if (parsed.ok || line.pendingCents === 0 || !parsed.message.startsWith("That's more than")) {
    return parsed;
  }
  const waiting =
    side === 'debtor'
      ? `${formatCents(line.pendingCents)} is already waiting for confirmation.`
      : `${formatCents(line.pendingCents)} is waiting for you to confirm.`;
  return { ok: false, message: `${parsed.message} ${waiting}` };
}

/**
 * Whether a payment the server has confirmed should announce its session
 * settling. The card reads Settled from the on-screen payments, which include
 * any other payment still on its way, so it may only be believed once none is:
 * until then the later payment's own ending decides, and a refusal of it would
 * put the card back after the announcement could not be taken back.
 */
export function announcesSettled(paymentInFlight: boolean, bucket: Bucket | undefined): boolean {
  return !paymentInFlight && bucket === 'settled';
}

/** The Mark all as paid confirmation, naming each side that has something left. */
export function markAllMessage(card: CollectionCard): string {
  return markAllText(
    sessionDisplayTitle(card.session),
    card.owedToYouOpenCents,
    card.youOweOpenCents,
  );
}

/** The Mark all confirmation for the sides with something left; one that records everything at once. */
export function markAllText(title: string, owed: number, owe: number): string {
  const what =
    owed > 0 && owe > 0
      ? `the ${formatCents(owed)} still owed to you and the ${formatCents(owe)} you still owe`
      : owed > 0
        ? `the ${formatCents(owed)} still owed to you`
        : `the ${formatCents(owe)} you still owe`;
  return `This records ${what} on “${title}”, as one payment per person. You can undo each one on its own.`;
}

/**
 * The payments of a request that aren't on screen yet, stamped with the
 * device's time. A retry reuses its id, and if the first attempt landed after
 * all, a reload already shows it, so adding it again would show it twice. Only
 * these are taken off again if the request fails: the others are the server's.
 */
export function newPayments(
  existing: Payment[],
  incoming: NewPayment[],
  createdAt: string,
): Payment[] {
  const have = new Set(existing.map((p) => p.id));
  return incoming.filter((p) => !have.has(p.id)).map((p) => ({ ...p, createdAt }));
}

/** The claims of a request that aren't on screen yet, as `newPayments` does for payments. */
export function newClaims(existing: Claim[], incoming: NewClaim[], createdAt: string): Claim[] {
  const have = new Set(existing.map((c) => c.id));
  return incoming
    .filter((c) => !have.has(c.id))
    .map((c) => ({ ...c, createdAt, status: 'pending', decidedAt: null, mine: true }));
}

/**
 * Which payments one pair has, as a string that changes exactly when they do.
 * Sorted, because a reload re-stamps times with the server's and can reorder
 * them. A refusal notes it, so the refusal is dropped once the line moves on.
 */
export function pairPaymentIds(payments: Payment[], debtor: string, creditor: string): string {
  return payments
    .filter((p) => p.debtor === debtor && p.creditor === creditor)
    .map((p) => p.id)
    .sort()
    .join(' ');
}

/**
 * A session's payments after the server refused an add because the line had
 * less left than the device thought: the server's list, minus any undo still
 * in flight, plus any other add still in flight that the server hasn't got yet.
 */
export function mergeServerPayments<T extends { id: string }>(
  local: T[],
  server: T[],
  inFlightAdd: (id: string) => boolean,
  inFlightRemove: (id: string) => boolean,
): T[] {
  const serverIds = new Set(server.map((p) => p.id));
  return [
    ...server.filter((p) => !inFlightRemove(p.id)),
    ...local.filter((p) => inFlightAdd(p.id) && !serverIds.has(p.id)),
  ];
}
