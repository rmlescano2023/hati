import { buildDemoData } from './demoData';
import { createId } from './id';
import { NOT_IN_SESSION, buildCard, openLinePayments } from './collection';
import type { Payment, PurchaseRecord, Session } from '../types';

/**
 * A spread of draft and closed sessions for exercising Home and History
 * without clicking through a dozen of them by hand. Dev-only — this module is
 * only ever imported behind `import.meta.env.DEV`, so the bundler drops it and
 * `demoData` from a production build.
 */

const DAY_MS = 86_400_000;

const daysAgoIso = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();
const daysAgoDate = (days: number) => daysAgoIso(days).slice(0, 10);

/**
 * Re-date a generated record set so it sits `endDaysAgo` back, spread over
 * consecutive days. `buildDemoData` always produces the same April 2026 dates,
 * which would leave every seeded session looking identical on Home.
 */
function shiftDates(records: PurchaseRecord[], endDaysAgo: number): PurchaseRecord[] {
  const distinct = [...new Set(records.map((r) => r.date))].sort();
  const offsets = new Map(
    distinct.map((date, i) => [date, endDaysAgo + (distinct.length - 1 - i)]),
  );

  return records.map((record) => {
    const days = offsets.get(record.date) ?? endDaysAgo;
    return {
      ...record,
      id: createId('rec'),
      date: daysAgoDate(days),
      createdAt: daysAgoIso(days),
    };
  });
}

type Spec = {
  status: 'draft' | 'closed';
  members: number;
  /**
   * How many purchases to keep. `buildDemoData` always returns the same handful
   * of records whatever the item count, so without trimming every seeded
   * session would claim the same purchase count on its card.
   */
  purchases: number;
  /** How far back the session's most recent purchase sits. */
  endDaysAgo: number;
  /** For closed sessions, how long after the last purchase it was filed. */
  closedAfterDays?: number;
};

const SPECS: Spec[] = [
  // Drafts: a small recent one, a bigger older one, plus an empty one so the
  // "Started <date>" fallback on the card is visible.
  { status: 'draft', members: 4, purchases: 3, endDaysAgo: 1 },
  { status: 'draft', members: 6, purchases: 5, endDaysAgo: 9 },
  { status: 'draft', members: 3, purchases: 0, endDaysAgo: 0 },

  // Closed: recent through to a year old, which proves a session's age never
  // gates the SOA export.
  { status: 'closed', members: 3, purchases: 4, endDaysAgo: 18, closedAfterDays: 4 },
  { status: 'closed', members: 5, purchases: 2, endDaysAgo: 44, closedAfterDays: 6 },
  { status: 'closed', members: 2, purchases: 5, endDaysAgo: 78, closedAfterDays: 4 },
  { status: 'closed', members: 8, purchases: 6, endDaysAgo: 399, closedAfterDays: 5 },
];

/**
 * One closed session per Collection state, in the order the closed specs are
 * listed: matched by the profile name "Renmar" (or Needs setup without it),
 * part paid, fully settled, and not in the session. The time is the device's,
 * where the server would stamp its own (A4).
 */
function withCollectionState(session: Session, closedIndex: number): Session {
  const paid = (entries: Omit<Payment, 'id' | 'createdAt'>[]): Payment[] =>
    entries.map((p) => ({ ...p, id: createId('pay'), createdAt: new Date().toISOString() }));

  if (closedIndex === 1) {
    const picked = { ...session, me: 'Renmar' };
    const [first] = openLinePayments(buildCard(picked, null));
    const half = first ? Math.floor(first.amountCents / 2) : 0;
    return { ...picked, payments: half > 0 ? paid([{ ...first, amountCents: half }]) : [] };
  }
  if (closedIndex === 2) {
    const picked = { ...session, me: 'Renmar' };
    return { ...picked, payments: paid(openLinePayments(buildCard(picked, null))) };
  }
  if (closedIndex === 3) return { ...session, me: NOT_IN_SESSION };
  return session;
}

export function buildDemoSessions(): Session[] {
  let closedIndex = 0;
  return SPECS.map(({ status, members, purchases, endDaysAgo, closedAfterDays = 0 }) => {
    const demo = buildDemoData(members, 5 * purchases);
    const records = shiftDates(demo.records.slice(0, purchases), endDaysAgo);
    // An empty draft was never started long ago; anything else predates its
    // earliest purchase by a couple of days.
    const createdDaysAgo = purchases === 0 ? 0 : endDaysAgo + records.length + 1;

    const session: Session = {
      id: createId('session'),
      status,
      createdAt: daysAgoIso(createdDaysAgo),
      closedAt: status === 'closed' ? daysAgoIso(Math.max(0, endDaysAgo - closedAfterDays)) : null,
      members: demo.members,
      records,
      name: null,
      activityAt: null,
      me: null,
      payments: [],
    };
    return status === 'closed' ? withCollectionState(session, closedIndex++) : session;
  });
}
