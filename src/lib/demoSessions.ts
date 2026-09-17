import { buildDemoData } from './demoData';
import { createId } from './id';
import type { PurchaseRecord, Session } from '../types';

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

  // Closed: recent through to a year old, which is also the case that proves
  // the 7-day freeze never gates the SOA export.
  { status: 'closed', members: 3, purchases: 4, endDaysAgo: 18, closedAfterDays: 4 },
  { status: 'closed', members: 5, purchases: 2, endDaysAgo: 44, closedAfterDays: 6 },
  { status: 'closed', members: 2, purchases: 5, endDaysAgo: 78, closedAfterDays: 4 },
  { status: 'closed', members: 8, purchases: 6, endDaysAgo: 399, closedAfterDays: 5 },
];

export function buildDemoSessions(): Session[] {
  return SPECS.map(({ status, members, purchases, endDaysAgo, closedAfterDays = 0 }) => {
    const demo = buildDemoData(members, 5 * purchases);
    const records = shiftDates(demo.records.slice(0, purchases), endDaysAgo);
    // An empty draft was never started long ago; anything else predates its
    // earliest purchase by a couple of days.
    const createdDaysAgo = purchases === 0 ? 0 : endDaysAgo + records.length + 1;

    return {
      id: createId('session'),
      status,
      createdAt: daysAgoIso(createdDaysAgo),
      closedAt: status === 'closed' ? daysAgoIso(Math.max(0, endDaysAgo - closedAfterDays)) : null,
      members: demo.members,
      records,
    };
  });
}
