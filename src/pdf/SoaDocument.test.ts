import { Children, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { OwedMatrixSection, SoaDocument } from './SoaDocument';
import { breakdownPage } from './layout';
import { includes, monoCells, textCells } from './pdfTree.testutil';
import { styles } from './styles';
import type { OwedMatrix } from '../types';

/* ------------------------------- fixtures -------------------------------- */

const membersOf = (n: number) =>
  Array.from({ length: n }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);

/** P01 is owed 13,945.67 by everyone, and P02 is owed 1,600.00 by everyone but P01. */
function matrixOf(members: string[], extra: OwedMatrix = {}): OwedMatrix {
  const matrix: OwedMatrix = { P01: {}, P02: {}, ...extra };
  for (const m of members) {
    if (m !== 'P01') matrix.P01[m] = 13945.67;
    if (m !== 'P02' && m !== 'P01') matrix.P02[m] = 1600;
  }
  return matrix;
}

function matrixCells(memberCount: number, extra: OwedMatrix = {}) {
  const members = membersOf(memberCount);
  const usableWidth = breakdownPage(memberCount).usableWidth;
  const width = (usableWidth - 92) / memberCount;
  const cells = textCells(
    OwedMatrixSection({ matrix: matrixOf(members, extra), members, usableWidth }),
  );
  return { cells, width };
}

/* --------------------------------- tests --------------------------------- */

describe('OwedMatrixSection (M-PDF)', () => {
  it('shrinks an amount that would run into the next column, at 16 members', () => {
    const { cells, width } = matrixCells(16);
    const mono = monoCells(cells);
    expect(mono.length).toBeGreaterThan(0);
    for (const cell of mono) {
      expect(cell.text.length * 0.6 * Number(cell.style.fontSize)).toBeLessThanOrEqual(
        width - 6 + 1e-9,
      );
    }
    expect(mono.find((c) => c.text === '13,945.67')?.style.fontSize).toBe(6.6);
    expect(mono.find((c) => c.text === '1,600.00')?.style.fontSize).toBe(7.4);
  });

  it('keeps full size at 17 members, on A3, and fits a seven-digit amount', () => {
    const { cells } = matrixCells(17, { P03: { P04: 1234567.89 } });
    const mono = monoCells(cells);
    expect(mono.find((c) => c.text === '13,945.67')?.style.fontSize).toBe(7.5);
    expect(mono.find((c) => c.text === '1,600.00')?.style.fontSize).toBe(7.5);
    expect(mono.find((c) => c.text === '1,234,567.89')?.style.fontSize).toBe(7.4);
  });

  it('keeps every amount at 7.5pt at 3 members', () => {
    const { cells } = matrixCells(3);
    const mono = monoCells(cells);
    expect(mono.length).toBeGreaterThan(0);
    for (const cell of mono) expect(cell.style.fontSize).toBe(7.5);
  });

  it('leaves the header names as they are (D1)', () => {
    const { cells } = matrixCells(16);
    const heads = cells.filter((c) => includes(c.raw, styles.headCell));
    expect(heads.length).toBe(17);
    for (const head of heads) expect(head.style.fontSize).toBe(styles.headCell.fontSize);
  });
});

describe('SoaDocument pages (P-PDF)', () => {
  const pagesFor = (memberCount: number) => {
    const doc = SoaDocument({ members: membersOf(memberCount), records: [], name: null });
    return Children.toArray(doc.props.children) as ReactElement<{
      size: string;
      orientation?: string;
    }>[];
  };

  it('keeps the first page portrait A4 and the breakdown landscape A4 at 16 members', () => {
    const [first, second] = pagesFor(16);
    expect(first.props.size).toBe('A4');
    expect(first.props.orientation).toBeUndefined();
    expect(second.props.size).toBe('A4');
    expect(second.props.orientation).toBe('landscape');
  });

  it('moves the breakdown to landscape A3 at 17 members', () => {
    const [first, second] = pagesFor(17);
    expect(first.props.size).toBe('A4');
    expect(first.props.orientation).toBeUndefined();
    expect(second.props.size).toBe('A3');
    expect(second.props.orientation).toBe('landscape');
  });

  it('keeps the breakdown portrait A4 at 5 members', () => {
    const second = pagesFor(5)[1];
    expect(second.props.size).toBe('A4');
    expect(second.props.orientation).toBe('portrait');
  });
});
