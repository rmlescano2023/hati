import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/participants';

/** `DELETE /api/participants` against a faked database, as `invitesApi.test.ts` does. */

const db = vi.hoisted(() => ({
  userId: 'user_a' as string | null,
  /** What `lockSessionRole` answers. */
  role: null as { role: 'owner' } | { role: 'participant'; member: string } | null,
  /** The accounts the owner path's delete returns. */
  removed: [] as { user_id: string }[],
  statements: [] as { text: string; values: unknown[] }[],
}));

vi.mock('../../api/_shared.js', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.statements.push({ text, values });
    const rows = text.includes('returning user_id') ? db.removed : [];
    return Promise.resolve({ rows, rowCount: rows.length });
  };
  return {
    getUserId: async () => db.userId,
    lockSessionRole: async (_client: unknown, userId: string, sessionId: string) => {
      db.statements.push({ text: 'lockSessionRole', values: [userId, sessionId] });
      return db.role;
    },
    pool: { sql, connect: async () => ({ sql, release: () => {} }) },
  };
});

function response() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
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
    setHeader(k: string, v: string) {
      res.headers[k] = v;
      return res;
    },
  };
  return res;
}

async function call(query: Record<string, unknown>, method = 'DELETE') {
  const res = response();
  const req = { method, query, headers: {}, body: undefined };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const sent = (prefix: string) => db.statements.filter((s) => s.text.startsWith(prefix));
const Q = { sessionId: 'session_1', member: 'Ben' };

beforeEach(() => {
  db.userId = 'user_a';
  db.role = null;
  db.removed = [];
  db.statements = [];
});

describe('DELETE /api/participants', () => {
  it('lets the organizer remove any member, naming the session and the member', async () => {
    db.role = { role: 'owner' };
    const res = await call(Q);
    expect(res.statusCode).toBe(204);
    const [del] = sent('delete from session_participants');
    expect(del.text).toContain('session_id = ? and member = ?');
    expect(del.values).toEqual(['session_1', 'Ben']);
    expect(sent('commit')).toHaveLength(1);
  });

  it('lets a participant remove their own member, by their account', async () => {
    db.userId = 'user_b';
    db.role = { role: 'participant', member: 'Ben' };
    const res = await call(Q);
    expect(res.statusCode).toBe(204);
    const [del] = sent('delete from session_participants');
    expect(del.text).toContain('session_id = ? and user_id = ?');
    expect(del.values).toEqual(['session_1', 'user_b']);
  });

  it("is a 403 not_yours, with no delete, for a participant naming someone else's member", async () => {
    db.userId = 'user_b';
    db.role = { role: 'participant', member: 'Carla' };
    const res = await call(Q);
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ code: 'not_yours' });
    expect(sent('delete from')).toHaveLength(0);
    expect(sent('rollback')).toHaveLength(1);
  });

  it('is a 404 with no delete for an account with no relation to the session', async () => {
    db.role = null;
    const res = await call(Q);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'No such session.' });
    expect(sent('delete from')).toHaveLength(0);
  });

  it('locks the session before anything else in the transaction', async () => {
    db.role = { role: 'owner' };
    await call(Q);
    expect(db.statements.map((s) => s.text.split(' ')[0]).slice(0, 3)).toEqual([
      'begin',
      'lockSessionRole',
      'delete',
    ]);
  });

  it('is a 400 for a missing or repeated query value', async () => {
    expect((await call({ sessionId: 'session_1' })).statusCode).toBe(400);
    expect((await call({ sessionId: 'session_1', member: ['Ben', 'Ana'] })).statusCode).toBe(400);
    expect(db.statements).toHaveLength(0);
  });

  it('is a 401 without a user, and a 405 with Allow: DELETE for other methods', async () => {
    db.userId = null;
    expect((await call(Q)).statusCode).toBe(401);
    db.userId = 'user_a';
    const res = await call(Q, 'POST');
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('DELETE');
  });
});

describe('DELETE /api/participants and the claims (AC-29.1, AC-29.4, BR-C17)', () => {
  it("deletes the removed account's claims after the owner's delete returns who it was", async () => {
    db.role = { role: 'owner' };
    db.removed = [{ user_id: 'user_b' }];
    await call(Q);
    const names = db.statements.map((s) => s.text.split(' ').slice(0, 3).join(' '));
    expect(names.indexOf('delete from session_participants')).toBeLessThan(
      names.indexOf('delete from payment_claims'),
    );
    const [del] = sent('delete from payment_claims');
    expect(del.text).toContain('claimed_by = ?');
    expect(del.values).toEqual(['session_1', 'user_b']);
  });

  it('deletes no claims when the owner removes a member nobody joined as', async () => {
    db.role = { role: 'owner' };
    await call(Q);
    expect(sent('delete from payment_claims')).toHaveLength(0);
  });

  it("deletes the caller's own claims when a participant stops tracking", async () => {
    db.userId = 'user_b';
    db.role = { role: 'participant', member: 'Ben' };
    await call(Q);
    const [del] = sent('delete from payment_claims');
    expect(del.values).toEqual(['session_1', 'user_b']);
    expect(sent('commit')).toHaveLength(1);
  });

  it('never deletes claims by their creditor, so those sent to the member stay', async () => {
    db.role = { role: 'owner' };
    db.removed = [{ user_id: 'user_b' }];
    await call(Q);
    expect(sent('delete from payment_claims').every((s) => !s.text.includes('creditor'))).toBe(
      true,
    );
  });
});
