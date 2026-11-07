import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/sessions/[id]';

/**
 * The `PUT` handler against a faked database, so the rule that a save never
 * creates a session is checked by what SQL it sends. The tests live here
 * rather than under `api/`, because Vercel would deploy anything there as a
 * function.
 */

type Statement = { text: string; values: unknown[] };

const db = vi.hoisted(() => ({
  userId: 'user_a' as string | null,
  /** The `rowCount` an `update expense_sessions` reports. */
  updated: 0,
  connects: 0,
  statements: [] as Statement[],
}));

vi.mock('../../api/_shared.js', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.statements.push({ text, values });
    const rowCount = text.startsWith('update expense_sessions') ? db.updated : 0;
    return Promise.resolve({ rows: [], rowCount });
  };
  return {
    getUserId: async () => db.userId,
    ensureUser: async () => {},
    ownsSession: async () => false,
    pool: {
      sql,
      connect: async () => {
        db.connects += 1;
        return { sql, release: () => {} };
      },
    },
  };
});

function response() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    end() {
      return res;
    },
    setHeader() {
      return res;
    },
  };
  return res;
}

const SESSION = {
  status: 'draft',
  createdAt: '2026-11-01T00:00:00.000Z',
  closedAt: null,
  members: ['Ana', 'Ben'],
  name: 'Trip',
  activityAt: '2026-11-02T00:00:00.000Z',
  records: [
    {
      id: 'r1',
      date: '2026-11-01',
      payorMode: 'single',
      payors: [{ member: 'Ana', amount: 0 }],
      items: [{ id: 'i1', mode: 'equal', name: 'Lunch', totalPrice: 100, owners: ['Ana', 'Ben'] }],
      createdAt: '2026-11-01T01:00:00.000Z',
    },
    {
      id: 'r2',
      date: '2026-11-01',
      payorMode: 'single',
      payors: [{ member: 'Ben', amount: 0 }],
      items: [],
      createdAt: '2026-11-01T02:00:00.000Z',
    },
  ],
};

async function put(body: unknown = SESSION) {
  const res = response();
  const req = { method: 'PUT', query: { id: 's1' }, headers: {}, body };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const sent = (prefix: string) => db.statements.filter((s) => s.text.startsWith(prefix));

beforeEach(() => {
  db.userId = 'user_a';
  db.updated = 0;
  db.connects = 0;
  db.statements = [];
});

describe('PUT /api/sessions/:id', () => {
  it('is a 404 that writes nothing when no row of the caller has this id', async () => {
    db.updated = 0;
    const res = await put();

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'No such session.' });
    expect(sent('rollback')).toHaveLength(1);
    expect(sent('commit')).toHaveLength(0);
    expect(sent('insert into expense_sessions')).toHaveLength(0);
    expect(db.statements.filter((s) => s.text.includes('purchase_records'))).toHaveLength(0);
  });

  it('scopes the update to both the session id and the signed-in user', async () => {
    db.updated = 1;
    await put();

    const [update] = sent('update expense_sessions');
    expect(update).toBeDefined();
    expect(update.values).toContain('s1');
    expect(update.values).toContain('user_a');
  });

  it('updates an owned session and replaces its records', async () => {
    db.updated = 1;
    const res = await put();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: 's1', name: 'Trip', members: ['Ana', 'Ben'] });
    expect(sent('delete from purchase_records')).toHaveLength(1);
    expect(sent('insert into purchase_records')).toHaveLength(2);
    expect(sent('commit')).toHaveLength(1);
  });

  it('never inserts a session, found or not', async () => {
    for (const updated of [0, 1]) {
      db.updated = updated;
      await put();
    }
    expect(sent('insert into expense_sessions')).toHaveLength(0);
  });

  it('is a 401 without a user, and touches no database', async () => {
    db.userId = null;
    const res = await put();

    expect(res.statusCode).toBe(401);
    expect(db.statements).toHaveLength(0);
    expect(db.connects).toBe(0);
  });

  it('is a 400 for a malformed body, and touches no database', async () => {
    const res = await put(['not', 'a', 'session']);

    expect(res.statusCode).toBe(400);
    expect(db.statements).toHaveLength(0);
    expect(db.connects).toBe(0);
  });
});
