import type { BillLine, CustomAmountItem } from '../types';

/**
 * The worked examples of docs/specs/custom-split-adjustments.md, as stored items.
 * Only the tests import this; each call returns a fresh object so a test can
 * change its copy.
 */

const order = (member: string, name: string, amount: number): BillLine => ({
  kind: 'order',
  member,
  name,
  amount,
});

/** Example A (Mendokoro): two own orders and a shared Gyoza. The variant has Gyoza at 290.01. */
export function exampleA(variant = false): CustomAmountItem {
  return {
    id: 'item_a',
    mode: 'custom',
    name: 'Mendokoro',
    amounts: { Ana: variant ? 865.01 : 865, Ben: 895 },
    bill: [
      order('Ana', 'Ramen', 720),
      order('Ben', 'Ramen', 750),
      { kind: 'shared', members: ['Ana', 'Ben'], name: 'Gyoza', amount: variant ? 290.01 : 290 },
    ],
  };
}

/** Example B: six diners, a PWD discount for Cy and a service charge. */
export function exampleB(): CustomAmountItem {
  return {
    id: 'item_b',
    mode: 'custom',
    name: 'Dinner',
    amounts: { Ana: 420.93, Ben: 490.93, Cy: 260.93, Dan: 335.92, Eve: 450.92, Fay: 441.42 },
    bill: [
      order('Ana', 'Sisig', 280),
      order('Ana', 'Rice', 100),
      order('Ben', 'Kare-kare', 450),
      order('Cy', 'Bulalo', 520),
      order('Dan', 'Adobo', 295),
      order('Eve', 'Pancit', 180),
      order('Eve', 'Halo-halo', 230),
      order('Fay', 'Sinigang', 400.5),
      { kind: 'discount', members: ['Cy'], name: 'PWD', amount: 300 },
      { kind: 'charge', name: 'Service charge', amount: 245.55 },
    ],
  };
}

/** Example D1: a voucher that takes Ana's whole order, so she stays in the item at 0. */
export function exampleD1(): CustomAmountItem {
  return {
    id: 'item_d1',
    mode: 'custom',
    name: 'Pasta night',
    amounts: { Ana: 0, Ben: 600 },
    bill: [
      order('Ana', 'Pasta', 450),
      order('Ben', 'Steak', 600),
      { kind: 'discount', members: ['Ana'], name: 'Voucher', amount: 450 },
    ],
  };
}

/** Example E: a discount for two holders, with an odd centavo. */
export function exampleE(): CustomAmountItem {
  return {
    id: 'item_e',
    mode: 'custom',
    name: 'Lunch',
    amounts: { Dan: 274.99, Eve: 275 },
    bill: [
      order('Dan', 'Ramen', 400),
      order('Eve', 'Ramen', 400),
      { kind: 'discount', members: ['Dan', 'Eve'], name: 'Senior', amount: 250.01 },
    ],
  };
}
