import type { VercelRequest, VercelResponse } from '@vercel/node';
import { settlementPairs } from '../../src/lib/collection.js';
import { overCapMessage, visibleLedger } from '../../src/lib/joinedSessions.js';
import { getUserId, loadLedger, loadSessions, lockSessionRole, pool } from '../_shared.js';
import { parsePaymentsInput, parseSessionIdQuery } from '../_validate.js';

/**
 * `POST` records one or more payments on one finished session, all or nothing.
 * A single payment and "Mark all as paid" are the same request, so a failure
 * never leaves a card half marked.
 *
 * The organizer may record on any line. A participant only on lines where they
 * are the creditor, because only the person paid can say they were paid; the
 * debtor says "I've paid" through `/api/claims` instead (BR-C3).
 *
 * The ids are minted by the client, so a retry after a timeout finds its
 * payments already recorded and returns success rather than recording them
 * twice. Everything else is checked against the stored session under a lock
 * on its row: the line must exist, and the payment must fit what is open on
 * it, which is what is left minus what is pending, even if another device paid
 * the same line a moment ago (BR-12). Capping at open means a pending claim can
 * always still be confirmed (BR-C13).
 *
 * `DELETE ?sessionId=` removes every payment of one session in one statement,
 * which is how "already settled" is undone: all or nothing, so a session is
 * never left half settled. It is the organizer's alone.
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

  if (req.method === 'DELETE') {
    const sessionId = parseSessionIdQuery(req.query.sessionId);
    if (sessionId === null) return res.status(400).json({ error: 'A session id is required.' });
    const client = await pool.connect();
    try {
      await client.sql`begin`;
      const access = await lockSessionRole(client, userId, sessionId);
      // Covers another account's id, and a session deleted since it was opened.
      if (access === null) {
        await client.sql`rollback`;
        return res.status(404).json({ error: 'No such session.' });
      }
      if (access.role === 'participant') {
        await client.sql`rollback`;
        return res.status(403).json({
          error: 'Only the organizer can undo “already settled”.',
          code: 'organizer_only',
        });
      }
      await client.sql`delete from session_payments where session_id = ${sessionId}`;
      await client.sql`commit`;
      // Nothing left to delete still means it's done.
      return res.status(204).end();
    } catch (err) {
      await client.sql`rollback`;
      throw err;
    } finally {
      client.release();
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, DELETE');
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
    // can't change the session halfway through. No relation covers another
    // account's id as well as a session deleted meanwhile.
    const access = await lockSessionRole(client, userId, sessionId);
    if (access === null) {
      await client.sql`rollback`;
      return res.status(404).json({ error: 'No such session.' });
    }
    // Checked before the retry check, because it depends on the request alone.
    if (access.role === 'participant' && payments.some((p) => p.creditor !== access.member)) {
      await client.sql`rollback`;
      return res
        .status(403)
        .json({ error: 'You can only record payments owed to you.', code: 'not_your_line' });
    }
    const { rows: statusRows } = await client.sql<{ status: string }>`
      select status from expense_sessions where id = ${sessionId}`;

    const ledger = await loadLedger(client, sessionId);
    /** A 409 that refuses a ledger write carries the ledger as this caller may see it (RC-7). */
    const refuse = async (body: { error: string; code: string }) => {
      const visible = visibleLedger(access, ledger.payments, ledger.claims, userId);
      await client.sql`rollback`;
      return res.status(409).json({ ...body, payments: visible.payments, claims: visible.claims });
    };

    // An id already stored is a retry of a request that landed: it skips
    // every check and isn't inserted again.
    const stored = new Set(ledger.payments.map((p) => p.id));
    const fresh = payments.filter((p) => !stored.has(p.id));
    if (fresh.length === 0) {
      await client.sql`commit`;
      return res.status(201).json({ ids: payments.map((p) => p.id) });
    }

    // An id lives in exactly one of the payments and the claims (BR-C7), so a payment can't take
    // the id of a claim, whose confirm would then have nowhere to go.
    const freshIds = fresh.map((p) => p.id) as unknown as string;
    const { rows: claimHits } = await client.sql`
      select id from payment_claims where id = any(${freshIds}::text[])`;
    if (claimHits.length > 0) {
      return refuse({ error: 'That payment id is already in use.', code: 'id_conflict' });
    }

    if (statusRows[0]?.status !== 'closed') {
      return refuse({ error: "This session isn't finished yet.", code: 'not_finished' });
    }

    // Read after the lock, so it sees the session as committed. `joined` finds a participant's
    // session too; the settlement lines need only the members and records, which a participant
    // is sent whole.
    const [session] = await loadSessions(userId, sessionId, true);
    const pairs = settlementPairs(session);

    for (const entry of fresh) {
      const pair = pairs.find((p) => p.debtor === entry.debtor && p.creditor === entry.creditor);
      if (!pair) {
        return refuse({ error: "That line isn't in this session any more.", code: 'not_a_line' });
      }
      const onPair = (r: { debtor: string; creditor: string }) =>
        r.debtor === entry.debtor && r.creditor === entry.creditor;
      const paid = ledger.payments.filter(onPair).reduce((sum, r) => sum + r.amountCents, 0);
      const pending = ledger.claims
        .filter((c) => c.status === 'pending' && onPair(c))
        .reduce((sum, c) => sum + c.amountCents, 0);
      const remaining = Math.max(0, pair.amountCents - paid);
      const open = Math.max(0, remaining - pending);
      if (entry.amountCents > open) {
        // The ledger travels with the refusal, so the device can show the line as it really
        // stands without a reload (AC-7.12).
        return refuse({ error: overCapMessage(remaining, open), code: 'over_remaining' });
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
