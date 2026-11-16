import { getItemShares, getItemTotal, purgeMemberFromItem } from './calculations.js';
import { compareNames, pluralize } from './format.js';
import type { ItemRef } from './includeMember.js';
import { allocateProportionally, parsePositiveAmount, roundMoney, sumMoney } from './money.js';
import type {
  NewPurchaseRecord,
  PayorContribution,
  PayorMode,
  PurchaseItem,
  PurchaseRecord,
} from '../types';

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

/** What a guide scene loads into Purchase Details as the card mounts (tab-guides, scenes B1). */
export type PurchaseFormSeed = {
  /** Date, Paid By and the item, loaded exactly as Edit loads a staged item (`fieldsFromStaged`). */
  row: StagedItem;
  /**
   * Custom Amounts only: Total Amount as the scene typed it, apart from what is entered, so the
   * footer reads "Entered ₱X of ₱Y" and Fill Remainder has a remainder to fill (scene X3).
   */
  totalAmount?: number;
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

/** A session's Paid By pick, which its Expenses tab remembers until reload (app-fixes item 3). */
export type PaidByPick = { payorMode: PayorMode; singlePayor: string };

/** A session's pick before anything is chosen, and after Clear All: One Payor, nobody picked. */
export const NO_PAID_BY_PICK: PaidByPick = { payorMode: 'single', singlePayor: '' };

/**
 * The pick as it's remembered: the mode, and the One Payor name only while One Payor is the mode
 * on screen. The other mode's entry is cleared at the next Add Item or Save anyway (BR-13).
 */
export function keptPaidBy(payorMode: PayorMode, singlePayor: string): PaidByPick {
  return { payorMode, singlePayor: payorMode === 'single' ? singlePayor : '' };
}

/** The pick the fields open with: a payor who has left the group since is dropped (BR-18). */
export function paidByFor(pick: PaidByPick, members: string[]): PaidByPick {
  return pick.singlePayor === '' || members.includes(pick.singlePayor)
    ? pick
    : { ...pick, singlePayor: '' };
}

/** Every session's remembered pick, by session id. */
export type PaidByPicks = Map<string, PaidByPick>;

/** One session's remembered pick: what its Expenses tab opens with, and where it saves changes. */
export type PaidByMemory = { read: () => PaidByPick; write: (pick: PaidByPick) => void };

export function paidByMemory(picks: PaidByPicks, sessionId: string): PaidByMemory {
  return {
    read: () => picks.get(sessionId) ?? NO_PAID_BY_PICK,
    write: (pick) => {
      picks.set(sessionId, pick);
    },
  };
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

/* -------------------------------------------------------------------------- */
/* Editing a saved item                                                        */
/* -------------------------------------------------------------------------- */

/** A saved item addressed as Breakdown addresses it, with its name as it was when Edit was pressed. */
export type SavedItemRef = ItemRef & { name: string };

/**
 * The "Leave without saving?" message: the saved item being edited if there is one, otherwise
 * the staged items. It's shared by the workspace's own prompt and the app's, which asks the same
 * question before a tutorial replaces the screen.
 */
export function leaveMessage(savedEdit: SavedItemRef | null, stagedCount: number): string {
  return savedEdit
    ? `Your changes to ${savedEdit.name} aren't saved.`
    : `You have ${pluralize(stagedCount, 'staged item')} that ${stagedCount === 1 ? "isn't" : "aren't"} saved.`;
}

/** The saved item a ref points at, with the record that holds it, or null once either has gone. */
export function findSavedItem(
  records: PurchaseRecord[],
  ref: ItemRef,
): { record: PurchaseRecord; item: PurchaseItem } | null {
  const record = records.find((r) => r.id === ref.recordId);
  const item = record?.items.find((i) => i.id === ref.itemId);
  return record && item ? { record, item } : null;
}

/**
 * What Edit loads for a saved item: the item with the Date and Paid By it has
 * today (BR-CO28). A One Payor record's payor covers the item whole. A
 * Multiple Payors record with one item carries its contributions as they are,
 * even if they no longer add up, so the form shows the mismatch. A record from
 * before flexible Paid By can hold several items under one set of
 * contributions, so the item gets its proportional share of them, in whole
 * centavos.
 */
export function stagedFromSaved(record: PurchaseRecord, item: PurchaseItem): StagedItem {
  const base = { item, date: record.date };
  if (record.payorMode === 'single') {
    return {
      ...base,
      payorMode: 'single',
      payors: [{ member: record.payors[0].member, amount: getItemTotal(item) }],
    };
  }
  if (record.items.length === 1) {
    return { ...base, payorMode: 'multiple', payors: record.payors.map((p) => ({ ...p })) };
  }
  const shares = allocateProportionally(
    getItemTotal(item),
    record.payors.map((p) => p.amount),
  );
  return {
    ...base,
    payorMode: 'multiple',
    payors: record.payors
      .map((p, i) => ({ member: p.member, amount: shares[i] }))
      .filter((p) => p.amount > 0),
  };
}

/**
 * Whether two staged items are the same. It is only meant for two values built
 * by the card's `stampFields`, which always builds its keys in the same order.
 * Never compare against saved JSON directly: `jsonb` reorders object keys, so
 * a loaded item's key order differs from a stamped one's.
 */
export function sameStaged(a: StagedItem, b: StagedItem): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether `next` keeps the date and Paid By that `loaded` was loaded with. */
function samePaidBy(next: StagedItem, loaded: StagedItem): boolean {
  if (next.date !== loaded.date || next.payorMode !== loaded.payorMode) return false;
  if (next.payorMode === 'single') return next.payors[0].member === loaded.payors[0].member;

  // Compared in whole centavos, after sorting, so the order the fields built
  // them in doesn't matter.
  const key = (payors: PayorContribution[]) =>
    [...payors]
      .sort((a, b) => compareNames(a.member, b.member))
      .map((p) => `${p.member}:${Math.round(p.amount * 100)}`)
      .join('|');
  return key(next.payors) === key(loaded.payors);
}

/**
 * The records after a saved item is edited (BR-CO30, BR-CO31), built in one go
 * so the item leaves its old place and lands in its new one together.
 *
 * With the Date and Paid By it was loaded with, the item is replaced in place:
 * same record, same position. Otherwise it moves to the record its new Date and
 * Paid By belong to, and lands last in that Breakdown card, which orders by
 * creation. Either way the item keeps its id.
 *
 * A record that has gone, or an item that has, returns `records` itself and
 * writes nothing (BR-CO35). The input is never mutated.
 */
export function applyItemEdit(
  records: PurchaseRecord[],
  ref: ItemRef,
  next: StagedItem,
  fresh: { id: string; createdAt: string },
): PurchaseRecord[] {
  const found = findSavedItem(records, ref);
  if (!found) return records;
  const { record, item: oldItem } = found;

  // Compared with the record as it is now, not as it was when Edit was
  // pressed, so a change from another device is judged against what is saved.
  const loaded = stagedFromSaved(record, oldItem);

  if (samePaidBy(next, loaded)) {
    return records.map((r) => {
      if (r !== record) return r;
      const items = r.items.map((i) => (i.id === oldItem.id ? next.item : i));
      return r.payorMode === 'single'
        ? {
            ...r,
            items,
            payors: [{ member: r.payors[0].member, amount: sumMoney(items.map(getItemTotal)) }],
          }
        : { ...r, items };
    });
  }

  const rest = record.items.filter((i) => i.id !== oldItem.id);
  const kept: PurchaseRecord[] = [];
  if (rest.length > 0) {
    kept.push({
      ...record,
      items: rest,
      payors:
        record.payorMode === 'single'
          ? [{ member: record.payors[0].member, amount: sumMoney(rest.map(getItemTotal)) }]
          : remainingContributions(record, oldItem, rest),
    });
  }

  const [built] = buildRecords([next]);
  const moved: PurchaseRecord = { ...built, id: fresh.id, createdAt: fresh.createdAt };
  return [...records.flatMap((r) => (r === record ? kept : [r])), moved];
}

/**
 * What a Multiple Payors record's contributors keep once `oldItem` has left
 * it: each contribution less its proportional share of the item. Every payor
 * stays, even at ₱0.00, because a record with no payor would be dropped
 * whole, items and all.
 *
 * If the contributions already add up to less than the item (only after a
 * contributor was removed), subtracting could go below zero. They then keep
 * the remaining items' total in the same proportions instead. Both ways keep
 * the payors' weights, so the other items' balances don't move.
 */
function remainingContributions(
  record: PurchaseRecord,
  oldItem: PurchaseItem,
  rest: PurchaseItem[],
): PayorContribution[] {
  const weights = record.payors.map((p) => p.amount);
  const contributed = Math.round(sumMoney(weights) * 100);
  const itemCents = Math.round(getItemTotal(oldItem) * 100);

  if (contributed < itemCents) {
    const parts = allocateProportionally(sumMoney(rest.map(getItemTotal)), weights);
    return record.payors.map((p, i) => ({ member: p.member, amount: parts[i] }));
  }
  const shares = allocateProportionally(getItemTotal(oldItem), weights);
  return record.payors.map((p, i) => ({
    member: p.member,
    amount: roundMoney(p.amount - shares[i]),
  }));
}
