import { describe, expect, it } from 'vitest';
import {
  FIRST_LINE_KEY,
  ORDER_NAME_MAX,
  blankPicked,
  fillRemainder,
  itemFromLines,
  linesFromEqualSplit,
  linesFromItem,
  linesOf,
  linesTotal,
  normaliseOrderName,
  unpricedNamedLine,
  type LineDraft,
  type LinesDraft,
} from './orderLines';
import { getItemShares } from './calculations';
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
