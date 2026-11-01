# Spec: lost edits on reload

Status: **awaiting the owner's approval.** Branch `fix-lost-edits-on-reload`, from `main` at `0f3b6fd`.

## 1. Summary

The ui-ux-tester removed a member on local `vercel dev`, where a save takes 5 to 10 seconds, and then
loaded `http://localhost:3000` again about 1 to 2 seconds later. The member came back. When it waited
about 4 seconds before reloading, the removal had stuck.

**Root cause.** The page load cut off a whole-session `PUT` that hadn't landed yet. The fresh page's
`GET /api/sessions` then showed the server's older copy. Nothing warns the user that a save is still
running when they leave. The trigger is a full page load, confirmed by the tester. It isn't a re-run of
the load effect: in `@clerk/clerk-react` 5.61.10, `useAuth().getToken` is
`useCallback(createGetToken(isomorphicClerk), [isomorphicClerk])` over a fixed instance, so
`authedFetch` and the effect's dependencies stay the same while the user is signed in.

The investigation also found three bugs in `src/hooks/useServerSessions.ts` that can lose or resurrect
data without any reload. The owner asked for them to be fixed here too:

1. **A stale save can overwrite a newer one.** Nothing stops two `PUT`s for the same session being in
   flight at once. In `api/sessions/[id].ts` the upsert locks the session row, so the transactions take
   turns, and the one that reaches the lock last wins. The order they reach it isn't the order they were
   sent. The per-session `seq` only decides which result sets the status.
2. **A late `PUT` can bring back a deleted session.** `removeSession` waits for an in-flight create, but
   not for in-flight saves. If a `PUT` lands after the `DELETE`, the handler finds no row and inserts the
   session again.
3. **`save()` runs inside the `setSessions` updater.** React StrictMode can run an updater twice in dev,
   which sends duplicate `PUT`s. For `addRecord` and `closeSession`, the duplicates carry a different
   record id or timestamp from the one the screen keeps. `replaceAll` has the same problem.

A load also replaces any session that has a save in flight. With the fix, this only matters for
"Try again".

The owner's decisions:
- Fix bugs 1 to 3.
- A load keeps the on-screen copy of any session with a save in flight or queued.
- While any write is in flight or queued, closing or reloading the tab shows the browser's standard
  `beforeunload` prompt.
- No `keepalive`.

## 2. Layers touched

| Layer | File | Change |
|---|---|---|
| Client logic | `src/lib/writeQueue.ts` (new) | Three pure exports: `createSaveQueue`, `createPendingWrites`, `mergeLoaded` (section 5). No React, `fetch` or `window`. |
| Client state | `src/hooks/useServerSessions.ts` | Uses the three helpers. Mirrors `sessions` in a ref so side effects leave the updaters. Adds the `beforeunload` guard. Removes `seq`. |
| Tests | `src/lib/writeQueue.test.ts` (new) | Unit tests (section 8). |
| Docs | `README.md` | Covered by the documentation-engineer (section 9). |

**Unchanged:**
- types, schema and every API handler. The fix is all on the client, so no API change is needed.
- `SessionsStoreContext.tsx`, `AppDataContext.tsx`, `SyncBanner.tsx`, `App.tsx`, the UI, the PDF and the
  tour.
- The `Result` type of `useServerSessions` stays as it is, so callers don't change.

## 3. Data model

None.

## 4. API contract

None. Routes, requests and responses are unchanged.

## 5. Business logic

All rules live in `src/lib/writeQueue.ts`, and the hook only wires them up. There is no money logic.

### `createSaveQueue<T>()`: one save at a time per session, coalesced

```ts
type Send<T> = (value: T) => Promise<void>;
export function createSaveQueue<T>(): {
  /** Starts a drain and returns its promise, or returns null when folded into the running one. */
  enqueue(id: string, value: T, send: Send<T>): Promise<void> | null;
  /** True while `id` has a send in flight or a value waiting. */
  isBusy(id: string): boolean;
  /** True while `id` has a value waiting behind the in-flight send. */
  hasPending(id: string): boolean;
  /** Resolves once `id` has nothing in flight or waiting (at once if idle). Never rejects. */
  settled(id: string): Promise<void>;
};
```

Rules:
- **Idle `id`.** `enqueue` calls `send(value)` straight away and returns the drain's promise.
- **Busy `id`.** `enqueue` stores `{ value, send }` as the one pending entry, replacing any older pending
  entry, and returns `null`. Values are whole sessions, so the latest copy already contains every earlier
  edit and nothing is lost by skipping the middle ones.
- **When a send settles,** resolved or rejected: if there's a pending entry, take it and send it with
  the `send` stored beside it. Otherwise the `id` is idle, and the drain's promise and every `settled(id)`
  waiter resolve.
- **A rejected send doesn't stop the drain** and never rejects the drain's promise. The hook's `send`
  doesn't reject anyway, because it reports errors itself.
- **Different ids are independent** and run at the same time.

`send` is passed with each value rather than to the factory. That way the queue holds no reference to
`authedFetch`, the hook can create it once with a lazy `useState`, and it never goes stale.

### `createPendingWrites(onChange)`: is anything unsaved?

```ts
export function createPendingWrites(onChange: (busy: boolean) => void): {
  track(work: Promise<unknown>): void;
  readonly busy: boolean;
};
```

- **Counting.** `track` adds one to a count and later subtracts one, when `work` settles either way.
  It attaches its own `then(done, done)`, so a rejection never surfaces as unhandled, and it returns
  nothing.
- **When `onChange` fires.** `onChange(true)` fires when the count goes from 0 to 1. `onChange(false)`
  fires when it returns to 0. It is never called twice in a row with the same value.

### `mergeLoaded(server, local, isUnconfirmed, isDeleting)`

```ts
export function mergeLoaded<S extends { id: string }>(
  server: S[], local: S[],
  isUnconfirmed: (id: string) => boolean, isDeleting: (id: string) => boolean,
): S[];
```

What it returns:
1. The server's list, in the server's order.
2. Any session where `isUnconfirmed(id)` is true is replaced by its local copy, if one exists.
3. After that, any local session where `isUnconfirmed(id)` is true but the server doesn't have it yet (a
   create still in flight) is appended, in local order.
4. Any `id` where `isDeleting(id)` is true is left out, even if the server returned it.

Local sessions that are neither unconfirmed nor being deleted aren't kept: the server is the truth for
them. A session whose last save *failed* is no longer busy, so "Try again" still replaces it with the
server copy, exactly as it does today.

The hook passes:
- `isUnconfirmed = (id) => queue.isBusy(id) || creating.current.has(id)`
- `isDeleting = (id) => deleting.current.has(id)`

The owner's rule names saves. Treating in-flight creates and deletes the same way is my extension of it
(decision 1).

### `useServerSessions.ts` wiring

- **`sessionsRef`.** Add `const sessionsRef = useRef<Session[]>([])` and a `commit(next)` callback that
  sets `sessionsRef.current = next` and then calls `setSessions(next)`. Every place that writes
  `sessions` goes through `commit` with a plain value, never an updater.
- **`mutateSession`.**
  - Read `sessionsRef.current`, find the session and call `fn` once.
  - Keep the no-op rule: if `fn` returns the same object, return with no write.
  - Otherwise `commit` the new array, then call `enqueueSave(next)`. This fixes bug 3: `fn` (with its
    `createId` and `new Date()`) and the save each run exactly once.
- **`put(session)`** replaces `save`. It never rejects.
  - It sends the existing `PUT` request.
  - On success: `if (!queue.hasPending(session.id)) { setError(null); setStatus('ready'); }`
  - On failure: `if (!queue.hasPending(session.id)) { setError(message); setStatus('error'); }`
  - This mirrors today's `seq` check: a result that a newer queued copy will supersede doesn't touch the
    status. Remove the `seq` ref and its comment.
- **`enqueueSave(session)`.** `setStatus('saving')`, then
  `const drain = queue.enqueue(session.id, session, put); if (drain) pending.track(drain);`.
- **`addSession`.** Unchanged, except that `commit([...sessionsRef.current, session])` replaces the
  updater and `pending.track(create)` is added.
- **`removeSession`.**
  - `commit(sessionsRef.current.filter(...))`.
  - Add the id to a new `deleting` ref (`Set<string>`).
  - In the async body, `await creating.current.get(id)` (as today), then `await queue.settled(id)`, then
    send the `DELETE`. This fixes bug 2.
  - Remove the id from `deleting` in a `finally`.
  - `pending.track` the async body.
  - A queued edit can't follow the delete: the session is already gone from `sessionsRef`, so
    `mutateSession` finds nothing.
- **`replaceAll`** (dev-only).
  - Read the old list from `sessionsRef.current`, `commit(next)`, then run the seeding outside any updater.
  - Before each old session's `DELETE`, `await queue.settled(old.id)`.
  - `pending.track` the whole run.
- **Load effect.** Replace `setSessions(Array.isArray(body) ? body : [])` with
  `commit(mergeLoaded(Array.isArray(body) ? body : [], sessionsRef.current, isUnconfirmed, isDeleting))`.
  Nothing else in the effect changes: its dependencies, `setStatus('loading')`, the cancel flag, the error
  path.

### The `beforeunload` guard

- **The handler.** Add a module-level handler in `useServerSessions.ts`:
  ```ts
  function warnBeforeLeaving(event: BeforeUnloadEvent) {
    event.preventDefault();
    // Older Chrome and Safari still need returnValue set to show the prompt.
    event.returnValue = '';
  }
  ```
- **The counter.** Create it once:
  ```ts
  const [pending] = useState(() =>
    createPendingWrites((busy) =>
      busy
        ? window.addEventListener('beforeunload', warnBeforeLeaving)
        : window.removeEventListener('beforeunload', warnBeforeLeaving)));
  ```
- **Only attached while something is unsaved.** The listener exists only while at least one save,
  create, delete or seeding run is tracked. It is removed when the last one settles, whether it succeeded
  or failed. A failed save leaves the error banner, not a prompt. Adding the listener only while needed
  keeps the page eligible for the back/forward cache the rest of the time.
- **On unmount.** `useEffect(() => () => window.removeEventListener('beforeunload', warnBeforeLeaving), [])`
  removes it when the provider unmounts, for example on sign-out.
- **StrictMode and dev.**
  - The lazy initialisers of `useState` may run twice. The extra counter and queue are thrown away
    unused, so there is no side effect.
  - The simulated unmount at mount runs the cleanup above while nothing can be in flight, because the
    loading screen blocks every edit. So it can't strip a listener that's needed.
  - The prompt behaves the same in dev and production.
- **The browser decides the wording.** No custom message, no UI of our own. Browsers show the prompt
  only after the user has interacted with the page, which an edit always is.

### SyncBanner and "Try again"

Unchanged. The banner still shows only on `status === 'error'`. "Try again" still bumps `reloads`,
shows "Loading your sessions…" and reloads. The one difference is the merge above: a session with a
save still in flight keeps its on-screen copy instead of briefly reverting.

## 6. UI

None. The only visible change is the browser's own leave prompt. It appears the same at phone and
desktop widths wherever the browser supports it (section 11).

## 7. Onboarding tour impact

None. No `data-tour` target, step or screen changes. The tour's cleanup delete now waits for that
session's in-flight save. That matches what `endTour` already wants: a rename saved as the tour ends
lands first.

## 8. Test plan

### Vitest: `src/lib/writeQueue.test.ts` (write first, watch it fail, then implement)

Sends are controlled with deferred promises.

`createSaveQueue`
- An idle id sends straight away and `enqueue` returns a promise.
- A second `enqueue` while in flight doesn't send and returns `null`. After the first settles, it sends
  the second value.
- Three enqueues while one is in flight: only the first and the last are sent (`[v1, v4]` for v1 to v4).
- The `send` stored with the latest value is the one used.
- Two different ids send at the same time.
- A rejected send moves on to the pending value, and the drain's promise resolves rather than rejects.
- `settled(id)` resolves at once when idle, and otherwise only after the pending value has been sent too.
- `isBusy` and `hasPending` are true and false at the right moments, including back to false at the end.

`createPendingWrites`
- `onChange(true)` fires once for the first tracked promise, not again for the second.
- `onChange(false)` fires once when the last one settles, including when it rejects.
- `busy` follows the count, and it re-arms after going idle.
- A tracked rejection doesn't produce an unhandled rejection.

`mergeLoaded`
- An idle session takes the server copy.
- An unconfirmed session keeps its local copy, in the server's position.
- An unconfirmed local session missing from the server is appended.
- An idle local session missing from the server is dropped.
- A session being deleted is left out even when the server returns it.
- The result follows the server's order.

### ui-ux-tester walk-through, on local `vercel dev` (slow saves, desktop width, then repeat 1 and 4 at 390px)

Open DevTools' Network panel filtered to `/api/sessions`. Native leave prompts can block Claude in
Chrome, so check for one without triggering it: run this with `javascript_tool`.

```js
const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); e.defaultPrevented
```

`true` means a leave would warn.

1. **The original scenario now warns.** In a session, remove a member who has a purchase and confirm.
   Within about 2 seconds, while the `PUT` is still pending, run the check: it returns `true`. Then reload
   the tab by hand (the owner, if the tester's tool can't handle the native dialog). The browser's "Leave
   site? Changes you made may not be saved" prompt appears. Choose to stay, and the member is still gone
   on screen.
2. **No warning once it's saved.** After that `PUT` has returned 200, the check returns `false`. Reload
   with no prompt: the member is gone, both inside the session and on the Home card.
3. **A rapid double edit ends with the latest.** Change one item's total to 100, then quickly to 200, then
   to 300, all while the first `PUT` is pending. The Network panel never shows two `PUT`s for that session
   overlapping, and there are at most two `PUT`s in all. Once all are done, reload: the total is 300.
4. **A delete right after an edit stays deleted.** Edit a session (add a member), go Home and delete that
   session straight away. The `DELETE` starts only after the `PUT` returns. Once it returns 204, reload:
   the session is still gone.
5. **One edit, one `PUT` (StrictMode).** Add a purchase. Exactly one `PUT` is sent. Then reload: the
   purchase is there, with the same values the screen showed.
6. **Regression.** The SyncBanner still appears on a failed save (stop the API or go offline in
   DevTools), and "Try again" still reloads. Run the onboarding tour once to the end. New Session, rename,
   close and delete all behave as before.

### Checks before done

`npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, with real results.

## 9. Documentation impact

`README.md`, the "Writes are optimistic" paragraph near line 252, gains two facts:
- saves for one session go one at a time, latest copy wins;
- leaving or reloading while a save is running asks the user to confirm first.

No API reference or data-model doc changes.

## 10. Tasks

1. Write `src/lib/writeQueue.test.ts` from section 8, then `src/lib/writeQueue.ts` until the tests pass.
2. In `useServerSessions.ts`, add `sessionsRef` and `commit`, and move `mutateSession`, `addSession`,
   `removeSession` and `replaceAll` off updater functions.
3. Create the queue and the pending counter with lazy `useState`. Replace `save` with `put` and
   `enqueueSave`, and remove `seq`.
4. Add `deleting`, and make `removeSession` and `replaceAll` wait on `queue.settled`.
5. Use `mergeLoaded` in the load effect.
6. Add `warnBeforeLeaving`, the `pending.track` calls on every write, and the unmount cleanup.
7. Update the hook's doc comments where they describe the old behaviour (the optimistic-writes block and
   the `seq` comment).
8. Run lint, `tsc -b`, tests and build. Hand off to review and the ui-ux-tester.

## 11. Risks and effort

- **The ref and state drift apart.** Every write goes through `commit`, so they can't, as long as no
  `setSessions` call is left behind. Review greps for `setSessions(` outside `commit`.
- **Saves feel slower on slow links.** A second edit waits for the first save. Nothing waits on screen,
  because state is still optimistic, and coalescing means fewer requests overall.
- **A failed save in the middle.** The next queued copy carries the full state, so a later success
  repairs it. If the last one fails, the banner shows as today, and the edit isn't retried automatically
  (unchanged).
- **iOS Safari ignores `beforeunload` prompts.** On an iPhone, reloading in the middle of a save can
  still lose that edit. The banner and save ordering still help. Closing this fully would need
  `keepalive` or a server change, which the owner ruled out for now.
- **The prompt can appear at sign-out.** If the user signs out from the `UserButton` mid-save, Clerk's
  redirect may show the prompt. That's accurate and acceptable.
- **Two tabs open on the same account** can still overwrite each other. That needs server-side versioning
  and is out of scope; sharing between accounts is deliberately absent anyway.
- **Dev hot reload** of the hook while saves run may leave a stale listener until the next full load.
  Dev only.

**Effort: small to medium.** One new pure module of about 80 lines plus tests, and a contained rewrite
of one hook. **Risk: low to medium.** It's the app's only persistence path, so the walk-through repeats
the core flows.

## 12. Decisions for the user

1. **Should a load also respect in-flight creates and deletes, or only saves?** You named saves. I
   recommend all three, because it's the same rule ("a load never overrides a write the server hasn't
   confirmed") and costs two checks. Without it, "Try again" during a create can hide a just-made
   session, and during a delete it can show a deleted one again.
