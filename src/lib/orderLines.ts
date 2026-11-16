import { distributeRemainder, getItemShares } from './calculations.js';
import { billAmounts, billMembers } from './bill.js';
import { compareNames, formatSignedMoney } from './format.js';
import { createId } from './id.js';
import { parsePositiveAmount, sumMoney } from './money.js';
import { SESSION_NAME_MAX, normaliseSessionName } from './sessionName.js';
import type { BillLine, CustomAmountItem } from '../types';

/** The longest an order name can be: the session-name rule (BR-CO6). */
export const ORDER_NAME_MAX = SESSION_NAME_MAX;

/** An order name tidied as a session name is, or '' when nothing is left (BR-CO6). */
export function normaliseOrderName(raw: unknown): string {
  return normaliseSessionName(raw) ?? '';
}

/** One order line as typed: strings, like every other box in the form. */
export type LineDraft = { key: string; name: string; price: string };

/** member -> their lines in the order added. A picked member with no entry has one empty line. */
export type LinesDraft = Record<string, LineDraft[]>;

/**
 * The key of a block's first line. It's fixed, so the empty line a picked
 * member shows before typing keeps its inputs when typing makes it real.
 */
export const FIRST_LINE_KEY = 'first';

/**
 * A member's lines, or the one empty line a picked member always has (BR-CO5)
 * when they have none yet. Every reader goes through this, so the form never
 * has to create entries on every tick.
 */
export function linesOf(lines: LinesDraft, member: string): LineDraft[] {
  return lines[member] ?? [{ key: FIRST_LINE_KEY, name: '', price: '' }];
}

/** The sum of every priced line of the picked members. */
export function linesTotal(picked: string[], lines: LinesDraft): number {
  return sumMoney(
    picked.flatMap((m) => linesOf(lines, m).map((l) => parsePositiveAmount(l.price))),
  );
}

/** The picked members whose lines all read as ₱0, alphabetically (BR-CO11). */
export function blankPicked(picked: string[], lines: LinesDraft): string[] {
  return [...picked]
    .sort(compareNames)
    .filter((m) => linesOf(lines, m).every((l) => parsePositiveAmount(l.price) === 0));
}

/**
 * The name of the first line that has a name but no price, walking the picked
 * members alphabetically and then their lines in order; null when there is
 * none (BR-CO8, AC-CO2.7).
 */
export function unpricedNamedLine(picked: string[], lines: LinesDraft): string | null {
  for (const m of [...picked].sort(compareNames)) {
    for (const l of linesOf(lines, m)) {
      const name = normaliseOrderName(l.name);
      if (name && parsePositiveAmount(l.price) === 0) return name;
    }
  }
  return null;
}

/**
 * Splits what is left of `totalAmount` across the picked members who have no
 * priced line, alphabetically, into their first line (BR-CO11). A name already
 * typed on that line stays (AC-CO3.4). A part of ₱0.00 leaves the member blank,
 * and nobody else is touched (AC-CO3.5). The input is never mutated.
 *
 * `others` is the net of the item's shared orders, discounts and charges
 * (BR-CA20), which come off the remainder besides the own orders. Filling never
 * touches a bill row.
 */
export function fillRemainder(
  totalAmount: number,
  picked: string[],
  lines: LinesDraft,
  others = 0,
): LinesDraft {
  const blank = blankPicked(picked, lines);
  const fills = distributeRemainder(totalAmount, [linesTotal(picked, lines), others], blank.length);
  const out = { ...lines };
  blank.forEach((m, i) => {
    if (fills[i] <= 0) return;
    const [first, ...rest] = linesOf(lines, m);
    out[m] = [{ ...first, price: fills[i].toFixed(2) }, ...rest];
  });
  return out;
}

/**
 * What switching Equal Split to Custom Amounts carries over: each picked
 * member's equal share as their first line's price (BR-CO4). With no price
 * there is nothing to share, and every picked member shows one empty line.
 */
export function linesFromEqualSplit(price: number, picked: string[]): LinesDraft {
  if (price <= 0) return {};
  const shares = getItemShares({
    id: '',
    mode: 'equal',
    name: '',
    totalPrice: price,
    owners: picked,
  });
  return Object.fromEntries(
    picked.map((m) => [
      m,
      [{ key: FIRST_LINE_KEY, name: '', price: shares[m] > 0 ? shares[m].toFixed(2) : '' }],
    ]),
  );
}

/**
 * What Edit loads for a Custom item (AC-CO4.3, AC-CO7.4, AC-CO7.6, BR-CO17,
 * BR-CO18): each current member with an amount, in `members` order. An itemized
 * item gives its lines as stored; an older one gives one unnamed line holding
 * the member's amount. Members with no amount, or no longer in the session, are
 * left out, so they show as unpicked.
 */
export function linesFromItem(item: CustomAmountItem, members: string[]): LinesDraft {
  const out: LinesDraft = {};
  if (item.bill) {
    // With a bill, everyone in the item is loaded, at ₱0.00 too (BR-CA38). A
    // member only on a shared order has no own order, and still needs an entry,
    // because the picked members are read back from these keys.
    for (const m of members) {
      if (!Object.hasOwn(item.amounts, m)) continue;
      const orders = item.bill.flatMap((l) =>
        l.kind === 'order' && l.member === m ? [{ name: l.name, price: l.amount.toFixed(2) }] : [],
      );
      const drafts = orders.length > 0 ? orders : [{ name: '', price: '' }];
      out[m] = drafts.map((d, i) => ({ key: i === 0 ? FIRST_LINE_KEY : createId('line'), ...d }));
    }
    return out;
  }
  for (const m of members) {
    if (!(item.amounts[m] > 0)) continue;
    const stored = item.lines?.filter((l) => l.member === m) ?? [];
    const drafts =
      stored.length > 0
        ? stored.map((l) => ({ name: l.name, price: l.amount.toFixed(2) }))
        : [{ name: '', price: item.amounts[m].toFixed(2) }];
    out[m] = drafts.map((d, i) => ({ key: i === 0 ? FIRST_LINE_KEY : createId('line'), ...d }));
  }
  return out;
}

/**
 * The Custom item the form stands for, as Add Item and Save Edits store it
 * (BR-CO8, BR-CO12, BR-CO13, BR-CO17). Lines at ₱0 are dropped, and a member's
 * `amounts` entry is the sum of what they have left. `lines` is kept only when
 * at least one has a name. The keys are always built in the same order, so two
 * stamps of the same fields serialize identically. `name` comes in trimmed.
 * Unpriced shared, discount and charge rows are dropped, so a receipt with none
 * priced is stored exactly as before (BR-CA43).
 */
export function itemFromLines(
  id: string,
  name: string,
  picked: string[],
  lines: LinesDraft,
  bill: BillDraft = EMPTY_BILL_DRAFT,
): CustomAmountItem {
  // With a priced shared order, discount or charge the item keeps the whole
  // receipt, and `amounts` is what the bill gives each member (BR-CA42).
  const receipt = billFromDraft(picked, lines, bill);
  if (receipt.some((l) => l.kind !== 'order')) {
    return {
      id,
      mode: 'custom',
      name,
      amounts: billAmounts(receipt, billMembers(receipt)),
      bill: receipt,
    };
  }

  const amounts: Record<string, number> = {};
  const kept: { member: string; name: string; amount: number }[] = [];

  for (const m of [...picked].sort(compareNames)) {
    const mine = linesOf(lines, m)
      .map((l) => ({
        member: m,
        name: normaliseOrderName(l.name),
        amount: parsePositiveAmount(l.price),
      }))
      .filter((l) => l.amount > 0);
    const sum = sumMoney(mine.map((l) => l.amount));
    if (sum > 0) amounts[m] = sum;
    kept.push(...mine);
  }

  return kept.some((l) => l.name !== '')
    ? { id, mode: 'custom', name, amounts, lines: kept }
    : { id, mode: 'custom', name, amounts };
}

/* -------------------------------------------------------------------------- */
/* Shared orders, discounts and charges                                        */
/* -------------------------------------------------------------------------- */

/** A shared order or discount as typed (BR-CA3, BR-CA4). */
export type SplitRowDraft = {
  key: string;
  name: string;
  amount: string;
  /** "Everyone": every picked member, now and later (BR-CA21). */
  everyone: boolean;
  /** Who is ticked while `everyone` is off. */
  members: Record<string, boolean>;
};

/** A charge as typed: split over everyone in the item, so it has no picker (BR-CA5). */
export type ChargeRowDraft = { key: string; name: string; amount: string };

export type BillDraft = {
  shared: SplitRowDraft[];
  discounts: SplitRowDraft[];
  charges: ChargeRowDraft[];
};
export type BillSection = keyof BillDraft;

export const EMPTY_BILL_DRAFT: BillDraft = { shared: [], discounts: [], charges: [] };

/** True when any section has a row, priced or not (BR-CA31). */
export function hasBillRows(bill: BillDraft): boolean {
  return bill.shared.length + bill.discounts.length + bill.charges.length > 0;
}

/**
 * Who a shared order or discount row is for. Unpicked members never count, so
 * unpicking takes them off every row at once (BR-CA24).
 */
export function rowMembers(row: SplitRowDraft, picked: string[]): string[] {
  return row.everyone ? picked : picked.filter((m) => row.members[m]);
}

/** Replaces one section's rows; the other two are kept as they are. */
function withRows<S extends BillSection>(
  bill: BillDraft,
  section: S,
  change: (rows: BillDraft[S]) => BillDraft[S],
): BillDraft {
  return { ...bill, [section]: change(bill[section]) };
}

/** Adds an empty row: a shared order starts on "Everyone", a discount on nobody (BR-CA22). */
export function addBillRow(bill: BillDraft, section: BillSection): BillDraft {
  const row = { key: createId('row'), name: '', amount: '' };
  if (section === 'charges') return { ...bill, charges: [...bill.charges, row] };
  const split: SplitRowDraft = { ...row, everyone: section === 'shared', members: {} };
  return { ...bill, [section]: [...bill[section], split] };
}

/**
 * What the Equal Split hint's switch starts the receipt with (bill-ux-polish-2 item 5): the price
 * as one unnamed shared order on "Everyone", when there is a price, then one empty discount with
 * nobody ticked (BR-CA22), ready for the person who gets it.
 */
export function billForOneDiscount(price: number): BillDraft {
  const shared =
    price > 0
      ? setBillRow(addBillRow(EMPTY_BILL_DRAFT, 'shared'), 'shared', 0, {
          amount: price.toFixed(2),
        })
      : EMPTY_BILL_DRAFT;
  return addBillRow(shared, 'discounts');
}

/** Types into one row's name or amount. */
export function setBillRow(
  bill: BillDraft,
  section: BillSection,
  index: number,
  patch: { name?: string; amount?: string },
): BillDraft {
  return withRows(bill, section, (rows) =>
    rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
  );
}

/** Drops one row. A section can be emptied (BR-CA29). */
export function removeBillRow(bill: BillDraft, section: BillSection, index: number): BillDraft {
  return withRows(bill, section, (rows) => rows.filter((_, i) => i !== index));
}

/** Ticking "Everyone" off leaves nobody ticked (AC-CA1.5); ticking it on clears the hand picks. */
export function toggleRowEveryone(
  bill: BillDraft,
  section: 'shared' | 'discounts',
  index: number,
): BillDraft {
  return withRows(bill, section, (rows) =>
    rows.map((r, i) => (i === index ? { ...r, everyone: !r.everyone, members: {} } : r)),
  );
}

/** Ticks or unticks one member; every picked member ticked is "Everyone" (BR-CA21). */
export function toggleRowMember(
  bill: BillDraft,
  section: 'shared' | 'discounts',
  index: number,
  member: string,
  picked: string[],
): BillDraft {
  return withRows(bill, section, (rows) =>
    rows.map((r, i) => {
      if (i !== index) return r;
      const members = { ...r.members, [member]: !r.members[member] };
      const all = picked.length > 0 && picked.every((m) => members[m]);
      return all ? { ...r, everyone: true, members: {} } : { ...r, members };
    }),
  );
}

/**
 * Takes members who were just unpicked off every shared order and discount
 * (BR-CA24). With nobody picked left, every row's "Everyone" goes too, so each
 * row has nobody ticked (BR-CA25). Rows are never removed.
 */
export function unpickFromBill(
  bill: BillDraft,
  removed: string[],
  pickedAfter: string[],
): BillDraft {
  const unpick = (rows: SplitRowDraft[]) =>
    rows.map((r) => {
      const members = { ...r.members };
      for (const m of removed) delete members[m];
      return { ...r, members, everyone: pickedAfter.length === 0 ? false : r.everyone };
    });
  return { ...bill, shared: unpick(bill.shared), discounts: unpick(bill.discounts) };
}

/**
 * The receipt the form stands for, priced rows only, in BR-CA34 order: own
 * orders by member and then as added, then shared orders, discounts and
 * charges. A priced shared order or discount with nobody ticked is left out; it
 * still counts in the figures and blocks Add Item through its hint.
 */
export function billFromDraft(picked: string[], lines: LinesDraft, bill: BillDraft): BillLine[] {
  const receipt: BillLine[] = [];
  for (const m of [...picked].sort(compareNames)) {
    for (const l of linesOf(lines, m)) {
      const amount = parsePositiveAmount(l.price);
      if (amount > 0) {
        receipt.push({ kind: 'order', member: m, name: normaliseOrderName(l.name), amount });
      }
    }
  }
  const split = (rows: SplitRowDraft[], kind: 'shared' | 'discount') => {
    for (const row of rows) {
      const amount = parsePositiveAmount(row.amount);
      const members = [...rowMembers(row, picked)].sort(compareNames);
      if (amount > 0 && members.length > 0) {
        receipt.push({ kind, members, name: normaliseOrderName(row.name), amount });
      }
    }
  };
  split(bill.shared, 'shared');
  split(bill.discounts, 'discount');
  for (const row of bill.charges) {
    const amount = parsePositiveAmount(row.amount);
    if (amount > 0) receipt.push({ kind: 'charge', name: normaliseOrderName(row.name), amount });
  }
  return receipt;
}

/** What the form shows while a receipt is typed, worked out once (BR-CA16, BR-CA17). */
export type BillDraftView = {
  /** member -> share (BR-CA16). A picked member absent here shows "—". */
  shares: Record<string, number>;
  /** Own orders plus every priced shared order. */
  subtotal: number;
  /** Every priced discount. */
  discounts: number;
  /** Every priced charge. */
  charges: number;
  /** Entered (BR-CA17): Subtotal - Discounts + Charges. Equals the own orders with no rows. */
  entered: number;
  /** Shared - discounts + charges: what Fill Remainder takes off besides the own orders. */
  others: number;
  sharedHint: string | null;
  discountHint: string | null;
  chargeHint: string | null;
  floorHint: string | null;
};

/** The sum of a section's priced rows. */
const sectionTotal = (rows: { amount: string }[]) =>
  sumMoney(rows.map((r) => parsePositiveAmount(r.amount)));

/**
 * The first problem in a shared order or discount section, in row order: a named
 * row with no amount, or a priced row with nobody ticked (BR-CA28).
 */
function splitHint(
  rows: SplitRowDraft[],
  picked: string[],
  unpriced: (name: string) => string,
  nobody: (name: string) => string,
): string | null {
  for (const row of rows) {
    const name = normaliseOrderName(row.name);
    const amount = parsePositiveAmount(row.amount);
    if (name !== '' && amount === 0) return unpriced(name);
    if (amount > 0 && rowMembers(row, picked).length === 0) return nobody(name);
  }
  return null;
}

/** The first charge with a name and no amount, or a priced one with nobody in the item to split it over. */
function chargeHintFor(rows: ChargeRowDraft[], nobodyInItem: boolean): string | null {
  for (const row of rows) {
    const name = normaliseOrderName(row.name);
    const amount = parsePositiveAmount(row.amount);
    if (name !== '' && amount === 0) return `Add an amount for ${name} or remove it`;
    if (amount > 0 && nobodyInItem) {
      return 'Charges are split across the people with orders. Add an order first.';
    }
  }
  return null;
}

/** The first member, alphabetically, whose share would fall below ₱0.00 (BR-CA6, BR-CA11). */
function floorHintFor(shares: Record<string, number>): string | null {
  const below = Object.keys(shares)
    .filter((m) => Math.round(shares[m] * 100) < 0)
    .sort(compareNames)[0];
  return below === undefined
    ? null
    : `${below}'s share would be ${formatSignedMoney(shares[below])}. Lower the discount or add ${below}'s order.`;
}

/**
 * What the Total Amount box shows: Entered while it follows (bill-ux-polish item 1),
 * empty when Entered is ₱0.00 or less, and otherwise what was typed.
 */
export function shownTotalAmount(typed: string, follows: boolean, entered: number): string {
  if (!follows) return typed;
  return entered > 0 ? entered.toFixed(2) : '';
}

export function readBillDraft(picked: string[], lines: LinesDraft, bill: BillDraft): BillDraftView {
  const receipt = billFromDraft(picked, lines, bill);
  const own = linesTotal(picked, lines);
  const shared = sectionTotal(bill.shared);
  const discounts = sectionTotal(bill.discounts);
  const charges = sectionTotal(bill.charges);
  const others = sumMoney([shared, -discounts, charges]);
  const shares = billAmounts(receipt, billMembers(receipt));
  return {
    shares,
    subtotal: sumMoney([own, shared]),
    discounts,
    charges,
    entered: sumMoney([own, others]),
    others,
    sharedHint: splitHint(
      bill.shared,
      picked,
      (name) => `Add a price for ${name} or remove it`,
      (name) => (name ? `Choose who shares ${name}` : 'Choose who shares the unnamed shared item'),
    ),
    discountHint: splitHint(
      bill.discounts,
      picked,
      (name) => `Add an amount for ${name} or remove it`,
      (name) => (name ? `Choose who gets ${name}` : 'Choose who gets the unnamed discount'),
    ),
    chargeHint: chargeHintFor(bill.charges, billMembers(receipt).length === 0),
    floorHint: floorHintFor(shares),
  };
}

/**
 * What Edit loads for a bill item's shared orders, discounts and charges
 * (BR-CA38), one row each in stored order. "Everyone" is ticked on a row only
 * when its members are exactly everyone in the item, so an unchanged Edit stamps
 * the same item back (AC-CA7.5).
 */
export function billDraftFromItem(item: CustomAmountItem, members: string[]): BillDraft {
  if (!item.bill) return EMPTY_BILL_DRAFT;
  const picked = members.filter((m) => Object.hasOwn(item.amounts, m));
  const split = (line: Extract<BillLine, { members: string[] }>): SplitRowDraft => {
    const everyone =
      line.members.length === picked.length && line.members.every((m) => picked.includes(m));
    return {
      key: createId('row'),
      name: line.name,
      amount: line.amount.toFixed(2),
      everyone,
      members: everyone
        ? {}
        : Object.fromEntries(line.members.filter((m) => picked.includes(m)).map((m) => [m, true])),
    };
  };
  const out: BillDraft = { shared: [], discounts: [], charges: [] };
  for (const line of item.bill) {
    if (line.kind === 'shared') out.shared.push(split(line));
    else if (line.kind === 'discount') out.discounts.push(split(line));
    else if (line.kind === 'charge') {
      out.charges.push({ key: createId('row'), name: line.name, amount: line.amount.toFixed(2) });
    }
  }
  return out;
}
