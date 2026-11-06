import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureUser, getUserId, pool } from './_shared.js';
import { parseProfileInput } from './_validate.js';
import { NICKNAMES_MAX, applyProfileUpdate } from '../src/lib/profileName.js';

/**
 * The account's own record: whether onboarding is done, and the profile name
 * and other names Collection matches against each session's members.
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
    const { rows } = await pool.sql`
      select onboarded_at, display_name, nicknames from users where id = ${userId}`;
    const onboardedAt = rows[0]?.onboarded_at ?? null;
    return res.status(200).json({
      onboardedAt: onboardedAt === null ? null : new Date(onboardedAt).toISOString(),
      displayName: rows[0]?.display_name ?? null,
      nicknames: rows[0]?.nicknames ?? [],
    });
  }

  if (req.method === 'PUT') {
    await ensureUser(userId);
    // Finished and skipped are the same outcome: they have seen it.
    await pool.sql`update users set onboarded_at = now() where id = ${userId}`;
    const { rows } = await pool.sql`select onboarded_at from users where id = ${userId}`;
    return res.status(200).json({ onboardedAt: new Date(rows[0].onboarded_at).toISOString() });
  }

  if (req.method === 'PATCH') {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
    const input = parseProfileInput(raw);
    if (!input) return res.status(400).json({ error: 'Malformed profile.' });

    await ensureUser(userId);
    const client = await pool.connect();
    try {
      await client.sql`begin`;
      // The row is the caller's own, so the id is the whole ownership check.
      // Locking it applies two remembers, from two devices, one after the
      // other, so neither one's name is lost to the other's read.
      const { rows } = await client.sql`
        select display_name, nicknames from users where id = ${userId} for update`;
      const next = applyProfileUpdate(
        { displayName: rows[0]?.display_name ?? null, nicknames: rows[0]?.nicknames ?? [] },
        input,
      );
      if (next === null) {
        await client.sql`rollback`;
        return res.status(409).json({
          error: `You can keep up to ${NICKNAMES_MAX} other names.`,
          code: 'too_many_names',
        });
      }
      // The driver sends a JS array as a Postgres array literal, but the
      // template's types only list primitives, hence the cast on the value. The
      // SQL cast makes an empty array unambiguous to Postgres.
      const nicknames = next.nicknames as unknown as string;
      await client.sql`
        update users set display_name = ${next.displayName}, nicknames = ${nicknames}::text[]
        where id = ${userId}`;
      await client.sql`commit`;
      return res.status(200).json({ displayName: next.displayName, nicknames: next.nicknames });
    } catch (err) {
      await client.sql`rollback`;
      throw err;
    } finally {
      client.release();
    }
  }

  res.setHeader('Allow', 'GET, PUT, PATCH');
  return res.status(405).json({ error: `${req.method} not allowed.` });
}
