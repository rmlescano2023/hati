# Spec: joined sessions, PR 2 ("I've paid" claims, then confirm or decline)

Status: **approved by the owner; owner decisions are recorded in section 13.** Branch `joined-sessions-2`, from
`origin/joined-sessions-1` at `b718d4c` (PR 1 built; review SHIP, QA passed).

**Inputs**, owner-approved and taken as fixed:
- `docs/specs/joined-sessions-requirements.md`: its **PR 2 section** (US-20 to US-29, BR-C1 to
  BR-C20, E2-1 to E2-11), the shared definitions (section 0), the onboarding section, and the
  owner's answers:
  - Q2: What's new v3 ships with PR 2;
  - Q3: the organizer's confirm on someone else's line has no undo, and is guarded by "Confirm
    this payment?";
  - Q4: PR 1 and PR 2 go to uat together.
- `docs/specs/joined-sessions-architecture.md`: option A1, a separate `payment_claims` table, and
  owner decisions D1 to D10.
- `docs/specs/joined-sessions.md`, the PR 1 spec. Its assumptions A1 to A8 were accepted.

**PR 1 fix round 2** is being made on `joined-sessions-1` while this is written:
- the B1 PUT-answer revert;
- the agent definitions;
- UX tweaks U1, U2, U3, U4 and U6;
- the invite preview's `onHati` narrowed to claimed members only, with a new `unavailable` list
  that still includes the organizer's own member.

This spec depends on only the last of these. The organizer's own member stays unclaimable
(BR-J4). Only the "on Hati" label changed. **Task 0 merges the latest `joined-sessions-1` into
this branch before anything else**, so PR 2 is built on top of the fix round.

**No schema change.** `payment_claims` (PR 1, section 3) already has every column PR 2 uses:
- `id`, `session_id`, `debtor`, `creditor`, `amount_cents`;
- `claimed_by`, with its cascade;
- `status` (`pending` or `declined`), `created_at` and `decided_at`;
- the session index.

The cross-table id rule (section 4.3) is enforced under the session lock, not by a constraint.
Nothing in this spec touches the database outside the app's own requests.

## 1. Summary

In PR 1 a member can join and look. PR 2 lets them act on the money:

- **A debtor says "I've paid ₱X".** Their claim is **pending**. It shows on both sides beside the
  figures, never in them, until it's confirmed, declined or withdrawn.
- **The creditor confirms or declines it.** When the creditor has no account on the session, the
  organizer does, from a new "To confirm for others" group. Confirming turns the claim into a
  payment, under the same id and with the time the debtor sent it. Declining leaves a "Not
  confirmed" note that only the debtor sees, until they dismiss it.
- **A creditor participant records payments directly** on their own Owed to you lines, and can
  undo them, as an organizer can today.
- **Money rules.**
  - Totals, statuses, "X of Y settled", the Settled date and the strip count confirmed money only
    (BR-C14).
  - Every new claim and every direct payment is capped at **remaining minus pending**, so a
    pending claim can always be confirmed (BR-C11, BR-C13).
  - A confirm re-checks the line under the lock, and refuses with 409 `over_remaining` if less is
    left (BR-C12).
  - A card with a claim waiting on you is never in Settled (BR-C15).
- **Mark all as paid on a joined card** sends one batch of claims and one batch of payments, each
  all or nothing.
- **Stop tracking and Remove** delete the claims that account sent (BR-C17).
- **What's new v3** announces joined sessions once (Q2).

**Assumptions** (veto any before approving):

- **A1. Who decides, from the participant's side.** A participant's waiting text names the
  creditor when the creditor has an account on the session, and the organizer otherwise (BR-C19).
  An account means a participant joined as them, or they're the organizer's stored pick. A joined
  session therefore carries `withAccount`: the members with an account, without saying which one
  is the organizer. That's the "which members are on Hati" the architect listed for participants,
  used only to choose the name. It's never shown as a label, which keeps the fix round's rule that
  only joined members are labelled "on Hati".
- **A2. The organizer's member means the stored pick only** (requirements section 0). An organizer
  placed by profile name alone has no stored member. A claim to that member is the organizer's to
  decide either way. It shows on the organizer's own line, because that's whose line it is on
  their screen, and the debtor reads "Waiting for {organizer} to confirm".
- **A3. Refusal copy** for cases the requirements don't word:
  - **The server's cap message:**
    - "This line is already paid in full." when nothing is left;
    - "What's left on this line is already waiting for confirmation." when pending claims cover
      it;
    - otherwise "Only ₱X is left on this line.", as today.
  - **A confirm when nothing is left:** "This line is already paid in full, so this can't be
    confirmed. Decline it." AC-21.5's wording is kept whenever something is left.
- **A4. Banner copy for ledger writes that fail away from their line:**
  - "Couldn't send what you've paid to {creditor} in “{title}”. Try again.";
  - "Couldn't confirm the payment from {debtor}. Try again.";
  - "Couldn't decline the payment from {debtor}. Try again.";
  - "Couldn't withdraw your payment to {creditor}. Try again.";
  - "Couldn't dismiss the note about your payment to {creditor}. Try again.";
  - and AC-27.4's batch message for Mark all.
- **A5. An Outstanding card with no lines of its own but claims to confirm** (E2-7) shows only "{N}
  payment(s) to confirm" in its summary, not "0 of 0 settled".

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Types | `src/types/index.ts` | `Claim`, `NewClaim`, `ClaimDecision`; `Session` gains optional `claims` and `withAccount` | `Payment`'s shape |
| Schema | — | **none** | `payment_claims` from PR 1 |
| Pure logic | `src/lib/joinedSessions.ts` | `visibleLedger` (the D1 rule for payments and claims, used by `participantView` and every 409 body); `participantView` gains `withAccount`; the decider and copy builders | `unavailableMembers` (fix round) |
| Pure logic | `src/lib/collection.ts` | lines gain `claims`, `declined`, `pendingCents`, `openCents`; cards gain `forOthers`, `toConfirmCount`, `waitingCents` and the two open sums; bucket and `offersAlreadySettled` rules; `openLinePayments` and `markAllMessage` use open amounts; `joinedMarkAll`; `parseLineAmount`; `membersWithAccount`; `newClaims`; `mergeServerPayments` becomes generic over `{ id }` | `buildLine`, `parsePaymentAmount`, `formatCents`, `newPayments` |
| Pure logic | `src/lib/writeQueue.ts` | `keepLocalClaims` | `keepLocalPayments` |
| Pure logic | `src/lib/whatsNew.ts` | `WHATS_NEW_VERSION = 3` | — |
| API | `api/_shared.ts` | `loadSessions` loads claims; query B selects `s.me as organizer_me` for `withAccount` only; `loadLedger(client, sessionId)` for the write routes | `loadContent`, `lockSessionRole`, `participantView` |
| API | `api/_validate.ts` | `parseClaimsInput`, `parseClaimDecision`, `parseClaimIdQuery` | `parsePaymentsInput`'s rules |
| API | `api/claims.ts` **(new)** | `POST` claim, `PATCH` confirm or decline, `DELETE` withdraw or dismiss | `lockSessionRole`, `loadSessions`, `settlementPairs`, `formatCents` |
| API | `api/payments/index.ts` | `lockSessionRole` in place of the owner lock; participant creditors may record on their own lines; the cap counts pending claims; ids may not collide with claims; Undo "already settled" is organizer-only | `parsePaymentsInput` |
| API | `api/payments/[id].ts` | locks the session; participant creditors may undo on their own lines | `lockSessionRole` |
| API | `api/participants.ts` | Remove and Stop tracking also delete the claims that account sent | — |
| Client state | `src/hooks/useServerSessions.ts` | `addClaims`, `decideClaim`, `removeClaim`; the load keeps local claims; `addPayments`' 409 merge refreshes claims too | `paying`, `adding`, `removing`, `settledDuringLoad`, `writeOrder`, `paymentFailed` |
| Client state | `src/hooks/useMemorySessions.ts`, `src/context/SessionsStoreContext.tsx` | the three methods (no-ops in memory) and their pass-through | — |
| UI | `src/components/collection/LineRow.tsx` (+ css) | `readOnly` becomes `joined` plus `decider`; claim buttons and form; pending, declined and to-confirm entries; Confirm, Decline, Withdraw, Dismiss; caps at `openCents` | `ConfirmDialog`, `FailedPayment` |
| UI | `src/components/collection/CollectionCard.tsx` (+ css) | the summary's waiting and to-confirm parts; "To confirm for others"; Mark all on joined cards; Stop tracking's and Remove's extra sentences; the BR-V11 line goes | `MarkAll`, `ConfirmDialog` |
| UI | `src/components/collection/InviteMembersDialog.tsx` | Remove's extra sentence (AC-29.3) | `removeMessage` |
| UI | `src/components/collection/StopTrackingButton.tsx` | Stop tracking's extra sentence (AC-29.2) | `stopTrackingMessage` |
| UI | `src/App.tsx` | What's new v3 text and buttons | `OnboardingDialog` |
| Tests | see section 8 | — | — |

**Not touched:**
- the schema, `api/invites.ts`, `api/sessions/*` and `api/user.ts`;
- all of `src/pdf/`, the join flow, History, and `src/lib/storage.ts` (`claims` is optional, so
  `parseSession` never sets it and a PUT body can't carry one);
- the guide scenes, engine and steps, and `OnboardingTour.tsx`.

**Vercel Functions:** 7 → 8 (`api/claims.ts`).

## 3. Data model

None. Section 4 lists what each route reads and writes in `payment_claims`. A claim's life:

- **Inserted** pending by the debtor participant (POST).
- **Confirmed:** moved to `session_payments` with the same `id`, `debtor`, `creditor`,
  `amount_cents` and `created_at`, then deleted.
- **Declined:** `status = 'declined'` and `decided_at = now()`. The row stays until the debtor
  dismisses it, or leaves or is removed.
- **Withdrawn or dismissed:** deleted by its sender.
- **Removed with its sender:** when the sender leaves or is removed. The FK cascades cover a
  deleted session and a deleted account.

## 4. API contract

PR 1's rules hold:
- `getUserId` (401 and 500);
- validation in `api/_validate.ts`;
- `pool.sql` or `client.sql` only;
- `.js` imports from `src/`.

### 4.1 Access, and every 403 and 409 code

Access follows PR 1's CLAUDE.md rule: no relation is a 404; a participant asking for something
their role doesn't allow is a 403 with a `code`. All codes in the feature after PR 2:

| Status and `code` | Route | When |
|---|---|---|
| 403 `not_your_line` | `POST /api/payments` | a participant's entry whose `creditor` isn't their member (the debtor side included) |
| 403 `not_your_line` | `DELETE /api/payments/:id` | a participant undoing a payment whose `creditor` isn't their member |
| 403 `organizer_only` | `DELETE /api/payments?sessionId=` | a participant undoing "already settled" |
| 403 `organizer_records` | `POST /api/claims` | the organizer: they record directly (BR-C1) |
| 403 `not_your_line` | `POST /api/claims` | a participant's claim whose `debtor` isn't their member |
| 403 `not_decider` | `PATCH /api/claims` | a participant who isn't the claim's creditor, including the debtor deciding their own claim (BR-C2) |
| 403 `not_yours` | `DELETE /api/claims?id=` | someone other than the sender withdrawing or dismissing (BR-C5) |
| 403 `not_yours` | `DELETE /api/participants` | unchanged from PR 1 |
| 409 `not_finished` | payments and claims POST | unchanged; can't happen for a joined session |
| 409 `not_a_line` | payments and claims POST | the pair isn't a settlement line |
| 409 `over_remaining` | payments and claims POST, claims PATCH (confirm) | more than the cap (4.4) |
| 409 `id_conflict` | payments and claims POST, claims PATCH (confirm) | the id is taken by something that isn't this request's own retry (4.3) |
| 409 `not_pending` | `PATCH /api/claims` | the claim was declined, or (404 form) no longer exists (4.6) |
| 409 `already_confirmed` | `PATCH` (decline), `DELETE /api/claims` | the claim has already become a payment |

Every 409 that refuses a ledger write carries
`{ error, code, payments: Payment[], claims: Claim[] }`, the session's ledger as the caller may see
it (`visibleLedger`, 5.1), so the client can redraw the line without a reload. A participant's 409
body never holds a payment or claim off their own lines.

| Action | Owner | Participant, creditor on the line | Participant, debtor on the line | No relation |
|---|---|---|---|---|
| Record payments, Mark all (`POST /api/payments`) | any line, capped (4.4) | yes, capped | 403 `not_your_line` | 404 |
| Undo one payment (`DELETE /api/payments/:id`) | any | yes | 403 `not_your_line` | 404 |
| Undo "already settled" (`DELETE /api/payments?sessionId=`) | yes | 403 `organizer_only` | 403 `organizer_only` | 404 |
| "I've paid", Mark all's claims (`POST /api/claims`) | 403 `organizer_records` | 403 `not_your_line` | yes, capped | 404 |
| Confirm or decline (`PATCH /api/claims`) | any claim (the app offers it as BR-C2 says, 6.4) | yes | 403 `not_decider` | 404 |
| Withdraw or dismiss (`DELETE /api/claims?id=`) | 403 `not_yours` | 403 `not_yours` | own claims only | 404 |

### 4.2 Lock order

PR 1's rule (its section 4.2) applies to every route below:
- lock the `expense_sessions` row first, through `lockSessionRole`;
- then touch participants, then claims, then payments;
- one session per transaction;
- `ensureUser` is never inside one.

A route that is given only a claim or payment id finds the session first with a plain read (a
row's `session_id` never changes), then begins and locks. Everything it decides on is re-read
after the lock.

### 4.3 Ids across the two tables

An id lives in **exactly one** of `session_payments` and `payment_claims` at any moment. Confirm
is the only move between them, and it keeps the id. The rule is enforced under the session lock
by these checks:

- **`POST /api/payments`**, for each fresh id (one not already a payment of this session):
  `select id from payment_claims where id = any(${freshList}::text[])`. Any row is 409
  `id_conflict`. The existing insert's `on conflict (id) do nothing` still catches a payment id
  used by another session.
- **`POST /api/claims`**, for each entry:
  - The id is already a claim of **this session sent by this caller**: a retry, skipped (not
    inserted again, no checks).
  - The id is already a **payment of this session with the same pair and amount**: the claim was
    sent and then confirmed before the retry arrived. Skipped as done.
  - The id exists in either table in any other way: 409 `id_conflict`.
- **Confirm:**
  `insert into session_payments (…) values (claim…) on conflict (id) do nothing`. A `rowCount` of
  0 is 409 `id_conflict`. It can't happen while both POSTs check, but it's never silently skipped.

Ids are client-minted `pay_xxx` (`createId('pay')`), so a collision is a bug or a forged request,
never chance.

### 4.4 Caps and the confirm re-check

For a pair, with confirmed payments `paid` and pending claims `P` on that exact pair:
- `remaining = max(0, amount − paid)`;
- `open = max(0, remaining − P)`.

| Write | Each entry must satisfy | Refusal message (A3) |
|---|---|---|
| Payment (`POST /api/payments`), any caller | `amountCents ≤ open` (BR-C13) | `remaining === 0`: "This line is already paid in full." · `open === 0`: "What's left on this line is already waiting for confirmation." · else `Only ${formatCents(open)} is left on this line.` |
| Claim (`POST /api/claims`) | `amountCents ≤ open` (BR-C11) | the same three |
| Confirm (`PATCH`, `confirm`) | `claim.amountCents ≤ remaining`. Only confirmed money counts here, because the claim itself is part of `P` (BR-C12) | `remaining === 0`: "This line is already paid in full, so this can't be confirmed. Decline it." · else `Only ${formatCents(remaining)} is left on this line, so this can't be confirmed. Decline it, or ask ${debtor} to withdraw it and send what's left.` (AC-21.5) |

Each is checked against the rows read **after** the lock, entry by entry in request order, and
earlier entries in the same request don't change `P` or `paid`. The validators reject two entries
on one pair, as today. The refusal is 409 `over_remaining` with the visible ledger.

### 4.5 `GET /api/sessions` (claims and `withAccount`)

**Types (`src/types/index.ts`):**

```ts
/** A joined debtor's "I've paid": pending until confirmed (then a payment) or declined (BR-C6). */
export type Claim = {
  /** Client-minted `pay_xxx`; the payment's id once confirmed. */
  id: string;
  debtor: string;
  creditor: string;
  /** Whole centavos, always above 0. */
  amountCents: number;
  /** ISO time the server stored it: when the debtor says the money moved (BR-C7). */
  createdAt: string;
  status: 'pending' | 'declined';
  /** ISO time it was declined; null while pending. */
  decidedAt: string | null;
  /** Sent by this account. */
  mine: boolean;
};

/** What the client sends to make a claim; the server stamps the time. */
export type NewClaim = Pick<Claim, 'id' | 'debtor' | 'creditor' | 'amountCents'>;

export type ClaimDecision = 'confirm' | 'decline';
```

`Session` gains two **optional** fields. Absent means none, so the guide scenes, the dev seeds and
`parseSession` need nothing.

```ts
  /** Pending claims, and the viewer's own declined ones, as the viewer may see them (D1). */
  claims?: Claim[];
  /**
   * On a joined session only: members with an account on it (someone joined as them, or the
   * organizer's own pick), which decides whose name a claim waits on (BR-C19). Never a label.
   */
  withAccount?: string[];
```

**`loadContent`** gains one query over the same id list:

```sql
select c.id, c.session_id, c.debtor, c.creditor, c.amount_cents, c.claimed_by, c.status,
       c.created_at, c.decided_at
from payment_claims c
where c.session_id = any(${list}::text[])
order by c.created_at, c.id
```

It also gains a claimed-members query for the **joined** ids:
`select session_id, member from session_participants where session_id = any(${joinedList}::text[])`.
The owned ids already have it through the participants query. Each claim row stays a `ClaimRow` until `visibleLedger` turns it into a `Claim`, with `mine` set
from `userId`, so `loadSessions` passes `userId` through. **`claimed_by` is never put on a
session.**

**Query B** gains `s.me as organizer_me`. It is passed only to
`unavailableMembers(members, organizer_me, claimed)`, which gives `withAccount`, and never reaches
a session field.

**Assembly:**
- **Owned:** `claims = visibleLedger({ role: 'owner' }, payments, claims, userId).claims`, which is every
  **pending** claim. The organizer never sees a declined one (BR-C8). No `withAccount`.
- **Joined:** `const ledger = visibleLedger({ role: 'participant', member }, payments, claimRows, userId)`,
  then `participantView({ ...base, payments: ledger.payments, claims: ledger.claims }, member, organizerName, withAccount)`.
  `participantView` keeps its own payments filter, which now finds nothing more to drop.

> **Reviewer checkpoint RC-1, extended.** As in PR 1, plus:
> - `organizer_me` appears only as `unavailableMembers`' argument;
> - `claimed_by` never leaves `api/_shared.ts`;
> - a joined session's `claims` hold only:
>   - pending or declined claims the caller sent (`debtor === member`, `mine`);
>   - pending claims on lines the caller is the creditor of.
>
> `loadSessions.test.ts` checks each point.

**`loadLedger(client, sessionId)`** (new, exported, in `api/_shared.ts`) serves the write routes.
Inside a locked transaction it reads this session's payments and its claims (all statuses, with
`claimed_by`), as rows, for the caps and the 409 bodies.

### 4.6 `/api/claims` (new: `api/claims.ts`)

Handler order:
1. 401.
2. 405 with `Allow: POST, PATCH, DELETE` for any other method.
3. Validation.
4. One `client` transaction per request, with the usual
   `try / catch (rollback, rethrow) / finally (release)`.

**Validation (`api/_validate.ts`):**
- **`parseClaimsInput(raw)`** returns `{ sessionId: string; claims: NewClaim[] } | null`. It's
  exactly `parsePaymentsInput({ sessionId: raw.sessionId, payments: raw.claims })`, renamed: the
  same id, name, amount, count (`PAYMENTS_PER_REQUEST_MAX`) and no-duplicate rules. `raw` must be
  a plain object. 400 `{ error: 'Malformed claim.' }`.
- **`parseClaimDecision(raw)`** returns `{ id: string; decision: ClaimDecision } | null`. `id`
  matches `/^pay_[A-Za-z0-9]{1,64}$/`, and `decision` is `'confirm'` or `'decline'`. 400
  `{ error: 'Malformed decision.' }`.
- **`parseClaimIdQuery(raw)`** returns `string | null`, the same id pattern. 400
  `{ error: 'A claim id is required.' }`.

**`POST`: "I've paid", one claim or Mark all's batch, all or nothing (US-20, US-27).**

1. `begin`, then `lockSessionRole`:
   - `null`: 404 `{ error: 'No such session.' }`;
   - owner: 403 `{ error: 'The organizer records payments directly.', code: 'organizer_records' }`;
   - an entry whose `debtor !== member`: 403
     `{ error: 'You can only say you paid on your own lines.', code: 'not_your_line' }`.
2. `select status from expense_sessions where id = ${sessionId}`. Not `closed`: 409
   `not_finished`. (A joined session is always closed; this matches the payments POST.)
3. `loadLedger`. Drop the retries and the already-confirmed ids (4.3). If nothing is left,
   `commit`, then 201 `{ ids }`.
4. Any remaining id found in either table is 409 `id_conflict`, checked with
   `select id from session_payments where id = any(...)` and the same on `payment_claims`.
5. `const [session] = await loadSessions(userId, sessionId, true)`, then
   `pairs = settlementPairs(session)`. Each entry must be a pair (409 `not_a_line`) and within its
   cap (4.4, 409 `over_remaining`).
6. Insert each:

   ```sql
   insert into payment_claims (id, session_id, debtor, creditor, amount_cents, claimed_by)
   values (${c.id}, ${sessionId}, ${c.debtor}, ${c.creditor}, ${c.amountCents}, ${userId})
   ```

7. `commit`, then 201 `{ ids: claims.map((c) => c.id) }`.

**`PATCH`: confirm or decline (US-21 to US-23).** Body `{ id, decision }`.

1. Find the session: `select session_id from payment_claims where id = ${id}`, else
   `select session_id from session_payments where id = ${id}`. Neither: 404
   `{ error: 'This payment is no longer waiting. It may have been withdrawn.', code: 'not_pending' }`
   (AC-21.6).
2. `begin`, then `lockSessionRole(session)`. `null` is 404 `{ error: 'No such session.' }`.
3. Re-read the claim under the lock:

   ```sql
   select id, debtor, creditor, amount_cents, status, created_at
   from payment_claims where id = ${id} and session_id = ${sessionId}
   ```

   - **Gone, but a payment with this id exists in the session.**
     - `confirm`: `commit`, then 200 `{ decision: 'confirm' }`. A replayed confirm is safe.
     - `decline`: 409 `{ error: 'This payment has already been confirmed.', code: 'already_confirmed', payments, claims }`.
   - **Gone, and no payment either:** 404 `not_pending`, as in step 1.
   - **`status = 'declined'`:** 409 `{ error: 'This payment is no longer waiting.', code: 'not_pending', payments, claims }`.
4. Access:
   - the owner may decide any claim;
   - a participant only when `claim.creditor === member`, else 403
     `{ error: 'Only the person who was paid can confirm this.', code: 'not_decider' }`.
5. **`confirm`:**
   - `loadSessions(userId, sessionId, true)` gives the pair's amount. `paid` comes from
     `loadLedger`. Then the re-check (4.4).
   - Then:

     ```sql
     insert into session_payments (id, session_id, debtor, creditor, amount_cents, created_at)
     values (${c.id}, ${sessionId}, ${c.debtor}, ${c.creditor}, ${c.amount_cents}, ${c.created_at})
     on conflict (id) do nothing
     ```

     (`rowCount` 0 is 409 `id_conflict`), then `delete from payment_claims where id = ${id}`.
   - No line check: a finished session's lines can't change (PR 1's guard). A claim is made only
     against a line (POST step 5).
6. **`decline`:**
   `update payment_claims set status = 'declined', decided_at = now() where id = ${id}`.
7. `commit`, then 200 `{ decision }`.

**`DELETE ?id=`: withdraw (pending) or dismiss (declined) (US-24, US-25).**

1. Find the session as PATCH does. Neither: 404 `{ error: 'No such claim.' }`. The client treats
   it as done.
2. `begin`, `lockSessionRole` (`null` is 404), then re-read
   `select claimed_by from payment_claims where id and session_id`.
   - **Gone, but a payment with this id exists:** 409
     `{ error: '<creditor> has already confirmed this payment.', code: 'already_confirmed', payments, claims }`
     (AC-24.3). The name is the payment's creditor.
   - **Gone, and no payment:** `commit`, then 204.
   - **`claimed_by !== userId`:** 403
     `{ error: 'Only the person who sent it can take it back.', code: 'not_yours' }`.
3. `delete from payment_claims where id = ${id}`, then `commit`, then 204.

**Statuses:** 200, 201, 204, 400, 401, 403, 404, 405, 409, and 500 for misconfigured auth or a
body that isn't JSON.

### 4.7 `POST /api/payments` and `DELETE /api/payments?sessionId=` (`api/payments/index.ts`)

**POST** keeps its shape, request and 201 answer. The changes, in handler order:

1. The owner lock `select status … where id and user_id … for update` becomes
   `const access = await lockSessionRole(client, userId, sessionId)`, then
   `select status from expense_sessions where id = ${sessionId}`.
   - `null`: `rollback`, then 404, as today.
   - Participant: any entry whose `creditor !== access.member` is `rollback`, then 403
     `{ error: 'You can only record payments owed to you.', code: 'not_your_line' }`. It's
     checked before the retry check, because it depends on the request alone (BR-C3).
2. The existing-payments read becomes `loadLedger`. The retry rule is unchanged (a stored payment
   id is skipped).
3. **New: the cross-table id check** (4.3), before the status check.
4. `loadSessions(userId, sessionId)` becomes `loadSessions(userId, sessionId, true)`, so a
   participant's session is found. `settlementPairs` reads only members and records, which the
   participant view keeps whole.
5. The cap becomes `open` (4.4) for every caller, the organizer included (BR-C13). The 409 body's
   `payments: existingRows.map(toPayment)` becomes `visibleLedger(access, …)`'s `payments` and
   `claims`. That's a **privacy fix the participant path needs**: today's body holds every payment
   of the session. RC-7.

**DELETE `?sessionId=`** (Undo "already settled"): `begin`, then `lockSessionRole`.
- `null`: 404.
- Participant: 403
  `{ error: 'Only the organizer can undo “already settled”.', code: 'organizer_only' }`.
- Owner: today's delete, then `commit`, then 204.

It now runs in a transaction so the lock order holds. Pending claims are untouched: they become
confirmable again as the payments go.

### 4.8 `DELETE /api/payments/:id` (`api/payments/[id].ts`)

1. `select session_id, creditor from session_payments where id = ${paymentId}`. None: 404
   `{ error: 'No such payment.' }`, as today.
2. `begin`, then `lockSessionRole`. `null`: 404 `{ error: 'No such payment.' }`. It's the same
   body, so it never says whether the payment exists.
3. Participant with `creditor !== member`: 403
   `{ error: 'You can only undo payments owed to you.', code: 'not_your_line' }` (BR-C4,
   AC-26.5).
4. `delete from session_payments where id = ${paymentId} and session_id = ${sessionId}`. A
   `rowCount` of 0 (undone meanwhile) is 404. Then `commit`, then 204. The client still treats 404
   as done.

### 4.9 `DELETE /api/participants` (`api/participants.ts`)

After the participant row goes, in the same transaction (lock order: participants, then claims),
the claims that account sent go too (BR-C17, AC-29.1):

- **Owner path:** the delete becomes
  `delete from session_participants where session_id = ${sessionId} and member = ${member} returning user_id`.
  For a returned row,
  `delete from payment_claims where session_id = ${sessionId} and claimed_by = ${row.user_id}`.
- **Participant path:** after its delete,
  `delete from payment_claims where session_id = ${sessionId} and claimed_by = ${userId}`.

Claims **sent to** that member stay pending. They become the organizer's to decide on the next
load, because the member no longer has an account (AC-29.4).

## 5. Business logic

All money stays in whole centavos, as integer arithmetic (BR-C10). Pending money is never added
to any total (BR-C14).

### 5.1 `src/lib/joinedSessions.ts`

- **`visibleLedger(access, payments, claims, userId)`**, where `access` is `{ role: 'owner' }` or
  `{ role: 'participant'; member }`, payments are `Payment[]`, and claims are `ClaimRow[]`
  (`Claim` without `mine`, plus `claimedBy`, server rows only). It returns
  `{ payments, claims: Claim[] }`, with `claimedBy` stripped and `mine` set from `userId`, in this
  one place.
  - **Owner:** every payment, and the pending claims.
  - **Participant:**
    - payments with `debtor === member || creditor === member` (D1, unchanged);
    - claims where (`debtor === member` and sent by them, either status), or (`creditor === member`
      and `pending`).
  - Both the GET assembly and every 409 body use it.
- **`participantView(session, member, organizerName, withAccount)`** also sets `withAccount`.
  The claims it receives have already been through `visibleLedger` (4.5), so the participant rule
  lives in one place. Its signature is updated once, in its only caller.
- **`deciderName(creditor, withAccount, organizerName)`** returns `creditor` when `withAccount`
  includes it, else `organizerName ?? 'the organizer'` (BR-C19, AC-20.8, A1).
- **Copy builders**, exact text:
  - `waitingLine(cents, decider)` is `${formatCents(cents)} waiting for ${decider} to confirm`
    (debtor), and `toConfirmLine(cents)` is `${formatCents(cents)} waiting for you to confirm`
    (creditor) (AC-20.3, AC-21.1).
  - `youSaidLine(cents)` is `You said you paid ${formatCents(cents)}`.
    `waitingForLine(decider)` is `Waiting for ${decider} to confirm`, with the decider capitalised
    as given: "the organizer" stays lower case mid-sentence.
  - `saysTheyPaidLine(debtor, cents)` is `${debtor} says they paid ${formatCents(cents)}`.
    `saysTheyPaidOtherLine(debtor, creditor, cents)` is
    `${debtor} says they paid ${creditor} ${formatCents(cents)}`.
  - `notConfirmedLine(cents, at)` is `Not confirmed: the ${formatCents(cents)} you said you paid on ${formatLocalDateTime(at)}`.
    `talkToLine(creditor)` is `If you did pay, talk to ${creditor}, then send it again.`
  - `notOnHatiLine(creditor)` is `${creditor} isn't on Hati, so you confirm it.`
  - `toConfirmCountLine(n)` is `1 payment to confirm`, or `${n} payments to confirm`.
  - `waitingSummaryLine(cents)` is `${formatCents(cents)} waiting for confirmation` (AC-28.1).
  - `declineMessage(debtor, creditor, cents, at, own)`:
    - own line: `${debtor} said they paid you ${formatCents(cents)} on ${formatLocalDateTime(at)}. Declining records nothing, and ${debtor} will see that it wasn't confirmed.`;
    - for others: `${debtor} said they paid ${creditor} …`, the same continuation (AC-22.1,
      AC-23.3).
  - `confirmOthersMessage(debtor, creditor, cents, title)` is
    `This records ${formatCents(cents)} paid by ${debtor} to ${creditor} on “${title}”.`
    (AC-23.2).
  - `withdrawMessage(creditor, cents, at)` is `This takes back the ${formatCents(cents)} you said you paid ${creditor} on ${formatLocalDateTime(at)}. Nothing was recorded yet.`
    (AC-24.1).
  - `joinedMarkAllMessage(title, owedCents, oweCents)`, the three variants of AC-27.2. With only
    Owed to you, it returns `markAllMessage`'s text.
  - `stopTrackingMessage(name, hasPending)` appends
    ` Any payment you've said you made that's still waiting for confirmation is withdrawn.` when
    `hasPending` (AC-29.2).
  - `removeMessage(p, title, hasPending)` appends
    ` Any payment they've said they made that's still waiting is withdrawn.` when `hasPending`
    (AC-29.3).
- `recordsPaymentsLine` is deleted. BR-V11's line goes in PR 2, and nothing else uses it.

### 5.2 `src/lib/collection.ts`

**`membersWithAccount(session)`:**
- joined: `session.withAccount ?? []`;
- owned: `unavailableMembers(session.members, session.me, claimedMembers(session))`.

**`CollectionLine`** gains:

```ts
  /** Pending claims on this pair that this account can see, newest first. */
  claims: Claim[];
  /** This account's own declined claims on this pair, newest first (a debtor participant only). */
  declined: Claim[];
  /** P: the pending claims on this pair. Never part of paid, remaining or status (BR-C14). */
  pendingCents: number;
  /** What can still be claimed or recorded on it: max(0, remaining − P) (BR-C11, BR-C13). */
  openCents: number;
```

`buildLine` takes `claims` as well. It filters on the exact pair, sorts like payments (newest
first, ties by id), splits `pending` and `declined`, and sums `pendingCents`. `paidCents`,
`remainingCents`, `overpaidCents` and `status` are unchanged: confirmed only.

**`CollectionCard`** gains:

```ts
  /** The organizer's "To confirm for others": pending claims they decide that aren't on their own lines. */
  forOthers: Claim[];
  /** Claims waiting on this account: pending claims on its Owed to you lines, plus `forOthers`. */
  toConfirmCount: number;
  /** This account's own pending claims on its You owe lines (AC-28.1). */
  waitingCents: number;
  owedToYouOpenCents: number;
  youOweOpenCents: number;
```

- **`forOthers`** is for owned sessions only: pending claims whose `creditor` isn't in
  `membersWithAccount(session)`, and whose pair isn't one of the card's own lines. With `me`
  unknown or "not in this session", the card has no lines, so every such claim is here (AC-23.7,
  E2-7). A joined card always has `[]`. A claim whose creditor is a participant is on neither list
  of the organizer's card (BR-C2).
- **Bucket (BR-C15, BR-C16).** Let `waiting = toConfirmCount > 0`.
  - **Joined:** `settledLineCount === lines.length && !waiting ? 'settled' : 'outstanding'`.
  - **Owned:** `allPairsPaid && !waiting ? 'settled' : me unknown ? 'needsSetup' : settledLineCount === lines.length && !waiting ? 'settled' : 'outstanding'`.
  - A debtor's own pending claims don't move a card: their lines still have something left, so the
    card is Outstanding anyway.
- **`offersAlreadySettled`** gains `&& (session.claims ?? []).length === 0` (BR-C18). An owned
  session's `claims` are its pending ones.
- **`openLinePayments(card)`** (the organizer's Mark all) uses `l.openCents` and skips 0 (BR-C13).
- **`markAllMessage`** uses `owedToYouOpenCents` and `youOweOpenCents`.
- **`joinedMarkAll(card)`** returns
  `{ claims: Omit<NewClaim, 'id'>[]; payments: Omit<NewPayment, 'id'>[] }`: one claim per You owe
  line with `openCents > 0`, and one payment per Owed to you line with `openCents > 0`, each at
  `openCents` (AC-27.3).
- **`parseLineAmount(raw, line, side)`**, with `side` either `'debtor'` or `'creditor'`, calls
  `parsePaymentAmount(raw, line.openCents)`. When that refuses over the cap and
  `line.pendingCents > 0`, the message becomes:
  - debtor: `That's more than what's left (${formatCents(open)}). ${formatCents(P)} is already waiting for confirmation.`
    (AC-20.4);
  - creditor: `That's more than what's left (${formatCents(open)}). ${formatCents(P)} is waiting for you to confirm.`
    (AC-26.2).

  Every other message is today's (AC-20.7).
- **`newClaims(existing, incoming, createdAt)`** mirrors `newPayments`. It gives
  `{ ...c, createdAt, status: 'pending', decidedAt: null, mine: true }` for ids not on screen.
- **`mergeServerPayments`** becomes generic,
  `<T extends { id: string }>(local: T[], server: T[], inFlightAdd, inFlightRemove): T[]`, with
  the same body, so the 409 merge works for claims too.

### 5.3 `src/lib/writeQueue.ts`

**`keepLocalClaims(loaded, local, keep)`** is `keepLocalPayments`'s twin for `claims`: a session
`keep` names takes its on-screen claims. The load runs it with **the same predicate**, straight
after `keepLocalPayments`:

```ts
keepLocalClaims(keepLocalPayments(mergeLoaded(...), before, rollingBack), before, rollingBack)
```

A confirm changes both lists at once. Keeping one without the other would show a confirmed claim
as both a payment and a pending claim, so they always move together.

### 5.4 What's new v3 (`src/lib/whatsNew.ts`, `src/App.tsx`)

- `WHATS_NEW_VERSION = 3`. Each returning account sees it once. A new account is stamped 3 by the
  tour, as today.
- `App.tsx`'s What's new message becomes the v3 text from decision D-B. That's section 12; the
  recommended text is below.
- Its buttons become "Got it" alone. There is no guide for joined sessions, so "Show me how",
  which starts the Expenses guide, would point at the wrong thing.

> **Joined sessions.** On a finished session, tap Invite members and share the link. Each person
> signs in, picks who they are, and follows what they owe or are owed in their own Collection.
>
> **"I've paid."** Members who joined can tell you they've paid. It waits until you confirm or
> decline it, so you both end up with the same figures.

If the cumulative What's new (`whats-new-catch-up`, planned separately) reaches `main` first, the
same two notes are added as the v3 entries of its list instead, and no text is hard-coded. The
developer checks which applies at task 0.

## 6. UI

Mobile-only styles go inside `@media (max-width: 640px)`. There are no new icons. Every new
icon-free button still carries the `aria-label` the requirements give it.

### 6.1 `LineRow`

**Props:** `readOnly` goes and is replaced by:
- `joined: boolean`;
- `decider: string`, the name a You owe claim waits on (`deciderName(line.creditor, …)`, passed by
  the card);
- `title: string`, for the decline message's banner.

| Line | Organizer (today, plus) | Participant |
|---|---|---|
| **Owed to you** | Record payment and Mark fully paid at `openCents`, hidden at 0 (AC-26.3); the form prefills `openCents` and checks `parseLineAmount(…, 'creditor')`; Undo on every payment; pending claims with Confirm and Decline (6.2) | the same (AC-26.1 to AC-26.4) |
| **You owe** | unchanged: "I paid" and Mark fully paid record at once (BR-C20) | "I've paid" (`aria-label` `Tell ${other} you've paid`) and "I've paid it all" (`aria-label` `Tell ${other} you've paid the full ${formatCents(openCents)}`), hidden while `openCents === 0` (AC-20.1, AC-20.5); confirmed payments show "You paid ₱X" with **no** Undo (AC-21.4, AC-26.5); own pending and declined claims (6.2) |

**Under the figures,** while `pendingCents > 0`, a `<p className={styles.pending}>`:
- You owe: `waitingLine(P, decider)`;
- Owed to you: `toConfirmLine(P)`.

It's 12px, `var(--warn-text)`.

**The participant's claim form (AC-20.2 to AC-20.4, AC-20.9, AC-20.10)** reuses the payment form:
- label "Amount you paid", prefilled `openCents`;
- validated by `parseLineAmount(…, 'debtor')`;
- buttons "Send for confirmation" and "Cancel";
- the same `submitted` ref, so a double tap sends once;
- a refusal reopens it through the existing `FailedPayment`, with `id` the claim's, so a retry of
  the same amount reuses it.

"I've paid it all" sends one claim at `openCents` with no form (AC-20.6). Both call
`addClaims(sessionId, [{ id, debtor, creditor, amountCents }], onSettled)`.

### 6.2 The entries

Every entry is an `<li className={styles.entry}>` in the line's history list. They come in this
order: to-confirm or pending entries first, then declined notes, then payments, each newest first.

| Entry | Text | Actions |
|---|---|---|
| Debtor's own pending | `youSaidLine`, time, `waitingForLine(decider)` | "Withdraw" (`aria-label` `Withdraw the ${₱X} you said you paid ${other}`), which opens a destructive `ConfirmDialog`: title "Withdraw this payment?", `withdrawMessage`, buttons "Cancel" and "Withdraw" (AC-24.1) |
| Debtor's own declined | `notConfirmedLine`, then on its own line `talkToLine(other)` | "Dismiss" (`aria-label` `Dismiss the note about the ${₱X} you said you paid ${other}`), with no dialog (AC-25.1) |
| Creditor's pending (organizer or participant) | `saysTheyPaidLine(other, ₱X)`, time | "Confirm" (`aria-label` `Confirm ${₱X} from ${other}`), with no dialog, which announces "Payment confirmed." (AC-21.2); "Decline" (`aria-label` `Decline ${₱X} from ${other}`), which opens a destructive `ConfirmDialog` titled "Decline this payment?" with `declineMessage(…, own)` and buttons "Cancel" and "Decline" (AC-22.1) |

- **Confirm** calls `decideClaim(sessionId, id, 'confirm', onSettled)`.
- **Decline** calls `decideClaim(sessionId, id, 'decline', onSettled)`.
- **Withdraw and Dismiss** call `removeClaim(sessionId, id, onSettled)`.
- **A refusal** shows on its entry as a `role="alert"` line:
  - `over_remaining`: the server's AC-21.5 or A3 text;
  - `not_pending`: "This payment is no longer waiting. It may have been withdrawn." (AC-21.6);
  - `already_confirmed` on Withdraw: the server's `{creditor} has already confirmed this payment.`
    (AC-24.3).

  If the entry has gone after the merge, the line keeps the message under its figures until the
  next change, through the same `FailedPayment`-by-line mechanism.
- **Confirm's settle announcement:** a confirm that settles the card calls `onPaid(true)`, so the
  page's existing "Session fully settled. Moved to Settled." runs (AC-21.3).

**Phone.** `.entry` already wraps on a phone. The new `.entryActions` (a flex row with an 8px
gap, holding Confirm and Decline) gets `width: 100%` there, so both buttons drop under the text
together (E2-11). Desktop keeps them at the row's end.

### 6.3 `CollectionCard`

**Collapsed summary (AC-23.4, AC-28.1, AC-28.3).** After today's parts:
- `waitingSummaryLine(card.waitingCents)` when it's above 0;
- `toConfirmCountLine(card.toConfirmCount)` when it's above 0.

Each is a `styles.detail` span, in any section. A5: an Outstanding card with `lineCount === 0`
drops "0 of 0 settled".

**"To confirm for others" (US-23),** on an owned card with `forOthers.length > 0`:
- **Placement:** it's the **first** thing in the open body, above `YouAre`, the lines and
  NeedsSetup's picker (AC-23.1, AC-23.7). It's rendered in the Needs setup body too, above
  `NeedsSetup`.
- **Structure:** a `<section className={styles.group}>` with
  `<h4 className={styles.groupHeading}>To confirm for others</h4>`. Each entry shows
  `saysTheyPaidOtherLine`, its time, and `notOnHatiLine(creditor)`.
- **"Confirm"** opens a non-destructive `ConfirmDialog`: title "Confirm this payment?",
  `confirmOthersMessage`, buttons "Cancel" and "Confirm" (AC-23.2). There's **no undo afterwards**
  (Q3).
- **"Decline"** opens the destructive dialog with `declineMessage(…, own = false)` (AC-23.3).
- **Phone:** the actions wrap as in 6.2.
- **Targets:** it carries no `data-tour`, and it isn't inside any element that does.

**The joined card's body:**
- "You joined as … · Stop tracking", then the lines with `joined`, as in PR 1.
- **The `recordsPaymentsLine` paragraph goes** (BR-V11).
- **Mark all as paid** shows when `owedToYouOpenCents + youOweOpenCents > 0` (AC-27.1). It reuses
  `MarkAll`, the same element with its `data-tour="collection-mark-all"` wrapper. The confirmation
  message is `joinedMarkAllMessage` (AC-27.2).
- **On confirm (AC-27.3, AC-27.4)**, from `joinedMarkAll(card)`, with fresh `createId('pay')`
  ids:
  - `addClaims(id, claims, …, { quiet: true })` and `addPayments(id, payments, …, { quiet: true })`
    run in parallel, and each is skipped when empty;
  - a claims failure banners "Couldn't send what you've paid. Nothing was sent. Try again.";
  - a payments failure banners today's payment refusal;
  - each side stands or falls on its own.
- The owned card's Mark all is unchanged apart from the open amounts. It shows only while
  `owedToYouOpenCents + youOweOpenCents > 0`.

**Stop tracking and Remove** pass `hasPending`:
- joined: `card.waitingCents > 0`;
- Remove: the session's pending claims with `debtor === p.member`.

### 6.4 Who is offered Confirm and Decline (BR-C2)

| Viewer | Where Confirm and Decline appear |
|---|---|
| Participant | on their own Owed to you lines only |
| Organizer | on their own Owed to you lines, and in "To confirm for others" for claims whose creditor has no account |
| Nobody | a claim whose creditor is a participant isn't on the organizer's card at all |

When Carla joins later, her claims move from the organizer's group to Carla's line on the next load
(AC-23.6). When a creditor participant leaves, the reverse happens (AC-29.4).

### 6.5 Phone and desktop

| Screen | Desktop | Phone (≤ 640px) |
|---|---|---|
| Line with claims | the pending line under the figures; entries with their buttons at the row's end | entries wrap; Confirm and Decline drop under the text together (E2-11) |
| Card summary | "₱X waiting for confirmation" and "N payments to confirm" as extra detail lines | the same; they wrap |
| To confirm for others | a group at the top of the open card | the same; buttons wrap |
| What's new v3 | the existing dialog, with two points and Got it | the same |

Nothing moves on desktop for a session with no claims: an owned card with none renders exactly as
in PR 1.

## 7. Onboarding tour impact

**None.**
- **Targets:** no new `data-tour` attribute.
  - "To confirm for others" is a new `section` **before** the lines. It doesn't wrap or replace
    `collection-owed`'s section.
  - The joined card's Mark all reuses `MarkAll`, so `collection-mark-all` stays on the same
    element (BR-G8). Only one card is open at a time.
  - No target moves, is renamed or is duplicated.
- **Steps and copy:** unchanged.
- **Practice:** the scenes have no `claims`, so every line renders as in PR 1. C4 and C5 still find
  their Record payment and Undo buttons, because a line with no claims has `openCents` equal to
  `remainingCents`. The memory backend's three new methods do nothing, and no guide calls
  `/api/claims`.
- **What's new v3** opens where v2 did, and waits for the join flow, the welcome, the tour and the
  guides exactly as PR 1 wired it.
- **Run after building:** `steps.test.ts`, `targets.test.ts` and `guides/guides.test.ts` pass
  unchanged, and `joinedCards.test.ts`'s target scan still passes.

## 8. Test plan

Static tests only. Write each first and watch it fail.

**`src/lib/joinedSessions.test.ts` (extend):**
- `visibleLedger` (D1, BR-C8, RC-1):
  - the owner gets every payment and only pending claims;
  - a debtor participant gets their own pending and declined claims;
  - a creditor participant gets pending claims on their lines and never declined ones;
  - nobody gets claims or payments between two other members;
  - `claimedBy` is never in the output;
  - `mine` follows the user id.
- `participantView` sets `withAccount` and leaves the ledger it is given as it is.
- `deciderName` (BR-C19, AC-20.8, AC-23.6, AC-29.4): the creditor with an account, and the
  organizer name or "the organizer" without one.
- Every new copy builder, against the strings in 5.1 (AC-20.3, AC-21.1, AC-22.1, AC-22.3,
  AC-23.1 to AC-23.4, AC-24.1, AC-25.1, AC-27.2, AC-28.1, AC-29.2, AC-29.3).

**`src/lib/collection.test.ts` (extend):**
- `buildLine` (BR-C14): ₱500 owed, ₱200 pending; `paid` 0, `remaining` 50000, `status` unpaid,
  `pendingCents` 20000, `openCents` 30000 (AC-20.3, AC-28.1). A declined claim changes nothing
  (AC-28.2). Several pending claims sum (E2-1).
- `parseLineAmount`: AC-20.4's message, AC-26.2's message, and today's messages with no pending
  (AC-20.7).
- Bucket (BR-C15, BR-C16):
  - a joined card with all lines paid and a claim to confirm is Outstanding;
  - a debtor's own pending claim keeps the card Outstanding;
  - an owned card with `forOthers` is Outstanding;
  - an owned card with `forOthers` and `me` unknown is Needs setup (AC-23.5, AC-23.7, E2-7).
- `forOthers` (BR-C2, A2): excludes a participant creditor's claim and the organizer's own-line
  claim. Includes a creditor with no account. A creditor who joins moves the claim out (AC-23.6).
- `offersAlreadySettled` is false with a pending claim (BR-C18).
- `openLinePayments` and `joinedMarkAll` use `openCents` and skip 0 (BR-C13, AC-27.3). The
  messages use the open sums.
- `toConfirmCount` and `waitingCents` (AC-23.4, AC-28.3).
- `newClaims` skips ids already on screen. `mergeServerPayments` works for claims.

**`src/lib/writeQueue.test.ts` (extend):** `keepLocalClaims` keeps on-screen claims for the kept
sessions and the server's elsewhere. Run in the pipeline order, a kept confirmed claim never
appears as both a payment and a claim.

**`src/lib/whatsNew.test.ts` (update):** version 3. Accounts on 2 are due, accounts on 3 aren't.

**`src/lib/apiValidation.test.ts` (extend):**
- `parseClaimsInput` follows `parsePaymentsInput`'s table, including duplicates, 0 cents and 201
  entries.
- `parseClaimDecision` refuses a bad id, a missing decision and `'accept'`.
- `parseClaimIdQuery` refuses arrays and bad ids.

**`src/lib/claimsApi.test.ts` (new; the fake-database pattern of `participantsApi.test.ts`, with
`lockSessionRole` answering from `db.access`):**
- **POST:**
  - the owner gets 403 `organizer_records`;
  - a participant's claim on another debtor gets 403 `not_your_line`;
  - no relation is a 404;
  - `begin` and the lock come first (4.2);
  - a retry of the caller's own claim id is a 201 with no insert;
  - an id already confirmed as this session's payment on the same pair is a 201 with no insert;
  - an id in either table otherwise is 409 `id_conflict`;
  - over `open` is 409 `over_remaining`, with each of the three messages and a body holding only
    the caller's visible ledger (AC-20.4, BR-C11);
  - a non-pair is 409 `not_a_line`;
  - success inserts with `claimed_by` set to the caller, then commits (AC-20.3);
  - a batch is all or nothing (AC-27.4).
- **PATCH:**
  - a participant who isn't the creditor gets 403 `not_decider`;
  - the debtor deciding their own claim gets 403;
  - the owner may decide any claim (BR-C2);
  - confirm inserts into `session_payments` with the claim's `created_at` and id, then deletes the
    claim (BR-C7, AC-21.2);
  - confirm over `remaining` is 409 `over_remaining` with `Only ₱X is left …` naming the debtor
    (AC-21.5, BR-C12);
  - a replayed confirm is 200;
  - decline sets `declined` and `decided_at` (AC-22.2);
  - deciding a declined claim is 409 `not_pending`;
  - a withdrawn claim is 404 `not_pending` (AC-21.6);
  - declining an already-confirmed claim is 409 `already_confirmed` (E2-4).
- **DELETE:**
  - the sender withdraws or dismisses (204, AC-24.2, AC-25.1);
  - anyone else related gets 403 `not_yours`;
  - a confirmed claim is 409 `already_confirmed` with the creditor named (AC-24.3);
  - not found is 404.

**`src/lib/paymentsApi.test.ts` (new; fake database):**
- **POST:**
  - a participant creditor records on their own line (AC-26.1);
  - a participant's entry on a line they owe is 403 `not_your_line` (AC-26.5);
  - the owner is capped at `open` when a claim is pending (BR-C13, E2-2);
  - an id that's a pending claim is 409 `id_conflict`;
  - `loadSessions` is called with `joined = true`;
  - a participant's 409 body holds only their own lines' payments and claims (RC-7).
- **DELETE `?sessionId=`:** a participant gets 403 `organizer_only`, and the owner is unchanged.
- **DELETE `:id`:**
  - a participant creditor undoes (AC-26.4);
  - a participant debtor gets 403 `not_your_line`;
  - no relation is a 404;
  - the session lock comes before the delete.

**`src/lib/participantsApi.test.ts` (extend; AC-29.1, BR-C17):**
- the owner path's delete returns `user_id`, and then that account's claims are deleted;
- the participant path deletes the caller's claims;
- neither deletes claims whose `creditor` is the removed member (AC-29.4).

**`src/lib/loadSessions.test.ts` (extend; RC-1):**
- claims are loaded for owned and joined ids;
- an owned session gets pending claims only;
- a joined one gets the participant rule;
- `withAccount` comes from claimed members plus `organizer_me`;
- no session carries `organizer_me` or `claimed_by`.

**`src/components/collection/joinedCards.test.ts` (extend; `renderToStaticMarkup`):**
- **A joined debtor line with nothing pending:** "I've paid" and "I've paid it all" with their
  `aria-label`s, and no Undo on a confirmed payment (AC-20.1, AC-21.4).
- **The same line with ₱200 pending:**
  - "₱200.00 waiting for Ana to confirm";
  - "You said you paid ₱200.00" and Withdraw;
  - the figures unchanged ("Paid ₱0.00 · ₱500.00 left", "Unpaid") (AC-20.3).
- **With pending equal to the remaining amount:** no claim buttons (AC-20.5).
- **A declined note:** "Not confirmed: …", "If you did pay, talk to Ana, then send it again.",
  and Dismiss (AC-22.3).
- **With no account for the creditor:** "Waiting for Carla …" becomes the organizer's name
  (AC-20.8).
- **A joined creditor line:**
  - Record payment and Mark fully paid;
  - "Ben says they paid ₱200.00" with Confirm and Decline and their labels;
  - "₱200.00 waiting for you to confirm" (AC-21.1, AC-26.1);
  - Undo on payments (AC-26.4).
- **An owned card with a claim for a creditor with no account:**
  - the open body starts with "To confirm for others", the entry and "Carla isn't on Hati, so you
    confirm it." (AC-23.1);
  - the collapsed card shows "1 payment to confirm" (AC-23.4);
  - in Needs setup the group is above "Which one are you?" (AC-23.7).
- **A joined card with something open shows Mark all as paid** (AC-27.1). The PR 1 line "… records
  the payments on this session." is gone (BR-V11).
- **The collapsed card shows "₱500.00 waiting for confirmation"** (AC-28.1).
- **Targets:** the scan still finds only CollectionCard's two targets. `LineRow.tsx` has none.

**Unchanged and must pass:** `steps.test.ts`, `targets.test.ts`, `guides/guides.test.ts`,
`CollectionPage.test.ts`, `sessionSaveApi.test.ts`, `invitesApi.test.ts`, `joinLink.test.ts`,
`memorySessions.test.ts` and `apiImports.test.ts` (which now walks `api/claims.ts`).

### 8.1 Reviewer checks (surgeon-reviewer)

- **RC-1 (extended):** 4.5. **RC-7:** no 409 body of payments or claims carries a ledger the
  caller may not see.
- **RC-2:** every transaction in `api/claims.ts`, both payments routes and `api/participants.ts`
  takes `lockSessionRole` first, and re-reads after it.
- **RC-8:** the cross-table id rule (4.3) holds on every insert path. A confirm keeps the id and
  the debtor's time.
- **RC-9:** no total, status, "X of Y" or strip figure adds pending money. Caps use `open`
  everywhere and `remaining` only for the confirm re-check.
- **RC-6, from PR 1:** the onboarding rules; no new dependency; mobile CSS inside the media
  query; `aria-label`s.

### 8.2 Tester rules for Neon `main` data

PR 1's rules (its section 8.2) hold: test accounts A (organizer) and B (participant), a third
account C for the creditor-joins cases, at most two "Test – joined …" sessions, deleted at the
end, which cascades claims and participants. Two more rules:

- **What's new v3** is a one-time mark on the shared `main`. Whoever loads the PR 2 build first
  uses up v3 for that account everywhere, uat included. The tester and the developer check the
  copy with **Preview What's new** on Home's dev bar, which writes nothing. The owner's own
  account sees the real one once.
- **Clerk cap:** a third test account (C) is the only new sign-up PR 2 needs. The pre-uat check of
  the Clerk user count (D10) stands.

### 8.3 Checks for the ui-ux-tester

`npm run dev:full`, port 3000, at 390×844 and 1400×900 (375px where noted), with the network log
open. A, B and C each in their own browser profile. Session: A is Ana and organizer; Ben (B) owes
Ana ₱500 and Carla ₱300; Carla has no account until C joins.

| AC | Check |
|---|---|
| AC-20.1 to AC-20.10 | As B: the two buttons and labels; send ₱200: figures unchanged, the waiting line, and the entry with Withdraw. Reopen: prefilled 300; 301 gives the AC-20.4 message. Double-tap Send: one `POST /api/claims`. Block it: the form comes back with the amount. |
| AC-20.8, AC-23.1 to AC-23.7 | B claims ₱150 to Carla: "Waiting for {A's name} to confirm". As A: the "To confirm for others" group at the top, the count on the collapsed card, the card kept out of Settled; Confirm asks "Confirm this payment?" and records it, with no undo on A's card. With A's card in Needs setup, the group is above the picker. |
| AC-21.1 to AC-21.6 | As A: "Ben says they paid ₱200.00", then Confirm with no dialog: "Received ₱200.00" at B's time, Partial, with the announcement. On B's return after 30 seconds: "You paid ₱200.00", no Undo. A records ₱300 directly while a claim is pending: capped (E2-2). A confirms after B withdrew in another tab: AC-21.6. |
| AC-22.1 to AC-22.3, AC-25.1, AC-25.2 | A declines: the copy, and the entry goes. B sees the note and Dismiss. After Dismiss it never comes back on reload. A new claim still works. |
| AC-24.1 to AC-24.3, E2-4 | B withdraws: the copy, and the line offers the full amount again. B withdraws one A just confirmed: AC-24.3. |
| AC-26.1 to AC-26.5 | C joins as Carla: B's claim to Carla leaves A's group and shows on C's line (AC-23.6). C records and undoes on her line. C has no Undo on payments B owes others. C confirms B's claim. |
| AC-27.1 to AC-27.4 | B (Mark all): the confirmation copy, then one `POST /api/claims` with all of B's You owe lines. As C with both directions: one claims and one payments request. Block one: only it reverts, with its own banner. |
| AC-28.1 to AC-28.3 | The strip and "X of Y" don't move on a claim. "₱X waiting for confirmation" and "N payments to confirm" on collapsed cards, in each section. |
| AC-29.1 to AC-29.4 | B stops tracking with a pending claim: the extra sentence, and A's entries disappear on reload. A removes C: the extra sentence when C has pending claims. Claims to Carla go back to A's group. |
| BR-C18 | A pre-Collection session with a pending claim: no "Already settled" on the card or in the question. |
| What's new v3 | Preview What's new: the v3 text and Got it only, at both widths, with no `PUT /api/user`. |
| E2-11 | At 375px: Confirm and Decline wrap under their text, with no sideways scroll. |
| Regression | An owned session with no claims looks and behaves exactly as in PR 1: Mark all, Undo, Already settled. Both guides run end to end. The first-run tour runs. |

Before the hand-off: `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, with real results.

## 9. Documentation impact

For the documentation-engineer, with PR 1's list (shipped together):
- **API reference:**
  - `/api/claims` (all three methods);
  - the payments routes' participant rules, the `open` cap and the new 403 codes;
  - the complete code table in 4.1;
  - `claims` and `withAccount` on the GET.
- **Data model:** `payment_claims` is in use (states, the confirm move, the cross-table id rule).
- **User guide:**
  - "I've paid", confirm and decline;
  - "To confirm for others";
  - creditors recording payments;
  - what pending means for the totals.
- **Release notes:** What's new v3.

## 10. Tasks (in order)

0. **Rebase.** Merge the latest `origin/joined-sessions-1` (fix round 2) into `joined-sessions-2`.
   Check whether `whats-new-catch-up` has reached `main` (5.4). → verify: `npm test` green before
   any change.
1. **Types** (4.5). → verify: `npx tsc -b`.
2. **Pure logic, tests first:**
   - `joinedSessions.ts` (5.1), removing `recordsPaymentsLine`;
   - `collection.ts` (5.2);
   - `writeQueue.ts` (5.3);
   - `whatsNew.ts`.
3. **Validation** (4.6), with `apiValidation.test.ts`.
4. **`api/_shared.ts`:** claims and `withAccount` in `loadSessions`, plus `loadLedger`, with
   `loadSessions.test.ts`.
5. **API routes, tests first:**
   - `api/claims.ts`;
   - `api/payments/index.ts`;
   - `api/payments/[id].ts`;
   - `api/participants.ts`.

   → verify: as A on `npm run dev:full`, `GET /api/sessions?joined=1` carries `claims: []`, and
   recording a payment works as before.
6. **Client state:**
   - `useServerSessions`: `addClaims`, `decideClaim` and `removeClaim`, following `addPayments`
     and `removePayment` (optimistic, minted ids, counted in `paying`, `adding` and `removing`,
     `settledDuringLoad` on settle, `writeOrder` by `lineKey`, failures as kind `'payment'` with
     A4's messages); `keepLocalClaims` in the load; the 409 merge for claims;
   - the store pass-through, and the memory no-ops.

   Confirm puts the payment on screen and takes the claim off in one `commit`, and reverts both
   on failure.
7. **UI:**
   - `LineRow` (+ css) (6.1, 6.2);
   - `CollectionCard` (+ css) (6.3);
   - the Stop tracking and Remove sentences;
   - What's new v3 in `App.tsx`;

   with `joinedCards.test.ts`.
8. **Checks:** `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`. Then the three-account
   walkthrough, including the intake's verification step 4: B records "I've paid", it's pending
   for A, A confirms it, and both sides show the same figures. Give the owner the local URL and
   the branch.

**Shipping:** merged to `main` only when the owner asks, after PR 1. PR 1 and PR 2 go to uat
**together** (Q4), never one without the other. Before testers invite, the owner checks the Clerk
user count (D10).

## 11. Risks and effort

| Risk | Guard |
|---|---|
| A participant sees money between two other members, through the GET or a 409 body. | One rule (`visibleLedger`) used by the GET and every 409. RC-1 and RC-7, with tests on both paths. Today's payments POST would have leaked; section 4.7 fixes it. |
| A pending claim becomes unconfirmable, or a line is overpaid. | Every write is capped at `open` under the session lock, and the confirm re-checks `remaining` (409 `over_remaining`). Undo "already settled" only frees room. |
| Confirm shows the same money twice, or loses it. | It moves the row in one transaction, keeping the id. On screen, both lists change in one `commit`. `keepLocalPayments` and `keepLocalClaims` run with one predicate. A replayed confirm is a 200. |
| Two deciders act at once (E2-4), or a withdraw races a confirm. | Both lock the session row, and re-read after it. The loser gets `not_pending` or `already_confirmed` with the ledger, and the screen redraws. |
| The organizer confirms a claim on someone else's line by mistake. | "Confirm this payment?" first (Q3). No undo, by decision. The creditor can still undo it later once they join, as any payment on their line. |
| The joined card's Mark all half-works. | Two requests, each all or nothing, each with its own banner (AC-27.4). Each is skipped when empty. |
| Claims are never seen (no notifications). | "N payments to confirm" on the collapsed card, and the card kept out of Settled (BR-C15). The 30-second return reload, from PR 1. |
| The fix round changes code PR 2 edits. | Task 0 merges it first. PR 2 relies only on `unavailableMembers`, which the fix round adds. |
| What's new v3 is used up on the shared `main` before uat. | Preview What's new for checks (8.2). |
| An old organizer tab (PR 1 build) can't see or confirm claims. | Accepted for testing (E2-8). It still respects the cap on the server. |

**Size: large.** About 26 files:
- 3 new: `api/claims.ts`, `claimsApi.test.ts`, `paymentsApi.test.ts`;
- about 23 edited, 8 of them test files.

There's no schema change. The API contract grows by one route and changes in three, with the
access rules in 4.1.

## 12. Decisions for the user

- **D-A. Assumptions A1 to A5** (section 1):
  - who a claim waits on, from `withAccount`;
  - the organizer's member is the stored pick only;
  - refusal copy;
  - banner copy;
  - no "0 of 0 settled".

  **Recommendation:** approve as written.
- **D-B. What's new v3 text and buttons** (5.4). The requirements fix the timing, not the words.
  **Recommendation:** the two notes in 5.4, and "Got it" alone, since there's no guide for joined
  sessions to start. **Alternative:** keep "Show me how" starting the Collection guide, which
  covers recording payments but not joining or claims.
- **D-C. `withAccount` tells a participant which members have an account** (A1), though never
  which one is the organizer, and it's never shown as a label. It's what decides "Waiting for Ana"
  against "Waiting for {organizer}". **Recommendation:** accept. It's the minimum BR-C19 needs, and
  the join dialog already shows who joined.

## 13. Owner decisions

Recorded when the owner approved the spec:
- **D-A:** assumptions A1 to A5 (section 1) are accepted as written.
- **D-B:** What's new v3 has the two notes in 5.4 and "Got it" alone.
- **D-C:** `withAccount` is accepted (A1).
