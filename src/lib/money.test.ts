import { describe, expect, it } from 'vitest';
import { clipMoneyInput, parsePositiveAmount } from './money';

describe('clipMoneyInput (app-fixes item 2)', () => {
  it('leaves text alone while it is typed, one key at a time', () => {
    for (const typed of ['8', '80', '800', '800.', '800.0', '800.00']) {
      expect(clipMoneyInput(typed)).toBe(typed);
    }
  });

  it('drops a third decimal digit as it is typed', () => {
    expect(clipMoneyInput('800.009')).toBe('800.00');
  });

  it('drops pasted digits past the second decimal, without rounding', () => {
    expect(clipMoneyInput('800.009')).toBe('800.00');
    expect(clipMoneyInput('800.0099999')).toBe('800.00');
    expect(clipMoneyInput('0.999')).toBe('0.99');
    expect(clipMoneyInput('.129')).toBe('.12');
  });

  it('leaves partial and empty text for the next key', () => {
    for (const partial of ['1.', '.', '', '-']) {
      expect(clipMoneyInput(partial)).toBe(partial);
    }
  });

  it('clips a negative the same way and leaves a short one alone', () => {
    expect(clipMoneyInput('-5')).toBe('-5');
    expect(clipMoneyInput('-5.67')).toBe('-5.67');
    expect(clipMoneyInput('-5.678')).toBe('-5.67');
  });

  it('leaves the browser\'s exponent forms alone', () => {
    expect(clipMoneyInput('1e5')).toBe('1e5');
    expect(clipMoneyInput('1.234e2')).toBe('1.234e2');
  });

  it('does not change how an amount is read', () => {
    expect(parsePositiveAmount(clipMoneyInput('800.009'))).toBe(800);
    expect(parsePositiveAmount(clipMoneyInput('-5.678'))).toBe(0);
  });
});
