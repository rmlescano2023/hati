# Spec: the Collection tab

Status: **approved by the owner on 2026-11-04.** Branch `collection`, from `origin/main` at `8b6b2ab`
(includes PR #107, activity order).

Decisions recorded at approval (section 12):

1. **Schema run authorised.** The owner gives the explicit OK that A15 asks for: the fullstack-developer runs
   `npx vite-node scripts/db/apply-schema.ts` once against the shared Neon `main`, at task 1 and before editing
   any `api/` file. The OK covers only this spec's additive statements (`users.display_name`,
   `expense_sessions.me`, and the `session_payments` table with its index). No existing data is reset,
   truncated, deleted or altered; if the script would do anything else, the developer stops and reports.
2. **Deleting a session deletes its payments,** with the BR-19 warning: confirmed.
3. **"Mark all as paid" asks for confirmation first and is all or nothing:** confirmed.
4. **Assumptions A1 to A6:** all stand as written, including A1 (a matched Finish stores no pick) and A3
   (Collection dates use local time).

## 1. Summary

A tester asked for "monitoring kung sino paid na or kung sino hindi pa": a way to see who has paid and who
hasn't. Hati stops at the statement today, so the owner tracks payments by hand.

This adds a third top-level tab, **Collection**, between Home and History. It lists **finished sessions only**.
For each one it shows the settlement lines that involve the user, in both directions ("Owed to you" and "You
owe"). The user records payments against those lines, including part payments, and can undo any single payment.
Sessions sort into three sections: **Needs setup** (Hati can't tell which member is the user), **Outstanding**
and **Settled**.

What's stored:

- **A payment ledger,** `session_payments`. One row per payment, keyed by `(session, debtor, creditor)`, never by
  who the user is. Payments are never edited. Undo deletes one row.
- **A profile name,** `users.display_name`. Hati matches it against each session's members with `compareNames`,
  every time, so the match also works on sessions finished before this feature.
- **An explicit per-session pick,** `expense_sessions.me`. It's made in the Finish dialog, on a Needs setup card
  or through "Change", and it overrides the match. It can also say "I'm not in this session".

Everything else is derived on every render by a new pure module, `src/lib/collection.ts`: the lines, what's paid
and what's left, each line's status, which section a session sits in, and the totals.

Finish now means "the numbers are final, start collecting", and it lands on Collection with that session's card
open.

Source: `collection-handoff.md`, which holds:
- **A,** the owner's final decisions A1 to A16. They win where they differ from B and C.
- **B,** the system-architect's approved design.
- **C,** the business-analyst's requirements: US-1 to US-14, US-8b, BR-1 to BR-20 and the edge cases. "Collected"
  reads as **"Settled"** throughout.

**Assumptions** (veto any before approving):

- **A1.** On a profile match, the Finish dialog stores no pick (`me` stays `null`) unless the user opens
  "Change". The session then follows the profile name, so a later rename moves it to Needs setup (AC-12.3). Once
  the picker is open, whatever is selected is stored as an explicit pick.
- **A2.** AC-4.10 ("if storing the choice fails, the session still finishes") can't arise as written. The pick
  travels in the same save as Finish itself (section 4), so neither can fail without the other. A failed Finish
  save is today's failure path: the banner shows, and "Try again" brings the server's copy back. The one separate
  write in the Finish flow is "Remember as my name". If it fails, the session is still finished with its pick,
  and the failure is shown on Collection's "You:" line (section 6).
- **A3.** "Finished <date>", "Settled <date>" and payment times on Collection use the device's local time. History
  is unchanged (AC-12.4). It still shows the UTC date of `closedAt` on its detail screen, so a session finished
  between midnight and 8 a.m. in Manila can show a different date there.
- **A4.** A payment's time is the server's clock (`now()`), not the device's. Until the next load, the screen
  shows the device's time. The two differ by the request's latency.
- **A5.** The server checks that a payment's pair is one of the session's settlement lines, but not that the
  line involves "me". "Me" is a display choice, and payments belong to the pair (BR-7).
- **A6.** If the profile can't be loaded, Collection shows an error with "Try again" instead of its sections. It
  doesn't guess, which would put every matched session under Needs setup.

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Types | `src/types/index.ts` | `Payment`, `NewPayment`; `Session.me`, `Session.payments` | — |
| Schema | `scripts/db/schema.sql` | `users.display_name`, `expense_sessions.me`, the `session_payments` table and its index | `scripts/db/apply-schema.ts`, unchanged |
| Pure logic | `src/lib/collection.ts` **(new)** | me resolution, settlement pairs, lines, cards, buckets, totals, the amount parser, the payment merge, Mark all helpers | `getRawOwedMatrix`, `getNettedOwedMatrix`, `getFinalSettlement`, `compareNames`, `sortNames`, `formatMoney`, `roundMoney`, `pluralize` |
| Pure logic | `src/lib/profileName.ts` **(new)** | `PROFILE_NAME_MAX`, `normaliseProfileName` | modelled on `sessionName.ts`; `toTitleCase` |
| Pure logic | `src/lib/calculations.ts` | its two relative imports gain `.js`, because the API now imports it (`apiImports.test.ts`) | — |
| Pure logic | `src/lib/format.ts` | `formatLocalDate`, `formatLocalDateTime` | — |
| Pure logic | `src/lib/storage.ts` | `parseSession` sets `me` and `payments: []`; `migrateV1` the same | `parseMe` |
| Pure logic | `src/lib/writeQueue.ts` | `FailureKind` gains `'payment'`; `sameSessionContent` compares `me` | — |
| Pure logic | `src/lib/sessionLabel.ts` | `deleteSessionMessage` follows BR-19 | `pluralize` |
| Dev data | `src/lib/demoSessions.ts` | `me` and `payments` on every session; closed ones get picks and payments | `buildCard`, `openLinePayments`, `createId` |
| API | `api/_shared.ts` | `loadSessions(userId, only?)` returns `me` and `payments` | `SessionRow`, `iso` |
| API | `api/_validate.ts` | `parsePaymentsInput`, `parseProfileInput` | `normaliseProfileName` |
| API | `api/sessions/[id].ts` | PUT stores `me` with `coalesce` | — |
| API | `api/payments/index.ts` **(new)** | `POST`: record one or more payments, all or nothing | `getUserId`, `loadSessions`, `settlementPairs`, `formatCents` |
| API | `api/payments/[id].ts` **(new)** | `DELETE`: undo one payment | `getUserId` |
| API | `api/user.ts` | GET returns `displayName`; new `PATCH` | `ensureUser` |
| Client state | `src/hooks/useServerSessions.ts` | `addPayments`, `removePayment`; payment writes count as unconfirmed; `replaceAll` seeds payments | `authedFetch`, `withDeadline`, `pending`, `fail`, `queue.settled`, `creating` |
| Client state | `src/context/SessionsStoreContext.tsx` | `closeSession(id, me)`, `setMe`, `addPayments`, `removePayment`; `createSession` sets the new fields | — |
| Client state | `src/context/AppDataContext.tsx` | `closeSession: (me: string \| null) => void` | — |
| Client state | `src/context/ProfileContext.tsx` **(new)** | loads and saves the profile name | `authorisedFetch`, `withDeadline` |
| Client state | `src/main.tsx` | mounts `ProfileProvider` | — |
| UI | `src/App.tsx` | the `collection` screen; lands there after Finish; the profile dialog | `TOP_LEVEL`, `tourNavigate` |
| UI | `src/components/layout/NavTabs.tsx` | the `collection` tab | `TABS` |
| UI | `src/components/layout/Header.tsx`, `Header.module.css` | the "Profile" menu item | `UserButton.MenuItems`, `UserButton.Action` |
| UI | `src/components/shared/icons.tsx` | `CollectionIcon`, `ProfileIcon` | `Icon` |
| UI | `src/components/shared/ModalDialog.tsx` **(new)** | the `<dialog>` shell shared by the three new dialogs | `NewSessionDialog`'s behaviour; `ConfirmDialog.module.css`, `NewSessionDialog.module.css` |
| UI | `src/components/profile/ProfileNameField.tsx` (+ css), `ProfileDialog.tsx`, `ProfileBanner.tsx` (+ css) **(new)** | the name field with its suggestion chip; the dialog; the nudge | `useUser` |
| UI | `src/components/collection/MePicker.tsx`, `ChangeMeDialog.tsx`, `CollectionCard.tsx`, `LineRow.tsx`, each with a css file where it has styles **(new)** | — | `Button`, `ConfirmDialog` |
| UI | `src/pages/CollectionPage.tsx` (+ css) **(new)** | the page | `HomePage.module.css` `.heading`, `EmptyState`, `App.module.css` `.loading`/`.spinner` |
| UI | `src/components/summary/FinishSessionDialog.tsx` (+ css) **(new)**, `CloseSessionButton.tsx` | the Finish dialog with the picker; the new hint | `MePicker` |
| Tour | `src/components/onboarding/steps.ts`, `steps.test.ts` | the Collection step; the Summary wording | — |
| Tests | see section 8 | — | — |

**Not touched:** `HistoryPage.tsx` (its delete message comes from `sessionLabel.ts`), `HistoryDetailPage`,
`SessionCard`, `SummaryPage`, `FinalSettlement`, all of `src/pdf/`, `api/sessions/index.ts`, `useOnboarding.ts`,
`NewSessionDialog`, `ConfirmDialog`, `SyncBanner`, `OnboardingTour.tsx`, `mergeLoaded`, `keepOpenedActivity`,
`DevSessionsBar`, `DevDataBar`. Nothing changes in the PDF, History or Summary figures (BR-16).

## 3. Data model

Add these four statements to `scripts/db/schema.sql`. Each one goes where shown, with its comment.

```sql
-- After the onboarded_at alter:
-- The name the user goes by in their groups, tidied and title-cased by the
-- app. Collection matches it against each session's members to work out which
-- one is the user. Null means not set yet.
alter table users add column if not exists display_name text;

-- After the activity_at alter:
-- Which member the user said they are in this finished session. Null means no
-- pick, and Collection falls back to matching the profile name. The empty
-- string means "I'm not in this session", which can't collide with a member
-- because a member name is never empty.
alter table expense_sessions add column if not exists me text;

-- At the end of the file, after purchase_records:
-- Payments recorded against a finished session's settlement lines. Keyed by the
-- pair, not by who the user is, so changing the pick never moves a payment.
-- Whole centavos: exact, and the driver returns an integer as a JS number,
-- where numeric would come back as a string.
create table if not exists session_payments (
  id           text primary key,          -- client-minted "pay_xxx", so a retry is idempotent
  session_id   text not null references expense_sessions (id) on delete cascade,
  debtor       text not null,
  creditor     text not null,
  amount_cents integer not null check (amount_cents > 0),
  created_at   timestamptz not null default now()
);

create index if not exists session_payments_session_id_idx on session_payments (session_id);
```

- **Existing rows:** `display_name` and `me` are `null`, and no session has a payment. So every old finished
  session shows as Unpaid (US-12), placed by the profile match.
- **Idempotent:** every statement is `if not exists`, so re-running `apply-schema.ts` does nothing.
- **Non-destructive:** nothing is dropped, rewritten or backfilled. The two nullable columns with no default only
  change the catalog. The new table starts empty. The cascade only affects rows in the new table: deleting a
  session deletes its payments (BR-17, A15).
- **Centavos, not `numeric(12,2)`.** This departs from the architect's sketch. It's exact, the check is a simple
  `> 0`, and `@vercel/postgres` returns `integer` as a number but `numeric` as a string. `integer` holds up to
  ₱21,474,836.47 per payment.
- **Rollback:** leave all three in place, because old code ignores them. Never drop them on `main`.

### Applying it to the shared Neon `main` branch

**What runs it:** `npx vite-node scripts/db/apply-schema.ts`, the same as the activity-order precedent. It reads
`HATI_DATABASE_URL` from `.env.local`, which points at the shared Neon `main` used by local dev, sit, qat and uat.

**Gate (A15):** approving this spec does **not** authorise the run. At build time the fullstack-developer stops
before task 1's run and asks the coordinating session for the owner's explicit OK. Only with it does the developer
run the script once and report its output. Without it, the developer stops there.

**When:** before any `api/` file is edited. `vercel dev` reloads functions as soon as their files change, and the
new `loadSessions` selects `me` and reads `session_payments`. New code against an unaltered database fails
`GET /api/sessions` with a 500.

**Old code against the altered database** (sit, qat and uat until this ships there) keeps working:

- Old `select`s name their columns.
- The old PUT's insert and its `on conflict … set` list their columns, so they never touch `me`.
- The old DELETE removes a session, and the cascade takes its payments with it.
- A tab still running the old bundle after the deploy sends PUTs without `me`. The new server reads that as
  `null`, and `coalesce` keeps the stored pick (section 4).

**stg and prod:** the devops-engineer runs the same command with `DATABASE_URL_OVERRIDE`, before the hop that
first brings this code there.

**Verify:** the script prints its table list, now including `session_payments`, and a second run succeeds the
same way. Home loads on `http://localhost:3000`.

## 4. API contract

Every route keeps these rules:
- `getUserId`: 401 `{ error: 'Not signed in.' }` without a user, and 500 `{ error: 'Auth is misconfigured.' }` if
  auth is misconfigured.
- An explicit ownership check: another account's id is a 404.
- Validation in `api/_validate.ts`.
- `pool.sql` or `client.sql` templates only.
- Imports from `src/` use the `.js` extension.

### Types (`src/types/index.ts`)

```ts
/** One payment against a finished session's settlement line. Never edited; undo deletes it. */
export type Payment = {
  /** Client-minted `pay_xxx`, so a retried request can't record it twice. */
  id: string;
  debtor: string;
  creditor: string;
  /** Whole centavos, always above 0. */
  amountCents: number;
  /** ISO time the server recorded it. */
  createdAt: string;
};

/** What the client sends to record a payment; the server stamps the time. */
export type NewPayment = Omit<Payment, 'createdAt'>;
```

`Session` gains these two fields:

```ts
  /**
   * Who the user said they are in this finished session: a member's name,
   * `NOT_IN_SESSION` ('') for "I'm not in this session", or null for no pick,
   * which leaves it to the profile-name match (see `resolveMe`).
   */
  me: string | null;
  /** Recorded payments, oldest first. Read-only on the session; written through `/api/payments`. */
  payments: Payment[];
```

### `GET /api/sessions` (the response gains `me` and `payments`)

`loadSessions` in `api/_shared.ts` becomes `loadSessions(userId: string, only: string | null = null)`. The second
argument is for the payments POST, which needs one session. Both existing queries gain
`and (${only}::text is null or <session id column> = ${only})`, using `id` in the sessions query and `s.id` in the
records query. Then:

- The sessions query selects `me` as well, and `SessionRow` gains `me: string | null`.
- A third query:

  ```sql
  select p.id, p.session_id, p.debtor, p.creditor, p.amount_cents, p.created_at
  from session_payments p
  join expense_sessions s on s.id = p.session_id
  where s.user_id = ${userId} and (${only}::text is null or s.id = ${only})
  order by p.created_at, p.id
  ```

- Payments are grouped by session the same way as `bySession`. The mapping adds `me: s.me` and
  `payments: paymentsBySession.get(s.id) ?? []`. Each payment maps to
  `{ id, debtor, creditor, amountCents: row.amount_cents, createdAt: iso(row.created_at) }`.
- The handler is unchanged: `loadSessions(userId)`.

### `PUT /api/sessions/:id` (stores `me`; ignores `payments`)

- **Validation:** unchanged, through `parseSessionInput` → `parseSession`. That now sets
  `me: parseMe(raw.me, members)` and always `payments: []`, so **a `payments` field in the body is never read**.
  An unreadable `me`, or a name that isn't one of the body's members, becomes `null` and isn't rejected, so older
  clients stay valid.
- **SQL:** add `me` to the insert's column and value lists (`${session.me}`), and add to `on conflict … set`:

  ```sql
  me = coalesce(excluded.me, expense_sessions.me)
  ```

  A `null` means "this write carries no pick", so an older client or a draft's save never wipes a stored pick. No
  feature needs to clear a pick back to `null`. `''` is a real value, so `coalesce` keeps it.
- Statuses and response are unchanged.

### `POST /api/payments` (new: `api/payments/index.ts`)

Records one or more payments for one owned, finished session, **all or nothing**. "Record payment", "I paid" and
"Mark fully paid" send one entry. "Mark all as paid" sends one entry per open line.

- **Request:** `{ "sessionId": "session_x", "payments": [{ "id": "pay_x", "debtor": "Ana", "creditor": "Renmar", "amountCents": 10000 }] }`.
- **Validation:** `parsePaymentsInput(raw)` in `api/_validate.ts`. It returns
  `{ sessionId: string; payments: NewPayment[] } | null`, and `null` for any of these:
  - `raw` isn't a plain object.
  - `sessionId` isn't a non-empty string of at most 200 characters.
  - `payments` isn't an array of 1 to 100 entries.
  - An entry isn't a plain object.
  - An entry's `id` doesn't match `/^pay_[A-Za-z0-9]{1,64}$/`.
  - An entry's `debtor` or `creditor` isn't a non-empty string of at most 200 characters, or the two are equal.
  - An entry's `amountCents` isn't a safe integer from 1 to 2,147,483,647.
  - Two entries share an id or a `(debtor, creditor)` pair.
- **Handler order:**
  1. 401 if there's no user.
  2. Anything but POST is 405 with `Allow: POST`.
  3. Parse the body as `typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body`, then 400
     `{ error: 'Malformed payment.' }` if `parsePaymentsInput` returns null.
  4. `const client = await pool.connect()`, then `begin`. Lock the session, so two devices' payments on one
     session are checked one at a time (A5) and a PUT can't change the session halfway through:
     `select status from expense_sessions where id = ${sessionId} and user_id = ${userId} for update`.
     No row: `rollback`, then 404 `{ error: 'No such session.' }`. That covers another account's id and a session
     deleted meanwhile.
  5. `select id, debtor, creditor, amount_cents, created_at from session_payments where session_id = ${sessionId}`.
     Entries whose id is already in that list are **already recorded**, from a retry after a timeout. They skip
     every check below and aren't inserted again. If every entry is already recorded, `commit` and return 201.
  6. If `status !== 'closed'`: `rollback`, then 409 `{ error: "This session isn't finished yet.", code: 'not_finished' }`.
  7. `const [session] = await loadSessions(userId, sessionId)`, then `const pairs = settlementPairs(session)`.
     This read happens after the lock, so it sees the committed session.
  8. For each new entry, in order:
     - It must match a pair in `pairs` exactly, on both `debtor` and `creditor`. If not: `rollback`, then 409
       `{ error: "That line isn't in this session any more.", code: 'not_a_line' }`.
     - `remaining = pair.amountCents − (sum of that pair's existing amount_cents)`, floored at 0. If
       `entry.amountCents > remaining`: `rollback`, then 409 with this body. The `payments` list lets the client
       refresh the line without a reload (AC-7.12).

       ```json
       {
         "error": "Only ₱200.00 is left on this line.",
         "code": "over_remaining",
         "payments": "<every payment of the session, as in GET>"
       }
       ```

       When `remaining` is 0, the error is "This line is already paid in full." instead. The amount is
       `formatCents(remaining)`.
  9. Insert each new entry:

     ```sql
     insert into session_payments (id, session_id, debtor, creditor, amount_cents)
     values (${p.id}, ${sessionId}, ${p.debtor}, ${p.creditor}, ${p.amountCents})
     on conflict (id) do nothing
     ```

     A `rowCount` of 0 means the id belongs to another session, which is practically impossible with random ids:
     `rollback`, then 409 `{ error: 'That payment id is already in use.', code: 'id_conflict' }`.
  10. `commit`, then 201 `{ ids: payments.map((p) => p.id) }`.
  - Wrap steps 4 to 10 in `try { … } catch (err) { await client.sql\`rollback\`; throw err; } finally { client.release(); }`,
    as the session PUT does. Every early return above does its own `rollback` first.
- **Statuses:** 201, 400, 401, 404, 405, 409, and 500 for misconfigured auth or a body that isn't JSON.
- No `ensureUser`, because a session already implies its user.

### `DELETE /api/payments/:id` (new: `api/payments/[id].ts`)

- 401 without a user. Anything but DELETE is 405 with `Allow: DELETE`. A missing id is 400
  `{ error: 'A payment id is required.' }`.
- The ownership check is part of the delete itself:

  ```sql
  delete from session_payments p
  using expense_sessions s
  where p.id = ${paymentId} and p.session_id = s.id and s.user_id = ${userId}
  ```

  A `rowCount` of 0 is 404 `{ error: 'No such payment.' }`. That covers another account's payment and one
  already undone. Otherwise 204.
- The client treats 404 as done, because an undo that finds nothing has nothing left to undo.

### `GET` and `PATCH /api/user`

- **GET:** select `onboarded_at, display_name`. The response adds `displayName: rows[0]?.display_name ?? null`.
  `onboardedAt` is unchanged, so `useOnboarding` keeps working untouched.
- **PATCH (new):**
  - **Request:** `{ "displayName": string | null }`.
  - **Validation:** `parseProfileInput(raw)` returns `{ displayName: string | null }`, or `null` when `raw` isn't
    a plain object or `displayName` is neither a string nor `null`. The name goes through
    `normaliseProfileName`, so a blank one becomes `null`, which unsets the name (AC-2.4). 400
    `{ error: 'Malformed profile.' }` on null.
  - **Handler:** `ensureUser(userId)`, then `update users set display_name = ${displayName} where id = ${userId}`,
    then 200 `{ displayName }` with the stored value.
- The 405 fallback becomes `Allow: GET, PUT, PATCH`.

### `api/_validate.ts` additions

`parsePaymentsInput` and `parseProfileInput`, as specified above, each with a doc comment saying why: the request
is the whole write, so anything malformed is a 400 rather than a default. They import `normaliseProfileName` from
`'../src/lib/profileName.js'` and `type { NewPayment }`.

## 5. Business logic

### Money rules (BR-10 to BR-15)

- **Everything in Collection is whole centavos.** Line amounts come from the existing settlement code in pesos,
  already rounded to 2 places, and convert once with `toCents = Math.round(roundMoney(pesos) * 100)`. Payments are
  stored and sent in centavos. Sums and differences are integer arithmetic, so there's no float dust, and
  "remaining under ₱0.005" can't happen (BR-11). The only conversion back is for display:
  `formatCents(c) = formatMoney(c / 100)`.
- **Lines** are exactly the Summary's final settlement: `getFinalSettlement(getNettedOwedMatrix(getRawOwedMatrix(records, sorted)), sorted)`,
  with `sorted = sortNames(members)`, the same calls `SummaryPage` makes. So Collection always agrees with the
  Summary and the PDF.
  - The leftover centavo of an uneven split falls where `splitEvenly` already puts it. Trip B gives Ana ₱33.34 and
    Ben ₱33.33, and paying ₱33.34 settles Ana's line exactly (AC-7.7).
  - Lines under ₱0.005 are already dropped by the settlement code's `EPSILON` filter.
  - A line with 0 centavos is dropped as well.
- **Paid** is the sum of a line's payments. **Remaining** is `max(0, amount − paid)`. **Overpaid** is
  `max(0, paid − amount)`. Overpayment only arises if the numbers changed after a payment, which the server's cap
  otherwise prevents (BR-15).
- **Status:** Unpaid when paid is 0, Partial when paid is above 0 and remaining is above 0, and Paid when
  remaining is 0 (BR-13).
- **A payment counts toward a line** only when its `debtor` and `creditor` both equal the line's, exactly. Any
  other payment is hidden and adds to nothing (BR-15, AC-5.5). It isn't deleted, and it shows again if the line or
  the pick comes back.
- **The cap:** a new payment is above 0, has at most 2 decimals, and is at most the remaining amount. The client
  checks it in the form, and the server checks it again in the POST under the session lock (BR-12). Mark fully
  paid and Mark all as paid send the remaining amount at the moment of the tap.
- **Closed sessions only** (BR-1). The client lists only `status === 'closed'`, and the server rejects a payment
  on a draft with `not_finished`.
- **Zero values:**
  - A session with no lines involving the user is Settled, with "Nothing to collect. You're even with everyone."
  - Remaining 0 hides the line's actions.
  - Strip totals of 0 read ₱0.00.

### `src/lib/collection.ts` (new)

Its imports: `./calculations.js`, `./format.js` and `./money.js`, plus `import type { Payment, Session }`. The API
imports it, so the extensions are required (`apiImports.test.ts`). For the same reason, **`src/lib/calculations.ts`
changes `from './money'` to `from './money.js'` and `from './format'` to `from './format.js'`**, and nothing else.

Write the core as follows. The comments say why.

```ts
/**
 * Stored in `Session.me` when the user said they are not in the session. A
 * member name is never empty (`addMember` rejects one), so it can't collide.
 */
export const NOT_IN_SESSION = '';

export const toCents = (pesos: number): number => Math.round(roundMoney(pesos) * 100);
export const formatCents = (cents: number): string => formatMoney(cents / 100);

/**
 * The stored pick as the parser accepts it: the not-in-session marker or one
 * of the session's own members, exactly. Anything else is no pick rather than
 * an error, so an older client's save is never rejected for it.
 */
export function parseMe(raw: unknown, members: string[]): string | null {
  if (raw === NOT_IN_SESSION) return NOT_IN_SESSION;
  return typeof raw === 'string' && members.includes(raw) ? raw : null;
}

/**
 * The one member whose name matches the profile name, ignoring case and
 * accents but not spaces (BR-4). More than one match is treated as none:
 * guessing between them would put payments on the wrong lines.
 */
export function matchMember(members: string[], profileName: string | null): string | null {
  if (profileName === null) return null;
  const hits = members.filter((m) => compareNames(m, profileName) === 0);
  return hits.length === 1 ? hits[0] : null;
}

export type Me =
  | { kind: 'member'; name: string; picked: boolean }
  | { kind: 'notInSession' }
  | { kind: 'unknown' };

/** BR-5: an explicit pick, then the profile match, then unknown (Needs setup). */
export function resolveMe(
  session: Pick<Session, 'me' | 'members'>,
  profileName: string | null,
): Me {
  if (session.me === NOT_IN_SESSION) return { kind: 'notInSession' };
  if (session.me !== null && session.members.includes(session.me)) {
    return { kind: 'member', name: session.me, picked: true };
  }
  const match = matchMember(session.members, profileName);
  return match === null ? { kind: 'unknown' } : { kind: 'member', name: match, picked: false };
}

export type SettlementPair = { debtor: string; creditor: string; amountCents: number };

/** Every settlement line of the session, the same ones the Summary and the PDF show. */
export function settlementPairs(session: Pick<Session, 'members' | 'records'>): SettlementPair[] {
  const members = sortNames(session.members);
  const netted = getNettedOwedMatrix(getRawOwedMatrix(session.records, members));
  return getFinalSettlement(netted, members).flatMap((s) =>
    s.lines
      .map((l) => ({ debtor: s.debtor, creditor: l.creditor, amountCents: toCents(l.amount) }))
      .filter((p) => p.amountCents > 0),
  );
}
```

The rest of the module, with exact behaviour:

- **`type LineStatus = 'unpaid' | 'partial' | 'paid'`.**
- **`type CollectionLine`.** Its fields:
  - `key: string`, which is `JSON.stringify([debtor, creditor])`.
  - `direction: 'owedToYou' | 'youOwe'`.
  - `other: string`, the other person.
  - `debtor`, `creditor`, `amountCents`, `paidCents`, `remainingCents`, `overpaidCents`, `status`.
  - `payments: Payment[]`, this pair's payments, newest first by `createdAt`, then by id descending.
- **`type Bucket = 'needsSetup' | 'outstanding' | 'settled'`.**
- **`type CollectionCard`.** Its fields:
  - `session`, `me: Me`, `bucket`.
  - `owedToYou: CollectionLine[]`, `youOwe: CollectionLine[]`.
  - `lineCount` and `settledLineCount`, for "X of Y settled" (BR-12).
  - `owedToYouRemainingCents`, `youOweRemainingCents`.
  - `receivedCents` and `paidOutCents`, the sum of counted payments on each side.
  - `settledAt: string`.
- **`buildCard(session, profileName): CollectionCard`:**
  - `me = resolveMe(session, profileName)`.
  - If `me.kind !== 'member'`, there are no lines. The bucket is `needsSetup` for `unknown` and `settled` for
    `notInSession`.
  - Otherwise, from `settlementPairs`:
    - A pair with `creditor === me.name` is an `owedToYou` line, with `other = debtor`.
    - A pair with `debtor === me.name` is a `youOwe` line, with `other = creditor`.
    - All other pairs are dropped (BR-2).
  - **Line order in each group:** lines with `remainingCents > 0` first, then `compareNames(a.other, b.other)`
    (BR-17a).
  - **Bucket:** `settled` when every line is Paid, including when there are none. Otherwise `outstanding`.
  - **`settledAt`:** the latest `createdAt` among the counted payments. When there are none, as with no lines or
    not in the session, it's `session.closedAt ?? session.createdAt`.
- **`buildCollection(sessions, profileName)`.** It keeps `status === 'closed'` only, builds each card, and returns
  `{ needsSetup, outstanding, settled, owedToYouCents, youOweCents }`.
  - **Order:** needsSetup and outstanding by `closedAt` newest first; settled by `settledAt` newest first. Ties go
    to the lower id, compared by code unit as in `compareByRecentActivity`. Times are compared as `Date.parse`
    milliseconds, with an unreadable time as 0.
  - **Totals:** the sums of `owedToYouRemainingCents` and `youOweRemainingCents` over **outstanding only**
    (BR-14).
- **`parsePaymentAmount(raw: string, remainingCents: number)`.** It returns
  `{ ok: true; cents: number } | { ok: false; message: string }`. Integer parsing only, never `parseFloat`, so
  "33.34" is exactly 3334. The steps:
  1. Strip `₱`, commas and whitespace, as `parseAmount` does (AC-7.8).
  2. If what's left is empty: "Enter an amount greater than ₱0.00."
  3. Match `/^(-?)(\d*)(?:\.(\d*))?$/`. If there's no match, or no digit on either side of the point: "Enter a
     number."
  4. A fraction of more than 2 digits: "Use at most 2 decimal places."
  5. `cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'))`. A leading `-`, or `cents <= 0`:
     "Enter an amount greater than ₱0.00."
  6. `cents > remainingCents`: `That's more than what's left (${formatCents(remainingCents)}).`
  7. Otherwise `{ ok: true, cents }`.
- **`openLinePayments(card)`.** It returns `Omit<NewPayment, 'id'>[]`, one entry per line in either group with
  `remainingCents > 0`, at that remaining amount. Both Mark all as paid and the demo data use it.
- **`markAllMessage(card)`.** It returns the confirmation's text, with `T = sessionDisplayTitle(card.session)`,
  importing `sessionLabel.js`:
  - Both sides open: `This records the ₱X still owed to you and the ₱Y you still owe on “T”, as one payment per person. You can undo each one on its own.`
  - Only owed to you: `This records the ₱X still owed to you on “T”, as one payment per person. You can undo each one on its own.`
  - Only you owe: `This records the ₱Y you still owe on “T”, as one payment per person. You can undo each one on its own.`

  `sessionLabel.ts` imports `./format` without an extension. Because the API imports `collection.ts`, change it
  to `./format.js` as well. That's its only other import change.
- **`mergeServerPayments(local, server, inFlightAdd, inFlightRemove)`.** It returns a session's payments after an
  `over_remaining` reply: the server's list, minus any undo still in flight, plus any local payment whose add is
  still in flight and isn't in the server's list.

  ```ts
  const serverIds = new Set(server.map((p) => p.id));
  return [
    ...server.filter((p) => !inFlightRemove(p.id)),
    ...local.filter((p) => inFlightAdd(p.id) && !serverIds.has(p.id)),
  ];
  ```

### `src/lib/profileName.ts` (new)

```ts
/** The longest a profile name can be, in characters, once tidied. */
export const PROFILE_NAME_MAX = 60;

/**
 * The one rule for the profile name, shared by the server and the field, so it
 * is stored the way member names are entered: tidied and title-cased (BR-3).
 * A blank name is no name, which is how a name is unset.
 */
export function normaliseProfileName(raw: unknown): string | null
```

Its steps: return `null` unless `raw` is a string. Replace `/[\s\p{Cc}]+/gu` with a space and trim, and return
`null` if that's empty. Then `toTitleCase`. Then cut to `PROFILE_NAME_MAX` code points with
`Array.from(...).slice(0, 60).join('').trimEnd()`. It imports `toTitleCase` from `'./format.js'`.

### `src/lib/format.ts` additions

- `formatLocalDate(iso)`: `Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' })`,
  in local time, so "November 4, 2026".
- `formatLocalDateTime(iso)`: `{ year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }`,
  in local time, so "Nov 4, 2026, 3:15 PM".
- Both return `iso` unchanged if it isn't a readable time.

### `src/lib/storage.ts`

- `parseSession` adds `me: parseMe(raw.me, members)` and `payments: []`, importing from `'./collection.js'`. The
  doc comment says why `payments` is always empty: payments are never written through a session body.
- `migrateV1` adds `me: null, payments: []`.

### `src/lib/writeQueue.ts`

- `FailureKind` becomes `'save' | 'delete' | 'load' | 'seed' | 'payment'`. Add to the `Failure` doc comment that a
  payment failure has already been reverted on screen, so it's left out of `failedSessionIds` and never shows the
  reverted-edit note. `failedSessionIds` itself is unchanged.
- `sameSessionContent` adds `a.me === b.me &&`. Payments stay out of it, because they're never part of a session
  save.

### `src/lib/sessionLabel.ts`: `deleteSessionMessage` (BR-19)

For `n > 0`, `P = session.payments.length` (every payment, shown or hidden, because all of them go):

- **Closed with `P > 0`:** `“${title}” and its ${pluralize(n, 'purchase')} will be deleted, along with its ${pluralize(P, 'recorded payment')}. Its statement can no longer be downloaded and the payments cannot be recovered. This cannot be undone.`
- **Closed with `P === 0`:** `“${title}” and its ${pluralize(n, 'purchase')} will be deleted, and its statement can no longer be downloaded, and it will leave Collection. This cannot be undone.`
- **Draft:** unchanged.

The no-purchase branches are unchanged (AC-13.4). Update the function's comment to mention payments.

### `src/hooks/useServerSessions.ts`

**New refs**, next to `opening`:

```ts
/**
 * Payment writes still in flight, counted by session id. A load landing
 * meanwhile keeps that session's on-screen copy, so an optimistic payment
 * isn't wiped before the server has it.
 */
const paying = useRef(new Map<string, number>());
/** Adds in flight by payment id, so an undo waits for its add to land first. */
const adding = useRef(new Map<string, Promise<unknown>>());
/** Undos in flight by payment id, kept out of a refresh after a rejected add. */
const removing = useRef(new Set<string>());
```

The load effect's unconfirmed test becomes
`(id) => queue.isBusy(id) || creating.current.has(id) || paying.current.has(id)`. Nothing else in the effect
changes.

**New messages:**

```ts
const PAYMENT_TIMEOUT = 'Recording the payment is taking too long. Tap Try again to see whether it was saved.';
const UNDO_TIMEOUT = 'Undoing the payment is taking too long. Tap Try again to see whether it was undone.';
```

**`addPayments(sessionId, payments: NewPayment[], onSettled?: (result: PaymentResult) => void)`.** `PaymentResult`
is `{ ok: true } | { ok: false; message: string }`, exported from this file. The caller mints the ids, so a retry
after a failure can reuse one (AC-7.10, no duplicates). The steps:

1. Find the session in `sessionsRef.current`. If it isn't there, call
   `onSettled?.({ ok: false, message: 'This session is gone.' })` and return.
2. `const now = new Date().toISOString()`. Commit the session with
   `payments: [...session.payments, ...payments.map((p) => ({ ...p, createdAt: now }))]`.
3. Increment `paying` for the session.
4. Start an async block, and register it in `adding` under each payment id and in `pending.track`:
   1. `await creating.current.get(sessionId)` and `await queue.settled(sessionId)`. The Finish save must land
      first, or the server still sees a draft (`not_finished`).
   2. `withDeadline(WRITE_TIMEOUT_MS, …)` around
      `authedFetch('/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, payments }) }, signal)`.
      Inside the deadline, read the JSON body when `!res.ok` and the type is JSON.
   3. **On 201:** `setFailures((f) => resolveFailure(f, 'payment', sessionId))`, then `onSettled?.({ ok: true })`.
   4. **Otherwise,** whether a non-201 status, a thrown error or a timeout:
      - **Revert:** with `const ids = new Set(payments.map((p) => p.id))`, remove those ids from the session's
        payments in `sessionsRef.current`, then commit.
      - If the body has `code === 'over_remaining'` and an array `payments`, set the session's payments to
        `mergeServerPayments(current, body.payments, (id) => adding.current.has(id) && !ids.has(id), (id) => removing.current.has(id))`.
      - If the session is no longer in `sessionsRef.current` (deleted meanwhile), stop there with no report.
      - Otherwise `fail({ kind: 'payment', sessionId, message })`, where `message` is:
        - `PAYMENT_TIMEOUT` on a timeout;
        - `` `Payment not recorded. ${body.error}` `` for a 409 with an error;
        - otherwise `` `Couldn't record the payment (${status}), so it was taken off. Try recording it again.` ``,
          or the thrown error's message when there's no status.
      - Then `onSettled?.({ ok: false, message: inline })`, where `inline` is `body.error` for a 409. Otherwise
        it's "Not recorded. Check your connection and try again.", or "This is taking too long. Check your
        connection and try again." on a timeout.
   5. `finally`: decrement `paying`, deleting the entry at zero, and delete the ids from `adding`.

**`removePayment(sessionId, paymentId, onSettled?: (result: PaymentResult) => void)`:**

1. Find the session and the payment. If either is missing, return.
2. Commit without it. Increment `paying`, and add the id to `removing`.
3. Start an async block in `pending.track`:
   1. `await adding.current.get(paymentId)`.
   2. Then, under the deadline: `DELETE /api/payments/${encodeURIComponent(paymentId)}`. A 204 or a 404 is done.
   3. **On done:** `resolveFailure(…, 'payment', sessionId)`, then `onSettled?.({ ok: true })`.
   4. **On failure:** put the payment back, unless the session is gone or the payment is already there. Then
      `fail({ kind: 'payment', sessionId, message })`, where `message` is `UNDO_TIMEOUT` on a timeout, otherwise
      `` `Couldn't undo the payment (${status}), so it's still recorded.` ``. Then `onSettled?.({ ok: false, … })`.
   5. `finally`: decrement `paying`, and remove the id from `removing`.

**Neither function** touches `queue`, `confirmations` or `put`. Payments never join the session save queue, so a
payment can't hold up a save, and a save can't carry or overwrite a payment.

**`replaceAll`** (dev-only): after each session's PUT, if `session.payments.length > 0`, POST them as
`{ sessionId, payments: session.payments.map(({ id, debtor, creditor, amountCents }) => ({ id, debtor, creditor, amountCents })) }`.

Add `addPayments` and `removePayment` to `Result`, with doc comments, and to the return value.

### `src/context/SessionsStoreContext.tsx`

- `createSession` adds `me: null, payments: []`.
- `closeSession(sessionId, me: string | null)`. The guard is unchanged. A closing session becomes
  `{ ...session, status: 'closed', closedAt: now, me: me ?? session.me }`. It's one save, so the pick lands with
  Finish (A2).
- New `setMe(sessionId, me: string)`. It returns the session unchanged, so nothing is sent, when
  `session.status !== 'closed' || session.me === me`, and otherwise `{ ...session, me }`, through
  `updateSession`. That's a normal PUT with the save queue, the banner and the leave prompt.
- `addPayments` and `removePayment` pass straight through from `useServerSessions`.
- Add all of them to `SessionsStoreValue` with doc comments, to the `useMemo` object and to its dependency list.

`AppDataContext.tsx`: `closeSession: (me: string | null) => void` and
`closeSession: (me) => store.closeSession(sessionId, me)`. The dev `DevDataBar` doesn't use it.

### `src/context/ProfileContext.tsx` (new)

It doesn't share `useOnboarding`'s request. That hook is deliberately silent on failure and does nothing else,
while the profile needs a status and saves. Two GETs of a tiny endpoint at sign-in cost nothing, and leaving
`useOnboarding` alone keeps the change surgical.

```ts
type ProfileValue = {
  status: 'loading' | 'ready' | 'error';
  displayName: string | null;
  /** The last failed save's message, until a save succeeds (shown on Collection's "You:" line). */
  saveError: string | null;
  /** Not optimistic: resolves true once the server has stored it, and only then updates `displayName`. */
  save: (raw: string) => Promise<boolean>;
  reload: () => void;
};
```

- **Load:** on `useAuth` loaded and signed in, and on each `reload`, `GET /api/user` via `authorisedFetch` and
  `withDeadline(WRITE_TIMEOUT_MS)`. Set `displayName` and status `ready`, or status `error`.
- **`save(raw)`:** `PATCH /api/user` with `{ displayName: raw }` and the same deadline.
  - On 200: set `displayName` from the response, clear `saveError`, and return true.
  - Otherwise: set `saveError` to "Your name wasn't saved. Edit it to try again." and return false.
- `useProfile()` throws outside the provider, as `useSessionsStore` does.
- `main.tsx` wraps `<App />` in `<ProfileProvider>`, inside `SessionsStoreProvider`.

## 6. UI

New text is exactly as written here. Money always goes through `formatCents`, and a person's name is shown as
stored.

### Tabs (`NavTabs.tsx`, `icons.tsx`, `App.tsx`)

- `TabId` becomes `'home' | 'collection' | 'history'`. `TABS` becomes Home, then
  `{ id: 'collection', label: 'Collection', Icon: CollectionIcon }`, then History. The button gets
  `data-tour="nav-collection"` from the existing template.
- **`CollectionIcon`:** a receipt with a tick, on the shared `Icon`:

  ```tsx
  <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21Z" />
  <path d="m9 11.5 2 2 4-4" />
  ```
- **`ProfileIcon`**, for the menu item:

  ```tsx
  <circle cx="12" cy="8" r="3.5" />
  <path d="M5 20a7 7 0 0 1 14 0" />
  ```
- **`App.tsx`:**
  - `Screen` gains `| { kind: 'collection'; openSessionId?: string }`, and `TOP_LEVEL` gains `'collection'`.
  - The doc comments on both say there are three tabs now.
  - `tourNavigate` and the tab `onChange` work unchanged, through `setScreen({ kind })`.
- **Phone (640px and under):** the pill now holds three tabs beside the New Session button on Home, Collection and
  History. Estimated widths are about 72px for Collection, 59px for History and 54px for Home, plus about 18px of
  pill padding. That's roughly 203px, against 228px available at 320px. The 228px is 320 minus the 16px left
  inset, the 52px button, its 16px inset and an 8px gap.
  - **Expected CSS change: none.** The ui-ux-tester measures it at 320px and 360px (T1).
  - **Only if** the pill's right edge comes within 8px of the button, add this inside the existing
    `@media (max-width: 640px)` block of `NavTabs.module.css`, scoped to NavTabs so SessionTabs is untouched:

    ```css
    /* Three top-level tabs beside the New Session button: a little less side
       padding keeps the pill clear of the button at 320px. */
    .row:not(.rowCentered) .tab {
      padding-left: 10px;
      padding-right: 10px;
    }
    ```

  - Desktop shows the text tabs "Home | Collection | History" and is otherwise unchanged (AC-1.2).

### Header Profile item (`Header.tsx`)

The installed `@clerk/clerk-react` is 5.61.10. `UserButton.MenuItems` takes `children`. A custom
`UserButton.Action` takes `{ label: string; labelIcon: ReactNode; onClick: () => void }`, and `labelIcon` is
required. `{ label: 'manageAccount' | 'signOut' }` places a default item.

```tsx
type Props = {
  /** Opens the profile dialog. Omitted on the loading screen, where there is nothing to open it over. */
  onOpenProfile?: () => void;
};

<UserButton afterSignOutUrl="/">
  {onOpenProfile && (
    <UserButton.MenuItems>
      <UserButton.Action
        label="Profile"
        labelIcon={<ProfileIcon className={styles.menuIcon} />}
        onClick={onOpenProfile}
      />
      <UserButton.Action label="manageAccount" />
      <UserButton.Action label="signOut" />
    </UserButton.MenuItems>
  )}
</UserButton>
```

- Listing the two defaults fixes the order as Profile, Manage account, Sign out.
- `Header.module.css` adds `.menuIcon { width: 16px; height: 16px; }`. The menu renders in a portal, but CSS
  Module classes are global, so the class still applies.
- `App` passes `onOpenProfile={() => setProfileOpen(true)}` on the main shell only, and renders
  `{profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}` beside `NewSessionDialog`.

### `ModalDialog` (`src/components/shared/ModalDialog.tsx`, new)

A `<dialog>` shell for the three new dialogs. It does what `NewSessionDialog` does: `showModal` on mount, guarded
for StrictMode; `onCancel` for Escape, which calls `preventDefault` and then `onCancel()`; a backdrop click that
must both start and end outside; and the `visualViewport` tracking. It applies
`${confirmStyles.dialog} ${sheetStyles.sheet}` (`ConfirmDialog.module.css`, `NewSessionDialog.module.css`).

Props: `{ labelledBy: string; onCancel: () => void; children: ReactNode }`. It closes with `ref.current?.close()`
before calling `onCancel`, so focus returns to the opener.

`NewSessionDialog` isn't refactored onto it, to keep the change surgical. The reviewer may note the duplication.

### Profile (`src/components/profile/`, new)

- **`ProfileNameField`:**
  - Props: `{ value, onChange, inputId, autoFocus? }`.
  - A labelled `<input type="text" maxLength={PROFILE_NAME_MAX}>`. The label reads "Your name". `maxLength`
    truncates without an error (AC-2.6).
  - Helper text, linked by `aria-describedby`: "Use the name your group calls you, exactly as it appears in your
    session member lists."
  - **Chip** (AC-2.2): `const suggestion = normaliseProfileName(useUser().user?.firstName ?? null)`. It shows when
    `suggestion !== null && suggestion !== normaliseProfileName(value)`. It's a `Button size="sm"` reading
    `Use ${suggestion}`, and it calls `onChange(suggestion)` without saving.
- **`ProfileDialog`:**
  - Mounted only while open, and starts at `displayName ?? ''`.
  - Title "Your name". It holds `ProfileNameField` and the actions Cancel and Save.
  - **Save** is a submit button. It's disabled, reading "Saving…", while `save` runs. True closes the dialog.
    False keeps it open with "Couldn't save your name. Check your connection and try again." in `role="alert"`
    under the field.
  - An empty field saves and unsets the name (AC-2.4).
  - Cancel and Escape save nothing (AC-2.5).
- **`ProfileBanner`** (the nudge, US-3):
  - A bordered block, not a dialog, at the top of Collection. Heading "What should Hati call you?", then
    `ProfileNameField` (no autofocus, AC-3.5) and a Save button.
  - Save is disabled while the field normalises to null or while saving. A failure shows the same inline alert.
  - It has no dismiss button.

### Finish dialog (`src/components/summary/FinishSessionDialog.tsx`, new; `CloseSessionButton.tsx`)

- **`CloseSessionButton`:**
  - The hint reads "Locks the numbers and starts collecting." (BR-18).
  - `ConfirmDialog` is replaced by `{confirming && <FinishSessionDialog … />}`. `data-tour="finish-session"` stays
    on the same button.
  - **On confirm:** `closeSession(me)`. Then, if `remember && me !== null && me !== NOT_IN_SESSION`, run
    `void profile.save(me)` without waiting for it. Then `onClosed()`.
- **`FinishSessionDialog`** (a `ModalDialog`). Props:
  `{ members: string[]; onCancel: () => void; onConfirm: (me: string | null, remember: boolean) => void }`.
  - Title "Finish this session?"
  - Message: "The numbers become final and can no longer be edited. You can track who has paid in Collection, and
    the session is filed in History."
  - `match = profile.status === 'ready' ? matchMember(members, profile.displayName) : null`.
  - **With a match and the picker closed:** "Collecting as **Renmar** · Change". "Change" is a ghost button that
    opens the picker in place, with the match preselected (AC-4.2). The dialog stays open.
  - **Without a match, or with the picker open:** `MePicker`, with the legend "Which one are you?". Nothing is
    preselected when there's no match. Choosing is optional (AC-4.3).
  - **Actions:** Cancel, then primary "Finish Session", which is always enabled.
    - With the picker open, Finish passes the selected value, or `null` if nothing is selected.
    - Without it (the match shown), Finish passes `null` (A1).
  - Cancel, Escape and the backdrop do nothing (AC-4.8).

### `MePicker` (`src/components/collection/MePicker.tsx`, new)

- Props: `{ legend: string; members: string[]; value: string | null; onChange: (v: string) => void; remember: boolean; onRememberChange: (v: boolean) => void }`.
- A `<fieldset>` with a `<legend>`, then one radio per member in `sortNames` order, then "I'm not in this
  session" (`NOT_IN_SESSION`). The `name` comes from `useId()`.
- **"Remember as my name"** is a checkbox, shown only when `profile.status === 'ready' && profile.displayName === null`
  and the value is a member. Its parent holds it, starting at `true` (AC-4.4, AC-5.2). It's hidden otherwise
  (AC-4.5). The `remember` value only matters while it's shown.
- On phone, each radio row is at least 38px tall.

### Collection page (`src/pages/CollectionPage.tsx`, new)

Props: `{ openSessionId?: string; onEditProfile: () => void }`. `App` renders
`<CollectionPage key={screen.openSessionId ?? ''} openSessionId={screen.openSessionId} onEditProfile={() => setProfileOpen(true)} />`.
The `key` resets the page's open and closed state when it's landed on from Finish.

From top to bottom:

1. **"You:" line** (AC-2.7). It always shows, even in the empty state:
   - With a name: "You: **Renmar** · Edit". "Edit" is a ghost button with `aria-label="Edit your name"`.
   - Without one: a ghost "Add your name" button.
   - Both call `onEditProfile`.
   - If `profile.saveError` is set, it shows below in `role="alert"`.
2. **Profile loading:** while `profile.status === 'loading'`, show the spinner with the text "Loading…", using
   `App.module.css` `.loading` and `.spinner`, and nothing below it. On `error`: "Couldn't load your profile." and
   a "Try again" button that calls `profile.reload()`. Nothing below (A6).
3. **`ProfileBanner`**, when `displayName === null` and at least one closed session exists (AC-3.1 to 3.3).
4. **Empty:** with no closed sessions, `<EmptyState title="Nothing to collect yet" description="Finish a session and it will show up here." />`.
   No strip and no banner (AC-1.4).
5. **Strip:** two tiles side by side at every width, `grid-template-columns: 1fr 1fr`:
   - "Owed to you" with `formatCents(owedToYouCents)`.
   - "You owe" with `formatCents(youOweCents)`.
   - The amounts use the `--mono` font.
   - Below the tiles, when Needs setup isn't empty: "Not counting 1 session that needs setup" or
     "Not counting N sessions that need setup".
6. **Needs setup:** heading `Needs setup (N)`, with `HomePage.module.css` `.heading`, then its cards. Nothing at
   all when it's empty (AC-5.6).
7. **Outstanding:** heading `Outstanding (N)`, then its cards. When it's empty but Settled isn't: "Nothing
   outstanding. Everything is settled." (AC-6.11).
8. **Settled:**
   - An `<h2>` holding a toggle button "Settled (N)", with `aria-expanded` and `aria-controls`. It's collapsed by
     default (AC-11.3), and its open state is component state only, so it isn't remembered.
   - It starts open only when `openSessionId` is a settled card (AC-4.9).
   - It isn't rendered when there are no settled cards.
9. **Live region:** a visually hidden `<p role="status">`, with a `.srOnly` class in `CollectionPage.module.css`.

**Page state:**
- `open: Set<string>`, the expanded cards. It starts as `{ openSessionId }` when given. Several can be open at
  once (AC-6.6).
- `failed: Map<string, { id: string; amountText: string; message: string }>`, keyed by
  `${sessionId}|${line.key}`, so a failed form survives its card moving between sections.
- `settledOpen`.
- `announcement`.

**Landing from Finish** (AC-4.9): once `profile.status === 'ready'` and the first sections render, an effect runs
`document.getElementById(\`collection-${openSessionId}\`)?.scrollIntoView({ block: 'start' })`. `App`'s
`onClosed` first runs `window.scrollTo(0, 0)`, then `setScreen({ kind: 'collection', openSessionId: screen.sessionId })`.
Its comment becomes: "Landing on Collection, with the session open, is the confirmation that the numbers are final
and collecting has started."

**Announcement** (AC-11.2): the page keeps a ref of the last session the user recorded a payment in. When that
session's bucket changes from `outstanding` to `settled` between renders, it sets the announcement to "Session
fully settled. Moved to Settled." and moves focus to the Settled toggle, so keyboard focus isn't lost with the
card. The toggle stays collapsed.

### `CollectionCard` (`src/components/collection/CollectionCard.tsx`, new)

The card is an `<article id={\`collection-${session.id}\`}>` with the `SessionCard` look: surface, border, radius
and 16px 18px padding. The title is `sessionDisplayTitle(session)`, and "Finished" is
`formatLocalDate(session.closedAt)`.

- **Needs setup** (US-5): the title, "Finished <date>", then `MePicker` with the legend "Which one are you?" and
  nothing preselected. Then a primary "Confirm" button, disabled until a choice is made. Confirm calls
  `setMe(session.id, choice)`, plus `profile.save(choice)` when Remember is on and shown. The card is always
  expanded and has no toggle.
- **Outstanding and Settled:**
  - **Header:** `<h3 className={styles.headerHeading}><button type="button" aria-expanded aria-controls={bodyId} onClick={toggle}>`,
    holding the summary and a chevron that rotates when open. The button is keyboard-operable for free.
    - **Outstanding summary:** title; "Finished <date>"; `${settledLineCount} of ${lineCount} settled`; and the
      remaining amounts, "Owed to you ₱600.00 · You owe ₱100.00". Each part shows only if that side has lines.
    - **Settled summary:** title; "Finished <date>"; then by case:
      - Member with lines: "Settled <formatLocalDate(settledAt)>", and "Received ₱X · Paid ₱Y", with each part
        only if that side has lines.
      - Member with no lines: "Nothing to collect. You're even with everyone."
      - Not in the session: "You're not in this session".
  - **"You are" line**, outside the header button and visible collapsed too (AC-5.4):
    - "You are **Renmar** · Change" for a member.
    - "You're not in this session · Change" for not-in-session.
    - "Change" opens `ChangeMeDialog`.
  - **Body**, when expanded (`id={bodyId}`):
    - A group headed "Owed to you", then a group headed "You owe", each an `<h4>` followed by `LineRow`s. A group
      with no lines isn't rendered (AC-6.7, AC-6.9).
    - **Outstanding only:** a "Mark all as paid" button at the end, with `aria-label={\`Mark all as paid in ${title}\`}`.
      - It opens a non-destructive `ConfirmDialog`: title "Mark everything as paid?", message
        `markAllMessage(card)`, confirm "Mark all as paid".
      - On confirm: `addPayments(session.id, openLinePayments(card).map((p) => ({ ...p, id: createId('pay') })))`,
        and the announcement ref is set to this session.
      - It's all or nothing (section 4). If it fails, the banner says so, nothing is recorded, and the button can
        simply be pressed again.
- **No delete action on any Collection card** (AC-13.5).

### `ChangeMeDialog` (`src/components/collection/ChangeMeDialog.tsx`, new)

- A `ModalDialog` titled "Who are you in this session?", holding `MePicker` with the same legend.
- The current choice is preselected: the member's name, or `NOT_IN_SESSION`.
- If `session.payments.length > 0`, the note "Payments already recorded on this session stay saved. Only the ones
  on your lines show here, and switching back shows them again." (AC-5.5).
- Cancel, and a primary "Save". Save calls `setMe(...)` and, when Remember is on and shown, `profile.save(...)`.
  The dialog then closes. The card re-sorts on the next render (AC-5.4).

### `LineRow` (`src/components/collection/LineRow.tsx`, new)

The wording follows BR-20. For an Owed to you line, the action is "Record payment", the field "Amount received",
and the history entry `Received ₱X`. For a You owe line, they're "I paid", "Amount you paid" and `You paid ₱X`.

- **Row 1:** the other person's name, then the amount on the right, `formatCents(amountCents)`.
  - The name is flex `1 1 auto`, `min-width: 0` and `overflow-wrap: anywhere`, so it wraps.
  - The amount is `flex: none`, `white-space: nowrap` and `--mono`, so it's never hidden (AC-6.8).
- **Row 2:** the progress text and the status chip.
  - Progress: `Paid ${formatCents(paid)} · ${formatCents(remaining)} left`; or "Paid in full" when paid equals
    the amount; or `Overpaid by ${formatCents(overpaid)}`.
  - Chip: Unpaid uses `--warn-bg` and `--warn-text`, Partial `--info-bg` and `--info-text`, and Paid
    `--accent-bg` and `--accent-text`. It's an 11px pill.
- **Row 3, while `remainingCents > 0` only** (AC-7.4, AC-8.4):
  - The action button, with `aria-label` `Record payment from ${other}` or `Record what you paid ${other}`.
  - "Mark fully paid", with `aria-label` `Mark ${other} as fully paid` or `Mark what you owe ${other} as fully paid`.
    It calls `addPayments` with one entry at the current `remainingCents` and a new id, and sets the announcement
    ref (US-8).
- **Inline form**, when the action is tapped or a `failed` entry exists for the line:
  - `<form>` with a label, then `<input type="text" inputMode="decimal" autoComplete="off">`.
  - It's prefilled with `(remaining / 100).toFixed(2)` (AC-7.1, AC-7.3), or with the failed entry's
    `amountText`. The input is focused when it opens.
  - Under it, `parsePaymentAmount(text, remainingCents)`. When that isn't ok, the message shows in an element
    linked by `aria-describedby`, and "Save payment" is disabled (AC-7.5).
  - Save payment and Cancel. Escape in the input cancels (AC-7.9).
  - **Submit:**
    - A `submitted` ref ignores a second submit (AC-7.10).
    - The id is the failed entry's `id` when its `amountText` parses to the same cents. Otherwise it's
      `createId('pay')`.
    - Clear the line's `failed` entry, close the form, and call `addPayments` with one entry.
    - `onSettled`: on failure, set `failed` for the line to `{ id, amountText, message }`. The form reopens with
      the typed amount and the message in `role="alert"`, and the figures have already reverted (AC-7.11,
      AC-7.12).
- **History**, newest first: one row per counted payment.
  - `Received ₱X` or `You paid ₱X`, then `formatLocalDateTime(createdAt)`, then an "Undo" ghost button
    (AC-10.1). Its `aria-label` is `Undo ${formatCents(amount)} received from ${other}` or
    `Undo ${formatCents(amount)} paid to ${other}`.
  - Undo opens a `ConfirmDialog` with `destructive`. Title "Undo this payment?", confirm label "Undo payment",
    message `This removes the ₱100.00 received from Ana on Nov 4, 2026, 3:15 PM.` or
    `This removes the ₱40.00 you paid Ben on Nov 4, 2026, 3:15 PM.`
  - Confirming calls `removePayment` (AC-10.2 to AC-10.4). There's no Edit anywhere (AC-10.6).

### Phone and desktop

- **New screens:** one layout at every width, the same single column as Home, inside `PageShell`. The rules
  below are the only ones gated behind `@media (max-width: 640px)`, in the new modules:
  - In `LineRow`, row 3's buttons share the width with `flex: 1 1 auto`, and history rows wrap their Undo under
    the text when needed (`flex-wrap: wrap`).
  - In `MePicker`, radio rows are at least 38px tall.
  - The strip's tile padding drops from 14px to 12px.
- **Desktop at 1280px:** the same column, at most 960px wide. Home and History are unchanged (AC-1.2).
- **Existing screens:** no change at any width except the tab bar, which has one more tab, and the Finish hint
  and dialog.
- **Twenty members** give up to 19 lines on one card, all rendered with no "show more" (AC-6.10).

## 7. Onboarding tour impact

- `ScreenShape` gains `| { kind: 'collection' }`.
- In `TOUR_STEPS`, insert this step between `workspace-back` ("Leave it for later") and `nav-history`, so History
  stays last:

  ```ts
  {
    target: 'nav-collection',
    title: 'Track who has paid',
    content:
      'Finished sessions show up here. Record payments as they come in, even part payments, and see who still hasn’t paid you.',
    screen: { kind: 'collection' },
  },
  ```

  It targets the Collection tab on the Collection screen, so it points at the screen the reader is on. It needs
  no data, because the tab is always mounted there (AC-14.2).
- The Summary step's `content` becomes: "Summary works out who pays whom, cancelling debts that run both ways. You
  can download it as a PDF, and when the numbers are final, finish the session to start collecting." (AC-14.3).
- The opening doc comment's route becomes "… come back out, look at Collection, finish on History".
- There's no Profile step (AC-14.4).
- **No `data-tour` attribute moves, is renamed or is duplicated.**
  - `nav-collection` is new and comes from the existing `nav-${id}` template.
  - `finish-session` stays on the same Finish button.
  - The Profile item lives in Clerk's own menu and gets no target.
- `tourNavigate` already handles any non-session kind with `setScreen({ kind })`. `tourScreen` passes
  `'collection'` through.
- The tour's session is never finished, so it never appears on Collection.
- **`steps.test.ts`:**
  - Add `'collection'` to the "visits every part of the app" list, which becomes `['collection', 'history', 'home', 'session:breakdown', 'session:expenses', 'session:summary']`.
  - Add `it('shows Collection after leaving the workspace and before History')`. It asserts that the index of the
    `nav-collection` step is the `workspace-back` index plus 1 and the last index minus 1.
  - Every existing case, including "never points at a screen the reader is not on yet", passes for the new step.
- Run `steps.test.ts` and `targets.test.ts` (AC-14.5).

## 8. Test plan

Vitest runs in `environment: 'node'` over `src/**/*.test.ts`, with no component tests. Adding them would need a new
dependency, so the UI is checked by the ui-ux-tester and wiring by the reviewer. Write each Vitest case before its
code and watch it fail.

### Vitest

The fixtures are Trip A to E from the requirements, built as `Session`s with `status: 'closed'`.

| File | Cases (AC / BR) |
|---|---|
| `src/lib/collection.test.ts` **(new)** | See the list below the table. |
| `src/lib/profileName.test.ts` **(new)** | `"  renmar   "` gives "Renmar"; `"bea  marie"` gives "Bea Marie" (AC-2.3); `""`, `"   "`, `null` and `42` give null (AC-2.4); 70 characters are cut to 60 code points with no trailing space (AC-2.6); a tab or `\u0000` inside becomes a space. |
| `src/lib/apiValidation.test.ts` **(new)** | It imports from `'../../api/_validate'`. **`parsePaymentsInput`:** a valid single entry and a valid 3-entry batch parse; null for a non-object, a missing `sessionId`, an empty array, 101 entries, a bad id (`'x'`, `'pay_'`, `'pay_a-b'`), debtor equal to creditor, an empty debtor, `amountCents` of `0`, `-1`, `1.5`, `'100'` or `2_147_483_648`, duplicate ids, and a duplicate pair. **`parseProfileInput`:** `{displayName:'  ana '}` gives `{displayName:'Ana'}`; `{displayName:null}` and `{displayName:'  '}` give `{displayName:null}`; `{}`, `{displayName:5}`, `null` and `[]` give null. |
| `src/lib/format.test.ts` | `formatLocalDate` and `formatLocalDateTime` on `new Date(2026, 10, 4, 15, 5).toISOString()` give "November 4, 2026" and "Nov 4, 2026, 3:05 PM", whatever the machine's time zone, because the input is built in local time. Unreadable input is returned unchanged. |
| `src/lib/sessionLabel.test.ts` | The factory gains `me: null, payments: []`. Closed with 3 purchases and 2 payments gives the exact BR-19 text, with "2 recorded payments"; with 1 payment, "1 recorded payment"; closed with no payments, the text ending ", and it will leave Collection. This cannot be undone."; the draft cases are unchanged (AC-13.1, 13.3, 13.4). |
| `src/lib/writeQueue.test.ts` | Factories gain `me: null, payments: []`. `sameSessionContent` is false when only `me` differs, and true when only `payments` differs. `failedSessionIds` leaves out a `'payment'` failure. Every existing case is unchanged. |
| `src/lib/sessionValidation.test.ts` | `parseSession`: `me` absent gives null; `me: 'Ana'` with Ana a member is kept; `me: 'Zed'` (not a member), `42` or `null` gives null and the session is still accepted; `me: ''` is kept as `''`; `payments: [{…}]` in the input gives `payments: []`. |
| `src/lib/storage.test.ts` | The round-trip literals gain `me: null, payments: []` (the closed one has `me: 'Ana'`) and still round-trip. The v1 migration gives `me: null` and `payments: []`. |
| `src/lib/activity.test.ts`, `src/lib/sessionName.test.ts` | Factories gain `me: null, payments: []`. No new cases. |
| `src/components/onboarding/steps.test.ts` | As in section 7. |
| `src/lib/apiImports.test.ts`, `targets.test.ts`, `calculations.test.ts`, `saveMessage.test.ts`, `demoData.test.ts` | Unchanged, and must pass. `apiImports` now reaches `collection.ts`, `calculations.ts`, `sessionLabel.ts` and `profileName.ts`. |

**`src/lib/collection.test.ts` (new):**

- **`settlementPairs`:**
  - Trip A gives exactly three pairs: Ana→Renmar 30000, Cara→Renmar 30000 and Renmar→Ben 10000 (Ben's ₱300
    and Renmar's ₱400 net to ₱100).
  - Trip B gives Ana→Renmar 3334 and Ben→Renmar 3333 (AC-7.7).
  - Trip D gives none.
- **`matchMember`:** "renmar" matches "Renmar"; "Jose" matches "José"; "Renmar L" doesn't match "Renmar"; null
  gives null; two members that both match give null (BR-4).
- **`resolveMe`:**
  - A pick of a member beats a different match.
  - `''` gives `notInSession` even with a match.
  - A pick that's no longer a member falls back to the match.
  - Otherwise the match, with `picked: false`; otherwise `unknown` (BR-5).
- **`buildCard`:**
  - **Trip A as Renmar:** owedToYou Ana 30000 and Cara 30000, youOwe Ben 10000; bucket outstanding; "0 of 3"; the
    remaining sums are 60000 and 10000 (AC-6.5, AC-6.7).
  - A payment of 10000 on Ana gives Partial, paid 10000, remaining 20000, and Ana stays first (AC-7.2).
  - Paying all three gives bucket settled, and `settledAt` equals the latest payment (AC-11.1).
  - **Line order:** a paid Ana sorts after an unpaid Cara (BR-17a).
  - Trip D gives no lines and is settled with `settledAt = closedAt`.
  - Trip C with no profile gives needsSetup; with `me: ''` it's settled.
  - A payment for a pair that isn't a line, such as Ana→Ben in Trip A, isn't counted or shown (BR-15).
  - Trip A after switching the pick to Ana shows only Ana's lines. Renmar's payments stay in `session.payments`,
    and switching back counts them again (AC-5.5, BR-7).
  - A payment above the amount gives `overpaidCents`, remaining 0 and Paid (BR-15).
- **`buildCollection`:**
  - Trip A and B unpaid, plus E (no match) and a draft: `owedToYouCents` 66667, `youOweCents` 10000 (AC-6.1); E is
    in needsSetup and excluded from the totals (AC-6.2); the draft is absent (AC-1.5).
  - **Order:** two outstanding cards by `closedAt` descending, ties by id; settled by `settledAt` descending.
  - Everything settled gives 0 and 0 (AC-6.3).
  - Renaming the profile from "Renmar" to "Ren" moves matched-only sessions to needsSetup and leaves picked ones
    (AC-12.3).
- **`parsePaymentAmount`** (remaining 20000):
  - Every row of AC-7.5 with its exact message.
  - `"200"` and `"0.01"` are ok (AC-7.6).
  - `"1,000"` with remaining 100000, and `"₱100"`, are ok (AC-7.8).
  - `"33.34"` gives exactly 3334.
  - `"."`, `"1.2.3"` and `"--1"` give "Enter a number."
  - `"-0"` gives the greater-than-0 message.
- **`openLinePayments`:** Trip A with Ana partly paid gives three entries at their remaining amounts, and none
  for a paid line (US-8b).
- **`markAllMessage`:** the three variants, exactly.
- **`mergeServerPayments`:** keeps the server's list; drops an id in flight for removal; keeps a local in-flight
  add that the server lacks; doesn't duplicate one the server already has.

### Reviewer checks (surgeon-reviewer)

- **R1.** Both payment routes: `getUserId` first; validation in `_validate.ts`; ownership through `for update` on
  `id` and `user_id` (POST) or the `using` join (DELETE); only `sql` templates; and every early return in the
  transaction rolls back before the client is released.
- **R2.** The PUT stores `me` with `coalesce(excluded.me, expense_sessions.me)` and never reads `payments`.
- **R3.** `addPayments` and `removePayment` never touch `queue`, `confirmations` or `put`. They revert on failure,
  report through `fail({ kind: 'payment' })` and count in `paying`, and `mergeLoaded`'s unconfirmed test includes
  `paying`.
- **R4.** No `data-tour` moved, renamed or duplicated. Mobile rules sit only inside `@media (max-width: 640px)`.
  Every Undo, Mark and Record button has its `aria-label`. No new dependency.

### ui-ux-tester walkthrough

Run on `http://localhost:3000` at 375px first, then 1280px, then the tab-fit checks at 320px and 360px.

**Ground rules:** the database is the shared Neon `main`, with real data.
- Use only sessions named "UI test …", and finish only those.
- Never use "Seed Sessions (replace)" or "Clear All".
- Run the profile-name checks (T2, T3, T12) on the second test account. If the owner's account must be used, note
  its profile name first and put it back at the end.
- To make a request fail, use DevTools Network "Offline" or block `/api/payments`.

**Setup:** set the test account's profile name to "Renmar". Create and finish:
- "UI test A": Trip A.
- "UI test B": Trip B.
- "UI test C": Ana and Ben only.
- "UI test D": Renmar and Ana, even.
- "UI test E": members "Renmar L" and Zoe.

| # | Steps | ACs |
|---|---|---|
| T1 | At 375px, Home, Collection and History all show icons and full labels with no horizontal scroll. At 320px and 360px, the pill clears the + button by at least 8px. If it doesn't, the developer applies section 6's fallback, and T1 is repeated. At 1280px the text tabs show and Home and History look as on `main`. Tap Collection: it has `aria-selected="true"` and `data-tour="nav-collection"`. The tab bar shows on Home, Collection and History, and not inside a session or History detail. | 1.1, 1.2, 1.3, 1.6 |
| T2 | On a fresh second account with no finished sessions, Collection shows "You:"/"Add your name", the empty text, and no strip and no banner. Drafts never appear. | 1.4, 1.5, 2.7, 3.2 |
| T3 | **Avatar menu:** the order is Profile, Manage account, Sign out. Profile opens the dialog with the field, helper text, Save and Cancel. The chip shows "Use <first name>" and fills the field without saving; it's hidden when they match. Save `"  renmar   "`: the line reads "You: Renmar · Edit", and the sessions re-sort at once. Clear the field and Save: "Add your name". Cancel and Escape change nothing. Paste 70 characters: 60 are kept. Reload on a second browser profile: the same name. | 2.1 to 2.9 |
| T4 | **Nudge:** with the name unset and a finished session, the banner shows. Focus isn't moved, nothing opens, and there's no dismiss. Save a name: the banner goes and the sessions re-sort. Set: no banner. | 3.1, 3.3, 3.4, 3.5 |
| T5 | **Finish a draft with Renmar a member:** the hint reads "Locks the numbers and starts collecting." The dialog title and message are BR-18's; it shows "Collecting as Renmar · Change", and Change opens the picker in place. Finish lands on Collection with that card open and scrolled to. **A draft without a match:** "Which one are you?", nothing preselected. Finishing with nothing chosen puts it in Needs setup. With the name unset and a member chosen, "Remember as my name" is on, and Finish saves the profile name. With the name set, there's no checkbox. Cancel leaves a draft. | 4.1 to 4.9, 14.1 |
| T6 | **Needs setup (E):** the title, "Finished <date>", the picker and Confirm. Pick Zoe: it moves to Outstanding or Settled, and the card shows "You are Zoe · Change". Pick "I'm not in this session" on C: it moves to Settled with "You're not in this session · Change". With Needs setup empty, its heading is gone. On A with payments, Change to Ana shows the payments note; Ana's lines show; Renmar's payments are hidden but come back when switched back. | 5.1 to 5.6, 12.2 |
| T7 | **Strip with A and B unpaid:** "Owed to you ₱666.67", "You owe ₱100.00", "Not counting 1 session that needs setup". Sections in the order Needs setup, Outstanding, Settled. A collapsed: its title, "Finished <date>", "0 of 3 settled", "Owed to you ₱600.00 · You owe ₱100.00". The header toggles with Enter and Space and has `aria-expanded`; two cards open at once. A expanded: Owed to you (Ana, Cara), then You owe (Ben). | 6.1, 6.2, 6.4 to 6.7, 6.9, 6.10 |
| T8 | **Record payment on Ana:** the form reads "Amount received", prefilled 300.00, with a numeric keyboard on a phone. Enter 100: "Paid ₱100.00 · ₱200.00 left", Partial, "Received ₱100.00" with the local date and time, and the strip at ₱566.67 at once. Reopen: 200.00. Try each AC-7.5 input: the message shows and Save is disabled. 200 is accepted. "1,000" and "₱100" parse. Cancel and Escape save nothing. Double-tap Save: exactly one row in DevTools POST bodies. | 7.1 to 7.10 |
| T9 | **Failure:** go Offline, then record 50 on Cara. The figures revert, the form reopens with "50" and an inline error, and the banner shows. Back online, Save again: one payment, and the request reuses the first attempt's id. **Two devices:** in profile 2, pay Cara in full; in profile 1 (not reloaded), record 100 on Cara: the inline error reads "This line is already paid in full.", and Cara's line refreshes to Paid. Undo profile 2's payment, then repeat with profile 2 paying ₱250: profile 1's ₱100 gets "Only ₱50.00 is left on this line." | 7.11, 7.12 |
| T10 | **Mark fully paid** on Partial Ana: it records 200, and the earlier 100 stays. Its `aria-label` names Ana, and it's hidden on Paid. **I paid** on Ben: the form reads "Amount you paid". 40 gives Partial, "You paid ₱40.00", and "You owe" drops. Mark fully paid records 60. | 8.1 to 8.4, 9.1 to 9.5 |
| T11 | **Mark all as paid** on B: the confirmation text is correct. Confirm: two payments, the card moves to Settled, the announcement is read, and focus lands on the Settled toggle. Undo one: it's back in Outstanding. With `/api/payments` blocked, Mark all records nothing, shows the banner, and the figures are unchanged. | US-8b, 11.2, 10.5 |
| T12 | **Undo:** history is newest first, and the Undo `aria-label` names the amount and person. The dialog reads "Undo this payment?", stating the amount and time. Cancel changes nothing. Undo removes only that one. Undoing a full payment gives Unpaid. There's no Edit. **Settled:** the heading "Settled (N)" is collapsed, and stays collapsed after leaving the page and coming back. Its cards show "Settled <date>" and "Received ₱X · Paid ₱Y"; D shows "Nothing to collect…"; payments are listed with Undo. **Rename** the profile to "Ren": A and B move to Needs setup, picked sessions stay, and no payment changes. Rename back. | 10.1 to 10.7, 11.1, 11.3 to 11.6, 12.1, 12.3 |
| T13 | History and the PDF of A look as on `main`, with no paid status. **History delete** of A with payments: the BR-19 text with the payment count. Confirm: it's gone from History and Collection, and `GET /api/sessions` has no payments for it. Finished without payments: the text ends "…and it will leave Collection." Drafts on Home: the text is unchanged. Collection cards have no delete. | 12.4, 13.1 to 13.5, BR-16 |
| T14 | **Tour (Preview Tour):** after "Leave it for later", Next shows "Track who has paid", highlighting the Collection tab on Collection, with no data needed. Then History is last. The Summary step has the new text, and there's no Profile step. Every highlight lands. On a fresh account, the same. | 14.2 to 14.5 |
| T15 | At 375px with a 20-member UI test session (19 lines): nothing overflows, and long names wrap without hiding the amount. Repeat T7, T8 and T12 at 1280px. | 6.8, edge cases |

### Checks before done

`npm run lint`, `npx tsc -b`, `npm test` and `npm run build`, with the real results reported.

## 9. Documentation impact

For the documentation-engineer, after this ships:

- **README:**
  - "How it works" gains a "Collection: who has paid" section. Summary's text mentions that finishing starts
    collecting. History's says finishing lands on Collection.
  - "Data and privacy": the SQL block gains `display_name`, `me` and `session_payments`.
  - Money handling: payments are whole centavos.
- **API reference,** wherever it's kept: `POST /api/payments`, `DELETE /api/payments/:id`, `PATCH /api/user`, and
  `me` and `payments` on `GET /api/sessions` and the PUT.
- **`docs/mobile-breakpoints.md`:** under 640px, list the new Collection modules' rules, plus the NavTabs fallback
  if it was applied.
- The pending entries in the agents' Word documents (see memory) are unaffected, and get updated only when the
  owner asks.

## 10. Tasks

1. **Schema (gated).** Add the four statements to `schema.sql`. **Stop and get the owner's explicit OK** through
   the coordinating session. Then run `npx vite-node scripts/db/apply-schema.ts` once, before touching any `api/`
   file, and report the output.
   → Verify: `session_payments` is listed, a second run succeeds, and Home loads on `:3000`.
2. **Tests first.** Write `collection.test.ts`, `profileName.test.ts`, `apiValidation.test.ts`, and the new cases
   in `format`, `sessionLabel`, `writeQueue`, `sessionValidation`, `storage` and `steps`.
   → Verify: `npm test` fails on exactly those.
3. **Types and pure logic:**
   - the types;
   - the `.js` imports in `calculations.ts` and `sessionLabel.ts`;
   - `collection.ts`, `profileName.ts` and the `format.ts` additions;
   - `storage.ts`, `writeQueue.ts` and `sessionLabel.ts`;
   - `me` and `payments` in `createSession`, `demoSessions.ts` and every test factory.
   → Verify: `npm test` and `npx tsc -b` pass.
4. **API:**
   - `parsePaymentsInput` and `parseProfileInput`;
   - `loadSessions`;
   - the PUT's `me`;
   - `api/payments/index.ts` and `[id].ts`;
   - `api/user.ts`.
   → Verify: `apiImports.test.ts` and `npx tsc -b` pass. On `:3000`, `GET /api/sessions` returns `me` and
   `payments`, and `GET /api/user` returns `displayName`.
5. **Client state:**
   - `useServerSessions`: the refs, the unconfirmed test, `addPayments`, `removePayment` and the `replaceAll`
     payments;
   - the store, `AppDataContext` and `ProfileContext`;
   - `main.tsx`.
6. **Demo data.** In `demoSessions.ts`, the four closed sessions get:
   - 1st: `me: null`. It matches by the profile name "Renmar", or lands in Needs setup.
   - 2nd: `me: 'Renmar'`, with half of its first open line paid, using `Math.floor(remaining / 2)` centavos.
   - 3rd: `me: 'Renmar'`, with `openLinePayments` for every line, so it's Settled.
   - 4th: `me: NOT_IN_SESSION`.

   Each payment gets `id: createId('pay')` and `createdAt: new Date().toISOString()`, because the server stamps
   its own time (A4). Drafts get `me: null, payments: []`. The module stays DEV-only behind `DevSessionsBar`'s
   lazy import.
7. **UI:**
   - icons and NavTabs;
   - `App` (screen, landing, profile dialog) and Header;
   - `ModalDialog`;
   - the profile components;
   - `MePicker`, `ChangeMeDialog`, `LineRow`, `CollectionCard` and `CollectionPage`;
   - `FinishSessionDialog` and `CloseSessionButton`.
8. **Tour.** `steps.ts`.
   → Verify: `steps.test.ts` and `targets.test.ts` pass.
9. **Full check.** `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`.
10. **Local preview.** On `http://localhost:3000`, walk T5, T8, T9 and T11 yourself. Then hand over to the
    surgeon-reviewer and the ui-ux-tester, with the branch and the local URL.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| New API code runs before the schema exists, so `GET /api/sessions` returns 500 | Task 1 runs first, behind the owner's OK. |
| Payments are real bookkeeping: a silent failure, a double record or an overpayment | Every failure reverts and shows in the banner, plus inline for the form. Client-minted ids make retries idempotent, and the form reuses the id. The server rechecks the cap under a row lock. Mark all is all or nothing. |
| Two devices pay the same line at once | `select … for update` on the session puts them in order. The second gets `over_remaining`, with the server's payments, so the line refreshes. |
| A wrong auto-match puts payments on the wrong lines | The match is exact and only counts when there's exactly one. "You are X · Change" is on every card. Payments are keyed by pair, so fixing "me" moves nothing. |
| A profile rename shuffles sessions into Needs setup | Expected (AC-12.3). No data changes, and picks are kept. |
| Exact match is brittle for full names ("Renmar L") | Those sessions land in Needs setup, and one pick fixes each. |
| Old finished sessions show as Unpaid | Mark all as paid, once per card. |
| The pick and Finish share one save; a failed Finish save reverts both on "Try again" | Today's behaviour (A2). The banner says so. |
| The three tabs don't fit beside + at 320px | Measured in T1, with a scoped fallback rule ready. |
| `calculations.ts` and `sessionLabel.ts` import changes | Extension-only edits, covered by `apiImports.test.ts` and the build. |
| The tester writes to the real database | The ground rules: UI test sessions only, profile changes on the second account. |

**Size: large.** About 40 files, of which 17 are new: a table, three endpoints, a pure module, a context, three
dialogs and a page. **Risk: medium.** The schema is additive only and existing saves keep their path, but payments
are a new write path that handles money.

## 12. Decisions for the user

1. **Applying the schema to Neon `main`.** It adds two nullable columns and an empty table, and changes no
   existing data. Per A15, approving this spec doesn't run it. The developer asks for your explicit OK at task 1.
   *Recommendation:* give that OK when asked. The alternative is to run it yourself before the build.
2. **Deleting a session deletes its payments** (A15 default), with the BR-19 warning. *Recommendation:* confirm
   it. Keeping orphaned payments would need a soft delete, which nothing else in the app has.
3. **"Mark all as paid" asks first, and is all or nothing.** *Recommendation:* as specified. It can write up to 19
   payments in one tap, so it confirms with the totals. All or nothing means a failure never leaves a card half
   marked. *Alternative:* no confirmation, since each payment can be undone. It's one tap fewer, but an
   accidental tap means up to 19 undos.
4. **Assumptions A1 to A6** in section 1 stand unless you overrule them. A1 (a matched Finish stores no pick) and
   A3 (local dates on Collection) are the ones most worth a glance.

Technical choices made here, no input needed:
- Centavos instead of `numeric(12,2)`.
- The pick travels in the existing PUT with `coalesce`, not a new `PATCH`.
- `''` marks "not in this session".
- Payments are routed `/api/payments` and `/api/payments/:id`, mirroring `/api/sessions`.
- One batch POST serves both single payments and Mark all.
- A separate `GET /api/user` for the profile.
- Payment writes revert on failure and report in the banner.
