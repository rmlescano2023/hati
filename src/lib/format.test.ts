import { describe, expect, it } from 'vitest';
import { formatDateRange } from './format';

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
