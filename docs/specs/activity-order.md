# Spec: order In Progress cards by most recent activity

Status: **awaiting the owner's approval.** Branch `activity-order`, from `origin/main` at `342f041` (includes
PR #103).

## 1. Summary

Home lists drafts by when they were created (`src/pages/HomePage.tsx:42`). The owner wants a stack: the
session opened or changed most recently comes first, the order survives a reload, and it is the same on every
device signed in to the account. History stays ordered by finish date.

Each session gets one stored **activity time**, `expense_sessions.activity_at`, a new nullable column. Two
things set it:

- **A saved change.** Every save goes through `mutateSession`, which stamps the session. The stamp travels in
  the existing whole-session `PUT`.
- **An open,** meaning a tap on an In Progress card. It goes through a new, separate
  `PATCH /api/sessions/:id` that only ever moves `activity_at` forward. It never enters the save queue, the
  confirmations, the failure list or the leave prompt.

Home sorts by the **sort time**: the latest of the activity time, the newest purchase's logged time
(`PurchaseRecord.createdAt`) and the session's `createdAt`. Ties go to the newer `createdAt`, then the lower
id. Sessions from before the feature have no activity time, so they fall back to their purchases or their
creation time. Nothing is backfilled.

**Who stamps the time.** The client stamps the moment the user acted. The server caps it at its own clock and
keeps whichever is later, the stored time or the new one. So a late or retried request can't pull a session
down, requests that arrive out of order still keep the order the user touched things in, and a device whose
clock runs fast can't pin a session first.

Source: the business-analyst's requirements, "order In Progress cards by most recent activity" (US-1 to US-12,
BR-1 to BR-18, section 8's six hazards), with the owner's answers: Q1, the logged time; Q2, no undo; Q3, a quick
open-and-close may not reach other devices. All other proposed defaults stand. Intake brief:
`snappy-greeting-corbato.md`. The system-architect was skipped.

**Assumptions** (veto any before approving):

- **A1.** Finishing a session also stamps it, because Finish is a save like any other. This is invisible:
  History sorts by `closedAt` and Home shows only drafts (AC-2.9, AC-11.3).
- **A2.** A tap on a card that is already first still sends an open. It changes nothing on screen, it keeps
  other devices right, and skipping it would need extra logic.
- **A3.** The open's request uses `fetch`'s `keepalive: true`, so an open the browser has already started
  sending still completes if the tab closes. The token is fetched first, though, so an open made just before
  closing can still be lost. That's Q3, which the owner accepted.
- **A4.** While the tour is running, a card opened with the keyboard records no open (BR-14, AC-8.7). The
  overlay already blocks taps.

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Types | `src/types/index.ts` | `Session.activityAt: string \| null` | — |
| Schema | `scripts/db/schema.sql` | one `alter table … add column if not exists activity_at timestamptz` | `scripts/db/apply-schema.ts`, unchanged |
| Pure logic | `src/lib/activity.ts` **(new)** | `parseActivityAt`, `clampActivityAt`, `sortTime`, `compareByRecentActivity`, `keepOpenedActivity` | — |
| Pure logic | `src/lib/storage.ts` | `parseSession` reads `activityAt` through `parseActivityAt`; `migrateV1` sets `activityAt: null` | — |
| Dev data | `src/lib/demoSessions.ts` | `activityAt: null` on each built session | — |
| API | `api/_validate.ts` | new `parseActivityInput` for the PATCH body | `parseActivityAt` |
| API | `api/sessions/[id].ts` | PUT stores the capped stamp and never moves it back; new PATCH; `Allow` header | `ownsSession`, `getUserId`, `pool.sql` |
| API | `api/_shared.ts` | `loadSessions` selects and returns `activity_at` | `SessionRow`, `iso` |
| Client state | `src/hooks/useServerSessions.ts` | `mutateSession` stamps; new `recordOpen`; an `opening` map; the load keeps an in-flight open's stamp | `commit`, `authedFetch`, `withDeadline`, `creating` |
| Client state | `src/context/SessionsStoreContext.tsx` | `createSession` sets `activityAt: null`; exposes `recordOpen` | — |
| UI | `src/pages/HomePage.tsx` | the sort uses `compareByRecentActivity` | — |
| UI | `src/App.tsx` | a Home card tap records an open, except during the tour; Back from a session scrolls to the top | `openSession`, `phase` |
| Tests | `src/lib/activity.test.ts` **(new)**, `writeQueue.test.ts`, `sessionValidation.test.ts`, `storage.test.ts`, `sessionName.test.ts`, `sessionLabel.test.ts` | see section 8 | — |

**Not touched:** `src/lib/writeQueue.ts` (`mergeLoaded`, `sameSessionContent`, the queue, the confirmations and
the failures are all unchanged), `src/lib/saveMessage.ts`, `PurchaseItemCard`, `SyncBanner`, `HistoryPage`,
`HistoryDetailPage`, `SessionCard`, all CSS, the PDF, `api/sessions/index.ts` (POST), `api/user.ts`,
`src/components/onboarding/*`, and `scripts/db/verify-migration.ts` (a one-off script that no tsconfig
type-checks).

## 3. Data model

Add this to `scripts/db/schema.sql`, directly after the `name` column's `alter table`:

```sql
-- When the session was last opened or changed: the moment the user acted,
-- capped at the server's clock, and never moved backwards. Home lists drafts
-- by it. Null means no activity recorded yet; the app then falls back to the
-- latest purchase or the creation time, so nothing needs backfilling.
alter table expense_sessions add column if not exists activity_at timestamptz;
```

- **Existing rows** get `null`, so they sort by the fallback (BR-4, BR-18). No backfill, no default, and no
  existing value changes.
- **Idempotent:** with `if not exists`, re-running `apply-schema.ts` does nothing.
- **Non-destructive:** nothing is dropped, rewritten or migrated. On Postgres 11 and later, adding a nullable
  column with no default only changes the catalog: the table isn't rewritten, and the lock lasts milliseconds.
- **No index.** Sorting happens in the browser over one account's sessions.
- **Rollback:** if the code is ever reverted, leave the column in place, because old code ignores it. Never
  drop it on `main`.

### Applying it to the shared Neon `main` branch

**What runs it.** `npx vite-node scripts/db/apply-schema.ts`, from the repo root. It reads `HATI_DATABASE_URL`
from `.env.local`, which points at the shared Neon `main` branch used by local dev, sit, qat and uat. It runs
the whole of `schema.sql`, and every statement in it is idempotent.

**When.** Once, as the first build task, **before any API file is edited.** `vercel dev` is already running on
port 3000 and reloads functions as soon as their files change. The new `loadSessions` selects `activity_at`, so
new code against an unaltered table fails `GET /api/sessions` with a 500. The same goes for any Vercel
deployment of this branch: the column must exist before the branch's code is pushed.

**Who.** The fullstack-developer runs it once, after the owner approves this spec. Approving the spec
authorises exactly that run (decision 1). The developer reports the script's output.

**Old code keeps working against the altered table** (AC-10.3). sit, qat and uat run old code against the new
column until this ships to each of them. That's safe because:

- Every old `select` names its columns. There's no `select *`, so the extra column is invisible.
- The old POST and PUT inserts list their columns, so a new row gets `activity_at = null`.
- The old PUT's `on conflict do update set` lists `status`, `closed_at`, `members` and `name` only. An old
  build's save therefore never touches a stored activity time.
- A browser tab still running the old bundle after the deploy sends a PUT without `activityAt`. The new
  server parses that as `null`, and `greatest` keeps the stored value (section 4).

**stg and prod.** If those stages use a different Neon branch, the devops-engineer runs the same command with
`DATABASE_URL_OVERRIDE=<that branch's URL>`, before the hop that first brings this code there.

**Verify.** The script prints its table list, and a second run succeeds the same way. The functional check is
that Home loads at `http://localhost:3000`.

## 4. API contract

Every route keeps:
- `getUserId`: 401 `{ error: 'Not signed in.' }` without a user; 500 `{ error: 'Auth is misconfigured.' }` if
  auth is misconfigured.
- An explicit ownership check: another account's id is a 404.
- Validation in `api/_validate.ts`.
- `pool.sql` templates only.

### `GET /api/sessions` (response gains `activityAt`)

- **200:** `Session[]`, where each session gains `activityAt: string | null` (ISO).
- **`loadSessions` in `api/_shared.ts`:**
  - The query selects `id, status, created_at, closed_at, members, name, activity_at`.
  - `SessionRow` gains `activity_at: Date | string | null`.
  - The mapping adds `activityAt: s.activity_at === null ? null : iso(s.activity_at)`.
  - The `order by created_at` stays. The client sorts.

### `PUT /api/sessions/:id` (stores the stamp, forward only)

- **Request:** the whole `Session`, now with `activityAt`. An absent or unreadable `activityAt` is `null`,
  meaning "this write records no activity". It is never a 400, so older clients and the dev seeder stay valid.
- **Validation:** unchanged entry point, `parseSessionInput` → `parseSession`, which now sets
  `activityAt: parseActivityAt(raw.activityAt)` (section 5).
- **Business rule:** `const activityAt = clampActivityAt(session.activityAt, Date.now());`. It's imported from
  `'../../src/lib/activity.js'`, and the `.js` extension is required by `apiImports.test.ts`.
- **SQL:** the upsert adds the column to the insert, and a forward-only update:

  ```sql
  insert into expense_sessions (id, user_id, status, created_at, closed_at, members, name, activity_at)
  values (
    ${sessionId}, ${userId}, ${session.status},
    ${session.createdAt}, ${session.closedAt},
    ${JSON.stringify(session.members)}::jsonb,
    ${session.name},
    ${activityAt}::timestamptz
  )
  on conflict (id) do update set
    status      = excluded.status,
    closed_at   = excluded.closed_at,
    members     = excluded.members,
    name        = excluded.name,
    activity_at = greatest(expense_sessions.activity_at, excluded.activity_at)
  ```

  Postgres `greatest` ignores nulls, so `null` never wipes a stored time, and an earlier time never replaces a
  later one (BR-7, hazard 6).
- **Response:** 200, the parsed session, unchanged. Its `activityAt` is the value as sent, before the cap. The
  client ignores this body.
- **Other statuses, unchanged:** 400 for a missing id or a malformed session, 404 for another account's id.

### `PATCH /api/sessions/:id` (new: records an open)

- **Purpose:** move one owned session's activity time forward, and nothing else. It never inserts, so it can't
  recreate a deleted session (BR-13, hazard 3), and it carries no content, so it can't overwrite newer content
  (BR-2).
- **Auth:** `getUserId`; 401 without a user.
- **Request:** `{ "activityAt": "<ISO time>" }`, as JSON.
- **Validation:** `parseActivityInput(raw)` in `api/_validate.ts`. It returns `null` unless `raw` is a plain
  object whose `activityAt` passes `parseActivityAt`.
- **Handler order:**
  1. 401 if there's no user.
  2. 400 if the path has no id (the existing check).
  3. Parse the body the same way PUT does: `typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body`.
  4. 400 `{ error: 'An activity time is required.' }` if `parseActivityInput` returns null.
  5. 404 `{ error: 'No such session.' }` unless `ownsSession(userId, sessionId)`. That covers another account's
     id, and a session that has since been deleted.
  6. Run:

  ```sql
  update expense_sessions
  set activity_at = greatest(activity_at, ${clampActivityAt(sent, Date.now())}::timestamptz)
  where id = ${sessionId} and user_id = ${userId}
  ```

  7. Return 204 with no body.
- **Statuses:** 204, 400, 401, 404, 405, and 500 for misconfigured auth or a body that isn't JSON (the same as
  PUT today).
- No `ensureUser`, because nothing is inserted.

### 405

The fallback becomes `res.setHeader('Allow', 'PUT, PATCH, DELETE')`.

### `POST /api/sessions` and `DELETE /api/sessions/:id`

Unchanged. A new row gets `activity_at = null` and sorts by its `created_at`, which already puts it first
(BR-16). The DELETE removes the row with its column. It doesn't wait for opens, because an open that lands after
the DELETE updates nothing and returns 404 (AC-7.3, AC-7.5).

### `api/_validate.ts` addition

```ts
/**
 * The activity time an open reports. It is the whole request, so unlike a
 * field inside a session, a missing or unreadable one is a 400 rather than null.
 */
export function parseActivityInput(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return parseActivityAt((raw as Record<string, unknown>).activityAt);
}
```

It imports `parseActivityAt` from `'../src/lib/activity.js'`.

## 5. Business logic

There are no money rules: no amount, split, rounding or settlement changes.

### `src/lib/activity.ts` (new)

Its only import is `import type { Session } from '../types';`, which keeps it loadable by the API: type imports
are exempt from `apiImports.test.ts`. Write it as follows, with these comments, which say why:

```ts
/** Milliseconds for an ISO time. An unreadable one counts as the epoch, so a comparator never returns NaN. */
const ms = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/**
 * An activity time as the API and the parser accept it: a readable time from
 * 1970 on, normalised to ISO. Anything else is no time rather than an error,
 * so an older client's write is never rejected for lacking one.
 */
export function parseActivityAt(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t >= 0 ? new Date(t).toISOString() : null;
}

/**
 * The time the server stores: the client's, so it reflects when the user
 * acted even if the request was slow, but never later than the server's own
 * clock, so a device set in the future cannot pin a session first (BR-7).
 */
export function clampActivityAt(sent: string | null, now: number): string | null {
  return sent === null ? null : new Date(Math.min(Date.parse(sent), now)).toISOString();
}

/** When the session was last touched, as far as Home can tell (BR-4, BR-5). */
export function sortTime(session: Session): number {
  let latest = ms(session.createdAt);
  if (session.activityAt !== null) latest = Math.max(latest, ms(session.activityAt));
  for (const record of session.records) latest = Math.max(latest, ms(record.createdAt));
  return latest;
}

/**
 * Home's order: most recently touched first, then the newer session, then the
 * lower id. Ids compare by code unit rather than locale, so every device
 * agrees (BR-6).
 */
export function compareByRecentActivity(a: Session, b: Session): number {
  return (
    sortTime(b) - sortTime(a) ||
    ms(b.createdAt) - ms(a.createdAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The merged list after a load, keeping the on-screen activity time of any
 * session whose open hasn't reached the server yet, so that session doesn't
 * drop now and rise again on the next load (AC-6.4). Content is always the
 * merged copy's.
 */
export function keepOpenedActivity<S extends { id: string; activityAt: string | null }>(
  merged: S[],
  local: S[],
  isOpening: (id: string) => boolean,
): S[] {
  const localById = new Map(local.map((s) => [s.id, s]));
  return merged.map((s) => {
    const mine = localById.get(s.id)?.activityAt ?? null;
    if (!isOpening(s.id) || mine === null) return s;
    return s.activityAt !== null && ms(s.activityAt) >= ms(mine) ? s : { ...s, activityAt: mine };
  });
}
```

How these rules meet the requirements:

- **Sort time** is the maximum of three times (the owner's rule). With the new build alone it equals the
  activity time, because a purchase is logged at the moment of the save that stamps it. The maximum only
  matters when an old build saves a purchase without stamping (AC-10.4). It uses the logged time, not the
  purchase date (Q1). So on day one "Test" can move above "Bali Trip", and no data is written.
- **Never backwards** (BR-7):
  - On the server, through `greatest`, in both PUT and PATCH.
  - In the app, because a response never changes local state (BR-10). A load replaces activity times only
    where it replaces content, which is the existing `mergeLoaded` rule, plus `keepOpenedActivity` for opens
    still in flight.
- **Touch order survives reordered requests** (AC-5.3, AC-5.5), because the stored time is the time of the
  action, not the time the request arrived.
- **Ties** (AC-5.4): a total order using numbers and code-unit id comparison, so it is the same on every device
  and every render.

### `src/lib/storage.ts`

- `parseSession` adds `activityAt: parseActivityAt(raw.activityAt)`, importing from `'./activity.js'`.
- `migrateV1` adds `activityAt: null`.

### `sameSessionContent` and `mergeLoaded` (hazards 4 and 5)

Both stay as they are:

- **`sameSessionContent`** compares `name`, `status`, `members` and records, so it already ignores
  `activityAt`. A difference in activity time alone therefore never shows the "Some recent changes weren't
  saved" note (BR-12, AC-6.6). A new test pins this down.
- **`mergeLoaded`** treats the activity time as part of the session:
  - An unconfirmed session (save queued or in flight, or create in flight) keeps its on-screen copy, stamp
    included.
  - Every other session takes the server's copy and the server's time. That includes a session whose save
    failed, so after "Try again" it can drop (AC-6.2, BR-10).
  - Opens never make a session unconfirmed. The only extra rule for them is `keepOpenedActivity`, applied
    after `mergeLoaded`.

### `src/hooks/useServerSessions.ts`

**`mutateSession` stamps every saved change** (BR-1). After the existing no-op check, so a change that does
nothing still sends nothing and doesn't move the card (AC-2.6):

```ts
const changed = fn(prev[index]);
if (changed === prev[index]) { onSettled?.(false); return; }   // unchanged
// Every saved change is activity (BR-1). The time is the edit's own, so a
// save that lands late still reflects when the user acted.
const next = { ...changed, activityAt: new Date().toISOString() };
```

The rest is unchanged: `commit(copy)`, `confirmations.wait`, `enqueueSave(next)`. The coalesced follow-up save
carries the latest copy, and so the latest stamp. `put`, the queue, the confirmations, the failures and
`pending` are untouched.

**New `opening` ref**, next to `creating` and `deleting`:

```ts
/**
 * Opens still in flight, by session id, counted because a session can be
 * opened again before the first request returns. A load landing meanwhile
 * keeps their on-screen activity time (see `keepOpenedActivity`).
 */
const opening = useRef(new Map<string, number>());
```

**New `recordOpen(sessionId)`**, added to `Result` with a doc comment. Its body, in this order:

1. Find the session in `sessionsRef.current`. If it isn't there, return.
2. Set `const activityAt = new Date().toISOString()`, and `commit` a copy with that session replaced by
   `{ ...session, activityAt }`.
3. Increment `opening.current` for the id.
4. Start, without awaiting, an async block:
   - `await creating.current.get(sessionId)`, so a create still in flight lands first and the open finds its
     row.
   - Then:

     ```ts
     withDeadline(WRITE_TIMEOUT_MS, (signal) =>
       authedFetch(
         `${ENDPOINT}/${encodeURIComponent(sessionId)}`,
         {
           method: 'PATCH',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ activityAt }),
           keepalive: true,
         },
         signal,
       ),
     )
     ```

   - The response isn't read: any status, 404 included, is the end of it.
   - `catch {}` with a comment: an open is best effort and never visible, so a failure is neither reported nor
     retried (BR-8).
   - `finally`: decrement the id's count in `opening.current`, and delete the entry at zero.
5. `useCallback` dependencies: `[authedFetch, commit]`.

**`recordOpen` must not reference `put`, `queue`, `confirmations`, `pending`, `fail` or `setFailures`.** That
is the whole of hazards 1 and 2. The open shows no "Saving…" and no leave prompt (AC-4.2), doesn't clear or
add a banner (AC-4.6), and can't tell Save to Breakdown "Saved" or "Not saved." (AC-4.4, AC-4.5).

**The load effect:** wrap the existing merge.

```ts
const after = keepOpenedActivity(
  mergeLoaded(/* unchanged arguments */),
  before,
  (id) => opening.current.has(id),
);
```

`revertedAny(…, before, after, sameSessionContent)` and everything after it are unchanged.

### `src/context/SessionsStoreContext.tsx`

- `createSession` adds `activityAt: null`. A new session sorts first by its `createdAt` (BR-16), and the tour's
  session is never an open (BR-14).
- Add to `SessionsStoreValue`:
  ```ts
  /** Moves a draft to the top of Home because the user opened it. Silent; see BR-8. */
  recordOpen: (sessionId: string) => void;
  ```
  Destructure it from `useServerSessions()`, pass it through as-is, and add it to the `useMemo` object and
  dependency list.

### `src/lib/demoSessions.ts`

Each built session gets `activityAt: null`. The seeder's PUT then stores `null`, so seeded drafts sort by the
fallback. No other change.

## 6. UI

No new element, label, style or CSS (AC-12.1, AC-12.4). Cards look exactly as today at every width.

- **`HomePage.tsx`:** replace the sort and its comment:
  ```ts
  // Most recently opened or changed first (see compareByRecentActivity).
  .sort(compareByRecentActivity)
  ```
  The DOM order is the visual order, so Tab follows it (AC-12.3).
- **`App.tsx`:**
  - Take `recordOpen` from `useSessionsStore()`.
  - Add a handler and pass it as `HomePage`'s `onOpenSession`:
    ```ts
    // A card picked on Home is the one deliberate open (section 4 of the
    // requirements). The tour's own navigation never records one (BR-14).
    const openFromHome = (sessionId: string) => {
      if (phase !== 'running') recordOpen(sessionId);
      openSession(sessionId);
    };
    ```
    `openSession` itself is unchanged, because "+ New Session" and the tour use it too. Both state updates
    happen in one click handler, so React renders them together: Home never shows the reorder before the
    workspace appears (AC-1.4).
  - `SessionWorkspace`'s `onBack` becomes:
    ```ts
    onBack={() => {
      // The session just used is now first on Home, so land where it is (AC-9.4).
      window.scrollTo(0, 0);
      setScreen({ kind: 'home' });
    }}
    ```
    The document is the scroller (there's no overflow container), and nothing sets `scroll-behavior`, so this
    is instant. It applies at every width (decision 3).
- **Phone (320, 375, 414px) and desktop (1280px):** the same one-column list in the same new order, with no
  layout change.
- **Unchanged:** `onClosed` (to History), History and the History detail.

## 7. Onboarding tour impact

No `data-tour` attribute moves, is renamed or is duplicated. `session-list` stays on the list `div` in
`HomePage`, and `new-session` stays on both of its existing buttons. Only the order of the cards inside
`session-list` changes. `steps.ts` and `OnboardingTour.tsx` are untouched, and every step still targets its own
screen.

How the tour stays out of the order:

- `tourNavigate` and the tour's "+ New Session" tap call `createSession` and `openSession`, never
  `openFromHome`. So the tour's session gets no open, and it has `activityAt: null`.
- If it's left untouched, `endTour` and the `tourCleanup` effect delete it as today (AC-8.4, AC-8.5). Its
  "untouched" check reads members, records and name, which this doesn't change.
- If it's named or filled in, that save stamps it, so it's kept and first (AC-8.6).
- `openFromHome` records nothing while `phase === 'running'` (AC-8.7).
- No request follows its delete, because there is no open to send (AC-8.8).

Run `steps.test.ts` and `targets.test.ts` (AC-8.10).

## 8. Test plan

The Vitest suite runs in `environment: 'node'` over `src/**/*.test.ts`, with no hook or component tests. Adding
them would need a new dependency (a DOM and React testing library), so the hook's wiring is verified by the
reviewer (R1 and R2) and the ui-ux-tester instead. Write each Vitest test before its code and watch it fail.

### Vitest

| File | Cases |
|---|---|
| `src/lib/activity.test.ts` **(new)** | **`parseActivityAt`:** an ISO string returns the same string; `'2026-11-03T18:00:00+08:00'` returns `'2026-11-03T10:00:00.000Z'`; `42`, `null`, `undefined`, `{}`, `''` and `'x'` return `null`; `'1969-12-31T23:59:59.000Z'` returns `null`. **`clampActivityAt`:** `null` returns `null`; a past time is unchanged; a time 2 days ahead of `now` returns `new Date(now).toISOString()`; a time equal to `now` is unchanged. **`sortTime`:** no activity and no records gives `createdAt`; no activity with records gives the latest record `createdAt`, not the first or last in array order; an activity later than every record gives the activity; an activity earlier than a record logged later gives the record (BR-5, AC-10.4); a record whose `date` is far in the future but whose `createdAt` is old doesn't count its date (Q1). **`compareByRecentActivity`:** a later sort time comes first; a session with an activity time and one without compare by sort time in one list (AC-10.2); equal sort times put the newer `createdAt` first; equal sort time and `createdAt` put `'session_a'` before `'session_b'`; sorting a 5-session fixture from two different starting permutations gives identical results (AC-5.4); never returns `NaN` for a session whose `createdAt` is `'x'`. **`keepOpenedActivity`:** an opening session whose local time is later keeps the local time and takes the merged members and records; an opening session whose server time is later or equal keeps the server copy (`toBe`); a session that isn't opening keeps the merged copy (`toBe`) even when the local time is later (AC-6.2); a local `null` keeps the merged copy; a merged session with no local copy is kept as-is. |
| `src/lib/writeQueue.test.ts` | Each fixture factory gains `activityAt: null`. New in `revertedAny and sameSessionContent`: `sameSessionContent` is true when only `activityAt` differs, and `check(['A'], [session('A', { activityAt: '2026-11-03T10:00:00.000Z' })], [session('A')])` is false (BR-12, AC-6.6). Every existing case passes unchanged. That covers the queue, coalescing, deletes waiting, confirmations, failures and `mergeLoaded` (PR #91 and PR #95). |
| `src/lib/sessionValidation.test.ts` | `parseSession`: an absent `activityAt` gives `null`; a valid ISO is kept; `'x'`, `42` and `true` give `null` and the session is still accepted; a time with an offset is normalised to UTC ISO. |
| `src/lib/storage.test.ts` | The round-trip literals gain `activityAt` (draft `'2026-09-12T09:30:00.000Z'`, closed `null`) and still round-trip equal; the v1 migration gives `activityAt: null`. |
| `src/lib/sessionName.test.ts`, `src/lib/sessionLabel.test.ts` | Each factory gains `activityAt: null`. No new cases. |
| `src/lib/saveMessage.test.ts`, `src/lib/apiImports.test.ts`, `src/components/onboarding/steps.test.ts`, `targets.test.ts` | Unchanged; must pass. |

### Reviewer checks (surgeon-reviewer)

- **R1.** `recordOpen` references none of `put`, `queue`, `confirmations`, `pending`, `fail` or `setFailures`
  (hazards 1 and 2, BR-8, BR-9).
- **R2.** `mutateSession` stamps only after the no-op check. The load effect wraps `mergeLoaded` in
  `keepOpenedActivity` and changes nothing else.
- **R3.** PATCH:
  - uses `getUserId`, `parseActivityInput` and `ownsSession`, in that order;
  - is an `update` scoped by `id` and `user_id`, with no insert;
  - uses `greatest` and `pool.sql`.
  The PUT uses `greatest(expense_sessions.activity_at, excluded.activity_at)`. `Allow` lists PATCH.

### ui-ux-tester walkthrough

Run on `http://localhost:3000`, at 375px first, then 1280px, then the layout checks at 320px and 414px.

**Ground rules:**
- Use only sessions named "UI test …". Opening a session now writes its activity time, so never open the owner's
  sessions.
- Never use "Seed Sessions (replace)".
- Watch DevTools Network. "The open" is the `PATCH /api/sessions/<id>` sent when a card is tapped. Local saves
  take 5 to 10 seconds, which works as a natural hold. Use "Offline", or block one session's URL, to make a
  request fail.

**Setup.** Create drafts "UI test A", "UI test B" and "UI test C", then arrange them into the order A, B, C by
opening C, then B, then A. Add one purchase to each with two members.

| # | Steps | ACs |
|---|---|---|
| T1 | Tap C, then Back: the order is C, A, B. Tap B, change nothing, Back: B, C, A, and B's content is unchanged. Tap B again: still B, C, A. Each tap sends one PATCH that returns 204. On every tap the workspace appears with no visible shuffle on Home first. | 1.1, 1.2, 1.3, 1.4 |
| T2 | On the second account from T18, with a single "UI test" draft: open it and Back; Home is unchanged and nothing errors. With two drafts there: open the second, Back, reload; the order is the same as before the reload. | 1.5, 1.6 |
| T3 | In a session that isn't first, do each of these in turn, then Back: it's first after each. Save to Breakdown; delete a purchase; delete an item; edit an item name, an item total and a member's Breakdown cell; rename; clear the name; add a member; remove a member who alone paid a purchase; clear all members. | 2.1 to 2.5 |
| T4 | No-op changes send no PUT and don't move the card: rename to the same name, add a duplicate member, commit an unchanged cell, a blank item name. | 2.6 |
| T5 | Three changes in one visit: first once, and the others keep their relative order. Change a session, then go Back while the PUT is still running: it's already first and doesn't move when the PUT returns. Finish a session: it leaves Home, and the others keep their order. | 2.7, 2.8, 2.9, 9.2 |
| T6 | Reload: same order. Open B in a second browser profile on the same account, wait for its PATCH, reload the first: B is first. Leave the first window on Home for 2 minutes: nothing moves. Add a purchase to A in profile 2, wait for "Saved to Breakdown.", reload profile 1: A is first. | 3.1 to 3.4, 9.3, 9.5 |
| T7 | No unsaved edits: tap a card. There's no "Saving…" anywhere, no banner, and the Save to Breakdown message is empty. Reload immediately: no "Leave site?" prompt. Then make an edit and, while its PUT runs, open another card: the leave prompt behaves as it would for the edit alone. | 4.1, 4.2, 4.3 |
| T8 | Click Save to Breakdown in A while its PUT runs, then Back, open B, Back, open A: the message is empty, and nothing appears when the first PUT lands. Repeat, and save a second purchase while the first PUT runs: "Saving…" stays until a save that carries the second purchase lands, then reads "Saved to Breakdown.". It never shows "Saved" early and never "Not saved.". | 4.4, 4.5 |
| T9 | Make a save fail so the banner shows, then open A and B: the banner and its text are unchanged. Go Offline and tap a card: the workspace opens at once, with no banner, message or error for 60 seconds. Go back online and reload: the card is where the server had it. | 4.6, 4.7, 4.8, 6.3 |
| T10 | Starting from A, B, C: open B, Back, open C, Back, within 2 seconds: C, B, A. Then open C, B, C as fast as possible: C, B, A on screen and after a reload. Repeat with B's PATCH slow (throttled): the screen order is right at once and doesn't change when it lands. | 5.1, 5.2, 5.3, 5.5 |
| T11 | Block B's PUT, edit B, Back: B is first, and the existing banner shows. Press "Try again": B's edit reverts, the existing note shows, and B sits by the server's time. Open C while its PATCH is slow, press "Try again" from inside C before the PATCH lands, then Back: C is still first, and no note appears. | 6.1, 6.2, 6.4, 6.6 |
| T12 | Throttle until a save times out at 30 seconds: B stays first until "Try again". Block `GET /api/sessions` and reload: the loading-timeout banner shows on an empty Home, as before. Unblock and press "Try again": the list loads in the saved order. | 6.5, 6.7 |
| T13 | From A, B, C: delete B, giving A, C. Delete A: C is first. Open a draft, Back, and delete it at once while its PATCH is slow: after a reload it's gone, with no error. Repeat with the PATCH blocked: the delete completes as usual. In profile 2, delete a draft; in profile 1 (not reloaded) open it: no error, then reload: it's gone. | 7.1 to 7.5 |
| T14 | "+ New Session", name it "UI test new", Create, Back: new, A, B, C. Cancel the prompt instead: nothing is created. An empty new session stays first. | 8.1, 8.2, 8.3 |
| T15 | Preview Tour, run to the end touching nothing: the list is as before, with no tour session, and a reload agrees. Repeat with Skip at each step. Repeat after naming the tour's session: it's kept and first, and the rest are in their old order. During the tour, Tab to a card and press Enter: no PATCH is sent. No request for the tour's session follows its delete. Every highlight lands where it did before. On a fresh account with no sessions, the tour ends on the empty state. | 8.4 to 8.10 |
| T16 | Open a closed session from History: no request is made. History's order is unchanged throughout. Finish a session: it appears in History at its finish time. | 11.1, 11.2, 11.3 |
| T17 | At 320, 375, 414 and 1280px: one column, cards identical to `main`, no new element. The trash icon, tap target and focus ring work as before, and Tab follows the new order. On a phone with 10 or more drafts, scroll down, open the last one, Back: Home is at the top with that session first. On desktop, the same Back also lands at the top. | 12.1 to 12.4, 9.1, 9.4 |
| T18 | Other accounts: sign in as a second account; its sessions are separate and its order is its own. | 3.6 |

### Fallback (sessions from before the feature)

`sortTime` and `compareByRecentActivity` in `activity.test.ts` are the primary cover for AC-3.5, AC-10.1 and
AC-10.2. A real-data check needs drafts that have never been opened or changed by the new build, and the new
build stamps any session it touches.

**Setup F.** Now, while UAT still runs the pre-feature build, the tester creates "UI test fallback 1", "UI
test fallback 2" and "UI test fallback 3" there. Give fallback 1 a purchase, wait a minute, then give fallback 2
a purchase. Leave fallback 3 empty.

**Check F.** When the new build first runs against that account (UAT, after the owner ships it), the tester
reloads Home without opening them. Fallback 3 sorts by its creation time and fallback 2 above fallback 1. No PUT
or PATCH is sent on load. Then open fallback 1: it's first.

| AC | Check |
|---|---|
| 3.5, 10.1, 10.2 | Unit tests above; Check F |
| 10.3 | Section 3 reasoning, reviewer check of the column lists; on sit, qat or uat before the ship, Home, open and save keep working once the column exists (smoke test by the tester) |
| 10.4 | `sortTime` BR-5 case |
| 10.5, 7.1a to 7.1c | The owner, on UAT after the ship: "Test" and "Bali Trip" are unchanged, nothing is sent on load, opening each moves it first, and History is unchanged |

### Checks before done

`npm run lint`, `npx tsc -b`, `npm test` and `npm run build`, with the real results reported.

## 9. Documentation impact

For the documentation-engineer, after this ships:

- **README, "Home — your sessions":** "newest first" becomes "most recently opened or changed first, on every
  device". Sessions from before the change are placed by their latest purchase, or by when they were started.
- **README, "Data and privacy" SQL block:** add `activity_at timestamptz -- last opened or changed; null until
  then`. The block is also missing `name text` from the session-names change, and the "Project layout" line for
  `api/` still says "GET/PUT one blob per account". Both are pre-existing; fix them only if asked.
- **The API reference,** wherever it's kept: the new `PATCH /api/sessions/:id`, and `activityAt` on GET and PUT.
- **`docs/mobile-breakpoints.md`:** nothing, since no CSS changes.

## 10. Tasks

1. **Schema, before touching any `api/` file.** Add the `alter table` to `schema.sql`, then run
   `npx vite-node scripts/db/apply-schema.ts` once and report its output.
   → Verify: it succeeds, a second run succeeds the same way, and Home still loads on `:3000`.
2. **Tests first.** Write `activity.test.ts` and the new cases in `writeQueue.test.ts`,
   `sessionValidation.test.ts` and `storage.test.ts`.
   → Verify: `npm test` fails on exactly those.
3. **Types and pure logic.**
   - `Session.activityAt`, `src/lib/activity.ts`, and the `storage.ts` changes.
   - `activityAt: null` in `demoSessions.ts`, in `createSession` and in the test factories.
   → Verify: `npm test` and `npx tsc -b` pass.
4. **API.** `parseActivityInput`; the PUT SQL and cap; PATCH; `Allow`; `loadSessions`.
   → Verify: `apiImports.test.ts` and `npx tsc -b` pass, and on `:3000` `GET /api/sessions` returns `activityAt`.
5. **Client state.** In `useServerSessions`: the `mutateSession` stamp, `opening`, `recordOpen`, and the load
   wrap. Then `recordOpen` in the store.
6. **UI.** The `HomePage` sort; `openFromHome` and the `onBack` scroll in `App`.
   → Verify: `steps.test.ts` and `targets.test.ts` pass.
7. **Full check.** `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`.
8. **Local preview.** On `http://localhost:3000` (already served by `vercel dev`; start `npm run dev:full`
   only if it isn't running), walk T1, T7 and T13 yourself, then hand over to the surgeon-reviewer and the
   ui-ux-tester.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| New API code runs before the column exists, so `GET` returns 500 on local and any preview | Task 1 runs before any `api/` edit; section 3 explains why. |
| An open disturbs saves: banner, confirmations or leave prompt | It's a separate path that shares nothing with `put` (R1). The tester covers it in T7 to T9. `writeQueue.test.ts` and `saveMessage.test.ts` pass unchanged. |
| A late open or save recreates a deleted session, or overwrites content | PATCH is an `update` with no insert, and carries no content. The PUT path is unchanged, still behind `queue.settled` before a delete (T13). |
| A stale or late request pulls a session down | `greatest` on the server; responses never change local state. |
| A phone clock set ahead pins a session first | The server caps at its own clock. |
| A phone clock set **behind** by minutes doesn't lift a touched session above ones touched elsewhere in that window | Accepted. Phone clocks are network-synced. Decision 2 explains the trade-off against server-only time. |
| A device clock set ahead also stamps its purchases' `createdAt` in the future (today's behaviour), and through the maximum rule that holds the session first until that time passes | Accepted. It needs a wrong clock *and* lasts only until that time. Not guarded, because the owner's rule includes purchase times. |
| Old builds on sit, qat or uat, or an old bundle in an open tab | Explicit column lists; a `null` from an old client never overwrites (section 3). |
| Testing writes to the owner's real sessions | Opening a session writes its activity time, so the tester opens only "UI test" sessions (section 8 ground rules). |

**Size: medium.** About 17 files, most with small changes. The care is in the hook's three changes and the two
SQL statements. **Risk: medium on the save path, low on data.** The schema change is additive only, and no
existing value is rewritten.

## 12. Decisions for the user

1. **Applying the schema change to Neon `main`.** *Recommendation:* approving this spec authorises the
   fullstack-developer to run `npx vite-node scripts/db/apply-schema.ts` once, as the first build task. It adds
   one nullable column and changes no data, the same as for the session name. The alternative is that you run
   it yourself before the build starts.
2. **Whose clock sets the activity time.** *Recommendation: the device's time, capped by the server's clock*
   (as specified).
   - *Pro:* the stored order is the order you touched things in, even when requests are slow or arrive out of
     order (AC-5.3, AC-5.5). What you see before a reload matches what you see after.
   - *Con:* a device whose clock runs slow by minutes records its activity that much in the past.
   - *Alternative: the server's clock alone.* Simpler by one function, and immune to device clocks. But the
     order becomes the order the requests *arrived*, so a slow open of B followed by a quick open of C could
     come back as B above C after a reload.
3. **Back from a session scrolls Home to the top at every width.** AC-9.4 asks for it on a phone. *Recommendation:*
   do it on desktop too, since it's the same list and the same need. Desktop's layout doesn't change, only where
   the page lands after Back. The alternative is to limit it to phones with `matchMedia('(max-width: 640px)')`.
4. **Assumptions A1 to A4** in section 1 stand unless you overrule them. None of them blocks the build.
