import { describe, expect, it } from 'vitest';
import { parseAppData, serializeAppData, EMPTY_DATA, SCHEMA_VERSION } from './storage';
import type { AppData, PurchaseRecord } from '../types';

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
      expect(session.closedAt).toBeNull();
      expect(session.members).toEqual(['Ana', 'Bea']);
      expect(session.records).toHaveLength(1);
      expect(session.records[0].id).toBe('rec_1');
      expect(session.records[0].items).toHaveLength(1);
      expect(session.id).toMatch(/^session_/);
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
        },
        {
          id: 'session_closed',
          status: 'closed',
          createdAt: '2026-09-01T08:00:00.000Z',
          closedAt: '2026-09-12T08:00:00.000Z',
          members: ['Ana', 'Bea'],
          records: [record],
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
