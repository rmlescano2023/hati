import type { VercelRequest } from '@vercel/node';
import { createPool } from '@vercel/postgres';
import { verifyToken } from '@clerk/backend';
import type { PurchaseRecord, Session, SessionStatus } from '../src/types';

/**
 * `POSTGRES_DATABASE_URL` is managed by the Vercel-Neon integration and applies
 * to every environment, so it cannot be pointed at a different database per
 * stage. `HATI_DATABASE_URL` is ours to scope, and wins where it is set.
 */
export const pool = createPool({
  connectionString: process.env.HATI_DATABASE_URL ?? process.env.POSTGRES_DATABASE_URL,
});

/** The Clerk user id behind this request, or null if it isn't authenticated. */
export async function getUserId(req: VercelRequest): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set');

  try {
    const claims = await verifyToken(header.slice('Bearer '.length), { secretKey });
    return claims.sub ?? null;
  } catch {
    // A token that fails verification is indistinguishable from none at all.
    return null;
  }
}

/** Rows arrive only after a `users` row exists to hang them off. */
export async function ensureUser(userId: string): Promise<void> {
  await pool.sql`insert into users (id) values (${userId}) on conflict (id) do nothing`;
}

/**
 * Whether this session exists and belongs to this user. Ownership is checked
 * separately from the write itself so that someone else's session id is a 404
 * rather than a silent no-op that looks like success.
 */
export async function ownsSession(userId: string, sessionId: string): Promise<boolean> {
  const { rows } = await pool.sql`
    select 1 from expense_sessions where id = ${sessionId} and user_id = ${userId}`;
  return rows.length > 0;
}

type SessionRow = {
  id: string;
  status: SessionStatus;
  created_at: Date | string;
  closed_at: Date | string | null;
  members: string[];
};

type RecordRow = {
  id: string;
  session_id: string;
  /** Always text — see the cast in the query below. */
  date: string;
  payor_mode: PurchaseRecord['payorMode'];
  payors: PurchaseRecord['payors'];
  items: PurchaseRecord['items'];
  created_at: Date | string;
};

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

/**
 * Reassembles the `Session[]` the client has always consumed. The response
 * contract is unchanged even though it now comes from two joined tables
 * rather than one column.
 */
export async function loadSessions(userId: string): Promise<Session[]> {
  const { rows: sessionRows } = await pool.sql<SessionRow>`
    select id, status, created_at, closed_at, members
    from expense_sessions
    where user_id = ${userId}
    order by created_at`;

  if (sessionRows.length === 0) return [];

  const { rows: recordRows } = await pool.sql<RecordRow>`
    -- The cast to text is deliberate: the driver parses a date column into a
    -- JS Date at local midnight, and converting that to ISO shifts the day
    -- backwards for any timezone east of UTC. The app's contract is a
    -- YYYY-MM-DD string, so it stays a string the whole way.
    select r.id, r.session_id, r.date::text as date, r.payor_mode,
           r.payors, r.items, r.created_at
    from purchase_records r
    join expense_sessions s on s.id = r.session_id
    where s.user_id = ${userId}
    order by r.date, r.created_at`;

  const bySession = new Map<string, PurchaseRecord[]>();
  for (const row of recordRows) {
    const record: PurchaseRecord = {
      id: row.id,
      date: row.date,
      payorMode: row.payor_mode,
      payors: row.payors,
      items: row.items,
      createdAt: iso(row.created_at),
    };
    const bucket = bySession.get(row.session_id);
    if (bucket) bucket.push(record);
    else bySession.set(row.session_id, [record]);
  }

  return sessionRows.map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: iso(s.created_at),
    closedAt: s.closed_at === null ? null : iso(s.closed_at),
    members: s.members,
    records: bySession.get(s.id) ?? [],
  }));
}
