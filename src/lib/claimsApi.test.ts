import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/claims';

/**
 * `/api/claims` against a faked database, so the access rules, the caps and the order of the
 * locks are checked by what SQL it sends. Ben owes Ana ₱500 (and Carla ₱300 in some cases).
 */

type Access = { role: 'owner' } | { role: 'participant'; member: string } | null;

const db = vi.hoisted(() => ({
  userId: 'user_b' as string | null,
  access: null as { role: 'owner' } | { role: 'participant'; member: string } | null,
  status: 'closed',
  /** What `loadLedger` answers: raw rows, with who sent each claim. */
  ledger: { payments: [] as unknown[], claims: [] as unknown[] },
  /** What `loadSessions` answers. */
  session: null as unknown,
  paymentIdHits: [] as unknown[],
  claimIdHits: [] as unknown[],
  /** `select session_id from payment_claims where id` and the same for payments. */
  claimSession: [] as unknown[],
  paymentSession: [] as unknown[],
  /** The claim re-read under the lock. */
  claimRow: [] as unknown[],
  /** A payment with this id in this session. */
  paymentRow: [] as unknown[],
  claimedBy: [] as unknown[],
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
    else if (text.startsWith('select id from session_payments where id = any'))
      rows = db.paymentIdHits;
    else if (text.startsWith('select id from payment_claims where id = any')) rows = db.claimIdHits;
    else if (text.startsWith('select session_id from payment_claims')) rows = db.claimSession;
    else if (text.startsWith('select session_id from session_payments')) rows = db.paymentSession;
    else if (
      text.startsWith(
        'select id, debtor, creditor, amount_cents, status, created_at from payment_claims',
      )
    )
      rows = db.claimRow;
    else if (text.startsWith('select id from session_payments where id = ? and session_id'))
      rows = db.paymentRow;
    else if (text.startsWith('select creditor from session_payments')) rows = db.paymentRow;
    else if (text.startsWith('select claimed_by from payment_claims')) rows = db.claimedBy;
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
    headers: {} as Record<string, string>,
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
    setHeader(k: string, v: string) {
      res.headers[k] = v;
      return res;
    },
  };
  return res;
}

async function call(method: string, input: { body?: unknown; query?: Record<string, unknown> }) {
  const res = response();
  const req = { method, headers: {}, query: input.query ?? {}, body: input.body };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const sent = (prefix: string) => db.statements.filter((s) => s.text.startsWith(prefix));
const claim = (over: Record<string, unknown> = {}) => ({
  id: 'pay_c1',
  debtor: 'Ben',
  creditor: 'Ana',
  amountCents: 20000,
  ...over,
});
const post = (claims: unknown[], over: Record<string, unknown> = {}) =>
  call('POST', { body: { sessionId: 'session_1', claims, ...over } });

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

const as = (access: Access, userId = 'user_b') => {
  db.access = access;
  db.userId = userId;
};
const BEN: Access = { role: 'participant', member: 'Ben' };
const ANA: Access = { role: 'participant', member: 'Ana' };

beforeEach(() => {
  db.userId = 'user_b';
  db.access = BEN;
  db.status = 'closed';
  db.ledger = { payments: [], claims: [] };
  db.session = {
    id: 'session_1',
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
  db.paymentIdHits = [];
  db.claimIdHits = [];
  db.claimSession = [];
  db.paymentSession = [];
  db.claimRow = [];
  db.paymentRow = [];
  db.claimedBy = [];
  db.insertCount = 1;
  db.statements = [];
});

describe('POST /api/claims', () => {
  it('is a 404 with no relation, and a 403 organizer_records for the organizer', async () => {
    as(null);
    expect((await post([claim()])).statusCode).toBe(404);
    as({ role: 'owner' }, 'user_a');
    const res = await post([claim()]);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'organizer_records' });
    expect(sent('insert into payment_claims')).toHaveLength(0);
  });

  it("is a 403 not_your_line for a claim on someone else's debt", async () => {
    const res = await post([claim({ debtor: 'Carla' })]);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'not_your_line' });
  });

  it('begins and locks the session before anything else', async () => {
    await post([claim()]);
    expect(db.statements.slice(0, 2).map((s) => s.text.split(' ')[0])).toEqual([
      'begin',
      'lockSessionRole',
    ]);
  });

  it('inserts a claim with the caller as the sender, then commits (AC-20.3)', async () => {
    const res = await post([claim()]);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({ ids: ['pay_c1'] });
    const [insert] = sent('insert into payment_claims');
    expect(insert.values).toEqual(['pay_c1', 'session_1', 'Ben', 'Ana', 20000, 'user_b']);
    expect(sent('commit')).toHaveLength(1);
  });

  it('takes a retry of its own claim as done, with no insert', async () => {
    db.ledger = { payments: [], claims: [ledgerClaim()] };
    const res = await post([claim()]);
    expect(res.statusCode).toBe(201);
    expect(sent('insert into payment_claims')).toHaveLength(0);
    expect(sent('commit')).toHaveLength(1);
  });

  it('takes an id already confirmed as the same pair and amount as done', async () => {
    db.ledger = {
      payments: [
        { id: 'pay_c1', debtor: 'Ben', creditor: 'Ana', amountCents: 20000, createdAt: 'x' },
      ],
      claims: [],
    };
    const res = await post([claim()]);
    expect(res.statusCode).toBe(201);
    expect(sent('insert into payment_claims')).toHaveLength(0);
  });

  it('is a 409 id_conflict for an id in either table otherwise', async () => {
    db.claimIdHits = [{ id: 'pay_c1' }];
    expect((await post([claim()])).body).toMatchObject({ code: 'id_conflict' });
    db.claimIdHits = [];
    db.paymentIdHits = [{ id: 'pay_c1' }];
    expect((await post([claim()])).statusCode).toBe(409);
    db.ledger = { payments: [], claims: [ledgerClaim({ claimedBy: 'user_other' })] };
    db.paymentIdHits = [{ id: 'pay_c1' }];
    expect((await post([claim()])).statusCode).toBe(409);
    expect(sent('insert into payment_claims')).toHaveLength(0);
  });

  it('is a 409 over_remaining over what is open, with each message and only the caller ledger', async () => {
    db.ledger = {
      payments: [
        { id: 'p_other', debtor: 'Carla', creditor: 'Ana', amountCents: 100, createdAt: 'x' },
        { id: 'p_mine', debtor: 'Ben', creditor: 'Ana', amountCents: 10000, createdAt: 'x' },
      ],
      claims: [
        ledgerClaim({ id: 'pay_old', amountCents: 25000 }),
        ledgerClaim({ id: 'pay_carla', debtor: 'Carla', claimedBy: 'user_c' }),
      ],
    };
    // 50000 owed, 10000 paid, 25000 pending: 15000 open.
    const res = await post([claim({ amountCents: 15001 })]);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'over_remaining',
      error: 'Only ₱150.00 is left on this line.',
    });
    const body = res.body as { payments: { id: string }[]; claims: { id: string }[] };
    expect(body.payments.map((p) => p.id)).toEqual(['p_mine']);
    expect(body.claims.map((c) => c.id)).toEqual(['pay_old']);
    expect(JSON.stringify(body)).not.toContain('claimedBy');

    db.ledger = { payments: [], claims: [ledgerClaim({ id: 'pay_old', amountCents: 50000 })] };
    expect((await post([claim()])).body).toMatchObject({
      error: "What's left on this line is already waiting for confirmation.",
    });
    db.ledger = {
      payments: [{ id: 'p', debtor: 'Ben', creditor: 'Ana', amountCents: 50000, createdAt: 'x' }],
      claims: [],
    };
    expect((await post([claim()])).body).toMatchObject({
      error: 'This line is already paid in full.',
    });
    expect(sent('insert into payment_claims')).toHaveLength(0);
  });

  it('is a 409 not_a_line for a pair that is not a settlement line', async () => {
    const res = await post([claim({ creditor: 'Carla' })]);
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'not_a_line' });
  });

  it('is all or nothing: one bad entry in a batch inserts none', async () => {
    const res = await post([claim(), claim({ id: 'pay_c2', creditor: 'Carla' })]);
    expect(res.statusCode).toBe(409);
    expect(sent('insert into payment_claims')).toHaveLength(0);
    expect(sent('rollback')).toHaveLength(1);
  });

  it('is a 400 for a malformed body, and a 401 without a user', async () => {
    expect((await call('POST', { body: { sessionId: 'session_1', claims: [] } })).statusCode).toBe(
      400,
    );
    expect(db.statements).toHaveLength(0);
    db.userId = null;
    expect((await post([claim()])).statusCode).toBe(401);
  });
});

describe('PATCH /api/claims', () => {
  const decide = (decision: string, id = 'pay_c1') => call('PATCH', { body: { id, decision } });
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'pay_c1',
    debtor: 'Ben',
    creditor: 'Ana',
    amount_cents: 20000,
    status: 'pending',
    created_at: new Date('2026-11-03T00:00:00.000Z'),
    ...over,
  });

  beforeEach(() => {
    db.claimSession = [{ session_id: 'session_1' }];
    db.claimRow = [row()];
    as(ANA, 'user_a');
  });

  it('lets the creditor participant confirm: the payment keeps the id and time, the claim goes (BR-C7)', async () => {
    const res = await decide('confirm');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ decision: 'confirm' });
    const [insert] = sent('insert into session_payments');
    expect(insert.values).toEqual([
      'pay_c1',
      'session_1',
      'Ben',
      'Ana',
      20000,
      '2026-11-03T00:00:00.000Z',
    ]);
    expect(sent('delete from payment_claims')).toHaveLength(1);
    const order = db.statements.map((s) => s.text.split(' ').slice(0, 2).join(' '));
    expect(order.indexOf('insert into')).toBeLessThan(order.indexOf('delete from'));
    expect(sent('commit')).toHaveLength(1);
  });

  it('is a 403 not_decider for another participant and for the debtor deciding their own', async () => {
    as({ role: 'participant', member: 'Carla' }, 'user_c');
    expect((await decide('confirm')).body).toMatchObject({ code: 'not_decider' });
    as(BEN);
    const res = await decide('confirm');
    expect(res.statusCode).toBe(403);
    expect(sent('insert into session_payments')).toHaveLength(0);
  });

  it('lets the owner decide any claim', async () => {
    as({ role: 'owner' }, 'user_a');
    db.claimRow = [row({ creditor: 'Carla' })];
    db.session = { ...(db.session as object), members: ['Ana', 'Ben', 'Carla'] };
    // Ben owes Carla nothing here, so a decline is the owner's call.
    expect((await decide('decline')).statusCode).toBe(200);
  });

  it('is a 409 over_remaining naming the debtor when less is left than the claim (AC-21.5, BR-C12)', async () => {
    db.ledger = {
      payments: [{ id: 'p1', debtor: 'Ben', creditor: 'Ana', amountCents: 40000, createdAt: 'x' }],
      claims: [ledgerClaim()],
    };
    const res = await decide('confirm');
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'over_remaining',
      error:
        "Only ₱100.00 is left on this line, so this can't be confirmed. Decline it, or ask Ben to withdraw it and send what's left.",
    });
    expect(sent('insert into session_payments')).toHaveLength(0);
  });

  it('says so when the line is already paid in full', async () => {
    db.ledger = {
      payments: [{ id: 'p1', debtor: 'Ben', creditor: 'Ana', amountCents: 50000, createdAt: 'x' }],
      claims: [ledgerClaim()],
    };
    expect((await decide('confirm')).body).toMatchObject({
      error: "This line is already paid in full, so this can't be confirmed. Decline it.",
    });
  });

  it('answers 200 to a replayed confirm', async () => {
    db.claimRow = [];
    db.paymentRow = [{ id: 'pay_c1' }];
    const res = await decide('confirm');
    expect(res.statusCode).toBe(200);
    expect(sent('insert into session_payments')).toHaveLength(0);
  });

  it('declines by marking it declined with the time', async () => {
    const res = await decide('decline');
    expect(res.body).toEqual({ decision: 'decline' });
    const [update] = sent('update payment_claims');
    expect(update.text).toContain("status = 'declined'");
    expect(update.text).toContain('decided_at = now()');
    expect(sent('insert into session_payments')).toHaveLength(0);
  });

  it('is a 409 not_pending for a declined claim', async () => {
    db.claimRow = [row({ status: 'declined' })];
    expect((await decide('confirm')).body).toMatchObject({ code: 'not_pending' });
  });

  it('is a 404 not_pending for a withdrawn claim, and a 409 already_confirmed when declining a confirmed one', async () => {
    db.claimSession = [];
    expect((await decide('confirm')).body).toMatchObject({ code: 'not_pending' });
    db.claimSession = [{ session_id: 'session_1' }];
    db.claimRow = [];
    db.paymentRow = [];
    expect((await decide('confirm')).statusCode).toBe(404);
    db.paymentRow = [{ id: 'pay_c1' }];
    const res = await decide('decline');
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'already_confirmed' });
  });

  it('is a 409 id_conflict when the payment id is taken', async () => {
    db.insertCount = 0;
    expect((await decide('confirm')).body).toMatchObject({ code: 'id_conflict' });
  });

  it('finds the session with a plain read, then locks it first thing in the transaction, and is a 404 with no relation', async () => {
    await decide('decline');
    const names = db.statements.map((s) => s.text.split(' ')[0]);
    expect(names[names.indexOf('begin') + 1]).toBe('lockSessionRole');
    as(null);
    expect((await decide('decline')).statusCode).toBe(404);
  });
});

describe('DELETE /api/claims', () => {
  const del = () => call('DELETE', { query: { id: 'pay_c1' } });

  beforeEach(() => {
    db.claimSession = [{ session_id: 'session_1' }];
    db.claimedBy = [{ claimed_by: 'user_b' }];
  });

  it('lets the sender withdraw or dismiss (204)', async () => {
    const res = await del();
    expect(res.statusCode).toBe(204);
    expect(sent('delete from payment_claims')).toHaveLength(1);
    expect(sent('commit')).toHaveLength(1);
  });

  it('is a 403 not_yours for anyone else related, the organizer included', async () => {
    as(ANA, 'user_a');
    expect((await del()).body).toMatchObject({ code: 'not_yours' });
    as({ role: 'owner' }, 'user_o');
    expect((await del()).statusCode).toBe(403);
    expect(sent('delete from payment_claims')).toHaveLength(0);
  });

  it('is a 409 already_confirmed naming the creditor when it became a payment (AC-24.3)', async () => {
    db.claimedBy = [];
    db.paymentRow = [{ creditor: 'Ana' }];
    const res = await del();
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      code: 'already_confirmed',
      error: 'Ana has already confirmed this payment.',
    });
  });

  it('is a 404 when there is no such claim, and a 204 when it went under the lock', async () => {
    db.claimSession = [];
    expect((await del()).statusCode).toBe(404);
    db.claimSession = [{ session_id: 'session_1' }];
    db.claimedBy = [];
    db.paymentRow = [];
    expect((await del()).statusCode).toBe(204);
  });

  it('is a 400 for a missing or repeated id, and a 405 with Allow for other methods', async () => {
    expect((await call('DELETE', { query: { id: ['pay_c1'] } })).statusCode).toBe(400);
    const res = await call('GET', {});
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST, PATCH, DELETE');
  });
});
