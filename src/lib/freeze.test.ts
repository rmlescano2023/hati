import { describe, expect, it } from 'vitest';
import { FREEZE_WINDOW_DAYS, isRecordEditable } from './freeze';

const TODAY = '2026-09-17';

/** `TODAY` minus `days`, as `YYYY-MM-DD`. */
function daysAgo(days: number): string {
  const ms = new Date(`${TODAY}T00:00:00Z`).getTime() - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

describe('isRecordEditable', () => {
  it('keeps today editable', () => {
    expect(isRecordEditable(TODAY, TODAY)).toBe(true);
  });

  it('keeps a record editable on the last day of the window', () => {
    expect(isRecordEditable(daysAgo(FREEZE_WINDOW_DAYS), TODAY)).toBe(true);
  });

  it('freezes a record one day past the window', () => {
    expect(isRecordEditable(daysAgo(FREEZE_WINDOW_DAYS + 1), TODAY)).toBe(false);
  });

  it('freezes much older records', () => {
    expect(isRecordEditable(daysAgo(60), TODAY)).toBe(false);
  });

  it('keeps future-dated records editable', () => {
    expect(isRecordEditable('2026-12-25', TODAY)).toBe(true);
  });

  it('fails open on an unparseable date so it can still be corrected', () => {
    expect(isRecordEditable('not-a-date', TODAY)).toBe(true);
  });

  it('is unaffected by month and year boundaries', () => {
    expect(isRecordEditable('2025-12-31', '2026-01-05')).toBe(true);
    expect(isRecordEditable('2025-12-28', '2026-01-05')).toBe(false);
  });
});
