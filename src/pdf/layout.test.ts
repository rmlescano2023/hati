import { describe, expect, it } from 'vitest';
import { fitMonoFontSize } from './layout';

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
        const size = fitMonoFontSize(text, width, 7);
        expect(text.length * 0.6 * size).toBeLessThanOrEqual(width - 6 + 1e-9);
      }
    }
  });
});
