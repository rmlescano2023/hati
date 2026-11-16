import { describe, expect, it } from 'vitest';
import {
  addPaymentsTo,
  appendNew,
  mutateOne,
  removeAllPaymentsFrom,
  removePaymentFrom,
  settleOne,
} from './memorySessions';
import { isFullyPaid } from './collection';
import type { Payment, PurchaseRecord, Session } from '../types';

const NOW = '2026-11-16T10:00:00.000Z';

const session = (id: string, over: Partial<Session> = {}): Session => ({
  id,
  status: 'draft',
  createdAt: '2026-11-01T00:00:00.000Z',
  closedAt: null,
  members: ['Ana', 'Ben'],
  records: [],
  name: null,
  activityAt: null,
  me: null,
  finishedWithCollection: false,
  payments: [],
  ...over,
});

const payment = (id: string, over: Partial<Payment> = {}): Payment => ({
  id,
  debtor: 'Ben',
  creditor: 'Ana',
  amountCents: 1000,
  createdAt: '2026-11-02T00:00:00.000Z',
  ...over,
});

describe('mutateOne', () => {
  it('returns null for a session that is not there', () => {
    expect(mutateOne([session('a')], 'missing', (s) => ({ ...s, name: 'x' }), NOW)).toBeNull();
  });

  it('returns null when fn changes nothing', () => {
    expect(mutateOne([session('a')], 'a', (s) => s, NOW)).toBeNull();
  });

  it('replaces only that session and stamps it as activity', () => {
    const a = session('a');
    const b = session('b');
    const next = mutateOne([a, b], 'a', (s) => ({ ...s, name: 'Trip' }), NOW);
    expect(next).not.toBeNull();
    expect(next![0]).toEqual({ ...a, name: 'Trip', activityAt: NOW });
    expect(next![1]).toBe(b);
  });
});

describe('addPaymentsTo', () => {
  it('stamps createdAt on the payments it adds', () => {
    const next = addPaymentsTo(
      [session('a')],
      'a',
      [{ id: 'pay_1', debtor: 'Ben', creditor: 'Ana', amountCents: 500 }],
      NOW,
    );
    expect(next[0].payments).toEqual([
      { id: 'pay_1', debtor: 'Ben', creditor: 'Ana', amountCents: 500, createdAt: NOW },
    ]);
  });

  it('skips an id that is already there', () => {
    const have = session('a', { payments: [payment('pay_1')] });
    const next = addPaymentsTo(
      [have],
      'a',
      [{ id: 'pay_1', debtor: 'Ben', creditor: 'Ana', amountCents: 500 }],
      NOW,
    );
    expect(next[0].payments).toHaveLength(1);
    expect(next[0].payments[0].amountCents).toBe(1000);
  });
});

describe('removing payments', () => {
  const two = session('a', { payments: [payment('pay_1'), payment('pay_2')] });

  it('removePaymentFrom removes one payment', () => {
    const next = removePaymentFrom([two], 'a', 'pay_1');
    expect(next[0].payments.map((p) => p.id)).toEqual(['pay_2']);
  });

  it('removeAllPaymentsFrom removes every payment of that session only', () => {
    const other = session('b', { payments: [payment('pay_3')] });
    const next = removeAllPaymentsFrom([two, other], 'a');
    expect(next[0].payments).toEqual([]);
    expect(next[1]).toBe(other);
  });
});

describe('settleOne', () => {
  it('pays what Ben owes Ana on a 100 Equal Split in one payment', () => {
    const record: PurchaseRecord = {
      id: 'rec_1',
      date: '2026-11-01',
      payorMode: 'single',
      payors: [{ member: 'Ana', amount: 100 }],
      items: [{ id: 'i1', mode: 'equal', name: 'Lunch', totalPrice: 100, owners: ['Ana', 'Ben'] }],
      createdAt: '2026-11-01T00:00:00.000Z',
    };
    const closed = session('a', { status: 'closed', records: [record] });
    let n = 0;
    const next = settleOne([closed], 'a', () => `pay_${(n += 1)}`, NOW);
    expect(next[0].payments).toEqual([
      { id: 'pay_1', debtor: 'Ben', creditor: 'Ana', amountCents: 5000, createdAt: NOW },
    ]);
    expect(isFullyPaid(next[0])).toBe(true);
  });
});

describe('appendNew', () => {
  it('keeps what is there and adds only new ids', () => {
    const a = session('a', { name: 'kept' });
    const next = appendNew([a], [session('a', { name: 'ignored' }), session('b')]);
    expect(next.map((s) => s.id)).toEqual(['a', 'b']);
    expect(next[0]).toBe(a);
  });
});
