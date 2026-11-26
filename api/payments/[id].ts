import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserId, lockSessionRole, pool } from '../_shared.js';

/**
 * `DELETE` undoes one payment. Payments are never edited, so undo is the only
 * way to correct one: it is removed and can be recorded again.
 *
 * The organizer may undo any payment. A participant only one on a line where they are the
 * creditor, whoever recorded or confirmed it, because the money is theirs to say wasn't received
 * (BR-C4). A payment's session never changes, so it is found with a plain read, then locked.
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

  const paymentId = String(req.query.id ?? '');
  if (!paymentId) return res.status(400).json({ error: 'A payment id is required.' });

  const { rows: found } = await pool.sql<{ session_id: string }>`
    select session_id from session_payments where id = ${paymentId}`;
  if (found.length === 0) return res.status(404).json({ error: 'No such payment.' });
  const sessionId = found[0].session_id;

  const client = await pool.connect();
  try {
    await client.sql`begin`;
    const access = await lockSessionRole(client, userId, sessionId);
    // The same body as a payment that doesn't exist, so it never says which it was.
    if (access === null) {
      await client.sql`rollback`;
      return res.status(404).json({ error: 'No such payment.' });
    }
    // Re-read after the lock: it may have been undone, or confirmed under another id's lock.
    const { rows } = await client.sql<{ creditor: string }>`
      select creditor from session_payments where id = ${paymentId} and session_id = ${sessionId}`;
    if (rows.length === 0) {
      await client.sql`rollback`;
      return res.status(404).json({ error: 'No such payment.' });
    }
    if (access.role === 'participant' && rows[0].creditor !== access.member) {
      await client.sql`rollback`;
      return res
        .status(403)
        .json({ error: 'You can only undo payments owed to you.', code: 'not_your_line' });
    }
    await client.sql`delete from session_payments where id = ${paymentId} and session_id = ${sessionId}`;
    await client.sql`commit`;
    return res.status(204).end();
  } catch (err) {
    await client.sql`rollback`;
    throw err;
  } finally {
    client.release();
  }
}
