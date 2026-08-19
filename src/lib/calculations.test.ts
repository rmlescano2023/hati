import { describe, expect, it } from 'vitest';
import {
  distributeRemainder,
  getFinalSettlement,
  getGrandTotal,
  getItemShares,
  getItemTotal,
  getMatrixRowOrder,
  getNetBalances,
  getNettedOwedMatrix,
  getPayorWeights,
  getRawOwedMatrix,
  getRecordBreakdown,
  groupRecordsForBreakdown,
} from './calculations';
import { allocateProportionally, roundMoney, splitEvenly, sumMoney } from './money';
import { compareNames, sortNames, toTitleCase } from './format';
import type { CustomAmountItem, EqualSplitItem, PurchaseItem, PurchaseRecord } from '../types';

/* ------------------------------- builders -------------------------------- */

let seq = 0;
const nextId = (p: string) => `${p}_${(seq += 1)}`;

function equalItem(name: string, totalPrice: number, owners: string[]): EqualSplitItem {
  return { id: nextId('item'), mode: 'equal', name, totalPrice, owners };
}

function customItem(name: string, amounts: Record<string, number>): CustomAmountItem {
  return { id: nextId('item'), mode: 'custom', name, amounts };
}

function record(
  date: string,
  payors: { member: string; amount: number }[],
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

const single = (member: string) => [{ member, amount: 0 }];

/* --------------------------------- money --------------------------------- */

describe('money', () => {
  it('splits evenly with the leftover centavo going to the first parts', () => {
    expect(splitEvenly(10, 3)).toEqual([3.34, 3.33, 3.33]);
    expect(sumMoney(splitEvenly(10, 3))).toBe(10);
  });

  it('never drifts on awkward totals', () => {
    for (const total of [0.01, 100.01, 999.99, 1234.57]) {
      for (const parts of [2, 3, 4, 7, 11]) {
        expect(sumMoney(splitEvenly(total, parts))).toBe(roundMoney(total));
      }
    }
  });

  it('allocates proportionally and still sums back exactly', () => {
    expect(allocateProportionally(200, [3, 1])).toEqual([150, 50]);
    const slices = allocateProportionally(100.01, [1, 1, 1]);
    expect(sumMoney(slices)).toBe(100.01);
  });

  it('falls back to an even split when there is no weight mass', () => {
    expect(allocateProportionally(90, [0, 0, 0])).toEqual([30, 30, 30]);
  });
});

/* --------------------------------- items --------------------------------- */

describe('item breakdown', () => {
  it('splits an equal-split item across its owners exactly', () => {
    const item = equalItem('Samgyup Dinner', 1000, ['Renmar', 'Jyllan', 'Aivan']);
    const shares = getItemShares(item);
    expect(sumMoney(Object.values(shares))).toBe(1000);
    // Alphabetical order decides who absorbs the leftover centavo.
    expect(shares).toEqual({ Aivan: 333.34, Jyllan: 333.33, Renmar: 333.33 });
    expect(getItemTotal(item)).toBe(1000);
  });

  it('uses the entered amounts for a custom-amount item', () => {
    const item = customItem('Gin', { Renmar: 120.5, Jyllan: 79.5 });
    expect(getItemShares(item)).toEqual({ Renmar: 120.5, Jyllan: 79.5 });
    expect(getItemTotal(item)).toBe(200);
  });

  it('totals a record across both item modes', () => {
    const rec = record('2026-04-27', single('Renmar'), [
      equalItem('Groceries', 900, ['Renmar', 'Jyllan', 'Aivan']),
      customItem('Gin', { Renmar: 120, Jyllan: 80 }),
    ]);
    const { shares, total } = getRecordBreakdown(rec, ['Aivan', 'Jyllan', 'Renmar']);
    expect(total).toBe(1100);
    expect(shares).toEqual({ Aivan: 300, Jyllan: 380, Renmar: 420 });
    expect(sumMoney(Object.values(shares))).toBe(total);
    expect(getGrandTotal([rec])).toBe(1100);
  });
});

/* ------------------------------ payor weights ----------------------------- */

describe('payor weights', () => {
  it('gives a single payor the whole record', () => {
    const rec = record('2026-04-27', single('Renmar'), [equalItem('X', 100, ['Renmar'])]);
    expect(getPayorWeights(rec)).toEqual({ Renmar: 1 });
  });

  it('weights multiple payors by contribution', () => {
    const rec = record(
      '2026-04-27',
      [
        { member: 'Renmar', amount: 300 },
        { member: 'Jyllan', amount: 100 },
      ],
      [equalItem('X', 400, ['Renmar', 'Jyllan'])],
    );
    expect(getPayorWeights(rec)).toEqual({ Renmar: 0.75, Jyllan: 0.25 });
  });

  it('splits weight evenly when no contributions were entered', () => {
    const rec = record(
      '2026-04-27',
      [
        { member: 'Renmar', amount: 0 },
        { member: 'Jyllan', amount: 0 },
      ],
      [equalItem('X', 400, ['Renmar', 'Jyllan'])],
      'multiple',
    );
    expect(getPayorWeights(rec)).toEqual({ Renmar: 0.5, Jyllan: 0.5 });
  });
});

/* ------------------------------- raw matrix ------------------------------- */

describe('raw owed matrix', () => {
  const members = ['Aivan', 'Jyllan', 'Renmar'];

  it('attributes every non-payor share to the single payor', () => {
    const rec = record('2026-04-27', single('Renmar'), [equalItem('Dinner', 900, members)]);
    const raw = getRawOwedMatrix([rec], members);
    expect(raw.Renmar).toEqual({ Aivan: 300, Jyllan: 300, Renmar: 0 });
    expect(raw.Jyllan).toEqual({ Aivan: 0, Jyllan: 0, Renmar: 0 });
  });

  it('splits a non-payor share across multiple payors proportional to contribution', () => {
    // Renmar fronted 300 and Jyllan 100 (75% / 25%) on a 600 bill split three ways.
    const rec = record(
      '2026-04-27',
      [
        { member: 'Renmar', amount: 300 },
        { member: 'Jyllan', amount: 100 },
      ],
      [equalItem('Dinner', 600, members)],
    );
    const raw = getRawOwedMatrix([rec], members);
    // Aivan owes 200, attributed 150 / 50.
    expect(raw.Renmar.Aivan).toBe(150);
    expect(raw.Jyllan.Aivan).toBe(50);
    // Payors owe nothing on a record they paid for.
    expect(raw.Renmar.Jyllan).toBe(0);
    expect(raw.Jyllan.Renmar).toBe(0);
    expect(sumMoney([raw.Renmar.Aivan, raw.Jyllan.Aivan])).toBe(200);
  });

  it('keeps custom-amount records intact', () => {
    const rec = record('2026-04-27', single('Renmar'), [
      customItem('Gin', { Renmar: 120, Jyllan: 80, Aivan: 45.5 }),
    ]);
    const raw = getRawOwedMatrix([rec], members);
    expect(raw.Renmar).toEqual({ Aivan: 45.5, Jyllan: 80, Renmar: 0 });
  });
});

/* --------------------------------- netting -------------------------------- */

describe('netting', () => {
  const members = ['Jyllan', 'Renmar'];

  // Record 1: Renmar pays, Jyllan owes 300. Record 2: Jyllan pays, Renmar owes 120.
  const records = [
    record('2026-04-27', single('Renmar'), [equalItem('Dinner', 600, members)]),
    record('2026-04-28', single('Jyllan'), [equalItem('Breakfast', 240, members)]),
  ];

  const raw = getRawOwedMatrix(records, members);
  const netted = getNettedOwedMatrix(raw);

  it('shows both raw directions before deductions', () => {
    expect(raw.Renmar.Jyllan).toBe(300);
    expect(raw.Jyllan.Renmar).toBe(120);
  });

  it('cancels the smaller direction after deductions', () => {
    expect(netted.Renmar.Jyllan).toBe(180);
    expect(netted.Jyllan.Renmar).toBe(0);
  });

  it('produces the same net balances raw or netted', () => {
    expect(getNetBalances(netted, members)).toEqual([
      { member: 'Jyllan', amount: -180 },
      { member: 'Renmar', amount: 180 },
    ]);
    expect(getNetBalances(raw, members)).toEqual(getNetBalances(netted, members));
  });

  it('drives the final settlement off the netted matrix', () => {
    const settlement = getFinalSettlement(netted, members);
    expect(settlement).toEqual([
      { debtor: 'Jyllan', lines: [{ creditor: 'Renmar', amount: 180 }], total: 180 },
    ]);
  });

  it('is order-independent per pair', () => {
    const reversed = getNettedOwedMatrix(getRawOwedMatrix([...records].reverse(), members));
    expect(reversed).toEqual(netted);
  });

  it('leaves nothing to settle when the pair cancels exactly', () => {
    const even = [
      record('2026-04-27', single('Renmar'), [equalItem('A', 600, members)]),
      record('2026-04-28', single('Jyllan'), [equalItem('B', 600, members)]),
    ];
    const cancelled = getNettedOwedMatrix(getRawOwedMatrix(even, members));
    expect(getFinalSettlement(cancelled, members)).toEqual([]);
    expect(getNetBalances(cancelled, members).every((b) => b.amount === 0)).toBe(true);
  });
});

describe('settlement blocks', () => {
  const members = ['Aivan', 'Jyllan', 'Renmar'];

  it('groups one block per debtor, alphabetically, with alphabetical creditor lines', () => {
    const records = [
      record('2026-04-27', single('Renmar'), [equalItem('Dinner', 900, members)]),
      record('2026-04-28', single('Jyllan'), [equalItem('Drinks', 300, ['Aivan', 'Jyllan'])]),
    ];
    const netted = getNettedOwedMatrix(getRawOwedMatrix(records, members));
    const settlement = getFinalSettlement(netted, members);

    expect(settlement.map((s) => s.debtor)).toEqual(['Aivan', 'Jyllan']);
    expect(settlement[0].lines.map((l) => l.creditor)).toEqual(['Jyllan', 'Renmar']);
    expect(settlement[0].total).toBe(450);
    // Jyllan owed Renmar 300 and Renmar owed Jyllan nothing, so 300 stands.
    expect(settlement[1]).toEqual({
      debtor: 'Jyllan',
      lines: [{ creditor: 'Renmar', amount: 300 }],
      total: 300,
    });
  });

  it('orders matrix rows by how much each payor covered, descending', () => {
    const records = [
      record('2026-04-27', single('Renmar'), [equalItem('Dinner', 900, members)]),
      record('2026-04-28', single('Jyllan'), [equalItem('Drinks', 300, ['Aivan', 'Jyllan'])]),
    ];
    const raw = getRawOwedMatrix(records, members);
    expect(getMatrixRowOrder(raw)).toEqual(['Renmar', 'Jyllan']);
  });
});

/* ------------------------------- grouping --------------------------------- */

describe('breakdown grouping', () => {
  const members = ['Jyllan', 'Renmar'];

  it('merges two saves on the same date and payor into one group', () => {
    const records = [
      record('2026-04-27', single('Renmar'), [equalItem('Dinner', 600, members)]),
      record('2026-04-27', single('Renmar'), [equalItem('Drinks', 200, members)]),
      record('2026-04-27', single('Jyllan'), [equalItem('Taxi', 100, members)]),
    ];
    const groups = groupRecordsForBreakdown(records, members, 'asc');
    expect(groups).toHaveLength(2);
    const renmarGroup = groups.find((g) => g.payors[0].member === 'Renmar')!;
    expect(renmarGroup.rows.map((r) => r.item.name)).toEqual(['Dinner', 'Drinks']);
    expect(renmarGroup.grandTotal).toBe(800);
    expect(renmarGroup.totals).toEqual({ Jyllan: 400, Renmar: 400 });
  });

  it('keeps different dates apart and sorts newest first by default', () => {
    const records = [
      record('2026-04-27', single('Renmar'), [equalItem('A', 100, members)]),
      record('2026-04-29', single('Renmar'), [equalItem('B', 100, members)]),
      record('2026-04-28', single('Renmar'), [equalItem('C', 100, members)]),
    ];
    expect(groupRecordsForBreakdown(records, members).map((g) => g.date)).toEqual([
      '2026-04-29',
      '2026-04-28',
      '2026-04-27',
    ]);
    expect(groupRecordsForBreakdown(records, members, 'asc').map((g) => g.date)).toEqual([
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
    ]);
  });

  it('sums merged multi-payor contributions', () => {
    const payors = [
      { member: 'Renmar', amount: 300 },
      { member: 'Jyllan', amount: 100 },
    ];
    const records = [
      record('2026-04-27', payors, [equalItem('A', 400, members)]),
      record('2026-04-27', payors, [equalItem('B', 400, members)]),
    ];
    const [group] = groupRecordsForBreakdown(records, members);
    expect(group.payors).toEqual([
      { member: 'Jyllan', amount: 200 },
      { member: 'Renmar', amount: 600 },
    ]);
  });
});

/* --------------------------- distribute remainder ------------------------- */

describe('distributeRemainder', () => {
  it('gives the whole remainder to a single blank member', () => {
    expect(distributeRemainder(1000, [400, 250], 1)).toEqual([350]);
  });

  it('splits the remainder across two blank members exactly', () => {
    expect(distributeRemainder(1000, [333.33], 2)).toEqual([333.34, 333.33]);
    expect(sumMoney([333.33, ...distributeRemainder(1000, [333.33], 2)])).toBe(1000);
  });

  it('returns zeros when nothing is left', () => {
    expect(distributeRemainder(500, [500], 2)).toEqual([0, 0]);
    expect(distributeRemainder(500, [600], 1)).toEqual([0]);
  });

  it('returns nothing when there are no blanks', () => {
    expect(distributeRemainder(500, [100], 0)).toEqual([]);
  });
});

/* ------------------------- member ordering invariants --------------------- */

describe('member ordering', () => {
  const add = (members: string[], raw: string): string[] => {
    const name = toTitleCase(raw);
    if (!name || members.some((m) => compareNames(m, name) === 0)) return members;
    return [...members, name].sort(compareNames);
  };

  it('title-cases and keeps the list alphabetical as members are added', () => {
    let members: string[] = [];
    for (const raw of ['renmar', 'aivan', 'JYLLAN', 'bea marie']) members = add(members, raw);
    expect(members).toEqual(['Aivan', 'Bea Marie', 'Jyllan', 'Renmar']);
  });

  it('rejects case-insensitive duplicates', () => {
    let members = add([], 'Renmar');
    members = add(members, 'renmar');
    members = add(members, '  RENMAR  ');
    expect(members).toEqual(['Renmar']);
  });

  it('stays alphabetical after a removal', () => {
    const members = ['Aivan', 'Bea Marie', 'Jyllan', 'Renmar'];
    const after = members.filter((m) => m !== 'Jyllan');
    expect(after).toEqual(sortNames(after));
    expect(after).toEqual(['Aivan', 'Bea Marie', 'Renmar']);
  });

  it('title-cases hyphenated and apostrophised names', () => {
    expect(toTitleCase('mary-jane o’brien')).toBe('Mary-Jane O’Brien');
    expect(toTitleCase('  jOhn   doe ')).toBe('John Doe');
  });
});
