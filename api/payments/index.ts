import type { VercelRequest, VercelResponse } from '@vercel/node';
import { formatCents, settlementPairs } from '../../src/lib/collection.js';
import type { Payment } from '../../src/types';
import { getUserId, loadSessions, pool } from '../_shared.js';
import { parsePaymentsInput } from '../_validate.js';

type PaymentRow = {
  id: string;
  debtor: string;
  creditor: string;
  amount_cents: number;
  created_at: Date | string;
};

const toPayment = (row: PaymentRow): Payment => ({
  id: row.id,
  debtor: row.debtor,
  creditor: row.creditor,
  amountCents: row.amount_cents,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
});

/**
 * `POST` records one or more payments on one finished session, all or nothing.
 * A single payment and "Mark all as paid" are the same request, so a failure
 * never leaves a card half marked.
 *
 * The ids are minted by the client, so a retry after a timeout finds its
 * payments already recorded and returns success rather than recording them
 * twice. Everything else is checked against the stored session under a lock
 * on its row: the line must exist, and the payment must fit what is left on
 * it, even if another device paid the same line a moment ago (BR-12).
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

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: `${req.method} not allowed.` });
  }

  const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
  const input = parsePaymentsInput(raw);
  if (!input) return res.status(400).json({ error: 'Malformed payment.' });
  const { sessionId, payments } = input;

  const client = await pool.connect();
  try {
    await client.sql`begin`;
    // Two devices paying on one session are checked one at a time, and a save
    // can't change the session halfway through. No row covers another
    // account's id as well as a session deleted meanwhile.
    const { rows: owned } = await client.sql<{ status: string }>`
      select status from expense_sessions
      where id = ${sessionId} and user_id = ${userId}
      for update`;
    if (owned.length === 0) {
      await client.sql`rollback`;
      return res.status(404).json({ error: 'No such session.' });
    }

    const { rows: existingRows } = await client.sql<PaymentRow>`
      select id, debtor, creditor, amount_cents, created_at
      from session_payments
      where session_id = ${sessionId}
      order by created_at, id`;
    // An id already stored is a retry of a request that landed: it skips
    // every check and isn't inserted again.
    const stored = new Set(existingRows.map((r) => r.id));
    const fresh = payments.filter((p) => !stored.has(p.id));
    if (fresh.length === 0) {
      await client.sql`commit`;
      return res.status(201).json({ ids: payments.map((p) => p.id) });
    }

    if (owned[0].status !== 'closed') {
      await client.sql`rollback`;
      return res
        .status(409)
        .json({ error: "This session isn't finished yet.", code: 'not_finished' });
    }

    // Read after the lock, so it sees the session as committed.
    const [session] = await loadSessions(userId, sessionId);
    const pairs = settlementPairs(session);

    for (const entry of fresh) {
      const pair = pairs.find((p) => p.debtor === entry.debtor && p.creditor === entry.creditor);
      if (!pair) {
        await client.sql`rollback`;
        return res
          .status(409)
          .json({ error: "That line isn't in this session any more.", code: 'not_a_line' });
      }
      const paid = existingRows
        .filter((r) => r.debtor === entry.debtor && r.creditor === entry.creditor)
        .reduce((sum, r) => sum + r.amount_cents, 0);
      const remaining = Math.max(0, pair.amountCents - paid);
      if (entry.amountCents > remaining) {
        await client.sql`rollback`;
        // The session's payments travel with the refusal, so the device can
        // show the line as it really stands without a reload (AC-7.12).
        return res.status(409).json({
          error:
            remaining === 0
              ? 'This line is already paid in full.'
              : `Only ${formatCents(remaining)} is left on this line.`,
          code: 'over_remaining',
          payments: existingRows.map(toPayment),
        });
      }
    }

    for (const p of fresh) {
      const { rowCount } = await client.sql`
        insert into session_payments (id, session_id, debtor, creditor, amount_cents)
        values (${p.id}, ${sessionId}, ${p.debtor}, ${p.creditor}, ${p.amountCents})
        on conflict (id) do nothing`;
      // The id belongs to another session's payment: practically impossible
      // with random ids, but never silently skipped.
      if (rowCount === 0) {
        await client.sql`rollback`;
        return res
          .status(409)
          .json({ error: 'That payment id is already in use.', code: 'id_conflict' });
      }
    }

    await client.sql`commit`;
    return res.status(201).json({ ids: payments.map((p) => p.id) });
  } catch (err) {
    await client.sql`rollback`;
    throw err;
  } finally {
    client.release();
  }
}
