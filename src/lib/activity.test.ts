import { describe, expect, it } from 'vitest';
import type { PurchaseRecord, Session } from '../types';
import {
  clampActivityAt,
  compareByRecentActivity,
  keepOpenedActivity,
  parseActivityAt,
  sortTime,
} from './activity';

const record = (createdAt: string, date = '2026-11-01'): PurchaseRecord => ({
  id: `rec_${createdAt}`,
  date,
  payorMode: 'single',
  payors: [{ member: 'Ana', amount: 0 }],
  items: [{ id: 'itm_1', mode: 'equal', name: 'Rice', totalPrice: 100, owners: ['Ana'] }],
  createdAt,
});

const session = (id: string, overrides: Partial<Session> = {}): Session => ({
  id,
  status: 'draft',
  createdAt: '2026-11-01T08:00:00.000Z',
  closedAt: null,
  members: ['Ana'],
  records: [],
  name: null,
  activityAt: null,
  me: null,
  finishedWithCollection: false,
  payments: [],
  ...overrides,
});

const at = (iso: string) => Date.parse(iso);

describe('parseActivityAt', () => {
  it('keeps an ISO time as it is', () => {
    expect(parseActivityAt('2026-11-03T10:00:00.000Z')).toBe('2026-11-03T10:00:00.000Z');
  });

  it('normalises a time with an offset to UTC ISO', () => {
    expect(parseActivityAt('2026-11-03T18:00:00+08:00')).toBe('2026-11-03T10:00:00.000Z');
  });

  it('reads anything unreadable as no time', () => {
    for (const bad of [42, null, undefined, {}, '', 'x']) {
      expect(parseActivityAt(bad)).toBeNull();
    }
  });

  it('reads a time before 1970 as no time', () => {
    expect(parseActivityAt('1969-12-31T23:59:59.000Z')).toBeNull();
  });
});

describe('clampActivityAt', () => {
  const now = at('2026-11-03T10:00:00.000Z');

  it('keeps no time as no time', () => {
    expect(clampActivityAt(null, now)).toBeNull();
  });

  it('keeps a past time unchanged', () => {
    expect(clampActivityAt('2026-11-02T09:00:00.000Z', now)).toBe('2026-11-02T09:00:00.000Z');
  });

  it("caps a time ahead of the server's clock at the server's clock", () => {
    expect(clampActivityAt('2026-11-05T10:00:00.000Z', now)).toBe(new Date(now).toISOString());
  });

  it('keeps a time equal to now unchanged', () => {
    expect(clampActivityAt('2026-11-03T10:00:00.000Z', now)).toBe('2026-11-03T10:00:00.000Z');
  });
});

describe('sortTime', () => {
  it('is the creation time with no activity and no records', () => {
    expect(sortTime(session('A'))).toBe(at('2026-11-01T08:00:00.000Z'));
  });

  it('is the latest logged record with no activity, whatever the array order', () => {
    const s = session('A', {
      records: [
        record('2026-11-02T08:00:00.000Z'),
        record('2026-11-04T08:00:00.000Z'),
        record('2026-11-03T08:00:00.000Z'),
      ],
    });
    expect(sortTime(s)).toBe(at('2026-11-04T08:00:00.000Z'));
  });

  it('is the activity time when it is later than every record', () => {
    const s = session('A', {
      activityAt: '2026-11-05T08:00:00.000Z',
      records: [record('2026-11-02T08:00:00.000Z')],
    });
    expect(sortTime(s)).toBe(at('2026-11-05T08:00:00.000Z'));
  });

  // BR-5, AC-10.4: an older build can log a purchase without stamping.
  it('is a record logged after the activity time', () => {
    const s = session('A', {
      activityAt: '2026-11-02T08:00:00.000Z',
      records: [record('2026-11-04T08:00:00.000Z')],
    });
    expect(sortTime(s)).toBe(at('2026-11-04T08:00:00.000Z'));
  });

  // Q1: the logged time counts, not the purchase date the user picked.
  it("ignores a record's purchase date", () => {
    const s = session('A', { records: [record('2026-11-02T08:00:00.000Z', '2030-01-01')] });
    expect(sortTime(s)).toBe(at('2026-11-02T08:00:00.000Z'));
  });
});

describe('compareByRecentActivity', () => {
  it('puts the later sort time first', () => {
    const older = session('A', { activityAt: '2026-11-02T08:00:00.000Z' });
    const newer = session('B', { activityAt: '2026-11-03T08:00:00.000Z' });
    expect([older, newer].sort(compareByRecentActivity).map((s) => s.id)).toEqual(['B', 'A']);
  });

  // AC-10.2: a session from before the feature sorts in the same list.
  it('compares a session with an activity time and one without by sort time', () => {
    const stamped = session('A', { activityAt: '2026-11-02T08:00:00.000Z' });
    const legacy = session('B', { records: [record('2026-11-03T08:00:00.000Z')] });
    const fresh = session('C', { createdAt: '2026-11-01T09:00:00.000Z' });
    expect([stamped, legacy, fresh].sort(compareByRecentActivity).map((s) => s.id)).toEqual([
      'B',
      'A',
      'C',
    ]);
  });

  it('puts the newer session first when sort times are equal', () => {
    const same = '2026-11-03T08:00:00.000Z';
    const older = session('A', { createdAt: '2026-11-01T08:00:00.000Z', activityAt: same });
    const newer = session('B', { createdAt: '2026-11-02T08:00:00.000Z', activityAt: same });
    expect([older, newer].sort(compareByRecentActivity).map((s) => s.id)).toEqual(['B', 'A']);
  });

  it('puts the lower id first when sort time and creation are equal', () => {
    expect(
      [session('session_b'), session('session_a')].sort(compareByRecentActivity).map((s) => s.id),
    ).toEqual(['session_a', 'session_b']);
  });

  // AC-5.4: the order is total, so every device and render agrees.
  it('gives the same order from any starting permutation', () => {
    const fixture = [
      session('session_c'),
      session('session_a'),
      session('session_e', { activityAt: '2026-11-03T08:00:00.000Z' }),
      session('session_d', { createdAt: '2026-11-02T08:00:00.000Z' }),
      session('session_b', { records: [record('2026-11-03T08:00:00.000Z')] }),
    ];
    const one = [...fixture].sort(compareByRecentActivity).map((s) => s.id);
    const two = [...fixture].reverse().sort(compareByRecentActivity).map((s) => s.id);
    expect(one).toEqual(two);
    expect(one).toEqual(['session_b', 'session_e', 'session_d', 'session_a', 'session_c']);
  });

  it('never returns NaN for an unreadable creation time', () => {
    const result = compareByRecentActivity(session('A', { createdAt: 'x' }), session('B'));
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe('keepOpenedActivity', () => {
  const later = '2026-11-03T10:00:00.000Z';
  const earlier = '2026-11-03T09:00:00.000Z';

  it("keeps an opening session's later local time and takes the merged content", () => {
    const merged = session('A', { activityAt: earlier, members: ['Ana', 'Ben'] });
    const local = session('A', { activityAt: later });
    const [result] = keepOpenedActivity([merged], [local], () => true);
    expect(result.activityAt).toBe(later);
    expect(result.members).toEqual(['Ana', 'Ben']);
    expect(result.records).toBe(merged.records);
  });

  it("keeps the server copy when its time is later or equal", () => {
    const newer = session('A', { activityAt: later });
    expect(keepOpenedActivity([newer], [session('A', { activityAt: earlier })], () => true)[0]).toBe(
      newer,
    );
    const equal = session('A', { activityAt: later });
    expect(keepOpenedActivity([equal], [session('A', { activityAt: later })], () => true)[0]).toBe(
      equal,
    );
  });

  // AC-6.2: once the open has settled the server decides.
  it('keeps the merged copy for a session that is not opening', () => {
    const merged = session('A', { activityAt: earlier });
    const local = session('A', { activityAt: later });
    expect(keepOpenedActivity([merged], [local], () => false)[0]).toBe(merged);
  });

  it('keeps the merged copy when the local time is null', () => {
    const merged = session('A', { activityAt: earlier });
    expect(keepOpenedActivity([merged], [session('A')], () => true)[0]).toBe(merged);
  });

  it('keeps a merged session with no local copy as it is', () => {
    const merged = session('A', { activityAt: earlier });
    expect(keepOpenedActivity([merged], [], () => true)[0]).toBe(merged);
  });
});
