import { describe, expect, it } from 'vitest';
import {
  billAmounts,
  billLineParts,
  billMatches,
  billMembers,
  receiptPillText,
  receiptRowLabel,
  receiptRows,
} from './bill';
import { exampleA, exampleB, exampleD1, exampleE } from './billExamples';
import { sumMoney } from './money';
import type { BillLine, CustomAmountItem, EqualSplitItem } from '../types';

const shared = (members: string[], amount: number, name = 'Gyoza'): BillLine => ({
  kind: 'shared',
  members,
  name,
  amount,
});
const charge = (amount: number, name = 'Service charge'): BillLine => ({
  kind: 'charge',
  name,
  amount,
});
const asMap = (parts: { member: string; amount: number }[]) =>
  Object.fromEntries(parts.map((p) => [p.member, p.amount]));
const billOf = (item: CustomAmountItem) => item.bill as BillLine[];

describe('billLineParts, shared and the variant (B-1)', () => {
  it('splits Example A’s Gyoza evenly', () => {
    expect(asMap(billLineParts(shared(['Ben', 'Ana'], 290), []))).toEqual({ Ana: 145, Ben: 145 });
  });

  it('gives the odd centavo to the first name alphabetically (AC-CA1.4)', () => {
    expect(asMap(billLineParts(shared(['Ana', 'Ben'], 290.01), []))).toEqual({
      Ana: 145.01,
      Ben: 145,
    });
  });

  it('sorts the members whatever order they come in, case-insensitively', () => {
    const parts = billLineParts(shared(['Ben', 'ana'], 290.01), []);
    expect(parts.map((p) => p.member)).toEqual(['ana', 'Ben']);
    expect(parts[0].amount).toBe(145.01);
  });
});

describe('billLineParts, charge (B-2)', () => {
  const six = ['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay'];

  it('splits Example B’s service charge six ways (AC-CA3.2)', () => {
    expect(asMap(billLineParts(charge(245.55), six))).toEqual({
      Ana: 40.93,
      Ben: 40.93,
      Cy: 40.93,
      Dan: 40.92,
      Eve: 40.92,
      Fay: 40.92,
    });
  });

  it('has no parts when nobody is in the item', () => {
    expect(billLineParts(charge(245.55), [])).toEqual([]);
  });
});

describe('billLineParts, discount (B-3)', () => {
  it('splits Example E’s Senior discount (AC-CA2.4)', () => {
    const senior = billOf(exampleE())[2];
    expect(asMap(billLineParts(senior, []))).toEqual({ Dan: 125.01, Eve: 125 });
  });
});

describe('billMembers (B-4)', () => {
  it('lists order and shared members once each, alphabetically', () => {
    const bill: BillLine[] = [
      { kind: 'order', member: 'Ben', name: '', amount: 5 },
      { kind: 'order', member: 'Ben', name: 'x', amount: 5 },
      shared(['Cy', 'Ana'], 10),
    ];
    expect(billMembers(bill)).toEqual(['Ana', 'Ben', 'Cy']);
  });

  it('leaves out a member who is only on a discount (BR-CA13)', () => {
    const bill: BillLine[] = [
      { kind: 'order', member: 'Ana', name: '', amount: 5 },
      { kind: 'discount', members: ['Cy'], name: 'PWD', amount: 1 },
    ];
    expect(billMembers(bill)).toEqual(['Ana']);
  });
});

describe('billAmounts, Examples A to E (B-5)', () => {
  const of = (item: CustomAmountItem) => billAmounts(billOf(item), billMembers(billOf(item)));

  it('A: 865.00 and 895.00, and the variant 865.01 and 895.00', () => {
    expect(of(exampleA())).toEqual({ Ana: 865, Ben: 895 });
    expect(of(exampleA(true))).toEqual({ Ana: 865.01, Ben: 895 });
  });

  it('B: the six shares add up to Subtotal - Discounts + Charges', () => {
    const shares = of(exampleB());
    expect(shares).toEqual({
      Ana: 420.93,
      Ben: 490.93,
      Cy: 260.93,
      Dan: 335.92,
      Eve: 450.92,
      Fay: 441.42,
    });
    expect(sumMoney(Object.values(shares))).toBe(2401.05);
    expect(sumMoney([2455.5, -300, 245.55])).toBe(2401.05);
  });

  it('C2 before the fill: Fay is not in the item, so the charge splits five ways', () => {
    const bill = billOf(exampleB()).filter((l) => !(l.kind === 'order' && l.member === 'Fay'));
    const shares = billAmounts(bill, billMembers(bill));
    expect(shares).toEqual({ Ana: 429.11, Ben: 499.11, Cy: 269.11, Dan: 344.11, Eve: 459.11 });
    expect(Object.hasOwn(shares, 'Fay')).toBe(false);
  });

  it('D1: Ana is present at 0', () => {
    const shares = of(exampleD1());
    expect(shares).toEqual({ Ana: 0, Ben: 600 });
    expect(Object.hasOwn(shares, 'Ana')).toBe(true);
  });

  it('D2: the voucher against Ana’s share, with a 105.00 service charge', () => {
    const d2 = (voucher: number): BillLine[] => [
      { kind: 'order', member: 'Ana', name: 'Pasta', amount: 450 },
      { kind: 'order', member: 'Ben', name: 'Steak', amount: 600 },
      { kind: 'discount', members: ['Ana'], name: 'Voucher', amount: voucher },
      charge(105),
    ];
    for (const [voucher, ana] of [
      [450, 52.5],
      [502.5, 0],
      [510, -7.5],
    ] as const) {
      const shares = billAmounts(d2(voucher), ['Ana', 'Ben']);
      expect(shares.Ana).toBe(ana);
      expect(shares.Ben).toBe(652.5);
    }
  });

  it('E: Dan -125.01 and Eve -125.00 come off their orders', () => {
    expect(of(exampleE())).toEqual({ Dan: 274.99, Eve: 275 });
  });
});

describe('billAmounts, a discount outside the item (B-6)', () => {
  it('gives its holder a negative share (AC-CA2.9)', () => {
    const bill: BillLine[] = [
      { kind: 'order', member: 'Ana', name: '', amount: 100 },
      { kind: 'discount', members: ['Cy'], name: 'PWD', amount: 300 },
    ];
    expect(billAmounts(bill, ['Ana'])).toEqual({ Ana: 100, Cy: -300 });
  });
});

describe('billAmounts adds charges in one pass (B-7)', () => {
  it('equals the sum of the parts of each charge, to the centavo', () => {
    for (let n = 1; n <= 7; n += 1) {
      const names = Array.from({ length: n }, (_, i) => `M${i}`);
      for (let c = 1; c <= 100; c += 1) {
        const line = charge(c / 100);
        const parts = billLineParts(line, names);
        expect(sumMoney(parts.map((p) => p.amount))).toBe(c / 100);
        expect(billAmounts([line], names)).toEqual(asMap(parts));
      }
    }
  });

  it('holds with three charges at once', () => {
    const names = ['Ana', 'Ben', 'Cy', 'Dan', 'Eve'];
    const lines = [charge(0.01), charge(1.03), charge(245.55)];
    const expected: Record<string, number> = {};
    for (const l of lines) {
      for (const p of billLineParts(l, names)) {
        expected[p.member] = sumMoney([expected[p.member] ?? 0, p.amount]);
      }
    }
    expect(billAmounts(lines, names)).toEqual(expected);
  });

  it('adds nothing when nobody is in the item', () => {
    expect(billAmounts([charge(10)], [])).toEqual({});
  });
});

describe('billMatches (B-8)', () => {
  it('is true for a stamp of Example B', () => {
    const b = exampleB();
    expect(billMatches(billOf(b), b.amounts)).toBe(true);
  });

  it('is false when an amounts key is on no order or shared line', () => {
    const b = exampleB();
    expect(billMatches(billOf(b), { ...b.amounts, Gus: 40.93 })).toBe(false);
  });

  it('is false when a shared or discount member is not in amounts', () => {
    const a = exampleA();
    expect(billMatches(billOf(a), { Ana: 865 })).toBe(false);
    const d = exampleD1();
    expect(billMatches(billOf(d), { Ben: 600 })).toBe(false);
  });

  it('is false when one centavo is off', () => {
    const b = exampleB();
    expect(billMatches(billOf(b), { ...b.amounts, Dan: 335.93 })).toBe(false);
  });

  it('is false when a share is below 0, even when amounts agree', () => {
    const bill: BillLine[] = [
      { kind: 'order', member: 'Ana', name: '', amount: 100 },
      { kind: 'order', member: 'Ben', name: '', amount: 100 },
      { kind: 'discount', members: ['Ana'], name: 'Big', amount: 150 },
    ];
    expect(billMatches(bill, { Ana: -50, Ben: 100 })).toBe(false);
  });

  it('is false for empty amounts', () => {
    expect(billMatches(billOf(exampleA()), {})).toBe(false);
  });

  it('treats a member called __proto__ as an ordinary key', () => {
    const amounts = Object.fromEntries([
      ['__proto__', 5],
      ['Ana', 5],
    ]);
    const bill: BillLine[] = [
      { kind: 'order', member: '__proto__', name: '', amount: 5 },
      { kind: 'order', member: 'Ana', name: '', amount: 2 },
      shared(['Ana', '__proto__'], 6),
    ];
    // Ana: 2 + 3 = 5, __proto__: 5 + 3 = 8, so it is not a match; the point is
    // that it is read as a member and nothing throws or leaks.
    expect(billMatches(bill, amounts)).toBe(false);
    const got = billAmounts(bill, Object.keys(amounts));
    expect(Object.hasOwn(got, '__proto__')).toBe(true);
    expect(got.Ana).toBe(5);
    expect(Object.getPrototypeOf(got)).toBe(Object.prototype);
  });
});

describe('receiptRows (B-9)', () => {
  it('gives a lines item one order row per line, as PR #137 drew it (AC-CA10.2)', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 30, Ben: 5 },
      lines: [
        { member: 'Ana', name: 'Sisig', amount: 30 },
        { member: 'Ben', name: '', amount: 5 },
      ],
    };
    const rows = receiptRows(item)!;
    expect(rows.map((r) => [r.kind, r.name, r.amount])).toEqual([
      ['order', 'Sisig', 30],
      ['order', '', 5],
    ]);
    expect([...rows[0].parts]).toEqual([['Ana', 30]]);
  });

  it('gives a bill item its lines in stored order, with discount parts negative', () => {
    const rows = receiptRows(exampleB())!;
    expect(rows).toHaveLength(10);
    expect(rows[8].kind).toBe('discount');
    expect([...rows[8].parts]).toEqual([['Cy', -300]]);
    expect(rows[9].parts.size).toBe(6);
    expect(rows[9].parts.get('Ana')).toBe(40.93);
    expect(rows[9].parts.get('Fay')).toBe(40.92);
  });

  it('gives Equal Split and amounts-only items null', () => {
    const equal: EqualSplitItem = {
      id: 'e',
      mode: 'equal',
      name: 'x',
      totalPrice: 10,
      owners: ['Ana'],
    };
    expect(receiptRows(equal)).toBeNull();
    expect(receiptRows({ id: 'c', mode: 'custom', name: 'x', amounts: { Ana: 5 } })).toBeNull();
  });

  it('reads a member called constructor from parts', () => {
    const item: CustomAmountItem = {
      id: 'c',
      mode: 'custom',
      name: 'x',
      amounts: { constructor: 5, Ana: 5 },
      bill: [
        { kind: 'order', member: 'constructor', name: '', amount: 5 },
        { kind: 'order', member: 'Ana', name: '', amount: 5 },
      ],
    };
    const rows = receiptRows(item)!;
    expect(rows[0].parts.get('constructor')).toBe(5);
    expect(rows[1].parts.has('constructor')).toBe(false);
  });
});

describe('receiptRowLabel and receiptPillText (B-10)', () => {
  const rowOf = (item: CustomAmountItem, i: number) => receiptRows(item)![i];
  /** The row at `i` of `item`, with its name taken off. */
  const unnamedRow = (item: CustomAmountItem, i: number) =>
    receiptRows({
      ...item,
      bill: billOf(item).map((l, j) => (j === i ? { ...l, name: '' } : l)),
    })![i];

  it('writes the pill of an own order as PR #137 did', () => {
    expect(receiptPillText(rowOf(exampleB(), 0), 6)).toBe('Ana · Sisig ₱280.00');
    const fay = {
      ...exampleB(),
      bill: [{ kind: 'order', member: 'Fay', name: '', amount: 400.5 }] as BillLine[],
    };
    expect(receiptPillText(rowOf(fay, 0), 1)).toBe('Fay: ₱400.50');
  });

  it('writes a shared order, named and unnamed', () => {
    const a = exampleA();
    expect(receiptPillText(rowOf(a, 2), 2)).toBe('Gyoza (shared) ₱290.00 · Ana, Ben');
    const row = unnamedRow(a, 2);
    expect(receiptPillText(row, 2)).toBe('Shared order ₱290.00 · Ana, Ben');
    expect(receiptRowLabel(row)).toEqual({ text: 'Shared order', fallback: true });
    expect(receiptRowLabel(rowOf(a, 2))).toEqual({ text: 'Gyoza (shared)', fallback: false });
  });

  it('writes a discount, named and unnamed, with a minus sign', () => {
    expect(receiptPillText(rowOf(exampleB(), 8), 6)).toBe('PWD −₱300.00 · Cy');
    const row = unnamedRow(exampleB(), 8);
    expect(receiptPillText(row, 6)).toBe('Discount −₱300.00 · Cy');
    expect(receiptRowLabel(row).fallback).toBe(true);
  });

  it('writes a charge, named and unnamed', () => {
    expect(receiptPillText(rowOf(exampleB(), 9), 6)).toBe('Service charge ₱245.55 · split 6 ways');
    const row = unnamedRow(exampleB(), 9);
    expect(receiptPillText(row, 6)).toBe('Charge ₱245.55 · split 6 ways');
    expect(receiptRowLabel(row)).toEqual({ text: 'Charge', fallback: true });
  });

  it('names the one member of a one-member charge', () => {
    const item: CustomAmountItem = {
      id: 'x',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 112 },
      bill: [{ kind: 'order', member: 'Ana', name: 'Soup', amount: 100 }, charge(12, 'VAT')],
    };
    expect(receiptPillText(rowOf(item, 1), 1)).toBe('VAT ₱12.00 · Ana');
  });

  it('flags an unnamed own order as the fallback', () => {
    const row = { kind: 'order' as const, name: '', amount: 5, parts: new Map([['Ana', 5]]) };
    expect(receiptRowLabel(row)).toEqual({ text: 'No name', fallback: true });
  });

  describe('"all N" for everyone in the item (bill-ux-polish item 3)', () => {
    /** An item of `n` members at ₱100.00 each, plus the given shared, discount and charge lines. */
    const itemOf = (n: number, extra: BillLine[]): CustomAmountItem => {
      const names = Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
      const bill: BillLine[] = [
        ...names.map((member): BillLine => ({ kind: 'order', member, name: '', amount: 100 })),
        ...extra,
      ];
      return {
        id: 'x',
        mode: 'custom',
        name: 'x',
        amounts: billAmounts(bill, names),
        bill,
      };
    };
    const names = (n: number, from = 1) =>
      Array.from({ length: n }, (_, i) => `P${String(i + from).padStart(2, '0')}`);

    it('says "all 17" for a shared order over 17 people, named and unnamed', () => {
      const item = itemOf(17, [shared(names(17), 1700, 'Group platter')]);
      expect(receiptPillText(rowOf(item, 17), 17)).toBe(
        'Group platter (shared) ₱1,700.00 · all 17',
      );
      const bill = billOf(item).map((l, i) => (i === 17 ? { ...l, name: '' } : l));
      const unnamed = receiptRows({ ...item, bill })![17];
      expect(receiptPillText(unnamed, 17)).toBe('Shared order ₱1,700.00 · all 17');
    });

    it('says "all 4" for a discount over four people', () => {
      const item = itemOf(4, [
        shared(names(4), 400, 'Platter'),
        { kind: 'discount', members: names(4), name: 'Promo', amount: 400 },
      ]);
      expect(receiptPillText(rowOf(item, 5), 4)).toBe('Promo −₱400.00 · all 4');
    });

    it('keeps the names for three people, even when it is everyone', () => {
      const item = itemOf(3, [shared(names(3), 90, 'Nachos')]);
      expect(receiptPillText(rowOf(item, 3), 3)).toBe('Nachos (shared) ₱90.00 · P01, P02, P03');
    });

    it('keeps the names for three of four people', () => {
      const item = itemOf(4, [shared(names(3), 300, 'Nachos')]);
      expect(receiptPillText(rowOf(item, 4), 4)).toBe('Nachos (shared) ₱300.00 · P01, P02, P03');
    });

    it('still says "split 17 ways" for a charge over 17 people', () => {
      const item = itemOf(17, [charge(170, 'VAT')]);
      expect(receiptPillText(rowOf(item, 17), 17)).toBe('VAT ₱170.00 · split 17 ways');
    });
  });
});
