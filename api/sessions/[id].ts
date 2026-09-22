import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureUser, getUserId, ownsSession, pool } from '../_shared.js';
import { parseSessionInput } from '../_validate.js';

/**
 * `PUT` replaces one session; `DELETE` removes it.
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

  if (req.method === 'PUT') {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;

    // Never store what the client sent verbatim. This is the validation
    // boundary that `parseAppData` used to hold over the whole document,
    // now scoped to the one session being written.
    const session = parseSessionInput(sessionId, raw);
    if (!session) return res.status(400).json({ error: 'Malformed session.' });

    await ensureUser(userId);

    const existing = await ownsSession(userId, sessionId);
    // A session id belonging to someone else must not be creatable here —
    // only the owner, or a first write for a session this user just created.
    if (!existing) {
      const { rows } = await pool.sql`select 1 from expense_sessions where id = ${sessionId}`;
      if (rows.length > 0) return res.status(404).json({ error: 'No such session.' });
    }

    const client = await pool.connect();
    try {
      await client.sql`begin`;
      await client.sql`
        insert into expense_sessions (id, user_id, status, created_at, closed_at, members)
        values (
          ${sessionId}, ${userId}, ${session.status},
          ${session.createdAt}, ${session.closedAt},
          ${JSON.stringify(session.members)}::jsonb
        )
        on conflict (id) do update set
          status    = excluded.status,
          closed_at = excluded.closed_at,
          members   = excluded.members`;

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

  if (req.method === 'DELETE') {
    if (!(await ownsSession(userId, sessionId))) {
      return res.status(404).json({ error: 'No such session.' });
    }
    // Records go with it, via the foreign key's cascade.
    await pool.sql`delete from expense_sessions where id = ${sessionId}`;
    return res.status(204).end();
  }

  res.setHeader('Allow', 'PUT, DELETE');
  return res.status(405).json({ error: `${req.method} not allowed.` });
}
