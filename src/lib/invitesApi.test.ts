import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/invites';
import { isInviteToken } from './joinedSessions';

/**
 * `POST /api/invites` against a faked database, so the access rules are checked by what SQL it
 * sends and in what order. The tests live here rather than under `api/`, because Vercel would
 * deploy anything there as a function.
 */

const TOKEN = 'abcdefghijklmnopqrstuv';

const db = vi.hoisted(() => ({
  userId: 'user_b' as string | null,
  /** The token the link's update finds already stored, or null when it mints one. */
  existingToken: null as string | null,
  /** Whether the link's update matches a row at all (owner, closed). */
  linkMatches: true,
  /** The token lookup's row, or none. */
  lookup: null as Record<string, unknown> | null,
  dates: [] as { date: string }[],
  joiners: [] as { user_id: string; member: string }[],
  statements: [] as { text: string; values: unknown[] }[],
  loaded: [] as unknown[][],
}));

vi.mock('../../api/_shared.js', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.statements.push({ text, values });
    let rows: unknown[] = [];
    if (text.startsWith('update expense_sessions set invite_token')) {
      const [reset, fresh] = values as [boolean, string];
      const token = reset || db.existingToken === null ? fresh : db.existingToken;
      rows = db.linkMatches ? [{ invite_token: token }] : [];
    } else if (text.includes('where s.invite_token')) {
      rows = db.lookup ? [db.lookup] : [];
    } else if (text.startsWith('select date::text')) {
      rows = db.dates;
    } else if (text.startsWith('select user_id, member from session_participants')) {
      rows = db.joiners;
    }
    return Promise.resolve({ rows, rowCount: rows.length });
  };
  return {
    getUserId: async () => db.userId,
    ensureUser: async () => {
      db.statements.push({ text: 'ensureUser', values: [] });
    },
    iso: (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v)),
    loadSessions: async (...args: unknown[]) => {
      db.statements.push({ text: 'loadSessions', values: args });
      return db.loaded.length > 0
        ? db.loaded
        : [{ id: 'session_1', participants: [{ member: 'Ben', name: 'Benny', joinedAt: 'x' }] }];
    },
    pool: {
      sql,
      connect: async () => ({ sql, release: () => {} }),
    },
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

async function call(body: unknown, over: Record<string, unknown> = {}) {
  const res = response();
  const req = { method: 'POST', query: {}, headers: {}, body, ...over };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const sent = (prefix: string) => db.statements.filter((s) => s.text.startsWith(prefix));
const order = () => db.statements.map((s) => s.text.split(' ').slice(0, 3).join(' '));

const lookupRow = (over: Record<string, unknown> = {}) => ({
  id: 'session_1',
  user_id: 'user_a',
  name: 'Bali Trip',
  created_at: new Date('2026-11-01T00:00:00.000Z'),
  closed_at: new Date('2026-11-02T00:00:00.000Z'),
  members: ['Ana', 'Ben', 'Carla'],
  me: 'Ana',
  organizer_name: 'Ana',
  ...over,
});

beforeEach(() => {
  db.userId = 'user_b';
  db.existingToken = null;
  db.linkMatches = true;
  db.lookup = lookupRow();
  db.dates = [{ date: '2026-11-01' }];
  db.joiners = [];
  db.statements = [];
  db.loaded = [];
});

describe('POST /api/invites: the link', () => {
  it('scopes the update to the session, the signed-in user and a finished session', async () => {
    db.userId = 'user_a';
    await call({ sessionId: 'session_1' });
    const [update] = sent('update expense_sessions');
    expect(update.text).toContain("status = 'closed'");
    expect(update.values).toContain('session_1');
    expect(update.values).toContain('user_a');
  });

  it('is a 404 when no row matches: another account, a participant, a draft, a deleted session', async () => {
    db.linkMatches = false;
    const res = await call({ sessionId: 'session_1' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'No such session.' });
    expect(sent('loadSessions')).toHaveLength(0);
  });

  it('returns a minted token and the participants', async () => {
    db.userId = 'user_a';
    const res = await call({ sessionId: 'session_1' });
    expect(res.statusCode).toBe(200);
    const body = res.body as { token: string; participants: unknown[] };
    expect(isInviteToken(body.token)).toBe(true);
    expect(body.participants).toEqual([{ member: 'Ben', name: 'Benny', joinedAt: 'x' }]);
  });

  it('keeps the stored token when asked again, and sends the reset branch on a reset', async () => {
    db.userId = 'user_a';
    db.existingToken = TOKEN;
    expect((await call({ sessionId: 'session_1' })).body).toMatchObject({ token: TOKEN });
    expect(sent('update expense_sessions')[0].values[0]).toBe(false);

    const reset = await call({ sessionId: 'session_1', reset: true });
    expect(sent('update expense_sessions')[1].values[0]).toBe(true);
    expect((reset.body as { token: string }).token).not.toBe(TOKEN);
  });

  it('is organizer-only: it takes no transaction', async () => {
    await call({ sessionId: 'session_1' });
    expect(sent('begin')).toHaveLength(0);
  });
});

describe('POST /api/invites: preview', () => {
  it('is a 404 with dead_link for an unknown token', async () => {
    db.lookup = null;
    const res = await call({ token: TOKEN });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "This link doesn't work any more.", code: 'dead_link' });
  });

  it('tells the organizer it is their own session', async () => {
    db.userId = 'user_a';
    const res = await call({ token: TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ outcome: 'own', sessionId: 'session_1', title: 'Bali Trip' });
  });

  it('tells a participant they already joined, and as whom', async () => {
    db.joiners = [{ user_id: 'user_b', member: 'Ben' }];
    const res = await call({ token: TOKEN });
    expect(res.body).toEqual({
      outcome: 'already',
      sessionId: 'session_1',
      title: 'Bali Trip',
      member: 'Ben',
    });
  });

  it("offers anyone else the session, with the organizer's member and the claimed ones on Hati", async () => {
    db.joiners = [{ user_id: 'user_c', member: 'Carla' }];
    const res = await call({ token: TOKEN });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      outcome: 'open',
      preview: {
        sessionId: 'session_1',
        title: 'Bali Trip',
        closedAt: '2026-11-02T00:00:00.000Z',
        members: ['Ana', 'Ben', 'Carla'],
        onHati: ['Ana', 'Carla'],
        organizerName: 'Ana',
      },
    });
  });

  it('only reads a finished session by its token, and takes no lock or transaction', async () => {
    await call({ token: TOKEN });
    const [lookup] = db.statements.filter((s) => s.text.includes('where s.invite_token'));
    expect(lookup.text).toContain("s.status = 'closed'");
    expect(lookup.values).toEqual([TOKEN]);
    expect(db.statements.some((s) => s.text.includes('for update'))).toBe(false);
    expect(sent('begin')).toHaveLength(0);
    expect(sent('ensureUser')).toHaveLength(0);
  });
});

describe('POST /api/invites: join', () => {
  it('locks first, reads who has joined, inserts, then commits, in that order', async () => {
    const res = await call({ token: TOKEN, member: 'Ben' });
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ outcome: 'joined' });
    expect(order()).toEqual([
      'ensureUser',
      'begin',
      'select s.id, s.user_id,',
      'select date::text as',
      'select user_id, member',
      'insert into session_participants',
      'commit',
      'loadSessions',
    ]);
    const lookup = db.statements.find((s) => s.text.includes('where s.invite_token'))!;
    expect(lookup.text).toMatch(/for update of s$/);
    expect(sent('insert into session_participants')[0].values).toEqual([
      'session_1',
      'user_b',
      'Ben',
    ]);
  });

  it('runs ensureUser before the transaction begins', async () => {
    await call({ token: TOKEN, member: 'Ben' });
    expect(order().indexOf('ensureUser')).toBeLessThan(order().indexOf('begin'));
  });

  it('reads the joined session back as the participant, narrowed to this one', async () => {
    await call({ token: TOKEN, member: 'Ben' });
    expect(sent('loadSessions')[0].values).toEqual(['user_b', 'session_1', true]);
  });

  it.each([
    ['a member someone has claimed', 'Carla', [{ user_id: 'user_c', member: 'Carla' }]],
    ["the organizer's own member", 'Ana', []],
    ['a name that is not a member', 'Zed', []],
  ])(
    'is a 409 taken, with a fresh preview and no insert, for %s',
    async (_what, member, joiners) => {
      db.joiners = joiners;
      const res = await call({ token: TOKEN, member });
      expect(res.statusCode).toBe(409);
      expect(res.body).toMatchObject({ code: 'taken', preview: { sessionId: 'session_1' } });
      expect(sent('insert into session_participants')).toHaveLength(0);
      expect(sent('commit')).toHaveLength(0);
      expect(sent('rollback')).toHaveLength(1);
    },
  );

  it('is a 404 dead_link for a dead token, and rolls back', async () => {
    db.lookup = null;
    const res = await call({ token: TOKEN, member: 'Ben' });
    expect(res.statusCode).toBe(404);
    expect(res.body).toMatchObject({ code: 'dead_link' });
    expect(sent('rollback')).toHaveLength(1);
  });

  it('answers own and already without inserting', async () => {
    db.userId = 'user_a';
    expect((await call({ token: TOKEN, member: 'Ben' })).body).toMatchObject({ outcome: 'own' });
    db.userId = 'user_b';
    db.joiners = [{ user_id: 'user_b', member: 'Ben' }];
    expect((await call({ token: TOKEN, member: 'Carla' })).body).toMatchObject({
      outcome: 'already',
    });
    expect(sent('insert into session_participants')).toHaveLength(0);
  });
});

describe('POST /api/invites: the request', () => {
  it('is a 401 without a user, and touches no database', async () => {
    db.userId = null;
    const res = await call({ token: TOKEN });
    expect(res.statusCode).toBe(401);
    expect(db.statements).toHaveLength(0);
  });

  it('is a 405 with Allow: POST for any other method', async () => {
    const res = await call(undefined, { method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('is a 400 for a malformed body', async () => {
    const res = await call({ token: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Malformed invite request.' });
    expect(db.statements).toHaveLength(0);
  });

  it('reads a JSON string body', async () => {
    const res = await call(JSON.stringify({ token: TOKEN }));
    expect(res.statusCode).toBe(200);
  });

  it('never reads a token from the query string', async () => {
    const res = await call({}, { query: { token: TOKEN, member: 'Ben' } });
    expect(res.statusCode).toBe(400);
    expect(db.statements).toHaveLength(0);
  });
});
