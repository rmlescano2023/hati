import { describe, expect, it } from 'vitest';
import { buildDemoData } from './demoData';
import { getItemTotal } from './calculations';

describe('buildDemoData', () => {
  it('gives every call fresh record ids', () => {
    // `purchase_records.id` is unique across the whole database, so a second
    // load into another session must not reuse the first load's ids.
    const first = buildDemoData();
    const second = buildDemoData();
    const firstIds = new Set(first.records.map((r) => r.id));
    expect(second.records.some((r) => firstIds.has(r.id))).toBe(false);
    for (const r of [...first.records, ...second.records]) {
      expect(r.id).toMatch(/^rec_[0-9a-z]+$/);
    }
  });

  it('keeps the members and item totals the same on every call', () => {
    const totals = (data: ReturnType<typeof buildDemoData>) =>
      data.records.map((r) => r.items.map(getItemTotal));
    const first = buildDemoData();
    const second = buildDemoData();
    expect(second.members).toEqual(first.members);
    expect(totals(second)).toEqual(totals(first));
  });
});
