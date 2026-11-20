import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from '../../api/sessions/index';

/**
 * `GET /api/sessions` against a faked `_shared.js`, for the state header and the cheap "anything
 * changed?" check (round 3, item 5). The real `sessionsState` is used, so a check and a load that
 * see the same data must agree.
 */

const db = vi.hoisted(() => ({
  sessions: [] as unknown[],
  calls: [] as unknown[][],
}));

// The real `_shared.js` creates its pool on import, which needs no database here.
vi.mock('@vercel/postgres', () => ({ createPool: () => ({}) }));

vi.mock('../../api/_shared.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../api/_shared')>();
  return {
    ...real,
    getUserId: async () => 'user_a',
    ensureUser: async () => {},
    loadSessions: async (...args: unknown[]) => {
      db.calls.push(args);
      return db.sessions;
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

async function get(query: Record<string, unknown>) {
  const res = response();
  const req = { method: 'GET', query, headers: {} };
  await handler(req as unknown as VercelRequest, res as unknown as VercelResponse);
  return res;
}

const session = (over: Record<string, unknown> = {}) => ({
  id: 'session_1',
  name: 'Bali',
  activityAt: '2026-11-01T00:00:00.000Z',
  payments: [],
  ...over,
});

beforeEach(() => {
  db.sessions = [session()];
  db.calls = [];
});

describe('GET /api/sessions state (round 3, item 5)', () => {
  it('sets X-Hati-State on the full load and still sends the sessions', async () => {
    const res = await get({ joined: '1' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['X-Hati-State']).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(res.body).toEqual(db.sessions);
  });

  it('answers a check with only the state, equal to the load header for the same data', async () => {
    const full = await get({ joined: '1' });
    const check = await get({ joined: '1', check: '1' });
    expect(check.body).toEqual({ state: full.headers['X-Hati-State'] });
    expect(Array.isArray(check.body)).toBe(false);
    expect(check.headers['X-Hati-State']).toBeUndefined();
  });

  it('changes the state when what a viewer can see changes, and not for activity alone', async () => {
    const before = (await get({ joined: '1', check: '1' })).body as { state: string };
    db.sessions = [session({ activityAt: '2026-11-09T00:00:00.000Z' })];
    expect(((await get({ joined: '1', check: '1' })).body as { state: string }).state).toBe(
      before.state,
    );
    db.sessions = [session({ payments: [{ id: 'p1' }] })];
    expect(((await get({ joined: '1', check: '1' })).body as { state: string }).state).not.toBe(
      before.state,
    );
  });

  it('computes over owned sessions only without joined=1, and ignores a check without it being 1', async () => {
    await get({ check: '1' });
    expect(db.calls[0]).toEqual(['user_a', null, false]);
    await get({ joined: '1', check: 'yes' });
    expect(Array.isArray((await get({ joined: '1', check: 'yes' })).body)).toBe(true);
  });
});
