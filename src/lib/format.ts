const amountFormatter = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const longDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/** `1234.5` -> `"1,234.50"` */
export function formatAmount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  // Avoid rendering "-0.00".
  return amountFormatter.format(Math.abs(safe) < 0.005 ? 0 : safe);
}

/** `1234.5` -> `"₱1,234.50"` */
export function formatMoney(value: number): string {
  return `₱${formatAmount(value)}`;
}

/** `"2026-04-27"` -> `"April 27, 2026"`. Parsed as UTC so the day never shifts. */
export function formatLongDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return longDateFormatter.format(date);
}

/** Today in local time as `YYYY-MM-DD` (the value an `<input type="date">` wants). */
export function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/**
 * Title-case a member name: "renmar lescano" -> "Renmar Lescano".
 * Hyphenated and apostrophised parts are capitalised too ("mary-jane" -> "Mary-Jane").
 */
export function toTitleCase(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
    .replace(
      /(^|[\s\-'’])([\p{L}\p{N}])/gu,
      (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase(),
    );
}

/** Case-insensitive alphabetical sort used for every member list in the app. */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

export function sortNames(names: string[]): string[] {
  return [...names].sort(compareNames);
}

/** "1 item" / "3 items" */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Join names as "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
