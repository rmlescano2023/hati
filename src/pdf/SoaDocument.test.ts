import { Children, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { Link, Path, Svg } from '@react-pdf/renderer';
import { InviteBlock, OwedMatrixSection, SoaDocument } from './SoaDocument';
import { breakdownPage } from './layout';
import { elementsOf, includes, monoCells, textCells } from './pdfTree.testutil';
import { styles } from './styles';
import { encodeQr, qrPath } from '../lib/qr';
import { QR_GOLDEN } from '../lib/qr.fixtures';
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

describe('the invite block (US-31, US-33)', () => {
  // The golden 84-byte link: version 5, so a 37-module symbol and a 45-unit viewBox with its border.
  const url = QR_GOLDEN[2].text;

  const pageOne = (inviteUrl?: string) => {
    const doc = SoaDocument({ members: ['Ana', 'Ben'], records: [], name: null, inviteUrl });
    const [first, second] = Children.toArray(doc.props.children) as ReactElement<{
      children: unknown;
    }>[];
    return {
      first: Children.toArray(first.props.children as never) as ReactElement<{ url?: string }>[],
      second: Children.toArray(second.props.children as never),
    };
  };
  const names = (children: ReactElement[]) =>
    children.map((c) => (typeof c.type === 'function' ? c.type.name : String(c.type)));

  it('puts the block on page 1 between the header and Final Settlement (AC-31.1)', () => {
    const { first } = pageOne(url);
    expect(names(first)).toEqual([
      'DocHeader',
      'InviteBlock',
      'SettlementSection',
      'NetBalancesSection',
      'Footer',
    ]);
    expect(first[1].type).toBe(InviteBlock);
    expect(first[1].props.url).toBe(url);
  });

  it('adds nothing without an invite link, and leaves page 2 as it was (AC-33.1, AC-33.2, AC-31.5)', () => {
    const without = pageOne();
    expect(names(without.first)).toEqual([
      'DocHeader',
      'SettlementSection',
      'NetBalancesSection',
      'Footer',
    ]);
    expect(pageOne(url).second).toEqual(without.second);
  });

  it('draws the QR and prints the link, both as links to the invite (AC-31.2, BR-Q1)', () => {
    const tree = InviteBlock({ url });
    const links = elementsOf(tree, Link);
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.props.src).toBe(url);

    const svgs = elementsOf(tree, Svg);
    expect(svgs).toHaveLength(1);
    expect(svgs[0].props.width).toBe(96);
    expect(svgs[0].props.height).toBe(96);
    expect(svgs[0].props.viewBox).toBe('0 0 45 45');
    const paths = elementsOf(svgs[0], Path);
    expect(paths).toHaveLength(1);
    expect(paths[0].props.d).toBe(qrPath(encodeQr(url)));
  });

  it('carries the copy and prints the link in the mono face, in lines that fit the column', () => {
    const cells = textCells(InviteBlock({ url }));
    const texts = cells.map((c) => c.text);
    expect(texts).toContain('Track what you owe on Hati');
    expect(texts).toContain('Scan with your phone camera, or open:');
    const mono = monoCells(cells);
    expect(mono).toHaveLength(1);
    expect(mono[0].text.replace(/\n/g, '')).toBe(url);
    for (const line of mono[0].text.split('\n')) expect(line.length).toBeLessThanOrEqual(72);
  });

  it('breaks the longest link a vercel.app host can make into two lines', () => {
    const base = 'https://.example.app/?join=Zx9_Qk-3VbT0aLmN4pRsWw';
    const longest = base.replace('https://', `https://${'h'.repeat(111 - base.length)}`);
    expect(longest).toHaveLength(111);
    const mono = monoCells(textCells(InviteBlock({ url: longest })));
    const lines = mono[0].text.split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(72);
  });
});
