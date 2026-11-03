import { getFinalSettlement, getNettedOwedMatrix, getRawOwedMatrix } from './calculations.js';
import { compareNames, formatMoney, sortNames } from './format.js';
import { roundMoney } from './money.js';
import { sessionDisplayTitle } from './sessionLabel.js';
import type { NewPayment, Payment, Session } from '../types';

/**
 * Everything Collection shows is derived here, on every render, from the
 * sessions, their payments and the profile name. Nothing derived is stored, so
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

/**
 * The one member whose name matches the profile name, ignoring case and
 * accents but not spaces (BR-4). More than one match is treated as none:
 * guessing between them would put payments on the wrong lines.
 */
export function matchMember(members: string[], profileName: string | null): string | null {
  if (profileName === null) return null;
  const hits = members.filter((m) => compareNames(m, profileName) === 0);
  return hits.length === 1 ? hits[0] : null;
}

export type Me =
  | { kind: 'member'; name: string; picked: boolean }
  | { kind: 'notInSession' }
  | { kind: 'unknown' };

/** BR-5: an explicit pick, then the profile match, then unknown (Needs setup). */
export function resolveMe(
  session: Pick<Session, 'me' | 'members'>,
  profileName: string | null,
): Me {
  if (session.me === NOT_IN_SESSION) return { kind: 'notInSession' };
  if (session.me !== null && session.members.includes(session.me)) {
    return { kind: 'member', name: session.me, picked: true };
  }
  const match = matchMember(session.members, profileName);
  return match === null ? { kind: 'unknown' } : { kind: 'member', name: match, picked: false };
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
};

function buildLine(
  pair: SettlementPair,
  direction: CollectionLine['direction'],
  payments: Payment[],
): CollectionLine {
  // A payment counts only on its exact pair; any other is hidden, not lost (BR-15).
  const mine = payments
    .filter((p) => p.debtor === pair.debtor && p.creditor === pair.creditor)
    .sort((a, b) => ms(b.createdAt) - ms(a.createdAt) || byId(b.id, a.id));
  const paidCents = mine.reduce((sum, p) => sum + p.amountCents, 0);
  const remainingCents = Math.max(0, pair.amountCents - paidCents);
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
  };
}

/** Lines with something left first, then alphabetical (BR-17a). */
const lineOrder = (a: CollectionLine, b: CollectionLine): number =>
  Number(b.remainingCents > 0) - Number(a.remainingCents > 0) || compareNames(a.other, b.other);

const sumRemaining = (lines: CollectionLine[]) =>
  lines.reduce((sum, l) => sum + l.remainingCents, 0);
const sumPaid = (lines: CollectionLine[]) => lines.reduce((sum, l) => sum + l.paidCents, 0);

export function buildCard(session: Session, profileName: string | null): CollectionCard {
  const me = resolveMe(session, profileName);
  const finishedAt = session.closedAt ?? session.createdAt;
  const owedToYou: CollectionLine[] = [];
  const youOwe: CollectionLine[] = [];

  if (me.kind === 'member') {
    // Only the lines involving the user are theirs to track (BR-2).
    for (const pair of settlementPairs(session)) {
      if (pair.creditor === me.name) owedToYou.push(buildLine(pair, 'owedToYou', session.payments));
      else if (pair.debtor === me.name) youOwe.push(buildLine(pair, 'youOwe', session.payments));
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

  return {
    session,
    me,
    bucket:
      me.kind === 'unknown'
        ? 'needsSetup'
        : settledLineCount === lines.length
          ? 'settled'
          : 'outstanding',
    owedToYou,
    youOwe,
    lineCount: lines.length,
    settledLineCount,
    owedToYouRemainingCents: sumRemaining(owedToYou),
    youOweRemainingCents: sumRemaining(youOwe),
    receivedCents: sumPaid(owedToYou),
    paidOutCents: sumPaid(youOwe),
    settledAt: latest?.createdAt ?? finishedAt,
  };
}

export type Collection = {
  needsSetup: CollectionCard[];
  outstanding: CollectionCard[];
  settled: CollectionCard[];
  /** Remaining on Outstanding cards only (BR-14). */
  owedToYouCents: number;
  youOweCents: number;
};

/** Finished sessions only (BR-1), sectioned and ordered as BR-17a sets out. */
export function buildCollection(sessions: Session[], profileName: string | null): Collection {
  const cards = sessions
    .filter((s) => s.status === 'closed')
    .map((s) => buildCard(s, profileName));
  const byFinished = (a: CollectionCard, b: CollectionCard) =>
    ms(b.session.closedAt) - ms(a.session.closedAt) || byId(a.session.id, b.session.id);
  const bySettled = (a: CollectionCard, b: CollectionCard) =>
    ms(b.settledAt) - ms(a.settledAt) || byId(a.session.id, b.session.id);

  const outstanding = cards.filter((c) => c.bucket === 'outstanding').sort(byFinished);
  return {
    needsSetup: cards.filter((c) => c.bucket === 'needsSetup').sort(byFinished),
    outstanding,
    settled: cards.filter((c) => c.bucket === 'settled').sort(bySettled),
    owedToYouCents: outstanding.reduce((sum, c) => sum + c.owedToYouRemainingCents, 0),
    youOweCents: outstanding.reduce((sum, c) => sum + c.youOweRemainingCents, 0),
  };
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

/** One payment per open line, at what is left on it: what Mark all as paid records. */
export function openLinePayments(card: CollectionCard): Omit<NewPayment, 'id'>[] {
  return [...card.owedToYou, ...card.youOwe]
    .filter((l) => l.remainingCents > 0)
    .map((l) => ({ debtor: l.debtor, creditor: l.creditor, amountCents: l.remainingCents }));
}

/** The Mark all as paid confirmation, naming each side that has something left. */
export function markAllMessage(card: CollectionCard): string {
  const title = sessionDisplayTitle(card.session);
  const owed = card.owedToYouRemainingCents;
  const owe = card.youOweRemainingCents;
  const what =
    owed > 0 && owe > 0
      ? `the ${formatCents(owed)} still owed to you and the ${formatCents(owe)} you still owe`
      : owed > 0
        ? `the ${formatCents(owed)} still owed to you`
        : `the ${formatCents(owe)} you still owe`;
  return `This records ${what} on “${title}”, as one payment per person. You can undo each one on its own.`;
}

/**
 * A session's payments after the server refused an add because the line had
 * less left than the device thought: the server's list, minus any undo still
 * in flight, plus any other add still in flight that the server hasn't got yet.
 */
export function mergeServerPayments(
  local: Payment[],
  server: Payment[],
  inFlightAdd: (id: string) => boolean,
  inFlightRemove: (id: string) => boolean,
): Payment[] {
  const serverIds = new Set(server.map((p) => p.id));
  return [
    ...server.filter((p) => !inFlightRemove(p.id)),
    ...local.filter((p) => inFlightAdd(p.id) && !serverIds.has(p.id)),
  ];
}
