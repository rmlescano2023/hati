import { describe, expect, it } from 'vitest';
import { breakdownPage, computeColumnWidths, fitMonoFontSize } from './layout';

describe('fitMonoFontSize (L-1)', () => {
  // The narrowest member column is 34pt, which leaves a 28pt text box after the cell's padding.
  it('keeps 7pt wherever the amount already fits', () => {
    expect(fitMonoFontSize('300.00', 34, 7)).toBe(7);
    expect(fitMonoFontSize('−1,234.56', 58, 7)).toBe(7);
  });

  it('shrinks a signed three-digit amount in a 34pt column to 6.6pt', () => {
    expect(fitMonoFontSize('−300.00', 34, 7)).toBe(6.6);
  });

  it('shrinks a signed four-digit amount in a 34pt column to 5.1pt', () => {
    expect(fitMonoFontSize('−1,234.56', 34, 7)).toBe(5.1);
  });

  it('never lets the text outgrow the 28pt box', () => {
    for (const text of ['0.00', '300.00', '−300.00', '−1,234.56', '12,345.67']) {
      for (const width of [34, 40, 58]) {
        for (const size of [7, 7.5]) {
          const fitted = fitMonoFontSize(text, width, size);
          expect(text.length * 0.6 * fitted).toBeLessThanOrEqual(width - 6 + 1e-9);
        }
      }
    }
  });
});

describe('fitMonoFontSize at 7.5pt, for item and Total rows (L-2)', () => {
  it('keeps 7.5pt wherever the amount already fits', () => {
    expect(fitMonoFontSize('145.26', 34, 7.5)).toBe(7.5);
    expect(fitMonoFontSize('123,456.78', 58, 7.5)).toBe(7.5);
  });

  it('shrinks a four-digit share in a 34pt column to 5.8pt', () => {
    expect(fitMonoFontSize('5,145.26', 34, 7.5)).toBe(5.8);
    expect(fitMonoFontSize('1,379.80', 34, 7.5)).toBe(5.8);
  });

  it('shrinks a five-digit share in a 34pt column to 5.1pt', () => {
    expect(fitMonoFontSize('12,345.67', 34, 7.5)).toBe(5.1);
  });

  it('shrinks a seven-digit grand total in the 58pt Price column to 7.2pt', () => {
    expect(fitMonoFontSize('1,234,567.89', 58, 7.5)).toBe(7.2);
  });
});

describe('breakdownPage (L-3)', () => {
  it('is portrait A4 up to 5 members', () => {
    for (const n of [0, 5]) {
      const page = breakdownPage(n);
      expect(page.size).toBe('A4');
      expect(page.orientation).toBe('portrait');
      expect(page.usableWidth).toBeCloseTo(515.28, 2);
    }
  });

  it('is landscape A4 from 6 to 16 members', () => {
    for (const n of [6, 16]) {
      const page = breakdownPage(n);
      expect(page.size).toBe('A4');
      expect(page.orientation).toBe('landscape');
      expect(page.usableWidth).toBeCloseTo(761.89, 2);
    }
  });

  it('is landscape A3 from 17 members', () => {
    for (const n of [17, 30]) {
      const page = breakdownPage(n);
      expect(page.size).toBe('A3');
      expect(page.orientation).toBe('landscape');
      expect(page.usableWidth).toBeCloseTo(1110.55, 2);
    }
  });

  it('gives amounts their full size back at 17 members', () => {
    const w = computeColumnWidths(17, breakdownPage(17).usableWidth).member;
    expect(w).toBeCloseTo(54.27, 2);
    expect(fitMonoFontSize('5,145.26', w, 7.5)).toBe(7.5);
    expect(fitMonoFontSize('12,345.67', w, 7.5)).toBe(7.5);
    expect(fitMonoFontSize('−1,234.56', w, 7)).toBe(7);
  });
});
