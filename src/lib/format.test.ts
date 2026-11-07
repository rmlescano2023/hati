import { describe, expect, it } from 'vitest';
import { formatDateRange, formatLocalDate, formatLocalDateTime } from './format';

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
