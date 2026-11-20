# Spec: joined sessions, PR 4 ("Collection = active, History = done")

Status: **draft, waiting for the owner's approval.** Branch `joined-sessions-4`.

**Inputs**, owner-approved and taken as fixed:
- **The brief:** the round 5 brief, Part B (`~/.claude/plans/cached-waddling-wigderson.md`).
- **The requirements:** copied to `docs/specs/joined-sessions-4-requirements.md`, with the owner's
  answers (2026-11-21):
  - Q1: after an undo, the same link works again;
  - Q2: Needs setup cards get View details only;
  - Q3: "Your payments" lists only the viewer's own lines;
  - Q4: older unpaid sessions move to Collection without being asked again;
  - Q5: PR 4 ships with PR 1 and PR 2 (and so PR 3), and What's new v3 gains one line.

Rule and AC ids (US-H, AC-H, BR-H, BR-D, BR-A, BR-L, BR-G, EH) are the requirements'.

## 0. Branch and merge record

- `joined-sessions-4` was created from `origin/joined-sessions-2` at `6cf4255` (PR 1 + PR 2 +
  round 5 Part A).
- `origin/joined-sessions-3` at `20b5cfa` (PR 1 + PR 3 + round 5 Part A) was merged in as
  `709df55`, with `--no-ff` and merges only.
- **Conflicts: none.** `src/App.tsx`, `src/components/collection/InviteMembersDialog.tsx` and
  `src/components/collection/joinedCards.test.ts` merged automatically.
- **Checked after the merge:** `npx tsc -b` passes, and `npx vitest run` passes all 1281 tests in 54
  files, on a fresh `npm ci` in this worktree. Nothing ran against a database.

**Shipping:** PR 1 to PR 4 go to uat together (Q5). PR 4 is merged to `main` only when the owner
asks, after PR 1, 2 and 3. It isn't promoted on its own.

## 1. Summary

A finished session now lives in **one** of a viewer's two tabs:
- **Collection** while something is left for that viewer, which means Needs setup or Outstanding;
- **History** once their own lines are all paid and nothing waits on them.

The rule is today's `buildCard` bucket, unchanged (BR-H1). `settled` now means "in History", and
it's computed per viewer from data the client already has.

What changes:
- **Collection** loses its Settled section. It gains an empty-Outstanding line, which becomes the
  Collection guide's new last target. It also gains an "All settled" empty state, and a notice when
  the viewer's own action moves a card to History.
- **History** lists the viewer's settled sessions only, newest settled first, each with a status
  line. It waits for the profile, as Collection does.
- **History detail** becomes the one detail screen (BR-D1), reached from History or from **View
  details** on a card. For a session in the viewer's History it shows **"Your payments"**: their
  lines, with Undo, Change and Undo "Already settled". An action there that brings the session back
  to Collection shows a notice. The organizer also gets **Delete session** here.
- **Outstanding cards** gain **View details** and **↓ Download SOA**. The organizer's export
  carries PR 3's link and QR. **Needs setup** cards get View details only (Q2).
- **Finish and a join** land on Collection when the card is there, and on the detail page with a
  notice when it's already settled. The join outcomes' button reads "Open in Collection" or "Open in
  History" to match.
- **The invite link** works only while some line in the whole session is unpaid (BR-L1). Once
  everything is paid, the organizer can't fetch it, and a new joiner sees "Everyone has paid", with
  no session name. An undo makes the same link work again (Q1).
- **Onboarding:**
  - the Collection guide's last step moves to the new `data-tour="collection-done"`;
  - `collection-settled` goes;
  - the tour's Collection and History copy changes.
- **What's new v3** gains a third line.

**No schema change** (verified, section 3). **No API change for placement**: History placement is
client-side. **One API change, in `api/invites.ts`, for link expiry** (section 4). **No new
function**: 8 in all.

**Assumptions** (veto any before approving):
- **A1. History card status, in this order** (the first that applies):
  1. "Marked as already settled" (presettled);
  2. "You weren't in this session";
  3. "Nothing to collect. Everyone's even." (the session has no pairs);
  4. "Everyone's paid" (Hati never placed me);
  5. "You were even with everyone" (a member with no lines);
  6. `Settled {formatLocalDate(settledAt)}`.

  The requirements list these six without an order for overlapping cases, for example a member of
  a no-pairs session.
- **A2. The Change notice (AC-H6.7) shows as soon as the pick changes on screen.** A pick save has
  no completion callback today. A failed save is the existing banner's job, and the reload puts the
  session back. Undo and Undo "Already settled" wait for the server, like every payment write.
- **A3. "Everyone has paid, so the invite link no longer works."** (AC-H11.2) shows only when the
  session has at least one pair. A session where everyone is even never had a working link, so
  there's nothing to announce (BR-L5).
- **A4. What's new v3's first point still says "tap Invite members".** Round 3 renamed it
  "everywhere" but this string was missed. PR 4 edits the same text, so it becomes "tap Share with
  members".

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Types | `src/types/index.ts` | `InviteAnswer` gains `{ outcome: 'paid' }` | — |
| Schema | — | **none** (section 3) | — |
| Pure logic | `src/lib/collection.ts` | `everyLinePaid`, `historyStatus`, `bySettled`'s finish-date tie-break, `movesFromCollection` and `cameBack` (5.1) | `settlementPairs`, `buildCard`, `buildCollection` |
| Pure logic | `src/lib/joinedSessions.ts` | `joinAnswerFrom` and `joinStage` know `'paid'`; copy builders (5.2) | — |
| API | `api/invites.ts` | link expiry in the get/mint/reset branch and in `outcomeFor` (4.1) | `everyLinePaid`, `loadSessions`, `iso` |
| Client state | `src/hooks/useServerSessions.ts`, `useMemorySessions.ts`, `SessionsStoreContext.tsx` | `removeAllPayments` takes an optional `onSettled(ok)` (5.3) | the existing write |
| UI | `src/pages/CollectionPage.tsx` (+ css) | no Settled section; empty states; `collection-done`; the move notice and its focus; the arrival redirect; new props | `EmptyState`, the live region |
| UI | `src/components/collection/CollectionCard.tsx` (+ css) | the body becomes `CollectionCardBody`, exported, with a `place` prop; the View details and Download SOA row; View details on Needs setup; new props | `ExportSoaButton`, `MarkAll` (unchanged), `isPracticeId` |
| UI | `src/components/collection/LineRow.tsx` | `inHistory` hides every record and claim action; Undo reports its ending through `onPaid` | `removePayment`'s `onSettled` |
| UI | `src/components/summary/ExportSoaButton.tsx` (+ css) | `layout: 'card'` | — |
| UI | `src/pages/HistoryPage.tsx`, `src/components/sessions/SessionCard.tsx` (+ css) | settled only, ordered, the profile wait, the empty state, status and note lines | `buildCollection().settled`, `historyStatus` |
| UI | `src/pages/HistoryDetailPage.tsx` (+ css) | the back label; Your payments; notices; the Share rule; Delete session; the expired-link line | `CollectionCardBody`, `ConfirmDialog`, `deleteSessionMessage` |
| UI | `src/components/join/JoinFlow.tsx` | the `paid` dialog; "Open in Collection" or "Open in History" | `buildCard` |
| UI | `src/App.tsx` | screen shapes, arrivals, the new callbacks, What's new v3 | — |
| Tour | `src/components/onboarding/steps.ts` | the copy of the last two steps | — |
| Guide | `src/components/onboarding/guides/collectionSteps.ts` | C7 rewritten, targeting `collection-done` | — |
| Tests | see section 8 | `guides/guides.test.ts` changes (7.3) | — |

**Not touched:**
- `api/_shared.ts`, `api/sessions/*`, `api/payments/*`, `api/claims.ts`, `api/participants.ts` and
  `api/user.ts`;
- the schema, all of `src/pdf/`, the QR, and the round 3 change check;
- the guide scenes (`collectionScenes.ts`, whose K3 seed is unchanged), the engine and
  `PracticeCollection.tsx`.

## 3. Data model: none (verified)

- **Placement (BR-H1 to BR-H4)** is `buildCard`'s bucket, computed on the client from what
  `GET /api/sessions?joined=1` already sends. That's members, records, payments, claims and, for a
  participant, the D1 view.
  - A participant's bucket uses only their own lines (BR-V3), which D1 sends in full.
  - An organizer's bucket uses every pair, and the organizer gets every payment.
  - Nothing new is loaded or stored.
- **Link expiry (BR-L1)** is decided from the session's records and confirmed payments each time
  the link is fetched, previewed or used. The invite token isn't cleared, so an undo makes the same
  link work again (BR-L4, Q1). No new column or stored state.
- **"Already settled?" (Q4)** isn't asked again. The existing `already_settled_answered_at` is
  untouched, and no new marker is stored.

So nothing runs against Neon `main`.

## 4. API contract

### 4.1 Link expiry in `api/invites.ts` (BR-L1, BR-L2)

**`everyLinePaid(session)`** (new, `src/lib/collection.ts`, DOM-free) is true when
`settlementPairs(session)` is **empty or** every pair's confirmed paid amount is at least its
amount. Unlike `isFullyPaid`, a session with no pairs counts as paid (BR-L5). It takes
`Pick<Session, 'members' | 'records' | 'payments'>`.

**Get, mint or reset (`{ sessionId, reset? }`)** checks before it writes:
1. `const [session] = await loadSessions(userId, input.sessionId)`. That's owned only. No session,
   or a draft, is 404 `{ error: 'No such session.' }`, as today.
2. `everyLinePaid(session)` gives 409
   `{ error: 'Everyone has paid, so the invite link no longer works.', code: 'all_paid' }`. Nothing
   is minted or reset, and the stored token is kept (BR-L4).
3. Otherwise, today's `update … returning invite_token`, then `200 { token, participants }`. The
   participants come from step 1's session, so the second `loadSessions` call goes.

**Preview and join: `outcomeFor`.** After the `already` check and before the preview is built, it
reads the session's ledger with the `db` it was given. In the join, that's the transaction's
client, after the `for update of s` lock, so the check and the insert see the same rows.

```sql
select r.id, r.date::text as date, r.payor_mode, r.payors, r.items, r.created_at
from purchase_records r where r.session_id = ${row.id}
```

```sql
select id, debtor, creditor, amount_cents, created_at
from session_payments where session_id = ${row.id}
```

The rows map to `PurchaseRecord` and `Payment` as `_shared.ts` does. Then:
`everyLinePaid({ members: row.members, records, payments })` returns `{ outcome: 'paid' }`, with no
`sessionId`, `title` or members (AC-H11.4). The order is therefore:
1. dead (404, unchanged);
2. own;
3. already;
4. **paid**;
5. open.

The organizer and an existing member still get `own` and `already` (AC-H11.5).

These reads use the session's id from the token lookup. Nothing from them is sent except the word
`paid`, so RC-1 (no ledger without access) holds. The join path's existing
`if (outcome.outcome !== 'open') { rollback; 200 }` returns `paid` as it returns `own`.

**The response type:** `InviteAnswer` gains `| { outcome: 'paid' }`. `outcomeFor`'s return type
already excludes only `joined`.

**Statuses:** link 200, 400, 401, 404, 405, 409 (`all_paid`), 500. Preview and join are unchanged,
plus `paid` in the 200 body.

**Client handling:**
- `useInvites().getLink` already returns null for any non-200.
- The app never asks for the link of a fully paid session: Share and the SOA's `getInviteUrl` are
  offered only while `!everyLinePaid` (6.3, 6.4). `all_paid` only reaches the client in a race.
  There, Share's dialog shows its existing "Couldn't get the invite link…", and the SOA its "couldn't
  be loaded" note. That's accepted as a race.

### 4.2 Everything else

There's no other API change.
- **Placement:** History placement, the move notices and the arrivals are client-side.
- **Undo and Change** use the existing payments and session routes, with today's rules (BR-D3). The
  organizer's Undo covers their own lines only (Q3), and a joined member's Undo covers their Owed to
  you lines (BR-C4).
- **Functions:** 8 (unchanged).

## 5. Business logic

### 5.1 `src/lib/collection.ts`

- **`everyLinePaid(session)`:** as in 4.1.
- **`historyStatus(card)`** returns `{ status: string; stillOwed: boolean }`.
  - `status` follows A1's order:
    - `card.presettled` gives "Marked as already settled";
    - `me.kind === 'notInSession'` gives "You weren't in this session";
    - `card.pairCount === 0` gives "Nothing to collect. Everyone's even.";
    - `me.kind === 'unknown'` gives "Everyone's paid";
    - `card.lineCount === 0` gives "You were even with everyone";
    - otherwise `Settled ${formatLocalDate(card.settledAt)}` (AC-H3.1).
  - `stillOwed` is `!isJoined(card.session) && !everyLinePaid(card.session)` (AC-H3.2).
- **`buildCollection`'s `bySettled`** tie-breaks by finish date, newest first, before the id:
  `ms(settledOn(b)) - ms(settledOn(a)) || ms(b.session.closedAt) - ms(a.session.closedAt) || byId(...)`.
  `settledOn` is unchanged, so a presettled card sorts by its finish date (AC-H3.3).
- **`movesFromCollection(prev, next)`** returns the ids whose card was in Collection (Needs setup or
  Outstanding) in `prev`'s buckets and is `settled` in `next`'s. It's pure, and drives the move
  notice. **`cameBack(prevBucket, nextBucket)`** is `prevBucket === 'settled' && nextBucket !== 'settled'`,
  and drives the detail page's notice.
- **The bucket rule, `waitingForMeCount` and `autoOpenTarget`** are unchanged. Settled cards can't
  be waiting, so `autoOpenTarget` never picks one.

### 5.2 `src/lib/joinedSessions.ts`

- `OUTCOMES` gains `'paid'`, so `joinAnswerFrom` passes `{ outcome: 'paid' }` through.
  `JoinStage` gains `'paid'`, and `joinStage` returns it.
- **Copy builders:**
  - `movedToHistoryLine(title)`: `“${title}” is paid in full and has moved to History.`
    (AC-H8.1);
  - `movedManyLine(n)`: `${n} sessions are settled and have moved to History.` (AC-H8.2);
  - `backInCollectionLine(title, why)`, with `why` either `'undo'` or `'change'`:
    `“${title}” is back in Collection, because a payment was undone.` or
    `“${title}” is back in Collection, because you changed who you are in it.` (AC-H6.1, AC-H6.6,
    AC-H6.7);
  - `nothingToDoLine(title)`: `There's nothing for you to collect or pay in “${title}”, so it's in History.`
    (AC-H9.2, AC-H9.4).

### 5.3 `removeAllPayments` reports its ending

The backend, the memory backend and the store pass-through gain an optional
`onSettled?: (ok: boolean) => void`:
- **Server backend:** `true` where it now calls `paymentSucceeded`; `false` where it now calls
  `paymentFailed`.
- **Memory backend:** `true` at once.

`UndoSettled` passes it to its new `onPaid` prop (6.3), so the detail page can wait for the server
as it does for a single Undo. Nothing else changes.

## 6. UI

New text wraps with `overflow-wrap: anywhere` (EH-13). Mobile-only rules go inside
`@media (max-width: 640px)`. No new icons, and no new `data-tour` beyond `collection-done`.

### 6.1 `App.tsx`: screens, arrivals and callbacks

**Screen shapes:**

```ts
| { kind: 'collection'; openSessionId?: string; previewSettled?: boolean; arrival?: 'finish' | 'join' | 'open' }
| { kind: 'historyDetail'; sessionId: string; back: 'history' | 'collection'; notice?: 'nothingToDo' }
```

**Arrivals (BR-A1, BR-A2, AC-H9.1 to AC-H9.5).** Finish and a join go to Collection as today, now
with an `arrival`:
- Finish's `onClosed`: `{ kind: 'collection', openSessionId, arrival: 'finish' }`;
- `closeJoin` gains `arrival: 'join' | 'open'` from `JoinFlow` (6.6).

`CollectionPage` decides, from its own collection once the profile is ready. Its landing effect
replaces today's open-Settled branch:
- If the landing card is `settled`, it calls `onArriveSettled(id)` instead of scrolling.
- App's handler:

  ```ts
  setScreen({
    kind: 'historyDetail',
    sessionId: id,
    back: 'history',
    notice: arrival === 'open' ? undefined : 'nothingToDo',
  });
  ```

**No `arrival` means no redirect.** The ways back from the detail page ("← Collection", "Open in
Collection") set `openSessionId` with no `arrival`. A card that settled meanwhile is then simply
not shown, and can't bounce the reader back to the detail page.

**Callbacks App passes to `CollectionPage`**, never in practice:
- `onViewDetails(id)`: `{ kind: 'historyDetail', sessionId: id, back: 'collection' }`;
- `onOpenInHistory(id)`: `{ kind: 'historyDetail', sessionId: id, back: 'history' }`;
- `onArriveSettled`;
- `inviteUrlFor`, as History detail already gets it.

**To History detail**, App passes:
- `back`;
- `notice`;
- `onBack`: to History, or to `{ kind: 'collection', openSessionId: sessionId }` for
  `back: 'collection'` (AC-H4.3);
- `onOpenInCollection(id)`: `{ kind: 'collection', openSessionId: id }`;
- `onDeleted`, which calls `onBack` (AC-H10.3).

`HistoryPage`'s `onOpenSession` sets `back: 'history'`. The tour's shape mapping
(`historyDetail` → `history`) is unchanged.

**What's new v3**, in the existing `onboardingStyles.points` markup:
- The first point's "tap Invite members" becomes "tap Share with members" (A4).
- A third point is added:
  `<strong>Collection and History.</strong> Collection now shows only what's still being paid; settled sessions are in History.`
- `WHATS_NEW_VERSION` stays 3: v3 hasn't reached uat yet.

### 6.2 Collection (`CollectionPage.tsx`)

**Sections and empty states:**

| Collection holds | Shows |
|---|---|
| no cards, and no settled session either (`collection.settled.length === 0`) | today's "Nothing to collect yet" / "Finish a session and it will show up here." (AC-H1.5) |
| no cards, but at least one settled session | `<EmptyState title="All settled" description="Everything is paid. Settled sessions are in History." />` (AC-H1.6) |
| at least one card | the banner, the strip (`collection-totals`), Needs setup as today, then **always** the Outstanding section (AC-H1.4, AC-H1.7) |

- **Cards:** `total = needsSetup.length + outstanding.length`. Settled cards no longer count.
- **The Outstanding section:**
  - its heading `<h2 id="collection-outstanding-heading" tabIndex={-1}>` reads
    `Outstanding (${outstanding.length})`;
  - then the move notice (below);
  - then either the list `div` with `data-tour="collection-outstanding"` (unchanged, present only
    with cards), or
    `<p className={styles.quiet} data-tour="collection-done">Nothing outstanding. Sessions that are paid in full are in History.</p>`.
    That replaces "Nothing outstanding. Everything is settled." (BR-H7).
- **Removed:** the Settled section with `data-tour="collection-settled"`, its toggle, chevron and
  list, and the `settledOpen` and `settledToggle` state. In the landing and placing effects, the
  "open Settled first" branches are replaced as in 6.1 and below.
- **The rest:** the strip figures and "Already settled?" are unchanged. `buildCollection` still
  computes `settled`, which History uses.

**The move notice (US-H8, BR-A3):**
- **State:** `moved: { id: string; title: string } | { count: number } | null`, page-local, so it
  goes when the page is left. A newer move replaces it.
- **Single moves, set by every path that ends with the viewer's own confirmed action:**
  - **Payments and claim decisions:** today's `confirmedPaid` effect replaces its
    "Session fully settled. Moved to Settled." with
    `if (announcesSettled(isPaying(id), cards.get(id)?.bucket)) setMoved(...)`. That covers
    payments, Mark fully paid, Mark all and Confirm. The waiting rule is unchanged (EH-7,
    AC-H8.5).
  - **Already settled:** `markSettled`'s announcements become `movedToHistoryLine` (one) or
    `movedManyLine(done.length)` (several), as `moved`.
  - **The placing effect:** a Needs setup pick that lands in `settled` sets `moved` for that card,
    instead of opening Settled.
- **Rendering:** only while `onOpenInHistory` is given, so never in a guide. It's a
  `<div className={styles.moved}>` at the top of the Outstanding section, holding:
  - `<p>{movedToHistoryLine(title)}</p>` and
    `<Button size="sm" aria-label={`Open ${title} in History`} onClick={() => onOpenInHistory(id)}>Open</Button>`;
  - or `<p>{movedManyLine(n)}</p>` alone.
- **Screen readers:** the existing `srOnly` live region gets the same text whenever `moved` is set
  (AC-H8.3). That's set in practice too, as today's Settled line is.
- **Focus (AC-H8.4):** after the move, focus goes to the header button of the card now at the moved
  card's index in its section (the next one), or to `#collection-outstanding-heading` when there's
  none. The moved card's section and index are read from a ref of the previous render's bucket
  lists.
- **CSS:**

  ```css
  .moved { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px;
           border-radius: var(--radius-sm); background: var(--accent-bg); color: var(--accent-text);
           font-size: 13px; overflow-wrap: anywhere; }
  .moved > p { flex: 1 1 16rem; margin: 0; }
  ```

  On a phone the button drops under the text by wrapping.

**New props:**
- `onViewDetails?`, `onOpenInHistory?`, `onArriveSettled?` and `inviteUrlFor?`;
- `arrival?: 'finish' | 'join' | 'open'`;
- `onViewDetails` and `inviteUrlFor` are passed through to cards.

All are absent in `PracticeCollection`, which doesn't change.

### 6.3 `CollectionCard.tsx`

**`CollectionCardBody` (exported).** The open body's JSX (everything inside today's
`expandable && expanded && !setup` `div`) moves, unchanged, into
`export function CollectionCardBody(props)`. `CollectionCard` renders it. It takes:
- the values it used from the card's scope (`card`, `title`, `failed`, `onFailed`, `onPaid`,
  `onLeft`, `onAnnounce`, plus `share` and `inviting`, which stay in `CollectionCard` and are
  passed in);
- **`place: 'card' | 'history'`**.

With `place: 'history'`:
- no `ForOthers`, `MarkAll`, Share row or details row;
- every `LineRow` gets `inHistory`;
- `UndoSettled` gets `onPaid`.

What stays is exactly "Your payments" (AC-H5.1, AC-H5.4 to AC-H5.7):
- the YouAre row, or the joined row with Stop tracking (today's `hasLine` rule: a stored pick or
  "not in this session");
- the groups, with `collection-owed` on the Owed to you group as today. The detail page is never in
  a guide, and no step targets it there;
- "Every line in this session is marked as paid.";
- Undo "Already settled".

**The View details and Download SOA row (AC-H4.1 to AC-H4.7, Q2):**

```tsx
// After Mark all's row and Share's row, and never inside `collection-mark-all`'s element.
{place === 'card' && card.bucket === 'outstanding' && onViewDetails && !isPracticeId(session.id) && (
  <div className={styles.detailsRow}>
    <Button aria-label={`View details of ${title}`} onClick={() => onViewDetails(session.id)}>
      View details
    </Button>
    <ExportSoaButton
      layout="card"
      members={sortNames(session.members)}
      records={session.records}
      name={session.name}
      fileNameSuffix={(session.closedAt ?? session.createdAt).slice(0, 10)}
      getInviteUrl={joined || !inviteUrlFor ? undefined : () => inviteUrlFor(session.id)}
    />
  </div>
)}
```

- It's placed **after** `{share !== null && !markAllShown && …shareRow}`, and before the
  `InviteMembersDialog` line.
- `MarkAll` and its `div[data-tour="collection-mark-all"]` are untouched. The new row is a later
  sibling in the body, never a child of that `div`.
- **Needs setup:** in the setup body, after `<NeedsSetup …/>`, a
  `<div className={styles.detailsRow}>` with the View details button only, under the same
  `onViewDetails && !isPracticeId` condition.
- **The organizer's export from an Outstanding card always has a live link.** An Outstanding owned
  card has an unpaid line of its own, or a pending claim on an open line. A joined member's export
  never has one (BR-Q6).

**CSS (`CollectionCard.module.css`):**

```css
/* View details and Download SOA, the open card's last row (PR 4). */
.detailsRow {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.markAll + .detailsRow,
.shareRow + .detailsRow {
  padding-top: 0;
  border-top: none;
}

@media (max-width: 640px) {
  /* The two share the width, as LineRow's buttons do (EH-14). */
  .detailsRow > * {
    flex: 1 1 auto;
  }

  .detailsRow button {
    width: 100%;
  }
}
```

**`UndoSettled`** gains an optional `onPaid?: (ok: boolean) => void`, passed to
`removeAllPayments(id, onPaid)`.

### 6.4 `LineRow.tsx`, `ExportSoaButton.tsx`

- **`LineRow` gains `inHistory?: boolean`.** It hides:
  - Record payment, I paid, Mark fully paid, I've paid and I've paid it all;
  - their forms, and Confirm, Decline and Withdraw.

  It keeps the figures, Undo (with today's `joined` rule) and Dismiss. An optimistic undo makes the
  line unpaid for a moment, so without this a record button would flash in the detail page (BR-D2).
- **Undo** passes `onSettled: (result) => onPaid(result.ok)` to `removePayment`. On a card that's
  harmless: an undo never settles a card, and a failure already gets today's focus handling.
- **`ExportSoaButton` gains `layout: 'card'`:** a default-variant, `size="md"` button labelled
  "↓ Download SOA" ("Preparing SOA…" while busy). The error and note lines sit under it, in a
  `.card { display: flex; flex-direction: column; gap: 4px; }` wrapper. There's no fixed width, and
  the click handler is unchanged (EH-15).

### 6.5 History (`HistoryPage.tsx`, `SessionCard.tsx`)

**`HistoryPage`:**
- `const collection = useMemo(() => buildCollection(sessions, profile), …)`, then
  `list = collection.settled`, already in AC-H3.3's order (5.1).
- `profile.status === 'loading'` gives the `appStyles.loading` spinner with "Loading…".
  `'error'` gives the `loadError` block with "Couldn't load your profile." and "Try again"
  (`profile.reload`), as on Collection (AC-H2.6).
- **Empty:** `showsEmptyState(sync.loaded, list.length)` gives
  `<EmptyState title="Nothing settled yet" description="When a finished session is paid in full, it moves here from Collection." />`
  (AC-H2.5).
- **Heading:** "Settled sessions" (AC-H2.4).
- **Each card:** `<SessionCard … status={s.status} note={s.stillOwed ? 'Some members still owe each other' : undefined} />`,
  from `historyStatus(card)`. `onDelete` and `sharedBy` are as today (AC-H3.4).
- **Delete:** the dialog and its message are unchanged (AC-H10.1).

**`SessionCard`** gains `status?: string` and `note?: string`. They render after `sharedBy` as
`<span className={styles.status}>` and `<span className={styles.note}>`:
- `.status` is 12px, `var(--text2)`;
- `.note` is 11px, `var(--warn-text)`.

Home doesn't pass them, so Home's cards are unchanged.

### 6.6 History detail (`HistoryDetailPage.tsx`)

**Props:**
- `back: 'history' | 'collection'`;
- `notice?: 'nothingToDo'`;
- `onOpenInCollection: (id: string) => void`;
- `onDeleted: () => void`.

`onBack`, `onLeft` and `inviteUrlFor` are as today.

**With `card = profile.status === 'ready' ? buildCard(session, profile) : null`,
`joined = isJoined(session)` and `livingLink = !joined && !everyLinePaid(session)`:**

- **Back button:** "← History" or "← Collection" from `back`, including on "Session not found"
  (BR-D1, EH-9).
- **Header meta:**
  - when `!joined && !livingLink && card.pairCount > 0`, a `styles.meta` line under the finished
    date: "Everyone has paid, so the invite link no longer works." (AC-H11.2, A3);
  - the joined line is as today.
- **Actions** (BR-D5), in this order:
  1. **"↓ Download SOA"** (`layout="inline"`), with
     `getInviteUrl={livingLink && inviteUrlFor ? () => inviteUrlFor(session.id) : undefined}`.
     A fully paid session's SOA therefore has no link or QR, and no note (AC-H11.3).
  2. **Share with members**, when `livingLink` (BR-L3). This replaces round 5's "organizer card is
     Outstanding" rule, so a session that's settled for the organizer while others still owe each
     other keeps Share.
  3. **Stop tracking** (joined).
  4. **Delete session** (organizer only):
     `<Button variant="ghost" size="lg" className={styles.delete} aria-label={`Delete session ${title}`}>Delete session</Button>`,
     with `.delete { color: var(--danger-text); }`. It opens the existing
     `ConfirmDialog` ("Delete this session?", `deleteSessionMessage`, "Delete Session",
     destructive). On confirm: `deleteSession(id)`, then `onDeleted()` (AC-H10.2, AC-H10.3).

  `.actions`' phone rules already stack them full width.
- **The notice slot**, between the header and the breakdown:
  - `notice === 'nothingToDo'`: `<p className={styles.notice}>{nothingToDoLine(title)}</p>`.
  - After a move back:
    `<div className={styles.notice}><p>{backInCollectionLine(title, returned)}</p><Button size="sm" onClick={() => onOpenInCollection(session.id)}>Open in Collection</Button></div>`.
  - A page-level `<p role="status" className="visually-hidden">` always present, carrying the same
    text when it's set (AC-H6.1).
  - `.notice` looks like Collection's `.moved`.
- **"Your payments"** (BR-D2, BR-D7). Shown when
  `card !== null && (card.bucket === 'settled' || acting !== null) && returned === null`:
  - `<section aria-labelledby="your-payments">`, with `<h3 id="your-payments">Your payments</h3>`;
  - then `<CollectionCardBody place="history" … />`, where `onPaid(ok)` ends the action and
    `failed`/`onFailed` are a page-local map, as on Collection.
- **Its state:**
  - `acting: 'undo' | 'change' | null`, set when an Undo or Undo "Already settled" is confirmed in
    the section, or the YouAre row's Change is saved;
  - `returned: 'undo' | 'change' | null`, the notice's reason.
- **Rules:**
  - When an undo's `onPaid(true)` arrives and `cameBack('settled', card.bucket)` holds, with no
    write in flight (`!isPaying(id)`), set `returned = 'undo'` and clear `acting`. On `onPaid(false)`,
    just clear `acting`. The banner explains it, and the section stays (AC-H6.3).
  - When a Change lands and the bucket leaves `settled`: `returned = 'change'` (A2).
  - `YouAre` gets an optional `onChanged`, passed to `ChangeMeDialog` and called after its
    `setMe`.
  - Once `returned` is set, the section stays hidden, and the notice stays until the page is left.
- **Reloads:** a move caused by someone else (a reload) adds or removes the section without a
  notice (EH-8).
- **Breakdown:** unchanged (BR-D8).

### 6.7 The join flow (`JoinFlow.tsx`)

- **The `paid` stage:** a `ModalDialog` titled "Everyone has paid", with the message "Every line in
  this session is paid, so there's nothing left to track and the link no longer works." and one
  "OK" (`onClose(null)`) (AC-H11.4).
- **`own` and `already`:** the primary button's label comes from where the card is.
  - `const place = placeOf(sessionId)` is `'history'` when
    `buildCard(session, profile).bucket === 'settled'` for the store's session (with the profile
    ready), else `'collection'`.
  - The label is "Open in History" or "Open in Collection" (AC-H9.5, AC-H11.5).
  - Either calls `onClose({ openSessionId, arrival: 'open' })`, so a History card goes to its detail
    page with no notice.
- **`joined`:** `onClose({ openSessionId, announce: `Joined ${title}.`, arrival: 'join' })`.
  `CollectionPage` then redirects a settled card to the detail page with the AC-H9.4 notice.

### 6.8 Phone and desktop

| Screen | Desktop | Phone (≤ 640px) |
|---|---|---|
| Collection | no Settled section; Outstanding always shown, with the empty line when empty; the move notice at the section top, button at the end | the notice's button wraps under the text |
| Outstanding card, open | …lines, then [Mark all · Share], then [View details · ↓ Download SOA] side by side, left | each row's buttons share the width, and stack when they don't fit |
| Needs setup card, open | picker and Confirm, then View details alone | View details full width |
| History list | "Settled sessions"; each card with its status line, and the note when others still owe | the same |
| History detail | header actions in a row (Download, Share, Stop tracking or Delete); the notice; Your payments; breakdown | the actions stack full width (existing rule); everything else stacks |
| Join `paid` dialog | `ModalDialog` sizing | the same |

## 7. Onboarding

### 7.1 Targets

- **New:** `data-tour="collection-done"`, on the empty Outstanding paragraph (6.2). It's mounted
  only while Outstanding is empty and Collection isn't. In the guide that's scene K3: Beach trip
  paid by Mark all, Karaoke night paid, Movie night in Needs setup. So the step names its scene, and
  the seed supplies it (CLAUDE.md, guides).
- **Removed:** `collection-settled`, together with the section, since no step targets it any more
  (BR-G2).
- **Unchanged, same elements, not renamed or duplicated:** `collection-totals`,
  `collection-unsettled`, `collection-outstanding`, `collection-owed`, `collection-mark-all`,
  `nav-collection` and `nav-history`.
  - The details row sits after `MarkAll`'s `div` and never inside it.
  - "Your payments" renders `collection-owed` on a page no step visits. It's one instance on that
    page, and never in a guide.
- **The new controls carry no `data-tour`:** View details, the card's Download SOA, Delete session,
  the notices and the `paid` dialog. View details and the card's Download SOA are hidden on
  `practice_` sessions, and the notices need callbacks practice doesn't pass, so nothing new
  appears in a guide (BR-G5).

### 7.2 Copy

**`collectionSteps.ts`, C7:**

```ts
{
  target: 'collection-done',
  title: 'All done',
  content:
    "When every line of yours is paid, the session leaves Collection and moves to History. Beach trip is paid in full, so it has gone from here. In History you can still see its payments and undo one. That's it: tap Done to go back to your own Collection.",
  place: 'K3',
},
```

C6's follow-along to K3 is unchanged. `PracticeCollection`'s comment ("…a card that has gone to
Settled") becomes "…a card that has gone to History".

**`steps.ts`** (targets and screens unchanged, BR-G4):
- **"Track who has paid"** (`nav-collection`): "Finished sessions show up here until they're paid
  in full. Record payments as they come in, even part payments, and see who still hasn't paid you."
- **"Your archive"** (`nav-history`): "Once everyone has paid you, and you've paid everyone, a
  session moves here from Collection, read-only, with its statement and its payments. That is the
  whole app — go and add a real one." The title is unchanged.

### 7.3 `guides/guides.test.ts` changes (BR-G6)

- **The step-order test:** the target list ends `…, collection-mark-all, collection-done`. The
  places are unchanged.
- **"K1 reads the strip and the three sections"** becomes "K1 reads the strip and both sections".
  The parts are `₱1,480.00`, `₱150.00`, "Not counting 1 session that needs setup",
  "Needs setup (1)" and "Outstanding (1)", and `not.toContain('Settled (')`.
- **"K3 has two settled sessions"** becomes "K3 shows the empty Outstanding line and no Settled
  section". That means "Outstanding (0)" and "Nothing outstanding. Sessions that are paid in full
  are in History.", with `data-tour="collection-done"` once, and no "Settled (".
- **The model checks** (`k3.settled` has 2, `c.settled` is Karaoke) stay: `buildCollection` still
  computes them.
- **The per-scene "each step target exactly once" test** now covers C7's `collection-done` in K3.

`steps.test.ts` and `targets.test.ts` pass with no edits. `targets.test.ts` finds
`collection-done` as a literal attribute.

## 8. Test plan (static)

**`src/lib/collection.test.ts`:**
- `everyLinePaid`: no pairs gives true; one unpaid pair gives false; all paid gives true; an
  overpaid pair counts as paid (EH-17); a pending claim doesn't pay a line (BR-H2).
- **Placement in the owner's example** (AC-H1.1, AC-H1.2, AC-H2.1, AC-H2.2, BR-H3): Renmar's card
  is `settled`, and Jyllan's view of the same session is `outstanding` with ₱300.00 left to Kim.
- **AC-H7.1:** Jyllan's pending claim to Kim makes Renmar's card `outstanding`, with
  `forOthers` 1. After a confirm (claim gone, payment added), it's `settled` again.
- `historyStatus`: each of A1's six, in order; `stillOwed` true for Renmar while Jyllan owes Kim,
  false for a joined card and for a fully paid session.
- **The `settled` order** (AC-H3.3): by settled date; presettled by finish date; ties by finish
  date, then id.
- `movesFromCollection` and `cameBack`: the transitions, both ways.

**`src/lib/joinedSessions.test.ts`:**
- `joinAnswerFrom(200, { outcome: 'paid' })` and `joinStage` give `'paid'`;
- the five new copy builders, exactly.

**`src/lib/invitesApi.test.ts`** (extend, on the existing fake database):
- **Link:** a fully paid owned session is 409 `all_paid` with no `update` sent (BR-L2); an unpaid
  one mints as today.
- **Preview:**
  - a fully paid session is `{ outcome: 'paid' }` for an outsider, with no `title`, `sessionId` or
    members in the body (AC-H11.4);
  - `own` for the organizer, `already` for a member (AC-H11.5);
  - an unpaid line (Jyllan owes Kim) is `open` (AC-H11.6, B-4);
  - after an undo makes a line unpaid again, the same token is `open` (AC-H11.7, Q1);
  - a no-pairs session is `paid` (BR-L5).
- **Join:** a fully paid session gives a rollback and `paid`, with no insert. The ledger reads run on
  the transaction's client after the lock.

**`src/components/collection/joinedCards.test.ts`** (extend; `renderToStaticMarkup` through the
practice providers, with real, non-`practice_` ids where a test needs the buttons):
- **`CollectionPage`:**
  - no "Settled (" in any markup, and no `collection-settled` (BR-H7);
  - with Needs setup only: "Outstanding (0)" and `data-tour="collection-done"` with its text
    (AC-H1.4);
  - with no cards and one settled session: "All settled" (AC-H1.6);
  - with nothing at all: "Nothing to collect yet" (AC-H1.5).
- **An open Outstanding owned card with `onViewDetails`:**
  - after the `collection-mark-all` `div` closes: `aria-label="View details of Bali Trip"` and "↓
    Download SOA", outside the `collection-mark-all` `div` (AC-H4.1);
  - the attribute appears once.
- **The same card, joined:** View details and Download SOA (AC-H4.5).
- **A Needs setup card:** View details only (AC-H4.6, Q2).
- **A `practice_` card:** neither (AC-H4.7).
- **`HistoryPage`:**
  - "Settled sessions" lists only the settled session, and not the outstanding one (AC-H2.1 to
    AC-H2.3);
  - status lines and the note (AC-H3.1, AC-H3.2);
  - "Nothing settled yet" when empty (AC-H2.5);
  - "Loading…" while the profile loads (AC-H2.6);
  - no draft (AC-H2.7);
  - the bin only on owned cards (AC-H3.4).
- **`HistoryDetailPage`:**
  - **A settled owned session:** "Your payments", the lines with Undo, and the YouAre row with
    Change for a picked member (AC-H5.1, AC-H5.2). No "Record payment", "I paid" or "Mark all as
    paid" (AC-H5.6). Undo "Already settled" for a presettled one (AC-H5.4).
  - **A settled joined session:** Undo only on Owed to you payments (AC-H5.2).
  - **An Outstanding session with `back: 'collection'`:** "← Collection" and no "Your payments"
    (AC-H4.2, AC-H5.8).
  - **The `nothingToDo` notice text** (AC-H9.2).
  - **A fully paid owned session:** "Everyone has paid, so the invite link no longer works." and no
    Share (AC-H11.1, AC-H11.2).
  - **A settled-for-Renmar session where Jyllan still owes Kim:** Share present (BR-L3).
  - **"Delete session"** with its `aria-label` for the organizer, and none for a joined member
    (AC-H10.2, AC-H10.5).
- **`SessionCard`** without `status` renders as today, for Home.
- **Targets:** the scan finds `collection-done` once in `CollectionPage.tsx`. `CollectionCard.tsx`
  still has exactly its two targets, and the new row has none.

**`src/components/onboarding/guides/guides.test.ts`:** the changes in 7.3.
**`steps.test.ts`, `targets.test.ts`:** pass unchanged.

**ui-ux-tester** (no static test can see these; on :3003 for `-4`, with Renmar, Jyllan and Kim):

| AC | Check |
|---|---|
| AC-H1.x, AC-H2.x, BR-H3 | Renmar's card moves to History when his lines are paid, while Jyllan's stays in her Collection. History says "Settled sessions" and shows status lines, with "Some members still owe each other" on Renmar's. |
| AC-H7.1 to AC-H7.5 | Jyllan sends "I've paid Kim": within about 15 seconds, the card is back in Renmar's Collection, auto-opened, with "1 to confirm". Confirm: it moves to History with the notice and the Open button. |
| AC-H8.1 to AC-H8.5 | Mark all on a card: the notice, the announcement, and focus on the next card or the Outstanding heading. A blocked payment: no notice. |
| AC-H6.x, AC-H11.7 | In History detail, Undo a payment: the notice and Open in Collection; Share returns; the old link and the QR on an earlier SOA work again. |
| AC-H9.x | Finish as "not in this session": the detail page with the notice. Join a session that's settled for the joiner: the same. Open the link again: "Open in History". |
| AC-H11.x | With every line paid: no Share; the header line; an outsider gets "Everyone has paid" with no name; the SOA has no QR and no note. |
| AC-H4.x, AC-H10.x | View details and back keep the card open. Download SOA from the card has a QR for Renmar, none for Jyllan. Delete session from the detail page returns to the origin. |
| BR-G1 to BR-G5 | The Collection guide end to end: C7 spotlights "Nothing outstanding…" in K3, with no Settled section, View details, Download or notice anywhere. Preview Tour: the new copy on the last two steps. |
| EH-13, EH-14 | 375px: rows wrap, notices wrap, no sideways scroll. Desktop matches the table in 6.8. |
| What's new | Preview What's new: three points, "Share with members" in the first. |

## 9. Documentation impact

For the documentation-engineer, with PR 1 to PR 3 (shipped together):
- **User guide:** Collection and History, View details, Your payments, Delete session, the link's
  lifetime and "Everyone has paid".
- **API reference:** `POST /api/invites`, adding `409 all_paid` and `{ outcome: 'paid' }`.
- **Onboarding notes:** `collection-done`, the removal of `collection-settled`, and the C7 and tour
  copy.
- **Release notes:** What's new v3's third point.

## 10. Tasks (in order)

0. **Rebase.** Before building, merge the latest `origin/joined-sessions-2` and
   `origin/joined-sessions-3` again if either has moved. Then run `npm test`.
1. **Pure logic, tests first:**
   - `everyLinePaid`, `historyStatus`, `bySettled`'s tie-break, `movesFromCollection` and
     `cameBack` (5.1);
   - `'paid'` and the copy builders (5.2);
   - the `InviteAnswer` type.
2. **API:** `api/invites.ts` (4.1), with `invitesApi.test.ts`.
3. **Store:** `removeAllPayments`' `onSettled` (5.3).
4. **Leaf UI:**
   - `LineRow`'s `inHistory` and the Undo `onSettled`;
   - `ExportSoaButton`'s `layout="card"`;
   - `SessionCard`'s `status` and `note`.
5. **`CollectionCard`:**
   - extract `CollectionCardBody` with `place` (check the markup is unchanged with
     `place="card"`; the existing tests stay green);
   - the details row and the Needs setup View details;
   - `UndoSettled`'s `onPaid`.
6. **`CollectionPage`:** remove Settled; the empty states and `collection-done`; the move notice and
   focus; the arrival redirect; the new props.
7. **History:** `HistoryPage`, then `HistoryDetailPage` (6.6).
8. **`JoinFlow`** (6.7), then **`App.tsx`** (6.1), including What's new v3.
9. **Onboarding:** C7, the `steps.ts` copy, the `PracticeCollection` comment, and
   `guides.test.ts` (7.3).
10. **Checks:** `npm run lint`, `npx tsc -b`, `npm test` (with `steps.test.ts`, `targets.test.ts`
    and `guides/guides.test.ts`), and `npm run build`. Then the owner check on :3003 with the
    Renmar, Jyllan and Kim walk from the brief.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| A session vanishes from both tabs, or shows in both. | One bucket decides both: Collection renders Needs setup and Outstanding, and History renders `settled`, from the same `buildCollection`. History waits for the profile, as Collection does. Tested on the owner's example. |
| Arrival redirects loop between Collection and the detail page. | Only Finish, a join and "Open in …" carry `arrival`. Every way back omits it. |
| A tour or guide target moves. | `collection-mark-all` is untouched, and the new row is a later sibling. `collection-done` is a literal attribute on one element, mounted only in K3 within the guide. `guides.test.ts` checks each scene's targets exactly once. |
| The link-expiry check leaks a session's details to a would-be joiner. | `paid` carries nothing but the word. The ledger is read only inside `outcomeFor` and never sent. |
| A fully paid session's SOA shows a "couldn't be loaded" note. | `getInviteUrl` is passed only while the link is alive, so a refusal reaches the client only in a race. |
| "Your payments" offers recording during an optimistic undo. | `inHistory` hides every record and claim action. |
| The body extraction changes the card's markup. | It's moved as is, behind `place="card"`. Every existing card and guide test must stay green before anything else changes (task 5). |
| Testers think sessions went missing from History. | What's new v3's third point (Q5). |

**Size: large.** About 20 files edited and 1 new spec. No schema change, one API change, no new
function or dependency.

## 12. Decisions for the user

- **D-A. Assumptions A1 to A4** (section 1):
  - A1: the History status order;
  - A2: the Change notice shows without waiting for the save;
  - A3: no expired-link line for an everyone-even session;
  - A4: fix What's new's stale "Invite members".

  **Recommendation:** approve as written.

No other open questions. The requirements and the owner's answers Q1 to Q5 settle the rest.
