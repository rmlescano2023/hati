import { describe, expect, it } from 'vitest';
import { parseSession } from './storage';

/**
 * `parseAppData` used to be the server's validation boundary, run over an
 * entire account document on every write. Writes now name one session, so
 * `parseSession` holds that role instead. These cover the cases that boundary
 * has to survive.
 */
const valid = {
  id: 'session_1',
  status: 'draft',
  createdAt: '2026-09-11T08:00:00.000Z',
  closedAt: null,
  members: ['Ana', 'Bea'],
  records: [
    {
      id: 'rec_1',
      date: '2026-09-10',
      payorMode: 'single',
      payors: [{ member: 'Ana', amount: 0 }],
      items: [
        { id: 'itm_1', mode: 'equal', name: 'Coffee', totalPrice: 120, owners: ['Ana', 'Bea'] },
      ],
      createdAt: '2026-09-10T02:00:00.000Z',
    },
  ],
};

describe('parseSession as the write boundary', () => {
  it('accepts a well-formed session unchanged', () => {
    const s = parseSession(valid);
    expect(s?.id).toBe('session_1');
    expect(s?.members).toEqual(['Ana', 'Bea']);
    expect(s?.records).toHaveLength(1);
    expect(s?.records[0].items).toHaveLength(1);
  });

  it('rejects anything that is not an object', () => {
    for (const bad of [null, undefined, 'session', 42, []]) {
      expect(parseSession(bad)).toBeNull();
    }
  });

  it('rejects a session with no id', () => {
    expect(parseSession({ ...valid, id: undefined })).toBeNull();
  });

  it('drops records that are malformed rather than storing them', () => {
    const s = parseSession({
      ...valid,
      records: [valid.records[0], { id: 'rec_2' }, 'nonsense', null],
    });
    expect(s?.records.map((r) => r.id)).toEqual(['rec_1']);
  });

  it('drops non-string members', () => {
    const s = parseSession({ ...valid, members: ['Ana', 42, null, 'Bea'] });
    expect(s?.members).toEqual(['Ana', 'Bea']);
  });

  it('coerces an unrecognised status to draft rather than storing it', () => {
    const s = parseSession({ ...valid, status: 'whatever' });
    expect(s?.status).toBe('draft');
    expect(s?.closedAt).toBeNull();
  });

  it('strips fields it does not know about', () => {
    const s = parseSession({ ...valid, isAdmin: true, userId: 'someone-else' });
    expect(s).not.toHaveProperty('isAdmin');
    expect(s).not.toHaveProperty('userId');
  });

  it('reads an absent name as no name, so older clients stay valid', () => {
    expect(parseSession(valid)?.name).toBeNull();
  });

  it('tidies the name it stores', () => {
    expect(parseSession({ ...valid, name: '  Bali   Trip ' })?.name).toBe('Bali Trip');
  });

  it('accepts the session but drops a name that is not a string', () => {
    for (const bad of [42, {}, true]) {
      const s = parseSession({ ...valid, name: bad });
      expect(s?.id).toBe('session_1');
      expect(s?.name).toBeNull();
    }
  });

  it('cuts an over-long name rather than rejecting the session', () => {
    expect(parseSession({ ...valid, name: 'n'.repeat(200) })?.name).toBe('n'.repeat(60));
  });

  it('reads an absent activity time as none, so older clients stay valid', () => {
    expect(parseSession(valid)?.activityAt).toBeNull();
  });

  it('keeps a valid activity time', () => {
    expect(parseSession({ ...valid, activityAt: '2026-11-03T10:00:00.000Z' })?.activityAt).toBe(
      '2026-11-03T10:00:00.000Z',
    );
  });

  it('accepts the session but drops an activity time it cannot read', () => {
    for (const bad of ['x', 42, true]) {
      const s = parseSession({ ...valid, activityAt: bad });
      expect(s?.id).toBe('session_1');
      expect(s?.activityAt).toBeNull();
    }
  });

  it('normalises an activity time with an offset to UTC ISO', () => {
    expect(parseSession({ ...valid, activityAt: '2026-11-03T18:00:00+08:00' })?.activityAt).toBe(
      '2026-11-03T10:00:00.000Z',
    );
  });

  it('reads an absent pick as none', () => {
    expect(parseSession(valid)?.me).toBeNull();
  });

  it('keeps a pick that is one of the members, or the not-in-session marker', () => {
    expect(parseSession({ ...valid, me: 'Ana' })?.me).toBe('Ana');
    expect(parseSession({ ...valid, me: '' })?.me).toBe('');
  });

  it('accepts the session but drops a pick it cannot use', () => {
    for (const bad of ['Zed', 42, null]) {
      const s = parseSession({ ...valid, me: bad });
      expect(s?.id).toBe('session_1');
      expect(s?.me).toBeNull();
    }
  });

  it('never reads payments from a session body', () => {
    const s = parseSession({
      ...valid,
      payments: [{ id: 'pay_1', debtor: 'Bea', creditor: 'Ana', amountCents: 100 }],
    });
    expect(s?.payments).toEqual([]);
  });

  it('ignores an item amount that is not a finite number', () => {
    const s = parseSession({
      ...valid,
      records: [
        {
          ...valid.records[0],
          items: [{ id: 'itm_x', mode: 'custom', name: 'Odd', amounts: { Ana: 'lots', Bea: 10 } }],
        },
      ],
    });
    const item = s?.records[0].items[0];
    expect(item?.mode).toBe('custom');
    expect(item && 'amounts' in item ? item.amounts : null).toEqual({ Bea: 10 });
  });
});

describe('parseSession and finishedWithCollection', () => {
  it('keeps true, and reads anything else as false without rejecting the session', () => {
    expect(parseSession({ ...valid, finishedWithCollection: true })?.finishedWithCollection).toBe(
      true,
    );
    for (const other of [undefined, 'true', 1, null, false]) {
      const s = parseSession({ ...valid, finishedWithCollection: other });
      expect(s).not.toBeNull();
      expect(s?.finishedWithCollection).toBe(false);
    }
  });
});

describe('parseSession and order lines', () => {
  /** A session whose one record holds `item`, so each case names only the item. */
  const withItem = (item: unknown) => ({
    ...valid,
    records: [{ ...valid.records[0], items: [item] }],
  });
  const parsedItem = (item: unknown) => parseSession(withItem(item))?.records[0].items[0];

  const itemized = {
    id: 'itm_c',
    mode: 'custom',
    name: 'Dinner',
    amounts: { Ana: 280, Bea: 300 },
    lines: [
      { member: 'Ana', name: 'Sisig', amount: 280 },
      { member: 'Bea', name: 'Pancit', amount: 180 },
      { member: 'Bea', name: '', amount: 120 },
    ],
  };

  it('keeps an amounts-only Custom item exactly as it was, with no lines key', () => {
    const item = parsedItem({ id: 'itm_c', mode: 'custom', name: 'Dinner', amounts: { Ana: 10 } });
    expect(item).toEqual({ id: 'itm_c', mode: 'custom', name: 'Dinner', amounts: { Ana: 10 } });
    expect(item && 'lines' in item).toBe(false);
  });

  it('keeps valid lines in the order sent, with names tidied and cut to 60', () => {
    const long = 'x'.repeat(80);
    const item = parsedItem({
      ...itemized,
      amounts: { Ana: 280, Bea: 300 },
      lines: [
        { member: 'Ana', name: `  Pork \t sisig ${long}`, amount: 280 },
        { member: 'Bea', name: 'Pancit', amount: 180.004 },
        { member: 'Bea', name: '', amount: 119.996 },
      ],
    });
    expect(item?.mode === 'custom' && item.lines).toBeTruthy();
    if (item?.mode !== 'custom' || !item.lines) return;
    expect(item.lines.map((l) => l.member)).toEqual(['Ana', 'Bea', 'Bea']);
    expect(Array.from(item.lines[0].name)).toHaveLength(60);
    expect(item.lines[0].name.startsWith('Pork sisig x')).toBe(true);
    expect(item.lines[1].amount).toBe(180);
    expect(item.lines[2].amount).toBe(120);
  });

  const dropsLines = (item: unknown) => {
    const parsed = parsedItem(item);
    expect(parsed?.mode).toBe('custom');
    expect(parsed && 'lines' in parsed).toBe(false);
    return parsed;
  };

  it("drops the lines and keeps the amounts when a member's lines do not add up", () => {
    const parsed = dropsLines({ ...itemized, amounts: { Ana: 280, Bea: 999 } });
    expect(parsed?.mode === 'custom' && parsed.amounts).toEqual({ Ana: 280, Bea: 999 });
  });

  it('drops the lines when a member in amounts has none', () => {
    dropsLines({ ...itemized, amounts: { Ana: 280, Bea: 300, Cy: 5 } });
  });

  it('drops the lines when no line is named', () => {
    dropsLines({
      ...itemized,
      lines: itemized.lines.map((l) => ({ ...l, name: '' })),
    });
  });

  it('drops the lines when a line has an amount of 0, negative, NaN or a string', () => {
    for (const amount of [0, -5, NaN, '120']) {
      dropsLines({
        ...itemized,
        lines: [itemized.lines[0], itemized.lines[1], { member: 'Bea', name: '', amount }],
      });
    }
  });

  it('drops the lines when an entry is not an object or has a bad member or name', () => {
    dropsLines({ ...itemized, lines: [...itemized.lines, null] });
    dropsLines({ ...itemized, lines: [...itemized.lines, 'x'] });
    dropsLines({ ...itemized, lines: [...itemized.lines, { member: 7, name: 'a', amount: 1 }] });
    dropsLines({ ...itemized, lines: [...itemized.lines, { member: 'Ana', name: 7, amount: 1 }] });
  });

  it('drops the lines when they are not an array or are empty', () => {
    dropsLines({ ...itemized, lines: 'nope' });
    dropsLines({ ...itemized, lines: [] });
  });

  it('drops a line for a member not in amounts and keeps the rest when they still agree', () => {
    const item = parsedItem({
      ...itemized,
      lines: [...itemized.lines, { member: 'Gone', name: 'Ghost', amount: 40 }],
    });
    expect(item?.mode === 'custom' && item.lines?.map((l) => l.member)).toEqual([
      'Ana',
      'Bea',
      'Bea',
    ]);
  });

  it('rebuilds an Equal item from its own fields, dropping a stray lines field', () => {
    const item = parsedItem({
      id: 'itm_e',
      mode: 'equal',
      name: 'Taxi',
      totalPrice: 90,
      owners: ['Ana'],
      lines: itemized.lines,
    });
    expect(item).toEqual({
      id: 'itm_e',
      mode: 'equal',
      name: 'Taxi',
      totalPrice: 90,
      owners: ['Ana'],
    });
  });

  it('still parses a whole session that carries every bad shape above', () => {
    const s = parseSession({
      ...valid,
      records: [
        {
          ...valid.records[0],
          items: [
            itemized,
            { ...itemized, id: 'a', amounts: { Ana: 1 } },
            { ...itemized, id: 'b', lines: 'nope' },
            { ...itemized, id: 'c', lines: [null] },
          ],
        },
      ],
    });
    expect(s?.records[0].items).toHaveLength(4);
  });
});
