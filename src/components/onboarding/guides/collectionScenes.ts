import { settlePayments } from '../../../lib/collection';
import { PRACTICE_ID_PREFIX } from '../../../lib/practiceId';
import type { EqualSplitItem, Payment, PurchaseRecord, Session } from '../../../types';

export type CollectionSceneId = 'K1' | 'K2' | 'K3';

export type CollectionScene = {
  id: CollectionSceneId;
  /** The finished practice sessions. Never saved (BR-TG3). */
  sessions: Session[];
  /** The card open as the scene starts. */
  openSessionId?: string;
};

export const PRACTICE_BEACH_ID = `${PRACTICE_ID_PREFIX}beach`;

/** The three scenes, dated relative to `now` (BR-TG16). */
export function collectionScenes(now: Date): Record<CollectionSceneId, CollectionScene> {
  // Noon, so a day is the same calendar day in every timezone a tester might be in.
  const moved = (n: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 12, 0, 0);
  const daysAgo = (n: number) => moved(n).toISOString();
  // The local calendar day, worked as `todayIso` does.
  const dayOf = (n: number) => {
    const d = moved(n);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  };

  const equal = (
    id: string,
    name: string,
    totalPrice: number,
    owners: string[],
  ): EqualSplitItem => ({
    id,
    mode: 'equal',
    name,
    totalPrice,
    owners,
  });
  const rec = (day: number, payor: string, item: EqualSplitItem): PurchaseRecord => ({
    id: `${item.id}_rec`,
    date: dayOf(day),
    payorMode: 'single',
    payors: [{ member: payor, amount: item.totalPrice }],
    items: [item],
    createdAt: daysAgo(day),
  });
  const pay = (
    id: string,
    debtor: string,
    creditor: string,
    amountCents: number,
    day: number,
  ): Payment => ({
    id,
    debtor,
    creditor,
    amountCents,
    createdAt: daysAgo(day),
  });
  // Every session is finished with Collection, so none is offered "Already settled" (AC-TG7.7).
  const finished = (
    id: string,
    name: string,
    created: number,
    closed: number,
    members: string[],
    records: PurchaseRecord[],
    payments: Payment[],
  ): Session => ({
    id: `${PRACTICE_ID_PREFIX}${id}`,
    status: 'closed',
    createdAt: daysAgo(created),
    closedAt: daysAgo(closed),
    members,
    records,
    name,
    activityAt: null,
    me: null,
    finishedWithCollection: true,
    payments,
  });

  // Ana's lines, by pairwise netting: Ben owes her 1,250.00 (1,000 + 250), Carla 430.00
  // (1,000 less the 570 she is owed back), and she owes Dino 150.00 (1,150 less the 1,000 he owes).
  const beach = finished(
    'beach',
    'Beach trip',
    6,
    3,
    ['Ana', 'Ben', 'Carla', 'Dino'],
    [
      rec(
        5,
        'Ana',
        equal('practice_cottage', 'Cottage rental', 4000, ['Ana', 'Ben', 'Carla', 'Dino']),
      ),
      rec(5, 'Ana', equal('practice_fuel', 'Fuel', 500, ['Ana', 'Ben'])),
      rec(4, 'Carla', equal('practice_groceries', 'Groceries', 1140, ['Ana', 'Carla'])),
      rec(4, 'Dino', equal('practice_boat', 'Island hopping boat', 2300, ['Ana', 'Dino'])),
    ],
    [pay('pay_practiceCarla', 'Carla', 'Ana', 20000, 2)],
  );
  // "Anna" isn't "Ana", so Hati can't place it and it needs setup (C2).
  const movie = finished(
    'movie',
    'Movie night',
    11,
    10,
    ['Anna', 'Ben', 'Carla'],
    [
      rec(
        11,
        'Ben',
        equal('practice_tickets', 'Movie tickets and popcorn', 1500, ['Anna', 'Ben', 'Carla']),
      ),
    ],
    [],
  );
  const karaoke = finished(
    'karaoke',
    'Karaoke night',
    22,
    21,
    ['Ana', 'Ben'],
    [rec(22, 'Ana', equal('practice_room', 'Karaoke room', 1200, ['Ana', 'Ben']))],
    [pay('pay_practiceBen', 'Ben', 'Ana', 60000, 14)],
  );

  const sessions = [beach, movie, karaoke];
  // What Mark all at C6 records: Ben 1,250.00, Carla 230.00 and Dino 150.00 (scene K3).
  const markAll = settlePayments(beach).map((p, i) => ({
    ...p,
    id: `pay_practiceSettle${i}`,
    createdAt: now.toISOString(),
  }));

  return {
    K1: { id: 'K1', sessions },
    K2: { id: 'K2', sessions, openSessionId: PRACTICE_BEACH_ID },
    K3: {
      id: 'K3',
      sessions: [{ ...beach, payments: [...beach.payments, ...markAll] }, movie, karaoke],
    },
  };
}
