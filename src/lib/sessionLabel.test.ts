import { describe, expect, it } from 'vitest';
import { deleteSessionMessage, sessionDisplayTitle, sessionTitle } from './sessionLabel';
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
  name: null,
  activityAt: null,
  me: null,
  finishedWithCollection: false,
  payments: [],
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

  it('names a closed session by its expenses too, not the date it was filed', () => {
    const s = session({
      status: 'closed',
      closedAt: '2026-05-02T08:00:00.000Z',
      records: [record('2026-04-24'), record('2026-04-28')],
    });
    expect(sessionTitle(s)).toBe('April 24, 2026 — April 28, 2026');
  });

  it('falls back to the filed date for a closed session with no records', () => {
    const s = session({ status: 'closed', closedAt: '2026-05-02T08:00:00.000Z', records: [] });
    expect(sessionTitle(s)).toBe('May 2, 2026');
  });

  it('falls back to createdAt when a closed session has neither records nor closedAt', () => {
    expect(sessionTitle(session({ status: 'closed', closedAt: null }))).toBe('September 17, 2026');
  });
});

describe('sessionDisplayTitle', () => {
  it('uses the name when the session has one', () => {
    expect(sessionDisplayTitle(session({ name: 'Bali Trip' }))).toBe('Bali Trip');
  });

  it('falls back to the dates for an unnamed session', () => {
    const s = session({ records: [record('2026-04-28')] });
    expect(sessionDisplayTitle(s)).toBe(sessionTitle(s));
  });

  it('leaves sessionTitle on the dates even when the session is named', () => {
    const s = session({ name: 'Bali Trip', records: [record('2026-04-28')] });
    expect(sessionTitle(s)).toBe('April 28, 2026');
  });
});

describe('deleteSessionMessage', () => {
  const members = (n: number) => ['Ana', 'Ben', 'Cy'].slice(0, n);
  const closed = { status: 'closed' as const, closedAt: '2026-05-02T08:00:00.000Z' };

  it('counts the members of a session with no purchases yet', () => {
    expect(deleteSessionMessage(session({ name: 'Bali Trip', members: members(3) }))).toBe(
      '“Bali Trip” has 3 members but no purchases yet. Deleting it cannot be undone.',
    );
    expect(deleteSessionMessage(session({ members: members(3) }))).toBe(
      'This session has 3 members but no purchases yet. Deleting it cannot be undone.',
    );
  });

  it('says "1 member" for a single member', () => {
    expect(deleteSessionMessage(session({ name: 'Solo', members: members(1) }))).toBe(
      '“Solo” has 1 member but no purchases yet. Deleting it cannot be undone.',
    );
    expect(deleteSessionMessage(session({ members: members(1) }))).toBe(
      'This session has 1 member but no purchases yet. Deleting it cannot be undone.',
    );
  });

  it('calls a session with no members and no purchases empty, as before', () => {
    expect(deleteSessionMessage(session({ name: 'Bali Trip', members: [] }))).toBe(
      '“Bali Trip” is empty. Deleting it cannot be undone.',
    );
    expect(deleteSessionMessage(session({ members: [] }))).toBe(
      'This session is empty. Deleting it cannot be undone.',
    );
  });

  it('counts the purchases of a draft, as before', () => {
    const named = session({
      name: 'Bali Trip',
      records: [record('2026-04-24'), record('2026-04-28')],
    });
    expect(deleteSessionMessage(named)).toBe(
      '“Bali Trip” and its 2 purchases will be deleted. This cannot be undone.',
    );
    expect(deleteSessionMessage(session({ records: [record('2026-04-28')] }))).toBe(
      '“April 28, 2026” and its 1 purchase will be deleted. This cannot be undone.',
    );
  });

  it('warns that a closed session with purchases loses its statement and leaves Collection', () => {
    const named = session({ ...closed, name: 'Bali Trip', records: [record('2026-04-24')] });
    expect(deleteSessionMessage(named)).toBe(
      '“Bali Trip” and its 1 purchase will be deleted, and its statement can no longer be downloaded, and it will leave Collection. This cannot be undone.',
    );
    const unnamed = session({ ...closed, records: [record('2026-04-24'), record('2026-04-28')] });
    expect(deleteSessionMessage(unnamed)).toBe(
      '“April 24, 2026 — April 28, 2026” and its 2 purchases will be deleted, and its statement can no longer be downloaded, and it will leave Collection. This cannot be undone.',
    );
  });

  // BR-19: every payment goes with the session, shown on Collection or not.
  it('counts the recorded payments a closed session takes with it', () => {
    const payment = (id: string) => ({
      id,
      debtor: 'Ana',
      creditor: 'Ben',
      amountCents: 100,
      createdAt: '2026-05-03T08:00:00.000Z',
    });
    const three = [record('2026-04-24'), record('2026-04-25'), record('2026-04-26')];
    const two = session({
      ...closed,
      name: 'Bali Trip',
      records: three,
      payments: [payment('pay_1'), payment('pay_2')],
    });
    expect(deleteSessionMessage(two)).toBe(
      '“Bali Trip” and its 3 purchases will be deleted, along with its 2 recorded payments. Its statement can no longer be downloaded and the payments cannot be recovered. This cannot be undone.',
    );
    const one = session({
      ...closed,
      name: 'Bali Trip',
      records: three,
      payments: [payment('pay_1')],
    });
    expect(deleteSessionMessage(one)).toBe(
      '“Bali Trip” and its 3 purchases will be deleted, along with its 1 recorded payment. Its statement can no longer be downloaded and the payments cannot be recovered. This cannot be undone.',
    );
  });

  it('gives a closed session with no purchases no statement clause, since it has no statement', () => {
    expect(deleteSessionMessage(session({ ...closed, name: 'Old', members: members(2) }))).toBe(
      '“Old” has 2 members but no purchases yet. Deleting it cannot be undone.',
    );
    expect(deleteSessionMessage(session({ ...closed, members: [] }))).toBe(
      'This session is empty. Deleting it cannot be undone.',
    );
  });
});
