import { getItemShares, getItemTotal, purgeMemberFromItem } from './calculations.js';
import { parsePositiveAmount, sumMoney } from './money.js';
import type { NewPurchaseRecord, PayorContribution, PayorMode, PurchaseItem } from '../types';

/** One row of the staging list: the item plus the Date and Paid By stamped on it at Add Item (BR-1). */
export type StagedItem = {
  /** `item.id` is the row's id. */
  item: PurchaseItem;
  /** ISO YYYY-MM-DD, never empty (BR-3). */
  date: string;
  /** As chosen when stamped; Edit restores it. */
  payorMode: PayorMode;
  /**
   * single:   exactly one entry; its amount is ignored, because buildRecords recomputes it.
   * multiple: the contributions above 0, rounded, in member order (BR-5).
   */
  payors: PayorContribution[];
};

/**
 * The contributions typed for an item, as stored: each rounded to the centavo
 * first, and kept only above 0, in member order. Keys that aren't current
 * members are ignored, so a removed member can't linger in the check.
 */
export function readContributions(
  raw: Record<string, string>,
  members: string[],
): PayorContribution[] {
  return members
    .map((member) => ({ member, amount: parsePositiveAmount(raw[member]) }))
    .filter((p) => p.amount > 0);
}

/**
 * Whether the contributions cover the item exactly (BR-5). Compared in whole
 * centavos, so float dust such as 0.1 + 0.2 against 0.3 doesn't fail it. One
 * contributor is allowed.
 */
export function contributionsMatch(payors: PayorContribution[], itemTotal: number): boolean {
  if (payors.length === 0 || itemTotal <= 0) return false;
  const contributed = sumMoney(payors.map((p) => p.amount));
  return Math.round(contributed * 100) === Math.round(itemTotal * 100);
}

/**
 * The member who paid for an item alone, or null when two or more share it. A
 * Multiple Payors item with one contributor weighs exactly like a One Payor
 * one (`getPayorWeights`), so it is filed like one.
 */
function soloPayor(staged: StagedItem): string | null {
  return staged.payors.length === 1 ? staged.payors[0].member : null;
}

/**
 * The records one Save to Breakdown adds, in staging order (BR-6 to BR-9).
 *
 * Items paid by one member share a record per date and payor, which changes no
 * balance: that member's weight is 1 either way. An item shared between payors
 * always gets a record of its own, because a record splits what non-payors owe
 * in proportion to its contributions, so merging two of them would change who
 * owes whom (BR-8). Breakdown still shows them in one card, since it groups by
 * date and payor names.
 */
export function buildRecords(staged: StagedItem[]): NewPurchaseRecord[] {
  const records: NewPurchaseRecord[] = [];
  const solo = new Map<string, NewPurchaseRecord>();

  for (const s of staged) {
    const payor = soloPayor(s);
    if (payor === null) {
      records.push({
        date: s.date,
        payorMode: 'multiple',
        payors: s.payors.map((p) => ({ ...p })),
        items: [s.item],
      });
      continue;
    }

    const key = JSON.stringify([s.date, payor]);
    const existing = solo.get(key);
    if (existing) {
      existing.items.push(s.item);
    } else {
      const record: NewPurchaseRecord = {
        date: s.date,
        payorMode: 'single',
        payors: [{ member: payor, amount: 0 }],
        items: [s.item],
      };
      solo.set(key, record);
      records.push(record);
    }
  }

  // A single payor's amount is what they paid for the record: its items' total.
  for (const record of solo.values()) {
    record.payors[0].amount = sumMoney(record.items.map(getItemTotal));
  }
  return records;
}

/**
 * Takes a removed member out of the staged items the way `removeMember` takes
 * them out of saved records: out of owners, amounts and payors, and an item
 * left with no owners or no payor goes. The remaining contributions aren't
 * rescaled (BR-17). An item that doesn't name the member comes back as the
 * same object.
 */
export function purgeMemberFromStaged(staged: StagedItem[], member: string): StagedItem[] {
  return staged.flatMap((s) => {
    const item = purgeMemberFromItem(s.item, member);
    const payors = s.payors.filter((p) => p.member !== member);
    if (item === null || payors.length === 0) return [];
    if (item === s.item && payors.length === s.payors.length) return [s];
    return [{ ...s, item, payors }];
  });
}

/** Whether removing `member` would change any staged item, for the confirmation. */
export function stagedNamesMember(staged: StagedItem[], member: string): boolean {
  return staged.some(
    (s) => member in getItemShares(s.item) || s.payors.some((p) => p.member === member),
  );
}
