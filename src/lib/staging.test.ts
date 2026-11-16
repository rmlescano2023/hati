import { describe, expect, it } from 'vitest';
import {
  applyItemEdit,
  buildRecords,
  contributionsMatch,
  findSavedItem,
  purgeMemberFromStaged,
  readContributions,
  sameStaged,
  stagedFromSaved,
  stagedNamesMember,
  type StagedItem,
} from './staging';
import {
  getItemShares,
  getItemTotal,
  getRawOwedMatrix,
  groupRecordsForBreakdown,
} from './calculations';
import { exampleB, exampleD1 } from './billExamples';
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
    expect(readContributions({ Ana: '100.004' }, ['Ana'])).toEqual([
      { member: 'Ana', amount: 100 },
    ]);
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
      stagedMultiple(
        '2026-11-12',
        [
          { member: 'Ana', amount: 240 },
          { member: 'Ben', amount: 60 },
        ],
        one,
      ),
      stagedMultiple(
        '2026-11-12',
        [
          { member: 'Ana', amount: 60 },
          { member: 'Ben', amount: 240 },
        ],
        two,
      ),
    ]);

    expect(records).toHaveLength(2);
    expect(records[0].payors).toEqual([
      { member: 'Ana', amount: 240 },
      { member: 'Ben', amount: 60 },
    ]);
    expect(records[1].payors).toEqual([
      { member: 'Ana', amount: 60 },
      { member: 'Ben', amount: 240 },
    ]);

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
        stagedMultiple(
          '2026-11-12',
          [
            { member: 'Ana', amount: 240 },
            { member: 'Ben', amount: 60 },
          ],
          item1,
        ),
        stagedMultiple(
          '2026-11-12',
          [
            { member: 'Ana', amount: 60 },
            { member: 'Ben', amount: 240 },
          ],
          item2,
        ),
      ]),
    );
    const matrix = getRawOwedMatrix(records, members);
    expect(matrix.Ana.Cy).toBe(240);
    expect(matrix.Ben.Cy).toBe(60);
  });

  it('gives the same balances as building each item alone (BR-8)', () => {
    const staged: StagedItem[] = [
      stagedSingle('2026-11-12', 'Ana', equalItem('Taxi', 100, ['Ana', 'Ben', 'Cy'])),
      stagedMultiple(
        '2026-11-12',
        [{ member: 'Ben', amount: 300 }],
        equalItem('Solo', 300, ['Ana', 'Cy']),
      ),
      stagedMultiple(
        '2026-11-12',
        [
          { member: 'Ana', amount: 240 },
          { member: 'Ben', amount: 60 },
        ],
        customItem('Split A', { Cy: 300, Ben: 10.01 }),
      ),
      stagedSingle('2026-11-13', 'Cy', equalItem('Coffee', 10, ['Ana', 'Ben', 'Cy'])),
      stagedMultiple(
        '2026-11-13',
        [
          { member: 'Ana', amount: 60 },
          { member: 'Cy', amount: 240 },
        ],
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
      stagedMultiple(
        '2026-11-12',
        [
          { member: 'Ana', amount: 5 },
          { member: 'Cy', amount: 5 },
        ],
        equalItem('B', 10, ['Ben']),
      ),
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
      stagedMultiple(
        '2026-11-12',
        [
          { member: 'Ana', amount: 200 },
          { member: 'Cy', amount: 100 },
        ],
        item,
      ),
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
      stagedMultiple(
        '2026-11-12',
        [
          { member: 'Ben', amount: 5 },
          { member: 'Cy', amount: 5 },
        ],
        customItem('X', { Ana: 10 }),
      ),
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
      stagedMultiple(
        '2026-11-12',
        [
          { member: 'Ana', amount: 5 },
          { member: 'Cy', amount: 5 },
        ],
        equalItem('D', 10, ['Ana']),
      ),
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

/* ----------------------------- saved-item edits ---------------------------- */

const savedRecord = (
  date: string,
  payors: PayorContribution[],
  items: (EqualSplitItem | CustomAmountItem)[],
  createdSecond: number,
): PurchaseRecord => ({
  id: nextId('rec'),
  date,
  payorMode: payors.length > 1 ? 'multiple' : 'single',
  payors,
  items,
  createdAt: new Date(2026, 0, 1, 0, 0, createdSecond).toISOString(),
});

/** A single record, whose payor amount is the sum of its items, as buildRecords makes it. */
const singleRecord = (
  date: string,
  payor: string,
  items: (EqualSplitItem | CustomAmountItem)[],
  createdSecond = 0,
) =>
  savedRecord(
    date,
    [{ member: payor, amount: items.reduce((sum, i) => sum + getItemTotal(i), 0) }],
    items,
    createdSecond,
  );

const FRESH = { id: 'rec_fresh', createdAt: new Date(2026, 5, 1).toISOString() };

const refOf = (record: PurchaseRecord, item: { id: string; name: string }) => ({
  recordId: record.id,
  itemId: item.id,
  name: item.name,
});

describe('findSavedItem', () => {
  it('finds an item by record and item id, and nothing else', () => {
    const a = equalItem('A', 10, ['Ana']);
    const b = equalItem('B', 20, ['Ana']);
    const r1 = singleRecord('2026-11-12', 'Ana', [a]);
    const r2 = singleRecord('2026-11-13', 'Ana', [b]);
    const records = [r1, r2];

    expect(findSavedItem(records, { recordId: r1.id, itemId: a.id })).toEqual({
      record: r1,
      item: a,
    });
    expect(findSavedItem(records, { recordId: 'nope', itemId: a.id })).toBeNull();
    expect(findSavedItem(records, { recordId: r1.id, itemId: 'nope' })).toBeNull();
    // An item that sits in another record is not found through this one.
    expect(findSavedItem(records, { recordId: r1.id, itemId: b.id })).toBeNull();
  });
});

describe('stagedFromSaved', () => {
  it('loads a One Payor record as One Payor, with the item total as the amount', () => {
    const x = equalItem('X', 90, ['Ana', 'Ben']);
    const y = customItem('Y', { Cy: 40 });
    const record = singleRecord('2026-11-12', 'Ana', [x, y]);
    expect(stagedFromSaved(record, y)).toEqual({
      item: y,
      date: '2026-11-12',
      payorMode: 'single',
      payors: [{ member: 'Ana', amount: 40 }],
    });
  });

  it('loads a Multiple Payors record with one item as it is, even if it no longer adds up', () => {
    const x = equalItem('X', 100, ['Cy']);
    const record = savedRecord(
      '2026-11-12',
      [
        { member: 'Ana', amount: 60 },
        { member: 'Ben', amount: 30 },
      ],
      [x],
      0,
    );
    const staged = stagedFromSaved(record, x);
    expect(staged.payorMode).toBe('multiple');
    expect(staged.payors).toEqual(record.payors);
    expect(staged.payors).not.toBe(record.payors);
  });

  it("splits a pre-flexible-Paid-By record's contributions across its items in proportion", () => {
    const x = customItem('X', { Cy: 700 });
    const y = equalItem('Y', 300, ['Cy']);
    const record = savedRecord(
      '2026-11-12',
      [
        { member: 'Ana', amount: 600 },
        { member: 'Ben', amount: 400 },
      ],
      [x, y],
      0,
    );
    expect(stagedFromSaved(record, y).payors).toEqual([
      { member: 'Ana', amount: 180 },
      { member: 'Ben', amount: 120 },
    ]);
  });

  it('leaves out a payor whose share rounds to nothing', () => {
    const x = customItem('X', { Cy: 999.99 });
    const y = equalItem('Y', 0.01, ['Cy']);
    const record = savedRecord(
      '2026-11-12',
      [
        { member: 'Ana', amount: 0.01 },
        { member: 'Ben', amount: 999.99 },
      ],
      [x, y],
      0,
    );
    const { payors } = stagedFromSaved(record, y);
    expect(payors.map((p) => p.member)).toEqual(['Ben']);
    expect(payors[0].amount).toBe(0.01);
  });
});

describe('sameStaged', () => {
  const build = (price: number, date = '2026-11-12', payor = 'Ana') =>
    stagedSingle(date, payor, {
      id: 'item_s',
      mode: 'equal',
      name: 'S',
      totalPrice: price,
      owners: ['Ben'],
    });

  it('is true for two stamps of the same fields', () => {
    expect(sameStaged(build(10), build(10))).toBe(true);
  });

  it('is false when a centavo or the date differs', () => {
    expect(sameStaged(build(10), build(10.01))).toBe(false);
    expect(sameStaged(build(10), build(10, '2026-11-13'))).toBe(false);
  });
});

describe('applyItemEdit, in place', () => {
  it('replaces the item at its index with the same id, and the single payor amount follows', () => {
    const a = equalItem('A', 100, ['Ben']);
    const b = equalItem('B', 50, ['Ben']);
    const c = equalItem('C', 25, ['Ben']);
    const other = singleRecord('2026-11-14', 'Ben', [equalItem('Z', 5, ['Ana'])]);
    const record = singleRecord('2026-11-12', 'Ana', [a, b, c]);
    const records = [record, other];

    const next = stagedSingle('2026-11-12', 'Ana', { ...b, totalPrice: 80 });
    const result = applyItemEdit(records, refOf(record, b), next, FRESH);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(record.id);
    expect(result[0].items.map((i) => i.id)).toEqual([a.id, b.id, c.id]);
    expect(getItemTotal(result[0].items[1])).toBe(80);
    expect(result[0].payors).toEqual([{ member: 'Ana', amount: 205 }]);
    expect(result[1]).toBe(other);
  });

  it('keeps the payors of a Multiple Payors record', () => {
    const x = equalItem('X', 100, ['Cy']);
    const record = savedRecord(
      '2026-11-12',
      [
        { member: 'Ana', amount: 60 },
        { member: 'Ben', amount: 40 },
      ],
      [x],
      0,
    );
    const next = stagedMultiple(
      '2026-11-12',
      [
        { member: 'Ana', amount: 60 },
        { member: 'Ben', amount: 40 },
      ],
      { ...x, name: 'Renamed' },
    );
    const [result] = applyItemEdit([record], refOf(record, x), next, FRESH);
    expect(result.payors).toEqual(record.payors);
    expect(result.items[0].name).toBe('Renamed');
  });
});

describe('applyItemEdit, moved', () => {
  it('moves the item to the end of the card for its new date, and the old record keeps the rest', () => {
    const a = equalItem('A', 100, ['Ben']);
    const b = equalItem('B', 50, ['Ben']);
    const c = equalItem('C', 25, ['Ben']);
    const old = singleRecord('2026-11-12', 'Ana', [a, b, c], 1);
    const target = singleRecord('2026-11-13', 'Ana', [equalItem('T', 10, ['Ben'])], 2);

    const next = stagedSingle('2026-11-13', 'Ana', b);
    const result = applyItemEdit([old, target], refOf(old, b), next, FRESH);

    expect(result).toHaveLength(3);
    expect(result[0].items.map((i) => i.id)).toEqual([a.id, c.id]);
    expect(result[0].payors).toEqual([{ member: 'Ana', amount: 125 }]);
    expect(result[2]).toEqual({
      id: FRESH.id,
      createdAt: FRESH.createdAt,
      date: '2026-11-13',
      payorMode: 'single',
      payors: [{ member: 'Ana', amount: 50 }],
      items: [b],
    });
    // The item exists exactly once.
    expect(result.flatMap((r) => r.items).filter((i) => i.id === b.id)).toHaveLength(1);

    const card = groupRecordsForBreakdown(result, members).find((g) => g.date === '2026-11-13');
    expect(card?.rows.map((r) => r.item.id)).toEqual([target.items[0].id, b.id]);
  });

  it('removes the old record when it held only that item, and its card goes', () => {
    const only = equalItem('Only', 40, ['Ben']);
    const old = singleRecord('2026-11-12', 'Ana', [only]);
    const result = applyItemEdit(
      [old],
      refOf(old, only),
      stagedSingle('2026-11-15', 'Ana', only),
      FRESH,
    );
    expect(result.map((r) => r.id)).toEqual([FRESH.id]);
    expect(groupRecordsForBreakdown(result, members).map((g) => g.date)).toEqual(['2026-11-15']);
  });

  it('files a move to Multiple Payors as a record of its own, and balances follow its weights', () => {
    const a = equalItem('A', 100, ['Cy']);
    const b = equalItem('B', 1830, ['Cy']);
    const old = singleRecord('2026-11-12', 'Ana', [a, b]);
    const next = stagedMultiple(
      '2026-11-12',
      [
        { member: 'Ana', amount: 1000 },
        { member: 'Ben', amount: 830 },
      ],
      b,
    );
    const result = applyItemEdit([old], refOf(old, b), next, FRESH);

    expect(result[1].payorMode).toBe('multiple');
    expect(result[1].items).toEqual([b]);
    const matrix = getRawOwedMatrix(result, members);
    // Cy owes Ana 100 for A plus her share of B, and Ben his share of B.
    expect(matrix.Ben.Cy).toBe(830);
    expect(matrix.Ana.Cy).toBe(1100);
  });

  it('files a Multiple Payors item with one contributor as a One Payor record', () => {
    const a = equalItem('A', 100, ['Cy']);
    const b = equalItem('B', 50, ['Cy']);
    const old = singleRecord('2026-11-12', 'Ana', [a, b]);
    const next = stagedMultiple('2026-11-12', [{ member: 'Ben', amount: 50 }], b);
    const result = applyItemEdit([old], refOf(old, b), next, FRESH);
    expect(result[1].payorMode).toBe('single');
    expect(result[1].payors).toEqual([{ member: 'Ben', amount: 50 }]);
  });

  it('returns the very same array when the item has gone, and writes nothing', () => {
    const a = equalItem('A', 100, ['Cy']);
    const old = singleRecord('2026-11-12', 'Ana', [a]);
    const records = [old];
    const result = applyItemEdit(
      records,
      { recordId: old.id, itemId: 'gone' },
      stagedSingle('2026-11-12', 'Ana', a),
      FRESH,
    );
    expect(result).toBe(records);
  });

  it('does not mutate its input', () => {
    const a = equalItem('A', 100, ['Cy']);
    const b = equalItem('B', 50, ['Cy']);
    const old = singleRecord('2026-11-12', 'Ana', [a, b]);
    const records = [old];
    const before = JSON.parse(JSON.stringify(records));
    applyItemEdit(records, refOf(old, b), stagedSingle('2026-11-20', 'Ben', b), FRESH);
    applyItemEdit(
      records,
      refOf(old, b),
      stagedSingle('2026-11-12', 'Ana', { ...b, totalPrice: 9 }),
      FRESH,
    );
    expect(records).toEqual(before);
  });
});

describe('applyItemEdit, records from before flexible Paid By', () => {
  const trio = ['Ana', 'Ben', 'Cy', 'Dee'];

  it('splits the contributions when only the date changes, and no balance moves', () => {
    const x = customItem('X', { Cy: 700 });
    const y = equalItem('Y', 300, ['Cy']);
    const old = savedRecord(
      '2026-11-12',
      [
        { member: 'Ana', amount: 600 },
        { member: 'Ben', amount: 400 },
      ],
      [x, y],
      0,
    );
    const before = getRawOwedMatrix([old], trio);
    const loaded = stagedFromSaved(old, y);
    const result = applyItemEdit([old], refOf(old, y), { ...loaded, date: '2026-11-20' }, FRESH);

    expect(result[0].payors).toEqual([
      { member: 'Ana', amount: 420 },
      { member: 'Ben', amount: 280 },
    ]);
    expect(result[1].payors).toEqual([
      { member: 'Ana', amount: 180 },
      { member: 'Ben', amount: 120 },
    ]);
    const after = getRawOwedMatrix(result, trio);
    expect(after).toEqual(before);
    expect(after.Ana.Cy).toBe(600);
    expect(after.Ben.Cy).toBe(400);
  });

  it('splits to the centavo: three payors of 1.00 and items of 1.00 and 2.00', () => {
    const x = equalItem('X', 1, ['Dee']);
    const y = equalItem('Y', 2, ['Dee']);
    const old = savedRecord(
      '2026-11-12',
      [
        { member: 'Ana', amount: 1 },
        { member: 'Ben', amount: 1 },
        { member: 'Cy', amount: 1 },
      ],
      [x, y],
      0,
    );
    const before = getRawOwedMatrix([old], trio);
    const loaded = stagedFromSaved(old, x);
    const result = applyItemEdit([old], refOf(old, x), { ...loaded, date: '2026-11-20' }, FRESH);

    expect(result[1].payors.map((p) => p.amount)).toEqual([0.34, 0.33, 0.33]);
    expect(result[0].payors.map((p) => p.amount)).toEqual([0.66, 0.67, 0.67]);
    const after = getRawOwedMatrix(result, trio);
    expect(after).toEqual(before);
    expect(after.Ana.Dee).toBe(1);
    expect(after.Ben.Dee).toBe(1);
    expect(after.Cy.Dee).toBe(1);
  });

  it('never leaves a negative contribution when the contributions fall short of the item', () => {
    // Ben was removed, so what is left (Ana 100) is under the moved item's 200 of a 300 record.
    const x = equalItem('X', 100, ['Cy']);
    const y = equalItem('Y', 200, ['Cy']);
    const old = savedRecord('2026-11-12', [{ member: 'Ana', amount: 100 }], [x, y], 0);
    old.payorMode = 'multiple';
    const loaded = stagedFromSaved(old, y);
    const result = applyItemEdit([old], refOf(old, y), { ...loaded, date: '2026-11-20' }, FRESH);

    expect(result[0].payors).toEqual([{ member: 'Ana', amount: 100 }]);
    for (const r of result) for (const p of r.payors) expect(p.amount).toBeGreaterThanOrEqual(0);
  });

  it('files a real Paid By change as a One Payor record and keeps the old record at its share', () => {
    const x = customItem('X', { Cy: 700 });
    const y = equalItem('Y', 300, ['Cy']);
    const old = savedRecord(
      '2026-11-12',
      [
        { member: 'Ana', amount: 600 },
        { member: 'Ben', amount: 400 },
      ],
      [x, y],
      0,
    );
    const result = applyItemEdit([old], refOf(old, y), stagedSingle('2026-11-12', 'Ana', y), FRESH);
    expect(result[0].payors).toEqual([
      { member: 'Ana', amount: 420 },
      { member: 'Ben', amount: 280 },
    ]);
    expect(result[1].payorMode).toBe('single');
    expect(result[1].payors).toEqual([{ member: 'Ana', amount: 300 }]);
  });
});

describe('order lines in staging', () => {
  const itemized = (): CustomAmountItem => ({
    id: nextId('item'),
    mode: 'custom',
    name: 'Dinner',
    amounts: { Ana: 280, Ben: 450 },
    lines: [
      { member: 'Ana', name: 'Sisig', amount: 280 },
      { member: 'Ben', name: 'Kare-kare', amount: 450 },
    ],
  });

  it("purgeMemberFromStaged drops a member's lines from an itemized item", () => {
    const staged = [stagedSingle('2026-11-12', 'Cy', itemized())];
    const [out] = purgeMemberFromStaged(staged, 'Ben');
    expect(out.item).toMatchObject({ amounts: { Ana: 280 } });
    expect(out.item.mode === 'custom' && out.item.lines).toEqual([
      { member: 'Ana', name: 'Sisig', amount: 280 },
    ]);
  });

  it('applyItemEdit in place keeps the lines of an itemized next', () => {
    const old = itemized();
    const record = singleRecord('2026-11-12', 'Cy', [old]);
    const next = stagedSingle('2026-11-12', 'Cy', {
      ...old,
      amounts: { Ana: 300, Ben: 450 },
      lines: [
        { member: 'Ana', name: 'Sisig', amount: 300 },
        { member: 'Ben', name: 'Kare-kare', amount: 450 },
      ],
    });
    const [result] = applyItemEdit([record], refOf(record, old), next, FRESH);
    expect(result.items[0]).toBe(next.item);
    expect(result.payors).toEqual([{ member: 'Cy', amount: 750 }]);
  });
});

/* ------------------------- Custom items with a bill ------------------------ */

describe('staged Custom items with a bill', () => {
  it('T-1 files Example B under One Payor Ana at its net total (AC-CA6.1)', () => {
    const [record] = buildRecords([stagedSingle('2026-11-16', 'Ana', exampleB())]);
    expect(record.payors).toEqual([{ member: 'Ana', amount: 2401.05 }]);
    expect(record.items[0]).toEqual(exampleB());
  });

  it('T-2 matches Multiple Payors against the net total (AC-CA6.2, AC-CA6.3)', () => {
    const total = getItemTotal(exampleB());
    const pay = (...amounts: number[]) => amounts.map((amount, i) => ({ member: `P${i}`, amount }));
    expect(contributionsMatch(pay(1200, 1201.05), total)).toBe(true);
    expect(contributionsMatch(pay(1200, 1200), total)).toBe(false);
  });

  it('T-3 takes Ben out of a staged Example B and leaves the other shares (F1)', () => {
    const before = getItemShares(exampleB());
    const [kept] = purgeMemberFromStaged([stagedSingle('2026-11-16', 'Ana', exampleB())], 'Ben');
    const after = getItemShares(kept.item);
    expect(after).toEqual({
      Ana: before.Ana,
      Cy: before.Cy,
      Dan: before.Dan,
      Eve: before.Eve,
      Fay: before.Fay,
    });
    expect(getItemTotal(kept.item)).toBe(1910.12);
  });

  it('T-4 asks to confirm removing a member who is on the item at ₱0.00', () => {
    const staged = [stagedSingle('2026-11-16', 'Ben', exampleD1())];
    expect(stagedNamesMember(staged, 'Ana')).toBe(true);
  });
});
