# Spec: "Already settled" and "What's new" (ship with Collection)

Status: **draft, awaiting the owner's approval.** Branch `collection`, read at `4a249f3`. This ships with
Collection. It builds on `docs/specs/collection.md` and `docs/specs/collection-nicknames.md` (section 13 is the
current behaviour).

## 1. Summary

When Collection reaches testers, every session they finished before it will show as unpaid, because nothing
recorded payments then. Returning testers will also find a new tab and a Profile item with no explanation.

This spec covers four things:

- **A. Already settled.** A one-time question on Collection: "You have N sessions finished before Collection.
  Were they already settled?". It offers "No, track them", "Let me choose" (a checklist) and "Yes, all settled".
  Each eligible card also gets a one-tap "Already settled" button.
  - Marking a session settled records a full payment on **every** settlement pair, through the existing payments
    ledger.
  - A session whose pairs are all paid counts as Settled whoever "me" is, so an old session is never sent to
    Needs setup.
  - A card-level Undo removes the marking in one atomic request.
- **B. What's new.** A dialog shown once per account, on the next app load, to returning (already onboarded)
  users only. Its buttons are "Got it" and "Take me to Collection". New users get the tour and never see it.
- **C. Dev seed fix.** "Seed Sessions (add)" and "Seed Needs setup (add)" become append-only, so they never
  delete or re-create the owner's real sessions on the shared Neon `main`.
- **D. Prompt tweak.** The "You go by “X” — is that you here?" legend changes to "Which one are you?" while the
  selection differs from the suggested member.

Sources:
- the owner's brief, `peaceful-coalescing-karp.md`, section "New features" (2026-11-06);
- the business-analyst's requirements, `settled-whatsnew-requirements.md`: BR-S1 to BR-S17, BR-W1 to BR-W11,
  US-S1 to US-S7, US-W1 and US-W2, the edge cases E-S and E-W, and the risks R1 to R11;
- the owner's answers:
  - **Q1:** a mark that Finish sets on each session it closes. A pre-Collection session is a finished session
    without the mark and with no payments.
  - **Q2:** after "No, track them", the old cards keep "Already settled" until they have a payment. Escape counts
    as "No".
  - **Q3:** a marked session looks normal when "me" is known and reads "Everyone's paid" when it isn't, with a
    session-level Undo either way. Marked sessions sort by their finish date in Settled.
  - **Q4:** a session with no lines and an unknown "me" goes to Settled, reading "Nothing to collect. Everyone's
    even."
  - **Q5:** "next sign-in" means the next app load. This is flagged again in section 12.
- the analyst's other defaults, which stand.

**Assumptions** (veto any before approving):

- **S-A1.** "Settled this way" is **derived**, not stored (R11): a session that isn't marked as finished with
  Collection, has at least one pair, and has every pair fully paid. A pre-Collection session tracked to full by
  hand therefore also gets the card-level Undo and sorts by its finish date. That's harmless, because Undo removes
  only payments the user can re-record.
- **S-A2.** The recorded payments carry the time they were recorded (the server's `now()`), not the finish date.
  The Settled card's "Settled <date>" therefore shows the marking date. Only the **sort** uses the finish date.
- **S-A3.** A bulk answer sends one request per session, all at once and without throttling. That's at most a few
  dozen small transactions, and the browser already limits how many run at the same time per host.
- **S-A4.** One request takes at most **200** payments, up from 100. That covers every pair of a 20-member group
  (190). A session with more than 200 pairs (21 or more members) is never offered "Already settled"; it's tracked
  as today. See R4 in section 11.

## 2. Layers touched

| Layer | File | Change |
|---|---|---|
| Schema | `scripts/db/schema.sql` | three additive columns (section 3) |
| Types | `src/types/index.ts` | `Session.finishedWithCollection: boolean` |
| Pure logic | `src/lib/whatsNew.ts` **(new)** | `WHATS_NEW_VERSION`, `whatsNewDue` |
| Pure logic | `src/lib/collection.ts` | `PAYMENTS_PER_REQUEST_MAX`; `buildCard`'s bucket rule and new card fields; `settlePayments`; `buildCollection`'s `alreadySettledOffers` and Settled sort |
| Pure logic | `src/lib/storage.ts` | `parseSession` and `migrateV1` set `finishedWithCollection` |
| Pure logic | `src/lib/writeQueue.ts` | `sameSessionContent` compares `finishedWithCollection` |
| Dev data | `src/lib/demoSessions.ts` | `finishedWithCollection: false` on every seeded session |
| API | `api/_shared.ts` | `loadSessions` selects and maps `finished_with_collection` |
| API | `api/sessions/[id].ts` | PUT stores `finished_with_collection`, which stays true once set |
| API | `api/_validate.ts` | the payments cap moves to `PAYMENTS_PER_REQUEST_MAX`; new `parseUserMark` and `parseSessionIdQuery` |
| API | `api/payments/index.ts` | new `DELETE ?sessionId=` (undo every payment of a session) |
| API | `api/user.ts` | GET returns `whatsNewVersion` and `alreadySettledAnsweredAt`; PUT takes an optional `{ mark }` |
| Client state | `src/hooks/useServerSessions.ts` | `addPayments` returns its promise and takes `{ quiet }`; `PaymentResult` gains `code`; new `settleSessions`, `removeAllPayments`, `appendAll` |
| Client state | `src/context/SessionsStoreContext.tsx` | `closeSession` sets the mark; passes the three new functions through |
| Client state | `src/hooks/useOnboarding.ts` | `whatsNewDue`, `markWhatsNewSeen` |
| Client state | `src/context/ProfileContext.tsx` | `alreadySettledAnswered`, `answerAlreadySettled` |
| UI | `src/components/onboarding/OnboardingDialog.tsx` + css | `message: ReactNode`; optional `stacked` actions on phone |
| UI | `src/App.tsx` | the What's new dialog; `canAsk` for Collection; the dev previews |
| UI | `src/components/collection/AlreadySettledDialog.tsx` + css **(new)** | the question and the checklist |
| UI | `src/components/collection/CollectionCard.tsx` + css | the "Already settled" button; the "Everyone's paid" and "Everyone's even" cards; the card-level Undo; the `hasLine` fix; the legend tweak |
| UI | `src/components/summary/FinishSessionDialog.tsx` | the legend tweak |
| UI | `src/pages/CollectionPage.tsx` | asks the question; settles; the announcement |
| UI | `src/components/home/DevSessionsBar.tsx`, `src/pages/HomePage.tsx` | append-only seeds; "Preview What's new"; "Ask Already settled" |
| Tests | section 8 | — |

**Not touched:** `LineRow`, History, History detail, Summary, the PDF, the calculations, `steps.ts`, and the payments
`[id].ts` route. Deleting a session from History shows today's message, which already counts its payments
(BR-S16).

## 3. Data model

Add to `scripts/db/schema.sql`. The two `users` columns go after the `nicknames` alter, and the session column
goes after the `me` alter:

```sql
-- The newest "What's new" the account has seen, as a release number. Null
-- means none. Finishing or skipping the tour sets it too, so new accounts
-- never see one.
alter table users add column if not exists whats_new_version integer;

-- When the account answered Collection's one-time "Already settled?"
-- question. Null means it hasn't been answered yet.
alter table users add column if not exists already_settled_answered_at timestamptz;

-- True once a Hati with Collection finished the session. A finished session
-- without it was finished before Collection, which is what decides whether
-- it can be marked as already settled. It is never set back once true.
alter table expense_sessions add column if not exists finished_with_collection boolean;
```

- **Existing rows:** all three start null.
  - Every onboarded account is due What's new.
  - No account has answered the question.
  - Every existing finished session counts as pre-Collection, including the ones the owner finished on the
    `collection` branch locally. Those with payments are never offered (BR-S1).
- **Idempotent:** each statement is `if not exists`. **Non-destructive:** three nullable columns with no default,
  so the change is catalog-only, with no backfill and no rewrite.
- **The owner applies it** to Neon `main`, with `npx vite-node scripts/db/apply-schema.ts`.
  - It must run **before** any `api/` file is edited. The new `loadSessions` and `GET /api/user` select the new
    columns, and against an unaltered database they return 500.
  - The developer stops at task 1 until the owner confirms it ran.
  - **stg and prod:** the devops-engineer runs it with `DATABASE_URL_OVERRIDE` before the hop that first brings
    this code there.
- **Old code against the new columns** (sit, qat and uat until this ships there) is unaffected. Its selects name
  their columns, and its session PUT's insert and `on conflict … set` don't list the new one.
- **A tab on the old bundle against the new server:**
  - Its session PUT has no `finishedWithCollection`, so it parses as false. A stored true stays true, because the
    update ORs it (section 4).
  - A session it finishes stays unmarked. That's correct: it was finished by a Hati without Collection.
  - Its `PUT /api/user` with no body stamps the onboarding time and the What's new version, as a new client's
    does.
- **Rollback:** leave the columns. Never drop them on `main`.

## 4. API contract

Every route keeps the existing rules:
- `getUserId` first: 401 without a user, and 500 if auth is misconfigured.
- An explicit ownership check: another account's id is a 404.
- Validation in `api/_validate.ts`.
- `sql` templates only.
- Imports from `src/` use `.js`.

### Sessions: `finished_with_collection`

- **`src/types/index.ts`.** `Session` gains:

  ```ts
  /**
   * True once a Hati with Collection finished the session. A finished session
   * without it was finished before Collection, and can be marked as already
   * settled (BR-S1). Never set back to false.
   */
  finishedWithCollection: boolean;
  ```

- **`parseSession`** (`src/lib/storage.ts`): `finishedWithCollection: raw.finishedWithCollection === true`, so an
  older body without it is still accepted. **`migrateV1`:** `false`.
- **`loadSessions`** (`api/_shared.ts`):
  - The sessions query also selects `finished_with_collection`.
  - `SessionRow` gains `finished_with_collection: boolean | null`.
  - The mapping adds `finishedWithCollection: s.finished_with_collection === true`.
- **PUT `/api/sessions/:id`:**
  - Add the column to the insert, with `${session.finishedWithCollection}`.
  - Add to `on conflict … set`:

    ```sql
    finished_with_collection = coalesce(expense_sessions.finished_with_collection, false)
                               or excluded.finished_with_collection
    ```

  - Extend the comment: the mark only ever turns on, so an older client's save, or a re-save of a finished
    session, never clears it.
  - The statuses are unchanged.

### `POST /api/payments`: a cap of 200

- **`src/lib/collection.ts`:**

  ```ts
  /**
   * The most payments one request records. It covers every pair of a 20-member
   * group (190), so marking such a session settled is still one all-or-nothing
   * request (BR-S2).
   */
  export const PAYMENTS_PER_REQUEST_MAX = 200;
  ```

- **`parsePaymentsInput`:** `list.length > 100` becomes `list.length > PAYMENTS_PER_REQUEST_MAX`, imported from
  `'../src/lib/collection.js'`.
- Nothing else changes. The handler already checks each entry against `settlementPairs` under the session lock.
  Its per-entry inserts stay as they are; 200 of them run well inside the 30-second deadline.
- **409 handling** is unchanged on the server. The client treats `over_remaining` on a settle as "already done
  elsewhere" (BR-S15, section 5).

### `DELETE /api/payments?sessionId=…` (new, in `api/payments/index.ts`)

This undoes "already settled" in one atomic statement (R6).

- **Validation:** `parseSessionIdQuery(req.query.sessionId)` in `_validate.ts`. It returns the id when the value
  is a string that `isShortText` accepts, and null otherwise. A null is 400 `{ error: 'A session id is required.' }`.
- **Order:**
  1. 401.
  2. A POST takes today's path.
  3. A DELETE parses, then runs `if (!(await ownsSession(userId, sessionId)))`, giving 404
     `{ error: 'No such session.' }`. That covers another account's id, and one deleted meanwhile.
  4. Then:

     ```sql
     delete from session_payments p
     using expense_sessions s
     where p.session_id = s.id and s.id = ${sessionId} and s.user_id = ${userId}
     ```

  5. Then 204, whatever the row count. Nothing left to delete still means it's done.
- Any other method is 405 with `Allow: POST, DELETE`.
- The server doesn't check that the session is pre-Collection. These are the user's own payments, and the client
  offers this only on marked cards. A fully paid session can't take a new payment meanwhile, because every line
  would refuse it with `over_remaining`, so the set being deleted is the set on screen.

### `GET /api/user`

`select onboarded_at, display_name, nicknames, whats_new_version, already_settled_answered_at`. The response
adds:

```json
{
  "whatsNewVersion": null,
  "alreadySettledAnsweredAt": null
}
```

- `whatsNewVersion` is the integer or null.
- `alreadySettledAnsweredAt` is an ISO string or null, through the same `new Date(...).toISOString()` as
  `onboardedAt`.

### `PUT /api/user`: an optional `mark`

- **Validation:** `parseUserMark(raw): 'onboarding' | 'whatsNew' | 'alreadySettled' | null`.
  - `raw` is `undefined` or `null`: `'onboarding'`. That's what `useOnboarding` and every old tab send today, with
    no body.
  - A plain object whose `mark` is `'whatsNew'` or `'alreadySettled'`: that value.
  - Anything else: null, and 400 `{ error: 'Malformed request.' }`.
- **Body parsing:** as the PATCH does, `typeof req.body === 'string' ? JSON.parse(req.body || 'null') : req.body`.
- **Writes**, after `ensureUser`:
  - **`'onboarding'`:** stamps both values in one statement, so a new user can never end up onboarded but due a
    What's new (BR-W3). Then today's response, `{ onboardedAt }`:

    ```sql
    update users set onboarded_at = now(),
      whats_new_version = greatest(coalesce(whats_new_version, 0), ${WHATS_NEW_VERSION})
    where id = ${userId}
    ```

  - **`'whatsNew'`:**
    `update users set whats_new_version = greatest(coalesce(whats_new_version, 0), ${WHATS_NEW_VERSION}) where id = ${userId}`,
    then 204.
  - **`'alreadySettled'`:**
    `update users set already_settled_answered_at = coalesce(already_settled_answered_at, now()) where id = ${userId}`,
    then 204.
- **Statuses:** 200, 204, 400, 401, 405, and 500 for misconfigured auth or a body that isn't JSON.
- **`src/lib/whatsNew.ts` (new):** no imports, so the API can import it with `.js`.

  ```ts
  /** The release whose "What's new" is current. A later release bumps it, and each account sees that one once. */
  export const WHATS_NEW_VERSION = 1;

  /**
   * Whether this account is due the current "What's new": already onboarded
   * (a new account gets the tour instead, BR-W3), and hasn't seen this version
   * (BR-W1, BR-W2). Anything unreadable counts as not seen.
   */
  export function whatsNewDue(onboardedAt: unknown, seenVersion: unknown): boolean {
    const seen = typeof seenVersion === 'number' ? seenVersion : 0;
    return onboardedAt !== null && onboardedAt !== undefined && seen < WHATS_NEW_VERSION;
  }
  ```

## 5. Business logic

### Money rules

- **"Settle" records**, for each settlement pair of the session, one payment of `amountCents − paid` on that pair,
  where `paid` counts exact-pair payments only. A pair with nothing left gets no entry.
  - Whole centavos, from the same `settlementPairs` as the Summary and the PDF, so the amounts match the
    statement exactly.
  - An eligible session has no payments, so every entry is the pair's full amount (BR-S2).
- **One session is one request, all or nothing.** The server's lock and its `over_remaining` check stop a double
  settle across devices.
- **Zero values:**
  - A session with no pairs is never offered.
  - A session with no pairs and an unknown "me" is Settled, reading "Nothing to collect. Everyone's even." (Q4).
    This applies to sessions finished after Collection as well.
- **Closed sessions only.** Collection only builds finished sessions, and the server refuses a payment on a draft.

### `src/lib/collection.ts`

- **`CollectionCard` gains:**

  ```ts
  /** How many settlement pairs the session has, the user's or not. */
  pairCount: number;
  /** Every pair is fully paid. True when there are none. */
  allPairsPaid: boolean;
  /**
   * Finished before Collection, with at least one pair, and every pair paid:
   * how a session marked "already settled" looks (S-A1). It gets the card's
   * Undo and sorts by its finish date (Q3).
   */
  presettled: boolean;
  /** BR-S1: offered "Already settled", on the card and in the question. */
  offersAlreadySettled: boolean;
  ```

- **`buildCard`:**
  - Compute `const pairs = settlementPairs(session)` for every session, not only when "me" is a member. Build the
    user's lines from it, as today.
  - `paidOn(pair)` sums the `session.payments` matching the pair exactly.
  - `allPairsPaid = pairs.every((p) => paidOn(p) >= p.amountCents)`.
  - **Bucket (BR-S3, Q4):**
    `allPairsPaid ? 'settled' : me.kind === 'unknown' ? 'needsSetup' : settledLineCount === lines.length ? 'settled' : 'outstanding'`.
    The comment says why: "Every pair paid means nothing is left to collect from anyone, so there is no reason to
    ask who the user is (BR-S3)."
  - `presettled = !session.finishedWithCollection && pairs.length > 0 && allPairsPaid`.
  - `offersAlreadySettled` is true only when all of these hold:
    - `!session.finishedWithCollection`;
    - `session.payments.length === 0`;
    - `pairs.length > 0`;
    - `pairs.length <= PAYMENTS_PER_REQUEST_MAX`;
    - `bucket !== 'settled'`.
  - `settledAt` is unchanged: the latest counted payment, or the finish time.
- **`settlePayments(session: Pick<Session, 'members' | 'records' | 'payments'>): Omit<NewPayment, 'id'>[]`:** one
  entry per pair with `remaining > 0`, at `remaining`, in `settlementPairs` order.
- **`buildCollection`:**
  - `Collection` gains `alreadySettledOffers: CollectionCard[]`: the cards in `needsSetup` and `outstanding` with
    `offersAlreadySettled`, sorted by `byFinished` (newest finished first, BR-S9).
  - The Settled sort becomes
    `ms(b.presettled ? b.session.closedAt : b.settledAt) - ms(a.presettled ? a.session.closedAt : a.settledAt) || byId(…)`,
    so marking a batch doesn't push recently collected sessions down (Q3).
  - The totals are unchanged: they count Outstanding only, so marking removes a session's amounts from both tiles
    (BR-S4).

### `src/hooks/useServerSessions.ts`

- **`PaymentResult`'s failure variant** gains `code?: string`, set from `body?.code`.
- **`addPayments(sessionId, payments, onSettled?, options?: { quiet?: boolean })`** now **returns its `work`
  promise**, which never rejects. With `quiet`, it never calls `fail`: the caller reports. Callers that ignore the
  return value are unchanged.
- **New `settleSessions(sessionIds: string[]): Promise<{ settled: string[]; failed: string[] }>`:**
  1. For each id:
     - If the session is gone, or already has any payment, it's done. This is BR-S15: another device got there
       first.
     - Otherwise, `entries = settlePayments(session).map((p) => ({ ...p, id: createId('pay') }))`. If that's empty,
       it's done.
     - Otherwise call `addPayments(id, entries, onSettled, { quiet: true })`, all at once (S-A3).
       - `onSettled` notes a failure unless `result.ok`, or `result.code === 'over_remaining'` (already settled
         elsewhere; `addPayments` has already merged the server's payments), or the session is gone.
       - It returns true, so no refusal is bannered.
  2. `await Promise.all(...)`.
  3. If any failed, report once with `fail({ kind: 'payment', sessionId: null, message })`, where the message is
     `` `Couldn't mark “${title}” as settled. Tap “Already settled” on it to try again.` `` for one, and
     `` `Couldn't mark ${n} sessions as settled. Tap “Already settled” on each to try again.` `` for more (BR-S14).
  4. Return the lists.

  Each session's optimistic payments go on screen at once, so the cards move to Settled immediately. A failure
  takes its payments off again, and the card returns with its button.
- **New `removeAllPayments(sessionId: string): void`:**
  1. Snapshot the session's payments. Return if there are none.
  2. `setPayments(sessionId, () => [])`, `countPaying(sessionId, 1)`, and add each id to `removing`.
  3. **Work:**
     1. Await every `adding.current.get(id)` for those ids.
     2. Under `withDeadline`, send
        `DELETE ${PAYMENTS_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`.
     3. A 204 or 404 is done, so `resolveFailure(…, 'payment', sessionId)`.
     4. **Otherwise,** if the session still exists, put back each snapshot payment not already present. Then call
        `fail({ kind: 'payment', sessionId, message })`, where the message is
        `` "Undoing “already settled” is taking too long. Tap Try again to see whether it was undone." `` on a
        timeout, and otherwise `` `Couldn't undo “already settled” (${status}), so its payments are still recorded.` ``.
  4. `finally`: `settledDuringLoad.current.add(sessionId)`, `countPaying(sessionId, -1)`, and remove the ids from
     `removing`.

  It's atomic on the server, so a failure is all or nothing, and "Try again" always shows what the server has
  (AC-S5.4).
- **New `appendAll(next: Session[]): void`** (dev-only; item C):
  1. `const fresh = next.filter((s) => !sessionsRef.current.some((p) => p.id === s.id))`.
  2. `commit([...sessionsRef.current, ...fresh])`.
  3. Then, for `fresh` only: create (POST), PUT, and POST its payments. These are the same three requests
     `replaceAll` sends per session; extract that loop body into a local `seedOne(session)` used by both.
  4. It never sends a DELETE, and never PUTs an existing session.
  5. On failure, `fail({ kind: 'seed', … })` as `replaceAll` does.
- Add `settleSessions`, `removeAllPayments` and `appendAll` to `Result`, with doc comments, and to the return
  value.

### `src/context/SessionsStoreContext.tsx`

- **`createSession`** adds `finishedWithCollection: false`.
- **`closeSession`** adds `finishedWithCollection: true` to the closing session, in the same save that finishes it.
  So the mark can't be missing on a session finished with Collection (Q1).
- **Pass-throughs**, each with a doc comment, added to the value and its dependencies:
  - `settleSessions`;
  - `removeAllPayments`;
  - `appendSessions: (sessions: Session[]) => void`, wrapping `appendAll`.

### `src/hooks/useOnboarding.ts`

- **Result** gains `whatsNewDue: boolean` and `markWhatsNewSeen: () => void`.
- **The read:** the existing GET also reads `whatsNewVersion`, and sets
  `setWhatsNewDue(whatsNewDue(body.onboardedAt, body.whatsNewVersion))`.
  - A failed read leaves it false. Not knowing is no reason to interrupt (BR-W8).
- **`markWhatsNewSeen`** mirrors `markSeen`:
  - `setWhatsNewDue(false)` at once.
  - Then `PUT /api/user` with `Content-Type: application/json` and `{ "mark": "whatsNew" }`.
  - A failure is silent; at worst it shows once more.
- **`markSeen`:** its PUT is unchanged (no body), and the server now stamps the What's new version with it. It also
  calls `setWhatsNewDue(false)`.
- Keeping the welcome, the tour and What's new in this one hook, from one read, means they can't race (R10).

### `src/context/ProfileContext.tsx`

- **`ProfileValue`** gains:
  - `alreadySettledAnswered: boolean`, read from `body.alreadySettledAnsweredAt != null` on load;
  - `answerAlreadySettled: () => void`.
- **`answerAlreadySettled`** sets the value true at once, then `PUT /api/user` `{ mark: 'alreadySettled' }` under
  `withDeadline`. It's outside the PATCH chain, since it touches neither name.
- A failure is silent. The next load re-asks with the live N (E-S14). After "Yes", N is 0, so nothing is asked.

## 6. UI

New text is exactly as written. All colours come from existing tokens, already checked for AA: `--text` 13.84:1
and `--text2` 6.36:1 on `--surface`, and `--accent-text` for the onboarding-dialog titles, as today.

### `OnboardingDialog` (shared by the welcome, all set, What's new and Already settled)

- **`message: ReactNode`.** It renders in `<div className={styles.message}>` instead of `<p>`. The global reset
  zeroes margins, so the existing string messages look the same.
- **`stacked?: boolean`.** Adds `styles.stacked` to `.actions`:

  ```css
  @media (max-width: 640px) {
    /* Three buttons don't fit side by side at 375px. Stacked in reading order,
       the primary last, nearest the thumb. */
    .stacked {
      flex-direction: column;
      align-items: stretch;
    }
  }
  ```

- **`.points`** (new), for What's new's two points:
  `display: flex; flex-direction: column; gap: 8px; text-align: left;`.
- Escape calls `onDismiss`, and the backdrop does nothing, as today. The welcome and "You're all set!" dialogs are
  otherwise unchanged.

### What's new (`App.tsx`, US-W1, US-W2)

- **State:**
  - `const { shouldRun: firstLogin, markSeen, whatsNewDue, markWhatsNewSeen } = useOnboarding()`.
  - `const [whatsNewPreview, setWhatsNewPreview] = useState(false)`, dev only.
  - `const whatsNewOpen = phase === 'off' && (whatsNewDue || whatsNewPreview)`.
  - `firstLogin` and `whatsNewDue` can't both be true, because one needs `onboarded_at` null and the other needs it
    set. The `phase` check also keeps it away from a running tour (BR-W5).
- **Placement:** inside the main shell, beside the other `OnboardingDialog`s. That's after the first load, and on
  whatever screen the app opens to (BR-W4).

```tsx
<OnboardingDialog
  open={whatsNewOpen}
  title="What's new in Hati"
  message={
    <span className={onboardingStyles.points}>
      <span><strong>Collection.</strong> A new tab for finished sessions: see who owes you and who you owe, and record payments as they come in, even part payments.</span>
      <span><strong>Your name.</strong> Set it in Profile, in your account menu, so Hati knows which member is you.</span>
    </span>
  }
  onDismiss={closeWhatsNew}
>
  <Button variant="ghost" onClick={closeWhatsNew}>Got it</Button>
  <Button variant="primary" autoFocus onClick={() => { closeWhatsNew(); setScreen({ kind: 'collection' }); }}>
    Take me to Collection
  </Button>
</OnboardingDialog>
```

- **Closing:** `closeWhatsNew` calls `if (whatsNewPreview) setWhatsNewPreview(false); else markWhatsNewSeen();`.
  A preview never writes the marker.
- **Import:** `onboardingStyles` from `./components/onboarding/OnboardingDialog.module.css`.
- **Phone:** the two buttons fit side by side at 375px, so it isn't `stacked`. The text wraps and is left-aligned
  inside the centred dialog.
- **Desktop:** the same dialog, 26rem wide.

### The "Already settled?" question (`AlreadySettledDialog.tsx`, new; US-S1 to US-S3)

**Props:**

```ts
{
  offers: CollectionCard[];
  onAnswer: (answer: { settle: string[] }) => void;
}
```

`settle` is the session ids to mark, empty for "No". The component holds `step: 'question' | 'choose'` and
`ticked: Set<string>`.

**`step === 'question'`:**
- An `OnboardingDialog` with `stacked`, open.
  - Title: "Already settled?"
  - Message: `n === 1 ? 'You have 1 session finished before Collection. Was it already settled?' : `You have ${n} sessions finished before Collection. Were they already settled?``.
  - `n` is `offers.length`, live (BR-S7).
- **Buttons, in order:**
  - ghost "No, track them": `onAnswer({ settle: [] })`;
  - default "Let me choose": `setStep('choose')`;
  - primary "Yes, all settled": `onAnswer({ settle: offers.map((c) => c.session.id) })`.
- `onDismiss` (Escape) is "No" (Q2). The backdrop does nothing.

**`step === 'choose'`:**
- The same `OnboardingDialog`, with `stacked` and the title "Which were already settled?".
- **Message:** `<fieldset className={styles.list}>`, with a visually hidden `<legend>`, "Sessions finished before
  Collection". It has one `<label className={styles.row}>` per offer, in `offers` order:
  - `<input type="checkbox">`;
  - `<span className={styles.rowText}><span className={styles.rowTitle}>{sessionDisplayTitle(s)}</span><span className={styles.rowMeta}>{`Finished ${formatLocalDate(s.closedAt ?? s.createdAt)}`}</span></span>`.
  - Nothing is ticked at first.
- **Buttons:**
  - ghost "Back": `setStep('question')` and clear `ticked`;
  - primary `` `Mark ${ticked.size} as settled` ``, disabled while `ticked.size === 0`:
    `onAnswer({ settle: [...ticked] })`.
- `onDismiss` (Escape) is Back. Nothing is stored (AC-S2.3).

**`AlreadySettledDialog.module.css`:**

```css
/* A long list scrolls inside the dialog, so Back and Mark stay in reach (AC-S2.5). */
.list { display: flex; flex-direction: column; gap: 2px; max-height: min(50vh, 20rem); overflow-y: auto; margin-top: 6px; padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); text-align: left; min-width: 0; }
.row { display: flex; align-items: center; gap: 10px; min-height: 32px; cursor: pointer; }
.row input { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }
.rowText { display: flex; flex-direction: column; min-width: 0; }
.rowTitle { font-size: 13px; color: var(--text); overflow-wrap: anywhere; }
.rowMeta { font-size: 12px; color: var(--text2); }
.srOnly { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

@media (max-width: 640px) {
  .row { min-height: 38px; }
}
```

### Collection page (`CollectionPage.tsx`)

- **New props:**
  - `canAsk: boolean`. `App` passes `phase === 'off' && !whatsNewOpen && !profileOpen && !naming`.
  - `previewSettled?: boolean`, dev only.
- **The question shows when** all of these hold:
  - `canAsk`;
  - `profile.status === 'ready'`;
  - `(previewSettled || !profile.alreadySettledAnswered)`;
  - `collection.alreadySettledOffers.length > 0`.

  It's rendered after the page content. It shows over a card just landed on from Finish, which is never offered
  (BR-S6, E-S12). It doesn't show during the tour (E-S11), over What's new (BR-W10) or over a dialog.
- **`onAnswer({ settle })`:**
  1. If not previewing, call `profile.answerAlreadySettled()`. It's stored whatever the outcome (BR-S14).
  2. If `settle` is non-empty:
     - Call `void settleSessions(settle)`.
     - Set the announcement to `settle.length === 1 ? 'Session fully settled. Moved to Settled.' : `${settle.length} sessions moved to Settled.``
       (BR-S13).
     - Move focus to the Settled toggle on the next frame. The section appears once the optimistic payments land.
- **The per-card button:** `onAlreadySettled={() => { lastPaid.current = id; void settleSessions([id]); }}`.
  - **The announcement effect:** its condition `buckets.current.get(id) === 'outstanding'` becomes
    `const prev = buckets.current.get(id); prev !== undefined && prev !== 'settled'`, so a Needs setup card moving
    to Settled is announced too. Before this, that move couldn't happen through a payment.
- **`App`:**
  - Passes `canAsk` and `previewSettled`.
  - The `collection` screen gains `previewSettled?: boolean`.

### `CollectionCard.tsx`

- **New prop:** `onAlreadySettled: () => void`.
- **`hasLine` fix (R3):** `const hasLine = (card.me.kind === 'member' && card.me.picked) || card.me.kind === 'notInSession';`.
  An unknown "me" on a Settled card must never read "You're not in this session".
- **`everyonesPaid`:** `const everyonesPaid = card.pairCount > 0 && card.allPairsPaid && card.lineCount === 0;`.
  That's a fully paid session where the user has no lines of their own on screen.
- **`expandable`:** `setup || card.lineCount > 0 || hasLine || card.presettled || everyonesPaid`.
- **`summaryDetail`'s settled branch**, before today's member cases:
  - `me.kind === 'notInSession'`: `everyonesPaid ? ["Everyone's paid"] : []`.
  - `me.kind === 'unknown'`: `card.pairCount === 0 ? ["Nothing to collect. Everyone's even."] : ["Everyone's paid"]`
    (Q3, Q4).
  - Members: as today. A member with no lines of their own keeps "Nothing to collect. You're even with everyone.",
    which is true for them.
- **"Already settled" button**, rendered between the `</h3>` and the body, whenever `card.offersAlreadySettled`.
  That's collapsed or expanded, and outside the header's toggle:

  ```tsx
  <div className={styles.alreadySettled}>
    <Button size="sm" aria-label={`Mark “${title}” as already settled`} onClick={onAlreadySettled}>
      Already settled
    </Button>
  </div>
  ```

  CSS: `.alreadySettled { display: flex; }`, which keeps it left-aligned under the summary. It's 38px tall on
  phone through the shared `Button` rule.
- **Body**, when not setup, in order:
  1. `YouAre` (if `hasLine`);
  2. the groups;
  3. if `everyonesPaid`, `<p className={styles.detail}>Every line in this session is marked as paid.</p>`;
  4. `MarkAll` (Outstanding only);
  5. if `card.presettled`, `<UndoSettled card={card} title={title} />`.
- **`UndoSettled`** (new, in the same file):
  - `<div className={styles.markAll}>` holds `Button` "Undo “Already settled”", with
    `aria-label={`Undo “already settled” on ${title}`}`.
  - It opens `ConfirmDialog` with `destructive`:
    - title "Undo “already settled”?";
    - message `` `This removes the payments recorded when “${title}” was marked as settled. It goes back to being tracked.` ``;
    - confirm "Undo".
  - Confirming calls `removeAllPayments(card.session.id)`.
  - It shows on member and non-member cards alike (Q3). The per-line Undo on a member's lines still works as today
    (AC-S5.3).

### Prompt tweak (item D): `NeedsSetup` in `CollectionCard.tsx`, and `FinishSessionDialog.tsx`

- In both, the legend becomes
  `suggested !== null && selected === suggested ? nicknamePrompt(suggested) : 'Which one are you?'`.
- It follows the selection: choosing anyone else, or "I'm not in this session", shows "Which one are you?".
  Choosing the suggested member again brings the prompt back.
- The Needs setup button keeps its rule: "Yes, that's me" only while the suggestion is selected.

### Dev tooling (`DevSessionsBar.tsx`, `HomePage.tsx`, `App.tsx`)

All of this is DEV only. `DevSessionsBar` is already rendered only in development and lazy-imported.

- **Seeds (item C):**
  - "Seed Sessions (add)" calls `appendSessions(buildDemoSessions())`.
  - "Seed Needs setup (add)" calls `appendSessions(buildNeedsSetupSessions())`.
  - `seed(append)` becomes `seed()` for "replace" only.
- **"replace" and "Clear All" are unchanged.** Their comment notes that on the shared Neon `main` they delete every
  session of the signed-in account, real ones included, with their payments (cascade).
- **"Preview What's new"** (new button) calls an `onPreviewWhatsNew` prop. `HomePage` passes it through, and `App`
  supplies `() => setWhatsNewPreview(true)` in DEV. The dialog's buttons act, but write no marker.
- **"Ask Already settled"** (new button) calls `onAskAlreadySettled`, and `App` supplies
  `() => setScreen({ kind: 'collection', previewSettled: true })`. The question shows even if answered, and an
  answer isn't stored. **A "Yes" or a "Mark" still records real payments.** It's for test accounts, and on test
  sessions only.
- `demoSessions.ts`: every seeded session gets `finishedWithCollection: false`, so seeded finished sessions without
  payments can be offered on a test account.

### Phone (375px) and desktop (1280px)

- **New mobile-only CSS:** `.stacked` in `OnboardingDialog.module.css`, and `.row` in
  `AlreadySettledDialog.module.css`, both inside `@media (max-width: 640px)`. Everything else is one layout at
  every width.
- The checklist scrolls inside the dialog, and long titles wrap with no sideways scroll.
- The card button wraps its row like any `Button`.
- At 1280px the dialogs are 26rem wide and centred. Nothing about Home, History or Collection's layout moves.

## 7. Onboarding tour impact

- **No step changes, and no `data-tour` attribute is added, moved, renamed or duplicated.**
- The tour's own session is never finished, so it's never offered.
- **While the tour runs** (`phase === 'running'`, including the dev Preview Tour), `canAsk` is false, so its
  Collection step never triggers the question. What's new can't open either, because of the `phase` check.
- **New accounts:** finishing or skipping stamps `onboarded_at` and the What's new version in one write. They never
  see What's new.
- **Mid-tour reload:** the welcome shows again, as today. What's new doesn't, because `onboarded_at` is still null.
- `App.tsx` changes, so run `steps.test.ts` and `targets.test.ts`. They must pass unchanged.

## 8. Test plan

Write each Vitest case before its code, and watch it fail. Fixtures are `collection.test.ts`'s trips, with
`finishedWithCollection: false` unless a case says otherwise.

### Vitest

| File | Cases |
|---|---|
| `src/lib/collection.test.ts` | See the list below. |
| `src/lib/whatsNew.test.ts` **(new)** | `whatsNewDue`: `(null, null)` false; `('2026-…', null)` true; `('2026-…', 0)` true; `('2026-…', 1)` false; `('2026-…', 2)` false; `('2026-…', '1')` true (unreadable counts as unseen). |
| `src/lib/apiValidation.test.ts` | **`parsePaymentsInput`:** 200 entries accepted, 201 rejected; the old "over 100" case becomes "over 200". **`parseUserMark`:** `undefined` and `null` give `'onboarding'`; `{ mark: 'whatsNew' }` and `{ mark: 'alreadySettled' }` pass; `{}`, `{ mark: 'x' }`, `'whatsNew'` and `[]` give null. **`parseSessionIdQuery`:** `'session_a'` passes; `''`, `undefined`, an array and 201 characters give null. |
| `src/lib/sessionValidation.test.ts` | `finishedWithCollection`: `true` is kept; absent, `'true'` and `1` give `false`, and the session is still accepted. |
| `src/lib/storage.test.ts`, `writeQueue.test.ts`, `sessionLabel.test.ts`, `activity.test.ts`, `sessionName.test.ts` | Factories gain `finishedWithCollection: false`. `sameSessionContent` is false when only it differs. The v1 migration gives `false`. |
| `steps.test.ts`, `targets.test.ts`, `apiImports.test.ts`, `demoData.test.ts`, `calculations.test.ts` | Unchanged, and must pass. `apiImports` now reaches `whatsNew.ts`. |

**`src/lib/collection.test.ts`:**

- **The bucket rule (BR-S3, R2):**
  - Trip A, "me" unknown, every pair paid: Settled, with `allPairsPaid` and `presettled`.
  - The same with "me" Renmar: Settled, with Renmar's lines Paid.
  - Trip A, unknown, one pair paid: Needs setup.
  - Trip A, Renmar, every pair paid but `finishedWithCollection: true`: Settled, but not `presettled`.
- **Zero lines (Q4):** Trip D with "me" unknown: Settled, `pairCount` 0. With "me" Renmar, unchanged.
- **`offersAlreadySettled` (BR-S1, AC-S4.4, AC-S7.1):**
  - True for Trip A unknown (Needs setup), and for Trip A Renmar unpaid (Outstanding).
  - False when `finishedWithCollection` is true.
  - False with any one payment.
  - False for Trip D (no pairs).
  - False when already Settled (a member with no own lines, E-S6).
  - False for a generated 21-member session with 210 pairs. Build it with one purchase per pair `i<j`, payer `i`,
    owner `j`.
- **`settlePayments`:** Trip A gives three entries at 30000, 30000 and 10000, including pairs that don't involve
  Renmar (AC-S1.8). A pair already paid in part gives its remainder.
- **`buildCollection`:**
  - `alreadySettledOffers` holds the offered cards from Needs setup and Outstanding, newest finished first, and
    leaves out the rest.
  - The Settled order puts a presettled session by its `closedAt` among the others' `settledAt` (Q3).
  - The totals leave presettled sessions out (BR-S4).

### Reviewer checks (surgeon-reviewer)

- **R-S1.** The new DELETE and the PUT marks: `getUserId` first; validation in `_validate.ts`; ownership through
  `ownsSession` and the `using` join; `sql` templates only.
- **R-S2.** The session PUT's `finished_with_collection` ORs the stored value and never clears it. `closeSession`
  sets it in the finishing save.
- **R-S3.**
  - `appendAll` sends no DELETE, and no PUT for an existing id.
  - `settleSessions` reports one failure, and doesn't banner an `over_remaining`.
  - `removeAllPayments` restores on failure.
  - `addPayments`'s other callers are unchanged.
- **R-S4.**
  - No `data-tour` changes.
  - Mobile rules only inside the 640px query.
  - Every new button has its accessible name.
  - The dev previews are DEV-only, and write no marker.
  - No new dependency.

### ui-ux-tester walkthrough

**Ground rules (R1). These are hard rules.**
- Test only on the **second test account**. Never on the owner's account, whose 11 real sessions on the shared
  Neon `main` will all be offered.
- **Never** answer "Already settled?" on the owner's account in any way. "Yes" writes payments to real sessions,
  and "No" or Escape uses up the owner's one-time question. If it appears there, reload, and don't touch it.
- On the test account:
  - Create and finish sessions named "UI test …" only.
  - Make pre-Collection sessions with "Seed Sessions (add)" or "Seed Needs setup (add)".
  - Re-run the question with "Ask Already settled", and What's new with "Preview What's new".
- Never use "Seed Sessions (replace)" or "Clear All".

| # | Steps | ACs |
|---|---|---|
| T-S1 | **Setup:** on the test account, seed with "Seed Sessions (add)" and "Seed Needs setup (add)". In the Network panel there is no DELETE, and no PUT for a session that existed before. Earlier sessions keep their `createdAt` (check `GET /api/sessions`). | item C |
| T-S2 | Open Collection. "Already settled?" shows with the right N and the singular or plural text. The three buttons stack at 375px and sit in a row at 1280px. A backdrop click does nothing. Escape closes it, records nothing, and it doesn't return on reload or on a second browser profile. | S1.1, S1.4 to S1.7, S3.1 |
| T-S3 | "Ask Already settled", then "Let me choose": nothing ticked, and Mark is disabled. Tick 2: "Mark 2 as settled". Back, or Escape, returns to the question. Confirm 2: exactly those move to Settled, with one announcement, and the others keep their button. With 30 offers at 375px, the list scrolls inside the dialog, Back and Mark stay reachable, and a 200-character title wraps. | S2.1 to S2.5, S4.4 |
| T-S4 | "Ask Already settled", then "Yes, all settled": every offered card goes to Settled, including Needs setup ones, with no "Which one are you?". The strip drops accordingly. On a 4-line session, one `POST /api/payments` with 4 entries. | S1.2, S1.3, S1.8, BR-S4 |
| T-S5 | **Per card:** "Already settled" shows on a collapsed card, and tapping it doesn't toggle the card. Its accessible name is "Mark “…” as already settled". One tap moves it to Settled, with "Session fully settled. Moved to Settled." announced, and focus on the Settled toggle. It doesn't show on a card with a payment, on one finished in this build, or on a Settled card. | S4.1 to S4.5, S7.1, S7.2 |
| T-S6 | **Settled view:** a marked card with "me" known shows Paid lines, each with per-line Undo, plus "Undo “Already settled”". With "me" unknown, collapsed: "Everyone's paid". Expanded: "Every line in this session is marked as paid." and Undo, with no "You're not in this session" and no picker. Setting a profile name that matches keeps it in Settled with the lines Paid. A no-line session with "me" unknown reads "Nothing to collect. Everyone's even.". Marked sessions sort by finish date. | S6.1 to S6.3, Q3, Q4 |
| T-S7 | **Undo:** the confirmation text is correct, and Cancel changes nothing. Undo: one `DELETE /api/payments?sessionId=…`. The card returns with its lines Unpaid and "Already settled" back. Offline: the payments stay, the banner says so, and "Try again" shows the server's copy. | S5.1 to S5.4 |
| T-S8 | **Failures:** block `/api/payments`, then "Yes, all settled" with 3 offers. The cards return, one banner reads "Couldn't mark 3 sessions as settled. Tap “Already settled” on each to try again.", and the answer is still stored. **Two profiles:** mark a session in profile 2, then tap its button in profile 1 (not reloaded): no error, and it shows as settled. | S8 (BR-S14, BR-S15), E-S7 |
| T-S9 | **Finish landing:** finish a "UI test" draft on an account that hasn't answered. Collection lands on the card, and the question shows over it, not counting that session. | E-S12, S7.1 |
| T-W1 | **What's new** (test account, onboarded, not yet seen): it shows on load on Home, with the two points, "Got it" and "Take me to Collection". "Got it" stays on Home, and it doesn't return on reload or on a second profile. "Preview What's new", then "Take me to Collection": Collection opens, and on an account that hasn't answered, the question appears only after What's new has closed. Escape works as "Got it", and the backdrop does nothing. Text wraps at 375px. | W1.1 to W1.5, W1.8 |
| T-W2 | **New account** (sign up fresh): the welcome shows, and What's new doesn't. Skip the tour, then reload: neither shows. Reload mid-tour: the welcome shows, and What's new doesn't. | W2.1 to W2.3 |
| T-W3 | **Block `PUT /api/user`:** What's new still closes, and the app works. Block `GET /api/user`: no What's new shows. | W1.6, W1.7 |
| T-D1 | **Prompt:** on a Needs setup card with a nickname suggestion, select someone else: the legend reads "Which one are you?". Reselect the suggestion: the prompt is back. The same in the Finish picker. | item D |
| T-T1 | **Preview Tour:** every step lands, the Collection step shows no question, and the tour finishes. | section 7 |

### Checks before done

`npm run lint`, `npx tsc -b`, `npm test` and `npm run build`, with the real results reported.

## 9. Documentation impact

For the documentation-engineer, when this ships with Collection:

- **README, "Data and privacy":** the SQL block gains `users.whats_new_version`,
  `users.already_settled_answered_at` and `expense_sessions.finished_with_collection`. **"How it works",
  Collection:** marking old sessions as already settled, and the Undo.
- **API reference:** `DELETE /api/payments?sessionId=`; the payments cap is now 200; `PUT /api/user` takes
  `{ mark }`; `GET /api/user` returns the two new fields; the session PUT carries `finishedWithCollection`.
- **`docs/mobile-breakpoints.md`:** under 640px, `onboarding/OnboardingDialog.module.css` `.stacked` and
  `collection/AlreadySettledDialog.module.css` `.row`.
- **Release notes:** the What's new text. When a later release bumps `WHATS_NEW_VERSION`, document it there.
- The agents' Word documents are updated only when the owner asks.

## 10. Tasks

1. **Schema (the owner runs it).** Add the three statements to `schema.sql`. **Stop** and ask the owner, through
   the coordinating session, to run `npx vite-node scripts/db/apply-schema.ts` against Neon `main`. Don't edit any
   `api/` file until they confirm.
   → Verify: the script's output, and a second run succeeds the same way.
2. **Tests first:** section 8's Vitest cases, and the factory updates.
   → Verify: `npm test` fails on exactly the new cases.
3. **Types and pure logic:**
   - `Session.finishedWithCollection`;
   - `whatsNew.ts`;
   - in `collection.ts`: `PAYMENTS_PER_REQUEST_MAX`, `buildCard`, `settlePayments` and `buildCollection`;
   - `storage.ts` and `writeQueue.ts`;
   - `createSession`, `closeSession` and `demoSessions.ts`.
   → Verify: `npm test` passes, and `npx tsc -b` fails only at callers yet to change.
4. **API:**
   - `_validate.ts`: the cap, `parseUserMark` and `parseSessionIdQuery`;
   - `loadSessions`;
   - the session PUT;
   - `api/payments/index.ts` DELETE;
   - `api/user.ts` GET and PUT.
   → Verify on `:3000`:
   - `GET /api/sessions` carries `finishedWithCollection`;
   - `GET /api/user` carries both new fields;
   - finishing a test draft stores `finished_with_collection = true`.
5. **Client state:**
   - `useServerSessions`: `PaymentResult.code`, the `addPayments` return value and `quiet`, `settleSessions`,
     `removeAllPayments` and `appendAll`;
   - the store pass-throughs;
   - `useOnboarding`;
   - `ProfileContext`.
6. **UI:**
   - `OnboardingDialog`;
   - What's new in `App`;
   - `AlreadySettledDialog`;
   - `CollectionPage` (`canAsk`, the answer, the announcement);
   - `CollectionCard` (the `hasLine` fix, the button, the settled branches, `UndoSettled`, the legend);
   - the `FinishSessionDialog` legend.
7. **Dev:** append-only seeds, the two preview buttons, and the comment on "replace" and "Clear All".
   → Verify: "add" sends no DELETE (Network panel), on a test account.
8. **Full check:** `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and `targets.test.ts`) and
   `npm run build`, with the real results reported.
9. **Owner check:** give the owner `http://localhost:3000` and the branch, with the R1 warning. Wait for their "go"
   before handing over to the surgeon-reviewer and the ui-ux-tester.

## 11. Risks and effort

| # | Risk | Guard |
|---|---|---|
| R1 | Testing answers the question on the owner's real sessions: "Yes" writes real payments, and "No" or Escape uses up their one-time question | Hard ground rules in section 8: second test account only, never touch the dialog on the owner's account, and test sessions only. The dev "Ask Already settled" lets tests repeat on the test account without touching the owner's. The owner's check (task 9) carries the same warning. |
| R2 | The bucket rule change affects every card's status | It's pure, and unit tested for each case (section 8). The totals stay Outstanding-only. |
| R3 | An unknown-"me" Settled card would read "You're not in this session" and "You're even with everyone" | The `hasLine` fix, and dedicated settled branches, checked in T-S6. |
| R4 | A large group's pairs pass one request's cap, and splitting it would half-settle a session | The cap is raised to 200 (20 members). A session with more pairs is never offered (S-A4). Real groups are far smaller. |
| R5 | A bulk answer fires many requests and could banner each failure | `quiet` plus one summarised message. One request per session keeps each one all or nothing. |
| R6 | A per-payment undo could leave a session half-settled | A session-level DELETE in one statement. |
| R7 | Another device already settled the session (409) | `over_remaining` on a settle counts as done, and the server's payments are merged in. |
| R8 | The mark is missing on a session finished with Collection, or wiped by an old tab | It's set in the same save as Finish, and the PUT only ORs it on. |
| R9 | A marked batch floods the top of Settled | Marked sessions sort by their finish date. |
| R10 | The welcome, the tour, What's new and the question race | The first three come from one hook and one read, gated by `phase`. The question needs `canAsk`, which excludes every other dialog. |
| R11 | "Settled this way" has no stored source | It's derived (S-A1), with no storage and no drift. |
| — | New API code runs before the schema, and returns 500s | Task 1 gates on the owner's confirmation. |
| — | The dev seeds wiped real data before this fix | `appendAll` never deletes. "replace" and "Clear All" stay dangerous, and say so in a comment. Testers are told never to use them. |

**Size: large.** About 30 files, with 4 new: `whatsNew.ts`, its test, `AlreadySettledDialog` and its CSS. There are
three columns, one new route method and one extended route. **Risk: medium.** It writes payments in bulk on real
accounts, but every write is all or nothing per session, every marking is undoable in one step, and the schema is
additive.

## 12. Decisions for the owner

1. **Running the schema on Neon `main`:** three nullable columns, with no existing data changed. You run it
   yourself at task 1. *Recommendation:* run it when the developer asks.
2. **What's new on "next app load" (Q5)**, rather than the next real sign-in. Clerk keeps people signed in for
   weeks, so a sign-in could be far off. *Recommendation:* keep the next load. Say so if you want otherwise.
3. **The cap of 200 payments per request (S-A4).** Groups of 21 or more members are never offered "Already
   settled". *Recommendation:* accept.
4. **Dev-only "Preview What's new" and "Ask Already settled" buttons.** Both markers are one-way, so without these,
   each test account could test each dialog only once. "Ask Already settled" still records real payments on what
   it marks. *Recommendation:* include them, for test accounts only. Dropping them means every re-test needs a
   fresh account.
5. **Assumptions S-A1 to S-A3** stand unless you overrule them. The one most worth a glance is S-A2: a marked card
   reads "Settled <the day you marked it>", while it sorts by its finish date.

Technical choices, no input needed:
- The per-session mark is a `boolean` that only turns on.
- The What's new marker is an integer version.
- The question's answer is a timestamp.
- Marks travel as `PUT /api/user` `{ mark }`, so old clients' bodiless PUT keeps meaning "onboarding done".
- Undo is a session-level DELETE on `/api/payments`.
- "Settled this way" is derived.
- Bulk marking runs in parallel.
- `OnboardingDialog` is reused for both new dialogs, with `ReactNode` messages and an opt-in stacked layout.

## 13. Owner additions (2026-11-07)

Two refinements from the tester's UX suggestions, added by the owner at approval. They touch only Collection's
cards and page, and need no schema or API change.

- **(a) A gap above a card scrolled into view.** When Collection scrolls a card into view (the keep-in-view scroll
  after opening a card, round 2, and the landing scroll), it leaves about 10px above the card instead of putting
  it flush with the top of the screen. It's `scroll-margin-top: 10px` on `.card` in `CollectionCard.module.css`,
  which the existing `scrollIntoView({ block: 'start' })` calls already honour.
- **(b) Finding a card after it's placed.** After "Yes, that's me" or "Confirm" moves a Needs setup card to another
  section, the page scrolls to it, with the same 10px gap, and opens the Settled section first if that is where it
  landed. The card is outlined briefly: the open card's `--accent-text` border and `--shadow-md`, fading back to
  the normal border over 1.6s (the `placed` animation), with no new colours. With `prefers-reduced-motion`, there
  is no fade: the outline is held for the same 1.6s and then removed. Nothing happens when the pick doesn't move
  the card, and the card isn't opened.
- **(c) Where "Already settled" sits on an open card.** Collapsed, the button stays under the summary. Expanded, it
  leaves that spot and sits beside the card's own action, at the same button size: next to "Mark all as paid" on
  an Outstanding card, and next to Confirm / "Yes, that's me" on a Needs setup card (Confirm first, as the primary).
  The rows wrap on a phone like the other button rows. Its `aria-label` still names the session. The button is a
  different element in each place, so if it had focus when the card opened or closed, focus moves to the new one.

