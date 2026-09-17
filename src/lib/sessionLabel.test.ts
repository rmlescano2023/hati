import { describe, expect, it } from 'vitest';
import { sessionTitle } from './sessionLabel';
import type { PurchaseRecord, Session } from '../types';

const record = (date: string): PurchaseRecord => ({
  id: `rec_${date}`,
  date,
  payorMode: 'single',
  payors: [{ member: 'Ana', amount: 0 }],
  items: [{ id: `itm_${date}`, mode: 'equal', name: 'Item', totalPrice: 100, owners: ['Ana'] }],
  createdAt: `${date}T02:00:00.000Z`,
});

const session = (over: Partial<Session> = {}): Session => ({
  id: 'session_1',
  status: 'draft',
  createdAt: '2026-09-17T08:00:00.000Z',
  closedAt: null,
  members: ['Ana'],
  records: [],
  ...over,
});

describe('sessionTitle', () => {
  it('names a draft by the span its expenses cover', () => {
    const s = session({ records: [record('2026-04-28'), record('2026-04-24')] });
    expect(sessionTitle(s)).toBe('April 24, 2026 — April 28, 2026');
  });

  it('ignores createdAt for a draft with records', () => {
    // A migrated session has createdAt stamped at upgrade time, which says
    // nothing about the expenses inside it.
    const s = session({ createdAt: '2026-09-17T08:00:00.000Z', records: [record('2026-04-28')] });
    expect(sessionTitle(s)).not.toContain('September');
  });

  it('collapses a single-day draft to one date', () => {
    expect(sessionTitle(session({ records: [record('2026-04-28')] }))).toBe('April 28, 2026');
  });

  it('falls back to the start date for an empty draft', () => {
    expect(sessionTitle(session())).toBe('Started September 17, 2026');
  });

  it('names a closed session by the date it was filed', () => {
    const s = session({
      status: 'closed',
      closedAt: '2026-05-02T08:00:00.000Z',
      records: [record('2026-04-28')],
    });
    expect(sessionTitle(s)).toBe('May 2, 2026');
  });

  it('falls back to createdAt when a closed session has no closedAt', () => {
    const s = session({ status: 'closed', closedAt: null, records: [record('2026-04-28')] });
    expect(sessionTitle(s)).toBe('September 17, 2026');
  });
});
