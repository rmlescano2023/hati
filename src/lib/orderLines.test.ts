import { describe, expect, it } from 'vitest';
import {
  EMPTY_BILL_DRAFT,
  FIRST_LINE_KEY,
  ORDER_NAME_MAX,
  addBillRow,
  billDraftFromItem,
  billFromDraft,
  blankPicked,
  fillRemainder,
  hasBillRows,
  itemFromLines,
  linesFromEqualSplit,
  linesFromItem,
  linesOf,
  linesTotal,
  normaliseOrderName,
  readBillDraft,
  removeBillRow,
  rowMembers,
  setBillRow,
  toggleRowEveryone,
  toggleRowMember,
  unpickFromBill,
  unpricedNamedLine,
  type BillDraft,
  type LineDraft,
  type LinesDraft,
} from './orderLines';
import { getItemShares } from './calculations';
import { exampleA as mendokoro } from './billExamples';
import type { CustomAmountItem } from '../types';

/* ------------------------------- builders -------------------------------- */

const line = (name: string, price: string, key = 'k'): LineDraft => ({ key, name, price });

/** Example A (BR-CO11): six picked members, Fay left blank. */
const exampleA: LinesDraft = {
  Ana: [line('Sisig', '280')],
  Ben: [line('Kare-kare', '450')],
  Cy: [line('Adobo', '220')],
  Dan: [line('Sinigang', '380')],
  Eve: [line('Pancit', '180'), line('Halo-halo', '120')],
};
const sixPicked = ['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay'];

/* ------------------------------ normaliseOrderName ------------------------ */

describe('normaliseOrderName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(normaliseOrderName('  Pork \t  sisig\n')).toBe('Pork sisig');
  });

  it('cuts at 60 code points without splitting an emoji', () => {
    const long = '🍜'.repeat(70);
    const out = normaliseOrderName(long);
    expect(Array.from(out)).toHaveLength(ORDER_NAME_MAX);
    expect(out).toBe('🍜'.repeat(60));
  });

  it('gives an empty string for blank, whitespace and non-strings', () => {
    expect(normaliseOrderName('')).toBe('');
    expect(normaliseOrderName('   ')).toBe('');
    expect(normaliseOrderName(42)).toBe('');
    expect(normaliseOrderName(null)).toBe('');
  });

  it('turns a NUL into a space', () => {
    expect(normaliseOrderName('a\u0000b')).toBe('a b');
  });
});

/* ------------------------------- linesOf ---------------------------------- */

describe('linesOf', () => {
  it('gives one empty line with the first key when there is no entry', () => {
    expect(linesOf({}, 'Ana')).toEqual([{ key: FIRST_LINE_KEY, name: '', price: '' }]);
  });

  it('gives the entry as it is', () => {
    const lines = { Ana: [line('A', '1'), line('B', '2')] };
    expect(linesOf(lines, 'Ana')).toBe(lines.Ana);
  });
});

/* ------------------------------- linesTotal ------------------------------- */

describe('linesTotal', () => {
  it('sums every priced line of the picked members (AC-CO2.1, AC-CO2.3)', () => {
    expect(linesTotal(['Ana'], { Ana: [line('Sisig', '280')] })).toBe(280);
    expect(linesTotal(['Eve'], exampleA)).toBe(300);
  });

  it('ignores members who are not picked', () => {
    expect(linesTotal(['Ana'], exampleA)).toBe(280);
  });

  it('reads unreadable, negative and empty prices as 0 (BR-CO7)', () => {
    const lines = { Ana: [line('a', 'abc'), line('b', '-5'), line('c', ''), line('d', '12.5')] };
    expect(linesTotal(['Ana'], lines)).toBe(12.5);
  });
});

/* ------------------------------- blankPicked ------------------------------ */

describe('blankPicked', () => {
  it('treats a member with only a named, unpriced line as blank', () => {
    expect(blankPicked(['Ana'], { Ana: [line('Bulalo', '')] })).toEqual(['Ana']);
  });

  it('never lists a member who is not picked, and is alphabetical', () => {
    expect(blankPicked(['Cy', 'Ben'], { Ana: [line('x', '')] })).toEqual(['Ben', 'Cy']);
  });

  it('does not list a member with a priced line', () => {
    expect(blankPicked(sixPicked, exampleA)).toEqual(['Fay']);
  });

  // A clear sets the same '' that deleting by hand does (AC-CF2.3, AC-CF2.5).
  it('lists a member whose only priced line was cleared, and Fill Remainder gives it the rest (AC-CF2.3)', () => {
    const lines: LinesDraft = { Ana: [line('', '200')], Ben: [line('', '')] };
    expect(blankPicked(['Ana', 'Ben'], lines)).toEqual(['Ben']);
    expect(fillRemainder(500, ['Ana', 'Ben'], lines).Ben[0].price).toBe('300.00');
  });

  it('does not list a member who still has another priced line after a clear (AC-CF2.5)', () => {
    const lines: LinesDraft = { Ben: [line('', '300', 'a'), line('', '', 'b')] };
    expect(blankPicked(['Ben'], lines)).toEqual([]);
  });
});

/* ---------------------------- unpricedNamedLine --------------------------- */

describe('unpricedNamedLine', () => {
  it('returns the name of a named line with no price (AC-CO2.7)', () => {
    const lines = { Ana: [line('Sisig', '280')], Ben: [line('Bulalo', '')] };
    expect(unpricedNamedLine(['Ana', 'Ben'], lines)).toBe('Bulalo');
  });

  it('is null once priced or once the name is cleared', () => {
    expect(unpricedNamedLine(['Ben'], { Ben: [line('Bulalo', '100')] })).toBeNull();
    expect(unpricedNamedLine(['Ben'], { Ben: [line('  ', '')] })).toBeNull();
  });

  it('returns the first such line in member and line order', () => {
    const lines = {
      Cy: [line('Third', '')],
      Ana: [line('Priced', '5'), line('First', ''), line('Second', '')],
    };
    expect(unpricedNamedLine(['Cy', 'Ana'], lines)).toBe('First');
  });
});

/* ------------------------------ fillRemainder ----------------------------- */

describe('fillRemainder', () => {
  it("fills only Fay's first line in Example A (AC-CO3.1)", () => {
    const out = fillRemainder(1830, sixPicked, exampleA);
    expect(out.Fay).toEqual([{ key: FIRST_LINE_KEY, name: '', price: '200.00' }]);
    expect(out.Ana).toBe(exampleA.Ana);
    expect(out.Eve).toBe(exampleA.Eve);
    // The four who aren't picked get no entries.
    expect(Object.keys(out).sort()).toEqual(['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay']);
  });

  it('splits across three blank members as 166.67, 166.67, 166.66 (AC-CO3.2)', () => {
    const lines: LinesDraft = { Ana: [line('', '250')], Ben: [line('', '250')] };
    const out = fillRemainder(1000, ['Ana', 'Ben', 'Cy', 'Dan', 'Eve'], lines);
    expect(out.Cy[0].price).toBe('166.67');
    expect(out.Dan[0].price).toBe('166.67');
    expect(out.Eve[0].price).toBe('166.66');
  });

  it("keeps a named blank line's name and gives it the price (AC-CO3.4)", () => {
    const out = fillRemainder(500, ['Ana'], { Ana: [line('Bulalo', '')] });
    expect(out.Ana).toEqual([{ key: 'k', name: 'Bulalo', price: '500.00' }]);
  });

  it("leaves a member with a priced line untouched, and fills a blank one's first line (AC-CO3.5)", () => {
    const lines: LinesDraft = {
      Ana: [line('Sisig', '100')],
      Ben: [line('', ''), line('Extra', '')],
    };
    const out = fillRemainder(300, ['Ana', 'Ben'], lines);
    expect(out.Ana).toBe(lines.Ana);
    expect(out.Ben[0].price).toBe('200.00');
    expect(out.Ben[1]).toEqual(lines.Ben[1]);
    expect(out.Ben).toHaveLength(2);
  });

  it('leaves the third blank when 0.02 is split across three', () => {
    const out = fillRemainder(0.02, ['Ana', 'Ben', 'Cy'], {});
    expect(out.Ana[0].price).toBe('0.01');
    expect(out.Ben[0].price).toBe('0.01');
    expect(out.Cy).toBeUndefined();
  });

  it('changes nothing when the remainder is zero or less', () => {
    const lines: LinesDraft = { Ana: [line('', '100')] };
    const out = fillRemainder(100, ['Ana', 'Ben'], lines);
    expect(out).toEqual(lines);
    expect(fillRemainder(50, ['Ana', 'Ben'], lines)).toEqual(lines);
  });

  it('does not mutate its input', () => {
    const before = JSON.parse(JSON.stringify(exampleA));
    fillRemainder(1830, sixPicked, exampleA);
    expect(exampleA).toEqual(before);
  });
});

/* --------------------------- linesFromEqualSplit -------------------------- */

describe('linesFromEqualSplit', () => {
  it('gives each picked member their equal share, matching getItemShares (BR-CO4)', () => {
    const picked = ['Ana', 'Ben', 'Cy'];
    const out = linesFromEqualSplit(100, picked);
    expect(['Ana', 'Ben', 'Cy'].map((m) => out[m][0].price)).toEqual(['33.34', '33.33', '33.33']);
    const shares = getItemShares({
      id: '',
      mode: 'equal',
      name: '',
      totalPrice: 100,
      owners: picked,
    });
    for (const m of picked) expect(Number(out[m][0].price)).toBe(shares[m]);
    expect(out.Ana[0].key).toBe(FIRST_LINE_KEY);
  });

  it('gives {} for a price of 0', () => {
    expect(linesFromEqualSplit(0, ['Ana'])).toEqual({});
  });

  it('gives "0.01", "" and "" for a centavo over three', () => {
    const out = linesFromEqualSplit(0.01, ['Ana', 'Ben', 'Cy']);
    expect(['Ana', 'Ben', 'Cy'].map((m) => out[m][0].price)).toEqual(['0.01', '', '']);
  });
});

/* ------------------------------ itemFromLines ----------------------------- */

describe('itemFromLines', () => {
  it('leaves out a picked member with only an empty line (AC-CO2.8)', () => {
    const item = itemFromLines('i', 'Dinner', ['Ana', 'Ben'], { Ana: [line('', '50')] });
    expect(item.amounts).toEqual({ Ana: 50 });
  });

  it('stores unnamed lines as amounts alone, with no lines key (BR-CO17)', () => {
    const item = itemFromLines('i', 'Dinner', ['Ana'], { Ana: [line('', '100'), line('', '50')] });
    expect(item).toEqual({ id: 'i', mode: 'custom', name: 'Dinner', amounts: { Ana: 150 } });
    expect('lines' in item).toBe(false);
  });

  it('keeps unnamed lines beside named ones, in member then line order', () => {
    const lines: LinesDraft = {
      Ben: [line('Kare-kare', '450')],
      Ana: [line('', '10'), line('Sisig', '270')],
    };
    const item = itemFromLines('i', 'Dinner', ['Ben', 'Ana'], lines);
    expect(item.lines).toEqual([
      { member: 'Ana', name: '', amount: 10 },
      { member: 'Ana', name: 'Sisig', amount: 270 },
      { member: 'Ben', name: 'Kare-kare', amount: 450 },
    ]);
    expect(item.amounts).toEqual({ Ana: 280, Ben: 450 });
  });

  it('drops lines at 0 and tidies names', () => {
    const lines: LinesDraft = { Ana: [line('  Pork   sisig ', '5'), line('Nothing', '0')] };
    const item = itemFromLines('i', 'D', ['Ana'], lines);
    expect(item.lines).toEqual([{ member: 'Ana', name: 'Pork sisig', amount: 5 }]);
  });

  it('serializes two calls on the same input identically', () => {
    const a = itemFromLines('i', 'D', sixPicked, exampleA);
    const b = itemFromLines('i', 'D', sixPicked, exampleA);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('matches Example A', () => {
    const item = itemFromLines('i', 'Dinner', sixPicked, {
      ...exampleA,
      Fay: [line('', '200')],
    });
    expect(item.amounts).toEqual({ Ana: 280, Ben: 450, Cy: 220, Dan: 380, Eve: 300, Fay: 200 });
    expect(item.lines).toHaveLength(7);
  });
});

/* ----------------------------- linesFromItem ------------------------------ */

describe('linesFromItem', () => {
  const members = ['Ana', 'Ben', 'Cy'];

  it('loads an amounts-only item as one unnamed line per member', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'X',
      amounts: { Ana: 10, Cy: 5.5 },
    };
    const lines = linesFromItem(item, members);
    expect(Object.keys(lines)).toEqual(['Ana', 'Cy']);
    expect(lines.Ana).toEqual([{ key: FIRST_LINE_KEY, name: '', price: '10.00' }]);
    expect(lines.Cy[0].price).toBe('5.50');
  });

  it("loads an itemized item's lines in stored order, with fresh keys after the first", () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'X',
      amounts: { Eve: 300 },
      lines: [
        { member: 'Eve', name: 'Pancit', amount: 180 },
        { member: 'Eve', name: 'Halo-halo', amount: 120 },
      ],
    };
    const lines = linesFromItem(item, ['Eve']);
    expect(lines.Eve.map((l) => [l.name, l.price])).toEqual([
      ['Pancit', '180.00'],
      ['Halo-halo', '120.00'],
    ]);
    expect(lines.Eve[0].key).toBe(FIRST_LINE_KEY);
    expect(lines.Eve[1].key).not.toBe(FIRST_LINE_KEY);
  });

  it('leaves out members with no amount, or who are no longer members', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'X',
      amounts: { Ana: 10, Ben: 0, Gone: 5 },
    };
    expect(Object.keys(linesFromItem(item, members))).toEqual(['Ana']);
  });
});

describe('round trip of saved items (AC-CO7.6, AC-CO9.2)', () => {
  const members = ['Ana', 'Ben', 'Cy'];

  it('gives an amounts-only item back unchanged', () => {
    const old: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'X',
      amounts: { Ana: 10, Cy: 5 },
    };
    const lines = linesFromItem(old, members);
    expect(itemFromLines('i', 'X', Object.keys(lines), lines)).toEqual(old);
  });

  it('gives an itemized item back unchanged', () => {
    const old: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'X',
      amounts: { Ana: 280, Cy: 300 },
      lines: [
        { member: 'Ana', name: 'Sisig', amount: 280 },
        { member: 'Cy', name: 'Pancit', amount: 180 },
        { member: 'Cy', name: '', amount: 120 },
      ],
    };
    const lines = linesFromItem(old, members);
    const back = itemFromLines('i', 'X', Object.keys(lines), lines);
    expect(back).toEqual(old);
    expect(JSON.stringify(back)).toBe(JSON.stringify(old));
  });

  it('loads a member with an amount of 0 as unpicked', () => {
    const old: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'X',
      amounts: { Ana: 10, Ben: 0 },
    };
    const lines = linesFromItem(old, members);
    expect(Object.keys(lines)).toEqual(['Ana']);
    expect(itemFromLines('i', 'X', Object.keys(lines), lines).amounts).toEqual({ Ana: 10 });
  });
});

/* -------------------------------------------------------------------------- */
/* Shared orders, discounts and charges                                        */
/* -------------------------------------------------------------------------- */

/** A bill draft holding the rows given, each with the fields the test cares about. */
const split = (
  name: string,
  amount: string,
  over: { everyone?: boolean; members?: string[] } = {},
  key = name || 'row',
) => ({
  key,
  name,
  amount,
  everyone: over.everyone ?? true,
  members: Object.fromEntries((over.members ?? []).map((m) => [m, true])),
});
const billDraft = (over: Partial<BillDraft>): BillDraft => ({ ...EMPTY_BILL_DRAFT, ...over });

/** Example A as typed: Ana and Ben's ramen, and a Gyoza on Everyone. */
const ramen: LinesDraft = { Ana: [line('Ramen', '720')], Ben: [line('Ramen', '750')] };
const gyoza = billDraft({ shared: [split('Gyoza', '290')] });
const twoPicked = ['Ana', 'Ben'];

describe('bill row operations (O-1)', () => {
  it('addBillRow starts a shared row on Everyone, a discount on nobody, a charge with no picker', () => {
    const shared = addBillRow(EMPTY_BILL_DRAFT, 'shared').shared[0];
    expect(shared).toMatchObject({ name: '', amount: '', everyone: true, members: {} });
    const discount = addBillRow(EMPTY_BILL_DRAFT, 'discounts').discounts[0];
    expect(discount).toMatchObject({ everyone: false, members: {} });
    const charge = addBillRow(EMPTY_BILL_DRAFT, 'charges').charges[0];
    expect(Object.keys(charge).sort()).toEqual(['amount', 'key', 'name']);
  });

  it('gives each new row its own key', () => {
    const two = addBillRow(addBillRow(EMPTY_BILL_DRAFT, 'shared'), 'shared');
    expect(two.shared[0].key).not.toBe(two.shared[1].key);
  });

  it('setBillRow and removeBillRow change one row; a section can be emptied (BR-CA29)', () => {
    let bill = addBillRow(addBillRow(EMPTY_BILL_DRAFT, 'charges'), 'charges');
    bill = setBillRow(bill, 'charges', 1, { name: 'VAT', amount: '12' });
    expect(bill.charges[1]).toMatchObject({ name: 'VAT', amount: '12' });
    expect(bill.charges[0]).toMatchObject({ name: '', amount: '' });
    bill = removeBillRow(removeBillRow(bill, 'charges', 0), 'charges', 0);
    expect(bill.charges).toEqual([]);
    expect(hasBillRows(bill)).toBe(false);
  });

  it('hasBillRows counts a row with nothing typed (BR-CA31)', () => {
    expect(hasBillRows(addBillRow(EMPTY_BILL_DRAFT, 'discounts'))).toBe(true);
  });

  it('toggleRowEveryone unticks to nobody (AC-CA1.5) and ticks back', () => {
    const off = toggleRowEveryone(gyoza, 'shared', 0);
    expect(off.shared[0]).toMatchObject({ everyone: false, members: {} });
    expect(toggleRowEveryone(off, 'shared', 0).shared[0].everyone).toBe(true);
  });

  it('ticking every picked member one by one becomes Everyone (BR-CA21)', () => {
    let bill = toggleRowEveryone(gyoza, 'shared', 0);
    bill = toggleRowMember(bill, 'shared', 0, 'Ana', twoPicked);
    expect(bill.shared[0]).toMatchObject({ everyone: false, members: { Ana: true } });
    bill = toggleRowMember(bill, 'shared', 0, 'Ben', twoPicked);
    expect(bill.shared[0]).toMatchObject({ everyone: true, members: {} });
  });

  it('rowMembers ignores unpicked members, and picks up a late member on Everyone (AC-CA1.11)', () => {
    const hand = split('Gyoza', '1', { everyone: false, members: ['Ana', 'Zed'] });
    expect(rowMembers(hand, ['Ana', 'Ben'])).toEqual(['Ana']);
    expect(rowMembers(gyoza.shared[0], ['Ana', 'Ben', 'Gus'])).toEqual(['Ana', 'Ben', 'Gus']);
  });

  it('unpickFromBill takes members off hand-picked rows, and never removes a row (AC-CA9.5)', () => {
    const bill = billDraft({
      shared: [split('A', '1', { everyone: false, members: ['Ana', 'Ben'] })],
      discounts: [split('B', '1', { everyone: false, members: ['Ben'] })],
    });
    const out = unpickFromBill(bill, ['Ben'], ['Ana']);
    expect(out.shared[0].members).toEqual({ Ana: true });
    expect(out.discounts[0].members).toEqual({});
    expect(out.discounts).toHaveLength(1);
  });

  it('unpickFromBill unticks Everyone when nobody is left picked (BR-CA25)', () => {
    const out = unpickFromBill(gyoza, ['Ana', 'Ben'], []);
    expect(out.shared[0]).toMatchObject({ everyone: false, members: {} });
    expect(unpickFromBill(gyoza, ['Ben'], ['Ana']).shared[0].everyone).toBe(true);
  });

  it('none of them mutate their input', () => {
    const before = JSON.stringify(gyoza);
    toggleRowEveryone(gyoza, 'shared', 0);
    toggleRowMember(gyoza, 'shared', 0, 'Ana', twoPicked);
    setBillRow(gyoza, 'shared', 0, { name: 'x' });
    removeBillRow(gyoza, 'shared', 0);
    addBillRow(gyoza, 'shared');
    unpickFromBill(gyoza, ['Ana'], ['Ben']);
    expect(JSON.stringify(gyoza)).toBe(before);
  });
});

describe('readBillDraft with shared orders (O-2)', () => {
  it('Example A: shares 865 and 895, entered 1,760.00 (AC-CA1.3)', () => {
    const view = readBillDraft(twoPicked, ramen, gyoza);
    expect(view.shares).toEqual({ Ana: 865, Ben: 895 });
    expect(view.subtotal).toBe(1760);
    expect(view.entered).toBe(1760);
    expect(view.sharedHint).toBeNull();
  });

  it('the variant gives the odd centavo to Ana (AC-CA1.4)', () => {
    const view = readBillDraft(twoPicked, ramen, billDraft({ shared: [split('Gyoza', '290.01')] }));
    expect(view.shares).toEqual({ Ana: 865.01, Ben: 895 });
  });

  it('only Ben ticked: Ben pays all of it, with no hint (AC-CA1.6)', () => {
    const bill = billDraft({
      shared: [split('Gyoza', '290', { everyone: false, members: ['Ben'] })],
    });
    const view = readBillDraft(twoPicked, ramen, bill);
    expect(view.shares).toEqual({ Ana: 720, Ben: 1040 });
    expect(view.sharedHint).toBeNull();
  });

  it('a named, unpriced row asks for a price (AC-CA1.9)', () => {
    const view = readBillDraft(twoPicked, ramen, billDraft({ shared: [split('Gyoza', '')] }));
    expect(view.sharedHint).toBe('Add a price for Gyoza or remove it');
  });

  it('a priced row with nobody ticked asks who shares it (AC-CA1.5)', () => {
    const nobody = { everyone: false };
    expect(
      readBillDraft(twoPicked, ramen, billDraft({ shared: [split('Gyoza', '290', nobody)] }))
        .sharedHint,
    ).toBe('Choose who shares Gyoza');
    expect(
      readBillDraft(twoPicked, ramen, billDraft({ shared: [split('', '290', nobody)] })).sharedHint,
    ).toBe('Choose who shares the unnamed shared order');
  });

  it('a priced row with nobody ticked still counts in the figures, but not in the receipt', () => {
    const bill = billDraft({ shared: [split('Gyoza', '290', { everyone: false })] });
    expect(readBillDraft(twoPicked, ramen, bill).entered).toBe(1760);
    expect(billFromDraft(twoPicked, ramen, bill).some((l) => l.kind === 'shared')).toBe(false);
  });

  it('an unnamed, unpriced row is no problem and is left out of the receipt (AC-CA1.10)', () => {
    const bill = billDraft({ shared: [split('', '')] });
    expect(readBillDraft(twoPicked, ramen, bill).sharedHint).toBeNull();
    expect(billFromDraft(twoPicked, ramen, bill)).toHaveLength(2);
  });

  it('shows the first problem in row order', () => {
    const bill = billDraft({
      shared: [split('A', '5', { everyone: false }), split('B', '')],
    });
    expect(readBillDraft(twoPicked, ramen, bill).sharedHint).toBe('Choose who shares A');
  });

  it('puts a picked member with nothing typed on an Everyone row (AC-CA1.11)', () => {
    const view = readBillDraft(['Ana', 'Ben', 'Gus'], ramen, gyoza);
    // 290.00 over three: the odd centavos go to the first two names.
    expect(view.shares.Gus).toBe(96.66);
    expect(view.shares.Ana).toBe(816.67);
  });

  it('with no rows, entered is the own orders and every hint is null', () => {
    const view = readBillDraft(twoPicked, ramen, EMPTY_BILL_DRAFT);
    expect(view.entered).toBe(linesTotal(twoPicked, ramen));
    expect(view.others).toBe(0);
    expect([view.sharedHint, view.discountHint, view.chargeHint, view.floorHint]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('fillRemainder with others (O-4)', () => {
  it('C1: Ben, who is on the Gyoza but typed nothing, gets the rest (AC-CA5.1)', () => {
    const lines: LinesDraft = { Ana: [line('Ramen', '720')] };
    const view = readBillDraft(twoPicked, lines, gyoza);
    expect(view.others).toBe(290);
    const out = fillRemainder(1760, twoPicked, lines, view.others);
    expect(out.Ben[0].price).toBe('750.00');
    expect(readBillDraft(twoPicked, out, gyoza).shares).toEqual({ Ana: 865, Ben: 895 });
  });

  it('others defaults to 0, so a call without it is as PR #137 had it', () => {
    expect(fillRemainder(100, ['Ana'], {}).Ana[0].price).toBe('100.00');
  });

  it('does not touch a bill row', () => {
    const before = JSON.stringify(gyoza);
    fillRemainder(1760, twoPicked, { Ana: [line('Ramen', '720')] }, 290);
    expect(JSON.stringify(gyoza)).toBe(before);
  });
});

describe('itemFromLines with a bill (O-5)', () => {
  it('stamps Example A to exactly the stored JSON, keys in order', () => {
    const item = itemFromLines('item_a', 'Mendokoro', twoPicked, ramen, gyoza);
    expect(JSON.stringify(item)).toBe(JSON.stringify(mendokoro()));
  });

  it('stores the PR #137 shape when no shared row is priced (BR-CA43)', () => {
    const bill = billDraft({
      shared: [split('Gyoza', '')],
      charges: [{ key: 'c', name: '', amount: '' }],
    });
    const item = itemFromLines('i', 'x', twoPicked, ramen, bill);
    expect('bill' in item).toBe(false);
    expect(item.lines).toHaveLength(2);
    expect(item.amounts).toEqual({ Ana: 720, Ben: 750 });
  });

  it('two stamps of the same fields are JSON-equal, with Everyone resolved sorted', () => {
    const a = itemFromLines('i', 'x', ['Ben', 'Ana'], ramen, gyoza);
    const b = itemFromLines('i', 'x', ['Ana', 'Ben'], ramen, gyoza);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.bill?.[2]).toMatchObject({ kind: 'shared', members: ['Ana', 'Ben'] });
  });
});

describe('Edit round trip (O-6)', () => {
  const roundTrip = (item: CustomAmountItem, members: string[]) => {
    const picked = Object.keys(item.amounts);
    return itemFromLines(
      item.id,
      item.name,
      picked,
      linesFromItem(item, members),
      billDraftFromItem(item, members),
    );
  };

  it('stamps Example A back to the same item, twice over, JSON-equal (AC-CA7.2, AC-CA7.5)', () => {
    const item = mendokoro();
    const once = roundTrip(item, ['Ana', 'Ben', 'Gus']);
    expect(once).toEqual(item);
    expect(JSON.stringify(roundTrip(once, ['Ana', 'Ben', 'Gus']))).toBe(JSON.stringify(item));
    expect(roundTrip(mendokoro(true), twoPicked)).toEqual(mendokoro(true));
  });

  it('loads a member who is only on a shared order, picked with one empty line (AC-CA7.4)', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 100, Ben: 50 },
      bill: [
        { kind: 'order', member: 'Ana', name: 'Soup', amount: 100 },
        { kind: 'shared', members: ['Ana', 'Ben'], name: 'Rice', amount: 100 },
      ],
    };
    const lines = linesFromItem(item, twoPicked);
    expect(Object.keys(lines)).toEqual(['Ana', 'Ben']);
    expect(lines.Ben).toEqual([{ key: FIRST_LINE_KEY, name: '', price: '' }]);
    expect(billDraftFromItem(item, twoPicked).shared[0]).toMatchObject({ everyone: true });
    expect(roundTrip(item, twoPicked)).toEqual({
      ...item,
      amounts: { Ana: 150, Ben: 50 },
    });
  });

  it('ticks Everyone only when the members are everyone in the item', () => {
    const item: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 105, Ben: 105, Cy: 100 },
      bill: [
        { kind: 'order', member: 'Ana', name: '', amount: 100 },
        { kind: 'order', member: 'Ben', name: '', amount: 100 },
        { kind: 'order', member: 'Cy', name: '', amount: 100 },
        { kind: 'shared', members: ['Ana', 'Ben'], name: 'Rice', amount: 10 },
      ],
    };
    const row = billDraftFromItem(item, ['Ana', 'Ben', 'Cy']).shared[0];
    expect(row.everyone).toBe(false);
    expect(row.members).toEqual({ Ana: true, Ben: true });
    expect(roundTrip(item, ['Ana', 'Ben', 'Cy'])).toEqual(item);
  });

  it('gives a PR #137 item an empty bill draft and loads its lines as before', () => {
    const itemized: CustomAmountItem = {
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 30 },
      lines: [{ member: 'Ana', name: 'Sisig', amount: 30 }],
    };
    expect(billDraftFromItem(itemized, ['Ana'])).toBe(EMPTY_BILL_DRAFT);
    expect(Object.keys(linesFromItem(itemized, ['Ana']))).toEqual(['Ana']);
  });
});
