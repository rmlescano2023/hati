import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserId, pool } from '../_shared.js';

/**
 * `DELETE` undoes one payment. Payments are never edited, so undo is the only
 * way to correct one: it is removed and can be recorded again.
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

  // The ownership check is part of the delete itself, so another account's
  // payment and one already undone are both simply not found.
  const { rowCount } = await pool.sql`
    delete from session_payments p
    using expense_sessions s
    where p.id = ${paymentId} and p.session_id = s.id and s.user_id = ${userId}`;
  if (rowCount === 0) return res.status(404).json({ error: 'No such payment.' });
  return res.status(204).end();
}
