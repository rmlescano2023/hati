import { todayIso } from './format';

/**
 * How long a record stays editable. Measured against the record's own purchase
 * date, not its session: old expenses are protected from casual edits even
 * while their session is still open.
 */
export const FREEZE_WINDOW_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`, at UTC midnight. */
function daysBetween(from: string, to: string): number | null {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * A record is editable while its purchase date is within `FREEZE_WINDOW_DAYS`
 * of today, inclusive. Future-dated records are editable; unparseable dates
 * fail open so a bad value can still be corrected.
 */
export function isRecordEditable(dateIso: string, today: string = todayIso()): boolean {
  const age = daysBetween(dateIso, today);
  if (age === null) return true;
  return age <= FREEZE_WINDOW_DAYS;
}
