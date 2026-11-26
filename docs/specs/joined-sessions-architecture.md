# Feature brief: joining a finished session through a live invite link

Author: system-architect. Planned against branch `agent-defs-markdown-docs` (3e2443f). Intake decisions: `/Users/rmlescano/.claude/plans/cached-waddling-wigderson.md`, taken as fixed. No repo file or database was touched while planning.

## Owner decisions (2026-11-20)

These answer the architect's questions. The sections below already include them.

1. **What participants can read: D1.** A participant gets the members and records, plus payments and claims only on their own lines. The server enforces this.
2. **Freshness: C1.** Reload on `visibilitychange`, throttled to about once every 30 seconds. No polling, no notifications.
3. **Who joined as whom:** the organizer sees the joiner's Hati profile name and join date only. No Clerk email lookup.
4. **Read-only guard: yes, on all finished sessions**, not only shared ones. On a stored closed session the PUT keeps `me`, `name` and `activity_at`, and ignores `status`, `members`, `records` and `closed_at`. Payments are unchanged.
5. **Deleting after others joined:** allowed, with a warning that says how many members are tracking the session.
6. **Older finished sessions:** yes. The token is minted on demand. This is the coordinator's default, following intake.
7. **Delivery: three PRs.**
   - PR 1: join and read-only access, plus organizer controls and the in-app link.
   - PR 2: claims.
   - PR 3: the QR on the SOA and on screen. It can be built in parallel.
8. **QR test fixtures:** golden matrices are generated once with a reference encoder on the developer's machine. Only the data is committed; nothing goes into `package.json`.
9. **Link origin:** `window.location.origin`. This is the coordinator's default. The one-off deployment URL caveat is a known limitation.
10. **Clerk cap:** the owner will check the user count in the Clerk dashboard before testers start inviting. This is a pre-uat checklist item (section 7).

## 1. Idea and problem
- **The idea:** members of a finished session join the organizer's session as one of its members, and everyone reads one shared payment ledger.
- **The problem:** today only the organizer can see a session's lines and record payments. The other members get a PDF and nothing else, so they can't follow what they owe or are owed, or say that they've paid.

## 2. Goal (checkable)
- An account that opens a valid invite link, signs in and taps Join sees its own lines for that session in Collection.
- The joined member can open the session read-only and cannot change anything (the server refuses).
- A debtor's "I've paid ₱X" shows as pending to both sides until the creditor confirms or declines it. The organizer does this when the creditor isn't on Hati. Once confirmed, both accounts show the same figures.
- Resetting the link makes the old link and QR return "doesn't work"; members who already joined keep access. Removing a member takes away their access on their next load.
- Opening the link a second time creates no duplicate. The organizer opening their own link is told it's their session.

## 3. Current state
**Ownership is "user_id equals caller" everywhere:**
- `ownsSession` and `loadSessions(userId, only)` in `api/_shared.ts`.
- The `where id = … and user_id = …` clauses in `api/sessions/[id].ts`.
- The payment lock `select status … where id and user_id … for update` and the DELETE-all in `api/payments/index.ts`.
- The delete join in `api/payments/[id].ts`.
- The payments POST checks remaining amounts by calling `loadSessions(userId, sessionId)`. That function only returns sessions the caller owns, so it has to change.

**`me` is one column per session** (`expense_sessions.me`), which is the organizer's pick. `resolveMe` and `matchMember` in `src/lib/collection.ts` read only `session.me` and the profile names.

**Payments:**
- `session_payments` is keyed by the pair, and its ids are minted by the client (`pay_xxx`) so a retry is idempotent.
- Totals are derived on every render (`buildLine` and `buildCard`) from `session.payments`.
- The server re-checks the remaining amount under the session row lock.

**Finished sessions are read-only only because the interface makes them so:**
- There is no reopen, and no member rename in any state (only add and remove, in drafts).
- `HistoryDetailPage` renders with `editable={false}`.
- The only writes a finished session gets are `setMe`, which is a full-session PUT from `ChangeMeDialog` or `CollectionCard`, and payments.
- The server's PUT will still rewrite `status`, `members` and `records` on a closed session. Owner decision 4 closes this gap.

**Client:**
- `useServerSessions` loads once and reloads only on "Try again". Nothing refetches when the window regains focus.
- Every edit is a whole-session PUT through `createSaveQueue` (`src/lib/writeQueue.ts`).
- `removeSession` treats a 404 as success.

**Entry and sign-in:**
- There is no router. `Screen` is in-memory state in `src/App.tsx`.
- `main.tsx` mounts `<SignIn routing="hash" />` when signed out and `SessionsStoreProvider` when signed in.

**PDF:**
- `downloadSoa` renders `SoaDocument` with `{members, records, name}`. It doesn't know the session's id or status.
- Exports happen from `SummaryPage` (drafts) and `HistoryDetailPage` (finished).
- The static PDF tests walk the element tree (`pdfTree.testutil.ts`).

**Environments:**
- One Clerk Development instance and one Neon `main` serve local development, sit, qat and uat. That instance has a 100-user cap, according to the Sept 29 handoff.
- sit and qat sit behind Vercel Authentication. uat is public.

## 4. Options
The overall direction (a live link) is decided. These were the structural choices still open; the chosen option is marked.

**A. Where pending and declined claims live**
- **A1 (chosen): a new `payment_claims` table.** Confirming a claim moves it into `session_payments` in one transaction, reusing the claim's id.
  - None of today's queries, totals or old code ever see a claim.
  - Effort: medium.
- **A2: add a `status` column to `session_payments`.** Fewer tables.
  - Every existing sum, remaining-amount check and DELETE would need a `status = 'confirmed'` filter.
  - Worse, the code still running on qat or uat against the same database would count pending claims as paid.
  - Risk: high on the shared database.

**B. Where the invite token lives**
- **B1 (chosen): a nullable `invite_token` column on `expense_sessions`**, with a partial unique index. Reset overwrites it.
- **B2: a `session_invites` table.** This allows several links or a history of links, which nobody has asked for.

**C. Freshness of the shared ledger**
- **C1 (chosen by the owner): reload when the tab becomes visible again** (`visibilitychange`), throttled to about once every 30 seconds. It reuses the existing load and merge path, which is already safe against writes still in flight.
- **C2: poll every N seconds.** More requests and more Neon compute, and little gain.
- **C3: realtime push (Pusher, Ably).** A new service and dependency, so it was rejected.

What C1 gives up: a claim appears for the other side only when they return to the app or refresh. There are no notifications.

**D. What a participant may read**
- **D1 (chosen by the owner): the server sends a participant the members and records** (the SOA content), but only the payments and claims on lines where their member is the debtor or the creditor. This is enforced in `loadSessions`, not in the UI.
- **D2: the whole ledger.** Every participant would see who has paid whom across the group. The SOA never showed that.

**E. Keeping `?join` through sign-in**
- **E1 (chosen):** read and stash the token in `main.tsx` before anything renders, then strip it from the URL.
  - It is stashed in `localStorage` with a one-hour expiry, and every access is wrapped in try/catch.
  - It survives Google OAuth, Clerk's hosted sign-up page and an email link opened in a new tab.
- **E2: keep it in the URL and set Clerk's redirect URLs.** This is fragile: the defaults fall back to `/`, and hosted sign-up and new tabs lose the query.

## 5. Recommendation
Take A1, B1, C1, D1 and E1, and deliver in three PRs (owner decision 7):

1. **PR 1, join and read-only access:** schema, invites (mint, reset, preview, join), loading joined sessions, the store-level read-only guard and the server's closed-session PUT guard, organizer controls (who joined, remove, reset), "Stop tracking", the link shown and copyable in the app, and refresh on focus.
2. **PR 2, payments by participants:** claims, confirm and decline, withdraw and dismiss, and creditors recording payments.
3. **PR 3, QR:** the encoder, plus the link and QR on the SOA and on screen. It has no data risk and can be built in parallel.

### Data model (additive and idempotent; appended to `scripts/db/schema.sql`)
```sql
alter table expense_sessions add column if not exists invite_token text;
create unique index if not exists expense_sessions_invite_token_idx
  on expense_sessions (invite_token) where invite_token is not null;

create table if not exists session_participants (
  session_id text not null references expense_sessions (id) on delete cascade,
  user_id    text not null references users (id) on delete cascade,
  member     text not null,
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)              -- one member per account per session
);
create unique index if not exists session_participants_member_idx
  on session_participants (session_id, member);  -- one account per member
create index if not exists session_participants_user_id_idx on session_participants (user_id);

create table if not exists payment_claims (
  id           text primary key,                 -- client-minted pay_xxx; becomes the payment id on confirm
  session_id   text not null references expense_sessions (id) on delete cascade,
  debtor       text not null,
  creditor     text not null,
  amount_cents integer not null check (amount_cents > 0),
  claimed_by   text not null references users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'declined')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz
);
create index if not exists payment_claims_session_id_idx on payment_claims (session_id);
```
`payment_claims` can arrive with PR 2. Shipping all three schema pieces in PR 1 means only one gated run on the shared `main`; the tech-lead decides which.

**Invite token:**
- The token is minted by the server: `crypto.randomBytes(16)` from Node's built-in crypto, so no dependency, encoded as base64url in 22 characters, 128 bits.
- It is minted on demand the first time the organizer asks for the link (`coalesce(invite_token, $new)`), so sessions finished before this feature get one too (owner decision 6).
- Drafts never get a token. The join handler requires `status = 'closed'`.

**Organizer versus participant:**
- The organizer is never a row in `session_participants`. The handler checks this.
- A member stored as the organizer's `me` cannot be claimed.

**Claims:**
- Confirming a claim runs under the session lock. It re-checks the remaining amount, does `insert into session_payments (id = claim.id …)`, and deletes the claim. A replay finds the payment already there and succeeds.
- Declining sets `status = 'declined'` and `decided_at`. The row stays until the debtor dismisses it (BA to settle how it is shown).
- Removing or leaving deletes that account's claims and its participant row. Confirmed payments stay, because they are ledger facts.
- Today's totals stay as they are, because `session_payments` keeps its meaning (confirmed money only).

### API and authorization
- **New helper in `_shared.ts`:** `sessionRole(userId, sessionId, lock?)` returns `{role: 'owner'}`, `{role: 'participant', member}` or `null`. Inside a transaction it locks the `expense_sessions` row `for update`, as the payments POST does today. That lock serialises joins, claims, confirmations and payments per session, and the unique index is the backstop (a 23505 error becomes a 409 `taken`).
- **Split `loadSessions`:**
  - `visibleSessionIds(userId)` returns owned ids union joined ids.
  - `loadSessionsByIds(ids, viewer)` applies the D1 filter (owner decision 1): a participant gets the members and records, plus payments and claims only where their member is the debtor or the creditor.
  - A loader without a user filter must only ever be called after an explicit role check. This is the single most privacy-sensitive change, and it should be a reviewer checkpoint.
- **The closed-session PUT guard (owner decision 4)** applies to every finished session, shared or not. On a stored `closed` session the PUT updates only `me` (subject to the claimed-member exclusion below), `name` and `activity_at`, and ignores `status`, `members`, `records` and `closed_at`. Payments are unchanged, since they're never read from the PUT body.

| Action | Route | Owner | Participant, creditor on the line | Participant, debtor on the line | Unrelated account |
|---|---|---|---|---|---|
| List sessions | `GET /api/sessions?joined=1` | own sessions, plus `role`, `participants` (member, joiner's Hati profile name, joinedAt; no email, owner decision 3) and all `claims` | joined sessions with `role: 'participant'`, `me` = claimed member, organizer's profile name, own lines' payments and claims only (D1), which members are on Hati | same | not listed |
| PUT, PATCH or DELETE a session | `/api/sessions/:id` | yes (PUT limited on closed sessions, as above) | 404 (unchanged `user_id` clause) | 404 | 404 |
| Record payments, mark all as paid | `POST /api/payments` | any line (unchanged) | only entries whose creditor is their member; any other entry fails the whole batch with 403 | 403 | 404 |
| Undo one payment | `DELETE /api/payments/:id` | any | only on their owed-to-you lines | 403 | 404 |
| Already settled, and its undo | `POST` / `DELETE /api/payments?sessionId=` | yes | 403 | 403 | 404 |
| "I've paid ₱X" (PR 2) | `POST /api/claims` (new) | not needed; the organizer records directly | 403 | yes; amount no more than remaining minus pending claims on that line | 404 |
| Confirm or decline (PR 2) | `PATCH /api/claims` `{id, decision}` | yes (shown in the UI only when the creditor isn't on Hati) | yes | 403 | 404 |
| Withdraw or dismiss own claim (PR 2) | `DELETE /api/claims?id=` | — | — | own claims only | 404 |
| Get or mint, and reset the link | `POST /api/invites` `{sessionId, reset?}` (new) | yes | 404 | 404 | 404 |
| Preview and join by token | `POST /api/invites` `{token}` / `{token, member}` | `own_session` | `already` (+ sessionId) | `already` | preview: name, dates, members, claimed members, organizer's profile name. Join: inserts and returns the session in the GET shape |
| Remove a member, or leave | `DELETE /api/participants?sessionId=&member=` (new) | removes that member's account and its claims | self only, as "Stop tracking" | self only | 404 |

**Status codes:**
- 404 stays the answer for "no relation to this session". I recommend 403 with a `code` for "you can read it but you can't do this". The tech-lead should confirm this against the house rule.
- Unknown, reset, deleted and draft tokens all get the same 404. There must be no oracle telling them apart.

**Request handling:**
- Token preview and join go in a POST body rather than a query string, so tokens stay out of request logs.
- `_validate.ts` gains `parseInviteToken` (`/^[A-Za-z0-9_-]{22}$/`), `parseJoinInput`, `parseClaimInput` (reusing the `pay_` id and amount rules of `parsePaymentsInput`), `parseClaimDecision` and `parseParticipantQuery`.
- All SQL stays in `pool.sql` or `client.sql` templates. Id lists use `= any(${ids}::text[])`, with the same cast trick as `nicknames`.

**Function count:** three new files (`api/invites.ts`, `api/claims.ts`, `api/participants.ts`) take Vercel Functions from 5 to 8. If the project is on Hobby, check the per-deployment function limit.

### Loading joined sessions on the client
**New `Session` fields:**
- `role: 'owner' | 'participant'`. When it is missing, as from an older server, treat it as owner.
- `claims: Claim[]`, `participants: Participant[]` (member, profile name, joinedAt for the owner; members on Hati for a participant) and `organizerName: string | null`.
- `parseSession` already whitelists fields, so a PUT body carrying these extras is harmless.
- The practice scenes in `collectionScenes.ts` and `expensesScenes.ts`, and `useMemorySessions`, need defaults.

**`useServerSessions`:**
- It sends `GET /api/sessions?joined=1`. A tab still running the old bundle sends no flag and keeps getting only the sessions it owns. That is the compatibility guard for old clients.
- `mergeLoaded` works unchanged, keyed by id.
- New backend methods: `leaveSession` and `removeParticipant` in PR 1; `addClaims`, `decideClaim` and `removeClaim` in PR 2. They copy the optimistic pattern of `addPayments` and `removePayment`: ids minted by the client, a per-session in-flight set feeding `mergeLoaded`'s busy check, and a `keepLocalClaims` analogue of `keepLocalPayments`.
- **Refresh on focus (owner decision 2):** reload on `visibilitychange` to visible, throttled to about once every 30 seconds. There is no polling and there are no notifications.

**Read-only backstop at the store:**
- `mutateSession` (and so `setMe`, `closeSession`, renames and edits) becomes a no-op for `role === 'participant'`, with a DEV-only warning. `recordOpen` skips joined sessions.
- `deleteSession` is never called for a joined session. History and Collection use `leaveSession` instead.

**UI:**
- `buildCard` needs the role. For a participant:
  - `offersAlreadySettled` is false.
  - There is no ChangeMe.
  - The bucket comes from their own lines, because `allPairsPaid` can't be computed from D1-filtered payments.
  - `needsSetup` can't occur, because `me` is known.
- In `LineRow` (PR 2), youOwe lines offer the claim, and owedToYou lines offer record, confirm and decline.
- `HistoryDetailPage` already gives the read-only full view.
- **Organizer controls (PR 1):** the list of who joined as which member (Hati profile name and join date only), remove a member, reset the link, and the link shown and copyable.

### The `?join=<token>` entry
- **`src/lib/joinLink.ts`** (pure and testable):
  - `readJoinToken(search)` validates the format.
  - `stashJoin` and `takeJoin` use `localStorage` with a one-hour expiry and try/catch.
- **`main.tsx`, before `createRoot`:** stash the token, then `history.replaceState` to drop `?join` while keeping any hash. This happens before Clerk's hash routing runs. A refresh then can't re-trigger the join, and the token doesn't linger in the address bar.
- **Signed out:** `SignedOutScreen` shows one generic line when a stash exists ("Sign in or create an account to join the session you were invited to"). There is no unauthenticated preview endpoint, so the rule that every route authenticates still holds.
- **Signed in:** `App` takes the stash once the sessions are `loaded` and the profile is ready, calls the preview, and opens a `JoinDialog`, which preselects with `matchMember` over the unclaimed members. The outcomes are:
  - own session: open its card;
  - already joined: open its card;
  - open: join;
  - 404: "This link doesn't work any more. Ask the organizer for a new one."
- **Conflict to resolve:** a brand-new account's first visit also triggers the first-run tour and possibly a guide offer or What's new. The join dialog must take precedence, and the tour must wait until it closes. This is for the tech-lead and BA.

**On each environment:**
- **Link origin (owner decision 9):** `window.location.origin` at the moment the link is shown or the SOA is exported.
- **Local:** the links are localhost links, useless to anyone else.
- **sit and qat:** reachable only by people who pass Vercel Authentication. That is correct, since they stay private.
- **uat:** works for testers once the feature reaches uat. Because the database and Clerk are shared, a session made anywhere can be joined from uat.
- **stg and prod:** they run the pre-accounts bundle, which ignores `?join`. The feature can't reach them without the larger accounts release.
- **Known limitation:** an organizer on a one-off deployment URL rather than the branch alias prints and copies that URL, which may later stop working or be protected. A possible later fix is `VITE_VERCEL_BRANCH_URL`; it is not in scope.

### The hand-written QR encoder (PR 3; `src/lib/qr.ts`, pure, no dependency)
**Scope:**
- Byte mode only, error-correction level M, versions 1 to 10. The byte-count field is 8 bits up to version 9 and 16 bits at version 10, which costs one line.
- Version 10 at M holds up to 213 bytes.
- The uat link is about 69 characters: 40 for the origin, 7 for `/?join=` and 22 for the token. That gives version 5 (37×37 modules).
- Include all 8 masks, with the standard four-rule penalty used to pick one.
- Include format information (BCH 15,5) and version information (BCH 18,6, for version 7 and up).
- Out of scope: numeric, alphanumeric and Kanji modes, ECI, and structured append.

**Size:** about 300 to 380 lines with comments:
- Reed-Solomon over GF(256): about 50 lines.
- Block and alignment tables for versions 1 to 10 at M: about 30.
- Bit-stream encoding and interleaving: about 45.
- Function patterns and reserved areas: about 80.
- Zigzag placement: about 25.
- Masks and penalty: about 70.
- Format and version bits: about 30.

Tests: about 200 lines plus fixture data. The API is `encodeQr(text): boolean[][]`, plus `qrPath(matrix, quiet = 4): string`, which merges runs of dark modules into one SVG path.

**Rendering:**
- **PDF:** `@react-pdf/renderer`'s `Svg` and `Path` (one path, not about 1,400 `Rect`s), wrapped in `Link src={url}`, next to the URL printed in DM Mono through `breakLongWords`. About 85 to 100 pt square with the quiet zone, giving modules of about 0.8 mm. Rendered only when `downloadSoa` receives an `inviteUrl`, which happens only from History for a closed session. A draft from Summary never gets one.
- **Screen:** a `QrCode` component with an inline `<svg viewBox>`, `shape-rendering="crispEdges"`, and an explicit white tile in both themes. An inverted QR doesn't scan reliably, so it must not follow dark mode.

**Static tests:**
- GF(256) tables and the generator polynomials checked against the values in ISO 18004 Annex A.
- All 32 format-information words checked against the published table.
- Version information for version 7 (`0x07C94`).
- Capacity boundaries: 84 bytes gives version 5, 85 gives version 6, and more than 213 throws.
- Structural invariants: finder patterns, alternating timing patterns, the dark module at (4V+9, 8), and the alignment centres.
- **Golden matrices (owner decision 8):** generated once with a reference encoder on the developer's machine, for a few URLs at fixed masks plus the auto-chosen mask. Only the fixture data is committed; nothing goes into `package.json`. The spec should record which reference encoder and which version produced them, and the exact command.
- PDF tree tests: a `Link` whose `src` is the URL, and an `Svg` present only when `inviteUrl` is passed.
- What static tests can't prove is that phones scan it. A manual scan of the screen QR and of a printed PDF, with the iPhone and Android camera apps, belongs in the owner check and the ui-ux-tester round.

### Organizer changes after others join
- **Delete the session (owner decision 5):** allowed, with a confirmation that says how many members are tracking it. The cascade removes participants, claims and payments. A participant's next load drops the card. An open History detail already shows "Session not found", and an in-flight write hits the existing "This session is gone" path.
- **Reopen, or edit a finished session:** this isn't possible in the UI, and the server now enforces it on every finished session (owner decision 4).
  - Check that the DEV `replaceAll` seeding never re-PUTs an existing closed id with new records.
  - Any future reopen feature must deal with participants and claims, which are keyed by member name.
- **Rename or remove a member:** no rename exists, and removal happens only in drafts, so the server guard covers this.
- **The organizer's own `me`:**
  - The ChangeMe picker excludes claimed members, and the PUT keeps the stored `me` if the new one is claimed.
  - The organizer's `resolveMe` should skip claimed members when falling back to the profile-name match. Otherwise organizer and participant could both "be" the same member while the organizer's pick is still unset.

## 6. Architectural impact
- **Authorization model:** it changes from "owner only" to "owner, or a participant with a role-scoped set of writes".
- **Sharing rule:** CLAUDE.md's "Deliberately absent: sharing sessions between accounts" line must change.
- **System docs:** the System Documentation's "every account's data is private to that account" must be rewritten.
- **Read-only history:** this becomes server-enforced for every finished session, not only by the interface. The System Documentation's security notes should say so.
- **Decision record:** warranted. One ADR for "sessions shared with joined accounts; owner-or-participant authorization; claims kept apart from the ledger; finished sessions read-only on the server", and a note or ADR for the hand-written QR encoder in place of a dependency.
- **New dependencies:** none. Node's crypto and react-pdf's `Svg`, `Path` and `Link` are already available. The reference encoder for fixtures runs only on the developer's machine.
- **Stored data:** one nullable column, one partial unique index and two new tables. Nothing is rewritten or backfilled. Rollback means leaving them in place, because old code ignores them.
- **Old code on the shared database:** old servers on sit, qat or uat keep working. Their selects name their columns, the database-level cascades still apply, and claims are invisible to them. During rollout, though, a participant on the new code can't be confirmed by an organizer still on the old code. That's acceptable for testing.
- **Environments:** only main through uat. stg and prod need the separate accounts release.

## 7. Risks and unknowns
**Privacy:**
- The token is a bearer capability. Anyone holding the SOA can claim any unclaimed member and read the session.
- Mitigations: sign-in required, the organizer sees who joined, removal, reset, and the D1 filter on the server.
- The new `loadSessionsByIds` must never run before a role check.
- The organizer's and joiners' Hati profile names become visible to each other. Emails never are (owner decision 3).
- A removed account can rejoin with the same link unless it is reset (see the hand-off).

**Token guessing:**
- 128 random bits behind sign-in, a unique-index lookup, and a uniform 404 make guessing infeasible. No rate limiting is needed.
- The token stays out of query-string API calls, and it is stripped from the address bar early.

**Old clients:** a tab still on the old bundle never asks for `?joined=1`, so it never sees joined sessions and can't act on them.

**Shared Neon `main` (real data):**
- The change is purely additive.
- The partial unique index on `expense_sessions` takes a short lock on a small table.
- New `api/` code against an unaltered database fails `GET /api/sessions` with a 500, so the schema must be applied before any `api/` file changes (as in the Collection precedent).
- **The run needs the owner's explicit OK at build time.** Approving the spec doesn't count.

**Clerk Development instance cap (pre-uat checklist item):** about 100 users. Every joining member needs an account, so testers' groups could reach it. Before testers start inviting, the owner checks the current user count in the Clerk dashboard (owner decision 10).

**Staleness:** with C1, a claim isn't seen until the other side returns to the app. With no notifications, a claim can sit unseen.

**Other risks:**
- If the creditor recorded the payment directly in the meantime, confirming a claim can overpay. The server re-checks at confirm time and refuses with 409 `over_remaining`.
- The QR must actually scan, which needs a manual check.
- The `onboarded_at`, tour and join-dialog ordering for brand-new accounts.
- The one-off deployment URL caveat (section 5, link origin), accepted as a known limitation.

**Unknowns:**
- Which Vercel plan the project is on (affects the function limit).
- Which Clerk sign-in methods are enabled.
- Whether hosted sign-up is used, which matters for E1. E1 covers both cases anyway.

## 8. Scope
**In:**
- PR 1:
  - schema;
  - invites (mint on demand for any finished session, reset, preview, join);
  - participants (list with profile name and join date, remove, leave);
  - joined sessions in GET with the D1 filter, plus the store guard;
  - the server's read-only guard for every finished session;
  - the join dialog and the `?join` entry;
  - the invite link in the app;
  - delete with the "N members tracking" warning;
  - refresh on focus.
- PR 2: claims (create, confirm, decline, withdraw and dismiss) and creditor-side recording.
- PR 3: the QR encoder, with the link and QR on a finished session's SOA and on screen.
- Across PRs: the CLAUDE.md and documentation updates.

**Out:**
- notifications (email or push);
- polling;
- realtime updates;
- an in-app scanner;
- a Clerk email lookup;
- editing or reopening finished sessions;
- invites for drafts;
- several links per session;
- importing or copying a session;
- currency;
- a configurable link origin;
- stg and prod rollout.

## 9. Hand-off
**For the business-analyst:**
- Whether pending claims count in "You owe" and "Owed to you" and in the buckets, and how a joined card looks in Needs setup, Outstanding and Settled.
- Wrong claims: someone claims another person's member. What the organizer sees, and the removal flow.
- Whether removing a member offers or forces a link reset, since the removed account can otherwise rejoin.
- How declined claims are shown and dismissed, and whether a debtor can withdraw a claim.
- A debtor's "mark all as paid" as several claims.
- Placement and wording for "Stop tracking" in History and Collection.
- The wording of the organizer's delete warning (it must say how many members are tracking the session), the "already tracking" and "own session" messages, and the dead-link message.
- Whether a participant can export the SOA, and if so without a QR.
- What happens if the organizer's SOA export can't fetch the link (export without a QR, or fail).
- How the join dialog interacts with the first-run tour, guide offers and What's new.
- Collection guide and tour impact: the new controls should not become tour targets, and no existing `data-tour` target moves.

**For the tech-lead to specify:**
- Exact response shapes for `Session.role`, `claims`, `participants` and `organizerName`.
- The 403 versus 404 policy.
- The split of `loadSessions` and the D1 filters.
- The lock order in every write.
- The id-collision rules between `session_payments` and `payment_claims`.
- The closed-session PUT guard (decision 4), including the organizer's `me` exclusion.
- The client backend methods and their merge rules.
- The `visibilitychange` reload with its 30-second throttle.
- `joinLink.ts` and the `main.tsx` ordering.
- The QR module's API and the golden-fixture procedure.
- The `SoaDocument` and `downloadSoa` `inviteUrl` prop.
- The schema-run gate, and whether `payment_claims` ships with PR 1 or PR 2.
- Task order across the three PRs, with PR 3 buildable in parallel.
- The Clerk user-count check as a pre-uat checklist item.

## 10. Questions for the owner
All ten were answered on 2026-11-20; see "Owner decisions" at the top. None are open for the architect. Business questions go to the business-analyst (section 9).
