import { describe, expect, it } from 'vitest';
import {
  buildRecords,
  contributionsMatch,
  purgeMemberFromStaged,
  readContributions,
  stagedNamesMember,
  type StagedItem,
} from './staging';
import { getItemShares, getRawOwedMatrix, groupRecordsForBreakdown } from './calculations';
import type {
  CustomAmountItem,
  EqualSplitItem,
  NewPurchaseRecord,
  PayorContribution,
  PurchaseRecord,
} from '../types';

/* ------------------------------- builders -------------------------------- */

let seq = 0;
const nextId = (p: string) => `${p}_${(seq += 1)}`;

const equalItem = (name: string, totalPrice: number, owners: string[]): EqualSplitItem => ({
  id: nextId('item'),
  mode: 'equal',
  name,
  totalPrice,
  owners,
});

const customItem = (name: string, amounts: Record<string, number>): CustomAmountItem => ({
  id: nextId('item'),
  mode: 'custom',
  name,
  amounts,
});

/** A One Payor staged item; its amount is ignored, as in the app. */
const stagedSingle = (
  date: string,
  payor: string,
  item: EqualSplitItem | CustomAmountItem,
): StagedItem => ({ item, date, payorMode: 'single', payors: [{ member: payor, amount: 0 }] });

const stagedMultiple = (
  date: string,
  payors: PayorContribution[],
  item: EqualSplitItem | CustomAmountItem,
): StagedItem => ({ item, date, payorMode: 'multiple', payors });

/** What the store does to a click's records: ids, and ascending createdAt in order. */
const toRecords = (inputs: NewPurchaseRecord[]): PurchaseRecord[] =>
  inputs.map((input, i) => ({
    ...input,
    id: nextId('rec'),
    createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
  }));

const members = ['Ana', 'Ben', 'Cy'];

/* ---------------------------- readContributions --------------------------- */

describe('readContributions', () => {
  it('rounds each value to the centavo', () => {
    expect(readContributions({ Ana: '100.004' }, ['Ana'])).toEqual([{ member: 'Ana', amount: 100 }]);
  });

  it('drops blank, zero, negative, unparseable and sub-centavo values', () => {
    const raw = { Ana: '', Ben: '0', Cy: '-5', Dee: 'abc', Eve: '0.004' };
    expect(readContributions(raw, ['Ana', 'Ben', 'Cy', 'Dee', 'Eve'])).toEqual([]);
  });

  it('keeps the order of the members, not of the keys', () => {
    const raw = { Cy: '30', Ana: '10', Ben: '20' };
    expect(readContributions(raw, members).map((p) => p.member)).toEqual(['Ana', 'Ben', 'Cy']);
  });

  it('ignores keys that are not current members', () => {
    expect(readContributions({ Ana: '10', Gone: '90' }, ['Ana'])).toEqual([
      { member: 'Ana', amount: 10 },
    ]);
  });
});

/* ---------------------------- contributionsMatch -------------------------- */

describe('contributionsMatch', () => {
  const pay = (...amounts: number[]): PayorContribution[] =>
    amounts.map((amount, i) => ({ member: members[i], amount }));

  it('is true only when the contributions add up to the item total', () => {
    expect(contributionsMatch(pay(200, 100), 300)).toBe(true);
    expect(contributionsMatch(pay(200, 50), 300)).toBe(false);
    expect(contributionsMatch(pay(250, 100), 300)).toBe(false);
  });

  it('allows a single contributor that covers the whole item', () => {
    expect(contributionsMatch(pay(300), 300)).toBe(true);
  });

  it('is false with no contributors or no item total', () => {
    expect(contributionsMatch([], 300)).toBe(false);
    expect(contributionsMatch(pay(0), 0)).toBe(false);
    expect(contributionsMatch(pay(100), 0)).toBe(false);
  });

  it('is not thrown off by float dust', () => {
    expect(contributionsMatch(pay(0.1, 0.2), 0.3)).toBe(true);
  });

  it('matches typed values that only agree once rounded to the centavo', () => {
    const read = readContributions({ Ana: '100.004', Ben: '199.996' }, members);
    expect(contributionsMatch(read, 300)).toBe(true);
  });
});

/* ------------------------------ buildRecords ------------------------------ */

describe('buildRecords', () => {
  it('files each date and payor into its own record, with the payor amount as the item total', () => {
    const taxi = equalItem('Taxi', 120, ['Ana', 'Ben']);
    const lunch = equalItem('Lunch', 90, ['Ana', 'Ben', 'Cy']);
    const hotel = customItem('Hotel', { Ana: 100, Cy: 50 });
    const records = buildRecords([
      stagedSingle('2026-11-12', 'Ana', taxi),
      stagedSingle('2026-11-12', 'Ben', lunch),
      stagedSingle('2026-11-13', 'Ana', hotel),
    ]);

    expect(records).toEqual([
      {
        date: '2026-11-12',
        payorMode: 'single',
        payors: [{ member: 'Ana', amount: 120 }],
        items: [taxi],
      },
      {
        date: '2026-11-12',
        payorMode: 'single',
        payors: [{ member: 'Ben', amount: 90 }],
        items: [lunch],
      },
      {
        date: '2026-11-13',
        payorMode: 'single',
        payors: [{ member: 'Ana', amount: 150 }],
        items: [hotel],
      },
    ]);
  });

  it('merges One Payor items with the same date and payor, in staging order', () => {
    const a = equalItem('A', 100, ['Ana']);
    const b = equalItem('B', 60, ['Ana']);
    const c = equalItem('C', 40.5, ['Ana']);
    const records = buildRecords([
      stagedSingle('2026-11-12', 'Ana', a),
      stagedSingle('2026-11-12', 'Ben', b),
      stagedSingle('2026-11-12', 'Ana', c),
    ]);

    expect(records).toHaveLength(2);
    expect(records[0].items).toEqual([a, c]);
    expect(records[0].payors).toEqual([{ member: 'Ana', amount: 140.5 }]);
    expect(records[1].items).toEqual([b]);
  });

  it('never merges Multiple Payors items, even with the same date and payors (BR-8)', () => {
    const one = equalItem('One', 300, ['Cy']);
    const two = equalItem('Two', 300, ['Cy']);
    const records = buildRecords([
      stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 240 }, { member: 'Ben', amount: 60 }], one),
      stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 60 }, { member: 'Ben', amount: 240 }], two),
    ]);

    expect(records).toHaveLength(2);
    expect(records[0].payors).toEqual([{ member: 'Ana', amount: 240 }, { member: 'Ben', amount: 60 }]);
    expect(records[1].payors).toEqual([{ member: 'Ana', amount: 60 }, { member: 'Ben', amount: 240 }]);

    // Breakdown still shows them as one card, with the contributions summed.
    const groups = groupRecordsForBreakdown(toRecords(records), members);
    expect(groups).toHaveLength(1);
    expect(groups[0].payors).toEqual([
      { member: 'Ana', amount: 300 },
      { member: 'Ben', amount: 300 },
    ]);
  });

  it('gives Cy owing Ana 240 and Ben 60 in the worked example (AC-3.4)', () => {
    const item1 = customItem('Item 1', { Cy: 300 });
    const item2 = equalItem('Item 2', 300, ['Ana', 'Ben']);
    const records = toRecords(
      buildRecords([
        stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 240 }, { member: 'Ben', amount: 60 }], item1),
        stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 60 }, { member: 'Ben', amount: 240 }], item2),
      ]),
    );
    const matrix = getRawOwedMatrix(records, members);
    expect(matrix.Ana.Cy).toBe(240);
    expect(matrix.Ben.Cy).toBe(60);
  });

  it('gives the same balances as building each item alone (BR-8)', () => {
    const staged: StagedItem[] = [
      stagedSingle('2026-11-12', 'Ana', equalItem('Taxi', 100, ['Ana', 'Ben', 'Cy'])),
      stagedMultiple('2026-11-12', [{ member: 'Ben', amount: 300 }], equalItem('Solo', 300, ['Ana', 'Cy'])),
      stagedMultiple(
        '2026-11-12',
        [{ member: 'Ana', amount: 240 }, { member: 'Ben', amount: 60 }],
        customItem('Split A', { Cy: 300, Ben: 10.01 }),
      ),
      stagedSingle('2026-11-13', 'Cy', equalItem('Coffee', 10, ['Ana', 'Ben', 'Cy'])),
      stagedMultiple(
        '2026-11-13',
        [{ member: 'Ana', amount: 60 }, { member: 'Cy', amount: 240 }],
        equalItem('Split B', 300, ['Ben', 'Cy', 'Ana']),
      ),
      stagedSingle('2026-11-12', 'Ana', customItem('Snacks', { Ben: 33.33, Cy: 11.11 })),
    ];

    const together = getRawOwedMatrix(toRecords(buildRecords(staged)), members);
    const alone = getRawOwedMatrix(toRecords(staged.flatMap((s) => buildRecords([s]))), members);
    expect(together).toEqual(alone);
  });

  it('files a one-contributor Multiple Payors item like a One Payor item (AC-2.6)', () => {
    const a = equalItem('A', 100, ['Ben']);
    const b = equalItem('B', 200, ['Ben']);
    const c = equalItem('C', 50, ['Ben']);
    const records = buildRecords([
      stagedSingle('2026-11-12', 'Ana', a),
      stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 200 }], b),
      stagedSingle('2026-11-12', 'Ana', c),
    ]);

    expect(records).toEqual([
      {
        date: '2026-11-12',
        payorMode: 'single',
        payors: [{ member: 'Ana', amount: 350 }],
        items: [a, b, c],
      },
    ]);
  });

  it('keeps the first-appearance order of the records', () => {
    const records = buildRecords([
      stagedSingle('2026-11-13', 'Ana', equalItem('A', 10, ['Ben'])),
      stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 5 }, { member: 'Cy', amount: 5 }], equalItem('B', 10, ['Ben'])),
      stagedSingle('2026-11-12', 'Ben', equalItem('C', 10, ['Ana'])),
      stagedSingle('2026-11-13', 'Ana', equalItem('D', 10, ['Ben'])),
    ]);

    expect(records.map((r) => r.items.map((i) => i.name))).toEqual([['A', 'D'], ['B'], ['C']]);
  });

  it('returns nothing for an empty list', () => {
    expect(buildRecords([])).toEqual([]);
  });
});

/* ------------------------- purgeMemberFromStaged -------------------------- */

describe('purgeMemberFromStaged', () => {
  it('drops an owner from an Equal Split item and shrinks the price, leaving other shares', () => {
    const item = equalItem('Dinner', 300, ['Ana', 'Ben', 'Cy']);
    const [kept] = purgeMemberFromStaged([stagedSingle('2026-11-12', 'Ana', item)], 'Cy');

    expect(kept.item).toMatchObject({ mode: 'equal', totalPrice: 200, owners: ['Ana', 'Ben'] });
    const before = getItemShares(item);
    const after = getItemShares(kept.item);
    expect(after.Ana).toBe(before.Ana);
    expect(after.Ben).toBe(before.Ben);
  });

  it("drops a Custom item's amount for the member", () => {
    const item = customItem('Rooms', { Ana: 100, Cy: 50 });
    const [kept] = purgeMemberFromStaged([stagedSingle('2026-11-12', 'Ana', item)], 'Cy');
    expect(kept.item).toMatchObject({ mode: 'custom', amounts: { Ana: 100 } });
  });

  it('removes a One Payor item that the member paid', () => {
    const staged = [stagedSingle('2026-11-12', 'Cy', equalItem('Taxi', 90, ['Ana', 'Ben']))];
    expect(purgeMemberFromStaged(staged, 'Cy')).toEqual([]);
  });

  it('keeps a Multiple Payors item with the remaining contributor, item unchanged', () => {
    const item = equalItem('Dinner', 300, ['Ana', 'Ben']);
    const staged = [
      stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 200 }, { member: 'Cy', amount: 100 }], item),
    ];
    const [kept] = purgeMemberFromStaged(staged, 'Cy');

    expect(kept.payors).toEqual([{ member: 'Ana', amount: 200 }]);
    expect(kept.item).toBe(item);
  });

  it('removes an item whose only owner was the member', () => {
    const staged = [stagedSingle('2026-11-12', 'Ana', equalItem('Gift', 50, ['Cy']))];
    expect(purgeMemberFromStaged(staged, 'Cy')).toEqual([]);
  });

  it('returns an item that does not name the member as the same object', () => {
    const untouched = stagedSingle('2026-11-12', 'Ana', equalItem('Taxi', 90, ['Ana', 'Ben']));
    const [kept] = purgeMemberFromStaged([untouched], 'Cy');
    expect(kept).toBe(untouched);
  });

  it('empties the list once every member is purged (the Clear All end state)', () => {
    const staged = [
      stagedSingle('2026-11-12', 'Ana', equalItem('Taxi', 90, ['Ana', 'Ben', 'Cy'])),
      stagedMultiple('2026-11-12', [{ member: 'Ben', amount: 5 }, { member: 'Cy', amount: 5 }], customItem('X', { Ana: 10 })),
    ];
    expect(members.reduce(purgeMemberFromStaged, staged)).toEqual([]);
  });
});

/* --------------------------- stagedNamesMember ---------------------------- */

describe('stagedNamesMember', () => {
  it('is true for an owner, a custom amount, a single payor and a contributor', () => {
    const owner = [stagedSingle('2026-11-12', 'Ana', equalItem('A', 10, ['Cy']))];
    const amount = [stagedSingle('2026-11-12', 'Ana', customItem('B', { Cy: 10 }))];
    const payor = [stagedSingle('2026-11-12', 'Cy', equalItem('C', 10, ['Ana']))];
    const contributor = [
      stagedMultiple('2026-11-12', [{ member: 'Ana', amount: 5 }, { member: 'Cy', amount: 5 }], equalItem('D', 10, ['Ana'])),
    ];

    for (const staged of [owner, amount, payor, contributor]) {
      expect(stagedNamesMember(staged, 'Cy')).toBe(true);
    }
  });

  it('is false when the member is not named', () => {
    const staged = [stagedSingle('2026-11-12', 'Ana', equalItem('A', 10, ['Ana', 'Ben']))];
    expect(stagedNamesMember(staged, 'Cy')).toBe(false);
    expect(stagedNamesMember([], 'Cy')).toBe(false);
  });
});
