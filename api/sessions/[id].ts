import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clampActivityAt } from '../../src/lib/activity.js';
import { closedSessionMe } from '../../src/lib/joinedSessions.js';
import { getUserId, ownsSession, pool } from '../_shared.js';
import { isPracticeSessionId, parseActivityInput, parseSessionInput } from '../_validate.js';

/**
 * `PUT` replaces one session; `PATCH` records that it was opened; `DELETE`
 * removes it.
 *
 * Writes are scoped to the session named in the path, which is the point of
 * the whole redesign: editing one item no longer rewrites an account's entire
 * history.
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

  const sessionId = String(req.query.id ?? '');
  if (!sessionId) return res.status(400).json({ error: 'A session id is required.' });
  // A guide's practice session lives only in the browser and is never stored, so every method
  // refuses its id before anything is read or written (BR-TG3).
  if (isPracticeSessionId(sessionId)) {
    return res.status(400).json({ error: 'Practice sessions are never saved.' });
  }

  if (req.method === 'PUT') {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;

    // Never store what the client sent verbatim. This is the validation
    // boundary that `parseAppData` used to hold over the whole document,
    // now scoped to the one session being written.
    const session = parseSessionInput(sessionId, raw);
    if (!session) return res.status(400).json({ error: 'Malformed session.' });

    const activityAt = clampActivityAt(session.activityAt, Date.now());

    const client = await pool.connect();
    try {
      await client.sql`begin`;
      // Lock and read the stored row first, as the payments POST does. Ownership is part of the
      // `where`, so another account's id, a participant's and a deleted session's are all simply
      // not found. The lock means a concurrent delete either lands first and this is a 404, or
      // waits for this save and removes the session after it. An update and never an insert: a
      // save from a tab that still shows a deleted session must not create it again, so only
      // `POST /api/sessions` creates.
      const { rows: stored } = await client.sql<{
        status: string;
        members: string[];
        me: string | null;
      }>`
        select status, members, me from expense_sessions
        where id = ${sessionId} and user_id = ${userId}
        for update`;
      if (stored.length === 0) {
        await client.sql`rollback`;
        return res.status(404).json({ error: 'No such session.' });
      }

      // The stored status decides, not the body's: Finish (a stored draft saved as closed) still
      // goes through the draft path below, and nothing can change a finished session's numbers.
      // A finished session takes only its name, its activity time and the organizer's pick, and
      // the pick never moves onto a member someone has joined as (BR-R1, D4). Its status, members,
      // records and closed time stay as stored, whatever the body says, so a tab that was left
      // open before this rule can't overwrite them either.
      if (stored[0].status === 'closed') {
        const { rows: claimedRows } = await client.sql<{ member: string }>`
          select member from session_participants where session_id = ${sessionId}`;
        const me = closedSessionMe(
          stored[0].me,
          session.me,
          stored[0].members,
          claimedRows.map((r) => r.member),
        );
        await client.sql`
          update expense_sessions set
            name        = ${session.name},
            activity_at = greatest(activity_at, ${activityAt}::timestamptz),
            me          = ${me}
          where id = ${sessionId} and user_id = ${userId}`;
        await client.sql`commit`;
        return res.status(200).json(session);
      }

      // The activity time only moves forward: `greatest` ignores a null, so an
      // older client's write never wipes it, and a late or retried save never
      // pulls a session down below a later open or edit (BR-7). A null pick
      // means this write carries none, so `coalesce` keeps the stored one and
      // an older client or a draft's save never wipes it. Payments are never
      // read from the body: they are written only through /api/payments. The
      // finished-with-Collection mark only ever turns on, so an older client's
      // save, or a re-save of a finished session, never clears it.
      await client.sql`
        update expense_sessions set
          status      = ${session.status},
          closed_at   = ${session.closedAt},
          members     = ${JSON.stringify(session.members)}::jsonb,
          name        = ${session.name},
          activity_at = greatest(activity_at, ${activityAt}::timestamptz),
          me          = coalesce(${session.me}, me),
          finished_with_collection =
            coalesce(finished_with_collection, false) or ${session.finishedWithCollection}
        where id = ${sessionId} and user_id = ${userId}`;

      // Replacing this session's records is far smaller than rewriting the
      // account, and avoids diffing a list the client already rebuilt.
      await client.sql`delete from purchase_records where session_id = ${sessionId}`;
      for (const record of session.records) {
        await client.sql`
          insert into purchase_records
            (id, session_id, date, payor_mode, payors, items, created_at)
          values (
            ${record.id}, ${sessionId}, ${record.date}, ${record.payorMode},
            ${JSON.stringify(record.payors)}::jsonb,
            ${JSON.stringify(record.items)}::jsonb,
            ${record.createdAt}
          )`;
      }
      await client.sql`commit`;
    } catch (err) {
      await client.sql`rollback`;
      throw err;
    } finally {
      client.release();
    }

    return res.status(200).json(session);
  }

  if (req.method === 'PATCH') {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
    const sent = parseActivityInput(raw);
    if (!sent) return res.status(400).json({ error: 'An activity time is required.' });

    // Covers another account's id and a session deleted since it was opened.
    if (!(await ownsSession(userId, sessionId))) {
      return res.status(404).json({ error: 'No such session.' });
    }
    // An update and never an insert, so a late open cannot bring back a
    // deleted session (BR-13), and it carries no content to overwrite (BR-2).
    await pool.sql`
      update expense_sessions
      set activity_at = greatest(activity_at, ${clampActivityAt(sent, Date.now())}::timestamptz)
      where id = ${sessionId} and user_id = ${userId}`;
    return res.status(204).end();
  }

  if (req.method === 'DELETE') {
    if (!(await ownsSession(userId, sessionId))) {
      return res.status(404).json({ error: 'No such session.' });
    }
    // Records go with it, via the foreign key's cascade.
    await pool.sql`delete from expense_sessions where id = ${sessionId}`;
    return res.status(204).end();
  }

  res.setHeader('Allow', 'PUT, PATCH, DELETE');
  return res.status(405).json({ error: `${req.method} not allowed.` });
}
