import { buildDemoData } from './demoData';
import { createId } from './id';
import { sortNames } from './format';
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
    const [first] = openLinePayments(buildCard(picked, { displayName: null, nicknames: [] }));
    const half = first ? Math.floor(first.amountCents / 2) : 0;
    return { ...picked, payments: half > 0 ? paid([{ ...first, amountCents: half }]) : [] };
  }
  if (closedIndex === 2) {
    const picked = { ...session, me: 'Renmar' };
    return {
      ...picked,
      payments: paid(openLinePayments(buildCard(picked, { displayName: null, nicknames: [] }))),
    };
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
      finishedWithCollection: false,
      payments: [],
    };
    return status === 'closed' ? withCollectionState(session, closedIndex++) : session;
  });
}

/** Renames members throughout a generated record set, so a seeded session can hold any names. */
function renameMembers(
  demo: { members: string[]; records: PurchaseRecord[] },
  names: Record<string, string>,
): { members: string[]; records: PurchaseRecord[] } {
  const rename = (m: string) => names[m] ?? m;
  return {
    members: sortNames(demo.members.map(rename)),
    records: demo.records.map((record) => ({
      ...record,
      payors: record.payors.map((p) => ({ ...p, member: rename(p.member) })),
      items: record.items.map((item) =>
        item.mode === 'equal'
          ? { ...item, owners: item.owners.map(rename) }
          : {
              ...item,
              amounts: Object.fromEntries(
                Object.entries(item.amounts).map(([m, amount]) => [rename(m), amount]),
              ),
            },
      ),
    })),
  };
}

/**
 * Three finished sessions with no pick, for trying the Needs setup question
 * without finishing drafts by hand. Every name differs from the profile name
 * "Renmar" the other seeds use, so each one is unplaced whatever it is. Appended
 * only, never replacing anything.
 */
export function buildNeedsSetupSessions(): Session[] {
  const specs: { name: string; rename: Record<string, string>; endDaysAgo: number }[] = [
    // Shows the nickname prompt when "Red" is a saved other name, else the plain picker.
    { name: 'Needs setup: nickname Red', rename: { Renmar: 'Red' }, endDaysAgo: 3 },
    // Neither name: always the plain picker.
    { name: 'Needs setup: no known name', rename: { Renmar: 'Zed' }, endDaysAgo: 4 },
    // Both names: nothing preselected once Red and Pao are both saved.
    {
      name: 'Needs setup: Red and Pao',
      rename: { Renmar: 'Red', Jyllan: 'Pao' },
      endDaysAgo: 5,
    },
  ];
  return specs.map(({ name, rename, endDaysAgo }) => {
    const demo = renameMembers(buildDemoData(3, 10), rename);
    const records = shiftDates(demo.records.slice(0, 2), endDaysAgo);
    return {
      id: createId('session'),
      status: 'closed',
      createdAt: daysAgoIso(endDaysAgo + records.length + 1),
      closedAt: daysAgoIso(Math.max(0, endDaysAgo - 1)),
      members: demo.members,
      records,
      name,
      activityAt: null,
      me: null,
      finishedWithCollection: false,
      payments: [],
    };
  });
}
