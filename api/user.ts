import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureUser, getUserId, pool } from './_shared.js';

/**
 * The account's own record, which today holds only whether onboarding is done.
 *
 * `GET` is the first call the app makes after sign-in, and it upserts the
 * `users` row — until now nothing guaranteed one existed before a session was
 * created, which left a foreign key depending on luck.
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
    await ensureUser(userId);
    const { rows } = await pool.sql`select onboarded_at from users where id = ${userId}`;
    const onboardedAt = rows[0]?.onboarded_at ?? null;
    return res.status(200).json({
      onboardedAt: onboardedAt === null ? null : new Date(onboardedAt).toISOString(),
    });
  }

  if (req.method === 'PUT') {
    await ensureUser(userId);
    // Finished and skipped are the same outcome: they have seen it.
    await pool.sql`update users set onboarded_at = now() where id = ${userId}`;
    const { rows } = await pool.sql`select onboarded_at from users where id = ${userId}`;
    return res.status(200).json({ onboardedAt: new Date(rows[0].onboarded_at).toISOString() });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: `${req.method} not allowed.` });
}
