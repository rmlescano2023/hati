import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureUser, getUserId, loadSessions, pool, sessionsState } from '../_shared.js';
import {
  isPracticeSessionId,
  parseCheckFlag,
  parseJoinedFlag,
  parseSessionName,
} from '../_validate.js';

/**
 * `GET` every session the caller owns, and with `?joined=1` the finished sessions they joined as
 * a member too; `POST` a new empty draft, optionally named. A tab still on an older bundle sends
 * no flag, so it keeps getting owned sessions only.
 *
 * A full load also sets `X-Hati-State`, and `?check=1` answers just `{ state }`, so a tab can ask
 * "has anything changed?" every few seconds without being sent the sessions.
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

  if (req.method === 'GET') {
    const sessions = await loadSessions(userId, null, parseJoinedFlag(req.query.joined));
    const state = sessionsState(sessions);
    if (parseCheckFlag(req.query.check)) return res.status(200).json({ state });
    res.setHeader('X-Hati-State', state);
    return res.status(200).json(sessions);
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const id = typeof body.id === 'string' && body.id ? body.id : null;
    if (!id) return res.status(400).json({ error: 'A session id is required.' });
    // A guide's practice session lives only in the browser and is never stored (BR-TG3).
    if (isPracticeSessionId(id)) {
      return res.status(400).json({ error: 'Practice sessions are never saved.' });
    }
    const name = parseSessionName(body.name);

    await ensureUser(userId);
    // The client generated the id and has already navigated into the session,
    // so this insert is catching up rather than being waited on.
    await pool.sql`
      insert into expense_sessions (id, user_id, status, members, name)
      values (${id}, ${userId}, 'draft', '[]'::jsonb, ${name})
      on conflict (id) do nothing`;

    return res.status(201).json({ id });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: `${req.method} not allowed.` });
}
