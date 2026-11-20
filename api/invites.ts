import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { claimableMembers, onHatiMembers, organizerMember } from '../src/lib/joinedSessions.js';
import { sessionDisplayTitle } from '../src/lib/sessionLabel.js';
import { everyLinePaid } from '../src/lib/collection.js';
import type { InviteAnswer, InvitePreview, Payment, PurchaseRecord } from '../src/types';
import { ensureUser, getUserId, iso, loadSessions, pool } from './_shared.js';
import { parseInviteInput } from './_validate.js';

const DEAD_LINK = { error: "This link doesn't work any more.", code: 'dead_link' } as const;

type LookupRow = {
  id: string;
  user_id: string;
  name: string | null;
  created_at: Date | string;
  closed_at: Date | string | null;
  members: string[];
  me: string | null;
  organizer_name: string | null;
  /** With `organizer_name`, only to work out which member the organizer is; never sent on. */
  organizer_nicknames: string[] | null;
};

/** Either the pool or a transaction's client: both run the same tagged template. */
type Db = Pick<typeof pool, 'sql'>;

/**
 * `POST` is the one route behind the invite link, in three forms told apart by the body. A token
 * travels only in a POST body, never in a query string, so it stays out of request logs.
 *
 * - `{ sessionId, reset? }`: the organizer gets the session's link, minting it the first time and
 *   replacing it on a reset. No row is a 404 for every other account, a participant included.
 * - `{ token }`: what the token opens, for the join dialog.
 * - `{ token, member }`: join as that member.
 *
 * An unknown, reset, deleted-session or draft token all give the same 404, so a token can't be
 * used to learn which of those it was.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId: string | null;
  try {
    userId = await getUserId(req);
  } catch (err) {
    console.error('auth check failed', err);
    return res.status(500).json({ error: 'Auth is misconfigured.' });
  }
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: `${req.method} not allowed.` });
  }

  const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
  const input = parseInviteInput(raw);
  if (!input) return res.status(400).json({ error: 'Malformed invite request.' });

  if (input.kind === 'link') {
    // Read first, owned only: no session, or a draft, is a 404, and a session whose every line is
    // paid has nothing left to track, so its link is neither made nor remade. The stored token is
    // kept, so an undo makes the same link work again (BR-L1, BR-L4).
    const [session] = await loadSessions(userId, input.sessionId);
    if (!session || session.status !== 'closed') {
      return res.status(404).json({ error: 'No such session.' });
    }
    if (everyLinePaid(session)) {
      return res
        .status(409)
        .json({
          error: 'Everyone has paid, so the invite link no longer works.',
          code: 'all_paid',
        });
    }
    const fresh = randomBytes(16).toString('base64url');
    // One statement, so it locks only this row. The `where` is the ownership check, and a draft
    // never gets a link.
    const { rows } = await pool.sql<{ invite_token: string }>`
      update expense_sessions
      set invite_token = case when ${input.reset}::boolean then ${fresh}
                              else coalesce(invite_token, ${fresh}) end
      where id = ${input.sessionId} and user_id = ${userId} and status = 'closed'
      returning invite_token`;
    if (rows.length === 0) return res.status(404).json({ error: 'No such session.' });

    return res
      .status(200)
      .json({ token: rows[0].invite_token, participants: session?.participants ?? [] });
  }

  if (input.kind === 'preview') {
    const { rows } = await pool.sql<LookupRow>`
      select s.id, s.user_id, s.name, s.created_at, s.closed_at, s.members, s.me,
             u.display_name as organizer_name, u.nicknames as organizer_nicknames
      from expense_sessions s join users u on u.id = s.user_id
      where s.invite_token = ${input.token} and s.status = 'closed'`;
    if (rows.length === 0) return res.status(404).json(DEAD_LINK);
    const outcome = await outcomeFor(pool, rows[0], userId);
    return res.status(200).json(outcome);
  }

  // The joined row's foreign key needs the account to exist, and a brand-new one may not have
  // reached `GET /api/user` yet. It runs before the transaction, never inside one.
  await ensureUser(userId);

  const client = await pool.connect();
  try {
    await client.sql`begin`;
    // The session row is locked first, as every write on a session's participants does, so two
    // accounts joining as one member are taken one at a time and the second is told it's taken.
    const { rows } = await client.sql<LookupRow>`
      select s.id, s.user_id, s.name, s.created_at, s.closed_at, s.members, s.me,
             u.display_name as organizer_name, u.nicknames as organizer_nicknames
      from expense_sessions s join users u on u.id = s.user_id
      where s.invite_token = ${input.token} and s.status = 'closed'
      for update of s`;
    if (rows.length === 0) {
      await client.sql`rollback`;
      return res.status(404).json(DEAD_LINK);
    }

    const outcome = await outcomeFor(client, rows[0], userId);
    if (outcome.outcome !== 'open') {
      await client.sql`rollback`;
      return res.status(200).json(outcome);
    }

    // Not a member, the organizer's own, or just claimed: the same refusal for all three, with
    // the fresh preview so the dialog can pick again.
    if (!claimableMembers(outcome.preview).includes(input.member)) {
      await client.sql`rollback`;
      return res.status(409).json({
        error: 'Someone else just joined as that member.',
        code: 'taken',
        preview: outcome.preview,
      });
    }

    await client.sql`
      insert into session_participants (session_id, user_id, member)
      values (${rows[0].id}, ${userId}, ${input.member})`;
    await client.sql`commit`;

    const [session] = await loadSessions(userId, rows[0].id, true);
    return res.status(201).json({ outcome: 'joined', session } satisfies InviteAnswer);
  } catch (err) {
    await client.sql`rollback`;
    throw err;
  } finally {
    client.release();
  }
}

/**
 * What a token opens for this caller: their own session, one they already joined, or an open
 * invitation with the members who are already on Hati. The checks run in this order, so the
 * organizer opening their own link is told so rather than offered a member.
 */
async function outcomeFor(
  db: Db,
  row: LookupRow,
  userId: string,
): Promise<Exclude<InviteAnswer, { outcome: 'joined' }>> {
  const { rows: dates } = await db.sql<{ date: string }>`
    select date::text as date from purchase_records where session_id = ${row.id}`;
  // Computed here rather than sent as records: `formatLongDate` works in UTC everywhere, so the
  // title is the same on the server as on any device.
  const title = sessionDisplayTitle({
    name: row.name,
    status: 'closed',
    closedAt: row.closed_at === null ? null : iso(row.closed_at),
    createdAt: iso(row.created_at),
    records: dates,
  });

  if (row.user_id === userId) return { outcome: 'own', sessionId: row.id, title };

  const { rows: joined } = await db.sql<{ user_id: string; member: string }>`
    select user_id, member from session_participants where session_id = ${row.id}`;
  const mine = joined.find((j) => j.user_id === userId);
  if (mine) {
    return { outcome: 'already', sessionId: row.id, title, member: mine.member };
  }

  // A session with every line paid has nothing left to join, and says nothing else about itself.
  const ledger = await readLedger(db, row);
  if (everyLinePaid({ members: row.members, ...ledger })) return { outcome: 'paid' };

  const claimed = joined.map((j) => j.member);
  // The organizer's member as Collection places them, by pick or by profile name, so a joiner is
  // never offered it, and the preview doesn't list it, so it never says which member it is.
  const organizer = organizerMember({ me: row.me, members: row.members }, claimed, {
    displayName: row.organizer_name,
    nicknames: row.organizer_nicknames ?? [],
  });
  const preview: InvitePreview = {
    sessionId: row.id,
    title,
    closedAt: iso(row.closed_at ?? row.created_at),
    members: row.members.filter((m) => m !== organizer),
    memberCount: row.members.length,
    onHati: onHatiMembers(row.members, claimed),
    organizerName: row.organizer_name ?? null,
  };
  return { outcome: 'open', preview };
}

/**
 * The session's purchases and confirmed payments, read only to say whether any line is unpaid.
 * Nothing from them is sent; the answer is the word `paid` or nothing. In the join this runs on
 * the transaction's client, after the session row's lock, so the check and the insert see the same
 * rows.
 */
async function readLedger(
  db: Db,
  row: LookupRow,
): Promise<{ records: PurchaseRecord[]; payments: Payment[] }> {
  const { rows: recordRows } = await db.sql<{
    id: string;
    date: string;
    payor_mode: PurchaseRecord['payorMode'];
    payors: PurchaseRecord['payors'];
    items: PurchaseRecord['items'];
    created_at: Date | string;
  }>`
    select r.id, r.date::text as date, r.payor_mode, r.payors, r.items, r.created_at
    from purchase_records r where r.session_id = ${row.id}`;
  const { rows: paymentRows } = await db.sql<{
    id: string;
    debtor: string;
    creditor: string;
    amount_cents: number;
    created_at: Date | string;
  }>`
    select id, debtor, creditor, amount_cents, created_at
    from session_payments where session_id = ${row.id}`;
  return {
    records: recordRows.map((r) => ({
      id: r.id,
      date: r.date,
      payorMode: r.payor_mode,
      payors: r.payors,
      items: r.items,
      createdAt: iso(r.created_at),
    })),
    payments: paymentRows.map((p) => ({
      id: p.id,
      debtor: p.debtor,
      creditor: p.creditor,
      amountCents: p.amount_cents,
      createdAt: iso(p.created_at),
    })),
  };
}
