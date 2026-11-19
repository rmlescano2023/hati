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
  /** The stored row the locking `select … for update` finds, or none. */
  stored: null as { status: string; members: string[]; me: string | null } | null,
  /** The members other accounts have joined as. */
  claimed: [] as string[],
  /** What `loadSessions` answers: the stored session. */
  loaded: [] as unknown[],
  loadCalls: [] as unknown[][],
  connects: 0,
  statements: [] as Statement[],
}));

vi.mock('../../api/_shared.js', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.statements.push({ text, values });
    let rows: unknown[] = [];
    if (text.startsWith('select status, members, me from expense_sessions')) {
      rows = db.stored ? [db.stored] : [];
    } else if (text.startsWith('select member from session_participants')) {
      rows = db.claimed.map((member) => ({ member }));
    }
    return Promise.resolve({ rows, rowCount: rows.length });
  };
  return {
    getUserId: async () => db.userId,
    ensureUser: async () => {},
    ownsSession: async () => false,
    loadSessions: async (...args: unknown[]) => {
      db.loadCalls.push(args);
      return db.loaded;
    },
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

const DRAFT = { status: 'draft', members: [], me: null };
const CLOSED = { status: 'closed', members: ['Ana', 'Ben'], me: 'Ana' };

beforeEach(() => {
  db.userId = 'user_a';
  db.stored = null;
  db.claimed = [];
  db.loaded = [];
  db.loadCalls = [];
  db.connects = 0;
  db.statements = [];
});

describe('PUT /api/sessions/:id', () => {
  it('is a 404 that writes nothing when no row of the caller has this id', async () => {
    db.stored = null;
    const res = await put();

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'No such session.' });
    expect(sent('rollback')).toHaveLength(1);
    expect(sent('commit')).toHaveLength(0);
    expect(sent('insert into expense_sessions')).toHaveLength(0);
    expect(db.statements.filter((s) => s.text.includes('purchase_records'))).toHaveLength(0);
  });

  it('locks and reads the stored row of the caller first, scoped to both ids', async () => {
    db.stored = DRAFT;
    await put();

    const [lock] = sent('select status, members, me from expense_sessions');
    expect(lock.text).toMatch(/for update$/);
    expect(lock.values).toEqual(['s1', 'user_a']);
    expect(db.statements[1]).toBe(lock);
  });

  it('scopes the update to both the session id and the signed-in user', async () => {
    db.stored = DRAFT;
    await put();

    const [update] = sent('update expense_sessions');
    expect(update).toBeDefined();
    expect(update.values).toContain('s1');
    expect(update.values).toContain('user_a');
  });

  it('updates an owned session and replaces its records', async () => {
    db.stored = DRAFT;
    const res = await put();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: 's1', name: 'Trip', members: ['Ana', 'Ben'] });
    expect(sent('delete from purchase_records')).toHaveLength(1);
    expect(sent('insert into purchase_records')).toHaveLength(2);
    expect(sent('commit')).toHaveLength(1);
  });

  it('never inserts a session, found or not', async () => {
    for (const stored of [null, DRAFT, CLOSED]) {
      db.stored = stored;
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

describe('PUT /api/sessions/:id on a finished session (BR-R1, E1-17)', () => {
  const closed = { ...SESSION, status: 'closed', closedAt: '2026-11-02T00:00:00.000Z' };

  it('sends no purchase_records statement, and never touches status, members or closed_at', async () => {
    db.stored = CLOSED;
    const res = await put({ ...closed, members: ['Zed'], records: [] });

    expect(res.statusCode).toBe(200);
    expect(db.statements.filter((s) => s.text.includes('purchase_records'))).toHaveLength(0);
    const [update] = sent('update expense_sessions');
    expect(update.text).toContain('name = ?');
    expect(update.text).toContain('activity_at = greatest');
    expect(update.text).toContain('me = ?');
    expect(update.text).not.toMatch(/status\s*=/);
    expect(update.text).not.toContain('members');
    expect(update.text).not.toContain('closed_at');
    expect(update.text).not.toContain('finished_with_collection');
    expect(sent('commit')).toHaveLength(1);
  });

  it('still takes a pick of an unclaimed member', async () => {
    db.stored = CLOSED;
    db.claimed = [];
    await put({ ...closed, me: 'Ben' });
    expect(sent('update expense_sessions')[0].values).toContain('Ben');
  });

  it('keeps the stored pick when the body names a member someone has joined as', async () => {
    db.stored = CLOSED;
    db.claimed = ['Ben'];
    await put({ ...closed, me: 'Ben' });
    const [update] = sent('update expense_sessions');
    expect(update.values).not.toContain('Ben');
    expect(update.values).toContain('Ana');
  });

  it('takes a draft save as before when the stored row is a draft, even if the body says closed', async () => {
    db.stored = DRAFT;
    await put(closed);
    expect(sent('delete from purchase_records')).toHaveLength(1);
    expect(sent('select member from session_participants')).toHaveLength(0);
  });

  it('answers with the stored session, not the body it was sent (B1)', async () => {
    db.stored = CLOSED;
    db.loaded = [{ id: 's1', members: ['Ana', 'Ben'], records: [] }];
    const res = await put({ ...closed, members: ['Zed'], records: [] });

    expect(res.body).toEqual({ id: 's1', members: ['Ana', 'Ben'], records: [] });
    expect(db.loadCalls).toEqual([['user_a', 's1']]);
  });

  it('still answers with the parsed draft when the stored row is a draft', async () => {
    db.stored = DRAFT;
    const res = await put(closed);
    expect(res.body).toMatchObject({ id: 's1', members: ['Ana', 'Ben'] });
    expect(db.loadCalls).toEqual([]);
  });
});
