import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { claimableMembers, onHatiMembers, unavailableMembers } from '../src/lib/joinedSessions.js';
import { sessionDisplayTitle } from '../src/lib/sessionLabel.js';
import type { InviteAnswer, InvitePreview } from '../src/types';
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

    // The caller owns it now, so this is its owned form, with who has joined.
    const [session] = await loadSessions(userId, input.sessionId);
    return res
      .status(200)
      .json({ token: rows[0].invite_token, participants: session?.participants ?? [] });
  }

  if (input.kind === 'preview') {
    const { rows } = await pool.sql<LookupRow>`
      select s.id, s.user_id, s.name, s.created_at, s.closed_at, s.members, s.me,
             u.display_name as organizer_name
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
             u.display_name as organizer_name
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

  const preview: InvitePreview = {
    sessionId: row.id,
    title,
    closedAt: iso(row.closed_at ?? row.created_at),
    members: row.members,
    onHati: onHatiMembers(
      row.members,
      joined.map((j) => j.member),
    ),
    unavailable: unavailableMembers(
      row.members,
      row.me,
      joined.map((j) => j.member),
    ),
    organizerName: row.organizer_name ?? null,
  };
  return { outcome: 'open', preview };
}
