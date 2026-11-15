import { distributeRemainder, getItemShares } from './calculations.js';
import { compareNames } from './format.js';
import { createId } from './id.js';
import { parsePositiveAmount, sumMoney } from './money.js';
import { SESSION_NAME_MAX, normaliseSessionName } from './sessionName.js';
import type { CustomAmountItem } from '../types';

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
 */
export function fillRemainder(
  totalAmount: number,
  picked: string[],
  lines: LinesDraft,
): LinesDraft {
  const blank = blankPicked(picked, lines);
  const fills = distributeRemainder(totalAmount, [linesTotal(picked, lines)], blank.length);
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
 */
export function itemFromLines(
  id: string,
  name: string,
  picked: string[],
  lines: LinesDraft,
): CustomAmountItem {
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
