import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatDateRange,
  formatLocalDate,
  formatLocalDateTime,
  formatMoney,
  formatSignedAmount,
  formatSignedMoney,
} from './format';

describe('formatDateRange', () => {
  it('joins two dates with an em dash', () => {
    expect(formatDateRange('2026-04-26', '2026-04-28')).toBe('April 26, 2026 — April 28, 2026');
  });

  it('collapses a single day rather than repeating it', () => {
    expect(formatDateRange('2026-04-26', '2026-04-26')).toBe('April 26, 2026');
  });

  it('spans months and years', () => {
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe('December 30, 2025 — January 2, 2026');
  });
});

describe('formatLocalDate and formatLocalDateTime', () => {
  // Built in local time, so the expected text holds in any time zone.
  const iso = new Date(2026, 10, 4, 15, 5).toISOString();

  it('shows the day in local time', () => {
    expect(formatLocalDate(iso)).toBe('November 4, 2026');
  });

  it('shows the day and time in local time', () => {
    expect(formatLocalDateTime(iso)).toBe('Nov 4, 2026, 3:05 PM');
  });

  it('returns an unreadable time unchanged', () => {
    expect(formatLocalDate('soon')).toBe('soon');
    expect(formatLocalDateTime('soon')).toBe('soon');
  });
});

describe('formatSignedMoney and formatSignedAmount (F-1)', () => {
  it('puts a true minus sign (U+2212) before a negative amount', () => {
    expect(formatSignedMoney(-300)).toBe('\u2212\u20b1300.00');
    expect(formatSignedMoney(-1234.5)).toBe('\u2212\u20b11,234.50');
    expect(formatSignedAmount(-300)).toBe('\u2212300.00');
  });

  it('reads like formatMoney for a positive amount', () => {
    expect(formatSignedMoney(300)).toBe('\u20b1300.00');
    expect(formatSignedAmount(1234.5)).toBe('1,234.50');
  });

  it('never shows a minus on zero or on dust below half a centavo', () => {
    expect(formatSignedMoney(0)).toBe('\u20b10.00');
    expect(formatSignedMoney(-0.004)).toBe('\u20b10.00');
    expect(formatSignedAmount(-0.004)).toBe('0.00');
  });
});

describe('formatMoney and formatAmount with a negative (F-2)', () => {
  it('keep the output they had before signed money existed', () => {
    expect(formatMoney(-300)).toBe('\u20b1-300.00');
    expect(formatAmount(-300)).toBe('-300.00');
  });
});
