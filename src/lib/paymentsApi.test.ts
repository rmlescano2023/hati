import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/payments/index';
import byId from '../../api/payments/[id]';

/**
 * The two payments routes against a faked database, for what a participant may do (BR-C3, BR-C4),
 * the cap that counts pending claims (BR-C13), and the ledger a 409 may carry (RC-7). Ben owes
 * Ana ₱500.
 */

const db = vi.hoisted(() => ({
  userId: 'user_a' as string | null,
  access: null as { role: 'owner' } | { role: 'participant'; member: string } | null,
  status: 'closed',
  ledger: { payments: [] as unknown[], claims: [] as unknown[] },
  session: null as unknown,
  claimIdHits: [] as unknown[],
  /** `select session_id from session_payments where id`, then the creditor re-read. */
  found: [] as unknown[],
  creditorRow: [] as unknown[],
  insertCount: 1,
  statements: [] as { text: string; values: unknown[] }[],
}));

vi.mock('../../api/_shared.js', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.statements.push({ text, values });
    let rows: unknown[] = [];
    let rowCount = 0;
    if (text.startsWith('select status from expense_sessions')) rows = [{ status: db.status }];
    else if (text.startsWith('select id from payment_claims where id = any')) rows = db.claimIdHits;
    else if (text.startsWith('select session_id from session_payments')) rows = db.found;
    else if (text.startsWith('select creditor from session_payments')) rows = db.creditorRow;
    if (text.startsWith('insert into session_payments')) rowCount = db.insertCount;
    return Promise.resolve({ rows, rowCount: rows.length || rowCount });
  };
  return {
    getUserId: async () => db.userId,
    lockSessionRole: async (_c: unknown, userId: string, sessionId: string) => {
      db.statements.push({ text: 'lockSessionRole', values: [userId, sessionId] });
      return db.access;
    },
    loadLedger: async () => db.ledger,
    loadSessions: async (...args: unknown[]) => {
      db.statements.push({ text: 'loadSessions', values: args });
      return [db.session];
    },
    pool: { sql, connect: async () => ({ sql, release: () => {} }) },
  };
});

function response() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    json(b: unknown) {
      res.body = b;
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

async function call(
  fn: unknown,
  method: string,
  input: { body?: unknown; query?: Record<string, unknown> },
) {
  const res = response();
  const req = { method, headers: {}, query: input.query ?? {}, body: input.body };
  await (fn as (a: VercelRequest, b: VercelResponse) => Promise<unknown>)(
    req as unknown as VercelRequest,
    res as unknown as VercelResponse,
  );
  return res;
}

const sent = (prefix: string) => db.statements.filter((s) => s.text.startsWith(prefix));
const entry = (over: Record<string, unknown> = {}) => ({
  id: 'pay_p1',
  debtor: 'Ben',
  creditor: 'Ana',
  amountCents: 10000,
  ...over,
});
const post = (payments: unknown[]) =>
  call(handler, 'POST', { body: { sessionId: 'session_1', payments } });
const ledgerClaim = (over: Record<string, unknown> = {}) => ({
  id: 'pay_c1',
  debtor: 'Ben',
  creditor: 'Ana',
  amountCents: 20000,
  createdAt: '2026-11-03T00:00:00.000Z',
  status: 'pending',
  decidedAt: null,
  claimedBy: 'user_b',
  ...over,
});

beforeEach(() => {
  db.userId = 'user_a';
  db.access = { role: 'owner' };
  db.status = 'closed';
  db.ledger = { payments: [], claims: [] };
  db.session = {
    members: ['Ana', 'Ben', 'Carla'],
    records: [
      {
        id: 'r1',
        date: '2026-11-01',
        payorMode: 'single',
        payors: [{ member: 'Ana', amount: 0 }],
        items: [
          { id: 'i1', mode: 'equal', name: 'Dinner', totalPrice: 1000, owners: ['Ana', 'Ben'] },
        ],
        createdAt: '2026-11-01T01:00:00.000Z',
      },
    ],
  };
  db.claimIdHits = [];
  db.found = [];
  db.creditorRow = [];
  db.insertCount = 1;
  db.statements = [];
});

describe('POST /api/payments', () => {
  it('records for the organizer as before, and reads the session with joined sessions included', async () => {
    const res = await post([entry()]);
    expect(res.statusCode).toBe(201);
    expect(sent('insert into session_payments')).toHaveLength(1);
    expect(sent('loadSessions')[0].values).toEqual(['user_a', 'session_1', true]);
  });

  it('locks the session first thing in the transaction', async () => {
    await post([entry()]);
    expect(db.statements.slice(0, 2).map((s) => s.text.split(' ')[0])).toEqual([
      'begin',
      'lockSessionRole',
    ]);
  });

  it('lets a participant creditor record on their own line (AC-26.1)', async () => {
    db.userId = 'user_a2';
    db.access = { role: 'participant', member: 'Ana' };
    expect((await post([entry()])).statusCode).toBe(201);
  });

  it('is a 403 not_your_line for a participant on a line they owe (AC-26.5), before anything is read', async () => {
    db.access = { role: 'participant', member: 'Ben' };
    const res = await post([entry()]);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'not_your_line' });
    expect(sent('insert into session_payments')).toHaveLength(0);
    expect(sent('select status')).toHaveLength(0);
  });

  it('is a 404 with no relation', async () => {
    db.access = null;
    expect((await post([entry()])).statusCode).toBe(404);
  });

  it('caps even the organizer at what is open when a claim is pending (BR-C13, E2-2)', async () => {
    db.ledger = { payments: [], claims: [ledgerClaim({ amountCents: 20000 })] };
    // 50000 owed, 20000 pending: 30000 open.
    expect((await post([entry({ amountCents: 30000 })])).statusCode).toBe(201);
    db.statements = [];
    const res = await post([entry({ amountCents: 30001 })]);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'over_remaining',
      error: 'Only ₱300.00 is left on this line.',
    });
    expect(sent('insert into session_payments')).toHaveLength(0);
  });

  it('words the cap when pending covers the rest, and when it is paid in full', async () => {
    db.ledger = { payments: [], claims: [ledgerClaim({ amountCents: 50000 })] };
    expect((await post([entry()])).body).toMatchObject({
      error: "What's left on this line is already waiting for confirmation.",
    });
    db.ledger = {
      payments: [{ id: 'p', debtor: 'Ben', creditor: 'Ana', amountCents: 50000, createdAt: 'x' }],
      claims: [],
    };
    expect((await post([entry()])).body).toMatchObject({
      error: 'This line is already paid in full.',
    });
  });

  it('is a 409 id_conflict for an id that is a claim', async () => {
    db.claimIdHits = [{ id: 'pay_p1' }];
    const res = await post([entry()]);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'id_conflict' });
    expect(sent('insert into session_payments')).toHaveLength(0);
  });

  it("carries only a participant's own lines in a 409 body (RC-7)", async () => {
    db.access = { role: 'participant', member: 'Ana' };
    db.ledger = {
      payments: [
        { id: 'p_mine', debtor: 'Ben', creditor: 'Ana', amountCents: 40000, createdAt: 'x' },
        { id: 'p_other', debtor: 'Carla', creditor: 'Ben', amountCents: 100, createdAt: 'x' },
      ],
      claims: [
        ledgerClaim({ id: 'c_mine' }),
        ledgerClaim({ id: 'c_other', debtor: 'Carla', creditor: 'Ben', claimedBy: 'user_c' }),
      ],
    };
    const res = await post([entry({ amountCents: 20000 })]);
    expect(res.statusCode).toBe(409);
    const body = res.body as { payments: { id: string }[]; claims: { id: string }[] };
    expect(body.payments.map((p) => p.id)).toEqual(['p_mine']);
    expect(body.claims.map((c) => c.id)).toEqual(['c_mine']);
    expect(JSON.stringify(body)).not.toContain('claimedBy');
  });

  it('takes a retry of a stored payment as done', async () => {
    db.ledger = {
      payments: [
        { id: 'pay_p1', debtor: 'Ben', creditor: 'Ana', amountCents: 10000, createdAt: 'x' },
      ],
      claims: [],
    };
    expect((await post([entry()])).statusCode).toBe(201);
    expect(sent('insert into session_payments')).toHaveLength(0);
  });
});

describe('DELETE /api/payments?sessionId=', () => {
  const undoAll = () => call(handler, 'DELETE', { query: { sessionId: 'session_1' } });

  it('is the organizer only: a participant gets 403 organizer_only, and no relation 404', async () => {
    db.access = { role: 'participant', member: 'Ana' };
    const res = await undoAll();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'organizer_only' });
    expect(sent('delete from session_payments')).toHaveLength(0);
    db.access = null;
    expect((await undoAll()).statusCode).toBe(404);
  });

  it('deletes for the owner, in a transaction that locks first', async () => {
    const res = await undoAll();
    expect(res.statusCode).toBe(204);
    expect(db.statements.map((s) => s.text.split(' ')[0]).slice(0, 3)).toEqual([
      'begin',
      'lockSessionRole',
      'delete',
    ]);
    expect(sent('commit')).toHaveLength(1);
  });
});

describe('DELETE /api/payments/:id', () => {
  const undo = () => call(byId, 'DELETE', { query: { id: 'pay_p1' } });

  beforeEach(() => {
    db.found = [{ session_id: 'session_1' }];
    db.creditorRow = [{ creditor: 'Ana' }];
  });

  it('lets a participant creditor undo on their own line (AC-26.4)', async () => {
    db.access = { role: 'participant', member: 'Ana' };
    expect((await undo()).statusCode).toBe(204);
    expect(sent('delete from session_payments')).toHaveLength(1);
  });

  it('is a 403 not_your_line for a participant debtor (AC-26.5)', async () => {
    db.access = { role: 'participant', member: 'Ben' };
    const res = await undo();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'not_your_line' });
    expect(sent('delete from session_payments')).toHaveLength(0);
  });

  it('is a 404 for no relation, in the same words as a payment that does not exist', async () => {
    db.access = null;
    const none = await undo();
    db.found = [];
    const missing = await undo();
    expect(none.statusCode).toBe(404);
    expect(none.body).toEqual(missing.body);
  });

  it('locks the session before the delete', async () => {
    await undo();
    const names = db.statements.map((s) => s.text.split(' ')[0]);
    expect(names.indexOf('lockSessionRole')).toBeLessThan(names.indexOf('delete'));
    expect(names.indexOf('begin')).toBeLessThan(names.indexOf('lockSessionRole'));
  });

  it('lets the owner undo any payment', async () => {
    expect((await undo()).statusCode).toBe(204);
  });
});
