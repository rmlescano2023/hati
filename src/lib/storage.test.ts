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

  it('upgrades a v1 blob without losing members or records', () => {
    const v1 = JSON.stringify({ schemaVersion: 1, members: ['Ana', 'Bea'], records: [record] });
    const parsed = parseAppData(v1);

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.members).toEqual(['Ana', 'Bea']);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].id).toBe('rec_1');
    // The new field is present and empty rather than undefined.
    expect(parsed.archivedSessions).toEqual([]);
  });

  it('round-trips archived sessions', () => {
    const data: AppData = {
      schemaVersion: SCHEMA_VERSION,
      members: ['Ana'],
      records: [],
      archivedSessions: [
        {
          id: 'ses_1',
          closedAt: '2026-09-12T08:00:00.000Z',
          members: ['Ana', 'Bea'],
          records: [record],
        },
      ],
    };

    const parsed = parseAppData(serializeAppData(data));
    expect(parsed.archivedSessions).toHaveLength(1);
    expect(parsed.archivedSessions[0].members).toEqual(['Ana', 'Bea']);
    expect(parsed.archivedSessions[0].records[0].items).toHaveLength(1);
  });

  it('drops archived sessions that are malformed or empty', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      members: [],
      records: [],
      archivedSessions: [
        { id: 'ses_ok', closedAt: '2026-09-12T08:00:00.000Z', members: [], records: [record] },
        { id: 'ses_no_records', closedAt: '2026-09-12T08:00:00.000Z', members: [], records: [] },
        { closedAt: '2026-09-12T08:00:00.000Z', records: [record] },
        'nonsense',
      ],
    });

    const parsed = parseAppData(raw);
    expect(parsed.archivedSessions.map((s) => s.id)).toEqual(['ses_ok']);
  });

  it('tolerates archivedSessions being absent or the wrong type', () => {
    expect(parseAppData('{"members":[],"records":[]}').archivedSessions).toEqual([]);
    expect(parseAppData('{"archivedSessions":"nope"}').archivedSessions).toEqual([]);
  });
});
