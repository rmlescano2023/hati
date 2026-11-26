import type { VercelRequest, VercelResponse } from '@vercel/node';
import { settlementPairs } from '../src/lib/collection.js';
import {
  overCapMessage,
  overConfirmMessage,
  visibleLedger,
  type ClaimRow,
} from '../src/lib/joinedSessions.js';
import type { VercelPoolClient } from '@vercel/postgres';
import type { Payment } from '../src/types';
import {
  getUserId,
  loadLedger,
  loadSessions,
  lockSessionRole,
  pool,
  type SessionAccess,
} from './_shared.js';
import { parseClaimDecision, parseClaimIdQuery, parseClaimsInput } from './_validate.js';

const NOT_PENDING = {
  error: 'This payment is no longer waiting. It may have been withdrawn.',
  code: 'not_pending',
} as const;

/** What a pair has paid and has pending, from the rows read under the lock. */
function pairTotals(
  ledger: { payments: Payment[]; claims: ClaimRow[] },
  debtor: string,
  creditor: string,
) {
  const onPair = <T extends { debtor: string; creditor: string }>(rows: T[]) =>
    rows.filter((r) => r.debtor === debtor && r.creditor === creditor);
  const paid = onPair(ledger.payments).reduce((sum, p) => sum + p.amountCents, 0);
  const pending = onPair(ledger.claims)
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + c.amountCents, 0);
  return { paid, pending };
}

/**
 * `POST` says "I've paid", one claim or Mark all's batch, all or nothing. `PATCH` confirms or
 * declines one. `DELETE` withdraws a pending claim, or dismisses a declined one.
 *
 * A claim is money in waiting, kept apart from `session_payments`, which holds only what is
 * confirmed. Confirming moves it across under the same id and the time the debtor sent it. Every
 * write locks the session row first and decides on what it reads after the lock, so two people
 * acting on one claim are taken one at a time and the second is told what the first did. Every
 * refusal that concerns the ledger carries the ledger as the caller may see it, so the screen can
 * redraw without a reload, and a participant is never sent a line that isn't theirs.
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

  if (req.method !== 'POST' && req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, PATCH, DELETE');
    return res.status(405).json({ error: `${req.method} not allowed.` });
  }

  if (req.method === 'POST') return post(userId, req, res);
  if (req.method === 'PATCH') return patch(userId, req, res);
  return remove(userId, req, res);
}

type Client = VercelPoolClient;

/** Runs one request in a transaction on its own connection, rolling back on anything thrown. */
async function transaction(run: (client: Client) => Promise<unknown>) {
  const client = await pool.connect();
  try {
    await client.sql`begin`;
    return await run(client);
  } catch (err) {
    await client.sql`rollback`;
    throw err;
  } finally {
    client.release();
  }
}

/** A 409 that refuses a ledger write and carries the ledger the caller may see. */
async function refuse409(
  client: Client,
  res: VercelResponse,
  userId: string,
  access: SessionAccess,
  sessionId: string,
  body: { error: string; code: string },
) {
  const ledger = await loadLedger(client, sessionId);
  const visible = visibleLedger(access, ledger.payments, ledger.claims, userId);
  await client.sql`rollback`;
  return res.status(409).json({ ...body, payments: visible.payments, claims: visible.claims });
}

async function post(userId: string, req: VercelRequest, res: VercelResponse) {
  const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
  const input = parseClaimsInput(raw);
  if (!input) return res.status(400).json({ error: 'Malformed claim.' });
  const { sessionId, claims } = input;

  return transaction(async (client) => {
    const access = await lockSessionRole(client, userId, sessionId);
    if (access === null) {
      await client.sql`rollback`;
      return res.status(404).json({ error: 'No such session.' });
    }
    // The organizer records directly (BR-C1), and a participant claims only on their own lines.
    if (access.role === 'owner') {
      await client.sql`rollback`;
      return res
        .status(403)
        .json({ error: 'The organizer records payments directly.', code: 'organizer_records' });
    }
    if (claims.some((c) => c.debtor !== access.member)) {
      await client.sql`rollback`;
      return res
        .status(403)
        .json({ error: 'You can only say you paid on your own lines.', code: 'not_your_line' });
    }

    const { rows: status } = await client.sql<{ status: string }>`
      select status from expense_sessions where id = ${sessionId}`;
    if (status[0]?.status !== 'closed') {
      return refuse409(client, res, userId, access, sessionId, {
        error: "This session isn't finished yet.",
        code: 'not_finished',
      });
    }

    const ledger = await loadLedger(client, sessionId);
    // A retry of a request that landed finds its claim already stored, or already confirmed into a
    // payment of the same pair and amount: both are done, so neither is checked or inserted again.
    const fresh = claims.filter((c) => {
      const mine = ledger.claims.find((k) => k.id === c.id);
      if (mine) return mine.claimedBy !== userId;
      const paid = ledger.payments.find((p) => p.id === c.id);
      return !(
        paid &&
        paid.debtor === c.debtor &&
        paid.creditor === c.creditor &&
        paid.amountCents === c.amountCents
      );
    });
    if (fresh.length === 0) {
      await client.sql`commit`;
      return res.status(201).json({ ids: claims.map((c) => c.id) });
    }

    // An id lives in exactly one of the two tables (4.3). Ids are minted by the client, so a clash
    // is a bug or a forged request, never chance, and is refused rather than skipped.
    const freshIds = fresh.map((c) => c.id) as unknown as string;
    const { rows: paymentHits } = await client.sql`
      select id from session_payments where id = any(${freshIds}::text[])`;
    const { rows: claimHits } = await client.sql`
      select id from payment_claims where id = any(${freshIds}::text[])`;
    if (paymentHits.length > 0 || claimHits.length > 0) {
      return refuse409(client, res, userId, access, sessionId, {
        error: 'That payment id is already in use.',
        code: 'id_conflict',
      });
    }

    const [session] = await loadSessions(userId, sessionId, true);
    const pairs = settlementPairs(session);
    for (const entry of fresh) {
      const pair = pairs.find((p) => p.debtor === entry.debtor && p.creditor === entry.creditor);
      if (!pair) {
        return refuse409(client, res, userId, access, sessionId, {
          error: "That line isn't in this session any more.",
          code: 'not_a_line',
        });
      }
      const { paid, pending } = pairTotals(ledger, entry.debtor, entry.creditor);
      const remaining = Math.max(0, pair.amountCents - paid);
      const open = Math.max(0, remaining - pending);
      if (entry.amountCents > open) {
        return refuse409(client, res, userId, access, sessionId, {
          error: overCapMessage(remaining, open),
          code: 'over_remaining',
        });
      }
    }

    for (const c of fresh) {
      await client.sql`
        insert into payment_claims (id, session_id, debtor, creditor, amount_cents, claimed_by)
        values (${c.id}, ${sessionId}, ${c.debtor}, ${c.creditor}, ${c.amountCents}, ${userId})`;
    }
    await client.sql`commit`;
    return res.status(201).json({ ids: claims.map((c) => c.id) });
  });
}

/** The session a claim or payment id belongs to, from a plain read, or null. A row's session never changes. */
async function sessionOf(id: string): Promise<string | null> {
  const { rows: claim } = await pool.sql<{ session_id: string }>`
    select session_id from payment_claims where id = ${id}`;
  if (claim.length > 0) return claim[0].session_id;
  const { rows: payment } = await pool.sql<{ session_id: string }>`
    select session_id from session_payments where id = ${id}`;
  return payment[0]?.session_id ?? null;
}

async function patch(userId: string, req: VercelRequest, res: VercelResponse) {
  const raw = typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body;
  const input = parseClaimDecision(raw);
  if (!input) return res.status(400).json({ error: 'Malformed decision.' });
  const { id, decision } = input;

  const sessionId = await sessionOf(id);
  if (sessionId === null) return res.status(404).json(NOT_PENDING);

  return transaction(async (client) => {
    const access = await lockSessionRole(client, userId, sessionId);
    // No relation answers exactly as a claim that isn't there, so the answer never says which.
    if (access === null) {
      await client.sql`rollback`;
      return res.status(404).json(NOT_PENDING);
    }
    const notDecider = async () => {
      await client.sql`rollback`;
      return res
        .status(403)
        .json({ error: 'Only the person who was paid can confirm this.', code: 'not_decider' });
    };

    // Everything below is decided on what is read now, under the lock.
    const { rows } = await client.sql<{
      id: string;
      debtor: string;
      creditor: string;
      amount_cents: number;
      status: 'pending' | 'declined';
      created_at: Date | string;
    }>`
      select id, debtor, creditor, amount_cents, status, created_at
      from payment_claims where id = ${id} and session_id = ${sessionId}`;
    const claim = rows[0];

    // Who may decide comes first, whatever state the claim is in: a participant who isn't the one
    // paid is refused before they can learn whether it is pending, declined or confirmed (BR-C2).
    // The organizer may decide any claim.
    if (claim && access.role === 'participant' && claim.creditor !== access.member) {
      return notDecider();
    }

    if (!claim) {
      const { rows: confirmed } = await client.sql<{ creditor: string }>`
        select creditor from session_payments where id = ${id} and session_id = ${sessionId}`;
      if (confirmed.length === 0) {
        await client.sql`rollback`;
        return res.status(404).json(NOT_PENDING);
      }
      if (access.role === 'participant' && confirmed[0].creditor !== access.member) {
        return notDecider();
      }
      // Someone else confirmed it first. A replayed confirm is safe; a decline is too late.
      if (decision === 'confirm') {
        await client.sql`commit`;
        return res.status(200).json({ decision });
      }
      return refuse409(client, res, userId, access, sessionId, {
        error: 'This payment has already been confirmed.',
        code: 'already_confirmed',
      });
    }
    if (claim.status !== 'pending') {
      return refuse409(client, res, userId, access, sessionId, {
        error: 'This payment is no longer waiting.',
        code: 'not_pending',
      });
    }
    if (decision === 'decline') {
      await client.sql`
        update payment_claims set status = 'declined', decided_at = now() where id = ${id}`;
      await client.sql`commit`;
      return res.status(200).json({ decision });
    }

    // Confirm re-checks the line: only confirmed money counts here, because the claim itself is
    // part of what is pending (BR-C12). A line can never be overpaid through a claim.
    const ledger = await loadLedger(client, sessionId);
    const [session] = await loadSessions(userId, sessionId, true);
    const pair = settlementPairs(session).find(
      (p) => p.debtor === claim.debtor && p.creditor === claim.creditor,
    );
    const { paid } = pairTotals(ledger, claim.debtor, claim.creditor);
    const remaining = Math.max(0, (pair?.amountCents ?? 0) - paid);
    if (claim.amount_cents > remaining) {
      return refuse409(client, res, userId, access, sessionId, {
        error: overConfirmMessage(remaining, claim.debtor),
        code: 'over_remaining',
      });
    }

    const { rowCount } = await client.sql`
      insert into session_payments (id, session_id, debtor, creditor, amount_cents, created_at)
      values (${claim.id}, ${sessionId}, ${claim.debtor}, ${claim.creditor}, ${claim.amount_cents}, ${iso(claim.created_at)})
      on conflict (id) do nothing`;
    if (rowCount === 0) {
      return refuse409(client, res, userId, access, sessionId, {
        error: 'That payment id is already in use.',
        code: 'id_conflict',
      });
    }
    await client.sql`delete from payment_claims where id = ${id}`;
    await client.sql`commit`;
    return res.status(200).json({ decision });
  });
}

const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : String(v));

async function remove(userId: string, req: VercelRequest, res: VercelResponse) {
  const id = parseClaimIdQuery(req.query.id);
  if (id === null) return res.status(400).json({ error: 'A claim id is required.' });

  const sessionId = await sessionOf(id);
  // Not there at all: it was withdrawn already, which is what was asked.
  if (sessionId === null) return res.status(404).json({ error: 'No such claim.' });

  return transaction(async (client) => {
    const access = await lockSessionRole(client, userId, sessionId);
    if (access === null) {
      await client.sql`rollback`;
      return res.status(404).json({ error: 'No such claim.' });
    }

    const { rows } = await client.sql<{ claimed_by: string }>`
      select claimed_by from payment_claims where id = ${id} and session_id = ${sessionId}`;
    if (rows.length === 0) {
      const { rows: confirmed } = await client.sql<{ creditor: string }>`
        select creditor from session_payments where id = ${id} and session_id = ${sessionId}`;
      if (confirmed.length > 0) {
        return refuse409(client, res, userId, access, sessionId, {
          error: `${confirmed[0].creditor} has already confirmed this payment.`,
          code: 'already_confirmed',
        });
      }
      await client.sql`commit`;
      return res.status(204).end();
    }
    if (rows[0].claimed_by !== userId) {
      await client.sql`rollback`;
      return res
        .status(403)
        .json({ error: 'Only the person who sent it can take it back.', code: 'not_yours' });
    }
    await client.sql`delete from payment_claims where id = ${id}`;
    await client.sql`commit`;
    return res.status(204).end();
  });
}
