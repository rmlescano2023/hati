import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureUser, getUserId, loadSessions, pool } from '../_shared.js';

/** `GET` every session the caller owns; `POST` a new empty draft. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId: string | null;
  try {
    userId = await getUserId(req);
  } catch (err) {
    console.error('auth check failed', err);
    return res.status(500).json({ error: 'Auth is misconfigured.' });
  }
  if (!userId) return res.status(401).json({ error: 'Not signed in.' });

  if (req.method === 'GET') {
    return res.status(200).json(await loadSessions(userId));
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const id = typeof body.id === 'string' && body.id ? body.id : null;
    if (!id) return res.status(400).json({ error: 'A session id is required.' });

    await ensureUser(userId);
    // The client generated the id and has already navigated into the session,
    // so this insert is catching up rather than being waited on.
    await pool.sql`
      insert into expense_sessions (id, user_id, status, members)
      values (${id}, ${userId}, 'draft', '[]'::jsonb)
      on conflict (id) do nothing`;

    return res.status(201).json({ id });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: `${req.method} not allowed.` });
}
