import { describe, expect, it } from 'vitest';
import {
  parseAppData,
  parseSession,
  serializeAppData,
  EMPTY_DATA,
  SCHEMA_VERSION,
} from './storage';
import { exampleA, exampleB, exampleD1 } from './billExamples';
import type { AppData, BillLine, CustomAmountItem, PurchaseItem, PurchaseRecord } from '../types';

const record: PurchaseRecord = {
  id: 'rec_1',
  date: '2026-09-10',
  payorMode: 'single',
  payors: [{ member: 'Ana', amount: 0 }],
  items: [{ id: 'itm_1', mode: 'equal', name: 'Coffee', totalPrice: 120, owners: ['Ana', 'Bea'] }],
  createdAt: '2026-09-10T02:00:00.000Z',
};

describe('parseAppData', () => {
  it('returns empty data for junk input', () => {
    expect(parseAppData(null)).toEqual(EMPTY_DATA);
    expect(parseAppData('not json')).toEqual(EMPTY_DATA);
    expect(parseAppData('[]')).toEqual(EMPTY_DATA);
  });

  describe('v1 migration', () => {
    it('wraps a v1 blob into a single draft session, losing nothing', () => {
      const v1 = JSON.stringify({ schemaVersion: 1, members: ['Ana', 'Bea'], records: [record] });
      const parsed = parseAppData(v1);

      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.sessions).toHaveLength(1);

      const [session] = parsed.sessions;
      expect(session.status).toBe('draft');
      expect(session.finishedWithCollection).toBe(false);
      expect(session.closedAt).toBeNull();
      expect(session.members).toEqual(['Ana', 'Bea']);
      expect(session.records).toHaveLength(1);
      expect(session.records[0].id).toBe('rec_1');
      expect(session.records[0].items).toHaveLength(1);
      expect(session.id).toMatch(/^session_/);
      expect(session.name).toBeNull();
      expect(session.activityAt).toBeNull();
      expect(session.me).toBeNull();
      expect(session.payments).toEqual([]);
    });

    it('migrates an empty v1 blob to no sessions rather than an empty one', () => {
      const v1 = JSON.stringify({ schemaVersion: 1, members: [], records: [] });
      expect(parseAppData(v1).sessions).toEqual([]);
    });

    it('keeps a members-only v1 blob, so a roster entered but unused survives', () => {
      const v1 = JSON.stringify({ schemaVersion: 1, members: ['Ana'], records: [] });
      const parsed = parseAppData(v1);
      expect(parsed.sessions).toHaveLength(1);
      expect(parsed.sessions[0].members).toEqual(['Ana']);
    });

    it('does not re-migrate a v2 blob that already has sessions', () => {
      const v2 = JSON.stringify({ schemaVersion: 2, sessions: [], members: ['Ana'] });
      expect(parseAppData(v2).sessions).toEqual([]);
    });
  });

  it('round-trips draft and closed sessions', () => {
    const data: AppData = {
      schemaVersion: SCHEMA_VERSION,
      sessions: [
        {
          id: 'session_draft',
          status: 'draft',
          createdAt: '2026-09-11T08:00:00.000Z',
          closedAt: null,
          members: ['Ana'],
          records: [record],
          name: 'Bali Trip',
          activityAt: '2026-09-12T09:30:00.000Z',
          me: null,
          finishedWithCollection: false,
          payments: [],
        },
        {
          id: 'session_closed',
          status: 'closed',
          createdAt: '2026-09-01T08:00:00.000Z',
          closedAt: '2026-09-12T08:00:00.000Z',
          members: ['Ana', 'Bea'],
          records: [record],
          name: null,
          activityAt: null,
          me: 'Ana',
          finishedWithCollection: true,
          payments: [],
        },
      ],
    };

    const parsed = parseAppData(serializeAppData(data));
    expect(parsed.sessions).toHaveLength(2);
    expect(parsed.sessions[0]).toEqual(data.sessions[0]);
    expect(parsed.sessions[1]).toEqual(data.sessions[1]);
  });

  it('drops malformed sessions but keeps the good ones', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      sessions: [
        { id: 'ok', status: 'draft', createdAt: 'x', closedAt: null, members: [], records: [] },
        { status: 'draft', members: [], records: [] },
        'nonsense',
        null,
      ],
    });
    expect(parseAppData(raw).sessions.map((s) => s.id)).toEqual(['ok']);
  });

  it('defaults an unrecognised status to draft', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      sessions: [{ id: 'weird', status: 'archived', members: [], records: [] }],
    });
    const [session] = parseAppData(raw).sessions;
    expect(session.status).toBe('draft');
    expect(session.closedAt).toBeNull();
  });

  it('gives a closed session a closedAt even when the stored one is missing', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      sessions: [
        {
          id: 'closed',
          status: 'closed',
          createdAt: '2026-09-01T08:00:00.000Z',
          members: [],
          records: [],
        },
      ],
    });
    expect(parseAppData(raw).sessions[0].closedAt).toBe('2026-09-01T08:00:00.000Z');
  });
});

describe('parseSession and the bill of a Custom item', () => {
  /** A session whose one record holds `item`, so each case names only the item. */
  const withItem = (item: unknown) => ({
    id: 'session_1',
    members: ['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay'],
    records: [{ ...record, items: [item] }],
  });
  const parsedItem = (item: unknown): PurchaseItem | undefined =>
    parseSession(withItem(item))?.records[0].items[0];

  /** An item that keeps its amounts and drops the bill (BR-CA44). */
  const dropsBill = (item: unknown) => {
    const parsed = parsedItem(item);
    expect(parsed?.mode).toBe('custom');
    expect(parsed && 'bill' in parsed).toBe(false);
    return parsed as CustomAmountItem;
  };

  const a = exampleA();
  const aBill = a.bill as BillLine[];
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  it('S-1 keeps a valid bill in the order sent, names tidied and cut to 60, known keys only', () => {
    const long = 'x'.repeat(80);
    const item = parsedItem({
      ...a,
      bill: [
        { ...aBill[0], name: `  Pork \t ramen ${long}`, extra: 'dropped' },
        aBill[1],
        { ...aBill[2], members: ['Ben', 'Ana'], amount: 290.004 },
      ],
    }) as CustomAmountItem;
    expect(item.bill).toHaveLength(3);
    const [first, , third] = item.bill as BillLine[];
    expect(Array.from(first.name)).toHaveLength(60);
    expect(first.name.startsWith('Pork ramen x')).toBe(true);
    expect(Object.keys(first)).toEqual(['kind', 'member', 'name', 'amount']);
    // The members are kept in the order sent.
    expect(third).toEqual({ kind: 'shared', members: ['Ben', 'Ana'], name: 'Gyoza', amount: 290 });
    expect(item.amounts).toEqual({ Ana: 865, Ben: 895 });
  });

  it('S-2 drops the bill, keeps the amounts and never drops the session', () => {
    const bad: unknown[] = [
      'nope',
      [],
      [...aBill, null],
      [...aBill, 'x'],
      [...aBill, { kind: 'bonus', name: 'x', amount: 1 }],
      [{ ...aBill[0], name: 7 }, aBill[1], aBill[2]],
      ...[0, -5, NaN, Infinity, '120'].map((amount) => [
        aBill[0],
        aBill[1],
        { ...aBill[2], amount },
      ]),
      [{ ...aBill[0], member: 7 }, aBill[1], aBill[2]],
      ...[undefined, [], ['Ana', 7], ['Ana', 'Ana'], 'Ana'].map((members) => [
        aBill[0],
        aBill[1],
        { ...aBill[2], members },
      ]),
    ];
    for (const bill of bad) {
      const parsed = dropsBill({ ...a, bill });
      expect(parsed.amounts).toEqual({ Ana: 865, Ben: 895 });
    }
  });

  it('S-3 drops the bill when a shared or discount member is not in amounts', () => {
    dropsBill({ ...a, bill: [aBill[0], aBill[1], { ...aBill[2], members: ['Ana', 'Zed'] }] });
    const d = exampleD1();
    dropsBill({
      ...d,
      bill: [
        (d.bill as BillLine[])[0],
        (d.bill as BillLine[])[1],
        { kind: 'discount', members: ['Zed'], name: 'V', amount: 450 },
      ],
    });
  });

  it('S-4 skips an order line for a member not in amounts and keeps the rest when they agree', () => {
    const item = parsedItem({
      ...a,
      bill: [
        aBill[0],
        { kind: 'order', member: 'Gone', name: 'Ghost', amount: 40 },
        aBill[1],
        aBill[2],
      ],
    }) as CustomAmountItem;
    expect(item.bill).toEqual(aBill);
  });

  it('S-4 leaves out an order for an inherited object key rather than failing', () => {
    for (const member of ['constructor', 'toString', 'hasOwnProperty']) {
      const item = parsedItem({
        ...a,
        bill: [...aBill, { kind: 'order', member, name: 'Ghost', amount: 5 }],
      }) as CustomAmountItem;
      expect(item.bill).toEqual(aBill);
    }
  });

  it('S-5 drops the bill when an amounts key is on no order or shared line (BR-CA13)', () => {
    dropsBill({ ...a, amounts: { Ana: 865, Ben: 895, Cy: 0 } });
    const d = exampleD1();
    // Cy has only a discount, which doesn't put a member in the item.
    dropsBill({
      ...d,
      amounts: { Ana: 0, Ben: 600, Cy: 0 },
      bill: [
        ...(d.bill as BillLine[]),
        { kind: 'discount', members: ['Cy'], name: 'X', amount: 1 },
      ],
    });
  });

  it('S-6 drops the bill when any member is a centavo off', () => {
    dropsBill({ ...a, amounts: { Ana: 865.01, Ben: 895 } });
    dropsBill({ ...a, amounts: { Ana: 865, Ben: 894.99 } });
    const b = exampleB();
    dropsBill({ ...b, amounts: { ...b.amounts, Fay: 441.41 } });
  });

  it('S-7 drops the bill when a share is below 0, even when amounts agree (BR-CA6)', () => {
    const bill: BillLine[] = [
      { kind: 'order', member: 'Ana', name: 'Pasta', amount: 100 },
      { kind: 'order', member: 'Ben', name: 'Steak', amount: 100 },
      { kind: 'discount', members: ['Ana'], name: 'Big', amount: 150 },
    ];
    dropsBill({ id: 'i', mode: 'custom', name: 'x', amounts: { Ana: -50, Ben: 100 }, bill });
  });

  it('S-8 drops a bill of own orders only, and still parses the lines beside it (BR-CA43)', () => {
    const item = parsedItem({
      id: 'i',
      mode: 'custom',
      name: 'x',
      amounts: { Ana: 30 },
      bill: [{ kind: 'order', member: 'Ana', name: 'Sisig', amount: 30 }],
      lines: [{ member: 'Ana', name: 'Sisig', amount: 30 }],
    }) as CustomAmountItem;
    expect('bill' in item).toBe(false);
    expect(item.lines).toEqual([{ member: 'Ana', name: 'Sisig', amount: 30 }]);
  });

  it('S-9 keeps only a valid bill beside lines, and the lines beside an invalid bill', () => {
    const lines = [
      { member: 'Ana', name: 'Ramen', amount: 865 },
      { member: 'Ben', name: 'Ramen', amount: 895 },
    ];
    const both = parsedItem({ ...a, lines }) as CustomAmountItem;
    expect(both.bill).toEqual(aBill);
    expect('lines' in both).toBe(false);

    const invalid = parsedItem({ ...a, lines, bill: 'nope' }) as CustomAmountItem;
    expect('bill' in invalid).toBe(false);
    expect(invalid.lines).toEqual(lines);
  });

  it('S-10 treats a member called __proto__ as a key, never as the prototype', () => {
    const bill: BillLine[] = [
      { kind: 'order', member: '__proto__', name: 'Ghost', amount: 5 },
      { kind: 'order', member: 'Ana', name: 'Real', amount: 5 },
      { kind: 'charge', name: 'Fee', amount: 2 },
    ];
    const raw = JSON.parse(
      JSON.stringify({ id: 'i', mode: 'custom', name: 'x', amounts: { Ana: 7 }, bill }),
    );
    // `amounts` holds only Ana, so the order for `__proto__` is skipped, as an
    // order for a removed member is, and the rest (Ana 5 + the whole fee) agrees.
    const item = parsedItem(raw) as CustomAmountItem;
    expect(item.bill).toEqual([bill[1], bill[2]]);
    expect(Object.getPrototypeOf(item.amounts)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).Ana).toBeUndefined();
  });

  it('S-11 returns an Equal item without a stray bill', () => {
    const item = parsedItem({
      id: 'e',
      mode: 'equal',
      name: 'Coffee',
      totalPrice: 100,
      owners: ['Ana'],
      bill: aBill,
    });
    expect(item).toEqual({
      id: 'e',
      mode: 'equal',
      name: 'Coffee',
      totalPrice: 100,
      owners: ['Ana'],
    });
  });

  it('S-12 parses 100,000 charges over 5,000 members inside the default timeout', () => {
    const members = Array.from({ length: 5000 }, (_, i) => `M${String(i).padStart(4, '0')}`);
    // 100,000 charges of 50.00 give each of 5,000 members one centavo each, so
    // every share is 10.00 + 1,000.00.
    const bill: BillLine[] = [
      ...members.map((member) => ({ kind: 'order' as const, member, name: 'Rice', amount: 10 })),
      ...Array.from({ length: 100_000 }, () => ({
        kind: 'charge' as const,
        name: 'Fee',
        amount: 50,
      })),
    ];
    const amounts = Object.fromEntries(members.map((m) => [m, 1010]));
    const item = parsedItem({
      id: 'big',
      mode: 'custom',
      name: 'Big',
      amounts,
      bill,
    }) as CustomAmountItem;
    expect(item.bill).toHaveLength(105_000);
  });

  it('S-13 keeps a member at 0, the 0 included', () => {
    const d = exampleD1();
    const item = parsedItem(clone(d)) as CustomAmountItem;
    expect(item).toEqual(d);
    expect(item.amounts).toEqual({ Ana: 0, Ben: 600 });
  });

  it('OT-2 keeps the bill when a tab that never touched it saves, whatever order jsonb gives', () => {
    const b = exampleB();
    // jsonb doesn't keep object key order, so amounts comes back reordered.
    const reordered = { ...b, amounts: Object.fromEntries(Object.entries(b.amounts).reverse()) };
    const item = parsedItem(clone(reordered)) as CustomAmountItem;
    expect(item.bill).toEqual(b.bill);
    expect(item.amounts).toEqual(b.amounts);
  });
});
