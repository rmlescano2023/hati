import { roundMoney, splitEvenly } from './money.js';
import { compareNames, formatMoney, formatSignedMoney } from './format.js';
import type { BillLine, PurchaseItem } from '../types';

/** Whole centavos, so every comparison below is exact. */
const cents = (value: number) => Math.round(roundMoney(value) * 100);

/** Everyone in the item (BR-CA13): each member on an order or shared line, alphabetically, once. */
export function billMembers(bill: readonly BillLine[]): string[] {
  const seen = new Set<string>();
  for (const line of bill) {
    if (line.kind === 'order') seen.add(line.member);
    else if (line.kind === 'shared') for (const m of line.members) seen.add(m);
  }
  return [...seen].sort(compareNames);
}

/** One member's part of one row, positive. */
export type BillPart = { member: string; amount: number };

/**
 * A row's parts (BR-CA15), alphabetically: an order is its member's; a shared
 * order or discount is `splitEvenly` over its members sorted with compareNames;
 * a charge is the same over `inItem`, and has no parts when nobody is in the item.
 */
export function billLineParts(line: BillLine, inItem: readonly string[]): BillPart[] {
  if (line.kind === 'order') return [{ member: line.member, amount: line.amount }];
  const members = [...(line.kind === 'charge' ? inItem : line.members)].sort(compareNames);
  const parts = splitEvenly(line.amount, members.length);
  return members.map((member, i) => ({ member, amount: parts[i] }));
}

/**
 * The final share of each member (BR-CA16): own orders + shared parts + charge
 * parts - discount parts, in centavos. Every member of `inItem` is present, at 0
 * too, and so is a discount holder outside it, with a negative share, so the
 * form can say whose share would go below zero. Keys are in `compareNames` order.
 */
export function billAmounts(
  bill: readonly BillLine[],
  inItem: readonly string[],
): Record<string, number> {
  const sorted = [...inItem].sort(compareNames);
  // A Map, so a member called `__proto__` is an ordinary key and becomes an own
  // property only when `Object.fromEntries` builds the record.
  const totals = new Map<string, number>(sorted.map((m) => [m, 0]));
  const add = (member: string, centavos: number) =>
    totals.set(member, (totals.get(member) ?? 0) + centavos);

  // Charges are added up in one pass rather than one `splitEvenly` per charge,
  // which would be charges x members; this runs on every session write, over
  // input with no size limit. Every charge splits over the same sorted `sorted`,
  // so `splitEvenly(c, n)` gives everyone `floor(c / n)` and one more centavo to
  // the first `c mod n`. `extra` is a difference array of those extra centavos.
  const n = sorted.length;
  let chargeBase = 0;
  const extra = new Array<number>(n + 1).fill(0);

  for (const line of bill) {
    if (line.kind === 'order') {
      add(line.member, cents(line.amount));
    } else if (line.kind === 'charge') {
      if (n === 0) continue;
      const c = cents(line.amount);
      chargeBase += Math.trunc(c / n);
      extra[0] += 1;
      extra[c % n] -= 1;
    } else {
      const sign = line.kind === 'shared' ? 1 : -1;
      for (const part of billLineParts(line, inItem)) add(part.member, sign * cents(part.amount));
    }
  }

  let run = 0;
  sorted.forEach((m, i) => {
    run += extra[i];
    add(m, chargeBase + run);
  });

  return Object.fromEntries(
    [...totals.entries()].sort(([a], [b]) => compareNames(a, b)).map(([m, c]) => [m, c / 100]),
  );
}

/**
 * Whether `bill` is a receipt for exactly these amounts (BR-CA13, BR-CA42, BR-CA44).
 * The server keeps a bill, and member removal keeps one, only when this holds.
 */
export function billMatches(bill: readonly BillLine[], amounts: Record<string, number>): boolean {
  const inItem = Object.keys(amounts);
  if (inItem.length === 0) return false;

  const onOrder = new Set<string>();
  for (const line of bill) {
    if (line.kind === 'charge') continue;
    const named = line.kind === 'order' ? [line.member] : line.members;
    for (const m of named) {
      if (!Object.hasOwn(amounts, m)) return false;
      if (line.kind !== 'discount') onOrder.add(m);
    }
  }
  if (!inItem.every((m) => onOrder.has(m))) return false;

  const got = billAmounts(bill, inItem);
  return inItem.every((m) => {
    const share = cents(got[m]);
    return share >= 0 && share === cents(amounts[m]);
  });
}

/* -------------------------------------------------------------------------- */
/* What a reader shows                                                         */
/* -------------------------------------------------------------------------- */

export type ReceiptRow = {
  kind: BillLine['kind'];
  /** As stored; '' when unnamed. */
  name: string;
  /** The printed amount, positive. */
  amount: number;
  /** member -> their part, negative for a discount. A Map, so a member called `constructor` reads safely. */
  parts: Map<string, number>;
};

/**
 * The rows under an item, in stored order (BR-CA34), or null when it has none.
 * A `bill` item gives one row per line, its parts from `billLineParts` over the
 * keys of `amounts`. A `lines` item gives one 'order' row per line, so it draws
 * exactly as in PR #137. Equal Split and amounts-only items give null.
 */
export function receiptRows(item: PurchaseItem): ReceiptRow[] | null {
  if (item.mode !== 'custom') return null;
  if (item.bill) {
    const inItem = Object.keys(item.amounts);
    return item.bill.map((line) => {
      const sign = line.kind === 'discount' ? -1 : 1;
      return {
        kind: line.kind,
        name: line.name,
        amount: line.amount,
        parts: new Map(billLineParts(line, inItem).map((p) => [p.member, sign * p.amount])),
      };
    });
  }
  if (item.lines) {
    return item.lines.map((l) => ({
      kind: 'order',
      name: l.name,
      amount: l.amount,
      parts: new Map([[l.member, l.amount]]),
    }));
  }
  return null;
}

const FALLBACK_LABEL: Record<BillLine['kind'], string> = {
  order: 'No name',
  shared: 'Shared item',
  discount: 'Discount',
  charge: 'Charge',
};

/** The row's label (BR-CA35); `fallback` when it has no name, so it's styled as "No name" is. */
export function receiptRowLabel(row: ReceiptRow): { text: string; fallback: boolean } {
  if (row.name === '') return { text: FALLBACK_LABEL[row.kind], fallback: true };
  return { text: row.kind === 'shared' ? `${row.name} (shared)` : row.name, fallback: false };
}

/**
 * The staged-list pill for a row (BR-CA36). `people` is how many members the item has: a shared
 * order or discount that covers all of them, from four up, ends "· all N" instead of every name.
 */
export function receiptPillText(row: ReceiptRow, people: number): string {
  const members = [...row.parts.keys()];
  if (row.kind === 'order') {
    const [member] = members;
    return row.name
      ? `${member} · ${row.name} ${formatMoney(row.amount)}`
      : `${member}: ${formatMoney(row.amount)}`;
  }
  const label = receiptRowLabel(row).text;
  if (row.kind === 'charge') {
    const n = members.length;
    return `${label} ${formatMoney(row.amount)} · ${n === 1 ? members[0] : `split ${n} ways`}`;
  }
  const printed =
    row.kind === 'discount' ? formatSignedMoney(-row.amount) : formatMoney(row.amount);
  const who = people >= 4 && members.length === people ? `all ${people}` : members.join(', ');
  return `${label} ${printed} · ${who}`;
}
