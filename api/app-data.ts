import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPool } from '@vercel/postgres';
import { verifyToken } from '@clerk/backend';
import { EMPTY_DATA, parseAppData, serializeAppData } from '../src/lib/storage.js';

/**
 * One row per account holding that account's whole `AppData` blob.
 *
 * The app already reads and writes its state as a single JSON document, so the
 * server stores it the same way rather than shredding it into a relational
 * schema it would only have to reassemble. `parseAppData` is the same validator
 * the browser uses, which is what makes trusting the column safe.
 */

/**
 * `POSTGRES_DATABASE_URL` is managed by the Vercel-Neon integration and applies
 * to every environment, so it cannot be pointed at a different database per
 * stage. `HATI_DATABASE_URL` is ours to scope per preview branch, which is how
 * SIT and QAT get their own Neon branch; it wins where it is set, and the
 * integration's own variable remains the default everywhere else.
 */
const pool = createPool({
  connectionString: process.env.HATI_DATABASE_URL ?? process.env.POSTGRES_DATABASE_URL,
});

/** The Clerk user id behind this request, or null if it isn't authenticated. */
async function getUserId(req: VercelRequest): Promise<string | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set');

  try {
    const claims = await verifyToken(header.slice('Bearer '.length), { secretKey });
    return claims.sub ?? null;
  } catch {
    // A token that fails verification is indistinguishable from none at all.
    return null;
  }
}

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
    const { rows } = await pool.sql`select data from app_data where user_id = ${userId}`;
    // A new account has no row yet, which is not an error — it is an empty app.
    return res.status(200).json(rows[0]?.data ?? EMPTY_DATA);
  }

  if (req.method === 'PUT') {
    // Never store what the client sent verbatim: run it through the same
    // defensive parser the browser uses, so a malformed or hostile body is
    // reduced to something the app can actually load.
    const data = parseAppData(
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? null),
    );
    const serialized = serializeAppData(data);

    await pool.sql`
      insert into app_data (user_id, data, updated_at)
      values (${userId}, ${serialized}::jsonb, now())
      on conflict (user_id) do update set data = excluded.data, updated_at = now()
    `;
    return res.status(200).json(data);
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: `${req.method} not allowed.` });
}
