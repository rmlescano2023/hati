import { createHash } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { createPool, type VercelPoolClient } from '@vercel/postgres';
import { verifyToken } from '@clerk/backend';
import {
  participantView,
  stateText,
  organizerMember,
  visibleLedger,
  type ClaimRow,
} from '../src/lib/joinedSessions.js';
import type { Participant, Payment, PurchaseRecord, Session, SessionStatus } from '../src/types';

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
  name: string | null;
  activity_at: Date | string | null;
  me: string | null;
  finished_with_collection: boolean | null;
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

type PaymentRow = {
  id: string;
  session_id: string;
  debtor: string;
  creditor: string;
  amount_cents: number;
  created_at: Date | string;
};

export const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

/** A joined session's row: the session as stored, the member the caller joined as, and who organized it. */
type JoinedRow = Omit<SessionRow, 'me'> & {
  member: string;
  organizer_name: string | null;
  /** With the organizer's name and nicknames, only to work out `withAccount`; never put on a session. */
  organizer_me: string | null;
  organizer_nicknames: string[] | null;
};

type ClaimDbRow = {
  id: string;
  session_id: string;
  debtor: string;
  creditor: string;
  amount_cents: number;
  claimed_by: string;
  status: 'pending' | 'declined';
  created_at: Date | string;
  decided_at: Date | string | null;
};

/** A claim row as the server holds it, with who sent it, which goes no further than this file and the write routes. */
const toClaimRow = (row: ClaimDbRow): ClaimRow => ({
  id: row.id,
  debtor: row.debtor,
  creditor: row.creditor,
  amountCents: row.amount_cents,
  createdAt: iso(row.created_at),
  status: row.status,
  decidedAt: row.decided_at === null ? null : iso(row.decided_at),
  claimedBy: row.claimed_by,
});

type ParticipantRow = {
  session_id: string;
  member: string;
  joined_at: Date | string;
  display_name: string | null;
};

/**
 * The records, payments and participants of the sessions the two visibility queries in
 * `loadSessions` returned. It has no user filter of its own, so it is private to this module and
 * only ever called with ids that came out of those queries in the same call: access to a session
 * is decided in exactly one place. Participants are loaded for the owned ids only, because only
 * an organizer is told who joined.
 */
async function loadContent(ownedIds: string[], joinedIds: string[]) {
  // The driver sends a JS array as a Postgres array literal, but the template's types only list
  // primitives, hence the cast on the value. The SQL cast makes an empty array unambiguous.
  const list = [...ownedIds, ...joinedIds] as unknown as string;
  const ownedList = ownedIds as unknown as string;

  const { rows: recordRows } = await pool.sql<RecordRow>`
    -- The cast to text is deliberate: the driver parses a date column into a
    -- JS Date at local midnight, and converting that to ISO shifts the day
    -- backwards for any timezone east of UTC. The app's contract is a
    -- YYYY-MM-DD string, so it stays a string the whole way.
    select r.id, r.session_id, r.date::text as date, r.payor_mode,
           r.payors, r.items, r.created_at
    from purchase_records r
    where r.session_id = any(${list}::text[])
    order by r.date, r.created_at`;

  const { rows: paymentRows } = await pool.sql<PaymentRow>`
    select p.id, p.session_id, p.debtor, p.creditor, p.amount_cents, p.created_at
    from session_payments p
    where p.session_id = any(${list}::text[])
    order by p.created_at, p.id`;

  const { rows: claimDbRows } = await pool.sql<ClaimDbRow>`
    select c.id, c.session_id, c.debtor, c.creditor, c.amount_cents, c.claimed_by, c.status,
           c.created_at, c.decided_at
    from payment_claims c
    where c.session_id = any(${list}::text[])
    order by c.created_at, c.id`;

  // Who has joined each joined session, for `withAccount`. The owned ids have it already, through
  // the participants query below, which also says who they are.
  const joinedList = joinedIds as unknown as string;
  const claimedRows =
    joinedIds.length === 0
      ? []
      : (
          await pool.sql<{ session_id: string; member: string }>`
            select session_id, member from session_participants
            where session_id = any(${joinedList}::text[])`
        ).rows;

  const participantRows =
    ownedIds.length === 0
      ? []
      : (
          await pool.sql<ParticipantRow>`
            select p.session_id, p.member, p.joined_at, u.display_name
            from session_participants p join users u on u.id = p.user_id
            where p.session_id = any(${ownedList}::text[])
            order by p.joined_at, p.member`
        ).rows;

  const records = new Map<string, PurchaseRecord[]>();
  for (const row of recordRows) {
    const record: PurchaseRecord = {
      id: row.id,
      date: row.date,
      payorMode: row.payor_mode,
      payors: row.payors,
      items: row.items,
      createdAt: iso(row.created_at),
    };
    const bucket = records.get(row.session_id);
    if (bucket) bucket.push(record);
    else records.set(row.session_id, [record]);
  }

  const payments = new Map<string, Payment[]>();
  for (const row of paymentRows) {
    const payment: Payment = {
      id: row.id,
      debtor: row.debtor,
      creditor: row.creditor,
      amountCents: row.amount_cents,
      createdAt: iso(row.created_at),
    };
    const bucket = payments.get(row.session_id);
    if (bucket) bucket.push(payment);
    else payments.set(row.session_id, [payment]);
  }

  const participants = new Map<string, Participant[]>();
  for (const row of participantRows) {
    const participant: Participant = {
      member: row.member,
      name: row.display_name ?? null,
      joinedAt: iso(row.joined_at),
    };
    const bucket = participants.get(row.session_id);
    if (bucket) bucket.push(participant);
    else participants.set(row.session_id, [participant]);
  }

  const claims = new Map<string, ClaimRow[]>();
  for (const row of claimDbRows) {
    const bucket = claims.get(row.session_id);
    if (bucket) bucket.push(toClaimRow(row));
    else claims.set(row.session_id, [toClaimRow(row)]);
  }

  const claimed = new Map<string, string[]>();
  for (const row of claimedRows) {
    const bucket = claimed.get(row.session_id);
    if (bucket) bucket.push(row.member);
    else claimed.set(row.session_id, [row.member]);
  }

  return { records, payments, participants, claims, claimed };
}

/**
 * Reassembles the `Session[]` the client has always consumed. The response
 * contract is unchanged even though it now comes from joined tables rather
 * than one column.
 *
 * Two queries decide which sessions the caller may see, and they are the only
 * place access is decided: the sessions the caller owns, and, only when
 * `joined` is true, the finished sessions the caller joined as a member. A
 * caller that doesn't ask for joined sessions, such as a tab still on an older
 * bundle, gets owned sessions only. A joined session goes through
 * `participantView` before it is returned, so the caller sees only the
 * payments and claims on their own lines and never the organizer's pick. A
 * claim never leaves with the account that sent it: `visibleLedger` is the
 * one place that turns what is stored into what a caller may see.
 *
 * `only` narrows it to one session, for the payments POST, which checks a
 * payment against that session's settlement lines, and for a join's response.
 */
export async function loadSessions(
  userId: string,
  only: string | null = null,
  joined = false,
): Promise<Session[]> {
  const { rows: ownedRows } = await pool.sql<SessionRow>`
    select id, status, created_at, closed_at, members, name, activity_at, me,
           finished_with_collection
    from expense_sessions
    where user_id = ${userId} and (${only}::text is null or id = ${only})
    order by created_at`;

  // The organizer's own pick and nicknames are selected only to work out which member the
  // organizer is, for `withAccount`: a participant is never sent them.
  const joinedRows = joined
    ? (
        await pool.sql<JoinedRow>`
          select s.id, s.status, s.created_at, s.closed_at, s.members, s.name, s.activity_at,
                 s.finished_with_collection, p.member, u.display_name as organizer_name,
                 s.me as organizer_me, u.nicknames as organizer_nicknames
          from session_participants p
          join expense_sessions s on s.id = p.session_id
          join users u on u.id = s.user_id
          where p.user_id = ${userId} and s.user_id <> ${userId} and s.status = 'closed'
            and (${only}::text is null or s.id = ${only})
          order by s.created_at`
      ).rows
    : [];

  if (ownedRows.length === 0 && joinedRows.length === 0) return [];

  const content = await loadContent(
    ownedRows.map((s) => s.id),
    joinedRows.map((s) => s.id),
  );

  const base = (s: SessionRow | JoinedRow, me: string | null): Session => ({
    id: s.id,
    status: s.status,
    createdAt: iso(s.created_at),
    closedAt: s.closed_at === null ? null : iso(s.closed_at),
    members: s.members,
    records: content.records.get(s.id) ?? [],
    name: s.name,
    activityAt: s.activity_at === null ? null : iso(s.activity_at),
    me,
    finishedWithCollection: s.finished_with_collection === true,
    payments: content.payments.get(s.id) ?? [],
  });

  return [
    ...ownedRows.map((s) => ({
      ...base(s, s.me),
      role: 'owner' as const,
      organizerName: null,
      participants: content.participants.get(s.id) ?? [],
      claims: visibleLedger({ role: 'owner' }, [], content.claims.get(s.id) ?? [], userId).claims,
    })),
    ...joinedRows.map((s) => {
      const ledger = visibleLedger(
        { role: 'participant', member: s.member },
        content.payments.get(s.id) ?? [],
        content.claims.get(s.id) ?? [],
        userId,
      );
      // Who has an account: the members someone joined as, and the organizer's member as
      // Collection places them, by pick or by profile name (round 4, replacing A2).
      const claimed = content.claimed.get(s.id) ?? [];
      const organizer = organizerMember({ me: s.organizer_me, members: s.members }, claimed, {
        displayName: s.organizer_name,
        nicknames: s.organizer_nicknames ?? [],
      });
      return participantView(
        { ...base(s, null), payments: ledger.payments, claims: ledger.claims },
        s.member,
        s.organizer_name ?? null,
        s.members.filter((m) => claimed.includes(m) || m === organizer),
      );
    }),
  ];
}

export type SessionAccess = { role: 'owner' } | { role: 'participant'; member: string };

/**
 * Locks a session's row, first and before anything else in the transaction, and says how the
 * caller relates to it: null for no relation at all, which is a 404 whatever the caller asked for
 * and never says whether the session exists. Every write that touches participants, claims or
 * payments takes this lock first, so two writes on one session queue rather than deadlock.
 * `for update of s` is required: Postgres refuses to lock the nullable side of an outer join.
 * (`pool.connect` is overloaded, so `ReturnType` can't name the client; the driver's own type does.)
 */
export async function lockSessionRole(
  client: VercelPoolClient,
  userId: string,
  sessionId: string,
): Promise<SessionAccess | null> {
  const { rows } = await client.sql<{ user_id: string; member: string | null }>`
    select s.user_id, p.member
    from expense_sessions s
    left join session_participants p on p.session_id = s.id and p.user_id = ${userId}
    where s.id = ${sessionId}
    for update of s`;
  if (rows.length === 0) return null;
  if (rows[0].user_id === userId) return { role: 'owner' };
  return rows[0].member === null ? null : { role: 'participant', member: rows[0].member };
}

/**
 * A session's payments and claims, read inside a locked transaction for the write routes: the caps
 * and the 409 bodies. Every claim here still has who sent it, so a route must pass the rows through
 * `visibleLedger` before any of it goes into a response.
 */
export async function loadLedger(
  client: VercelPoolClient,
  sessionId: string,
): Promise<{ payments: Payment[]; claims: ClaimRow[] }> {
  const { rows: paymentRows } = await client.sql<PaymentRow>`
    select id, session_id, debtor, creditor, amount_cents, created_at
    from session_payments where session_id = ${sessionId}
    order by created_at, id`;
  const { rows: claimRows } = await client.sql<ClaimDbRow>`
    select id, session_id, debtor, creditor, amount_cents, claimed_by, status, created_at, decided_at
    from payment_claims where session_id = ${sessionId}
    order by created_at, id`;
  return {
    payments: paymentRows.map((row) => ({
      id: row.id,
      debtor: row.debtor,
      creditor: row.creditor,
      amountCents: row.amount_cents,
      createdAt: iso(row.created_at),
    })),
    claims: claimRows.map(toClaimRow),
  };
}

/**
 * A short fingerprint of what a full load would show, for the "anything changed?" check. It is
 * taken over the same array the load sends, so a check and a load always agree, and it respects
 * what each viewer may see without any rule of its own.
 */
export const sessionsState = (sessions: Session[]): string =>
  createHash('sha1').update(stateText(sessions)).digest('base64url');
