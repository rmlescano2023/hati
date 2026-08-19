import { allocateProportionally, EPSILON, roundMoney, splitEvenly, sumMoney } from './money';
import { compareNames } from './format';
import type {
  BreakdownGroup,
  BreakdownRow,
  NetBalance,
  OwedMatrix,
  PayorContribution,
  PurchaseItem,
  PurchaseRecord,
  Settlement,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Item level                                                                  */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Record level                                                                */
/* -------------------------------------------------------------------------- */

export type RecordBreakdown = {
  /** member -> total owed within this record. Every member in `members` is present. */
  shares: Record<string, number>;
  /** Sum of every item total in the record. */
  total: number;
};

/** Per-member totals for one record. */
export function getRecordBreakdown(record: PurchaseRecord, members: string[]): RecordBreakdown {
  const shares: Record<string, number> = {};
  for (const member of members) shares[member] = 0;

  let total = 0;
  for (const item of record.items) {
    total += getItemTotal(item);
    for (const [member, amount] of Object.entries(getItemShares(item))) {
      shares[member] = roundMoney((shares[member] ?? 0) + amount);
    }
  }

  return { shares, total: roundMoney(total) };
}

/**
 * How much of a record each payor fronted, normalised to weights summing to 1.
 * Single-payor records give the sole payor a weight of 1; multi-payor records
 * weight by contribution, falling back to an even split when no amounts were
 * entered.
 */
export function getPayorWeights(record: PurchaseRecord): Record<string, number> {
  const payors = record.payors.filter((p) => p.member);
  if (payors.length === 0) return {};
  if (record.payorMode === 'single' || payors.length === 1) {
    return { [payors[0].member]: 1 };
  }

  const total = payors.reduce((a, p) => a + Math.max(0, p.amount), 0);
  const weights: Record<string, number> = {};
  for (const p of payors) {
    weights[p.member] = total > 0 ? Math.max(0, p.amount) / total : 1 / payors.length;
  }
  return weights;
}

export function getRecordTotal(record: PurchaseRecord): number {
  return sumMoney(record.items.map(getItemTotal));
}

export function getGrandTotal(records: PurchaseRecord[]): number {
  return sumMoney(records.map(getRecordTotal));
}

/* -------------------------------------------------------------------------- */
/* Owed matrices                                                               */
/* -------------------------------------------------------------------------- */

function emptyMatrix(members: string[]): OwedMatrix {
  const matrix: OwedMatrix = {};
  for (const payor of members) {
    matrix[payor] = {};
    for (const debtor of members) matrix[payor][debtor] = 0;
  }
  return matrix;
}

/**
 * `matrix[payor][debtor]` = raw (before-deductions) amount `debtor` owes `payor`.
 *
 * Attribution rule: a non-payor's share of a record is split across that
 * record's payors in proportion to each payor's contribution. A member who is
 * themself a payor on a record owes nothing on that record.
 */
export function getRawOwedMatrix(records: PurchaseRecord[], members: string[]): OwedMatrix {
  const matrix = emptyMatrix(members);

  for (const record of records) {
    const weights = getPayorWeights(record);
    const payorNames = Object.keys(weights).filter((p) => members.includes(p));
    if (payorNames.length === 0) continue;

    const { shares } = getRecordBreakdown(record, members);
    const weightList = payorNames.map((p) => weights[p]);

    for (const member of members) {
      if (payorNames.includes(member)) continue;
      const owed = shares[member] ?? 0;
      if (owed <= 0) continue;
      const slices = allocateProportionally(owed, weightList);
      payorNames.forEach((payor, i) => {
        matrix[payor][member] = roundMoney(matrix[payor][member] + slices[i]);
      });
    }
  }

  return matrix;
}

/**
 * Pairwise netting (after-deductions): for every pair who owe each other, the
 * smaller direction is cancelled and the larger keeps the residual. Applied per
 * pair, so the result is independent of the order pairs are visited in.
 */
export function getNettedOwedMatrix(raw: OwedMatrix): OwedMatrix {
  const members = Object.keys(raw);
  const netted: OwedMatrix = {};
  for (const payor of members) netted[payor] = { ...raw[payor] };

  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      const a = members[i];
      const b = members[j];
      const bOwesA = netted[a]?.[b] ?? 0;
      const aOwesB = netted[b]?.[a] ?? 0;
      const residual = roundMoney(bOwesA - aOwesB);
      if (residual > 0) {
        netted[a][b] = residual;
        netted[b][a] = 0;
      } else {
        netted[a][b] = 0;
        netted[b][a] = roundMoney(-residual);
      }
    }
  }

  return netted;
}

/**
 * Row ordering for the matrix view: payors who covered the most come first
 * ("process the largest payor first"), ties broken alphabetically. Members who
 * are owed nothing at all are dropped from the rows.
 */
export function getMatrixRowOrder(matrix: OwedMatrix): string[] {
  return Object.keys(matrix)
    .map((payor) => ({
      payor,
      covered: sumMoney(Object.values(matrix[payor])),
    }))
    .filter((row) => row.covered > EPSILON)
    .sort((a, b) => b.covered - a.covered || compareNames(a.payor, b.payor))
    .map((row) => row.payor);
}

/* -------------------------------------------------------------------------- */
/* Net balances & settlement                                                   */
/* -------------------------------------------------------------------------- */

/** Positive = the member is owed money back, negative = the member owes. */
export function getNetBalances(matrix: OwedMatrix, members: string[]): NetBalance[] {
  return [...members].sort(compareNames).map((member) => {
    let owedToThem = 0;
    let theyOwe = 0;
    for (const other of members) {
      if (other === member) continue;
      owedToThem += matrix[member]?.[other] ?? 0;
      theyOwe += matrix[other]?.[member] ?? 0;
    }
    return { member, amount: roundMoney(owedToThem - theyOwe) };
  });
}

/**
 * One block per debtor (alphabetical), each listing who they need to pay
 * (alphabetical). Built from the netted matrix, so nothing double-counts.
 */
export function getFinalSettlement(matrix: OwedMatrix, members: string[]): Settlement[] {
  const sorted = [...members].sort(compareNames);
  const settlements: Settlement[] = [];

  for (const debtor of sorted) {
    const lines = sorted
      .filter((creditor) => creditor !== debtor)
      .map((creditor) => ({ creditor, amount: matrix[creditor]?.[debtor] ?? 0 }))
      .filter((line) => line.amount > EPSILON);

    if (lines.length === 0) continue;
    settlements.push({
      debtor,
      lines,
      total: sumMoney(lines.map((l) => l.amount)),
    });
  }

  return settlements;
}

/* -------------------------------------------------------------------------- */
/* Breakdown grouping                                                          */
/* -------------------------------------------------------------------------- */

function payorSignature(payors: PayorContribution[]): string {
  return payors
    .map((p) => p.member)
    .sort(compareNames)
    .join('|');
}

function mergePayors(groups: PurchaseRecord[]): PayorContribution[] {
  const totals = new Map<string, number>();
  for (const record of groups) {
    for (const payor of record.payors) {
      totals.set(payor.member, roundMoney((totals.get(payor.member) ?? 0) + payor.amount));
    }
  }
  return [...totals.entries()]
    .map(([member, amount]) => ({ member, amount }))
    .sort((a, b) => compareNames(a.member, b.member));
}

/**
 * Group records into the cards shown on the Breakdown page: one card per
 * (date, set-of-payors). Saving again on the same date with the same payor
 * appends into the existing card instead of creating a second one.
 */
export function groupRecordsForBreakdown(
  records: PurchaseRecord[],
  members: string[],
  order: 'asc' | 'desc' = 'desc',
): BreakdownGroup[] {
  const buckets = new Map<string, PurchaseRecord[]>();

  for (const record of records) {
    const key = `${record.date}::${payorSignature(record.payors)}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(record);
    else buckets.set(key, [record]);
  }

  const groups: BreakdownGroup[] = [];

  for (const [key, bucket] of buckets) {
    const ordered = [...bucket].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const rows: BreakdownRow[] = [];
    const totals: Record<string, number> = {};
    for (const member of members) totals[member] = 0;
    let grandTotal = 0;

    for (const record of ordered) {
      for (const item of record.items) {
        const shares = getItemShares(item);
        const total = getItemTotal(item);
        grandTotal += total;
        for (const [member, amount] of Object.entries(shares)) {
          totals[member] = roundMoney((totals[member] ?? 0) + amount);
        }
        rows.push({ recordId: record.id, item, shares, total });
      }
    }

    groups.push({
      key,
      date: ordered[0].date,
      payorMode: ordered.some((r) => r.payorMode === 'multiple') ? 'multiple' : 'single',
      payors: mergePayors(ordered),
      rows,
      totals,
      grandTotal: roundMoney(grandTotal),
    });
  }

  const direction = order === 'asc' ? 1 : -1;
  return groups.sort(
    (a, b) => direction * (a.date.localeCompare(b.date) || a.key.localeCompare(b.key)),
  );
}

/* -------------------------------------------------------------------------- */
/* Custom-amount helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The "fill remainder" button on Custom Amounts: whatever is left of `total`
 * after the already-filled amounts gets split evenly across the blank members.
 * Returns one amount per blank member, in the order given. A non-positive
 * remainder yields zeros.
 */
export function distributeRemainder(
  total: number,
  filledAmounts: number[],
  blankCount: number,
): number[] {
  if (blankCount <= 0) return [];
  const remainder = roundMoney(total - filledAmounts.reduce((a, b) => a + b, 0));
  if (remainder <= 0) return Array.from({ length: blankCount }, () => 0);
  return splitEvenly(remainder, blankCount);
}
