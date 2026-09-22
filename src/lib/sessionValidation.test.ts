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
