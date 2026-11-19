import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserId, lockSessionRole, pool } from './_shared.js';
import { parseParticipantQuery } from './_validate.js';

/**
 * `DELETE ?sessionId=&member=` takes a joined account out of a session. The organizer may remove
 * any member's account, and a participant may remove only their own, which is how they stop
 * tracking a session. Nothing else changes: payments already recorded stay.
 *
 * An account with no relation to the session gets a 404 that doesn't say whether the session
 * exists. A participant naming someone else's member gets a 403 with a code, because they are
 * related to the session and the role doesn't allow it.
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

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: `${req.method} not allowed.` });
  }

  const input = parseParticipantQuery(req.query.sessionId, req.query.member);
  if (!input) return res.status(400).json({ error: 'A session and a member are required.' });
  const { sessionId, member } = input;

  const client = await pool.connect();
  try {
    await client.sql`begin`;
    const access = await lockSessionRole(client, userId, sessionId);
    if (access === null) {
      await client.sql`rollback`;
      return res.status(404).json({ error: 'No such session.' });
    }
    if (access.role === 'participant' && access.member !== member) {
      await client.sql`rollback`;
      return res.status(403).json({
        error: 'You can only stop tracking your own place in a session.',
        code: 'not_yours',
      });
    }

    if (access.role === 'owner') {
      await client.sql`
        delete from session_participants where session_id = ${sessionId} and member = ${member}`;
    } else {
      await client.sql`
        delete from session_participants where session_id = ${sessionId} and user_id = ${userId}`;
    }
    await client.sql`commit`;
    // Nobody to remove still means it's done.
    return res.status(204).end();
  } catch (err) {
    await client.sql`rollback`;
    throw err;
  } finally {
    client.release();
  }
}
