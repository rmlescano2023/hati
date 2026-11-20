import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSessions } from '../../api/_shared';

/**
 * RC-1, the privacy-sensitive path: what a participant is sent. `@vercel/postgres` is faked, so
 * every statement `loadSessions` sends is recorded and answered from scripted rows, and the
 * checks are on what was asked and what came back.
 */

const db = vi.hoisted(() => ({
  statements: [] as { text: string; values: unknown[] }[],
  owned: [] as Record<string, unknown>[],
  joined: [] as Record<string, unknown>[],
  records: [] as Record<string, unknown>[],
  payments: [] as Record<string, unknown>[],
  participants: [] as Record<string, unknown>[],
  claims: [] as Record<string, unknown>[],
  claimed: [] as Record<string, unknown>[],
}));

vi.mock('@vercel/postgres', () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?').replace(/\s+/g, ' ').trim();
    db.statements.push({ text, values });
    const ids = values.find(Array.isArray) as string[] | undefined;
    const inList = (rows: Record<string, unknown>[]) =>
      rows.filter((r) => ids?.includes(r.session_id as string));
    let rows: Record<string, unknown>[] = [];
    if (text.includes('from session_participants p join expense_sessions s')) rows = db.joined;
    else if (text.includes('from session_participants p join users u'))
      rows = inList(db.participants);
    else if (text.includes('select session_id, member from session_participants'))
      rows = inList(db.claimed);
    else if (text.includes('from payment_claims')) rows = inList(db.claims);
    else if (text.includes('from purchase_records')) rows = inList(db.records);
    else if (text.includes('from session_payments')) rows = inList(db.payments);
    else if (text.includes('from expense_sessions')) rows = db.owned;
    return Promise.resolve({ rows, rowCount: rows.length });
  };
  return { createPool: () => ({ sql, connect: async () => ({ sql, release: () => {} }) }) };
});

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  status: 'closed',
  created_at: new Date('2026-11-01T00:00:00.000Z'),
  closed_at: new Date('2026-11-02T00:00:00.000Z'),
  members: ['Ana', 'Ben', 'Carla'],
  name: null,
  activity_at: null,
  me: 'Ana',
  finished_with_collection: true,
  ...over,
});

const pay = (id: string, sessionId: string, debtor: string, creditor: string) => ({
  id,
  session_id: sessionId,
  debtor,
  creditor,
  amount_cents: 100,
  created_at: new Date('2026-11-03T00:00:00.000Z'),
});

const sent = (needle: string) => db.statements.filter((s) => s.text.includes(needle));
const joinedQuery = () => sent('from session_participants p join expense_sessions s');

beforeEach(() => {
  db.statements = [];
  db.owned = [row('own_1')];
  db.joined = [
    {
      ...row('joined_1', { me: undefined }),
      organizer_me: 'Ana',
      organizer_nicknames: [],
      member: 'Ben',
      organizer_name: 'Ana',
    },
  ];
  db.records = [];
  db.payments = [
    pay('p1', 'joined_1', 'Ben', 'Ana'),
    pay('p2', 'joined_1', 'Carla', 'Ana'),
    pay('p3', 'joined_1', 'Carla', 'Ben'),
    pay('p4', 'own_1', 'Carla', 'Ana'),
  ];
  db.participants = [
    {
      session_id: 'own_1',
      member: 'Ben',
      joined_at: new Date('2026-11-05T00:00:00.000Z'),
      display_name: 'Benny',
    },
    {
      session_id: 'joined_1',
      member: 'Carla',
      joined_at: new Date('2026-11-05T00:00:00.000Z'),
      display_name: null,
    },
  ];
});

describe('loadSessions', () => {
  it('sends no joined-session query without the flag (the old-client guard)', async () => {
    const sessions = await loadSessions('user_a');
    expect(joinedQuery()).toHaveLength(0);
    expect(sessions.map((s) => s.id)).toEqual(['own_1']);
  });

  it('returns an owned session as the owner, with who joined', async () => {
    const [own] = await loadSessions('user_a');
    expect(own.role).toBe('owner');
    expect(own.organizerName).toBeNull();
    expect(own.me).toBe('Ana');
    expect(own.participants).toEqual([
      { member: 'Ben', name: 'Benny', joinedAt: '2026-11-05T00:00:00.000Z' },
    ]);
    expect(own.payments.map((p) => p.id)).toEqual(['p4']);
  });

  it('returns a joined session through the participant view', async () => {
    const sessions = await loadSessions('user_b', null, true);
    const joined = sessions.find((s) => s.id === 'joined_1')!;
    expect(joined.role).toBe('participant');
    expect(joined.me).toBe('Ben');
    expect(joined.organizerName).toBe('Ana');
    expect(joined.participants).toEqual([]);
    // Only the payments on Ben's own lines: Carla to Ana is none of his business.
    expect(joined.payments.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it('lists the owned sessions first, then the joined ones', async () => {
    const sessions = await loadSessions('user_a', null, true);
    expect(sessions.map((s) => s.id)).toEqual(['own_1', 'joined_1']);
  });

  it("selects the organizer's pick only as organizer_me, for withAccount", async () => {
    await loadSessions('user_b', null, true);
    const [query] = joinedQuery();
    expect(query.text.replace('s.me as organizer_me', '')).not.toMatch(/\bs\.me\b/);
    expect(query.text).toContain('s.user_id <>');
    expect(query.text).toContain("s.status = 'closed'");
  });

  it('asks for participants over the owned ids only', async () => {
    await loadSessions('user_a', null, true);
    const [query] = sent('from session_participants p join users u');
    expect(query.values).toContainEqual(['own_1']);
    expect(JSON.stringify(query.values)).not.toContain('joined_1');
  });

  it('loads records and payments for exactly the ids the two visibility queries returned', async () => {
    await loadSessions('user_a', null, true);
    for (const needle of ['from purchase_records', 'from session_payments']) {
      const [query] = sent(needle);
      expect(query.values).toContainEqual(['own_1', 'joined_1']);
    }
  });

  it('narrows both visibility queries to one session with `only`', async () => {
    await loadSessions('user_a', 'joined_1', true);
    const [owned] = sent('from expense_sessions where user_id');
    expect(owned.values).toContain('joined_1');
    expect(joinedQuery()[0].values).toContain('joined_1');
  });

  it('returns nothing, and loads no content, when neither query finds a session', async () => {
    db.owned = [];
    db.joined = [];
    expect(await loadSessions('user_a', null, true)).toEqual([]);
    expect(sent('from purchase_records')).toHaveLength(0);
  });

  describe('claims (RC-1, extended)', () => {
    const claimRow = (
      id: string,
      sessionId: string,
      debtor: string,
      creditor: string,
      over: Record<string, unknown> = {},
    ) => ({
      id,
      session_id: sessionId,
      debtor,
      creditor,
      amount_cents: 100,
      claimed_by: 'user_b',
      status: 'pending',
      created_at: new Date('2026-11-04T00:00:00.000Z'),
      decided_at: null,
      ...over,
    });

    beforeEach(() => {
      db.claims = [
        claimRow('c_ben_ana', 'joined_1', 'Ben', 'Ana'),
        claimRow('c_ben_declined', 'joined_1', 'Ben', 'Ana', {
          status: 'declined',
          decided_at: new Date('2026-11-05T00:00:00.000Z'),
        }),
        claimRow('c_carla_ana', 'joined_1', 'Carla', 'Ana', { claimed_by: 'user_c' }),
        claimRow('c_carla_ben', 'joined_1', 'Carla', 'Ben', { claimed_by: 'user_c' }),
        claimRow('c_own_pending', 'own_1', 'Ben', 'Carla'),
        claimRow('c_own_declined', 'own_1', 'Ben', 'Ana', { status: 'declined' }),
      ];
      db.claimed = [
        { session_id: 'joined_1', member: 'Ben' },
        { session_id: 'joined_1', member: 'Carla' },
      ];
    });

    it('loads claims over the ids of both visibility queries', async () => {
      await loadSessions('user_b', null, true);
      const [query] = sent('from payment_claims');
      expect(query.values).toContainEqual(['own_1', 'joined_1']);
    });

    it('gives an owned session its pending claims only, without who sent them', async () => {
      const [own] = await loadSessions('user_a', null, true);
      expect(own.claims?.map((c) => c.id)).toEqual(['c_own_pending']);
      expect(JSON.stringify(own)).not.toContain('claimedBy');
      expect(JSON.stringify(own)).not.toContain('claimed_by');
      expect(own.withAccount).toBeUndefined();
    });

    it('gives a joined session the participant rule', async () => {
      const sessions = await loadSessions('user_b', null, true);
      const joined = sessions.find((s) => s.id === 'joined_1')!;
      // Ben's own claims, both statuses, and the claim waiting on him as a creditor. Never Carla's
      // claim on Ana.
      expect(joined.claims?.map((c) => c.id).sort()).toEqual([
        'c_ben_ana',
        'c_ben_declined',
        'c_carla_ben',
      ]);
      expect(joined.claims?.find((c) => c.id === 'c_ben_ana')?.mine).toBe(true);
      expect(joined.claims?.find((c) => c.id === 'c_carla_ben')?.mine).toBe(false);
    });

    it("works out withAccount from the claimed members and the organizer's pick, and sends neither raw", async () => {
      const [joined] = (await loadSessions('user_b', null, true)).filter(
        (s) => s.id === 'joined_1',
      );
      expect(joined.withAccount).toEqual(['Ana', 'Ben', 'Carla']);
      expect(JSON.stringify(joined)).not.toContain('organizer_me');
      expect(joined.me).toBe('Ben');
    });

    it('counts an organizer placed only by profile name as having an account (round 4)', async () => {
      db.joined = [
        {
          ...row('joined_1', { me: undefined }),
          organizer_me: null,
          organizer_nicknames: [],
          member: 'Ben',
          organizer_name: 'Ana',
        },
      ];
      db.claimed = [{ session_id: 'joined_1', member: 'Ben' }];
      const [joined] = (await loadSessions('user_b', null, true)).filter(
        (s) => s.id === 'joined_1',
      );
      expect(joined.withAccount).toEqual(['Ana', 'Ben']);
      // A nickname-only match is no account.
      db.joined = [{ ...db.joined[0], organizer_name: 'Zed', organizer_nicknames: ['Ana'] }];
      const [nick] = (await loadSessions('user_b', null, true)).filter((s) => s.id === 'joined_1');
      expect(nick.withAccount).toEqual(['Ben']);
    });

    it('asks which members are claimed over the joined ids only', async () => {
      await loadSessions('user_b', null, true);
      const [query] = sent('select session_id, member from session_participants');
      expect(query.values).toContainEqual(['joined_1']);
    });
  });
});
