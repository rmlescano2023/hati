import { PRACTICE_ID_PREFIX } from '../../../lib/practiceId';
import type { PaidByPick, PurchaseFormSeed, StagedItem } from '../../../lib/staging';
import type { BillLine, CustomAmountItem, EqualSplitItem, Session } from '../../../types';

export type ExpensesSceneId = 'X1' | 'X2' | 'X3' | 'X4';

export type ExpensesScene = {
  id: ExpensesSceneId;
  /** The practice draft the scene runs in. Never saved (BR-TG3). */
  session: Session;
  /** Seeds the practice's own Paid By memory. An unseeded card opens on it (X4). */
  paidBy: PaidByPick;
  /** What Purchase Details opens with. Omitted, it opens as a fresh visit does. */
  form?: PurchaseFormSeed;
  /** The staged list as the scene starts. */
  staged: StagedItem[];
};

export const PRACTICE_MEMBERS = ['Ana', 'Ben', 'Carla', 'Dino'];

/** The four scenes for `today` (ISO `YYYY-MM-DD`): every date in them is today (BR-TG16). */
export function expensesScenes(today: string): Record<ExpensesSceneId, ExpensesScene> {
  // A draft, which is what makes the Expenses form editable. Every scene shares it.
  const session: Session = {
    id: `${PRACTICE_ID_PREFIX}expenses`,
    status: 'draft',
    // The title reads the first 10 characters, so it says "Started <today>".
    createdAt: `${today}T12:00:00.000Z`,
    closedAt: null,
    members: PRACTICE_MEMBERS,
    records: [],
    name: 'Beach trip',
    activityAt: null,
    me: null,
    finishedWithCollection: false,
    payments: [],
  };
  const paidBy: PaidByPick = { payorMode: 'single', singlePayor: 'Ana' };

  const groceries: EqualSplitItem = {
    id: 'practice_groceries',
    mode: 'equal',
    name: 'Groceries',
    totalPrice: 1200,
    owners: ['Ana', 'Ben', 'Carla'],
  };

  // The receipt in BR-CA34 order: own orders by member then as added, shared, discounts, charges.
  // `dino` fills his blank order in, which is what Fill Remainder does at step E14.
  const dinner = (dino: boolean): CustomAmountItem => {
    const bill: BillLine[] = [
      { kind: 'order', member: 'Ana', name: 'Pork BBQ', amount: 180 },
      { kind: 'order', member: 'Ben', name: 'Chicken inasal', amount: 120 },
      { kind: 'order', member: 'Ben', name: 'Iced tea', amount: 40 },
      { kind: 'order', member: 'Carla', name: 'Pancit', amount: 150 },
      ...(dino ? [{ kind: 'order', member: 'Dino', name: '', amount: 120 } as const] : []),
      { kind: 'shared', members: PRACTICE_MEMBERS, name: 'Rice platter', amount: 200 },
      { kind: 'discount', members: ['Dino'], name: 'Senior discount', amount: 30 },
      { kind: 'charge', name: 'Service charge', amount: 80 },
    ];
    return {
      id: 'practice_dinner',
      mode: 'custom',
      name: 'Dinner at the grill',
      amounts: { Ana: 250, Ben: 230, Carla: 220, Dino: dino ? 160 : 40 },
      bill,
    };
  };

  const groceriesOnePayor: StagedItem = {
    item: groceries,
    date: today,
    payorMode: 'single',
    payors: [{ member: 'Ana', amount: 1200 }],
  };
  const groceriesTwoPayors: StagedItem = {
    item: groceries,
    date: today,
    payorMode: 'multiple',
    payors: [
      { member: 'Ana', amount: 700 },
      { member: 'Ben', amount: 500 },
    ],
  };

  return {
    X1: { id: 'X1', session, paidBy, form: { row: groceriesOnePayor }, staged: [] },
    X2: { id: 'X2', session, paidBy, form: { row: groceriesTwoPayors }, staged: [] },
    X3: {
      id: 'X3',
      session,
      paidBy,
      // Total Amount is 860.00 while only 740.00 is entered, so the footer shows the mismatch
      // and Fill Remainder has Dino's ₱120.00 to fill.
      form: {
        row: {
          item: dinner(false),
          date: today,
          payorMode: 'single',
          payors: [{ member: 'Ana', amount: 740 }],
        },
        totalAmount: 860,
      },
      staged: [],
    },
    X4: {
      id: 'X4',
      session,
      paidBy,
      staged: [
        groceriesTwoPayors,
        {
          item: dinner(true),
          date: today,
          payorMode: 'single',
          payors: [{ member: 'Ana', amount: 860 }],
        },
      ],
    },
  };
}
