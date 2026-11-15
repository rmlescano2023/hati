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
  purgeMemberFromItem,
} from './calculations';
import { allocateProportionally, roundMoney, splitEvenly, sumMoney } from './money';
import { compareNames, sortNames, toTitleCase } from './format';
import { billAmounts, billLineParts, billMatches, billMembers } from './bill';
import { exampleA, exampleB, exampleD1, exampleE } from './billExamples';
import { parseSession } from './storage';
import { itemFromLines, linesFromItem } from './orderLines';
import type {
  BillLine,
  CustomAmountItem,
  EqualSplitItem,
  PurchaseItem,
  PurchaseRecord,
} from '../types';

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

/* -------------------------------------------------------------------------- */
/* order lines                                                                 */
/* -------------------------------------------------------------------------- */

describe('purgeMemberFromItem with order lines', () => {
  const itemized = (): CustomAmountItem => ({
    id: 'item_l',
    mode: 'custom',
    name: 'Dinner',
    amounts: { Ana: 280, Ben: 450, Eve: 300 },
    lines: [
      { member: 'Ana', name: 'Sisig', amount: 280 },
      { member: 'Ben', name: '', amount: 450 },
      { member: 'Eve', name: 'Pancit', amount: 180 },
      { member: 'Eve', name: 'Halo-halo', amount: 120 },
    ],
  });

  it("drops the member's amount and lines and leaves everyone else alone", () => {
    const out = purgeMemberFromItem(itemized(), 'Eve');
    expect(out).toEqual({
      id: 'item_l',
      mode: 'custom',
      name: 'Dinner',
      amounts: { Ana: 280, Ben: 450 },
      lines: [
        { member: 'Ana', name: 'Sisig', amount: 280 },
        { member: 'Ben', name: '', amount: 450 },
      ],
    });
    expect(getItemTotal(out as CustomAmountItem)).toBe(730);
  });

  it('goes back to the amounts-only shape when no named line is left', () => {
    const out = purgeMemberFromItem(itemized(), 'Ana');
    const kept = purgeMemberFromItem(out as CustomAmountItem, 'Eve');
    expect(kept).toEqual({ id: 'item_l', mode: 'custom', name: 'Dinner', amounts: { Ben: 450 } });
    expect(kept && 'lines' in kept).toBe(false);
  });

  it('returns null when the last member goes, and the same item for a stranger', () => {
    const solo: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'S',
      amounts: { Ana: 5 },
      lines: [{ member: 'Ana', name: 'x', amount: 5 }],
    };
    expect(purgeMemberFromItem(solo, 'Ana')).toBeNull();
    expect(purgeMemberFromItem(solo, 'Zed')).toBe(solo);
  });
});

describe('an itemized item changes no money (AC-CO5.5)', () => {
  const members = ['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay'];
  const amounts = { Ana: 280, Ben: 450, Cy: 220, Dan: 380, Eve: 300, Fay: 200 };
  const plain: CustomAmountItem = { id: 'd', mode: 'custom', name: 'Dinner', amounts };
  const itemized: CustomAmountItem = {
    ...plain,
    lines: [
      { member: 'Ana', name: 'Sisig', amount: 280 },
      { member: 'Ben', name: 'Kare-kare', amount: 450 },
      { member: 'Cy', name: 'Adobo', amount: 220 },
      { member: 'Dan', name: 'Sinigang', amount: 380 },
      { member: 'Eve', name: 'Pancit', amount: 180 },
      { member: 'Eve', name: 'Halo-halo', amount: 120 },
      { member: 'Fay', name: '', amount: 200 },
    ],
  };
  const recordOf = (item: CustomAmountItem) => [
    record('2026-11-12', [{ member: 'Ana', amount: 0 }], [item]),
  ];

  it('gives the same totals, shares, matrices, balances and settlement', () => {
    expect(getItemTotal(itemized)).toBe(getItemTotal(plain));
    expect(getItemShares(itemized)).toEqual(getItemShares(plain));
    const a = getRawOwedMatrix(recordOf(itemized), members);
    const b = getRawOwedMatrix(recordOf(plain), members);
    expect(a).toEqual(b);
    expect(getNetBalances(getNettedOwedMatrix(a), members)).toEqual(
      getNetBalances(getNettedOwedMatrix(b), members),
    );
    expect(getFinalSettlement(getNettedOwedMatrix(a), members)).toEqual(
      getFinalSettlement(getNettedOwedMatrix(b), members),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* bills (shared orders, discounts, charges)                                   */
/* -------------------------------------------------------------------------- */

describe('purgeMemberFromItem with a bill', () => {
  const billOf = (item: PurchaseItem | null) => (item as CustomAmountItem).bill as BillLine[];
  const purge = (item: CustomAmountItem, member: string) =>
    purgeMemberFromItem(item, member) as CustomAmountItem;
  const charge = (item: CustomAmountItem) =>
    billOf(item).find((l) => l.kind === 'charge') as Extract<BillLine, { kind: 'charge' }>;

  /** Every result that keeps a bill is a receipt for exactly its amounts. */
  const reconciles = (item: CustomAmountItem) =>
    expect(billMatches(item.bill as BillLine[], item.amounts)).toBe(true);

  it('C-1 F1: removing Ben from Example B leaves every other share, and trims the charge', () => {
    const out = purge(exampleB(), 'Ben');
    expect(out.amounts).toEqual({ Ana: 420.93, Cy: 260.93, Dan: 335.92, Eve: 450.92, Fay: 441.42 });
    expect(getItemTotal(out)).toBe(1910.12);
    expect(charge(out).amount).toBe(204.62);
    expect(billOf(out).some((l) => l.kind === 'order' && l.member === 'Ben')).toBe(false);
    reconciles(out);
  });

  it('C-1 F2: removing Cy takes the PWD line with them', () => {
    const out = purge(exampleB(), 'Cy');
    expect(billOf(out).some((l) => l.kind === 'discount')).toBe(false);
    expect(charge(out).amount).toBe(204.62);
    expect(getItemTotal(out)).toBe(2140.12);
    expect(out.amounts.Ana).toBe(420.93);
    expect(out.amounts.Dan).toBe(335.92);
    reconciles(out);
  });

  it('C-1 F3: removing Ben from Example A leaves Ana a one-member shared Gyoza', () => {
    const out = purge(exampleA(), 'Ben');
    expect(out.amounts).toEqual({ Ana: 865 });
    expect(billOf(out)[1]).toEqual({
      kind: 'shared',
      members: ['Ana'],
      name: 'Gyoza',
      amount: 145,
    });
    reconciles(out);
    const variant = purge(exampleA(true), 'Ben');
    expect((billOf(variant)[1] as { amount: number }).amount).toBe(145.01);
    expect(variant.amounts).toEqual({ Ana: 865.01 });
    reconciles(variant);
  });

  it('C-1 F4: the discount holder left keeps their part of the Senior discount', () => {
    const noDan = purge(exampleE(), 'Dan');
    expect(billOf(noDan)[1]).toEqual({
      kind: 'discount',
      members: ['Eve'],
      name: 'Senior',
      amount: 125,
    });
    expect(noDan.amounts).toEqual({ Eve: 275 });
    const noEve = purge(exampleE(), 'Eve');
    expect(billOf(noEve)[1]).toEqual({
      kind: 'discount',
      members: ['Dan'],
      name: 'Senior',
      amount: 125.01,
    });
    expect(noEve.amounts).toEqual({ Dan: 274.99 });
    reconciles(noDan);
    reconciles(noEve);
  });

  it('C-1 F5: an item left worth nothing is removed', () => {
    expect(purgeMemberFromItem(exampleD1(), 'Ben')).toBeNull();
  });

  it('C-2 goes back to PR #137 lines when only own orders are left and one is named', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 100, Ben: 100, Cy: 30 },
      bill: [
        { kind: 'order', member: 'Ana', name: 'Soup', amount: 100 },
        { kind: 'order', member: 'Ben', name: '', amount: 100 },
        { kind: 'order', member: 'Cy', name: 'Tea', amount: 40 },
        { kind: 'discount', members: ['Cy'], name: 'Voucher', amount: 10 },
      ],
    };
    expect(purgeMemberFromItem(item, 'Cy')).toEqual({
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 100, Ben: 100 },
      lines: [
        { member: 'Ana', name: 'Soup', amount: 100 },
        { member: 'Ben', name: '', amount: 100 },
      ],
    });
  });

  it('C-2 goes back to amounts alone when no order left is named', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 100, Cy: 30 },
      bill: [
        { kind: 'order', member: 'Ana', name: '', amount: 100 },
        { kind: 'order', member: 'Cy', name: 'Tea', amount: 40 },
        { kind: 'discount', members: ['Cy'], name: 'Voucher', amount: 10 },
      ],
    };
    const out = purgeMemberFromItem(item, 'Cy');
    expect(out).toEqual({ id: 'i', mode: 'custom', name: 'x', amounts: { Ana: 100 } });
  });

  it('C-2 drops a charge whose centavo went with the member who had it', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 10.01, Ben: 10, Cy: 10 },
      bill: [
        { kind: 'order', member: 'Ana', name: 'Rice', amount: 10 },
        { kind: 'order', member: 'Ben', name: 'Rice', amount: 10 },
        { kind: 'order', member: 'Cy', name: 'Rice', amount: 10 },
        { kind: 'charge', name: 'Fee', amount: 0.01 },
      ],
    };
    const out = purge(item, 'Ana');
    expect(out.amounts).toEqual({ Ben: 10, Cy: 10 });
    expect('bill' in out).toBe(false);
    expect(out.lines).toHaveLength(2);
  });

  it('C-3 returns the same object for a member who is not on the item', () => {
    const item = exampleB();
    expect(purgeMemberFromItem(item, 'Gus')).toBe(item);
  });

  it("C-4 never moves another member's amount, for every odd centavo", () => {
    for (let n = 2; n <= 6; n += 1) {
      const names = Array.from({ length: n }, (_, i) => `M${i}`);
      for (let c = 1; c <= 200; c += 1) {
        const bill: BillLine[] = [
          ...names.map((member) => ({ kind: 'order' as const, member, name: 'Rice', amount: 10 })),
          { kind: 'shared', members: names, name: 'Gyoza', amount: c / 100 },
          { kind: 'charge', name: 'Fee', amount: c / 100 },
        ];
        const amounts = billAmounts(bill, billMembers(bill));
        for (const gone of names) {
          const out = purge({ id: 'i', mode: 'custom', name: 'x', amounts, bill }, gone);
          const { [gone]: _gone, ...rest } = amounts;
          void _gone;
          expect(out.amounts).toEqual(rest);
          if (out.bill) reconciles(out);
        }
      }
    }
  });

  it('C-4 also holds row by row: the parts of the others are the same before and after', () => {
    for (let n = 2; n <= 6; n += 1) {
      const names = Array.from({ length: n }, (_, i) => `M${i}`);
      for (let c = 1; c <= 200; c += 1) {
        const row: BillLine = { kind: 'charge', name: 'Fee', amount: c / 100 };
        const before = billLineParts(row, names);
        for (const gone of names) {
          const part = before.find((p) => p.member === gone)!.amount;
          const left = names.filter((m) => m !== gone);
          const after = billLineParts({ ...row, amount: roundMoney(c / 100 - part) }, left);
          expect(after).toEqual(before.filter((p) => p.member !== gone));
        }
      }
    }
  });

  describe('C-5 Summary reads the same money as hand-typed shares', () => {
    const typed = (item: CustomAmountItem): CustomAmountItem => ({
      id: item.id,
      mode: 'custom',
      name: item.name,
      amounts: item.amounts,
    });
    const members = ['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay'];

    it('Example B', () => {
      const withBill = exampleB();
      const recs = (item: CustomAmountItem) => [record('2026-11-16', single('Ana'), [item])];
      expect(getItemTotal(withBill)).toBe(2401.05);
      expect(getItemTotal(withBill)).toBe(getItemTotal(typed(withBill)));
      expect(getItemShares(withBill)).toEqual(getItemShares(typed(withBill)));

      const raw = getRawOwedMatrix(recs(withBill), members);
      expect(raw).toEqual(getRawOwedMatrix(recs(typed(withBill)), members));
      expect(raw.Ana).toMatchObject({
        Ben: 490.93,
        Cy: 260.93,
        Dan: 335.92,
        Eve: 450.92,
        Fay: 441.42,
      });
      expect(getNetBalances(raw, members)).toEqual(
        getNetBalances(getRawOwedMatrix(recs(typed(withBill)), members), members),
      );
      expect(getFinalSettlement(raw, members)).toEqual(
        getFinalSettlement(getRawOwedMatrix(recs(typed(withBill)), members), members),
      );
    });

    it('D1: Ana owes Ben nothing', () => {
      const raw = getRawOwedMatrix(
        [record('2026-11-16', single('Ben'), [exampleD1()])],
        ['Ana', 'Ben'],
      );
      expect(raw.Ben.Ana).toBe(0);
      expect(getItemShares(exampleD1())).toEqual({ Ana: 0, Ben: 600 });
    });
  });

  it('OT-1 an older tab shows the right money: the bill item has no lines', () => {
    const item = exampleB();
    expect('lines' in item).toBe(false);
    expect(getItemTotal(item)).toBe(2401.05);
    expect(getItemShares(item).Cy).toBe(260.93);
  });

  describe('OT-3 an older tab edits and saves', () => {
    /** What a tab that doesn't know the field sees, run through PR #137's Edit path. */
    const olderEdit = (item: CustomAmountItem): CustomAmountItem => {
      const seen: CustomAmountItem = {
        id: item.id,
        mode: 'custom',
        name: item.name,
        amounts: item.amounts,
      };
      const members = Object.keys(item.amounts);
      const lines = linesFromItem(seen, members);
      return itemFromLines(seen.id, seen.name, Object.keys(lines), lines);
    };
    const parsed = (item: CustomAmountItem) =>
      parseSession({
        id: 's',
        members: [],
        records: [
          {
            id: 'r',
            date: '2026-11-16',
            payorMode: 'single',
            payors: [{ member: 'Ana', amount: 1 }],
            items: [JSON.parse(JSON.stringify(item))],
            createdAt: '2026-11-16T00:00:00.000Z',
          },
        ],
      })?.records[0].items[0] as CustomAmountItem;

    it('keeps every share above 0 and the total, and drops the bill (AC-CA10.5)', () => {
      const out = olderEdit(exampleB());
      expect(out.amounts).toEqual(exampleB().amounts);
      expect(getItemTotal(out)).toBe(2401.05);
      const stored = parsed(out);
      expect('bill' in stored).toBe(false);
      expect('lines' in stored).toBe(false);
    });

    it('leaves out a member at 0, who owed nothing either way', () => {
      const out = olderEdit(exampleD1());
      expect(out.amounts).toEqual({ Ben: 600 });
      expect(getItemTotal(out)).toBe(getItemTotal(exampleD1()));
    });
  });

  describe('OT-4 an older tab removes a member (PR #137 purge, then the server parses)', () => {
    /** PR #137's purge: the amounts without the member, everything else as it was. */
    const olderPurge = (item: CustomAmountItem, member: string): CustomAmountItem => {
      const amounts = { ...item.amounts };
      delete amounts[member];
      return { ...item, amounts };
    };
    const parsed = (item: CustomAmountItem) =>
      parseSession({
        id: 's',
        members: [],
        records: [
          {
            id: 'r',
            date: '2026-11-16',
            payorMode: 'single',
            payors: [{ member: 'Ana', amount: 1 }],
            items: [JSON.parse(JSON.stringify(item))],
            createdAt: '2026-11-16T00:00:00.000Z',
          },
        ],
      })?.records[0].items[0] as CustomAmountItem;

    it('drops the bill of Example B, because the charge split changed, and keeps the amounts', () => {
      const out = parsed(olderPurge(exampleB(), 'Ben'));
      expect('bill' in out).toBe(false);
      expect(out.amounts).toEqual({
        Ana: 420.93,
        Cy: 260.93,
        Dan: 335.92,
        Eve: 450.92,
        Fay: 441.42,
      });
    });

    it('drops the bill of Example A, because the Gyoza names Ben', () => {
      const out = parsed(olderPurge(exampleA(), 'Ben'));
      expect('bill' in out).toBe(false);
      expect(out.amounts).toEqual({ Ana: 865 });
    });

    it('keeps a bill that is still a correct receipt for the money stored', () => {
      const item: CustomAmountItem = {
        id: 'i',
        mode: 'custom',
        name: 'x',
        amounts: { Ana: 70, Ben: 100 },
        bill: [
          { kind: 'order', member: 'Ana', name: 'Soup', amount: 100 },
          { kind: 'order', member: 'Ben', name: 'Soup', amount: 100 },
          { kind: 'discount', members: ['Ana'], name: 'PWD', amount: 30 },
        ],
      };
      // Ben goes, and the order for him is skipped; what is left still adds up.
      expect(parsed(olderPurge(item, 'Ben')).bill).toEqual([
        (item.bill as BillLine[])[0],
        (item.bill as BillLine[])[2],
      ]);
    });
  });
});
