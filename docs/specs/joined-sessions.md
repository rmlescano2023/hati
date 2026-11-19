# Spec: joined sessions, PR 1 (join and read-only access, organizer controls, the invite link)

Status: **draft, waiting for the owner's approval.** Branch `joined-sessions-1`, from `origin/main` at
`c615dd4` (PR #173 merged).

Inputs, all owner-approved and taken as fixed:
- the intake brief, `~/.claude/plans/cached-waddling-wigderson.md`;
- the architect's brief, copied to `docs/specs/joined-sessions-architecture.md` (owner decisions D1
  to D10 at its top, options A1, B1, C1, D1 and E1);
- the requirements, copied to `docs/specs/joined-sessions-requirements.md`. This spec covers its
  **PR 1 section**, its shared definitions (section 0) and its onboarding section (BR-G1 to
  BR-G9), with the owner's answers Q1 to Q4 at its end.

PR 2 (claims) and PR 3 (the QR) get their own specs. This one covers PR 1 only, except for the
schema: all of it ships here (section 3).

## 1. Summary

Today a session belongs to one account. The other members get the SOA PDF and nothing else. PR 1
lets a member **join** the organizer's finished session through a private invite link, as one of
its members, and then follow their own lines in their own Collection and History. They get
**read-only** access, and nothing is copied: every account reads the one session.

What PR 1 adds:

- **The invite link.** Every finished session gets a random, resettable token. It's minted the
  first time the organizer asks for it, so sessions finished before this feature get one too
  (D6). The organizer opens **Invite members** from History detail or from their open Collection
  card. There they copy the link, see who joined as which member (Hati profile name and join date
  only, D3), remove a joined account, and reset the link.
- **The `?join=<token>` entry.** `main.tsx` stashes the token and strips it from the address bar
  before anything renders, so it survives sign-in and sign-up (E1). Once the sessions and the
  profile have loaded, a join dialog preselects the member with today's `matchMember`, over the
  members nobody has claimed. One tap on Join links the account. The other outcomes each get their
  own message: your own session, already tracking, a dead link, and everyone already joined.
- **Joined sessions** in the member's Collection and History, read-only. The server sends a
  participant the members and records, but only the payments on their own lines (D1). Their card
  is bucketed from their own lines and is never in Needs setup. They can download the SOA and
  "Stop tracking".
- **A server-side read-only guard on every finished session (D4).** A save of a stored finished
  session changes only `name`, `activity_at` and the organizer's `me`, and never sets `me` to a
  member someone has claimed. Status, members, records and `closed_at` are left as stored.
- **The organizer's own pick ignores claimed members.** This covers the Change and Needs setup
  pickers and the automatic profile-name match (US-14).
- **The delete warning** says how many members are tracking the session (D5).
- **A quiet reload when the tab comes back into view**, at most about once every 30 seconds (D2,
  C1).

In PR 1 only the organizer records payments, exactly as today. The payments routes are unchanged.

**Assumptions** (veto any before approving):

- **A1. A failed link check gets its own message.** The requirements don't cover a link check that
  fails for a reason other than a dead link (no connection, a timeout, a 500). The dialog reads:
  title "Couldn't check the invite link", message "Check your connection and try again.", buttons
  "Close" and "Try again".
- **A2. "Checking the invite link…" has a Cancel button.** Cancel and Escape behave as Cancel on the
  join dialog (AC-6.10). A response that lands after a cancel is ignored.
- **A3. "Remember" is saved only once the join succeeds,** so a failed or refused join writes
  nothing to the profile.
- **A4. A quiet reload that fails says nothing.** The screen keeps its last good copy, and the next
  return tries again. Nothing the user did has failed, so a banner would only be noise. "Try again"
  and the first load keep today's banner.
- **A5. Remove with "Also reset the invite link" ticked is two requests.** The remove goes first,
  then the reset. If the remove succeeds and the reset fails, the row leaves the list and the
  dialog shows AC-3.4's "Couldn't reset the link. Try again." The checkbox starts unticked (Q1).
- **A6. Collection shows "Invite members" only on a card that opens.** An organizer card placed
  automatically by the profile name with no lines of its own has no body today, so it has no
  button. History detail always has it.
- **A7. Order in History detail's header:** "↓ Download SOA" first, then "Invite members" (or "Stop
  tracking"). On a phone they stack in that order, full width.
- **A8. Focus after Stop tracking on Collection** falls back to the page, as it does after deleting
  a session in History. The announcement says what happened (AC-12.3).

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Types | `src/types/index.ts` | `SessionRole`, `Participant`, `InvitePreview`, `InviteAnswer`, `JoinAnswer`. `Session` gains optional `role`, `organizerName`, `participants` | — |
| Schema | `scripts/db/schema.sql` | `expense_sessions.invite_token` with its partial unique index; the `session_participants` table and its two indexes; the `payment_claims` table and its index (unused until PR 2) | `scripts/db/apply-schema.ts`, unchanged |
| Pure logic | `src/lib/collection.ts` | `isJoined`, `claimedMembers`; `resolveMe` skips claimed members; `buildCard` handles a joined session | `matchMember`, `buildLine` |
| Pure logic | `src/lib/joinedSessions.ts` **(new, DOM-free, also imported by `api/`)** | the token format, the D1 view, the closed-session `me` rule, who is on Hati, the join preselect, the answer and stage mapping, `joinFlowReady`, the copy builders | `matchMember`, `nicknamePrompt`, `NOT_IN_SESSION`, `formatLocalDate` |
| Pure logic | `src/lib/joinLink.ts` **(new, browser only)** | reading and stripping `?join`, the one-hour stash, the link URL | `isInviteToken` |
| Pure logic | `src/lib/sessionLabel.ts` | `sessionTitle` and `sessionDisplayTitle` accept a narrower `Titled` shape (type only); `deleteSessionMessage` counts members tracking the session | `pluralize` |
| Pure logic | `src/lib/writeQueue.ts` | `RELOAD_ON_RETURN_MS`, `reloadsOnReturn` | — |
| API | `api/_shared.ts` | `loadSessions(userId, only, joined)`: owned and joined visibility, a module-private content loader, the D1 view, `participants` for owned sessions. Also `lockSessionRole` and exports `iso` | `pool`, `SessionRow`, `participantView` |
| API | `api/_validate.ts` | `parseJoinedFlag`, `parseInviteInput`, `parseParticipantQuery` | `isShortText`, `isPlainObject`, `isInviteToken` |
| API | `api/sessions/index.ts` | GET passes the `joined` flag | `loadSessions` |
| API | `api/sessions/[id].ts` | PUT locks and reads the stored row first; the closed-session guard | `closedSessionMe` |
| API | `api/invites.ts` **(new)** | `POST`: get or mint the link, reset it, preview a token, join | `getUserId`, `ensureUser`, `loadSessions`, `sessionDisplayTitle`, `onHatiMembers`, `claimableMembers`, `node:crypto` |
| API | `api/participants.ts` **(new)** | `DELETE`: the organizer removes a joined account, or a participant leaves | `lockSessionRole` |
| Client state | `src/hooks/useServerSessions.ts` | GET `?joined=1`; the quiet reload on return; `addJoinedSession`, `leaveSession`, `removeParticipant` | `mergeLoaded`, `deleting`, `settledDuringLoad`, `pending`, `restoreAt`, `fail` |
| Client state | `src/hooks/useMemorySessions.ts` | no-op versions of the three new methods | — |
| Client state | `src/hooks/useInvites.ts` **(new)** | `getLink`, `preview`, `join`: plain requests, no state | `authorisedFetch`, `withDeadline`, `joinAnswerFrom` |
| Client state | `src/context/SessionsStoreContext.tsx` | the read-only backstop in `updateSession` and `deleteSession`; passes the three new methods through | `isJoined` |
| Entry | `src/main.tsx` | stash and strip `?join` before `createRoot` | `joinLink.ts` |
| UI | `src/App.tsx` | holds the stash; starts the join flow; holds the welcome, What's new, the offer and "Already settled?" until it closes; lands on Collection; "Take the tour" goes Home first; an app-level live region; History detail's `onLeft` | `useProfile`, `promptedVisit`, `canAsk`, `whatsNewOpen` |
| UI | `src/components/join/JoinFlow.tsx` (+ css) **(new)** | checking, the join dialog, and the five outcome messages | `ModalDialog`, `ConfirmDialog.module.css`, `MePicker`, `useInvites` |
| UI | `src/components/collection/InviteMembersDialog.tsx` (+ css) **(new)** | the link, Copy, "Tracking on Hati", Remove (with its own confirmation), Reset | `ModalDialog`, `ConfirmDialog`, `AlreadySettledDialog.module.css`'s list pattern |
| UI | `src/components/collection/StopTrackingButton.tsx` **(new)** | the button and its confirmation, used on the card and on History detail | `ConfirmDialog`, `Button` |
| UI | `src/components/collection/MePicker.tsx` (+ css) | `unavailable` (shown disabled, " · on Hati") and `offerNotInSession` props | — |
| UI | `src/components/collection/ChangeMeDialog.tsx` | passes the claimed members as unavailable | `claimedMembers` |
| UI | `src/components/collection/CollectionCard.tsx` (+ css) | the joined card ("Shared by", "You joined as … · Stop tracking", read-only lines, the records-payments line); the organizer's Invite row; Needs setup's unavailable members; Undo-settled's extra sentence | `isJoined`, `isPracticeId` |
| UI | `src/components/collection/LineRow.tsx` | a `readOnly` prop | — |
| UI | `src/pages/CollectionPage.tsx` | passes `onLeft` to cards, announcing through its existing live region | `setAnnouncement` |
| UI | `src/pages/HistoryPage.tsx`, `src/components/sessions/SessionCard.tsx` (+ css) | "Shared by" on a joined card; no bin on one | `sharedByLine` |
| UI | `src/pages/HistoryDetailPage.tsx` (+ css) | the participant's header line and Stop tracking; the organizer's Invite members; the actions row | `ExportSoaButton`, `InviteMembersDialog`, `StopTrackingButton` |
| UI | `src/components/layout/SignedOutScreen.tsx` (+ css) | the invited line | `peekJoin` |
| Rules | `CLAUDE.md` | the API rule's access wording; "sharing sessions between accounts" leaves "Deliberately absent" | — |
| Tests | see section 8 | — | — |

**Not touched:**
- `api/payments/index.ts` and `api/payments/[id].ts`. They stay owner-only, so a participant gets
  their 404. The POST's `loadSessions(userId, sessionId)` call keeps its meaning (owned only).
- `api/user.ts`, `src/context/AppDataContext.tsx`, `src/context/ProfileContext.tsx`.
- All of `src/pdf/`, `ExportSoaButton`, `SummaryPage`, `FinishSessionDialog`.
- `src/lib/storage.ts`: the new fields are optional, so `parseSession` never sets them and a PUT
  body can't carry them.
- `src/lib/demoSessions.ts`, the guide scenes and engine, `steps.ts`, `OnboardingTour.tsx`,
  `GuideTour.tsx`, `SyncBanner`, `DevSessionsBar`, `DevDataBar`.

**Vercel Functions:** 5 → 7 (`api/invites.ts` and `api/participants.ts`), and 8 once PR 2 adds
claims. That's under Hobby's 12.

## 3. Data model

All of the feature's schema ships in PR 1, so the shared Neon `main` is altered once.
`payment_claims` stays empty and unread until PR 2. PR 2's spec should need no further schema run;
if it does, that is a second gated run.

Add to `scripts/db/schema.sql`. Each statement goes where shown, with its comment:

```sql
-- After the finished_with_collection alter:
-- The finished session's private invite token: 128 random bits from the
-- server, base64url (22 characters). Null until the organizer first asks for
-- the link; Reset replaces it, so the old link stops working at once. Drafts
-- never get one.
alter table expense_sessions add column if not exists invite_token text;

create unique index if not exists expense_sessions_invite_token_idx
  on expense_sessions (invite_token) where invite_token is not null;

-- At the end of the file, after session_payments:
-- Accounts that joined someone else's finished session as one of its members.
-- One member per account per session (the key), and one account per member
-- (the unique index). The organizer is never a row here.
create table if not exists session_participants (
  session_id text not null references expense_sessions (id) on delete cascade,
  user_id    text not null references users (id) on delete cascade,
  member     text not null,
  joined_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);

create unique index if not exists session_participants_member_idx
  on session_participants (session_id, member);

create index if not exists session_participants_user_id_idx on session_participants (user_id);

-- A joined debtor's "I've paid", waiting for the creditor (or the organizer)
-- to confirm or decline it. Kept apart from session_payments, which holds
-- confirmed money only, so no existing total or check ever counts a claim.
-- Confirming moves it into session_payments under the same id. Unused until
-- PR 2; created now so the shared database is altered once.
create table if not exists payment_claims (
  id           text primary key,          -- client-minted "pay_xxx"; becomes the payment's id on confirm
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

- **Existing rows:** every session's `invite_token` is `null`, so the partial index starts empty.
  The two new tables start empty. Nothing is backfilled, so every session looks exactly as it does
  today until its organizer opens Invite members.
- **Idempotent:** every statement is `if not exists`, so a second run does nothing.
- **Non-destructive:** nothing is dropped, rewritten or backfilled.
  - The nullable column with no default only changes the catalog.
  - The index build briefly blocks writes to `expense_sessions`, a small table.
  - The cascades only affect rows in the new tables. Deleting a session deletes its participants
    (and, from PR 2, its claims). Deleting a `users` row deletes that account's participant rows
    and claims.
- **`concurrently` isn't used:** `apply-schema.ts` sends the file as one multi-statement query,
  which runs as one implicit transaction, where `create index concurrently` is an error.
- **Rollback:** leave everything in place, because old code ignores it. Never drop any of it on
  `main`.

### 3.1 Applying it to the shared Neon `main` (gate)

- **What runs it:** `npx vite-node scripts/db/apply-schema.ts`, as in the Collection precedent. It
  reads `HATI_DATABASE_URL` from `.env.local`, which points at the shared Neon `main` behind local
  dev, sit, qat and uat, which holds **real user data**.
- **Gate:** approving this spec does **not** authorise the run. At build time the
  fullstack-developer stops before task 1's run and asks the coordinating session for the owner's
  explicit OK. Only with it does the developer run the script once and report its output. Without
  it, the developer stops there. The OK covers only the statements above. If the script would do
  anything else, the developer stops and reports.
- **When:** before any `api/` file is edited. `vercel dev` reloads functions as soon as their files
  change. The new `loadSessions` reads `session_participants` on every GET, so new code against an
  unaltered database fails `GET /api/sessions` with a 500.
- **Old code against the altered database** (sit, qat and uat until this reaches them) keeps
  working:
  - Old `select`s name their columns.
  - The old PUT lists its columns.
  - The old DELETE cascades.
  - Old code never reads the new tables.
- **stg and prod:** the devops-engineer runs the same command with `DATABASE_URL_OVERRIDE` before
  the hop that first brings this code there. Today they run the pre-accounts bundle, so the
  feature can't reach them without the separate accounts release.
- **Verify:** the script prints its table list, now including `payment_claims` and
  `session_participants`, and a second run succeeds the same way. Home loads on
  `http://localhost:3000`.

## 4. API contract

Every route keeps these rules:
- `getUserId`: 401 `{ error: 'Not signed in.' }` without a user, and 500
  `{ error: 'Auth is misconfigured.' }` if auth is misconfigured.
- Validation in `api/_validate.ts`.
- `pool.sql` or `client.sql` templates only.
- Imports from `src/` use `.js`.

### 4.1 Access: 404 versus 403

The rule this PR writes into CLAUDE.md:

- **404 means "no relation".** An account that neither owns the session nor joined it always gets
  404 `{ error: 'No such session.' }`, whatever it asks for. The same goes for a session that
  doesn't exist. A route never says which of the two it was.
- **Organizer-only routes keep 404 for every non-owner, participants included.** These are
  `PUT`, `PATCH` and `DELETE /api/sessions/:id`, both payments routes (in PR 1), and the
  get-or-reset form of `POST /api/invites`. They reveal nothing to a participant that the GET
  doesn't already, and their `where … user_id = ${userId}` clauses stay exactly as they are.
- **Routes a participant may use in part answer 403 when the role doesn't allow the action.** The
  body is `{ error, code }`. In PR 1 that's only `DELETE /api/participants`, where a participant
  names a member other than their own (`code: 'not_yours'`). PR 2 moves the payments routes and
  adds the claims routes under the same rule.
- **Invite tokens:** unknown, reset, deleted-session and draft tokens all get the same 404
  `{ error: "This link doesn't work any more.", code: 'dead_link' }`. Nothing tells them apart.

| Action | Route | Owner | Participant | No relation |
|---|---|---|---|---|
| List sessions | `GET /api/sessions?joined=1` | owned, with `role: 'owner'` and `participants` | joined, with `role: 'participant'`, the D1 view (4.3) | not listed |
| Save, open or delete a session | `PUT`, `PATCH`, `DELETE /api/sessions/:id` | yes (PUT guarded on finished sessions, 4.4) | 404 | 404 |
| Record or undo payments | `/api/payments`, `/api/payments/:id` | unchanged | 404 (PR 1) | 404 |
| Get or reset the link | `POST /api/invites {sessionId, reset?}` | yes | 404 | 404 |
| Preview or join by token | `POST /api/invites {token, member?}` | `own` | `already` | `open`, then `joined` or `taken` |
| Remove or leave | `DELETE /api/participants?sessionId=&member=` | any member | own member only, else 403 `not_yours` | 404 |

### 4.2 Lock order (every write, the whole feature)

1. A transaction that reads or writes `session_participants`, `payment_claims` or
   `session_payments` locks the session's `expense_sessions` row **first**, `for update`. Use
   `for update of s` when the query joins other tables, so only that row is locked. It takes no
   other row lock before that one.
2. After it, in this order: `session_participants`, then `payment_claims`, then `session_payments`.
3. One session per transaction.
4. `ensureUser` runs **before** `begin`, never inside a session transaction.

What already follows this:
- the payments POST (locks the session, then reads and writes payments);
- the session DELETE (deleting the row locks it, then the cascades run in the same order).

What PR 1 adds, each following it:
- the session PUT (4.4);
- the join (4.5);
- the remove and leave (4.6);
- the link mint and reset, which is a single `update` and so locks only that row.

Because every path takes the session row first, two writes on one session queue rather than
deadlock. The unique indexes still guarantee one account per member and one member per account if
a future path forgets the lock: such an insert would fail with a 500 rather than write a
duplicate.

### 4.3 `GET /api/sessions` and the `loadSessions` split

**Types (`src/types/index.ts`):**

```ts
/** How the signed-in account relates to a session: it owns it, or it joined it as a member. */
export type SessionRole = 'owner' | 'participant';

/** An account that joined a finished session as one of its members, as the organizer sees it. */
export type Participant = {
  member: string;
  /** The joiner's Hati profile name, or null when they haven't set one. Never an email (D3). */
  name: string | null;
  /** ISO time they joined. */
  joinedAt: string;
};
```

`Session` gains three **optional** fields. Optional because a missing value means the safe default
(an owned session with nobody joined), which is exactly what every existing literal, the guide
scenes, the dev seeds, `parseSession` and an old body mean. The server always sends all three.

```ts
  /**
   * 'participant' when the account joined this session rather than owning it; absent or 'owner'
   * otherwise. Test it as `role === 'participant'` (`isJoined`), never as `=== 'owner'`.
   */
  role?: SessionRole;
  /** The organizer's Hati profile name, on a joined session only; null when unset. */
  organizerName?: string | null;
  /** Who joined, for the organizer only (BR-O3); always empty on a joined session. */
  participants?: Participant[];
```

**Response shapes**, one element of the array:

- **Owned:** today's fields, plus `role: 'owner'`, `organizerName: null`, and
  `participants: Participant[]` ordered by `joined_at, member`. The client sorts for display.
- **Joined:**
  - `members`, `records`, `name`, `status` (`'closed'`), `createdAt`, `closedAt`, `activityAt` and
    `finishedWithCollection`, as stored;
  - `me`: the joined member, never the organizer's pick;
  - `role: 'participant'`;
  - `organizerName`: the organizer's `display_name`, or `null`;
  - `participants: []`;
  - `payments`: only those whose `debtor` or `creditor` is the joined member (D1).

  PR 2 adds what a participant needs to know about who else is on Hati, and claims.

**The handler:** `return res.status(200).json(await loadSessions(userId, null, parseJoinedFlag(req.query.joined)))`.
A tab still on the old bundle sends no flag and keeps getting owned sessions only, which is the
compatibility guard for old clients. Update the file's doc comment to say so.

**`loadSessions(userId: string, only: string | null = null, joined = false): Promise<Session[]>`**
in `api/_shared.ts`. Same name and first two arguments, so the payments POST is untouched. It runs
in three steps.

1. **Visibility.** These two queries are the only place a session's access is decided.

   ```sql
   -- A: owned (today's query, unchanged)
   select id, status, created_at, closed_at, members, name, activity_at, me,
          finished_with_collection
   from expense_sessions
   where user_id = ${userId} and (${only}::text is null or id = ${only})
   order by created_at
   ```

   ```sql
   -- B: joined; sent only when `joined` is true. The organizer's `me` is not selected.
   select s.id, s.status, s.created_at, s.closed_at, s.members, s.name, s.activity_at,
          s.finished_with_collection, p.member, u.display_name as organizer_name
   from session_participants p
   join expense_sessions s on s.id = p.session_id
   join users u on u.id = s.user_id
   where p.user_id = ${userId} and s.user_id <> ${userId} and s.status = 'closed'
     and (${only}::text is null or s.id = ${only})
   order by s.created_at
   ```

   If both are empty, return `[]` as today.
2. **Content, by id** (module-private `loadContent(ids)`, not exported). `ids` is A's ids followed
   by B's, passed with the nicknames cast trick (`ids as unknown as string`, then
   `${list}::text[]`):

   ```sql
   select r.id, r.session_id, r.date::text as date, r.payor_mode, r.payors, r.items, r.created_at
   from purchase_records r where r.session_id = any(${list}::text[])
   order by r.date, r.created_at
   ```

   ```sql
   select p.id, p.session_id, p.debtor, p.creditor, p.amount_cents, p.created_at
   from session_payments p where p.session_id = any(${list}::text[])
   order by p.created_at, p.id
   ```

   Keep the date-cast comment from today's records query. Participants, for **A's ids only**:

   ```sql
   select p.session_id, p.member, p.joined_at, u.display_name
   from session_participants p join users u on u.id = p.user_id
   where p.session_id = any(${ownedList}::text[])
   order by p.joined_at, p.member
   ```

   Each row maps to `{ member, name: display_name ?? null, joinedAt: iso(joined_at) }`.
3. **Assembly.** Each A row maps exactly as today, plus the three owner fields. Each B row builds the
   same base session with `me: null` and all of its payments, then goes through
   `participantView(base, row.member, row.organizer_name ?? null)` (section 5.2), which is the D1
   filter. The result is A's sessions in created order, then B's.

> **Reviewer checkpoint RC-1 (privacy).** This is the most privacy-sensitive change in the
> feature. Check that:
> - `loadContent` has no user filter of its own and is **module-private**, called only from
>   `loadSessions` with ids that came from queries A and B in the same call;
> - every B session passes through `participantView` before it's returned, so its payments are
>   only those on its member's lines, its `me` is the member, and its `participants` is empty;
> - query B never selects `s.me`, and the participants query runs over A's ids only;
> - no new caller anywhere passes ids from a request into the content loader.
>
> `src/lib/loadSessions.test.ts` (section 8) checks each point.

### 4.4 `PUT /api/sessions/:id`: the closed-session guard (D4)

Validation is unchanged (`parseSessionInput`). The transaction becomes:

1. `begin`, then lock and read the stored row:

   ```sql
   select status, members, me from expense_sessions
   where id = ${sessionId} and user_id = ${userId}
   for update
   ```

   No row: `rollback`, then 404 `{ error: 'No such session.' }`. This covers another account's
   id, a participant and a deleted session, as the update's `rowCount` check did. That check
   becomes dead, so remove it, but keep the update's `where` clause.
2. **Stored `closed`** (every finished session, joined or not):
   - `select member from session_participants where session_id = ${sessionId}`;
   - `const me = closedSessionMe(stored.me, session.me, stored.members, claimed)` (5.2);
   - then:

     ```sql
     update expense_sessions set
       name        = ${session.name},
       activity_at = greatest(activity_at, ${activityAt}::timestamptz),
       me          = ${me}
     where id = ${sessionId}
     ```

   - `commit`, then `200` with the parsed body, as today. The client never reads it.
   - No `purchase_records` statement runs. `status`, `closed_at`, `members`, `records` and
     `finished_with_collection` stay as stored, whatever the body says. That includes an old tab's
     save (E1-17).
3. **Stored `draft`:** today's `update` and record replacement, word for word, including Finish
   (draft to closed in the same save). A draft never has participants, because joining requires
   `closed` and a closed session can no longer become a draft.

Comment the branch: the stored status decides, so Finish still works and nothing can change a
finished session's numbers. PATCH and DELETE are unchanged. DELETE's cascade removes participants,
which is the D5 behaviour.

### 4.5 `POST /api/invites` (new: `api/invites.ts`)

One route, three forms, told apart by the body. Tokens travel only in a POST body, never in a query
string, so they stay out of request logs.

**Validation:** `parseInviteInput(raw)` returns one of these, or `null` for a 400
`{ error: 'Malformed invite request.' }`:

```ts
export type InviteInput =
  | { kind: 'link'; sessionId: string; reset: boolean }
  | { kind: 'preview'; token: string }
  | { kind: 'join'; token: string; member: string };
```

- `raw` must be a plain object.
- **link:** `sessionId` is `isShortText`; `reset` is absent or a boolean (absent means false); and
  neither `token` nor `member` is present.
- **preview:** `sessionId` is absent; `token` passes `isInviteToken`; `member` is absent.
- **join:** the same as preview, but `member` is `isShortText`.
- Anything else is `null`.

Handler order: 401, then 405 with `Allow: POST` for anything but POST, then the body parsed as
`typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body`, then 400.

**`link` (organizer only).** Get the token, or mint it, or reset it:

```ts
const fresh = randomBytes(16).toString('base64url'); // node:crypto; 22 characters
```

```sql
update expense_sessions
set invite_token = case when ${reset}::boolean then ${fresh}
                        else coalesce(invite_token, ${fresh}) end
where id = ${sessionId} and user_id = ${userId} and status = 'closed'
returning invite_token
```

- No row is 404 `{ error: 'No such session.' }`. That covers another account, a participant, a
  deleted session and a draft (BR-J1).
- Then the participants query from 4.3 for this one session.
- `200 { token: string, participants: Participant[] }`.
- A token collision on the unique index is a 1-in-2¹²⁸ event. It isn't handled: it would be a 500,
  and the retry mints another.

**`preview` and `join`: the lookup.** Preview uses `pool.sql`, without a lock:

```sql
select s.id, s.user_id, s.name, s.created_at, s.closed_at, s.members, s.me,
       u.display_name as organizer_name
from expense_sessions s join users u on u.id = s.user_id
where s.invite_token = ${token} and s.status = 'closed'
```

Join runs the same statement inside `begin` on a `client`, with `for update of s` (4.2). Then, in
this order (BR-J6):

1. No row is 404 `{ error: "This link doesn't work any more.", code: 'dead_link' }`. (Join does a
   `rollback` first, as on every early return below.)
2. Compute the title:

   ```sql
   select date::text as date from purchase_records where session_id = ${row.id}
   ```

   then `title = sessionDisplayTitle({ name, status: 'closed', closedAt: iso(closed_at), createdAt: iso(created_at), records })`.
   It's computed on the server, which is safe because `formatLongDate` works in UTC everywhere.
3. `row.user_id === userId` is `200 { outcome: 'own', sessionId, title }`.
4. Read who has joined:

   ```sql
   select user_id, member from session_participants where session_id = ${row.id}
   ```

   A row for `userId` is `200 { outcome: 'already', sessionId, title, member }`.
5. Build the preview:

   ```ts
   const preview: InvitePreview = {
     sessionId: row.id,
     title,
     closedAt: iso(row.closed_at),
     members: row.members,
     onHati: onHatiMembers(row.members, row.me, claimed),
     organizerName: row.organizer_name ?? null,
   };
   ```

6. **preview:** `200 { outcome: 'open', preview }`. The "everyone joined" case is the client's,
   from the preview (5.2).
7. **join:**
   - If `claimableMembers(preview)` doesn't include `member`: `rollback`, then 409
     `{ error: 'Someone else just joined as that member.', code: 'taken', preview }`. That covers a
     member just claimed, the organizer's own member (BR-J4) and a name that isn't a member.
   - Otherwise
     `insert into session_participants (session_id, user_id, member) values (${row.id}, ${userId}, ${member})`,
     then `commit`.
   - Then `const [session] = await loadSessions(userId, row.id, true)`, and
     `201 { outcome: 'joined', session }`.
   - `ensureUser(userId)` runs before `begin`, for the foreign key: a brand-new account may not
     have hit `GET /api/user` yet.
   - The usual `try / catch (rollback, rethrow) / finally (release)` wraps it, as in the payments
     POST.

**Types (`src/types/index.ts`):**

```ts
/** What a token holder sees before joining (I-4, AC-6.2). */
export type InvitePreview = {
  sessionId: string;
  title: string;
  closedAt: string;
  members: string[];
  /** Members already on Hati: claimed by an account, or the organizer's own pick. */
  onHati: string[];
  organizerName: string | null;
};

/** The 200 and 201 bodies of a preview or a join. */
export type InviteAnswer =
  | { outcome: 'own'; sessionId: string; title: string }
  | { outcome: 'already'; sessionId: string; title: string; member: string }
  | { outcome: 'open'; preview: InvitePreview }
  | { outcome: 'joined'; session: Session };

/** How a preview or join ended, as the app sees it: the answer, a refusal, or no answer. */
export type JoinAnswer =
  | InviteAnswer
  | { outcome: 'taken'; preview: InvitePreview }
  | { outcome: 'dead' }
  | { outcome: 'failed' };
```

**Statuses:** 200, 201, 400, 401, 404, 405, 409, and 500 for misconfigured auth or a body that isn't
JSON.

### 4.6 `DELETE /api/participants?sessionId=&member=` (new: `api/participants.ts`)

- 401, then 405 with `Allow: DELETE`.
- `parseParticipantQuery(req.query.sessionId, req.query.member)` returns `{ sessionId, member }`
  when both are `isShortText`, else `null`, which is a 400
  `{ error: 'A session and a member are required.' }`.
- `begin`, then `const role = await lockSessionRole(client, userId, sessionId)`:
  - `null`: `rollback`, then 404 `{ error: 'No such session.' }`.
  - participant whose `member !== member`: `rollback`, then 403
    `{ error: 'You can only stop tracking your own place in a session.', code: 'not_yours' }`.
  - owner: `delete from session_participants where session_id = ${sessionId} and member = ${member}`.
  - participant, own member:
    `delete from session_participants where session_id = ${sessionId} and user_id = ${userId}`.
- `commit`, then 204, whether a row went or not: a removal that finds nobody has nothing left to
  do. PR 2 adds the claims delete between these two statements.

**`lockSessionRole(client, userId, sessionId)`** in `api/_shared.ts`:

```ts
export type SessionAccess = { role: 'owner' } | { role: 'participant'; member: string };
```

```sql
select s.user_id, p.member
from expense_sessions s
left join session_participants p on p.session_id = s.id and p.user_id = ${userId}
where s.id = ${sessionId}
for update of s
```

Returns `{ role: 'owner' }` when `user_id === userId`, `{ role: 'participant', member }` when
`member` isn't null, else `null`. (`for update of s` is required: Postgres refuses `for update` on
the nullable side of an outer join.) Its `client` parameter is typed
`Awaited<ReturnType<typeof pool.connect>>`. PR 2 reuses it in the claims and payments routes.

### 4.7 `api/_validate.ts` additions

- `parseJoinedFlag(raw: unknown): boolean`, which is `raw === '1'`.
- `parseInviteInput`, as in 4.5.
- `parseParticipantQuery`, as in 4.6.
- Each gets a doc comment saying why it is strict (the request is the whole action).
- They import `isInviteToken` from `'../src/lib/joinedSessions.js'`.

## 5. Business logic

No money changes in PR 1. A joined card's figures come from today's `buildLine` over its own
lines. D1 sends every payment on those lines, so paid, remaining, status and the strip are exact.

### 5.1 `src/lib/collection.ts`

- **`isJoined(session)`** returns `session.role === 'participant'`.
- **`claimedMembers(session)`** returns `(session.participants ?? []).map((p) => p.member)`.
- **`resolveMe(session: Pick<Session, 'me' | 'members' | 'participants'>, names)`:**
  - The explicit-pick branches are unchanged.
  - The profile-name match runs over `session.members` minus `claimedMembers(session)` (AC-14.2,
    E1-3). The organizer and a participant are then never both "Ben" while the pick is unset.
  - A joined session has no participants, so this changes nothing for it.
- **`buildCard`** with `const joined = isJoined(session)`:
  - `me = resolveMe(session, joined ? NO_NAMES : names)`, where
    `NO_NAMES = { displayName: null, nicknames: [] }`. A joined session's `me` is the member it
    joined as, so the user's names are never consulted (BR-V2).
  - `allPairsPaid = !joined && pairs.every(…)`. Update its doc comment: on a joined session it's
    false, because other pairs' payments aren't sent (D1).
  - The bucket is
    `joined ? (settledLineCount === lines.length ? 'settled' : 'outstanding') : <today's rule>`
    (BR-V3). It's never Needs setup. A joined card with no lines is Settled (E1-6).
  - `presettled: !joined && …` and `offersAlreadySettled: !joined && …` (BR-V6).
  - The summary needs nothing new. A joined `me` is a member and `allPairsPaid` is false, so the
    "Everyone's paid" variants can't show (BR-V4).

### 5.2 `src/lib/joinedSessions.ts` (new; DOM-free, imported by the API and the app)

It imports only from `./collection.js` and `./format.js`, so there's no cycle. (`collection.ts`
imports `sessionLabel.ts`, so neither may import this file.)

- `INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/`, and
  `isInviteToken(raw: unknown): raw is string`.
- **`participantView(session, member, organizerName): Session`** is the D1 view. It returns
  `{ ...session, me: member, role: 'participant', organizerName, participants: [], payments: session.payments.filter((p) => p.debtor === member || p.creditor === member) }`.
- **`closedSessionMe(stored, incoming, members, claimed): string | null`** is BR-R1 plus US-14 on
  the server:
  - `incoming === null` returns `stored`;
  - `incoming === NOT_IN_SESSION` returns `NOT_IN_SESSION`;
  - `incoming` is one of the stored `members` and not in `claimed` returns `incoming`;
  - otherwise `stored`.
- **`onHatiMembers(members, organizerMe, claimed)`** returns `members` that are claimed or equal
  to `organizerMe`. (`''` and `null` never equal a member, so E1-2 holds.)
- **`claimableMembers(preview)`** returns `preview.members` that aren't in `preview.onHati`.
- **`joinPreselect(preview, names)`** returns `{ value: string | null; suggested: string | null }`.
  It runs `matchMember(claimableMembers(preview), names)`:
  - a profile hit gives `{ value: member, suggested: null }` (AC-6.3);
  - a nickname hit gives `{ value: null, suggested: member }` (AC-6.4);
  - no hit gives both null (AC-6.5).
- **`joinAnswerFrom(status: number | null, body: unknown): JoinAnswer`:**
  - 200 or 201 with a body whose `outcome` is one of the four is that body;
  - 409 with `code: 'taken'` and a `preview` is `{ outcome: 'taken', preview }`;
  - 400 or 404 is `{ outcome: 'dead' }`;
  - anything else, `null` included, is `{ outcome: 'failed' }`.
- **`joinStage(answer: JoinAnswer)`** returns the dialog to show:
  - `own` gives `'own'`;
  - `already` gives `'already'`;
  - `dead` gives `'dead'`;
  - `failed` gives `'failed'`;
  - `open` or `taken` with no claimable member gives `'full'` (AC-9.1, E1-1);
  - otherwise `'pick'`;
  - `joined` gives `'joined'`.
- **`joinFlowReady({ pending, loaded, profileStatus, phase, practice })`** is
  `pending && loaded && profileStatus !== 'loading' && phase === 'off' && !practice` (BR-G1,
  BR-G5). A profile that failed to load still lets the flow run, with no preselect and no Remember
  (`rememberOffer` already needs `'ready'`).
- **Copy builders.** Exact text, from the requirements. `org(name, capital)` is
  `name ?? (capital ? 'The organizer' : 'the organizer')`.
  - `sharedByLine(name)`: `Shared by ${name}` or `Shared with you` (AC-10.2, AC-11.1).
  - `recordsPaymentsLine(name)`: `${org(name, true)} records the payments on this session.`
    (AC-10.4).
  - `joinedRowLine(p)`: `${p.name ?? 'No name set'} · joined ${formatLocalDate(p.joinedAt)}`
    (AC-2.2, AC-2.3).
  - `joinSharedLine(name)`: `${name} shared this session. Pick who you are, and your share of it shows up in your Collection.`,
    or `You've been invited to this session. Pick who you are, and your share of it shows up in your Collection.`
  - `joinReadOnlyLine(name)`: `You can see the whole session, but only ${org(name, false)} can change it. ${org(name, true)} will see your Hati name and when you joined.`
  - `nameTakenLine(name)`: `Is your name taken? Ask ${org(name, false)} to remove it, then open the link again.`
  - `takenMessage(member)`: `Someone else just joined as ${member}. Pick who you are again.`
  - `alreadyMessage(title, member)`: `“${title}” is in your Collection. You joined as ${member}.`
  - `ownMessage(title)`: `You're the organizer of “${title}”, so it's already in your Collection. Share this link with the others so they can track their own payments.`
  - `everyoneJoinedMessage(title, name)`: `Every member of “${title}” is already on Hati. If one of them is you, ask ${org(name, false)} to remove that member, then open the link again.`
  - `inviteIntro(title)`: `Anyone with this link can sign in to Hati, pick who they are in “${title}”, and track their own payments. They can see the whole session but can't change it.`
  - `removeMessage(p, title)`: `${p.name ?? 'This account'} joined “${title}” as ${p.member}. Removing them takes the session out of their Collection and History. Payments already recorded stay. They can join again with the invite link unless you reset it.`
  - `stopTrackingMessage(name)`: `It leaves your Collection and History. ${org(name, true)} keeps the session, and payments already recorded stay. You can join again with the invite link if it still works.`

  Fixed strings stay inline in their components (section 6).

### 5.3 `src/lib/joinLink.ts` (new; browser only, never imported by `api/`)

The API's typecheck has no DOM library, which is why the token check lives in `joinedSessions.ts`.

- **`JOIN_STASH_KEY = 'hati:join'`, `JOIN_STASH_MS = 60 * 60 * 1000`, `JOIN_RAW_MAX = 64`.**
- **`readJoinParam(search)`:** `new URLSearchParams(search).get('join')`. It's null when absent,
  otherwise the value cut to `JOIN_RAW_MAX`. `''` counts: a present-but-empty `?join=` is an
  invite attempt, and it reads as a dead link (AC-8.1).
- **`withoutJoinParam(href)`:** `pathname + search + hash` of `href` with `join` deleted. Other
  parameters and the hash (Clerk's routing) are kept.
- **`type JoinStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }`.**
- **`browserStorage(): JoinStorage | null`:** `try { return window.localStorage } catch { return null }`.
  It touches `window` only when called.
- **`stashJoin(storage, raw, now)`** writes `JSON.stringify({ raw, at: now })`.
- **`peekJoin(storage, now): string | null`** returns `raw` when the stash parses and
  `now - at < JOIN_STASH_MS`, else null. It never writes.
- **`clearJoin(storage)`.**
- Every read and write sits in `try / catch` and treats a failure as "no stash". A null storage
  does nothing.
- **`inviteUrl(origin, token)`** returns `` `${origin}/?join=${token}` ``, with the origin from
  `window.location.origin` (D9).

### 5.4 The quiet reload (`src/lib/writeQueue.ts`)

- `RELOAD_ON_RETURN_MS = 30_000`.
- `reloadsOnReturn(lastLoadAt: number | null, now: number)` is
  `lastLoadAt !== null && now - lastLoadAt >= RELOAD_ON_RETURN_MS`.
- The 30 seconds count from the start of the last load of any kind, so two returns inside 30
  seconds reload at most once (AC-15.2).

### 5.5 `src/lib/sessionLabel.ts`

- **The `Titled` type:**
  `type Titled = Pick<Session, 'name' | 'status' | 'closedAt' | 'createdAt'> & { records: Pick<PurchaseRecord, 'date'>[] }`.
  `sessionTitle(session: Titled)` and `sessionDisplayTitle(session: Titled)` take it. Bodies are
  unchanged, and every caller still passes a `Session`.
- **`deleteSessionMessage`**, closed with purchases. Let `t = session.participants?.length ?? 0`
  and `tracking = ${pluralize(t, 'member')} ${t === 1 ? 'is' : 'are'} tracking it on Hati, and it will disappear from their Collection and History too.`
  - `t === 0`: today's two messages, word for word (AC-13.3).
  - With payments: `“${title}” and its ${purchases} will be deleted, along with its ${pluralize(p, 'recorded payment')}. ${tracking} Its statement can no longer be downloaded and the payments cannot be recovered. This cannot be undone.`
    (AC-13.1).
  - Without payments: `“${title}” and its ${purchases} will be deleted, and its statement can no longer be downloaded. ${tracking} This cannot be undone.`
    (AC-13.2).

  It reads the field directly rather than importing `claimedMembers`, which would make an import
  cycle.

## 6. UI

All new text wraps with `overflow-wrap: anywhere` (E1-5). New dialogs use `ModalDialog` with
`ConfirmDialog.module.css`'s `.body`, `.title`, `.message` and `.actions`, as `ChangeMeDialog`
does. No new icons, so `icons.tsx` is unchanged. Mobile-only rules go inside
`@media (max-width: 640px)`.

### 6.1 Entry (`src/main.tsx`) and the signed-out screen

Before `createRoot`:

```ts
// An invite link's token is stashed before Clerk's hash routing or a sign-in redirect can drop
// it, and taken out of the address bar so a refresh can't replay it (architect E1).
const joinRaw = readJoinParam(window.location.search);
if (joinRaw !== null) {
  stashJoin(browserStorage(), joinRaw, Date.now());
  window.history.replaceState(window.history.state, '', withoutJoinParam(window.location.href));
}
```

`SignedOutScreen`:
- Holds `const [invited] = useState(() => peekJoin(browserStorage(), Date.now()) !== null)`.
- When `invited` is true, it renders
  `<p className={styles.invited}>Sign in or create an account to join the session you were invited to.</p>`
  under the subtitle (AC-5.1).
- `.invited` is 13px, `var(--text)`, `font-weight: 500`, line-height 1.55.
- It never shows the session's name or members (BR-J3).

### 6.2 App ordering (`src/App.tsx`)

**State:**

```ts
/** The invite link waiting to be checked, from `main.tsx`'s stash; `started` once its dialog runs. */
const [join, setJoin] = useState<{ raw: string; started: boolean } | null>(() => {
  const raw = peekJoin(browserStorage(), Date.now());
  return raw === null ? null : { raw, started: false };
});
const joinActive = join !== null;
```

`peekJoin` is a pure read, so StrictMode's double initialiser is harmless. The stash is cleared when
the flow starts, not when the app mounts. A refresh during "Loading your sessions…" therefore still
gets the dialog, and one after it appeared doesn't (AC-5.3).

**Start effect:**
- If `joinFlowReady({ pending: join !== null && !join.started, loaded: sync.loaded, profileStatus: profile.status, phase, practice: screen.kind === 'practice' })`,
  then `clearJoin(browserStorage())` and `setJoin({ ...join, started: true })`.
- `profile` is `useProfile()`.

**Holding the other prompts** (BR-G1, BR-G4):
- `whatsNewOpen` gains `&& !joinActive`.
- The first-login effect becomes `if (firstLogin && !joinActive) setPhase(off → intro)`, with
  `joinActive` added to its dependencies. The welcome is held, not lost, and opens when the join
  flow closes, on the screen it landed on (BR-G2).
- `promptShowing` becomes `phase !== 'off' || whatsNewOpen || joinActive`. The join flow is
  therefore its visit's one-time prompt, and no guide offer opens on it (BR-G3).
- `CollectionPage`'s `canAsk` gains `&& !joinActive`.

**Closing:**

```ts
const closeJoin = (to: { openSessionId: string; announce?: string } | null) => {
  setJoin(null);
  if (to === null) return; // Cancel, Close, OK and Escape stay where they are (AC-6.10, AC-7.3).
  window.scrollTo(0, 0);
  // The landing visit is the join flow's too, so the Collection guide's offer can't open on
  // it (BR-G3). Landing from Home starts a new visit; landing on Collection again doesn't.
  setPromptedVisit(screen.kind === 'collection' ? visit.n : visit.n + 1);
  setScreen({ kind: 'collection', openSessionId: to.openSessionId });
  if (to.announce) setAnnouncement(to.announce);
};
```

`CollectionPage` is keyed by `openSessionId`, so its existing landing effect does the opening:
- the card opens;
- Settled opens first when the card is there;
- the page scrolls to the card (AC-6.6, AC-7.3).

**"Take the tour"** in the welcome becomes
`window.scrollTo(0, 0); setScreen({ kind: 'home' }); setPhase('running');`. The tour's first step
is on Home, and the engine ends a tour whose screen doesn't match. After a join, the welcome can
open on Collection (BR-G2). Today it is always Home, so this changes nothing.

**App-level live region:**
- `const [announcement, setAnnouncement] = useState('')`, rendered last inside `PageShell` as
  `<p role="status" className="visually-hidden">{announcement}</p>`.
- It carries "Joined {title}." and History detail's "Stopped tracking {title}.", which must
  outlive the component that caused them.

**History detail:** `onLeft={(title) => { setScreen({ kind: 'history' }); setAnnouncement(`Stopped tracking ${title}.`); }}`
(AC-12.3).

**Render:** `{join?.started && <JoinFlow raw={join.raw} onClose={closeJoin} />}`, beside the other
dialogs.

### 6.3 The join flow (`src/components/join/JoinFlow.tsx`, new)

**Props:**
`raw: string; onClose: (to: { openSessionId: string; announce?: string } | null) => void`.

**Internal stage:** `'checking' | 'failed' | 'dead' | 'own' | 'already' | 'full' | 'pick'`, with
the latest answer. On mount:
- `!isInviteToken(raw)` goes straight to `dead`;
- otherwise `checking`, then `useInvites().preview(raw)`, then `joinStage`.

A `cancelled` ref drops any answer that lands after the flow has closed (A2).

**One dialog per stage**, all `ModalDialog`s with `labelledBy`. Escape and a backdrop click do what
the first button does.

| Stage | Title | Message | Buttons |
|---|---|---|---|
| checking | "Checking the invite link…" | — | "Cancel" (A2) |
| failed | "Couldn't check the invite link" | "Check your connection and try again." | "Close", "Try again" (back to checking) (A1) |
| dead | "This link doesn't work any more" | "The organizer may have reset it or deleted the session. Ask them for a new link." | "OK" (AC-8.1) |
| own | "This is your session" | `ownMessage(title)` | "Close", "Open in Collection" (AC-7.2) |
| already | "You're already tracking this session" | `alreadyMessage(title, member)` | "Close", "Open in Collection" (AC-7.1) |
| full | "Everyone has already joined" | `everyoneJoinedMessage(title, organizerName)` | "OK" (AC-9.1) |
| pick | `Join “{title}”?` | see below | "Cancel", "Join" |

"Open in Collection" calls `onClose({ openSessionId: sessionId })`. "Close", "OK" and "Cancel" call
`onClose(null)`.

**The pick dialog (AC-6.2):**

1. Title `Join “{title}”?`.
2. `<p className={confirm.message}>Finished {formatLocalDate(closedAt)} · {pluralize(members.length, 'member')}</p>`.
3. `joinSharedLine(organizerName)`.
4. `joinReadOnlyLine(organizerName)`.
5. A `.members` wrapper (`max-height: min(50vh, 20rem); overflow-y: auto`, as
   `AlreadySettledDialog`'s list) holding
   `<MePicker legend={…} members={preview.members} unavailable={preview.onHati} offerNotInSession={false} value={selected} … />`.
6. `nameTakenLine(organizerName)` when `preview.onHati.length > 0`.
7. The error line (`role="alert"`) when there is one.
8. Actions: "Cancel" and a primary "Join", disabled while `selected === null` or busy.

Selection follows `NeedsSetup`:
- `const pre = joinPreselect(preview, profile)` (only when `profile.status === 'ready'`, otherwise
  both null);
- `selected = choice ?? pre.value ?? pre.suggested`;
- the legend is `nicknamePrompt(pre.suggested)` while the suggestion is selected, otherwise "Which
  one are you?";
- Remember defaults to ticked, as in the other pickers.

**Join**, guarded by a `busy` flag so a double tap sends one request
(`useInvites().join(raw, selected)`):

- **`joined`:**
  - `addJoinedSession(answer.session)`;
  - then, if Remember is ticked and `rememberOffer(profile, selected)` isn't null,
    `void profile.remember(selected, offer)` (A3);
  - then `onClose({ openSessionId, announce: `Joined ${title}.` })` (AC-6.6, AC-6.7).
- **`taken`:** the new preview and `choice = null`. With no claimable member left, the `full`
  stage. Otherwise the error is `takenMessage(selected)` (AC-6.8, E1-9).
- **`own`, `already` or `dead`:** that stage. Another device or a reset got there first.
- **`failed`:** the error "Couldn't join. Check your connection and try again.", and Join stays
  enabled (AC-6.9).

**CSS** (`JoinFlow.module.css`): `.members` only. The list scrolls inside the dialog at every
width, so on a phone with 20 members Join stays reachable (E1-4). That isn't a mobile-only rule: it
belongs to a new dialog and changes no existing desktop layout.

### 6.4 `MePicker`, `ChangeMeDialog` and Needs setup

**`MePicker`** gains two props:
- `unavailable?: string[]` (default `[]`): those members render as a `disabled` radio labelled
  `{name} · on Hati`.
- `offerNotInSession?: boolean` (default `true`): `false` drops "I'm not in this session".

Add `.optionDisabled { color: var(--text3); }` on the label of a disabled option. `ModalDialog`'s
first-focus logic already skips a disabled radio.

**`ChangeMeDialog` and `NeedsSetup`** pass `unavailable={claimedMembers(session)}` (AC-14.1). The
suggestion comes from `resolveMe`, which already skips claimed members (AC-14.2).

### 6.5 Collection (`CollectionCard.tsx`, `LineRow.tsx`, `CollectionPage.tsx`)

**`LineRow`** gains `readOnly?: boolean`. When true it renders no form, no "Record payment", "I
paid" or "Mark fully paid", and no Undo. The history entries keep their text and times (AC-10.3,
AC-10.4).

**`CollectionCard`** gains `onLeft: (title: string) => void`. With
`const joined = isJoined(session)`:

- **Expandable:** `expandable = joined || setup || …today's terms`. A joined card always opens,
  for Stop tracking (BR-V5).
- **Summary:** after the "Finished" meta, when joined,
  `<span className={styles.meta}>{sharedByLine(session.organizerName)}</span>` (AC-10.2). Then
  today's `summaryDetail` and money summary.
- **Open body, joined**, in order:
  1. `<div className={styles.youAre}><span>You joined as <strong>{me}</strong></span><span aria-hidden="true">·</span><StopTrackingButton session={session} variant="link" onLeft={onLeft} /></div>`,
     in place of `YouAre`.
  2. The groups with `<LineRow readOnly …/>`. The `collection-owed` section is the same element as
     today.
  3. `<p className={styles.detail}>{recordsPaymentsLine(session.organizerName)}</p>` (BR-V11).

  No `MarkAll`, `UndoSettled`, "Already settled", Change or Invite (BR-V6).
- **Open body, organizer:** today's body, then, when `card.bucket !== 'needsSetup'` and
  `!isPracticeId(session.id)`, an Invite row (AC-1.2, AC-1.9, A6):

  ```tsx
  <div className={styles.invite}>
    <Button aria-label={`Invite members to ${title}`} onClick={() => setInviting(true)}>
      Invite members
    </Button>
    {inviting && <InviteMembersDialog session={session} onClose={() => setInviting(false)} />}
  </div>
  ```

  CSS:
  - `.invite { padding-top: 10px; border-top: 1px solid var(--border); }`;
  - `.markAll + .invite { padding-top: 0; border-top: none; }`, so it sits under Mark all or Undo
    without a second rule.
- **`UndoSettled`'s message** gains
  `' Members tracking it on Hati will see their lines unpaid again.'` when
  `(session.participants?.length ?? 0) > 0` (E1-16).

**`CollectionPage`** passes
`onLeft={(title) => setAnnouncement(`Stopped tracking ${title}.`)}` through its existing live
region (AC-12.3). It needs nothing else: joined cards arrive through `buildCollection`, the strip
counts them (AC-10.5), and `alreadySettledOffers` never lists them.

### 6.6 `InviteMembersDialog` (`src/components/collection/InviteMembersDialog.tsx`, new)

**Props:** `session: Session` (owned and finished) and `onClose`.

It returns a fragment: the `ModalDialog`, then the Reset `ConfirmDialog`, then the Remove dialog,
as **siblings**. Neither confirmation is nested inside the first dialog, so their clicks and
Escape never reach it.

**State:**
- `link: string | null`;
- `loading`;
- `linkError`;
- `list: Participant[] | null` (null until fetched, then the fetched list, falling back to
  `session.participants ?? []`);
- `note`, the live-region text;
- `error`, a `role="alert"` line;
- `busy`.

On mount, `getLink(session.id, false)` sets `link = inviteUrl(window.location.origin, token)` and
`list = participants` (AC-1.4, AC-1.5, AC-2.5).

**Content (BR-O2), in order:**

1. Title "Invite members".
2. `inviteIntro(title)`.
3. **The link:**
   - while loading, "Getting the link…";
   - on failure, "Couldn't get the invite link. Check your connection and try again." and a
     "Try again" button (AC-1.6);
   - otherwise `<p className={styles.link}>{link}</p>`. `.link` is `font-family: var(--mono)`,
     12px, `overflow-wrap: anywhere`, `user-select: all`, padding 8px 10px,
     `background: var(--surface2)`, `border-radius: var(--radius-sm)`.
4. **"Copy link"** (only with a link):
   - `navigator.clipboard.writeText(link)` succeeds: the label reads "Copied" for 2 seconds and
     `note = 'Link copied'` (AC-1.7);
   - it's missing or rejects: the error "Couldn't copy. Select the link and copy it yourself.",
     and `getSelection()?.selectAllChildren(linkEl)` (AC-1.8).
5. **Heading** `<h3 className={styles.heading}>Tracking on Hati</h3>`.
6. **The list** (`sortNames` by member; inside `.list` with
   `max-height: min(40vh, 18rem); overflow-y: auto`):
   - empty: "Nobody has joined yet." (AC-2.1);
   - otherwise one row each: `<strong>{member}</strong>`, `joinedRowLine(p)` under it, and
     `<Button size="sm" aria-label={`Remove ${member}'s account from ${title}`}>Remove</Button>`
     (AC-2.2 to AC-2.4, AC-4.1).
7. **Actions:** "Reset link" (default variant) and "Done" (primary, calls `onClose`).
8. `<p role="status" className="visually-hidden">{note}</p>`.

**Reset:**
- A `ConfirmDialog`, destructive, titled "Reset the invite link?". The message is "The current
  link, and the QR on any statement you've already shared, will stop working. Members who already
  joined keep tracking. You'll get a new link to share." The buttons are "Cancel" and "Reset link"
  (AC-3.1).
- On confirm, `getLink(session.id, true)`:
  - success: the new link and `note = 'Invite link reset.'` (AC-3.2);
  - failure: the error "Couldn't reset the link. Try again." and the old link stays (AC-3.4).

**Remove (`RemoveParticipantDialog`, internal to the file):**
- A `ModalDialog` titled `Remove {member}?`, with `removeMessage(p, title)`.
- A checkbox "Also reset the invite link", **unticked** (Q1). It uses the `MePicker` option style:
  import `MePicker.module.css`'s `.option` and `.optionLabel`.
- Buttons as a destructive `ConfirmDialog`: "Cancel" is primary, "Remove" is `danger` (AC-4.2).
- On confirm, `removeParticipant(session.id, member)`:
  - `true`: the row leaves the list (AC-4.3). Then, if ticked, the reset as above, with A5 on
    failure.
  - `false`: the row stays, and the error is `Couldn't remove ${member}. Try again.` (AC-4.6).

**Phone** (`@media (max-width: 640px)` in `InviteMembersDialog.module.css`): each list row wraps its
Remove button under the text (`flex-wrap: wrap`). On desktop the button sits at the row's end.

### 6.7 Stop tracking (`src/components/collection/StopTrackingButton.tsx`, new)

**Props:** `session`, `variant: 'link' | 'button'`, `className?`, `onLeft(title)`.

**The button:**
- `'link'`: `variant="ghost" size="sm" className="link-action"`, as `YouAre`'s Change.
- `'button'`: `size="lg"` with `className`.
- Either way, `aria-label={`Stop tracking ${title}`}` and the text "Stop tracking" (AC-12.1).

**Its `ConfirmDialog`:**
- Destructive, titled `Stop tracking “{title}”?`, with
  `stopTrackingMessage(session.organizerName)`, and buttons "Cancel" and "Stop tracking"
  (AC-12.2).
- On confirm: `leaveSession(session.id)`, then `onLeft(title)`.
- Cancel puts focus back on the button, with the `requestAnimationFrame` pattern `UndoSettled`
  uses.

### 6.8 History (`HistoryPage`, `SessionCard`, `HistoryDetailPage`)

**`SessionCard`** gains `sharedBy?: string`, rendered as `<span className={styles.shared}>` after
the members line. `.shared` copies `.count`'s typography (11px, `var(--text3)`).

**`HistoryPage`** passes `sharedBy={sharedByLine(session.organizerName)}` and **no** `onDelete` for
a joined session (AC-11.1, BR-V9). Owned cards are unchanged. The delete message comes from
`deleteSessionMessage` (AC-13.x).

**`HistoryDetailPage`** gains `onLeft?: (title: string) => void`. With
`const joined = isJoined(session)`:
- **Joined:** under the "Finished …" line,
  `<p className={styles.meta}>{sharedByLine(session.organizerName)} · You joined as {session.me}</p>`
  (AC-11.2).
- **The export and its neighbour** move into `<div className={styles.actions}>`:
  `<ExportSoaButton layout="inline" …/>` (unchanged props; AC-11.3), then either
  `<StopTrackingButton variant="button" className={styles.secondary} …/>` (joined) or
  `<Button size="lg" className={styles.secondary} onClick={() => setInviting(true)}>Invite members</Button>`
  (organizer, AC-1.1).
- `{inviting && <InviteMembersDialog session={session} onClose={() => setInviting(false)} />}`.
- Nothing else changes, so there's still no edit of any kind (AC-11.4).

**`HistoryDetailPage.module.css`:**

```css
/* The export and its neighbour, side by side at the end of the header row. */
.actions {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.secondary {
  width: var(--footer-action-width);
}

@media (max-width: 640px) {
  /* Stacked under the titles, full width (E1-18). The descendant selector outranks the
     export's own `.inline > button` width. */
  .actions {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .header .actions button {
    width: 100%;
  }
}
```

### 6.9 Phone and desktop

| Screen | Desktop | Phone (≤ 640px) |
|---|---|---|
| History detail | "↓ Download SOA" and Invite members or Stop tracking side by side, right of the titles, each `--footer-action-width` wide | the two stacked full width under the titles |
| Collection card | Invite members as the body's last row; a joined card's "You joined as … · Stop tracking" row wraps as `.youAre` does | same; `.youAre` already wraps |
| Invite members dialog | `min(26rem, 100vw − 2rem)`, list rows with Remove at the end | Remove wraps under the row's text; the list scrolls in the dialog; the link wraps in mono |
| Join dialog | `ModalDialog` sizing; the member list scrolls past `min(50vh, 20rem)` | same, centred in the visible area by `ModalDialog` |
| Signed-out screen | one extra line under the subtitle | same |

Nothing else moves on desktop. The tester compares desktop Collection, History and History detail
against `main`.

## 7. Onboarding tour impact

None beyond the ordering in 6.2.

- **No new `data-tour` attribute** (BR-G7). Invite members, both dialogs, "Shared by", "You joined
  as … · Stop tracking", the join flow and the signed-out line carry none.
- **No existing target moves, is renamed or is duplicated** (BR-G8).
  - `collection-totals`, `collection-unsettled`, `collection-outstanding`, `collection-settled`,
    `collection-owed`, `collection-mark-all`, `nav-collection` and `nav-history` stay on the same
    elements.
  - The Invite row is a new sibling **after** `MarkAll`'s `div[data-tour="collection-mark-all"]`,
    never inside it.
  - A joined card's Owed to you `section` is the same element, with the same conditional target,
    as an organizer's. Only one card is open at a time.
  - History detail's new `.actions` wrapper holds no target.
- **Tour and guide steps and copy are unchanged** (BR-G6). Every step still targets an element on
  the screen the reader is already on. "Take the tour" now puts the app on Home before step 1, so
  the first step's `new-session` target is on screen even when the welcome opened on Collection
  after a join (BR-G2).
- **The practice** (BR-G9). Scene sessions have no `role` and no `participants`, so they're
  organizer sessions with nobody joined. Their `practice_` ids hide Invite members (AC-1.9). No
  guide calls `/api/invites` or `/api/participants`. The memory backend's three new methods do
  nothing.
- **Run after building:** `steps.test.ts`, `targets.test.ts` and `guides/guides.test.ts` pass
  **unchanged**. A new static check (section 8) asserts that the new files carry no `data-tour`,
  and that `CollectionCard.tsx` still declares exactly its two targets.

## 8. Test plan

Static tests only (no jsdom, no testing-library). Write these first and watch them fail, then build
until they pass.

**`src/lib/joinLink.test.ts` (new)**, with an in-memory fake `JoinStorage` and a throwing one:
- `readJoinParam`: `?join=abc` gives `'abc'`, `?join=` gives `''`, no param gives null, a 200-character
  value is cut to 64.
- `withoutJoinParam` keeps other params and the hash (`/?a=1&join=x#/sign-in` gives
  `/?a=1#/sign-in`), and gives `/` for `/?join=x` (AC-5.1).
- `peekJoin` returns the raw value at 59 minutes and null at 60 (AC-5.2, E1-11). It never removes
  the item. `clearJoin` does (AC-5.3).
- A throwing storage and a null storage never throw, and peek gives null.
- `inviteUrl('https://x.app', t)` is `https://x.app/?join=${t}` (AC-1.4).
- **Source order:** in `src/main.tsx`, `stashJoin(` and `replaceState(` appear before
  `createRoot(`.

**`src/lib/joinedSessions.test.ts` (new):**
- `isInviteToken`: 22 base64url characters pass; 21, 23, `+`, `/`, `=` and a non-string fail
  (AC-8.1).
- `participantView` (BR-V1, RC-1): Ana, Ben and Carla, with payments Ben→Ana, Carla→Ana and
  Carla→Ben. As Ben, only Ben→Ana and Carla→Ben come back. `me` is `'Ben'`, `role` is
  `'participant'`, `participants` is `[]`, the organizer name is passed through, and members and
  records are untouched.
- `closedSessionMe` (BR-R1, US-14), one case per branch:
  - null keeps the stored value;
  - `''` is `''`;
  - an unclaimed member is taken;
  - a claimed member keeps the stored value;
  - a name not in the stored members keeps the stored value.
- `onHatiMembers` and `claimableMembers`:
  - the organizer's member plus claimed members;
  - `me` of `''` or null adds nobody (E1-2);
  - a one-member session whose member is the organizer's has no claimable member (E1-1).
- `joinPreselect` (AC-6.3 to AC-6.5):
  - a profile hit on a claimable member;
  - a nickname hit;
  - a profile hit only on an on-Hati member gives no preselect;
  - two hits give none.
- `joinAnswerFrom` and `joinStage` (BR-J6, AC-6.8, AC-7.1, AC-7.2, AC-8.1, AC-9.1): a table over
  statuses 200, 201, 400, 404, 409 (taken, and taken with nothing left, which is `full`), 500 and
  null.
- `joinFlowReady` (BR-G1, BR-G5): false while not loaded, while the profile is loading, in a
  phase other than `off`, and in practice. True with the profile in `error`.
- Every copy builder against the exact strings in 5.2, with and without an organizer name and a
  profile name (AC-2.2, AC-2.3, AC-4.2, AC-6.2, AC-7.1, AC-7.2, AC-9.1, AC-10.2, AC-10.4,
  AC-12.2).

**`src/lib/collection.test.ts` (extend):**
- A joined session (AC-10.1, BR-V3):
  - Outstanding while one of its lines has something left, Settled when all are paid;
  - never Needs setup, even with no profile name;
  - Settled with "no lines" when the member is even (E1-6).
- A joined session ignores the user's names (BR-V2). With a profile name matching another member,
  `me` is still the joined member.
- `presettled`, `offersAlreadySettled` and `allPairsPaid` are false on a joined session that was
  finished before Collection with no payments (BR-V6).
- `buildCollection`'s `youOweCents` and `owedToYouCents` include a joined Outstanding card
  (AC-10.5).
- `resolveMe` on an owned session (AC-14.2, E1-3):
  - with `me: null`, a profile name matching Ben and Ben claimed, it isn't Ben, and falls to
    unknown or a nickname suggestion;
  - with an explicit pick, it's unchanged.

**`src/lib/sessionLabel.test.ts` (extend):** the AC-13.1 and AC-13.2 strings exactly, with 1 and 2
members tracking, and today's strings unchanged with none (AC-13.3).

**`src/lib/writeQueue.test.ts` (extend):** `reloadsOnReturn` is false with null, false at 29,999
ms, true at 30,000 ms (AC-15.1, AC-15.2).

**`src/lib/apiValidation.test.ts` (extend):**
- `parseInviteInput`:
  - link (with and without `reset`, and `reset: 'yes'` refused);
  - preview;
  - join;
  - and these refused: a bad token, `sessionId` with `token`, `member` without `token`, an empty
    member, a 201-character member, and a non-object.
- `parseParticipantQuery`: arrays and empty strings refused.
- `parseJoinedFlag`: only `'1'` is true.

**`src/lib/sessionSaveApi.test.ts` (update and extend; BR-R1, E1-17):**
- The fake answers the new `select status, members, me … for update` with `db.stored` (a row or
  none) instead of using the update's `rowCount`.
- `db.claimed` feeds the participants select.
- Existing cases keep their meaning with `db.stored = { status: 'draft', … }`, and no row is still
  a 404 that writes nothing.
- New cases on a stored `closed` row:
  - no `purchase_records` statement is sent;
  - the update sets only `name`, `activity_at` and `me`, never `status`, `members` or `closed_at`;
  - a body `me` naming a claimed member stores the old `me`;
  - an unclaimed one is stored.

**`src/lib/invitesApi.test.ts` (new; the same fake-database pattern as `sessionSaveApi.test.ts`):**
- link:
  - the update is scoped to `id`, `user_id` and `status = 'closed'`;
  - no row is a 404 (a participant, a draft, AC-1.3);
  - success returns the token and the participants;
  - `reset: true` sends the reset branch (AC-3.2);
  - the minted value matches the token pattern.
- preview:
  - an unknown token is a 404 with `dead_link` (AC-8.1);
  - the organizer gets `own` (AC-7.2, E1-8);
  - an existing participant gets `already` with their member (AC-7.1);
  - anyone else gets `open`, with the organizer's member and claimed members in `onHati`;
  - no lock is taken.
- join:
  - `begin`, then the lookup with `for update of s`, then the participants select, then the
    insert, then `commit`, in that order (4.2, E1-9);
  - a claimed member, the organizer's member and a non-member are each a 409 `taken` with a fresh
    preview and no insert (BR-J4);
  - success is 201 `joined`;
  - `ensureUser` runs before `begin`.
- A token is never read from `req.query`.

**`src/lib/participantsApi.test.ts` (new; fake database; the fake `lockSessionRole` answers from
`db.role`):**
- The owner removes a member: the delete names `session_id` and `member`, then 204 (AC-4.3).
- A participant naming their own member deletes by `user_id`, then 204 (AC-12.4).
- A participant naming another member is a 403 `not_yours` with no delete.
- No relation is a 404 with no delete.
- The lock statement comes first, with `for update of s` (4.2).
- A missing or array query is a 400.

**`src/lib/loadSessions.test.ts` (new; RC-1).** It mocks `@vercel/postgres`'s `createPool` with a
fake whose `sql` records each statement and answers it from scripted rows:
- With `joined = false`, no statement reads `session_participants` for joined sessions (query B
  isn't sent). That's the old-client guard.
- With `joined = true`, a joined session:
  - comes back through `participantView`, with only its member's payments;
  - has `me` as the member, never the organizer's;
  - has `organizerName` set and `participants: []`.
- Query B's text doesn't select `s.me`.
- The participants query receives only owned ids.
- The records and payments queries receive exactly the ids that queries A and B returned.
- `only` narrows both queries.

**`src/components/collection/joinedCards.test.ts` (new; `renderToStaticMarkup` through
`PracticeSessionsProvider` and `PracticeProfileProvider`, as `CollectionPage.test.ts` does):**
- `CollectionPage` with a joined session open (`openSessionId`):
  - "Shared by Ana" in the summary (AC-10.2);
  - "You joined as", "Stop tracking" with its `aria-label` (AC-12.1);
  - "Ana records the payments on this session." (AC-10.4);
  - **no** "Record payment", "I paid", "Mark fully paid", "Undo", "Mark all as paid", "Change",
    "Already settled" or "Invite members" (AC-10.4, BR-V6, BR-V7).
- The same session collapsed shows "Shared with you" when `organizerName` is null.
- An owned finished session with a **non-practice** id, open, ends with "Invite members"
  (AC-1.2). The same session with a `practice_` id has none (AC-1.9). A draft never shows
  Collection.
- `HistoryPage`: a joined session's card has "Shared by" and no "Delete session" button
  (AC-11.1).
- `HistoryDetailPage`:
  - joined: "You joined as Ben", "↓ Download SOA" and "Stop tracking" (AC-11.2);
  - owned: "Invite members" beside the export (AC-1.1).
- `MePicker` with `unavailable={['Ben']}` renders Ben's radio `disabled` with "Ben · on Hati"
  (AC-14.1, AC-6.2). With `offerNotInSession={false}` there's no "I'm not in this session".
- **No new targets** (BR-G7, BR-G8): the sources of `JoinFlow.tsx`, `InviteMembersDialog.tsx`,
  `StopTrackingButton.tsx` and `SignedOutScreen.tsx` contain no `data-tour`. `CollectionCard.tsx`
  contains exactly `data-tour={group.direction === 'owedToYou' ? 'collection-owed' : undefined}`
  and `data-tour="collection-mark-all"`, once each.

**Unchanged and must pass:** `steps.test.ts`, `targets.test.ts`, `guides/guides.test.ts`,
`dialogs.test.ts`, `CollectionPage.test.ts` and `apiImports.test.ts` (which now also walks
`api/invites.ts`, `api/participants.ts` and `src/lib/joinedSessions.ts`).

### 8.1 Reviewer checks (surgeon-reviewer)

- **RC-1:** the `loadSessions` split and the D1 filter, as in 4.3.
- **RC-2:** every new transaction locks `expense_sessions` first (4.2). `ensureUser` is never
  inside one.
- **RC-3:** tokens appear only in POST bodies and the client's stash, never in an API query string
  or a `console` call, and the address bar is cleared in `main.tsx`.
- **RC-4:** no organizer-only route's `user_id` clause was loosened. The payments routes are
  untouched.
- **RC-5:** the closed-session guard reads the **stored** status, and a draft's save path is
  byte-for-byte today's.
- **RC-6:** the onboarding rules in section 7. No new dependency (`node:crypto` is built in).
  Mobile-only CSS sits inside `@media (max-width: 640px)`. The one icon-free control, Remove,
  has an `aria-label` anyway.

### 8.2 Tester rules for Neon `main` data

The shared `main` holds real data.

- **Accounts.** The tester uses two **test accounts**, A (organizer) and B (joiner), and one
  brand-new sign-up for the BR-G ordering check. Every sign-up counts toward the Clerk
  Development instance's 100-user cap (D10), so the tester reuses A and B across rounds, and makes
  at most one new account per round.
- **Data.** A creates at most two sessions named "Test – joined …", finishes them, and deletes them
  at the end. The cascade removes the participant rows. B's own data stays empty.
- **Hands off.** Nobody joins, removes or resets the link on a real user's session. No Seed, Clear
  All or Load Demo Data.

### 8.3 Checks for the ui-ux-tester

`npm run dev:full`, port 3000, at 390×844 and 1400×900 (375px where an AC says so), with the network
log open. A in one browser profile, B in another.

| AC | Check |
|---|---|
| AC-1.1, AC-1.2, E1-18 | As A: History detail shows Invite members beside Download SOA (side by side on desktop, stacked full width on a phone). The open Outstanding and Settled cards end with Invite members, under Mark all or Undo, with one divider. |
| AC-1.3, AC-1.9 | A draft's Summary and workspace show no Invite. The Collection guide shows none. |
| AC-1.4 to AC-1.8 | "Getting the link…", then `http://localhost:3000/?join=` plus 22 characters. Reopen from the other place: same link. Copy: "Copied" for about 2 seconds, and the paste matches. With the clipboard permission blocked: the select-it-yourself message and the link selected. Block `/api/invites` in DevTools: the AC-1.6 message and Try again, with the list still shown. |
| AC-2.1 to AC-2.5 | Before B joins: "Nobody has joined yet." After B joins: reopen the dialog, and the row shows B's member, B's profile name (or "No name set") and the date. No email anywhere. |
| AC-3.1 to AC-3.4 | Reset: the confirmation copy, then a new link and the announcement. As B (already joined) the session stays. In a third, signed-in window the old link gives the dead-link dialog. |
| AC-4.1 to AC-4.6 | Remove B: the copy and the unticked checkbox. Confirm: the row goes. B's tab, on return after 30 seconds or a reload: the session is gone from Collection and History, and open History detail reads "Session not found". Repeat with the checkbox ticked: the link also changes. |
| AC-5.1 to AC-5.3, E1-11 | Signed out, open the link: the address bar loses `?join=` at once, and the invited line shows. Sign in (and once, sign up through Google): the join dialog. Refresh after it appears: no second dialog. |
| AC-6.1 to AC-6.10, E1-7, E1-9 | As B: "Checking the invite link…", then the join dialog with the exact copy. The preselect follows B's profile name, then a nickname (legend changes), then no match (Join disabled). On Hati members are disabled. The Remember checkbox appears as elsewhere. Join: Collection opens with the card open and scrolled to, and the announcement. Two tabs as B and a third account on the same member: one joins, the other gets AC-6.8. Offline: AC-6.9. Cancel and Escape: Home, and nothing created. |
| AC-7.1 to AC-7.3, E1-8 | B opens the link again: "already tracking" and Open in Collection, with no second card. A opens it (and in another browser): "This is your session". |
| AC-8.1, AC-9.1, A1 | `?join=junk`, a reset token, a deleted session's token: the same dead-link dialog. A session where every member is on Hati: "Everyone has already joined". With `/api/invites` blocked: A1's dialog, and Try again. |
| AC-10.1 to AC-10.6 | B's card: "Shared by …", the bucket, "You joined as Ben · Stop tracking", lines with no buttons, the organizer line, and the strip including it. A records a payment, and B sees it on return after 30 seconds. |
| AC-11.1 to AC-11.4 | B's History: "Shared by", no bin. Detail: the header line, Download SOA (the PDF matches A's) and Stop tracking. Nothing editable. |
| AC-12.1 to AC-12.5 | Stop tracking from the card and from detail: the copy, the session gone at once, the announcement, back on History from detail. A's list loses B on reopen. With `/api/participants` blocked: the session comes back and the banner shows. |
| AC-13.1 to AC-13.4 | A deletes a session B joined: the message with the count. B loses it on return. |
| AC-14.1, AC-14.2, E1-3 | A's Change and Needs setup pickers show B's member disabled. A with no pick and a profile name matching B's member: A's card falls to Needs setup or a nickname suggestion. |
| AC-15.1, AC-15.2, A4 | Switch tabs for more than 30 seconds and back: one `GET /api/sessions?joined=1`, no spinner, the open card and a typed amount kept. Back within 30 seconds: none. Offline return: no banner. |
| BR-G1 to BR-G4 | The brand-new account opens the link: the join flow comes first, then "Welcome to Hati!" on Collection. "Take the tour" starts on Home and runs all 7 steps. No Collection guide offer on that landing. A returning account with What's new due sees it after the join flow. |
| BR-R1, E1-17 | In DevTools, replay A's PUT of a finished session with a changed `records` array: the reload shows the stored records unchanged. |
| E1-4, E1-5 | A 20-member session: the join list scrolls and Join stays reachable at 375px. Very long names wrap with no sideways scroll. |
| Regression | Owned Collection, payments, Already settled, Mark all and Undo work as before. Desktop Collection, History and detail match `main` apart from the new buttons. Preview Tour and both guides run end to end. |

Before the hand-off, run `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`, and report
the real results.

## 9. Documentation impact

For the documentation-engineer, after PR 1 ships (with PR 2, to uat):

- **README:**
  - lines 11 and 12 ("Each account's data is private to that account — there is no sharing
    between accounts") must describe joined sessions;
  - line 264's `api/` description is already stale ("one blob per account").
- **API reference:**
  - the `GET /api/sessions` response (`role`, `organizerName`, `participants`, `?joined=1`, the D1
    view);
  - the PUT's closed-session guard;
  - `POST /api/invites` and `DELETE /api/participants` with every status;
  - the 404-versus-403 rule.
- **Data model:** `invite_token`, `session_participants`, `payment_claims` (marked "PR 2").
- **System documentation:**
  - "every account's data is private" is rewritten;
  - the security notes say finished sessions are read-only on the server;
  - the token is a bearer capability behind sign-in.
- **Decision record:** the ADR the architect called for (section 6 of the brief): sessions shared
  with joined accounts, owner-or-participant access, claims kept apart from the ledger, finished
  sessions read-only on the server.
- **User guide:** Invite members, joining, Stop tracking, and the delete warning.

## 10. Tasks (in order)

1. **Schema.** Add section 3's SQL to `scripts/db/schema.sql`. **Stop and get the owner's explicit
   OK** (3.1), then run `npx vite-node scripts/db/apply-schema.ts` once and report its output. Run
   it a second time to show it's idempotent. → verify: both table lists include
   `payment_claims, … session_participants`.
2. **Types.** `src/types/index.ts` (4.3, 4.5). → verify: `npx tsc -b` passes with nothing else
   changed.
3. **Pure logic, tests first.**
   - `src/lib/joinedSessions.ts` and its test;
   - `src/lib/joinLink.ts` and its test (without the `main.tsx` source-order case yet);
   - `collection.ts` (5.1);
   - `sessionLabel.ts` (5.5);
   - `writeQueue.ts` (5.4), each with its tests.

   → verify: the new and extended tests fail first, then pass.
4. **Validation.** `api/_validate.ts` (4.7), with the `apiValidation.test.ts` cases.
5. **`loadSessions`.** `api/_shared.ts`: split `loadSessions`, add `lockSessionRole`, export
   `iso`. Write `loadSessions.test.ts` first. → verify: RC-1 cases pass.
6. **API routes.**
   - the sessions GET flag;
   - the PUT guard (update `sessionSaveApi.test.ts` first);
   - `api/invites.ts`;
   - `api/participants.ts`, with their tests.

   → verify: on `npm run dev:full`, `GET /api/sessions?joined=1` returns owned sessions with
   `role: 'owner'` and `participants: []`.
7. **Client state.**
   - `useServerSessions` (the `?joined=1` load, the quiet reload, `addJoinedSession`,
     `leaveSession`, `removeParticipant`);
   - `useMemorySessions` stubs;
   - `useInvites`;
   - `SessionsStoreContext` (the backstop and the pass-through).

   → verify: `npx tsc -b`, and the app loads as before.
8. **Entry.** `main.tsx` (6.1), `SignedOutScreen`, and the `main.tsx` source-order test.
9. **Shared UI.** `MePicker`, `ChangeMeDialog`, `LineRow`, `StopTrackingButton`,
   `InviteMembersDialog`.
10. **Screens.** `CollectionCard`, `CollectionPage`, `SessionCard`, `HistoryPage`,
    `HistoryDetailPage` (+ css), with `joinedCards.test.ts`.
11. **The join flow.** `JoinFlow.tsx`, then the `App.tsx` ordering (6.2).
12. **CLAUDE.md**, exactly:
    - The API rule's first bullet becomes: "Every handler authenticates with `getUserId` (401
      without a user), checks access explicitly, validates input in `api/_validate.ts`, and uses
      the `pool.sql` template, never string-built SQL. Access means the session's owner, or a
      participant (an account that joined it) with role-scoped access: an account with no relation
      to the session gets a 404, and a participant asking for something its role doesn't allow
      gets a 403 with a `code`."
    - The last line becomes: "**Deliberately absent:** an in-app calculator, currency selection,
      offline use. Don't add them without the owner asking."
13. **Checks.** `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`. Then the two-account
    walkthrough of the intake's verification steps 1, 2, 3 and 5. (Step 4 is PR 2. Step 1's QR is
    PR 3.) Give the owner the local URL and the branch.

**Shipping:** PR 1 is merged to `main` only, when the owner asks. It is **not** promoted on its
own: it goes to uat together with PR 2 (Q4). Before testers start inviting on uat, the owner checks
the Clerk Development instance's user count (D10, the pre-uat checklist item).

## 11. Risks and effort

| Risk | Guard |
|---|---|
| A participant sees payments between two other members, or the organizer's pick. | D1 lives in one pure function, applied in one module-private path. Query B never selects `s.me`. RC-1, with `loadSessions.test.ts` and `participantView`'s test. |
| `GET /api/sessions` 500s everywhere that shares `main`. | Task 1 applies the schema before any `api/` edit, behind the owner's OK. Old code never reads the new tables. |
| The PUT guard blocks a legitimate save. | It keys on the **stored** status, so Finish (stored draft) passes. No UI edits a finished session's records or members. The tester replays a PUT, and the regression row covers Mark all, Undo and Already settled. DEV Seed (`replaceAll`) deletes then recreates, so it never PUTs over a stored finished row. |
| Two accounts claim one member, or the organizer and a participant both "are" Ben. | The session row lock serialises join, PUT and remove (4.2). The unique indexes are the backstop. `closedSessionMe` and `resolveMe` skip claimed members. |
| The token leaks through logs, or someone guesses it. | 128 random bits behind sign-in, POST bodies only, stripped from the address bar before render, and a uniform 404. Reset and Remove give the organizer control. |
| The join dialog fights the welcome, the tour, What's new, an offer or "Already settled?". | Holding all five behind `joinActive` is a set of small, explicit changes. `joinFlowReady` is a pure, tested gate. The tester runs a brand-new account. "Take the tour" now starts from Home. |
| The quiet reload throws away an in-flight edit, or flashes a spinner. | It reuses the load-and-merge path that already keeps unconfirmed sessions. It never sets `loading`, so `App`'s spinner can't show. A freshly joined session is protected by `settledDuringLoad`, and a left one by `deleting`. |
| An old tab (organizer) keeps saving finished sessions. | The guard ignores its members and records (E1-17). An old participant tab never asks for joined sessions. |
| Stacked dialogs (Remove or Reset over Invite members) misbehave. | They're rendered as siblings, not children, and each is a native `<dialog>` in the top layer. The tester checks Escape and backdrop clicks. |
| The Clerk Development instance reaches its 100-user cap. | The tester reuses accounts (8.2). The owner checks the count before uat (D10). |
| DEV Seed sends a `DELETE` for each joined session in the list. | They 404 harmlessly, and the next load brings them back. DEV only, so no change. |
| A link copied from a one-off deployment URL later stops working. | A known limitation, accepted (D9). |

**Size: large.** About 50 files:
- 16 new: 2 API routes, 2 lib modules, 1 hook, 3 components with 2 css files, and 6 test files;
- about 34 edited, 5 of them existing test files.

There's one schema change (one column, one index, two tables, three more indexes). The API
contract changes in three places: the GET's new fields and flag, the PUT guard, and two new
routes. Payments and the PDF are untouched.

## 12. Decisions for the user

- **D-A. The schema run** (3.1). It's additive and idempotent, but it runs against the shared Neon
  `main` with real data. It needs your explicit OK at build time. Approving this spec doesn't give
  it. Nothing to decide now.
- **D-B. Agent definitions and README repeat the rules CLAUDE.md changes.**
  - "Another account's id is a 404" and "no sharing between accounts" also appear in
    `.claude/agents/` (business-analyst, product-manager, system-architect, fullstack-developer,
    surgeon-reviewer, tech-lead, documentation-engineer) and in the README.
  - CLAUDE.md wins where they overlap. But the surgeon-reviewer could flag the new 403 as a missing
    404.
  - **Recommendation:** in PR 1, update the seven agent definitions' repeated lines to match
    CLAUDE.md's new wording, since they're agent configuration and need your OK. Leave the README
    to the documentation update.
  - **Alternative:** leave the agent definitions as they are, and tell the reviewer about the rule
    in its brief.
- **D-C. Assumptions A1 to A8** (section 1). Each fills a small gap in the requirements: copy for a
  failed link check, Cancel while checking, when Remember saves, a silent quiet-reload failure,
  remove-then-reset, Invite only on an openable card, button order, and focus after Stop tracking.
  **Recommendation:** approve as written. Veto any you'd like changed.
