# Spec: save feedback, polish and History delete (round 3)

Status: **approved by the owner on 2026-11-02.** D1 and D2 are decided as recommended (section 12).

> **Amended 2026-11-02, by the owner's decision: the header "Saving…" cue is withdrawn.** The owner
> wants save feedback where the action happens, not in the header. The cue is removed at every width,
> along with what only it used: `src/lib/delayedFlag.ts` and its test, `sync.pending` in the store,
> `unconfirmed` in the hook, and the `'saving'` value of `SyncStatus`, which only `unconfirmed`
> produced and nothing read. In its place, the message beside Save to Breakdown reads "Saving…" on
> click and "Saved to Breakdown." only once the server confirms a save carrying that purchase, and
> clears on a reported failure or timeout (requirements:
> `/Users/rmlescano/.claude/jobs/12f7a81f/tmp/inline-saving-requirements.md`, branch
> `inline-saving-message`). The withdrawn parts are marked where they appear: the cue's rows in section
> 2, its parts of 5.A5, 5.A6, 6.A1, the `delayedFlag` tests and tester steps 1 to 6 in 8.A, the cue in
> section 9, task 6 in section 10, D2 in section 12, and AC-3.1 to AC-3.9. The leave warning (AC-3.10)
> stays, with the pending-writes counter that drives it. The rest of Branch A stands: the queue, the
> 30-second deadlines, per-session errors and the reverted-edit note.
>
> **Follow-ups the owner approved the same day, on the same branch** (requirements: the "Delta
> 2026-11-02 (a, b, c)" section of that file):
> - **(a)** After 10 seconds with no outcome, "Saving…" becomes "Still saving…", in the same muted style.
>   The 10 seconds run from the click, a new click restarts them, and leaving the tab cancels them.
> - **(b)** A reported failure or a timeout shows "Not saved." in error colour, rather than
>   clearing the message. Saved and Not saved are final, so a late landing never turns it into Saved.
>   When the banner clears without a reload (a later save succeeded), the message clears to empty (the
>   owner's answer to Q2).
> - **(c)** Save to Breakdown is never disabled. A click with something missing saves nothing and
>   names the first gap, checking items, then the date, then the payor. A missing date used to be
>   reported as "Choose who paid". Each validation message goes once its gap is filled, and a change
>   in the save state replaces it.
> - **Shorter wording** (the owner's answer to Q1), so every message fits two lines beside the button
>   at 320px and the row never grows: "Not saved.", "Add an item first.", "Pick a date." and
>   "Choose who paid." "Saving…", "Still saving…" and "Saved to Breakdown." are unchanged.
> - One always-mounted polite status region now carries every message, validation included.
>
> **Owner decisions after the UI re-test (2026-11-03):**
> - The failure message is "Not saved." rather than "Not saved — see above.", which wrapped to three
>   lines at 320px and grew the row. The banner above still explains the failure.
> - A quick second tap is quiet. While the latest save is still "Saving…" or "Still saving…", a click that
>   meets only the gaps the save's reset leaves (no items, the payor either way, the date kept) does
>   nothing, so "Saving…" stays visible. Every other click validates as before.

Branches, both from `origin/main` at `b153faa` and both carrying this spec:
- **Branch A, `save-feedback`:** #3 Saving cue, #4 reverted-edit note, #5 30-second timeout, and the
  owner's Q1 fix (errors tracked per failed write).
- **Branch B, `polish-and-history-delete`:** #1 dev loader 500, #6 delete wording, #7 card title width,
  #8 rename hint, #9 tour nudge, #10 loading cue, #11 delete closed sessions from History.

The two branches own disjoint files (section 2), so two developers can build them in parallel.

## 1. Summary

Inputs: the business-analyst's requirements
(`/Users/rmlescano/.claude/jobs/12f7a81f/tmp/round3-requirements.md`, every owner answer folded in, no
open questions) and the intake brief (`/Users/rmlescano/.claude/plans/snappy-greeting-corbato.md`). The
architect was skipped. Branch A extends `docs/specs/lost-edits-on-reload.md`, which shipped in `b153faa`.

**Branch A.** The hook stops keeping one global `status` and `error`. It keeps a list of failed writes
instead, keyed by kind and session, so one session's success can't clear another's error (Q1). It
exposes the pending-writes count as state for a header "Saving…" cue. Every save, create, delete and
load runs under a 30-second deadline that aborts the request and never sends late. After "Try again", it
compares the screen before and after the reload for the sessions whose writes failed, and shows a
one-line note when something was rolled back. No API, schema or type change.

**Branch B.** #1 is a dev-tooling bug, now confirmed (section 5.B1). #6 and #11 share one wording
function. #11 puts Home's trash and confirmation on History cards and uses the existing `DELETE`. #8, #9
and #10 are presentation only. For #7 the code shows no layout defect (section 5.B3), so the owner
decides whether anything changes (section 12, D1).

Requirements this replaces: `docs/specs/session-names.md` AC-1.10 says History cards have no trash, and
its "Not touched" list names `HistoryPage.tsx`. #11 supersedes both. A note to that effect is added
under AC-1.10 in that spec in the same commit as this one.

## 2. Layers touched

### Branch A (`save-feedback`) owns

| Layer | File | Change | Reuse |
|---|---|---|---|
| Client logic | `src/lib/writeQueue.ts` | Adds `WRITE_TIMEOUT_MS`, `TimeoutError`, `withDeadline`, `authorisedFetch`, the failure-list helpers, `revertedAny` and `sameSessionContent` (5.A1 to 5.A4). The three existing exports don't change. | existing module and its "pure, no React" rule |
| Client logic | `src/lib/delayedFlag.ts` (new) | `createDelayedFlag`, the cue's 400 ms show / 600 ms hold timing (5.A6) | none |
| Client state | `src/hooks/useServerSessions.ts` | Failure list instead of `status`/`error` state, `loading` state, `unconfirmed` state, `reverted` state, deadlines on every request, Try again rules (5.A5) | `createSaveQueue`, `createPendingWrites`, `mergeLoaded`, `commit`, `readJson` |
| Client state | `src/context/SessionsStoreContext.tsx` | `sync` gains `pending`, `reverted` and `dismissReverted`, and passes them through | existing `sync` object and memo |
| UI | `src/components/layout/Header.tsx`, `Header.module.css` | Saving cue (6.A1) | `useSessionsStore` |
| UI | `src/components/layout/SyncBanner.tsx`, `SyncBanner.module.css` | Reverted-edit note in the banner's slot (6.A2) | `Button`, `.banner` layout |
| Tests | `src/lib/writeQueue.test.ts`, `src/lib/delayedFlag.test.ts` (new) | section 8.A | existing `deferred`/`flush` helpers |

> **Withdrawn 2026-11-02:** the `delayedFlag.ts` and `delayedFlag.test.ts` rows, the `Header.*` row, `unconfirmed` in
> the hook's row and `pending` in the store's row. They existed only for the header cue.

### Branch B (`polish-and-history-delete`) owns

| Layer | File | Change | Reuse |
|---|---|---|---|
| Client logic | `src/lib/sessionLabel.ts` | New `deleteSessionMessage(session)` (5.B2) | `sessionDisplayTitle`, `pluralize` |
| Dev tooling | `src/lib/demoData.ts` | Fresh record ids on every call (5.B1) | `createId` from `src/lib/id.ts` |
| UI | `src/pages/HomePage.tsx` | Uses `deleteSessionMessage` | existing dialog |
| UI | `src/pages/HistoryPage.tsx` | Trash on cards and the delete confirmation (6.B5) | `SessionCard`'s `onDelete`, `ConfirmDialog`, `deleteSession`, Home's lookup by id |
| UI | `src/components/sessions/SessionCard.module.css` | **Only if the owner picks D1 option (b)** | none |
| UI | `src/components/layout/SessionWorkspace.tsx`, `.module.css` | Rename hint (6.B2) | `SessionNameInput` |
| UI | `src/components/sessions/SessionNameInput.tsx` | `enterKeyHint="done"`, optional `describedBy` prop | none |
| UI | `src/App.tsx` (the `loading` early return only), `src/App.module.css` | Loading spinner (6.B3) | `.loading` |
| Tour | `src/components/onboarding/OnboardingTour.tsx`, `OnboardingTour.module.css` (new) | Tab-tap nudge (6.B4) | `TOUR_STEPS` |
| Tests | `src/lib/sessionLabel.test.ts`, `src/lib/demoData.test.ts` (new) | section 8.B | existing `session`/`record` builders |

**No file is in both lists.** Branch A doesn't touch `App.tsx`: the first-load timeout leaves the
Loading screen through the existing `sync.status === 'loading'` check, because the status stops being
`'loading'` once the load fails. So the #10 spinner (B) and the load timeout (A) don't need sequencing.

**Not touched by either branch:** `src/types/index.ts`, `scripts/db/schema.sql`, every file in `api/`,
`steps.ts`, `targets.test.ts`, `steps.test.ts`, `NavTabs`, `SessionTabs`, `SessionCard.tsx` (its trash
and `onDelete` already exist), `icons.tsx` (no new SVG; #11 reuses the card's existing `TrashIcon`),
`HistoryDetailPage.tsx`, `src/pdf/`, `DevDataBar.tsx`, `DevSessionsBar.tsx`, `demoSessions.ts`.

## 3. Data model

None. No schema change, and no stored data is migrated or rewritten. #11 deletes rows through the
existing `DELETE /api/sessions/:id`. `purchase_records` rows go with the session through the existing
`on delete cascade`.

## 4. API contract

None. No route, request or response changes. The client now aborts a request after 30 seconds (an
`AbortSignal` on `fetch`), which the server doesn't see. #1 found an API weakness, flagged in D3 with
no change proposed.

## 5. Business logic

No money logic changes in either branch.

### Branch A

#### 5.A1 Deadline: `src/lib/writeQueue.ts`

```ts
export const WRITE_TIMEOUT_MS = 30_000;

export class TimeoutError extends Error {
  constructor() {
    super('The server took too long to answer.');
    this.name = 'TimeoutError';
  }
}

/** Runs one server operation, abandoning it at `ms`. */
export function withDeadline<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T>;
```

- It creates an `AbortController` and races `work(controller.signal)` against a timer.
- **At `ms`:** it rejects with `new TimeoutError()` first and only then calls `controller.abort()`. In
  that order the race always settles with `TimeoutError`, never with the `AbortError` the aborted `fetch`
  throws.
- **When `work` settles first:** it clears the timer (`finally`) and settles the same way `work` did.
- **After the deadline:** anything `work` resolves or rejects with is ignored. `Promise.race` has
  already attached a handler to it, so a late rejection is never unhandled.
- **Late timers:** a backgrounded or sleeping tab fires the timer late, and the first check on waking
  counts as expired. Nothing else is needed for that.

```ts
/**
 * Sends one request with the user's token. A token that only arrives after `signal` has aborted sends
 * nothing: the attempt has already been reported as failed, and a late write could undo a newer one.
 */
export async function authorisedFetch(
  getToken: () => Promise<string | null>,
  send: typeof fetch,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response>;
```

The steps, in order:
1. `const token = await getToken()`.
2. `if (signal?.aborted) throw new TimeoutError()`.
3. `if (!token) throw new Error('Not signed in.')`.
4. `return send(path, { ...init, signal, headers: { ...init.headers, Authorization: `Bearer ${token}` } })`.

`send` is a parameter so the module stays free of `fetch`, and the test can pass a mock. The hook
passes `fetch`.

#### 5.A2 Failures: `src/lib/writeQueue.ts`

```ts
export type FailureKind = 'save' | 'delete' | 'load' | 'seed';
export type Failure = { kind: FailureKind; sessionId: string | null; message: string };

/** Adds `next`, replacing any failure with the same kind and session, so it becomes the most recent. */
export function addFailure(list: readonly Failure[], next: Failure): Failure[];
/** Removes the failure with this kind and session. Returns `list` itself when there is none. */
export function resolveFailure(
  list: readonly Failure[], kind: FailureKind, sessionId: string | null,
): readonly Failure[];
/** The sessions whose save, create or delete failed, for the reverted-edit note. */
export function failedSessionIds(list: readonly Failure[]): string[];
```

The kinds:
- `'save'` covers both a failed save and a failed create of session S. A later successful save of S
  resolves either one, because the upsert creates the row (BR-A5).
- `'delete'` is resolved only by "Try again".
- `'load'` and `'seed'` have a null `sessionId`. `'seed'` is the dev-only `replaceAll`.
- Most recent last: the banner shows the last entry's `message`.
- `resolveFailure` returns the same reference when nothing matched, so the React state setter skips a
  re-render.

#### 5.A3 Reverted-edit test: `src/lib/writeQueue.ts`

```ts
/**
 * Whether a reload visibly replaced anything whose write had failed: a failed session's copy changed,
 * disappeared (a create that never landed) or reappeared (a delete that never landed).
 */
export function revertedAny<S extends { id: string }>(
  failedIds: Iterable<string>, before: S[], after: S[], same: (a: S, b: S) => boolean,
): boolean;
```

For each id, take `b` from `before` and `a` from `after`:
- it's reverted if exactly one of them exists;
- it's reverted if both exist and `!same(b, a)`;
- it's not reverted if neither exists.

`before` is `sessionsRef.current` just before the load commits. `after` is the `mergeLoaded` result. So
a failed session that has a newer save in flight, which `mergeLoaded` keeps on screen, never counts.

```ts
/** Whether two copies of a session show the user the same thing. */
export function sameSessionContent(a: Session, b: Session): boolean;
```

It compares `name`, `status`, `members` and `records`. Records are matched by `id`, with each record's
`createdAt` dropped and the list sorted by `id`. A private `deepEqual` (primitives with `===`, arrays in
order, plain objects ignoring key order) does the comparison.

It ignores the session's `createdAt` and `closedAt`, record `createdAt`, record order and object key
order. Those all differ between the screen and the server even when the save landed:
- A POST-created row's `created_at` is the server's `now()`, not the client's timestamp, and a PUT
  never updates it.
- `GET` orders records by date.
- `jsonb` reorders keys.

A false note would break AC-4.5. Nothing is lost by ignoring these fields: closing a session also
changes `status`, and adding a record adds an id.

#### 5.A4 The timeout messages (constants in `useServerSessions.ts`)

- Save or create: `Saving is taking too long. Check your connection, then try again.`
- Delete: `Deleting is taking too long. Check your connection, then try again.`
- Load: `Loading is taking too long. Check your connection, then try again.`

Every other error message stays exactly as it is today.

#### 5.A5 `src/hooks/useServerSessions.ts`

Everything from the lost-edits spec stays: `commit`, `sessionsRef`, `queue`, `pending`, `creating`,
`deleting`, the leave prompt, `mergeLoaded`, and the delete waiting on the create and the queue.

**State.** Remove the `status` and `error` state and their setters. Add:
- `loading` (initially `true`)
- `failures: readonly Failure[]` (initially `[]`)
- `unconfirmed` (initially `false`)
- `reverted` (initially `false`)
- `revertCandidates = useRef(new Set<string>())`

`pending`'s `onChange` keeps adding and removing the leave-prompt listener, and also calls
`setUnconfirmed(busy)`. Declare `unconfirmed` before `pending`.

**Derived, returned to callers:**
```ts
const status: SyncStatus =
  loading ? 'loading' : failures.length > 0 ? 'error' : unconfirmed ? 'saving' : 'ready';
const error = failures.length > 0 ? failures[failures.length - 1].message : null;
```
`SyncStatus` keeps its four values, so `App.tsx` and the existing `SyncBanner` check still work.

> **Withdrawn 2026-11-02:** the `unconfirmed` state, its `setUnconfirmed(busy)` call in `pending`'s `onChange`, its
> place in `status`, the `'saving'` value of `SyncStatus`, `unconfirmed` in `Result`, and `pending` in
> the store's `sync`. `status` is now `loading ? 'loading' : failures.length > 0 ? 'error' : 'ready'`.
> The leave prompt is unchanged.

**`fail(failure)`**, one callback: `setFailures((f) => addFailure(f, failure)); setReverted(false);`. A
new error replaces the note (AC-4.6). The updater is pure, so StrictMode running it twice is harmless.

**`authedFetch(path, init, signal?)`** becomes `authorisedFetch(() => getToken(), fetch, path, init, signal)`.

**`put(session)`.** It still never rejects.
```ts
try {
  await withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
    const res = await authedFetch(url, { method: 'PUT', headers, body }, signal);
    if (!res.ok) throw new Error(`Could not save your changes (${res.status}).`);
  });
  setFailures((f) => resolveFailure(f, 'save', session.id));
} catch (err) {
  const timedOut = err instanceof TimeoutError;
  // A newer queued copy is about to be sent and will report for itself.
  if (!timedOut && queue.hasPending(session.id)) return;
  fail({ kind: 'save', sessionId: session.id,
         message: timedOut ? SAVE_TIMEOUT : messageOf(err, 'Could not save your changes.') });
}
```

- **A success always resolves S**, even with a newer copy pending. That copy holds every earlier edit,
  so S's earlier failure is now covered (BR-A5). Today's code returned early in that case.
- **A plain failure with a newer copy pending** stays unreported, as today.
- **A timeout is always reported** (BR-5.1, "abandoned and reported"). Then the queue sends the pending
  copy as a fresh attempt, and if that succeeds the failure clears. This puts the banner up at 30
  seconds even when the user kept editing.
- `messageOf(err, fallback)` is a small private helper:
  `err instanceof Error ? err.message : fallback`. Today's catch blocks repeat it.

**`enqueueSave`.** Remove `setStatus('saving')`. The cue follows `unconfirmed` now.

**`addSession`.**
- Wrap the POST in `withDeadline`.
- On failure:
  `fail({ kind: 'save', sessionId: session.id, message: timedOut ? SAVE_TIMEOUT : messageOf(err, 'Could not create the session.') })`.
- A successful create resolves nothing.
- `creating.current.delete` stays in `finally`. Because the deadline settles the create at 30 seconds,
  a delete waiting on a stuck create goes ahead then (BR-5.5).

**`removeSession`.**
- The waits are unchanged.
- The DELETE request alone goes inside `withDeadline`. The waits aren't the delete's attempt.
- On failure:
  `fail({ kind: 'delete', sessionId, message: timedOut ? DELETE_TIMEOUT : messageOf(err, 'Could not delete the session.') })`.

**`replaceAll`** (dev-only).
- Remove both `setStatus` calls and the `setError(null)`.
- On success: `setFailures((f) => resolveFailure(f, 'seed', null))`.
- On failure: `fail({ kind: 'seed', sessionId: null, message: messageOf(err, 'Could not seed sessions.') })`.
- Its requests get no deadline, because the requirement covers user writes. It keeps calling
  `authedFetch` without a signal.

**Load effect.**
1. Replace `setStatus('loading'); setError(null);` with `setLoading(true)`.
2. Run the GET and the `readJson` inside `withDeadline`.
3. On success, unless `cancelled`:
   ```ts
   const before = sessionsRef.current;
   const after = mergeLoaded(server, before, isUnconfirmed, isDeleting); // as today
   const rolledBack = revertedAny(revertCandidates.current, before, after, sameSessionContent);
   revertCandidates.current = new Set();
   commit(after);
   setFailures((f) => resolveFailure(f, 'load', null));
   if (rolledBack) setReverted(true);
   setLoading(false);
   ```
4. On failure, unless `cancelled`:
   `fail({ kind: 'load', sessionId: null, message: timedOut ? LOAD_TIMEOUT : messageOf(err, 'Could not load your data.') })`,
   then `setLoading(false)`.
5. The sessions on screen are left as they are, which is BR-5.6. They're empty after a failed first load.
6. The dependency list stays the same.

**`retry`.**
```ts
const retry = useCallback(() => {
  for (const id of failedSessionIds(failures)) revertCandidates.current.add(id);
  setFailures([]);
  setReverted(false);
  setReloads((n) => n + 1);
}, [failures]);
```
- Candidates build up until a load succeeds. So a retry whose load fails again still shows the note on
  the next successful retry, if the screen is then rolled back.
- A load failure with no failed writes adds no candidates, so it never shows a note (AC-4.4).
- Pressing it twice quickly: the effect's cleanup cancels the first load (existing `cancelled` flag).

**`dismissReverted`** is `useCallback(() => setReverted(false), [])`.

**`Result`** gains `unconfirmed: boolean`, `reverted: boolean` and `dismissReverted: () => void`, each
with a one-line doc comment. The existing comments that describe the global status (the `put` comment
about "leaves the status alone") are updated to describe the per-session rule.

**`SessionsStoreContext.tsx`.**
- The `sync` type becomes:
  `{ status; error; retry; pending: boolean; reverted: boolean; dismissReverted: () => void }`
- Inside the provider, `pending` is the hook's `unconfirmed`. The provider already uses `pending` as a
  name for something else, which is why the hook's field is `unconfirmed`.
- Add the three new values to the memo's dependency list.

#### 5.A6 Cue timing: `src/lib/delayedFlag.ts` (new)

> **Withdrawn 2026-11-02:** this whole section. The file and its test are removed with the header cue.

```ts
/**
 * A flag that turns on only once `input` has been on for `showAfter` ms, and once on stays on for at
 * least `minOn` ms, so a fast save never flashes it and a slow one never flickers.
 */
export function createDelayedFlag(
  showAfter: number, minOn: number, onChange: (on: boolean) => void,
): { set(input: boolean): void; dispose(): void };
```

It keeps `on`, `onSince` (from `Date.now()`) and a single `timer`. `set(input)` first clears any timer,
then:
- **Input on, flag off:** after `showAfter`, set `on = true`, `onSince = Date.now()` and call
  `onChange(true)`.
- **Input off, flag on:** after `max(0, minOn - (Date.now() - onSince))`, set `on = false` and call
  `onChange(false)`.
- **Otherwise:** nothing is scheduled. If the input comes back on during the hold, the hide is
  cancelled and the flag stays on, with no extra `onChange`.

`dispose()` clears the timer, and the flag still works after it, which StrictMode's remount needs.
`onChange` is never called twice in a row with the same value. The hook passes `showAfter = 400` and
`minOn = 600`.

### Branch B

#### 5.B1 #1 Dev loader 500: confirmed cause and fix

- **Cause.** `DevDataBar` calls `replaceData(buildDemoData(…))`, which becomes `replaceSessionData`,
  then `mutateSession`, then a `PUT`. `buildDemoData` (`src/lib/demoData.ts:113` and `:129`) always
  gives the records the fixed ids `demo_rec_0` to `demo_rec_4` and `demo_rec_merge`.
  `purchase_records.id` is a primary key across the whole table, not per session
  (`schema.sql:33`).
- **What the handler does.** `api/sessions/[id].ts` deletes only this session's records (line 63) and
  then inserts the new ones. Once any other session holds those ids, in any account, the insert fails
  with a unique violation. The database is the shared Neon `main`, used by local, sit, qat and uat. The
  handler rolls back and rethrows (lines 76 to 78), and the uncaught error is Vercel's
  `FUNCTION_INVOCATION_FAILED` 500.
- **Why only these two buttons.** Loading twice into the same session works, because its own rows are
  deleted first. The Seed Sessions buttons don't fail, because `demoSessions.ts` `shiftDates` already
  re-mints every record id with `createId('rec')`.
- **Verification.** I confirmed this from the code. I didn't query the database, per the task's rules.
- **Fix, in dev tooling only.** In `buildDemoData`, replace the two fixed record ids with
  `createId('rec')`, imported from `./id`. Item ids (`demo_item_*`) stay: they live inside the
  `items` `jsonb` and have no constraint.
- **Comments.** Update the PRNG's doc comment from "identical every time" to say the values are
  identical every time but record ids are fresh, because record ids must be unique across the whole
  database.
- `DevDataBar` and `demoSessions` don't change. `demoSessions`' own re-mint becomes redundant but
  harmless, and is left alone (surgical).
- Both stay behind `import.meta.env.DEV` as today.

#### 5.B2 Delete wording (#6, #11): `src/lib/sessionLabel.ts`

```ts
/** The delete confirmation's message, shared by Home and History so both say the same thing. */
export function deleteSessionMessage(session: Session): string;
```

Here `n` is `session.records.length`, `m` is `session.members.length`, and `title` is
`sessionDisplayTitle(session)`.

| Case | Message |
|---|---|
| `n ≥ 1`, draft | `“${title}” and its ${pluralize(n, 'purchase')} will be deleted. This cannot be undone.` (unchanged) |
| `n ≥ 1`, closed | `“${title}” and its ${pluralize(n, 'purchase')} will be deleted, and its statement can no longer be downloaded. This cannot be undone.` |
| `n = 0`, `m ≥ 1`, named | `“${session.name}” has ${pluralize(m, 'member')} but no purchases yet. Deleting it cannot be undone.` |
| `n = 0`, `m ≥ 1`, unnamed | `This session has ${pluralize(m, 'member')} but no purchases yet. Deleting it cannot be undone.` |
| `n = 0`, `m = 0`, named | `“${session.name}” is empty. Deleting it cannot be undone.` (unchanged) |
| `n = 0`, `m = 0`, unnamed | `This session is empty. Deleting it cannot be undone.` (unchanged) |

- Use the curly quotes `“ ”` exactly as today's `HomePage` does.
- **Assumption: a closed session with no purchases** (legacy data only, because `closeSession` refuses
  an empty session) uses the `n = 0` rows, with no statement clause.
  - `ExportSoaButton` is disabled when there are no records, so there's no statement to lose.
  - This matches the requirement's "same table for any session shape" (BR-11.4).

#### 5.B3 #7 Card title width: confirmed cause

There's no layout defect. The title column already ends exactly at the 12px gap before the total, at
every width. The tester's numbers come out exactly from the current CSS once a classic (non-overlay)
scrollbar of 15px is taken off the window:

| Window | Page width (`clientWidth`) | − page gutters (`PageShell`, 2 × 16px) | − card padding and border (2 × 18 + 2 × 1px) | − gap (12px) − total (≈45px¹) | Title column |
|---|---|---|---|---|---|
| 320 | **305**, the tester's "content width" | 273 | 235 | 178 | **178**, measured ≈178 |
| 375 | 360 | 328 | 290 | 233 | **233**, measured ≈233 |

¹ "₱0.00" at DM Mono 15px: "0.00" is 36.0px by the font's own metrics (`fontkit` on
`public/fonts/DMMono-Medium.ttf`). The ₱ comes from the fallback font, because DM Mono has no U+20B1
glyph (`format.ts` notes this too), at about 9px.

- **The "unused" 65px.** It's the 70px of page gutters and card padding that the measurement didn't
  subtract from the 305px.
- **The flex rules work.** `.titles` (`flex: 1 1 auto; min-width: 0`) takes all the remaining space.
  It tracks the viewport one-for-one, which a cap would not.
- **On a real 320px phone** (overlay scrollbars) the column is about 193px.
- **What still reads as "stops short".** A wrapped title breaks at word boundaries, so a line can end up
  to one word's width before the column's edge. That's normal text wrapping.
- AC-7.2 to AC-7.6 already hold in the code: the total is `white-space: nowrap; flex: none`, the
  title has `overflow-wrap: anywhere`, and `.count` reserves 32px for the trash.
- Whether to change anything is D1. Option (b) is specified in 6.B1 so it can be built if chosen.

## 6. UI

### Branch A

#### 6.A1 Saving cue (`Header.tsx`, `Header.module.css`)

> **Withdrawn 2026-11-02:** this whole section. The header has no cue and no live region at any width. Save
> feedback is the inline message beside Save to Breakdown instead.

```tsx
const { sync } = useSessionsStore();
const [cue, setCue] = useState(false);
const [flag] = useState(() => createDelayedFlag(400, 600, setCue));
useEffect(() => flag.set(sync.pending), [flag, sync.pending]);
useEffect(() => () => flag.dispose(), [flag]);
// One status at a time: the error banner, then the reverted note, then this (BR-A4).
const showCue = cue && sync.status !== 'error' && !sync.reverted;
```

- **Markup.** Between `.titles` and `<UserButton>`:
  `<span className={styles.status} role="status">{showCue && <span className={styles.saving}><span className={styles.dot} aria-hidden="true" />Saving…</span>}</span>`
- **Why the outer span is always there.** The polite live region stays mounted and only its text
  changes, so it's announced once when it appears and not on every save (AC-3.9).
- **Styles, all widths:**
  - `.status { flex: none; font-size: 12px; color: var(--text3); }`
  - `.saving { display: flex; align-items: center; gap: 6px; white-space: nowrap; }`
  - `.dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: pulse 1.2s ease-in-out infinite; }`
  - `@keyframes pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }`
  - `@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }`
- **Desktop (≥641px).** In the row, just left of the account button, as the requirement asks.
  - At 641px the title block still has more than 400px, and the subtitle (13px, 292px) stays on one
    line.
  - Nothing moves when the cue appears.
  - The empty span adds one 12px flex gap that nobody sees, because `.titles` keeps `margin-right: auto`.
- **Phone (`@media (max-width: 640px)`)**, which is D2:
  - `.header { position: relative; }`
  - `.status { position: absolute; top: 8px; right: 0; }`: right-aligned in the header's existing
    32px top padding, directly above the account button.
  - `.dot { display: none; }`: text-only, 12px.
- **Why the phone placement differs.** Measured with DM Sans' metrics, the subtitle is 270px at 12px.
  - Today it fits on one line from about 396px wide upwards.
  - With the cue in the row, the title block loses about 55px, and it would need about 451px for one
    line.
  - So on 396 to 451px phones (412px Android, 414 to 430px iPhones) the subtitle would wrap to a second
    line when the cue appeared, the header would grow 17px, and the page would jump. That breaks AC-3.8.
  - Absolute positioning takes no space, so nothing reflows at any width.
  - It doesn't touch the bottom edge, the banner's slot or the tab bar.
- **During the tour** the cue is under the Joyride overlay. It isn't a tour target.

#### 6.A2 Reverted-edit note (`SyncBanner.tsx`, `SyncBanner.module.css`)

- `status === 'error'`: the existing banner, unchanged (`role="alert"`, "Try again").
- Else, when `sync.reverted` is true:
  ```tsx
  <div className={`${styles.banner} ${styles.note}`} role="status">
    <span className={styles.noteMessage}>{"Some recent changes weren't saved. Showing your last saved version."}</span>
    <Button size="sm" variant="ghost" onClick={sync.dismissReverted}>Dismiss</Button>
  </div>
  ```
  - The button's visible "Dismiss" is its accessible name, so it needs no separate `aria-label`.
- Otherwise it renders `null`.
- **Styles.** `.note { border-color: var(--border); background: var(--surface2); }`, placed after
  `.banner`, and `.noteMessage { font-size: 12px; color: var(--text2); margin-right: auto; }`.
- `.banner` already wraps (`flex-wrap: wrap`), so at 320px the message wraps and the button drops
  under it with no horizontal scroll (AC-4.7). Desktop shows one line.

### Branch B

#### 6.B1 #7 (only if the owner chooses D1 option (b))

In `SessionCard.module.css`, add at the end:
```css
@media (max-width: 640px) {
  /* Narrow phones: 4px more on each side goes to the title. */
  .card { padding: 16px 14px; }
}
```
- The title column gains 8px: 186px instead of 178px in the tester's 320 window, and about 201px on a
  real 320px phone.
- The trash (`right: 12px`, 25px wide) still clears the count's text, which ends 46px from the edge.
- Desktop doesn't change.
- With option (a), this file isn't touched.

#### 6.B2 #8 Rename hint (`SessionWorkspace.tsx`, `.module.css`, `SessionNameInput.tsx`)

- **`SessionNameInput`.** Add an optional `describedBy?: string` prop, rendered as `aria-describedby`.
  Add `enterKeyHint="done"` to the input, so phone keyboards label the return key "Done". It's a
  standard HTML attribute, typed by `@types/react`, and needs no dependency. Behaviour is otherwise
  unchanged (AC-8.4).
- **`SessionWorkspace`.** While `renaming`, wrap the input:
  ```tsx
  <span className={styles.renameBox}>
    <SessionNameInput … describedBy="session-name-hint" />
    <span id="session-name-hint" className={styles.hint}>
      {window.matchMedia('(pointer: coarse)').matches ? 'Tap Done to save' : 'Enter to save · Esc to cancel'}
    </span>
  </span>
  ```
  - The wording follows the primary pointer, not the width, as the requirement says for hybrid
    devices. `(pointer: coarse)` is the primary-pointer query.
  - On a phone, iOS's keyboard bar and the `enterkeyhint` key both say Done, and a tap away saves too,
    so the hint's claim holds.
  - It's computed when the hint renders, because the box only exists briefly.
- **CSS.** Add after the `.titleBlock .unnamedInput` rule:
  ```css
  /* The box and its hint stack; the box keeps the width it had on its own. */
  .renameBox {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    width: min(20rem, 100%);
    min-width: 0;
  }

  .hint {
    font-size: 12px;
    color: var(--text3);
    text-align: right;
  }

  /* The hint now sits under an unnamed session's box, so the box keeps its bottom margin. */
  .renameBox .unnamedInput {
    margin-bottom: 0;
  }
  ```
  The last rule matters because the existing `margin-block: -7px` would otherwise pull the hint 3px
  into the box. The top margin stays, so the header still doesn't grow upwards.
- **Phone.** The header grows by about one 17px line while renaming, which the requirement accepts.
  On a phone the tabs are the fixed bottom pill, so nothing below is pushed and the hint can't overlap
  the tab bar.
- **Desktop.** The session tabs sit about 21 to 28px lower while the box is open.
- Closed sessions have no pencil, so no box and no hint (AC-8.5). The hint is only rendered while
  `renaming`, so every way of closing the box removes it (AC-8.2).

#### 6.B3 #10 Loading cue (`App.tsx` loading return, `App.module.css`)

```tsx
<div className={styles.loading} role="status">
  <span className={styles.spinner} aria-hidden="true" />
  Loading your sessions…
</div>
```

- `.loading` keeps its font, colour, padding and centring, and adds
  `display: flex; flex-direction: column; align-items: center; gap: 10px;`.
- `.spinner`:
  `width: 20px; height: 20px; border: 2px solid var(--border2); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;`
- `@keyframes spin { to { transform: rotate(360deg); } }`
- `@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }`: a still ring, with the
  text carrying the meaning.
- It's the same on phone and desktop.
- It has no delay, and it shows after "Try again" too, because that's the same early return.

#### 6.B4 #9 Tour nudge (`OnboardingTour.tsx`, `OnboardingTour.module.css`)

**Noticing the tap.** While `run` is true and the tour isn't `done`, an effect adds
`window.addEventListener('click', onClick, true)` (capture) and removes it in its cleanup. Its
dependencies are `[run, index]`. `onClick(event)`:

1. `if (event.detail === 0) return;`. A keyboard activation has `detail` 0 and stays exactly as today
   (the known gap).
2. Let `target = event.target as Element`.
   `if (!target.closest('.react-joyride__overlay') && !target.closest('[role="tab"]')) return;`.
   Only a tap on the dimmed overlay, or one that reaches a tab through the spotlight's 10px padding,
   is considered. A tap in the tooltip is never considered.
3. Find the tab under the point:
   `[...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((el) => { const r = el.getBoundingClientRect(); return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom; })`.
   `[role="tab"]` matches exactly the five tab buttons (`NavTabs` and `SessionTabs`), and only one set
   is mounted at a time. If there's none, return (AC-9.9).
4. `const highlighted = document.querySelector(`[data-tour="${TOUR_STEPS[index].target}"]`)`. If the
   tab is the highlighted element, return. That tap goes through untouched (AC-9.6).
5. Otherwise call `event.preventDefault()` and `event.stopPropagation()`. That stops the click from
   reaching a tab under the spotlight's edge, so the tab can't change the screen (BR-9.1, AC-9.4).
   Then show the nudge.

**Showing it.**
- `const [nudging, setNudging] = useState(false)` and a `nudgeTimer` ref.
- Showing clears any timer, calls `setNudging(true)`, and sets a 3000 ms timer that calls
  `setNudging(false)`. Each tap restarts the timer (AC-9.3).
- An effect on `[index]` clears the timer and calls `setNudging(false)`, so Next and Back hide it. Skip
  and the tour's end unmount it, and the unmount clears the timer.

**Rendering it inside the tooltip.**
- Add `const NudgeContext = createContext(false)` at module level, not exported. Wrap `<Joyride>` in
  `<NudgeContext.Provider value={nudging}>`.
- In the `steps` memo, still `[]`, use `content: <StepContent text={s.content} />` instead of
  `content: s.content`.
- Joyride renders the tooltip through a React portal, which keeps context, so `StepContent` re-renders
  when the nudge changes while `steps` keeps one identity. That matters because Joyride deep-compares
  `steps` and resets on a change.
  ```tsx
  function StepContent({ text }: { text: string }) {
    const nudging = useContext(NudgeContext);
    return (
      <>
        {text}
        <span className={styles.status} role="status">
          {nudging && <span className={styles.nudge}>Tap Next to continue</span>}
        </span>
      </>
    );
  }
  ```
- **Styles.** `.status { display: block; }` and
  `.nudge { display: block; margin-top: 10px; font-size: 13px; font-weight: 500; color: var(--accent-text); }`.
  It doesn't animate.
- The live region is always mounted and only gains text, so it's announced once and not on each
  restart.
- It sits above the buttons, wherever the tooltip is, including above the phone tab bar.
- It works the same with a mouse on desktop (AC-9.8).

`steps.ts` doesn't change. The steps keep their titles, so Joyride's `aria-labelledby` is unchanged.

#### 6.B5 #11 History delete (`HistoryPage.tsx`, `HomePage.tsx`)

**`HistoryPage`.** Mirror `HomePage` exactly:
- `const { sessions, deleteSession } = useSessionsStore();`
- `const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);`
- `const pendingDelete = closed.find((s) => s.id === pendingDeleteId) ?? null;`
- Each card gets `onDelete={() => setPendingDeleteId(session.id)}`. The trash, its corner position,
  hover and focus states and its aria-label (`Delete session <display title>`) all come from
  `SessionCard`, unchanged (AC-11.1). It's a sibling of the card button, so it doesn't open the session
  (AC-11.2).
- After the list, the same `ConfirmDialog`:
  ```tsx
  <ConfirmDialog
    open={pendingDelete !== null}
    title="Delete this session?"
    message={pendingDelete ? deleteSessionMessage(pendingDelete) : ''}
    confirmLabel="Delete Session"
    destructive
    onCancel={() => setPendingDeleteId(null)}
    onConfirm={() => { if (pendingDelete) deleteSession(pendingDelete.id); setPendingDeleteId(null); }}
  />
  ```
  Cancel is focused, and Escape or the backdrop cancels. That comes from `ConfirmDialog` (AC-11.3).
- Deleting the last card falls through to the existing empty state (AC-11.5).
- Update the component's doc comment: History is "the archive", and its sessions can now be deleted
  but never edited.

**`HomePage`.** `message={pendingDelete ? deleteSessionMessage(pendingDelete) : ''}` replaces the
inline ternary. Remove the `pluralize` and `sessionDisplayTitle` imports if nothing else uses them.

- The delete is the existing optimistic `deleteSession`: the card goes at once (AC-11.4).
- A failure is handled by whichever save-feedback code is on the branch (AC-11.6, section 8.B).
- `HistoryDetailPage` isn't touched, so it stays read-only with no delete (AC-11.7).
- After the confirm, focus falls to the page, as on Home today (accepted parity).

## 7. Onboarding tour impact

- **Branch A: none.** No `data-tour` target or step changes. The cue isn't a target, and the overlay
  dims it.
- **Branch B:**
  - **#9** changes `OnboardingTour.tsx` behaviour only. It reads `[role="tab"]` and the current step's
    existing `[data-tour="…"]` selector. Nothing is moved, renamed, duplicated or added: no new
    `data-tour` attribute, and `steps.ts` is untouched.
  - **#11** adds trash buttons on History cards, inside the `HistoryPage` list. The History step
    targets `nav-history`, which doesn't move.
  - **#8, #10 and #6** are clear of any target. `workspace-back` and the `tab-*` buttons don't change.
  - `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

Write the Vitest tests first, watch them fail, then implement. Each branch runs `npm run lint`,
`npx tsc -b`, `npm test` and `npm run build`, with the real results reported. The ui-ux-tester works on
`npm run dev:full` at 320px, 375px and desktop, using only "UI test" sessions, which it deletes
afterwards.

### 8.A Branch A

**Vitest, `src/lib/writeQueue.test.ts` (added `describe`s; fake timers where noted):**

`withDeadline` (`vi.useFakeTimers()`):
- It resolves with the work's value under the limit. At 29,999ms it's still pending, and nothing
  times out (AC-5.10).
- At 30,000ms it rejects with `TimeoutError`, and the signal is aborted (AC-5.1 to AC-5.5).
- Work that settles after the limit doesn't change the outcome, and no unhandled rejection occurs.
- Its timer is cleared once the work settles (`vi.getTimerCount() === 0`).

`authorisedFetch`:
- It sends the bearer header and passes the signal.
- **Abandon never sends:** with a token from a deferred that resolves after the controller has
  aborted, it rejects with `TimeoutError` and `send` is never called (AC-5.6, BR-5.2).
- A null token rejects with "Not signed in." without sending.

Failures:
- An A failure survives `resolveFailure(…, 'save', 'B')` (AC-5.8).
- With A and B both failed, resolving A leaves B, and resolving B leaves none (AC-5.9).
- Re-adding the same kind and session replaces the entry and moves it to most recent. The last entry's
  message is the newest failure's.
- `resolveFailure('save', id)` doesn't remove a `'delete'` failure for that id.
- `resolveFailure` returns the same reference when nothing matches.
- `failedSessionIds` returns save and delete ids, not load or seed ones.

`revertedAny` and `sameSessionContent`:
- A failed save whose server copy differs: `true` (AC-4.1).
- A failed create missing after the load: `true` (AC-4.2).
- A failed delete present after the load: `true` (AC-4.3).
- No failed ids: `false` (AC-4.4).
- A failed save whose server copy has records reordered, `jsonb` keys reordered and a different
  session `createdAt`: `false` (AC-4.5).
- A changed session that isn't in the failed set: `false`.
- Two failed sessions, one the same and one different: `true`.

> **Withdrawn 2026-11-02:** the `delayedFlag` tests below and tester steps 1 to 6. The leave check in step 6
> stays, run with a write pending rather than with the cue showing (AC-3.10). In step 7 the banner check
> stands, and "the cue is hidden" no longer applies.

**Vitest, `src/lib/delayedFlag.test.ts` (new, fake timers):**
- Input on for 399ms, then off: `onChange` is never called (AC-3.3).
- On for 400ms: `onChange(true)` (AC-3.2).
- Shown at 400ms, off at 500ms: it stays on until 1,000ms, then calls `onChange(false)` (AC-3.4).
- Shown, then off after 2s: it turns off on the next tick.
- Off, then on again during the hold: no `onChange` calls, and it stays on (AC-3.6).
- `dispose` cancels a pending timer, and `set` works afterwards.

**ui-ux-tester (Branch A):**
1. AC-3.1: on a fresh load and on the Loading screen, with nothing pending, there's no cue.
2. AC-3.2 and AC-3.5: remove a member on `dev:full` (saves take 5 to 10 seconds), and "Saving…"
   appears in the header after about 0.4 seconds. Repeat for New Session and for a Home delete.
3. AC-3.4 and AC-3.6: edit two sessions quickly. One cue shows, and it clears only after the last
   `PUT` returns.
4. AC-3.8: at 320px, 375px, 414px and desktop, while the cue appears and clears:
   - the header doesn't change height, and nothing below moves (compare the `getBoundingClientRect`
     of the first card before and during);
   - nothing overlaps the account button or the tab bar.
5. AC-3.9: the cue's node is `role="status"` and stays mounted while empty.
6. AC-3.10: with the cue showing, the `beforeunload` check from the lost-edits spec returns `true`.
   Once it's gone, it returns `false`.
7. AC-3.7 and AC-5.1: with DevTools blocking `PUT /api/sessions/*` set to stall (or throttled
   offline), 30 seconds after an edit the banner shows the save timeout text and the cue is hidden.
   AC-5.2 does the same for New Session (block `POST`), and AC-5.3 for a delete (block `DELETE`).
8. AC-5.4: block `GET /api/sessions` and reload. The spinner shows for 30 seconds, then the shell shows
   with the load timeout banner and an empty list. AC-5.5: with sessions on screen, cause a failure,
   block `GET`, press "Try again". 30 seconds later the load banner shows and the sessions are still
   there.
9. AC-5.7, AC-5.8 and AC-5.9: fail a save on A (block it), unblock, then edit B: the banner stays. Edit
   A: the banner clears. Repeat with both A and B failed: it clears only after both resave.
10. AC-4.1 to AC-4.6, after a failed write and "Try again" with the connection restored:
    - a failed edit is reverted and the note shows (AC-4.1);
    - a failed create disappears and the note shows (AC-4.2);
    - a failed delete reappears and the note shows (AC-4.3);
    - a load-only failure shows no note (AC-4.4);
    - a write that timed out client-side but landed shows no note (AC-4.5). To get one, hold the
      response, not the request, past 30 seconds.
    - Dismiss removes the note, and a new failure replaces it with the banner (AC-4.6).
11. AC-4.7 and AC-5.11: the note and the banner at 320px wrap with no horizontal scroll. While the
    banner shows, navigating and editing still work.
12. AC-5.6: with a stalled `getToken` (dev, or hold the request) that completes after the banner shows,
    no further request appears in Network for that attempt, and the screen doesn't change.
13. Regression: the onboarding tour runs to "You're all set!", and the lost-edits walkthrough steps 1
    to 5 still pass.

### 8.B Branch B

**Vitest, `src/lib/sessionLabel.test.ts` (added `describe('deleteSessionMessage')`):**
- Each of the six rows in 5.B2, named and unnamed:
  - 3 members and 0 purchases (AC-6.1);
  - 1 member, which reads "1 member" (AC-6.2);
  - 0 and 0, unchanged (AC-6.3);
  - purchases on a draft, unchanged (AC-6.4);
  - purchases on a closed session, which includes "and its statement can no longer be downloaded"
    (AC-11.10);
  - a closed session with 0 purchases, which has no statement clause.

**Vitest, `src/lib/demoData.test.ts` (new):**
- Two `buildDemoData()` calls share no record id, and every id matches `/^rec_[0-9a-z]+$/` (#1). This
  fails today.
- The members and item totals are the same across the two calls, so the values stay deterministic.

**Existing:** `steps.test.ts` and `targets.test.ts` pass unchanged (BR-9.4).

**ui-ux-tester (Branch B):**
1. **#1:** in a throwaway "UI test" draft, Load Demo Data, then Load Small Set. Each `PUT` returns 200,
   and after a reload the data is there. Then do the same in a second throwaway session: it also
   returns 200, which proves no collision. Delete both.
2. **AC-6.1 to AC-6.5:** the Home trash on drafts with 3 members, 1 member, 0 members, and purchases.
   Also a 60-character name at 320px.
3. **#7 (D1):**
   - With option (a), confirm AC-7.2 to AC-7.6 hold.
   - Re-measure at 320px with `document.documentElement.clientWidth` noted, and check that the title's
     right edge sits 12px (±1) from the total's left edge.
   - With option (b), also check that the title column grows by 8px and that desktop is unchanged.
4. **AC-8.1 to AC-8.5:**
   - Desktop shows "Enter to save · Esc to cancel".
   - Phone wording needs a coarse pointer: use DevTools device mode with touch, or a real phone. A
     resized desktop window correctly shows the desktop wording.
   - The hint goes on Enter, Esc, a tap away and a tab switch.
   - Closed sessions have no pencil.
   - Rename behaviour is unchanged.
5. **AC-10.1 to AC-10.4:**
   - The spinner and text are centred at 320px and on desktop.
   - With reduced motion emulated, nothing spins.
   - The page doesn't jump when the load ends.
   - It shows after "Try again".
   - AC-10.5 is checked with Branch A.
6. **AC-9.1 to AC-9.9** (phone and desktop):
   - On "Log what people spent", tap Summary: the nudge shows and the screen stays on Expenses.
   - Tap Breakdown, including its edge nearest Expenses: the nudge shows and the tour stays put.
   - Repeated taps keep one nudge, and it hides 3 seconds after the last tap.
   - Next hides it and advances.
   - Tapping the highlighted tab behaves as today.
   - Tapping dimmed space away from the tabs does nothing.
   - The first step (Home and History tabs) and the last step (tap Home) nudge too.
   - The tour completes on Next alone.
7. **AC-11.1 to AC-11.10:**
   - Close a "UI test" session. On History, its trash has the label, hover and focus states.
   - Tapping the trash opens the dialog, not the session.
   - Cancel, Escape and the backdrop each keep it.
   - Confirm removes the card, and after a reload it's still gone.
   - Deleting the last one shows the empty state.
   - The detail page has no delete control.
   - At 320px with a 60-character name, nothing overlaps.
   - The Home draft delete is unchanged apart from the #6 wording.
8. **AC-11.6:** block `DELETE` and confirm.
   - On Branch B alone, the existing banner appears. Its old global error can be cleared by an
     unrelated later save, which is today's behaviour.
   - The note, and the banner staying until "Try again", are checked after Branch A is merged.

## 9. Documentation impact

For the documentation-engineer, when the owner asks:
- `README.md`, the "Writes are optimistic" paragraph:
  - the header's "Saving…" cue (withdrawn 2026-11-02, so not to be documented);
  - the 30-second limit on saves, creates, deletes and loads;
  - errors staying until that session saves or "Try again";
  - the reverted-edit note.
- User-facing docs: closed sessions can be deleted from History, and doing so also removes the
  statement.
- No API reference or data-model change.
- `docs/specs/session-names.md` AC-1.10 gets a supersession note in this spec's commit, so it needs
  nothing further.

## 10. Tasks

### Branch A: `save-feedback`

1. Write the 8.A tests in `writeQueue.test.ts` and `delayedFlag.test.ts`, and see them fail.
2. Implement 5.A1 to 5.A3 in `writeQueue.ts` and 5.A6 in `delayedFlag.ts` until they pass.
3. `useServerSessions.ts`, following 5.A5:
   - state;
   - derived `status` and `error`;
   - `fail`;
   - `authedFetch` through `authorisedFetch`;
   - deadlines in `put`, `addSession`, `removeSession` and the load;
   - `retry` and `dismissReverted`;
   - the `Result` type;
   - updated comments.
   Afterwards, grep for leftover `setStatus` and `setError` calls: there should be none.
4. `SessionsStoreContext.tsx`: the `sync` type, the value and the memo dependencies.
5. `SyncBanner.tsx` and its CSS (6.A2).
6. `Header.tsx` and its CSS (6.A1). *Withdrawn 2026-11-02 with the header cue.*
7. Run lint, `tsc -b`, the tests and the build. Hand off to the surgeon-reviewer and the ui-ux-tester.

### Branch B: `polish-and-history-delete`

1. Write the 8.B tests (`sessionLabel.test.ts`, `demoData.test.ts`) and see them fail.
2. `demoData.ts`: fresh record ids and the updated comment (5.B1).
3. `sessionLabel.ts`: `deleteSessionMessage` (5.B2).
4. `HomePage.tsx` uses it, then `HistoryPage.tsx` gets the delete (6.B5).
5. `App.tsx` and `App.module.css`: the loading cue (6.B3).
6. `SessionNameInput.tsx`, then `SessionWorkspace.tsx` and its CSS: the rename hint (6.B2).
7. `OnboardingTour.tsx` and the new `OnboardingTour.module.css`: the nudge (6.B4). Then run
   `steps.test.ts` and `targets.test.ts`.
8. Only if D1 is (b): `SessionCard.module.css` (6.B1).
9. Run lint, `tsc -b`, the tests and the build. Hand off to the surgeon-reviewer and the ui-ux-tester.

## 11. Risks and effort

**Branch A: medium effort, medium risk.** It's the only persistence path.
- **An abandoned request may still land on the server.** An aborted `fetch` doesn't stop a request the
  server has already received.
  - If an attempt is stuck server-side before it reaches the row lock, and the newer copy the queue
    then sends overtakes it, the older copy could land last.
  - This is inherent to BR-5.1's "the queue moves on".
  - It's rare: a 30-second stall is almost always a token stall, where nothing is sent, or a request
    that never arrived.
  - A request already holding the lock makes the newer one wait, so the order is kept.
  - It's accepted and recorded here. Closing it would need server-side versioning.
- **A false or missing note.**
  - `sameSessionContent` ignores exactly the fields the server rewrites (5.A3), and the tests pin
    AC-4.5.
  - Residual: a value the server's parser normalises differently from the client would show the note
    without need. None is known today.
- **Status regressions.** `SyncStatus` keeps its values and `App.tsx` is untouched. Review checks that
  no `setStatus` or `setError` call is left, and that every write path calls `fail` or `resolveFailure`.
- **The live-region announcement for the note.** The note mounts with its text after the Loading
  screen, and some screen readers skip regions inserted with content. That's accepted: the note is
  also visible.
- **The create and delete race after a create timeout.** If the aborted POST lands after the DELETE's
  404, the session is left on the server and reappears on the next load. It's rare and harmless.

**Branch B: small to medium effort, low risk.**
- **#9 relies on Joyride's `.react-joyride__overlay` class.** That's library internals, pinned at
  `^3.2.0`. If a minor version renames it, the nudge silently stops, but the tour still works as today.
  A comment at the selector should say so.
- **#11 is the one destructive action.** It reuses the confirmation (Cancel focused) and the existing
  ownership-checked `DELETE`.
- **#8's wording on hybrid devices** follows the primary pointer, as the requirement says.
- **#1** only changes dev seeding. No real data is touched.

## 12. Decisions for the user

**D1. #7: there's no defect to fix. Change anything?** **Decided: (a), no change** (owner,
2026-11-02). The column already reaches the total (5.B3). The tester's 305px was the page width less a classic scrollbar, and it still included 70px of
gutters and card padding.
- **(a) Recommended: no change.** Close #7 as working, and the tester re-checks AC-7.2 to AC-7.6. A
  wrapped title will always end ragged.
- **(b) Give the title 8px more on phones.** Reduce the card's side padding from 18px to 14px at ≤640px
  (6.B1). It's cheap and safe, but it changes how every card looks on a phone for a small gain.

**D2. #3: where the cue sits on a phone.** *Withdrawn 2026-11-02 with the header cue.* **Decided: (a)** (owner, 2026-11-02): on phones the cue
sits in the header's top padding above the account button, beside it on desktop, and nothing moves or
wraps at any width when it appears or clears. The requirement's spot (in the row, left of the account
button, with the title block shrinking) makes the header grow by a line on 396 to 451px phones when
the cue appears. That breaks AC-3.8 (6.A1).
- **(a) Recommended:** on phones, the cue sits right-aligned in the header's top padding, above the
  account button. On desktop it's in the row as asked. Nothing moves at any width.
- **(b)** Keep the slot reserved in the row at all times. That's stable, but on 396 to 451px phones the
  subtitle always wraps and the header is 17px taller than today.

**D3. Note only, no decision needed: #1 shows an API weakness.**
- `PUT /api/sessions/:id` lets a record id that already exists in another session (any account) escape
  as an uncaught 500. It isn't a clean 4xx.
- That also reveals the id exists. Real clients mint random 48-bit ids, so this doesn't happen in
  practice.
- **Recommended: no API change this round.** Confirmed by the owner on 2026-11-02. A later small fix could catch the unique violation and
  return 409.

**Assumptions, stated rather than asked.** The owner confirmed all three on 2026-11-02:
- A save timeout is always reported, even with a newer copy queued (BR-5.1). A plain save failure with a
  newer copy queued stays silent, as today.
- A closed session with no purchases (legacy only) gets no statement clause, because it has no
  statement (5.B2).
- The dev seeder (`replaceAll`) gets no 30-second deadline.
