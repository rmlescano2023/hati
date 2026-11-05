# Spec: deleted sessions come back

Status: **draft, awaiting the owner's approval.** Branch `fix-deleted-sessions`, from `origin/main` at
`8b6b2ab` (includes PR #107). This is a bug fix, so it came to the tech lead directly rather than through
the business analyst. It ships on its own, separately from Collection.

## 1. Summary

While Collection was being tested on a second account, a session that had been deleted through History
came back later, with content from before the delete. The cause is on `main` as well as on `collection`:

- **`PUT /api/sessions/:id` is an upsert.** In `api/sessions/[id].ts:36-44` the handler refuses an id only
  when *another* account's row has it. A deleted id has no row at all, so it gets through, and the
  `insert … on conflict (id) do update` at `:54-68` inserts it again. Records are then re-inserted from the
  request body (`:72-83`).
- **A tab still showing the session sends that `PUT`.** The app loads sessions only on mount and on
  "Try again" (`src/hooks/useServerSessions.ts:202-254`), so a tab or device opened before the delete keeps
  the session on screen indefinitely. Any edit there (`mutateSession`, `:309-342`) saves the whole session,
  and the server creates it again. That tab shows the save as successful.
- **A save that timed out can commit after the delete.** `withDeadline` gives up on the request in the
  browser at 30 seconds, but the server keeps running it. `removeSession` stops waiting for the save at
  that point (`:397`) and sends the `DELETE`, and the late `PUT` then creates the session again.

The activity `PATCH` (`[id].ts:100-110`) is update-only and returns 404 for a missing session, so it is
already safe. Sessions aren't kept in browser storage, so a reload replays nothing.

**The fix, as the owner decided:**
1. A `PUT` only ever updates. A session that no longer exists, or isn't the caller's, is a 404. Only
   `POST /api/sessions` creates.
2. The client's save waits for the session's create if one is still in flight, and sends the create again
   if it failed. Today both cases rely on the `PUT` creating the row.
3. A 404 from a save shows **"This session was deleted on another device."** in the existing banner.
   "Try again" then removes the session from the screen, as it already does.

**Out of scope, as the owner decided:**
- **A stale tab overwriting newer edits.** A stale tab that saves still replaces the whole session, so it
  can bring back a member that another tab removed. Fixing that needs a version check on save. Follow-up.
- **The "Remember as my name" default.** It stays ticked.
- **Known gap ("path 3").** A create that times out in the browser but lands on the server after the
  session was deleted still leaves an empty draft behind. `POST` keeps `on conflict do nothing` and has no
  way to tell this case apart without a tombstone, which the owner declined. This needs a create slower
  than 30 seconds, followed by a delete within that time.

## 2. Layers touched

| Layer | File | Change |
|---|---|---|
| API | `api/sessions/[id].ts` | `PUT` becomes update-only, scoped by `user_id`, with a 404 when nothing was updated. The pre-check at `:36-44` and its `ensureUser` call go. |
| Client logic | `src/lib/writeQueue.ts` | Two small pure exports: `saveOnceCreated` and `saveFailedMessage`, plus the `DELETED_ELSEWHERE` message (section 5). |
| Client state | `src/hooks/useServerSessions.ts` | `put` uses `saveOnceCreated` and sends the create again after a failed one. A new `uncreated` ref records failed creates. The `addSession` comment is updated. |
| Tests | `src/lib/writeQueue.test.ts` | Unit tests for the two new exports. |
| Tests | `src/lib/sessionSaveApi.test.ts` (new) | Handler tests for `PUT` with a faked `pool` (section 8). |
| Docs | `README.md` | Covered by the documentation-engineer (section 9). |

**Unchanged:**
- types, schema, `api/_shared.ts`, `api/_validate.ts`, `api/sessions/index.ts` (`POST` still creates with
  `on conflict do nothing`);
- the `PATCH` and `DELETE` handlers;
- `SessionsStoreContext.tsx`, `AppDataContext.tsx`, `SyncBanner.tsx`, `App.tsx`, every component, the PDF
  and the tour;
- `replaceAll` (the dev seeder), which already sends `POST` then `PUT` in order.

**What to reuse:**
- `withDeadline`, `TimeoutError`, `WRITE_TIMEOUT_MS` and `authorisedFetch` from `src/lib/writeQueue.ts`;
- `creating` (`useServerSessions.ts:171`) as the record of creates in flight, waited on exactly the way
  `removeSession` (`:394`) and `recordOpen` (`:439`) already wait on it;
- the existing `fail` and `resolveFailure` calls, the `'save'` failure kind, and "Try again" (`retry`,
  `:518`).

## 3. Data model

None. No schema change, and no existing rows are touched.

## 4. API contract

### `PUT /api/sessions/:id` (changed)

- **Auth:** `getUserId`. Without a user it returns 401 (unchanged).
- **Request:** unchanged. The body is the whole session, validated by `parseSessionInput` in
  `api/_validate.ts`.
- **Behaviour:**
  - **Before:** it created the session when no row had the id.
  - **Now:** it only updates a row that has this id and belongs to the caller. It never inserts into
    `expense_sessions`.
- **Responses:**

| Status | When | Body |
|---|---|---|
| 200 | The caller's session was updated | The parsed session (unchanged) |
| 400 | No id in the path, or the body isn't a valid session | `{ error }` (unchanged) |
| 401 | Not signed in | `{ error: 'Not signed in.' }` (unchanged) |
| 404 | **No row with this id belongs to the caller.** This covers a session deleted elsewhere, an id that was never created, and another account's id. Nothing is written. | `{ error: 'No such session.' }` |
| 405 | Another method | unchanged |
| 500 | Auth misconfigured, or a database error | unchanged |

The 404 for another account's id is the same as today. Previously an id with no row at all got a 200 and a
new row.

`POST /api/sessions`, `PATCH` and `DELETE /api/sessions/:id`: unchanged.

## 5. Business logic

### Server: `api/sessions/[id].ts`, `PUT`

1. **Remove** lines 36-44: the `ensureUser` call, the `ownsSession` pre-check and the "first write" branch.
   - `ensureUser` existed so that an insert had a `users` row to reference. An update never inserts a
     session, so it isn't needed.
   - `ownsSession` stays imported, because `PATCH` and `DELETE` use it. `ensureUser` loses its only use in
     this file, so remove it from the import.
2. **Inside the existing transaction**, replace the upsert with an update scoped to the caller:

   ```ts
   const { rowCount } = await client.sql`
     update expense_sessions set
       status      = ${session.status},
       closed_at   = ${session.closedAt},
       members     = ${JSON.stringify(session.members)}::jsonb,
       name        = ${session.name},
       activity_at = greatest(activity_at, ${activityAt}::timestamptz)
     where id = ${sessionId} and user_id = ${userId}`;
   if (rowCount === 0) {
     await client.sql`rollback`;
     return res.status(404).json({ error: 'No such session.' });
   }
   ```

   - `created_at` isn't set, which matches what the upsert's `do update` set.
   - `greatest` keeps BR-7 from activity-order: the activity time only moves forward, and a null leaves it
     as it was.
   - Keep the existing activity comment, reworded so it no longer mentions the insert.
   - Add a comment explaining why this is an update: a save from a tab that still shows a deleted session
     must not create it again; only `POST /api/sessions` creates; and ownership is part of the `where`, so
     another account's id and a deleted one are both simply not found.
3. **Records are replaced as they are today** (`delete` then one `insert` per record), after the update and
   inside the same transaction.
   - The update locks the session row, so a concurrent `DELETE` either commits first, and this save finds
     no row and returns 404, or waits for this save to commit and deletes the session afterwards.
   - Either way the session ends deleted, so a save that timed out and commits late can no longer bring a
     session back.
4. **The handler and file comments** at `:6-13` still read correctly ("`PUT` replaces one session"). Leave
   them.

### Client: `src/lib/writeQueue.ts`

Add next to the other save rules:

```ts
/** What a save says when its session has gone from the server (404). */
export const DELETED_ELSEWHERE = 'This session was deleted on another device.';

/** The banner message for a save the server refused with `status`. */
export function saveFailedMessage(status: number): string {
  return status === 404 ? DELETED_ELSEWHERE : `Could not save your changes (${status}).`;
}

/**
 * Sends a save only once the session's row can exist. A save never creates a
 * session, so it waits for a create still in flight, and `send` is told to
 * create it first when that create failed. `createFailed` is read after the
 * wait, so a create that fails while the save waits is retried as well.
 */
export async function saveOnceCreated(
  created: Promise<unknown> | undefined,
  createFailed: () => boolean,
  send: (createFirst: boolean) => Promise<void>,
): Promise<void> {
  await created;
  await send(createFailed());
}
```

The doc comments above are the intent. The developer may reword them in the file's style.

### Client: `src/hooks/useServerSessions.ts`

1. **A new ref**, next to `creating` (`:171`):

   ```ts
   /**
    * Sessions whose create failed. A save never creates a session, so the next
    * save of one of these sends the create again first.
    */
   const uncreated = useRef(new Set<string>());
   ```

2. **`addSession`** (`:344-386`):
   - **In `catch`:** add `uncreated.current.add(session.id)` beside the existing `fail(...)`.
   - **Reword the catch comment** (`:366-367`): the failure is still filed as a save, because the next save
     of this session sends the create again before saving, and its success resolves this failure.
   - **On success:** nothing is added.
   - The existing `finally` that removes the id from `creating` stays.

3. **`put`** (`:265-298`). Keep `confirmations.sending(session.id)` first. The body of the `try` becomes:

   ```ts
   // The create has its own deadline, so only this save's own requests are timed.
   await saveOnceCreated(
     creating.current.get(session.id),
     () => uncreated.current.has(session.id),
     (createFirst) =>
       withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
         if (createFirst) {
           const created = await authedFetch(ENDPOINT, { method: 'POST', headers: …, body: JSON.stringify({ id: session.id, name: session.name }) }, signal);
           if (!created.ok) throw new Error(saveFailedMessage(created.status));
           uncreated.current.delete(session.id);
         }
         const res = await authedFetch(/* the existing PUT, unchanged */);
         if (!res.ok) throw new Error(saveFailedMessage(res.status));
       }),
   );
   ```

   - **Sending the create again is safe.** `POST` is `on conflict do nothing`, so if the "failed" create
     had in fact landed (it timed out, for example), the second one is a no-op 201.
   - **The id leaves `uncreated` as soon as the create succeeds**, even if the `PUT` after it fails, because
     the row now exists.
   - **The rest of `put` is unchanged:**
     - the success lines;
     - the `TimeoutError` and `queue.hasPending` handling, under which a refused copy with a newer one
       queued stays unreported, and the newer copy is refused too and reports the message;
     - `fail({ kind: 'save', … message: timedOut ? SAVE_TIMEOUT : messageOf(err, …) })`, which already shows
       the thrown message.
   - The create goes to `ENDPOINT` (`/api/sessions`), with the same headers and body as `addSession`'s
     `POST`.

4. **`removeSession`, `recordOpen`, `replaceAll`, `mutateSession`, the load effect and `retry` are
   unchanged.**
   - `removeSession` leaves `uncreated` alone. The session is gone from the list, so no save reads the id
     again.
   - The delete already waits for `creating`, then for `queue.settled`. A `put` waits only for `creating`,
     which never waits on the queue, so nothing waits on itself.

### What the user sees for a session deleted elsewhere

These steps use the existing flow and need no new UI.

1. In the stale tab, an edit shows on screen at once, as every edit does.
2. Its save returns 404, so the banner reads "This session was deleted on another device." with
   "Try again". Further edits there get the same message, which replaces the banner's existing message
   rather than adding another (`addFailure`).
3. "Try again" reloads.
   - The session isn't on the server and has no write in flight, so `mergeLoaded` drops it.
   - It was a failed session, so `revertedAny` sees that it disappeared, and the existing note
     "Some recent changes weren't saved. Showing your last saved version." follows.
   - If the user was inside that session, the workspace shows the existing "Session not found" empty state.
4. Nothing is written to the server at any point.

## 6. UI

No layout, style or component changes. The only visible difference is the banner's text after a refused
save, which is the same at phone and desktop widths, in the existing `SyncBanner`.

## 7. Onboarding tour impact

None. No `data-tour` target, step or screen changes.

The tour's session is affected in two ways:
- A rename made while its create is still in flight now waits for that create.
- `endTour`'s cleanup delete already waits for the create and the queue, as before.

## 8. Test plan

### Acceptance criteria (from the owner's decisions)

- **AC-1.** A `PUT` for a session that doesn't exist, or doesn't belong to the caller, returns 404 and
  writes nothing.
- **AC-2.** A `PUT` for the caller's own session updates it as before.
- **AC-3.** A session deleted in one tab stays deleted when another tab, still showing it, edits it.
- **AC-4.** The stale tab shows "This session was deleted on another device.", and "Try again" removes the
  session from its screen.
- **AC-5.** Creating a session and editing it straight away still saves, including when the create is slow.
- **AC-6.** A session whose create failed is created again by its next save, which then saves.
- **AC-7.** The tour's session cleanup and the dev seeder work as before.

### Vitest: `src/lib/sessionSaveApi.test.ts` (new; write first, watch the 404 test fail, then implement)

This is the first handler-level test in the repo. It lives in `src/lib/` because vitest's `include` is
`src/**/*.test.ts`. Don't put tests under `api/`: Vercel would deploy them as functions.

**The fake.** `vi.mock('../../api/_shared.js', …)` replaces `getUserId`, `ensureUser`, `ownsSession` and
`pool`.
- `pool.connect()` returns a fake client whose `sql` is a tagged-template `vi.fn`. It records each
  statement's text (strings joined, whitespace collapsed) and values.
- `sql` returns `{ rows: [], rowCount }`. `rowCount` is a per-test value for statements starting
  `update expense_sessions`, and 0 otherwise.
- The response is a small object whose `status` returns itself and records the code, with `json`, `end`
  and `setHeader`.
- The handler is imported from `../../api/sessions/[id]`. `_validate.js` and `activity.js` run for real.

| Test | Covers |
|---|---|
| A `PUT` for a session with no matching row (`rowCount` 0) returns 404 `{ error: 'No such session.' }`, issues `rollback`, and sends no `insert into expense_sessions` and no `purchase_records` statement. **Fails on today's code**, which returns 200 and inserts. | AC-1 |
| The update's values include both the session id and the signed-in user id, so ownership is in the `where`. | AC-1 |
| A `PUT` for an owned session (`rowCount` 1) returns 200 with the parsed session, deletes and re-inserts its records (one insert per record), and commits. | AC-2 |
| No statement anywhere in a `PUT` inserts into `expense_sessions`. | AC-1 |
| No user returns 401; a malformed body returns 400. Neither touches `pool`. | regression |

### Vitest: `src/lib/writeQueue.test.ts` (add; write first)

Use the file's existing `deferred()` helper.

`saveOnceCreated`
- With no create in flight (`undefined`), `send` is called at once with `false`.
- With a create in flight, `send` isn't called until the create settles.
- A create that succeeds while the save waits: `send(false)`.
- A create that fails while the save waits, so that `createFailed()` turns true during the wait:
  `send(true)`. This proves the flag is read after the wait.
- A rejection from `send` propagates, so `put`'s `catch` reports it.

`saveFailedMessage`
- `404` returns `DELETED_ELSEWHERE`, exactly "This session was deleted on another device."
- `500` returns "Could not save your changes (500)."

### ui-ux-tester walk-through, on local `vercel dev` from this worktree

Rules for this walk-through:
- Use only sessions named "UI test …".
- Desktop width first, then repeat checks 1 and 2 at 390px.
- Filter DevTools' Network panel to `/api/sessions`.

1. **Two tabs: the deleted session stays deleted (AC-3, AC-4).**
   - Open the app in tab A and tab B on the same account. Both show draft "UI test X" on Home.
   - In tab A, delete it and wait for the `DELETE` to return 204.
   - In tab B, without reloading, open "UI test X" and add a member.
   - Tab B's `PUT` returns 404, and the banner reads "This session was deleted on another device."
   - Add a second member: the banner keeps that one message.
   - Press "Try again": the workspace shows "Session not found", the session is gone from Home, and the
     "Some recent changes weren't saved" note shows.
   - Reload tab A: "UI test X" is still gone. `GET /api/sessions` doesn't list it.
   - Repeat with a finished session deleted from History in tab A, then open it from History in tab B.
     On `main` a finished session has nothing to edit, so this checks only that viewing it brings nothing
     back. A reload of tab A still doesn't list it.
2. **Create, then edit straight away, on slow dev (AC-5).**
   - Tap "+ New Session", name it "UI test fast", and add a member immediately, while the `POST` is still
     pending (local saves take 5 to 10 seconds).
   - In the Network panel, the `PUT` starts only after the `POST` has returned 201.
   - No banner appears.
   - Reload: the member is there.
3. **A failed create is created again by the next save (AC-6).**
   - Make the next `POST /api/sessions` fail. Use DevTools "Block request URL" for `/api/sessions` with
     method POST, or a `javascript_tool` override that returns a 500 for the first `POST` only.
   - Create "UI test retry". The banner shows the create failure.
   - Remove the block, then add a member.
   - The Network panel shows a `POST` followed by a `PUT`, both successful, and the banner clears.
   - Reload: "UI test retry" is there with its member.
4. **Tour cleanup (AC-7).**
   - Run the onboarding tour (dev "Preview Tour"). Create its session, rename it while its `POST` is still
     pending, and Skip.
   - A renamed session is kept, as before. Run the tour again without typing anything: its session is
     deleted, and stays deleted after a reload.
5. **Dev seeder (AC-7).**
   - On Home, use the dev sessions bar to load the demo sessions, then reload: they're all there with
     their records.
   - Clear them, then reload: they're gone.
   - Use this only on the test account; it replaces every session.
6. **Regression.**
   - An ordinary edit, rename, Finish and delete behave as before.
   - Stopping the API mid-save still shows the banner and the leave prompt.

### Checks before done

`npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, with real results.

`src/lib/sessionSaveApi.test.ts` imports from `api/`, which brings those files into the app's TypeScript
project. They use `@vercel/node` and `@clerk/backend`, which are installed, so `tsc -b` is expected to pass.
If it doesn't, stop and report rather than changing `tsconfig*.json` or the vitest config.

## 9. Documentation impact

For the documentation-engineer:
- **`README.md`, the paragraph "Writes are optimistic…" (near line 252).** Add:
  - a save only updates a session that still exists, and only creating a session makes one;
  - a session deleted on another device isn't brought back by a tab that still shows it; that tab says
    "This session was deleted on another device.", and "Try again" removes it.
- **Pre-existing and not caused by this change:** the README's project layout still describes `api/` as
  "GET/PUT one blob per account" (near line 264). Mention it; whether to fix it is the documentation
  engineer's call.

## 10. Tasks

1. **API test first.** Write `src/lib/sessionSaveApi.test.ts` (section 8) → verify: the 404 test fails
   against today's handler, and the others pass.
2. **Server.** Change `PUT` in `api/sessions/[id].ts` (section 5) → verify: every test in
   `sessionSaveApi.test.ts` passes.
3. **Unit tests.** Add the `saveOnceCreated` and `saveFailedMessage` tests to `src/lib/writeQueue.test.ts`
   → verify: they fail (not exported yet).
4. **Pure rules.** Add `DELETED_ELSEWHERE`, `saveFailedMessage` and `saveOnceCreated` to
   `src/lib/writeQueue.ts` → verify: the tests pass.
5. **Hook.**
   - Add `uncreated`.
   - Add to it in `addSession`'s `catch`, and update that comment.
   - Rewrite `put`'s request as in section 5.

   → verify: `npx tsc -b` passes and `npm test` is green.
6. **Checks.** Run `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`.
7. **Hand over** to surgeon-reviewer and the ui-ux-tester walk-through (section 8).

## 11. Risks and effort

| Risk | Guard |
|---|---|
| **A quick edit after creating a session returns 404**, because its `PUT` overtakes the `POST`. This is the main regression risk: today the upsert hides it. | `put` waits for `creating` through `saveOnceCreated`. Unit tests cover the ordering, and tester check 2 covers it on slow dev. |
| **A session whose create failed can never be saved.** | `uncreated` plus sending the create again first. Unit test, and tester check 3. |
| **A stale tab's edits are refused**, but its screen still shows them until "Try again". | That's the owner's chosen flow. The banner says why. |
| **The dev seeder** sends `POST` then `PUT` without checking the `POST`'s response, so if a `POST` fails, the `PUT` now gets a quiet 404 instead of creating the session. | Dev-only, and the seeder already ignores failed responses. Tester check 5. |
| **Path 3:** a create that times out and lands after a delete leaves an empty draft. | Known gap, accepted by the owner (section 1). |
| **A stale tab overwriting newer edits** (whole-session last write wins). | Out of scope. Follow-up: a version check on save. |
| **The first handler test** needs `vi.mock` of `api/_shared.js`, and imports `api/` into the app's TypeScript project. | Section 8 says to stop and report if `tsc -b` objects. No new dependency is needed. |

**Merging with Collection.** Collection will inherit the fix when it merges. Its `setMe` and Finish saves
then also get a 404 for a session deleted elsewhere, and its payments `POST` already returns 404 for one.
Expect these conflicts:
- **`api/sessions/[id].ts`, the `PUT` block (certain).** Collection adds the `me` column to the upsert, with
  `me = coalesce(excluded.me, expense_sessions.me)`, and a comment about payments. Resolve it to the
  update-only form here, plus `me = coalesce(${session.me}, me)` in the `set` list, and keep Collection's
  payments comment.
- **`src/hooks/useServerSessions.ts`, `put` (likely).** Collection adds lines on success
  (`settledDuringLoad.current.add`, `revertCandidates.current.delete`). Keep those lines and this spec's
  wait, create retry and message.
- **`addSession`'s `catch` (possible).**
- **`src/lib/writeQueue.ts` and `writeQueue.test.ts` (likely, trivial).** Collection adds exports and
  imports in the same places. Keep both sides.

**Effort:** small. About 20 lines on the server, about 25 in the hook and `writeQueue.ts`, and two test
files.

## 12. Decisions for the user

Already decided by the owner:
- update-only `PUT`, with no schema change;
- path 3 accepted as a known gap;
- the 404 message and the "Try again" flow;
- stale overwrites as a follow-up;
- the "Remember as my name" default unchanged;
- a separate branch from `main`.

Open:
1. **The note after "Try again".** Once "Try again" removes a session deleted elsewhere, the existing note
   "Some recent changes weren't saved. Showing your last saved version." also appears, because the stale
   tab's edits were indeed not saved. **Recommendation: keep it.** It's accurate and needs no change.
   Suppressing it only for this case would add a special case to `revertedAny`'s caller.
2. **Approval of this spec.**
