import { groupRecordsForBreakdown } from './calculations.js';
import { compareNames } from './format.js';
import type { PayorContribution, PayorMode, PurchaseRecord } from '../types';

/** One saved item, addressed the way Breakdown addresses it. */
export type ItemRef = { recordId: string; itemId: string };

/** One heading in the dialog: a Breakdown card's date and payors, with its offerable items. */
export type IncludeGroup = {
  /** The Breakdown group's key. */
  key: string;
  date: string;
  payorMode: PayorMode;
  /** As the Breakdown card has them (merged, sorted). */
  payors: PayorContribution[];
  items: (ItemRef & { name: string; price: number })[];
};

/**
 * What the "Include in earlier items?" dialog offers a member being added: the
 * saved Equal Split items that don't already name them, grouped and ordered as
 * Breakdown shows them. Custom Amounts items have no owners to join, and
 * staged items aren't saved, so neither is ever passed in or offered. An empty
 * result means there is nothing to ask, and the member can be added at once.
 */
export function includableGroups(
  records: PurchaseRecord[],
  members: string[],
  name: string,
): IncludeGroup[] {
  return groupRecordsForBreakdown(records, members)
    .map((group) => ({
      key: group.key,
      date: group.date,
      payorMode: group.payorMode,
      payors: group.payors,
      items: group.rows
        .filter(
          (row) =>
            row.item.mode === 'equal' &&
            !row.item.owners.some((owner) => compareNames(owner, name) === 0),
        )
        .map((row) => ({
          recordId: row.recordId,
          itemId: row.item.id,
          name: row.item.name,
          price: row.total,
        })),
    }))
    .filter((group) => group.items.length > 0);
}

/**
 * Makes `name` an owner of each item in `include`. The price stays, so the
 * item is split again with `getItemShares` and the shares still add up to it;
 * payors and contributions are not touched, so nobody's balance moves except
 * through that re-split. A ref that no longer fits is skipped without a
 * message: its record or item has gone, it became Custom Amounts, or it
 * already names the member. Anything unchanged comes back as the same object.
 */
export function includeMember(
  records: PurchaseRecord[],
  name: string,
  include: ItemRef[],
): PurchaseRecord[] {
  const wanted = new Map<string, Set<string>>();
  for (const { recordId, itemId } of include) {
    const ids = wanted.get(recordId) ?? new Set<string>();
    ids.add(itemId);
    wanted.set(recordId, ids);
  }

  return records.map((record) => {
    const ids = wanted.get(record.id);
    if (!ids) return record;

    let changed = false;
    const items = record.items.map((item) => {
      if (
        !ids.has(item.id) ||
        item.mode !== 'equal' ||
        item.owners.some((owner) => compareNames(owner, name) === 0)
      ) {
        return item;
      }
      changed = true;
      return { ...item, owners: [...item.owners, name] };
    });
    return changed ? { ...record, items } : record;
  });
}
