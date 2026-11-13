import { describe, expect, it } from 'vitest';
import { includableGroups, includeMember } from './includeMember';
import {
  getItemShares,
  getRawOwedMatrix,
  getRecordTotal,
  groupRecordsForBreakdown,
  purgeMemberFromItem,
} from './calculations';
import type {
  CustomAmountItem,
  EqualSplitItem,
  PayorContribution,
  PurchaseItem,
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

function record(
  date: string,
  payors: PayorContribution[],
  items: PurchaseItem[],
  payorMode: 'single' | 'multiple' = payors.length > 1 ? 'multiple' : 'single',
): PurchaseRecord {
  return {
    id: nextId('rec'),
    date,
    payorMode,
    payors,
    items,
    createdAt: new Date(2026, 0, 1, 0, 0, (seq += 1)).toISOString(),
  };
}

const paidBy = (member: string): PayorContribution[] => [{ member, amount: 0 }];

/** Includes `name` in every item of `records`, by reference. */
const refsOf = (records: PurchaseRecord[]) =>
  records.flatMap((r) => r.items.map((i) => ({ recordId: r.id, itemId: i.id })));

/* ------------------------------ includeMember ----------------------------- */

describe('includeMember', () => {
  it('re-splits ₱100 three ways, the leftover centavo going to the first owner (Example A, Dan)', () => {
    const taxi = equalItem('Taxi', 100, ['Ben', 'Cy']);
    const records = [record('2026-11-12', [{ member: 'Ben', amount: 100 }], [taxi])];
    const [after] = includeMember(records, 'Dan', refsOf(records));

    const shares = getItemShares(after.items[0]);
    expect(shares).toEqual({ Ben: 33.34, Cy: 33.33, Dan: 33.33 });

    const matrix = getRawOwedMatrix([after], ['Ben', 'Cy', 'Dan']);
    expect(matrix.Ben.Cy).toBe(33.33);
    expect(matrix.Ben.Dan).toBe(33.33);
  });

  it('gives the leftover centavo to the new member when they sort first (Example A, Abe)', () => {
    const taxi = equalItem('Taxi', 100, ['Ben', 'Cy']);
    const records = [record('2026-11-12', [{ member: 'Ben', amount: 100 }], [taxi])];
    const [after] = includeMember(records, 'Abe', refsOf(records));

    expect(getItemShares(after.items[0])).toEqual({ Abe: 33.34, Ben: 33.33, Cy: 33.33 });
    const matrix = getRawOwedMatrix([after], ['Abe', 'Ben', 'Cy']);
    expect(matrix.Ben.Abe).toBe(33.34);
    expect(matrix.Ben.Cy).toBe(33.33);
  });

  it('keeps Multiple Payors contributions and re-splits what the others owe (Example B)', () => {
    const dinner = equalItem('Dinner', 1000, ['Ana', 'Ben', 'Cy']);
    const payors = [
      { member: 'Ana', amount: 600 },
      { member: 'Ben', amount: 400 },
    ];
    const records = [record('2026-11-12', payors, [dinner])];

    const before = getRawOwedMatrix(records, ['Ana', 'Ben', 'Cy', 'Dan']);
    expect(before.Ana.Cy).toBe(200);
    expect(before.Ben.Cy).toBe(133.33);

    const after = includeMember(records, 'Dan', refsOf(records));
    expect(getItemShares(after[0].items[0])).toEqual({ Ana: 250, Ben: 250, Cy: 250, Dan: 250 });
    expect(after[0].payors).toEqual([
      { member: 'Ana', amount: 600 },
      { member: 'Ben', amount: 400 },
    ]);

    const matrix = getRawOwedMatrix(after, ['Ana', 'Ben', 'Cy', 'Dan']);
    expect(matrix.Ana.Cy).toBe(150);
    expect(matrix.Ben.Cy).toBe(100);
    expect(matrix.Ana.Dan).toBe(150);
    expect(matrix.Ben.Dan).toBe(100);
  });

  it('keeps the price and splits it four ways, ₱225 each (AC-LM3.1)', () => {
    const hotel = equalItem('Hotel', 900, ['Ana', 'Ben', 'Dan']);
    const records = [record('2026-11-12', paidBy('Ana'), [hotel])];
    const [after] = includeMember(records, 'Cy', refsOf(records));

    expect(after.items[0]).toMatchObject({ mode: 'equal', totalPrice: 900 });
    expect(getItemShares(after.items[0])).toEqual({ Ana: 225, Ben: 225, Cy: 225, Dan: 225 });
  });

  it('leaves the payors alone, so a One Payor amount still equals the record total (AC-LM3.3)', () => {
    const hotel = equalItem('Hotel', 900, ['Ana', 'Ben']);
    const taxi = equalItem('Taxi', 100, ['Ana', 'Ben']);
    const payors = [{ member: 'Ana', amount: 1000 }];
    const records = [record('2026-11-12', payors, [hotel, taxi])];
    const [after] = includeMember(records, 'Cy', [{ recordId: records[0].id, itemId: hotel.id }]);

    expect(after.payors).toBe(payors);
    expect(after.payors[0].amount).toBe(getRecordTotal(after));
  });

  it('changes only what was ticked, and nothing else about the records (AC-LM3.5)', () => {
    const ticked = equalItem('Ticked', 90, ['Ana', 'Ben']);
    const other = equalItem('Other', 60, ['Ana', 'Ben']);
    const untouchedItem = equalItem('Untouched', 30, ['Ana', 'Ben']);
    const first = record('2026-11-12', paidBy('Ana'), [ticked, other]);
    const second = record('2026-11-13', paidBy('Ben'), [untouchedItem]);
    const records = [first, second];

    const after = includeMember(records, 'Cy', [{ recordId: first.id, itemId: ticked.id }]);

    expect(after[1]).toBe(second);
    expect(after[0].items[1]).toBe(other);
    expect(after[0].items[0].id).toBe(ticked.id);
    expect(after[0]).toMatchObject({
      id: first.id,
      date: first.date,
      createdAt: first.createdAt,
      payorMode: first.payorMode,
    });
    expect(after.map((r) => r.id)).toEqual([first.id, second.id]);
    expect(after[0].items.map((i) => i.id)).toEqual([ticked.id, other.id]);
  });

  it('returns every record as the same object when nothing is ticked', () => {
    const records = [record('2026-11-12', paidBy('Ana'), [equalItem('A', 10, ['Ana'])])];
    const after = includeMember(records, 'Cy', []);
    expect(after[0]).toBe(records[0]);
  });

  it('keeps an included item Equal Split, so a later total edit re-splits across everyone (AC-LM3.6)', () => {
    const records = [record('2026-11-12', paidBy('Ana'), [equalItem('A', 90, ['Ana', 'Ben'])])];
    const [after] = includeMember(records, 'Cy', refsOf(records));
    expect(after.items[0].mode).toBe('equal');
  });

  it('skips a Custom Amounts item, a missing item and an owner already there in another case (BR-LM8)', () => {
    const custom = customItem('Rooms', { Ana: 100 });
    const hasCy = equalItem('Lunch', 60, ['Ana', 'cy']);
    const fine = equalItem('Taxi', 60, ['Ana', 'Ben']);
    const rec = record('2026-11-12', paidBy('Ana'), [custom, hasCy, fine]);

    const after = includeMember([rec], 'Cy', [
      { recordId: rec.id, itemId: custom.id },
      { recordId: rec.id, itemId: hasCy.id },
      { recordId: rec.id, itemId: 'gone' },
      { recordId: 'gone', itemId: fine.id },
    ]);

    expect(after[0]).toBe(rec);
    expect(after[0].items[0]).toBe(custom);
    expect(after[0].items[1]).toBe(hasCy);
  });

  it('includes a ₱0.00 item with a share of 0 and no change to any balance (BR-LM3)', () => {
    const freebie = equalItem('Freebie', 0, ['Ana', 'Ben']);
    const records = [record('2026-11-12', paidBy('Ana'), [freebie])];
    const members = ['Ana', 'Ben', 'Cy'];
    const before = getRawOwedMatrix(records, members);
    const after = includeMember(records, 'Cy', refsOf(records));

    expect(getItemShares(after[0].items[0]).Cy).toBe(0);
    expect(getRawOwedMatrix(after, members)).toEqual(before);
  });

  it('shrinks the price by the share when the included member is removed again (LQ2)', () => {
    const hotel = equalItem('Hotel', 900, ['Ana', 'Ben', 'Dan']);
    const records = [record('2026-11-12', paidBy('Ana'), [hotel])];
    const [after] = includeMember(records, 'Cy', refsOf(records));

    const purged = purgeMemberFromItem(after.items[0], 'Cy');
    expect(purged).toMatchObject({ mode: 'equal', totalPrice: 675 });
    expect(getItemShares(purged as PurchaseItem)).toEqual({ Ana: 225, Ben: 225, Dan: 225 });
  });

  it("shows the member's total on the Breakdown card without changing the card total", () => {
    const hotel = equalItem('Hotel', 900, ['Ana', 'Ben', 'Dan']);
    const records = [record('2026-11-12', paidBy('Ana'), [hotel])];
    const members = ['Ana', 'Ben', 'Cy', 'Dan'];
    const before = groupRecordsForBreakdown(records, members);
    const after = groupRecordsForBreakdown(includeMember(records, 'Cy', refsOf(records)), members);

    expect(before[0].totals.Cy).toBe(0);
    expect(after[0].totals.Cy).toBe(225);
    expect(after[0].grandTotal).toBe(before[0].grandTotal);
  });
});

/* ----------------------------- includableGroups ---------------------------- */

describe('includableGroups', () => {
  const members = ['Ana', 'Ben'];

  it('is empty with no records (AC-LM1.6)', () => {
    expect(includableGroups([], members, 'Cy')).toEqual([]);
  });

  it('is empty when every item is Custom Amounts (AC-LM1.7)', () => {
    const records = [record('2026-11-12', paidBy('Ana'), [customItem('Rooms', { Ana: 10 })])];
    expect(includableGroups(records, members, 'Cy')).toEqual([]);
  });

  it('lists only the Equal Split items, and drops a group left with none (AC-LM1.4)', () => {
    const taxi = equalItem('Taxi', 120, ['Ana', 'Ben']);
    const rooms = customItem('Rooms', { Ana: 10 });
    const records = [
      record('2026-11-12', paidBy('Ana'), [rooms, taxi]),
      record('2026-11-13', paidBy('Ben'), [customItem('Tours', { Ben: 5 })]),
    ];
    const groups = includableGroups(records, members, 'Cy');

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ date: '2026-11-12', payorMode: 'single' });
    expect(groups[0].items).toEqual([
      { recordId: records[0].id, itemId: taxi.id, name: 'Taxi', price: 120 },
    ]);
  });

  it("follows Breakdown's order: newest date first, rows in card order (BR-LM4)", () => {
    const older = equalItem('Older', 10, ['Ana']);
    const newerA = equalItem('NewerA', 20, ['Ana']);
    const newerB = equalItem('NewerB', 30, ['Ana']);
    const records = [
      record('2026-11-10', paidBy('Ana'), [older]),
      record('2026-11-12', paidBy('Ana'), [newerA]),
      record('2026-11-12', paidBy('Ana'), [newerB]),
    ];
    const groups = includableGroups(records, members, 'Cy');

    expect(groups.map((g) => g.key)).toEqual(
      groupRecordsForBreakdown(records, members).map((g) => g.key),
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-11-12', '2026-11-10']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['NewerA', 'NewerB']);
  });

  it('does not list an item that already has the name, in any case', () => {
    const has = equalItem('Has', 10, ['Ana', 'cy']);
    const lacks = equalItem('Lacks', 10, ['Ana']);
    const records = [record('2026-11-12', paidBy('Ana'), [has, lacks])];
    const groups = includableGroups(records, members, 'Cy');

    expect(groups[0].items.map((i) => i.name)).toEqual(['Lacks']);
  });

  it('lists a ₱0.00 item with a price of 0 (BR-LM3)', () => {
    const records = [record('2026-11-12', paidBy('Ana'), [equalItem('Freebie', 0, ['Ana'])])];
    expect(includableGroups(records, members, 'Cy')[0].items[0].price).toBe(0);
  });

  it('lists an item owned by every member', () => {
    const records = [record('2026-11-12', paidBy('Ana'), [equalItem('All', 50, members)])];
    expect(includableGroups(records, members, 'Cy')[0].items).toHaveLength(1);
  });

  it("carries the card's payors, merged, for Multiple Payors records", () => {
    const records = [
      record(
        '2026-11-12',
        [
          { member: 'Ana', amount: 60 },
          { member: 'Ben', amount: 40 },
        ],
        [equalItem('Dinner', 100, ['Ana', 'Ben'])],
      ),
    ];
    const [group] = includableGroups(records, members, 'Cy');
    expect(group.payorMode).toBe('multiple');
    expect(group.payors).toEqual([
      { member: 'Ana', amount: 60 },
      { member: 'Ben', amount: 40 },
    ]);
  });
});
