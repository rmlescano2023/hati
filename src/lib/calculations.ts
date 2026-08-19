import { roundMoney, splitEvenly, sumMoney } from './money';
import { compareNames } from './format';
import type { PurchaseItem } from '../types';

/** The item's total price, whichever split mode it uses. */
export function getItemTotal(item: PurchaseItem): number {
  return item.mode === 'equal'
    ? roundMoney(item.totalPrice)
    : sumMoney(Object.values(item.amounts));
}

/**
 * member -> amount this item attributes to them.
 * Equal-split items are split with `splitEvenly` over alphabetically sorted
 * owners, so the leftover centavo lands deterministically and the shares always
 * sum back to the item total.
 */
export function getItemShares(item: PurchaseItem): Record<string, number> {
  if (item.mode === 'custom') {
    const shares: Record<string, number> = {};
    for (const [member, amount] of Object.entries(item.amounts)) {
      if (Number.isFinite(amount)) shares[member] = roundMoney(amount);
    }
    return shares;
  }

  const owners = [...item.owners].sort(compareNames);
  if (owners.length === 0) return {};
  const parts = splitEvenly(item.totalPrice, owners.length);
  const shares: Record<string, number> = {};
  owners.forEach((owner, i) => {
    shares[owner] = parts[i];
  });
  return shares;
}
