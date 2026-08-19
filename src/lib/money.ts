/** Values below this are treated as zero (guards against float dust). */
export const EPSILON = 0.005;

/** Round to two decimal places, away from float representation error. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * 100) / 100;
}

/** Sum a list of amounts and round the result once, at the end. */
export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0));
}

export function isZeroMoney(value: number): boolean {
  return Math.abs(value) < EPSILON;
}

/**
 * Split `total` into `parts` amounts that sum back to `total` exactly.
 * Works in integer centavos, then hands the leftover centavos to the first
 * recipients one at a time — so `splitEvenly(10, 3)` is `[3.34, 3.33, 3.33]`.
 */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const cents = Math.round(roundMoney(total) * 100);
  const base = Math.trunc(cents / parts);
  let remainder = cents - base * parts;
  const step = remainder >= 0 ? 1 : -1;
  return Array.from({ length: parts }, () => {
    let value = base;
    if (remainder !== 0) {
      value += step;
      remainder -= step;
    }
    return value / 100;
  });
}

/**
 * Split `total` across `weights` proportionally, in integer centavos, using the
 * largest-remainder method so the parts still sum back to `total` exactly.
 * Non-positive or absent weight mass falls back to an even split.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  const parts = weights.length;
  if (parts === 0) return [];
  const weightSum = weights.reduce((a, w) => a + (Number.isFinite(w) && w > 0 ? w : 0), 0);
  if (weightSum <= 0) return splitEvenly(total, parts);

  const cents = Math.round(roundMoney(total) * 100);
  const exact = weights.map((w) => (cents * (Number.isFinite(w) && w > 0 ? w : 0)) / weightSum);
  const floors = exact.map((v) => Math.floor(v));
  let leftover = cents - floors.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const result = [...floors];
  for (let i = 0; leftover > 0 && i < order.length; i += 1) {
    result[order[i].index] += 1;
    leftover -= 1;
  }
  return result.map((c) => c / 100);
}

/** Parse a user-typed amount; anything unparseable becomes 0. */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[₱,\s]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? roundMoney(parsed) : 0;
}
