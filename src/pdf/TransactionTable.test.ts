import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Text } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';
import { TransactionTable } from './TransactionTable';
import { computeColumnWidths } from './layout';
import { palette, styles } from './styles';
import { billAmounts } from '../lib/bill';
import { getItemShares, getItemTotal } from '../lib/calculations';
import { sumMoney } from '../lib/money';
import type { BillLine, BreakdownGroup, BreakdownRow, PurchaseItem } from '../types';

/* ------------------------------- fixtures -------------------------------- */

const membersOf = (n: number) =>
  Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);

const rowOf = (item: PurchaseItem): BreakdownRow => ({
  recordId: 'r1',
  item,
  shares: getItemShares(item),
  total: getItemTotal(item),
});

/** Two items: big even shares, and a receipt with an own order, a shared order and a discount. */
function groupOf(members: string[]): BreakdownGroup {
  const bigShares: PurchaseItem = {
    id: 'big',
    mode: 'custom',
    name: 'Big shares',
    amounts: Object.fromEntries(members.map((m) => [m, 5145.26])),
  };
  const bill: BillLine[] = [
    ...members.map((member): BillLine => ({ kind: 'order', member, name: '', amount: 1500 })),
    { kind: 'shared', members, name: 'Group platter', amount: 1700 },
    { kind: 'discount', members: [members[0]], name: 'Promo', amount: 1234.56 },
  ];
  const receipt: PurchaseItem = {
    id: 'receipt',
    mode: 'custom',
    name: 'Receipt',
    amounts: billAmounts(bill, members),
    bill,
  };
  const rows = [rowOf(bigShares), rowOf(receipt)];
  return {
    key: 'g1',
    date: '2026-11-16',
    payorMode: 'single',
    payors: [{ member: members[0], amount: sumMoney(rows.map((r) => r.total)) }],
    rows,
    totals: Object.fromEntries(
      members.map((m) => [m, sumMoney(rows.map((r) => r.shares[m] ?? 0))]),
    ),
    grandTotal: sumMoney(rows.map((r) => r.total)),
  };
}

/* ------------------------------- the walker ------------------------------ */

type StyleValue = Record<string, unknown> | StyleValue[] | null | undefined | false;

const flatten = (style: StyleValue): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style || {}) as Record<string, unknown>);

const includes = (style: StyleValue, wanted: object): boolean =>
  Array.isArray(style) ? style.some((s) => includes(s, wanted)) : style === wanted;

const textOf = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(textOf).join('')
    : typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : '';

type Cell = { text: string; style: Record<string, unknown>; raw: StyleValue };

/** Every `Text` in the tree, with its text and its style flattened. */
function textCells(node: ReactNode, out: Cell[] = []): Cell[] {
  if (Array.isArray(node)) {
    node.forEach((n) => textCells(n, out));
  } else if (isValidElement(node)) {
    const el = node as ReactElement<{ style?: StyleValue; children?: ReactNode }>;
    if (el.type === Text) {
      out.push({
        text: textOf(el.props.children),
        style: flatten(el.props.style),
        raw: el.props.style,
      });
    } else {
      textCells(el.props.children, out);
    }
  }
  return out;
}

const monoCells = (cells: Cell[]) => cells.filter((c) => c.style.fontFamily === 'DM Mono');
const kind = (cell: Cell, base: object) => includes(cell.raw, base);

function cellsFor(memberCount: number, usable: number) {
  const members = membersOf(memberCount);
  const columns = computeColumnWidths(memberCount, usable);
  const cells = textCells(TransactionTable({ group: groupOf(members), members, columns }));
  return { cells, columns };
}

/* --------------------------------- tests --------------------------------- */

describe('TransactionTable (T-PDF)', () => {
  it('lets no amount outgrow its column at 17 members', () => {
    const { cells, columns } = cellsFor(17, 761.89);
    const numeric = monoCells(cells);
    expect(numeric.length).toBeGreaterThan(0);
    for (const cell of numeric) {
      const width = Number(cell.style.width);
      expect(cell.text.length * 0.6 * Number(cell.style.fontSize)).toBeLessThanOrEqual(
        width - 6 + 1e-9,
      );
    }
    // Both widths are really in play, so the check isn't passing on one column alone.
    const widths = new Set(numeric.map((c) => c.style.width));
    expect(widths.has(columns.member)).toBe(true);
    expect(widths.has(columns.price)).toBe(true);
  });

  it('shrinks an item-row share that no longer fits, and keeps one that does', () => {
    const { cells } = cellsFor(17, 761.89);
    const item = monoCells(cells).filter((c) => kind(c, styles.cellNum));
    expect(item.find((c) => c.text === '5,145.26')?.style.fontSize).toBe(5.8);
    expect(item.find((c) => c.text === '1,600.00')?.style.fontSize).toBe(5.8);
  });

  it('keeps the sizes where the text fits, at 3 members', () => {
    const { cells } = cellsFor(3, 515.28);
    const mono = monoCells(cells);
    const itemAndTotal = mono.filter((c) => kind(c, styles.cellNum) || kind(c, styles.totalCellNum));
    expect(itemAndTotal.length).toBeGreaterThan(0);
    for (const cell of itemAndTotal) expect(cell.style.fontSize).toBe(7.5);
    const sub = mono.filter((c) => kind(c, styles.lineCellNum));
    expect(sub.length).toBeGreaterThan(0);
    for (const cell of sub) expect(cell.style.fontSize).toBe(7);
  });

  it('draws sub-rows in the darker text colour', () => {
    const { cells } = cellsFor(3, 515.28);
    const sub = cells.filter((c) => kind(c, styles.lineCell) || kind(c, styles.lineCellNum));
    expect(sub.length).toBeGreaterThan(0);
    for (const cell of sub) expect(cell.style.color).toBe(palette.text2);
  });
});
