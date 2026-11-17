# Spec: tab guides, PR 1 (practice session, guide engine, Expenses guide, Tutorials)

Status: **draft, waiting for the owner's approval.** Branch `tab-guides`, from `origin/main` at
`1347401`.

## 1. Summary

The first-run tour names each tab but can't show how to log a purchase, because it runs in an
empty session. PR 1 adds:

- a **practice session**: an in-memory copy of the sessions store, pre-filled with made-up
  people. It replaces the real screen while a guide runs, and nothing in it is ever sent to the
  server;
- a generic **guide engine**, `GuideTour<P>`. The first-run tour becomes a thin wrapper over it,
  with no change to its steps or its tests;
- the 17-step **Expenses guide** ("Logging expenses"), with four scenes (X1 to X4) and new
  `data-tour` targets on the Expenses form;
- a **"?" button** on a real session's Expenses tab;
- **Tutorials** in the account menu, with "App overview" (a replay of the first-run tour through
  the existing preview path) and "Logging expenses";
- a server guard: `/api/sessions` refuses `practice_` ids with a 400;
- the approved rewording of the CLAUDE.md tour rule.

PR 1 makes **no schema change** and doesn't touch Neon. The Collection guide, the seen flags,
the once-only offers, What's new v2 and Preview offer are all PR 2.

Sources, all settled:

- the requirements, [`tab-guides-requirements.md`](tab-guides-requirements.md): US-TG1 to US-TG6
  and US-TG13 (Expenses), BR-TG1 to BR-TG27, section 6.1. The decisions in section 11 are final;
- the architect's brief, [`tab-guides-architecture.md`](tab-guides-architecture.md), options A1,
  B1, C1 and D1 (approved), and the owner's answers to it in the intake plan.

Assumptions, stated openly:

1. The Expenses practice session is a **draft** named "Beach trip". The architect's "closed, `me`
   set, `finishedWithCollection: true`" applies to the Collection practice in PR 2. A draft is
   what makes the Expenses form editable.
2. **"/api/sessions" covers both route files**: `POST /api/sessions` and every method on
   `/api/sessions/[id]`. `/api/payments` isn't changed. A practice id can never be created, so
   any payment naming one already fails the ownership check with a 404.
3. The approved "static tests only" covers `renderToStaticMarkup` from `react-dom/server` in the
   node environment. Five existing tests already use it (for example
   `CustomAmountFields.test.ts`). It's static rendering: no DOM, no effects.

## 2. Layers touched

**Types and lib**

| File | Change | Reuse |
|---|---|---|
| `src/lib/practiceId.ts` (new) | `PRACTICE_ID_PREFIX = 'practice_'` and `isPracticeId(id)`. Shared by the client and the API. | |
| `src/lib/memorySessions.ts` (new) | Pure reducers for the memory backend (section 5.1). | `newPayments`, `settlePayments`, `isFullyPaid` (`src/lib/collection.ts`) |
| `src/lib/staging.ts` | Adds the `PurchaseFormSeed` type and `leaveMessage()`, which moves the "Leave without saving?" text out of `SessionWorkspace.tsx` unchanged. | `pluralize` (`src/lib/format.ts`) |
| `src/types/index.ts` | No change. | |

**API**

| File | Change |
|---|---|
| `api/_validate.ts` | `isPracticeSessionId(id)`, wrapping `isPracticeId` from `../src/lib/practiceId.js`. |
| `api/sessions/index.ts` | `POST` refuses a practice id with a 400. |
| `api/sessions/[id].ts` | Every method refuses a practice id with a 400. |

**Client state**

| File | Change | Reuse |
|---|---|---|
| `src/hooks/useServerSessions.ts` | `type Result` is renamed and exported as `SessionsBackend`. The body is untouched. | |
| `src/hooks/useMemorySessions.ts` (new) | `useMemorySessions(seed): SessionsBackend`, with no network code. | the `src/lib/memorySessions.ts` reducers |
| `src/context/SessionsStoreContext.tsx` | Today's provider body becomes the private `SessionsStoreCore({ backend, children })`. `SessionsStoreProvider` passes `useServerSessions()` to it, and the new `PracticeSessionsProvider({ seed })` passes `useMemorySessions(seed)`. | everything in the file |
| `src/context/ProfileContext.tsx` | Adds `PracticeProfileProvider`, with a fixed value and no requests. | `ProfileContext`, `ProfileValue` |

**UI**

| File | Change | Reuse |
|---|---|---|
| `src/components/onboarding/GuideTour.tsx` (new) | The engine: today's `OnboardingTour.tsx` body, made generic (section 6.2). | `NudgeContext`, `StepContent`, the Joyride options |
| `src/components/onboarding/GuideTour.module.css` | `git mv` of `OnboardingTour.module.css`, content unchanged. | |
| `src/components/onboarding/OnboardingTour.tsx` | Becomes a thin wrapper over `GuideTour`. Same name and props. | `TOUR_STEPS`, `screenMatches`, `wentToNextStep` |
| `src/components/onboarding/steps.ts`, `steps.test.ts` | **No change.** | |
| `src/components/onboarding/guides/expensesScenes.ts` (new) | Scenes X1 to X4 (section 5.2). | |
| `src/components/onboarding/guides/expensesSteps.ts` (new) | `EXPENSES_STEPS`, E1 to E17 (section 6.4). | |
| `src/components/onboarding/guides/PracticeExpenses.tsx` (new) | The practice screen: `PracticeExpenses` and `PracticeScene` (section 6.3). | `SessionWorkspace`, `GuideTour` |
| `src/components/onboarding/guides/PracticeBanner.tsx` + `.module.css` (new) | "Practice session. Nothing here is saved." with End practice. | `Button` |
| `src/components/onboarding/TutorialsDialog.tsx` + `.module.css` (new) | The Tutorials dialog. | `OnboardingDialog`, `Button` |
| `src/components/layout/Header.tsx` | Adds a Tutorials item to the account menu. | `UserButton.Action` |
| `src/components/layout/SessionWorkspace.tsx` + `.module.css` | Adds the "?" button and the props `onHelp`, `onUnsavedChange` and `practice`. | `Button`, `leaveMessage` |
| `src/pages/ExpensesPage.tsx` | Adds the `practice` prop (`initialStaged`, `seed`, and no reload warning). | |
| `src/components/home/PurchaseItemCard.tsx` | Adds a `seed` prop, read only by the `useState` initialisers. Adds the `item-mode`, `add-item` and `save-to-breakdown` targets. | `fieldsFromStaged` |
| `src/components/shared/Card.tsx` | An optional `'data-tour'` prop, passed to the `<section>`. | |
| `MemberList.tsx`, `PurchaseDetailsFields.tsx`, `PayorModeFields.tsx`, `ItemModeFields.tsx`, `EqualSplitFields.tsx`, `CustomAmountFields.tsx`, `ItemStagingList.tsx` (all in `src/components/home/`) | One `data-tour` attribute each, and several in `CustomAmountFields`. Section 7 has the full list. | |
| `src/components/shared/icons.tsx` | `HelpIcon` and `TutorialsIcon`. | `Icon` |
| `src/App.tsx` | The `practice` screen kind, starting and ending guides, Tutorials, the App-level "Leave without saving?", hiding `SyncBanner`, and the loading and What's new guards. | `previewTour`, `endTour`, `ConfirmDialog` |

**Tests:** `src/lib/memorySessions.test.ts` (new), `src/components/onboarding/guides/guides.test.ts`
(new), `src/components/onboarding/targets.test.ts`, `src/lib/apiValidation.test.ts`,
`src/lib/staging.test.ts`, `src/components/layout/SessionWorkspace.test.ts`. Section 8 maps them.

**Docs:** `CLAUDE.md`, the onboarding section only (section 7).

**PDF:** none. **Schema:** none.

## 3. Data model

None. There's no schema change, no Neon change and no migration. Practice data lives in React
state only.

## 4. API contract

The only change is a guard. Everything else in these routes stays as it is.

**`POST /api/sessions`** (create a draft)

- Auth: `getUserId`. 401 without a user, as today.
- New rule, checked right after the existing `id` check and before `ensureUser`: if
  `isPracticeSessionId(id)`, return `400 { error: 'Practice sessions are never saved.' }`.
- Status codes: 201 (created or already there), 400 (no id, or a practice id), 401, 405, 500
  (auth misconfigured). No other change.

**`PUT`, `PATCH` and `DELETE /api/sessions/[id]`**

- New rule, right after `if (!sessionId) return 400`, before the method dispatch: if
  `isPracticeSessionId(sessionId)`, return `400 { error: 'Practice sessions are never saved.' }`.
- An unsupported method on a practice id therefore gets a 400 rather than a 405. That's accepted,
  because the request is malformed either way.
- Status codes: PUT 200, 400, 401, 404, 500; PATCH 204, 400, 401, 404; DELETE 204, 400, 401, 404;
  other methods 400 (practice id) or 405.

**`api/_validate.ts`**

```ts
import { isPracticeId } from '../src/lib/practiceId.js';

/**
 * A practice session's id (tab-guides BR-TG3). Practice lives only in the browser, so a write
 * naming one is a client bug, refused with a 400 before it can reach the database.
 */
export function isPracticeSessionId(id: string): boolean {
  return isPracticeId(id);
}
```

**`src/lib/practiceId.ts`**

```ts
/** Every practice session's id starts with this, and the server refuses to store one (BR-TG3). */
export const PRACTICE_ID_PREFIX = 'practice_';

export function isPracticeId(id: string): boolean {
  return id.startsWith(PRACTICE_ID_PREFIX);
}
```

The check is case-sensitive: `Practice_x` isn't a practice id. The relative import uses `.js`,
which `src/lib/apiImports.test.ts` enforces.

## 5. Business logic

No money rule changes. The practice runs the real form and store code, so Fill Remainder,
rounding, shares, Add Item and Save to Breakdown give the same results as in a real session
(BR-TG17).

### 5.1 The memory backend

**`src/lib/memorySessions.ts`** holds pure functions. Each returns a new array, or null when
nothing changed:

```ts
/** `fn` applied to one session and stamped as activity, as a real save is; null when the session is gone or `fn` changed nothing. */
export function mutateOne(sessions: Session[], sessionId: string, fn: (s: Session) => Session, now: string): Session[] | null;
/** Adds the payments not already there, stamped `now` (`newPayments`). */
export function addPaymentsTo(sessions: Session[], sessionId: string, payments: NewPayment[], now: string): Session[];
export function removePaymentFrom(sessions: Session[], sessionId: string, paymentId: string): Session[];
export function removeAllPaymentsFrom(sessions: Session[], sessionId: string): Session[];
/** Pays what's left on every pair, one payment each (`settlePayments`), with ids from `mintId`. */
export function settleOne(sessions: Session[], sessionId: string, mintId: () => string, now: string): Session[];
/** Adds the sessions whose ids aren't there yet. */
export function appendNew(sessions: Session[], next: Session[]): Session[];
```

`mutateOne` stamps `activityAt: now` on the changed session, as `useServerSessions.mutateSession`
does.

**`src/hooks/useMemorySessions.ts`** has the signature
`useMemorySessions(seed: Session[]): SessionsBackend`. It imports the type with
`import type { SessionsBackend } from './useServerSessions'`, which is type-only and so allowed by
the isolation test.

It keeps the list in `useState(seed)` with a `sessionsRef`, and a `commit(next)` that writes both,
the same pattern as `useServerSessions:254`. That pattern is what makes StrictMode's double-run of
updaters harmless. Every function is a `useCallback`, and the returned object is a `useMemo`.

| Member | Behaviour |
|---|---|
| `sessions` | the state |
| `mutateSession(id, fn, onSettled)` | `next = mutateOne(ref.current, id, fn, now)`. If not null, commit it. Then call `onSettled?.(next !== null)` **synchronously, after the commit**. `PurchaseItemCard.save` dispatches `start` before `addRecords`, so a synchronous settle shows "Saved." |
| `addSession(session)` | Appends it. `onDiscarded` is never called. |
| `removeSession(id)` | Filters it out. |
| `recordOpen` | Does nothing (BR-TG19). |
| `addPayments(id, payments, onSettled)` | `addPaymentsTo`, commit, `onSettled?.({ ok: true })`, `return Promise.resolve()`. |
| `settleSessions(ids)` | `settleOne` for each id still unpaid. Commit once. Returns `{ settled: ids whose session isFullyPaid afterwards, failed: [] }`. |
| `removeAllPayments(id)` | `removeAllPaymentsFrom`, then commit. |
| `removePayment(id, paymentId, onSettled)` | `removePaymentFrom`, commit, `onSettled?.({ ok: true })`. |
| `isPaying` | `() => false` |
| `replaceAll(next)` | Commits `next`. |
| `appendAll(next)` | Commits `appendNew(ref.current, next)`. |
| `status`, `loaded`, `error`, `refresh`, `reverted` | `'ready'`, `true`, `null`, `false`, `false` |
| `retry`, `dismissReverted` | Module-level no-ops. |

The payment members aren't reachable in PR 1. They're specified now because `SessionsBackend`
requires them, and the PR 2 Collection guide will use them.

### 5.2 The scenes (exact seeds)

**`src/lib/staging.ts`** gains:

```ts
/** What a guide scene loads into Purchase Details as the card mounts (tab-guides, scenes B1). */
export type PurchaseFormSeed = {
  /** Date, Paid By and the item, loaded exactly as Edit loads a staged item (`fieldsFromStaged`). */
  row: StagedItem;
  /**
   * Custom Amounts only: Total Amount as the scene typed it, apart from what is entered, so the
   * footer reads "Entered ₱X of ₱Y" and Fill Remainder has a remainder to fill (scene X3).
   */
  totalAmount?: number;
};
```

**`src/components/onboarding/guides/expensesScenes.ts`**

```ts
export type ExpensesSceneId = 'X1' | 'X2' | 'X3' | 'X4';

export type ExpensesScene = {
  id: ExpensesSceneId;
  /** The practice draft the scene runs in. Never saved (BR-TG3). */
  session: Session;
  /** Seeds the practice's own Paid By memory. An unseeded card opens on it (X4). */
  paidBy: PaidByPick;
  /** What Purchase Details opens with. Omitted, it opens as a fresh visit does. */
  form?: PurchaseFormSeed;
  /** The staged list as the scene starts. */
  staged: StagedItem[];
};

export const PRACTICE_MEMBERS = ['Ana', 'Ben', 'Carla', 'Dino'];

/** The four scenes for `today` (ISO `YYYY-MM-DD`): every date in them is today (BR-TG16). */
export function expensesScenes(today: string): Record<ExpensesSceneId, ExpensesScene>;
```

Every scene uses the same session:

```ts
{
  id: `${PRACTICE_ID_PREFIX}expenses`,           // 'practice_expenses'
  status: 'draft',
  createdAt: `${today}T12:00:00.000Z`,           // sessionTitle reads the first 10 characters: "Started <today>"
  closedAt: null,
  members: ['Ana', 'Ben', 'Carla', 'Dino'],
  records: [],
  name: 'Beach trip',
  activityAt: null,
  me: null,
  finishedWithCollection: false,
  payments: [],
}
```

Every scene also uses `paidBy: { payorMode: 'single', singlePayor: 'Ana' }`.

The items, as literal objects. Item ids carry the prefix only for readability.

```ts
const groceries: EqualSplitItem = {
  id: 'practice_groceries', mode: 'equal', name: 'Groceries',
  totalPrice: 1200, owners: ['Ana', 'Ben', 'Carla'],
};

// The receipt in BR-CA34 order: own orders by member then as added, shared, discounts, charges.
const dinner = (dino: boolean): CustomAmountItem => ({
  id: 'practice_dinner', mode: 'custom', name: 'Dinner at the grill',
  amounts: { Ana: 250, Ben: 230, Carla: 220, Dino: dino ? 160 : 40 },
  bill: [
    { kind: 'order', member: 'Ana', name: 'Pork BBQ', amount: 180 },
    { kind: 'order', member: 'Ben', name: 'Chicken inasal', amount: 120 },
    { kind: 'order', member: 'Ben', name: 'Iced tea', amount: 40 },
    { kind: 'order', member: 'Carla', name: 'Pancit', amount: 150 },
    ...(dino ? [{ kind: 'order', member: 'Dino', name: '', amount: 120 } as const] : []),
    { kind: 'shared', members: ['Ana', 'Ben', 'Carla', 'Dino'], name: 'Rice platter', amount: 200 },
    { kind: 'discount', members: ['Dino'], name: 'Senior discount', amount: 30 },
    { kind: 'charge', name: 'Service charge', amount: 80 },
  ],
});
```

| Scene | `form` | `staged` | What the form shows |
|---|---|---|---|
| X1 | `{ row: { item: groceries, date: today, payorMode: 'single', payors: [{ member: 'Ana', amount: 1200 }] } }` | `[]` | One Payor Ana. Equal Split, Groceries, ₱1,200.00, owners Ana, Ben and Carla, "(₱400.00 each)". |
| X2 | `{ row: { item: groceries, date: today, payorMode: 'multiple', payors: [{ member: 'Ana', amount: 700 }, { member: 'Ben', amount: 500 }] } }` | `[]` | Multiple Payors: Ana 700.00, Ben 500.00, "Contributed ₱1,200.00". The rest as X1. |
| X3 | `{ row: { item: dinner(false), date: today, payorMode: 'single', payors: [{ member: 'Ana', amount: 740 }] }, totalAmount: 860 }` | `[]` | Custom Amounts and All Members. Dino has one blank sub-item. Shares: Ana ₱250.00, Ben ₱230.00, Carla ₱220.00, Dino ₱40.00. Footer: Subtotal ₱690.00, Discounts −₱30.00, Charges ₱80.00, then "Entered ₱740.00" in red with "of ₱860.00". |
| X4 | omitted | `[X2's row with id 'practice_groceries', { item: dinner(true), date: today, payorMode: 'single', payors: [{ member: 'Ana', amount: 860 }] }]` | An empty Equal Split form with One Payor Ana (from `paidBy`) and today's date. The list reads "2 items staged ₱2,060.00". |

How the existing code produces those figures, which the tests check:

- `draftFromItem(dinner(false), members)`:
  - `linesFromItem` gives Dino one blank line, because he's in `amounts` but has no own order;
  - all four are picked, so `allSelected: true`;
  - `billDraftFromItem` gives the Rice platter on "Everyone", the Senior discount ticked for Dino
    only, and the Service charge.
- `fieldsFromSeed` then sets `totalAmount: '860.00'` and `totalFollows: false`.
- `readBillDraft(['Ana','Ben','Carla','Dino'], lines, bill)` gives:
  - `subtotal` 690, `discounts` 30, `charges` 80, `entered` 740, `others` 250;
  - `shares` `{ Ana: 250, Ben: 230, Carla: 220, Dino: 40 }`, worked as follows:

    | Member | Own | Rice platter | Service charge | Senior discount | Share |
    |---|---|---|---|---|---|
    | Ana | 180 | 50 | 20 | | 250 |
    | Ben | 160 | 50 | 20 | | 230 |
    | Carla | 150 | 50 | 20 | | 220 |
    | Dino | 0 | 50 | 20 | −30 | 40 |
- `fillRemainder(860, picked, lines, 250)` sets Dino's first line to `'120.00'` (860 − 490 − 250).
  Entered becomes 860.00 and Dino's share 160.00 (AC-TG2.5).
- Every amount is a whole number of pesos, so no rounding comes into play. All the splits are
  exact: 1200 / 3, 200 / 4 and 80 / 4.

**Seed rules the tests enforce** (section 8):

- every seed row survives `buildRecords` and `parseSession` unchanged;
- each Custom item satisfies `billMatches(bill, amounts)`, and its `amounts` equal
  `billAmounts(bill, billMembers(bill))`;
- each Multiple Payors row satisfies `contributionsMatch(payors, getItemTotal(item))`.

### 5.3 Scene boundaries and resets (BR-TG13, BR-TG14)

`PracticeExpenses` holds `scene: ExpensesSceneId` and `generation: number`. The practice subtree
is keyed `` `${scene}:${generation}` ``, so a key change remounts the memory store, the form and
the staged list from the scene's seed.

When Next or Back moves to step `i` (`onNavigate(place, i)`):

- **A different scene:** `setScene(place)`. The key changes and the scene starts as designed.
- **The same scene:** the practice keeps what was typed, unless the scene is broken, in which
  case `setGeneration(g => g + 1)`. A scene is broken when either:
  - a member the scene seeded is no longer in the practice session (Clear All, or × on a chip),
    as reported by `MembersWatch` (section 6.3); or
  - step `i`'s target isn't shown: `document.querySelector('[data-tour="<target>"]')` is null, or
    its `getBoundingClientRect().height` is 0.

The targets are chosen so that this check covers the requirements' cases (section 7). For
example, removing the Senior discount row unmounts `bill-discounts`, and switching back to Equal
Split unmounts `custom-total`.

## 6. UI

### 6.1 App (`src/App.tsx`)

**Screen type**

```ts
type RealScreen =
  | { kind: 'home' }
  | { kind: 'collection'; openSessionId?: string; previewSettled?: boolean }
  | { kind: 'history' }
  | { kind: 'historyDetail'; sessionId: string }
  | { kind: 'session'; sessionId: string; tab: SessionTabId };

/**
 * A guide's practice screen, in place of the real one (BR-TG18). `back` is where it ends
 * (BR-TG20); `via` is how it started, so focus can go back to "?" (AC-TG4.1).
 */
type Screen =
  | RealScreen
  | { kind: 'practice'; guide: 'expenses'; back: RealScreen; via: 'help' | 'menu' };
```

**New state:**

- `tutorialsOpen: boolean`;
- `guideKey: number`, which remounts the practice on a restart (BR-TG26);
- `unsavedNote: string | null`, set by `SessionWorkspace.onUnsavedChange`;
- `pendingTutorial: { tutorial: Tutorial; via: 'help' | 'menu' } | null`;
- `focusHelp = useRef(false)`.

**Starting a tutorial.** "?" and Tutorials both come through one path:

```ts
const startTutorial = (tutorial: Tutorial, via: 'help' | 'menu') => {
  // Staged items or an open saved-item edit ask first, as leaving the tab does (BR-TG6, AC-TG5.5).
  if (screen.kind === 'session' && unsavedNote !== null) setPendingTutorial({ tutorial, via });
  else launch(tutorial, via);
};

const launch = (tutorial: Tutorial, via: 'help' | 'menu') => {
  // A tutorial chosen during the first-run tour ends it as Skip does (BR-TG27).
  if (phase === 'running') endTour(false);
  if (tutorial === 'overview') {
    previewTour();
    return;
  }
  window.scrollTo(0, 0);
  setGuideKey((k) => k + 1);
  // Restarting during a guide keeps the first origin (BR-TG26).
  setScreen((s) => (s.kind === 'practice' ? { ...s } : { kind: 'practice', guide: 'expenses', back: s, via }));
};
```

`startTutorial` and `launch` are declared after `endTour`, which they call.

- **"App overview"** is `previewTour()` as it stands: `previewing.current = true`, a new
  `tourKey`, Home, phase `'running'`. So:
  - `endTour` writes no onboarding mark;
  - finishing shows "You're all set!", and skipping lands on Home (AC-TG6.1 to AC-TG6.3);
  - the tour's empty draft is created and removed by the existing `tourCleanup` effect
    (AC-TG6.4).

  Its comment changes from "Dev-only" to say that Tutorials replays it too.
- `previewTour` stays as it is in every other respect. Home's dev Preview Tour keeps using it.

**The App-level "Leave without saving?"** (AC-TG1.4, AC-TG1.5, AC-TG5.5):

```tsx
<ConfirmDialog
  open={pendingTutorial !== null}
  title="Leave without saving?"
  message={unsavedNote ?? ''}
  confirmLabel="Discard and leave"
  cancelLabel="Stay"
  destructive
  onCancel={() => setPendingTutorial(null)}
  onConfirm={() => {
    const p = pendingTutorial;
    setPendingTutorial(null);
    if (p) launch(p.tutorial, p.via);
  }}
/>
```

- Stay changes nothing.
- Discard and leave unmounts the workspace when the practice replaces it. That drops the staged
  items, or ends the saved-item edit with the saved item unchanged, which is what leaving does
  today.

**Ending a guide:**

```ts
/** Skip, Escape, Done and End practice return to the origin; Back to Home goes Home (BR-TG20, BR-TG21). */
const endGuide = (to: 'origin' | 'home') => {
  if (screen.kind !== 'practice') return;
  const { back, via } = screen;
  // The origin's session may have been deleted on another device meanwhile (BR-TG20).
  const gone = back.kind === 'session' && !sessions.some((s) => s.id === back.sessionId);
  window.scrollTo(0, 0);
  setScreen(to === 'home' || gone ? { kind: 'home' } : back);
  focusHelp.current = to === 'origin' && !gone && via === 'help';
};

// After returning through "?", focus goes back to it (AC-TG4.1). The workspace has
// committed by the time this runs, since a child's DOM is in place before its parent's effects.
useEffect(() => {
  if (!focusHelp.current || screen.kind !== 'session') return;
  focusHelp.current = false;
  document.getElementById('workspace-help')?.focus();
}, [screen]);
```

**Render changes:**

- `<Header onOpenProfile={...} onOpenTutorials={() => setTutorialsOpen(true)} />`.
- `{tutorialsOpen && <TutorialsDialog onChoose={(t) => { setTutorialsOpen(false); startTutorial(t, 'menu'); }} onClose={() => setTutorialsOpen(false)} />}`.
- `SyncBanner` renders only when `screen.kind !== 'practice'` (BR-TG25). Failures stay in the
  store, so they show as soon as the guide ends.
- `{screen.kind === 'practice' && <PracticeExpenses key={guideKey} onEnd={endGuide} />}`.
- `SessionWorkspace` gets these props:
  - `onHelp={phase === 'running' ? undefined : () => startTutorial('expenses', 'help')}`
    (AC-TG1.7);
  - `onUnsavedChange={setUnsavedNote}`.
- **Loading guard.** It becomes
  `sync.status === 'loading' && !(hasLoaded && (screen.kind === 'collection' || screen.kind === 'practice'))`.
  Without this, a background reload of the real store would replace the practice with the
  spinner.
- **What's new.** It becomes
  `whatsNewOpen = phase === 'off' && screen.kind !== 'practice' && (whatsNewDue || whatsNewPreview)`.
  A guide is never interrupted (BR-TG10), and a due What's new opens once the guide ends.
- **`canAsk`** on Collection gains `&& !tutorialsOpen`.
- **`tourScreen`** is computed from `const shown = screen.kind === 'practice' ? screen.back : screen;`
  so the type stays `ScreenShape`. The tour never runs during a guide, because `launch` ends it
  first.
- **The nav bar** is already `null` for any kind outside `TOP_LEVEL`, so the practice shows no
  Home / Collection / History bar and no + New Session (BR-TG22).

### 6.2 The engine (`GuideTour.tsx`) and the wrapper

```ts
export type GuideStep<P> = {
  /** Matches a `data-tour` attribute in the UI. */
  target: string;
  title: string;
  content: string;
  /** Where the target lives: a screen for the first-run tour, a scene for a guide. */
  place: P;
};

type Props<P> = {
  run: boolean;
  /** Stable (a module constant): Joyride deep-compares the steps and resets when they change. */
  steps: readonly GuideStep<P>[];
  /** The live place, so the tour can tell when it has been left behind. */
  place: P;
  /** Whether the live place satisfies a step's. A module-level function. */
  matches: (step: P, live: P) => boolean;
  /** Whether, on step `index`, the reader went exactly where Next would have gone. Omitted: never. */
  wentToNextStep?: (index: number, live: P) => boolean;
  /** Takes the app to step `index`'s place before it shows. Next and Back call it. */
  onNavigate: (place: P, index: number) => void;
  /** `completed` only when the last step's primary button was pressed. */
  onDone: (completed: boolean) => void;
  /** The last step's primary label. Joyride's "Last" when omitted. */
  lastLabel?: string;
  /** Escape ends the tour as Skip does, unless something on the page already took it (AC-TG4.2). */
  escapeSkips?: boolean;
  /** Every tab but the highlighted one is inert and nudges, keyboard activations included (AC-TG4.6). */
  lockTabs?: boolean;
};

export function GuideTour<P>(props: Props<P>): JSX.Element | null;
```

The body is today's `OnboardingTour` with these substitutions and nothing else:

- `TOUR_STEPS` → `steps`, `screen` → `place`, `screenMatches` → `matches`, and
  `wentToNextStep(...)` → `(wentToNextStep ?? never)(...)`, where `never` is a module-level
  `() => false`. `navigate.current(steps[next].place, next)`.
- The `steps` memo depends on `[steps, lastLabel, escapeSkips]`. Each Joyride step:
  - is today's object;
  - takes the primary label `i === steps.length - 1 ? (lastLabel ?? defaultLocale.last) : defaultLocale.next`;
  - adds `locale: { ...defaultLocale, last: lastLabel }` when `lastLabel` is given;
  - adds `dismissKeyAction: false` when `escapeSkips` is set.
- **Escape**, only when `escapeSkips`:

  ```ts
  useEffect(() => {
    if (!run || !escapeSkips) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || done.current) return;
      // A dialog over the guide (Remove member, Clear All) takes Escape for its own cancel.
      if (document.querySelector('dialog[open]')) return;
      done.current = true;
      finish.current(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [run, escapeSkips]);
  ```

  - React's own `onKeyDown` handlers run on the root container before this `document` listener.
    The rename box (`SessionNameInput:70`) and the PR 2 payment box (`LineRow:202`) already call
    `preventDefault()` on Escape, so they keep it.
  - A native `<dialog>` also keeps it: `ConfirmDialog`, `ModalDialog` and `OnboardingDialog` all
    are `<dialog>` elements.
- **lockTabs.** In the click handler, a keyboard activation (`event.detail === 0`) still returns
  early when `!lockTabs`. With `lockTabs`, it finds the tab with
  `target.closest('[role="tab"]')`. A pointer click keeps today's coordinate lookup. Everything
  after that is unchanged: it ignores the highlighted tab, then calls `preventDefault`,
  `stopPropagation` and the nudge.
- **The dev missing-target warning** and **the left-behind effect** run as today, over the props.
  `matches` and `wentToNextStep` go in their dependency lists.

**`OnboardingTour.tsx`** becomes:

```tsx
// The first-run tour's steps in the engine's shape, built once so their identity never changes.
const STEPS: GuideStep<ScreenShape>[] = TOUR_STEPS.map(({ screen, ...step }) => ({ ...step, place: screen }));

export function OnboardingTour({ run, screen, onNavigate, onDone }: Props) {
  return (
    <GuideTour
      run={run}
      steps={STEPS}
      place={screen}
      matches={screenMatches}
      wentToNextStep={wentToNextStep}
      onNavigate={onNavigate}
      onDone={onDone}
    />
  );
}
```

`Props` and its comments stay. The first-run tour keeps Joyride's default Escape behaviour
(section 12, D2).

**Joyride details, checked against `node_modules/react-joyride` 3.2.0.** Every guide step uses
the same options as the first-run tour: `blockTargetInteraction: false`,
`overlayClickAction: false`, `skipBeacon: true`, the same colours and `zIndex: 10_000`.

- **Focus trap, kept on** (the default `disableFocusTrap: false`).
  - `Step.tsx:44` calls `useFocusTrap(tooltipElement, '[data-action=primary]')`. The hook listens
    for **Tab keydowns on the tooltip element only**, focuses the primary button 100 ms after the
    step mounts, and restores the previous focus when the step ends.
  - A tap in the spotlight passes through, because `blockTargetInteraction: false`. Focus moves
    into the target and typing works, so tap-and-type needs no change (AC-TG2.4).
  - From a field in the target, Tab moves on through the page. That's how a keyboard can reach a
    tab or End practice (AC-TG4.5, AC-TG4.6).
- **Escape.** `dismissKeyAction` accepts `'close' | 'next' | 'replay' | false` and has no
  `'skip'`. The default `'close'` advances the index by one (`useControls.ts:29-45`), so in the
  first-run tour Escape acts as Next today, despite the comment at `OnboardingTour.tsx:113-114`.
  Guides set `dismissKeyAction: false` and use the listener above.
- **Scroll on phone.** The defaults stay: `skipScroll: false`, `scrollOffset: 20`,
  `scrollDuration: 300`, `placement` `'bottom'`.
  - Joyride puts the target's top 20 px below the viewport top (`dom.ts getScrollTo`), so the top
    of a target taller than the screen is in view (AC-TG13.2).
  - floating-ui flips and shifts the tooltip to keep it on screen.
  - The practice has no sticky element: the banner is in the page flow and `SyncBanner` is
    hidden. The phone's fixed session-tabs pill sits under the overlay, which has
    `zIndex: 10_000`.
  - `scrollToFirstStep` stays false. `launch` scrolls to the top, which puts E1's card in view.
- **Remount under a step.** When a scene remounts, `targetWaitTimeout` (1000 ms by default) waits
  for the new target. If a target never appears, Joyride shows nothing in controlled mode, and
  the banner's End practice is the way out.

### 6.3 The practice screen (`guides/PracticeExpenses.tsx`)

```tsx
type Props = {
  /** Ends the guide: where it started, or Home for "← Back to Home" (BR-TG20, BR-TG21). */
  onEnd: (to: 'origin' | 'home') => void;
};

export function PracticeExpenses({ onEnd }: Props) {
  const [scenes] = useState(() => expensesScenes(todayIso()));
  const [scene, setScene] = useState<ExpensesSceneId>(EXPENSES_STEPS[0].place);
  /** Bumped to start the current scene again as designed (BR-TG14). */
  const [generation, setGeneration] = useState(0);
  const membersIntact = useRef(true);
  const navigate = (place: ExpensesSceneId, index: number) => { /* section 5.3 */ };
  return (
    <>
      <PracticeBanner onEnd={() => onEnd('origin')} />
      <PracticeScene
        key={`${scene}:${generation}`}
        scene={scenes[scene]}
        onBackToHome={() => onEnd('home')}
        onMembersIntact={(intact) => { membersIntact.current = intact; }}
      />
      <GuideTour run steps={EXPENSES_STEPS} place={scene} matches={sameScene}
        onNavigate={navigate} onDone={() => onEnd('origin')}
        lastLabel="Done" escapeSkips lockTabs />
    </>
  );
}

/** One scene's practice workspace, its own store and profile included. Exported for the render test. */
export function PracticeScene({ scene, onBackToHome, onMembersIntact }: SceneProps) {
  // The practice's own Paid By memory, never App's (AC-TG3.4).
  const [picks] = useState<PaidByPicks>(() => new Map([[scene.session.id, scene.paidBy]]));
  return (
    <PracticeSessionsProvider seed={[scene.session]}>
      <PracticeProfileProvider>
        <MembersWatch sessionId={scene.session.id} members={scene.session.members} onChange={onMembersIntact} />
        <SessionWorkspace
          sessionId={scene.session.id}
          paidByPicks={picks}
          tab="expenses"
          // Only Expenses works in practice; GuideTour's lockTabs nudges (BR-TG22).
          onTabChange={() => {}}
          onBack={onBackToHome}
          // Unreachable: Summary never shows in practice.
          onClosed={() => {}}
          practice={{ seed: scene.form, initialStaged: scene.staged }}
        />
      </PracticeProfileProvider>
    </PracticeSessionsProvider>
  );
}
```

- `sameScene` is a module-level `(a, b) => a === b`.
- `onMembersIntact` is wrapped in `useCallback`.
- `MembersWatch` is a module-private component. It reads `useSessionsStore().sessions`, works out
  whether every seeded member is still in the session, and reports that in an effect. It renders
  nothing.
- `GuideTour` and `PracticeBanner` sit **outside** the keyed subtree, so a scene change never
  remounts them.
- The practice never passes `onHelp` or `onUnsavedChange`, so there's no "?" inside practice.

**`PracticeSessionsProvider` and `PracticeProfileProvider`:**

```tsx
// SessionsStoreContext.tsx
export function SessionsStoreProvider({ children }: { children: ReactNode }) {
  return <SessionsStoreCore backend={useServerSessions()}>{children}</SessionsStoreCore>;
}
/** A guide's practice store: the same domain logic over memory, with no request ever sent (BR-TG3). */
export function PracticeSessionsProvider({ seed, children }: { seed: Session[]; children: ReactNode }) {
  return <SessionsStoreCore backend={useMemorySessions(seed)}>{children}</SessionsStoreCore>;
}

// ProfileContext.tsx
/** The practice "you" (BR-TG19). Nothing is read from or written to the account. */
const PRACTICE_PROFILE: ProfileValue = {
  status: 'ready', displayName: 'Ana', nicknames: [], saveError: null,
  save: async () => true, remember: async () => {}, dismissSaveError: () => {},
  alreadySettledAnswered: true, answerAlreadySettled: () => {}, reload: () => {},
};
export function PracticeProfileProvider({ children }: { children: ReactNode }) {
  return <ProfileContext.Provider value={PRACTICE_PROFILE}>{children}</ProfileContext.Provider>;
}
```

`SessionsStoreCore` is today's `SessionsStoreProvider` body, with the `useServerSessions()` call
replaced by the `backend` prop:

```ts
const { sessions, mutateSession, ... } = backend;
```

Nothing else in it changes. The body moves as it is, comments included.

**`SessionWorkspace` changes**

```ts
/** Starts the Expenses guide. "?" shows on the Expenses tab only while this is given. */
onHelp?: () => void;
/** The "Leave without saving?" message while there's unsaved work, else null, so the app can ask before a tutorial. */
onUnsavedChange?: (message: string | null) => void;
/** A guide's practice: no leave prompts or reload warning, and the scene's seed (tab-guides). */
practice?: { seed?: PurchaseFormSeed; initialStaged?: StagedItem[] };
```

- `const hasUnsaved = !practice && (stagedCount > 0 || savedEdit !== null);`. Practice is never
  saved, so neither Back nor a tab asks (BR-TG21).
- The message moves into `leaveMessage(savedEdit, stagedCount)`, with the same text, used by the
  existing dialog.
- The report: `const unsavedMessage = hasUnsaved ? leaveMessage(savedEdit, stagedCount) : null;`,
  then:

  ```ts
  useEffect(() => { onUnsavedChange?.(unsavedMessage); }, [onUnsavedChange, unsavedMessage]);
  useEffect(() => () => onUnsavedChange?.(null), [onUnsavedChange]);
  ```
- `<ExpensesPage ... practice={practice} />`.
- The "?" button is the last child of `.bar`, after the title block and outside the `session &&`
  guard:

  ```tsx
  {tab === 'expenses' && onHelp && (
    <Button
      variant="ghost"
      size="sm"
      id="workspace-help"
      className={styles.help}
      aria-label="How the Expenses tab works"
      onClick={onHelp}
    >
      <HelpIcon className={styles.helpIcon} />
      <span className={styles.helpLabel}>How this works</span>
    </Button>
  )}
  ```

**`ExpensesPage` changes**

- `practice?: { seed?: PurchaseFormSeed; initialStaged?: StagedItem[] }`.
- `useState<StagedItem[]>(() => practice?.initialStaged ?? [])`.
- `const hasUnsaved = !practice && (staged.length > 0 || savedEdit !== null);`, with the comment
  "practice is never saved, so a reload has nothing to lose (AC-TG4.7)".
- `<PurchaseItemCard key={formKey} seed={formKey === 0 ? practice?.seed : undefined} ... />`.
  Clear All remounts the card fresh rather than putting the scene back.

**`PurchaseItemCard` changes**

- `seed?: PurchaseFormSeed`, documented as "A guide scene's fields, read once as the card mounts
  (tab-guides)."
- A module-level helper next to `fieldsFromStaged`:

  ```ts
  /** What a guide scene opens with: its row as Edit loads it, and Total Amount as the scene typed it. */
  function fieldsFromSeed({ row, totalAmount }: PurchaseFormSeed, members: string[]): Fields {
    const fields = fieldsFromStaged(row, members);
    return totalAmount === undefined
      ? fields
      : { ...fields, draft: { ...fields.draft, totalAmount: totalAmount.toFixed(2), totalFollows: false } };
  }
  ```
- `const [seeded] = useState(() => (seed ? fieldsFromSeed(seed, members) : null));`, placed after
  `savedBoot`.
- Each of the five initialisers appends one fallback before its default:
  - `savedBoot?.fields.date ?? seeded?.date ?? todayIso()`;
  - `savedBoot?.fields.payorMode ?? seeded?.payorMode ?? remembered.payorMode`;
  - the same pattern for `singlePayor`, `contributions` and `draft`.

  No other behaviour changes.

**Phone and desktop**

| Element | Desktop (> 640px) | Phone (≤ 640px, inside `@media (max-width: 640px)` only) |
|---|---|---|
| "?" | An ordinary ghost `sm` Button at the right end of the bar: the 16 px `HelpIcon` and "How this works". It's the same height as ← Back to Home, so the bar doesn't grow, and nothing else moves (AC-TG13.4). | `.bar .help { min-width: 44px; min-height: 44px; padding: 0; border-radius: 50%; border-color: var(--border); }` and `.bar .helpLabel { display: none; }`. It's icon-only, and `aria-label` carries the name. The two-class selector beats `Button.module.css`'s 38 px rule whatever the stylesheet order. |
| Practice banner | A full-width strip above the workspace bar, in the page flow (not sticky). | The same. It wraps to two lines at 375 px. There's no media query, and no horizontal scroll (AC-TG13.3). |
| Tutorials dialog | `OnboardingDialog`, 26 rem wide. | `OnboardingDialog`'s existing phone sizing. |
| Practice workspace | The real `SessionWorkspace`, with no top nav bar. | The same, with the session-tabs pill fixed at the bottom as in a real session. |

New CSS. Every value comes from `tokens.css`.

```css
/* SessionWorkspace.module.css: the desktop part. */
.helpIcon { width: 16px; height: 16px; display: block; }

/* PracticeBanner.module.css */
.banner { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 10px 14px;
  margin-bottom: 0.75rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--info-bg); }
.message { font-size: 13px; color: var(--info-text); margin-right: auto; min-width: 0; overflow-wrap: anywhere; }

/* TutorialsDialog.module.css */
.list { display: flex; flex-direction: column; gap: 8px; text-align: left; }
.choice { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 12px 14px; font: inherit;
  border: 1px solid var(--border2); border-radius: var(--radius-sm); background: var(--surface2);
  color: var(--text); text-align: left; cursor: pointer; }
.choice:hover, .choice:focus-visible { border-color: var(--accent); }
.choiceLabel { font-size: 14px; font-weight: 600; }
.choiceDescription { font-size: 12px; line-height: 1.45; color: var(--text2); }
```

**`PracticeBanner`**

```tsx
export function PracticeBanner({ onEnd }: { onEnd: () => void }) {
  // Filled in after mount, so a screen reader announces it once as the guide starts:
  // text already in a live region when it mounts isn't reliably read (BR-TG23).
  const [text, setText] = useState('');
  useEffect(() => setText('Practice session. Nothing here is saved.'), []);
  return (
    <div className={styles.banner}>
      <span className={styles.message} role="status">{text}</span>
      <Button size="sm" variant="ghost" onClick={onEnd}>End practice</Button>
    </div>
  );
}
```

**`TutorialsDialog`**

```tsx
export type Tutorial = 'overview' | 'expenses';

const TUTORIALS: { id: Tutorial; label: string; description: string }[] = [
  { id: 'overview', label: 'App overview', description: "A one-minute tour of Hati's screens." },
  { id: 'expenses', label: 'Logging expenses',
    description: 'Adding people and purchases, including receipts with shared dishes and discounts.' },
];
```

- It renders `<OnboardingDialog open title="Tutorials" message={<span className={styles.list}>…</span>} onDismiss={onClose}>`.
- Each choice is a `<button type="button" className={styles.choice}>` with the label and
  description spans, calling `onChoose(id)`.
- The children are `<Button variant="ghost" onClick={onClose}>Close</Button>`. Escape is Close
  (AC-TG5.7).
- PR 1 lists exactly these two (AC-TG5.3).

**`Header`**

- `onOpenTutorials?: () => void` is added.
- The menu block renders when `onOpenProfile && onOpenTutorials` are both given. The loading
  screen passes neither, as today.
- Inside `UserButton.MenuItems`, a new
  `<UserButton.Action label="Tutorials" labelIcon={<TutorialsIcon className={styles.menuIcon} />} onClick={onOpenTutorials} />`
  goes between Profile and `manageAccount`, so the order is Profile, Tutorials, Manage account,
  Sign out (AC-TG5.1). Its comment changes to match.

**Icons** (`icons.tsx`, in the existing `Icon` wrapper; extend the file's top comment with
"the '?' button and the Tutorials item"):

```tsx
export function HelpIcon(props: Props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.25a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <path d="M12 17h.01" />
    </Icon>
  );
}

export function TutorialsIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 6.5C10.5 5.3 8.5 4.75 4 5v13c4.5-.25 6.5.3 8 1.5 1.5-1.2 3.5-1.75 8-1.5V5c-4.5-.25-6.5.3-8 1.5z" />
      <path d="M12 6.5v13" />
    </Icon>
  );
}
```

### 6.4 The steps (`guides/expensesSteps.ts`)

```ts
export const EXPENSES_STEPS: GuideStep<ExpensesSceneId>[] = [ /* E1 to E17 */ ];
```

There are 17 steps, in the order of requirements section 6.1. `title` and `content` are copied
**verbatim** from that table. The copy is provisionally approved (OQ-TG9), and changes at the
owner check are expected to be copy-only. `place` is the scene, and `target` is from section 7.

## 7. Onboarding tour impact

**The first-run tour.** No first-run target is moved, renamed or duplicated, and `steps.ts` and
`steps.test.ts` are unchanged.

- "?" is added to the bar beside `workspace-back`. `workspace-back` itself doesn't move.
- The practice **replaces** the real workspace, so `workspace-back` and `tab-*` are never mounted
  twice.
- The practice has no nav bar, so `nav-*` and `new-session` are absent from it.

**The new guide targets.** All are unique: each sits on an element mounted once per screen, and
each is declared in exactly one source location.

| Step(s) | Target | Element | File | Absent when |
|---|---|---|---|---|
| E1 | `group-members` | MemberList's `Card` (`<section>`, through Card's new `'data-tour'` prop) | `MemberList.tsx` | never |
| E2 | `purchase-date` | `div.dateField` | `PurchaseDetailsFields.tsx` | never |
| E3, E4 | `paid-by` | `div.wrap` | `PayorModeFields.tsx` | never (members are checked by `MembersWatch`) |
| E5 | `item-name` | `div.nameRow` | `ItemModeFields.tsx` | never |
| E6 | `equal-owners` | `div.wrap` | `EqualSplitFields.tsx` | Custom Amounts is on |
| E7 | `item-mode` | `div.subhead` (the Add Item label and its toggle) | `PurchaseItemCard.tsx` | never |
| E8 | `custom-total` | `div.totalGroup` (Total Amount and Fill Remainder) | `CustomAmountFields.tsx` | Equal Split is on |
| E9 | `who-in-item` | the `div.field` holding "Who's in this item" | `CustomAmountFields.tsx` | Equal Split is on |
| E10 | `sub-items` | **one** `div.block`: the first picked member with two or more sub-items, which is Ben's in X3, via `data-tour={m === tourBlock ? 'sub-items' : undefined}` | `CustomAmountFields.tsx` | no member has two sub-items |
| E11 to E13 | `bill-shared`, `bill-discounts`, `bill-charges` | `div.billSection`, via `` data-tour={`bill-${section}`} `` (the section renders only with rows) | `CustomAmountFields.tsx` | that section has no rows |
| E14 | `custom-figures` | `div.totals` (Subtotal to Entered) | `CustomAmountFields.tsx` | no discount or charge is priced |
| E15 | `add-item` | the "+ Add Item" `Button` | `PurchaseItemCard.tsx` | a staged item is being edited |
| E16 | `staged-list` | `div.list` | `ItemStagingList.tsx` | nothing is staged |
| E17 | `save-to-breakdown` | the "Save to Breakdown →" `Button` | `PurchaseItemCard.tsx` | never |

```tsx
// CustomAmountFields: one block carries the guide's sub-items target. It's the first with two or
// more sub-items, so it's one element on screen, and in the practice receipt it's Ben's.
const tourBlock = picked.find((m) => linesOf(lines, m).length > 1);
```

These attributes are inert in a real session. They follow the approved rule as follows:

- every guide step's target is supplied by its scene's seed, which the render test proves;
- `sub-items` goes on one instance of a repeated element;
- the bill targets go on section containers that render once each.

Run `steps.test.ts`, `targets.test.ts` and `guides/guides.test.ts` after any change near them.

**The CLAUDE.md rewording (approved).** Replace the whole `**Onboarding tour**` block (lines
106 to 111) with exactly this:

```md
**Onboarding tour and guides** (`src/components/onboarding/`)
- Every step targets an element on the screen the reader is already on, never
  one on the next page.
- The first-run tour targets only elements that are there with no data.
- A guide step may target an element that appears only with data when the
  guide itself seeds that data in an in-memory practice session that is never
  saved. The step names the scene that supplies it.
- A target on a repeated element goes on one instance or on its container.
- `data-tour` attributes stay on the elements the steps point at. Never move,
  rename or duplicate a mounted target. Run `steps.test.ts`, `targets.test.ts`
  and `guides/guides.test.ts` after touching anything near them.
- Static tests only; no jsdom or testing-library.
```

The coordinating session updates the `hati-tutorial-step-targets` memory note to match. It lives
outside the repo, so the developer doesn't touch it.

## 8. Test plan

Write these first and watch them fail, then build until they pass.

**`src/lib/memorySessions.test.ts`** (new)

- `mutateOne`:
  - returns null for a missing id, and for an `fn` that returns the same session;
  - otherwise replaces only that session, with `activityAt === now`.
- `addPaymentsTo` stamps `createdAt` and skips an id already there.
- `removePaymentFrom` and `removeAllPaymentsFrom` work as named.
- `settleOne`, on Ana paying ₱100 Equal Split between Ana and Ben, records one payment of 5000
  cents from Ben to Ana, and `isFullyPaid` is then true.
- `appendNew` keeps the existing sessions and adds only new ids.

**`src/lib/apiValidation.test.ts`**

- `isPracticeSessionId`:
  - true for `'practice_expenses'`;
  - false for `'session_ab12'`, `'practice'`, `'Practice_x'` and `''` (AC-TG3.5).

**`src/lib/staging.test.ts`**

- `leaveMessage`:
  - `(null, 2)` gives "You have 2 staged items that aren't saved.";
  - `(null, 1)` gives "You have 1 staged item that isn't saved.";
  - a saved edit named Taxi gives "Your changes to Taxi aren't saved." (AC-TG1.4, AC-TG1.5).

**`src/components/onboarding/targets.test.ts`** (extended)

- `declaredTargets()` also matches the conditional form
  `/data-tour=\{[^{}]*\?\s*'([a-z-]+)'\s*:\s*undefined\s*\}/g`.
- `it.each(EXPENSES_STEPS.map((s) => s.target))('has an element for "%s"')`, using the same
  prefix logic, so `bill-*` covers the three bill targets.
- **"Every guide target appears in exactly one source location."** For each `EXPENSES_STEPS`
  target, count across every non-test source:
  - the literal `data-tour="t"`;
  - the conditional form naming `t`;
  - each template prefix that `t` starts with.

  The total must be 1.

**`src/components/onboarding/guides/guides.test.ts`** (new)

1. **Steps** (AC-TG2.1):
   - there are 17 steps;
   - the targets, in order, are `group-members, purchase-date, paid-by, paid-by, item-name, equal-owners, item-mode, custom-total, who-in-item, sub-items, bill-shared, bill-discounts, bill-charges, custom-figures, add-item, staged-list, save-to-breakdown`;
   - the places, in order, are `X1 ×3, X2 ×3, X3 ×9, X4 ×2`;
   - every target matches `/^[a-z-]+$/`, and every content is longer than 20 characters.
2. **"Every step names a scene that exists."** `place` is a key of `expensesScenes(today)`.
3. **Seeds pass the validators** (BR-TG17), for each scene's `form.row` and `staged` rows:
   - `parseSession({ ...session, records })` deep-equals the input, where
     `records = buildRecords(rows).map((r, i) => ({ ...r, id: 'r' + i, createdAt: '2026-01-01T00:00:00.000Z' }))`;
   - each Custom item satisfies `billMatches(item.bill, item.amounts)`, and `item.amounts` equals
     `billAmounts(item.bill, billMembers(item.bill))`;
   - each Multiple Payors row satisfies `contributionsMatch`;
   - every session id satisfies `isPracticeId`.
4. **The X3 figures** (AC-TG2.2, AC-TG2.5). With
   `lines = linesFromItem(dinner, members)` and `bill = billDraftFromItem(dinner, members)`,
   `readBillDraft` gives `subtotal` 690, `discounts` 30, `charges` 80, `entered` 740 and the shares
   in section 5.2. Then:
   - `fillRemainder(860, members, lines, 250).Dino[0].price` is `'120.00'`;
   - after filling, `entered` is 860 and Dino's share is 160.
5. **X4's total:** `sumMoney(staged.map((s) => getItemTotal(s.item)))` is 2060.
6. **Render per scene: the data-dependent targets are on screen** (AC-TG2.2, BR-TG14). For each
   scene, `renderToStaticMarkup(<PracticeScene scene={…} onBackToHome={noop} onMembersIntact={noop} />)`,
   then for each step whose `place` is that scene, the markup contains `data-tour="<target>"`
   exactly once. Also:
   - in X3, the markup after `data-tour="sub-items"` and before "Add sub-item for Ben" contains
     `value="Chicken inasal"`, `value="120.00"`, `value="Iced tea"` and `value="40.00"`;
   - in X2, the markup contains `id="contrib-Ana"` with `value="700.00"`;
   - in X4, it contains "2 items staged".
7. **Isolation** (BR-TG3). The files are `src/hooks/useMemorySessions.ts`,
   `src/lib/memorySessions.ts`, `src/lib/practiceId.ts` and every non-test `.ts`/`.tsx` under
   `src/components/onboarding/guides/`. None of them:
   - runtime-imports (not `import type`) a specifier containing `@clerk/`, `useServerSessions`,
     `writeQueue` or `useOnboarding`;
   - contains `fetch(`, `authorisedFetch`, `useAuth`, `XMLHttpRequest` or `sendBeacon`.

   Use the import regex style of `src/lib/apiImports.test.ts`.
8. **The practice profile.** Render a probe inside `PracticeProfileProvider` that prints
   `useProfile()`'s fields. It reads `displayName` "Ana", `status` "ready" and
   `alreadySettledAnswered` true.

**`src/components/layout/SessionWorkspace.test.ts`** (extended). Render `SessionWorkspace` with
`renderToStaticMarkup`, inside `PracticeSessionsProvider` and `PracticeProfileProvider`, seeded
with a one-member draft:

- `tab="expenses"` with `onHelp` has `aria-label="How the Expenses tab works"` and
  `id="workspace-help"` (AC-TG1.1);
- `tab="expenses"` without `onHelp` has neither;
- `tab="breakdown"` with `onHelp` has neither (AC-TG1.2).

**Unchanged and still green:** `steps.test.ts` and `whatsNew.test.ts`. PR 1 doesn't bump the
version.

**Checks for the ui-ux-tester** (`npm run dev:full`, port 3000, at 375 px and 1280 px, with the
network log open):

| AC | Check |
|---|---|
| AC-TG1.1, AC-TG1.2, AC-TG1.7 | "?" is visible without scrolling on Expenses only. Its name is "How the Expenses tab works". It's icon-only on a phone and reads "How this works" on desktop. It's absent on Breakdown and Summary, and during the first-run tour (App overview). |
| AC-TG1.3 | With nothing staged, "?" starts E1 at once, with the banner on top. |
| AC-TG1.4, AC-TG1.5 | With 2 staged items, the prompt reads as specified: Stay keeps both, and Discard and leave starts the guide. From Breakdown's Edit on Taxi, the prompt reads "Your changes to Taxi aren't saved.", and after Discard Taxi is unchanged on Breakdown. |
| AC-TG1.6 | A typed but unadded name starts the guide with no prompt and is gone on return. |
| AC-TG2.1 to AC-TG2.3 | E1 to E17 run in order with the right copy and a filled target. E1 offers Skip and Next, E2 on add Back, and E17's button reads "Done". |
| AC-TG2.4 to AC-TG2.6 | Type in a highlighted field, tick a member, tap Fill Remainder at E14 (Dino's sub-item becomes 120.00 and Entered ₱860.00 has no red), and + Add Item at E15 (it's staged and the form clears). |
| AC-TG2.7, AC-TG2.8 | What's typed survives Next within X3 and resets on the move to X4 and on Back to X2. Removing the Senior discount at E9, then going to E12, brings the row back. Clear All at E1, then going to E3, brings the members back. |
| AC-TG2.9 | A tap on the dimmed area does nothing. |
| AC-TG3.1 to AC-TG3.4 | The banner shows. Through the whole guide (add a member, + Add Item, Save to Breakdown), the network log has **no** `/api/sessions`, `/api/payments` or `/api/user` request. Afterwards the real sessions, Home's order and the real Paid By pick are unchanged, and no "Beach trip" appears anywhere. |
| AC-TG3.5 | Local dev only. From the console, with a Clerk token, `POST /api/sessions` with `{"id":"practice_x"}` returns 400, and `PUT /api/sessions/practice_x` returns 400. |
| AC-TG4.1 to AC-TG4.7 | Skip, Escape, Done and End practice return to the origin, scrolled to the top, with focus on "?" when that's how the guide started. Escape inside the Remove-member dialog closes only the dialog. ← Back to Home lands on Home. Breakdown and Summary, tapped or activated by keyboard, only nudge. A reload mid-guide gives no leave prompt and lands on Home. |
| AC-TG5.1 to AC-TG5.7 | The menu order is Profile, Tutorials, Manage account, Sign out, with an icon. The dialog lists two tutorials with descriptions and Close. Logging expenses starts E1 with the right origin. The leave prompt shows first with staged items. Tutorials works with the profile load blocked (DevTools request blocking on `/api/user`). Escape and Close start nothing. |
| AC-TG6.1 to AC-TG6.4 | App overview runs from Home with no welcome. Finishing shows "You're all set!", and Skip lands on Home. The network log has **no `PUT /api/user`**. The replay's empty draft is created and deleted, as with Preview Tour. |
| AC-TG13.1 to AC-TG13.4 | The steps are the same on both widths. Each tooltip is fully on screen and its target in view, with the top in view for tall ones (E1, E10, E16). The banner takes at most two lines at 375 px, with no sideways scroll. On desktop nothing moves except to make room for "?". |
| Regression | The first-run tour, through Preview Tour, still runs all 7 steps on both widths. The New Session tap on step 1 still follows along. |

Before the hand-off, run `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`, and report
the real results.

## 9. Documentation impact

For the documentation-engineer, after the change ships:

- **The user-facing guide:** the "?" button, the practice session and what "nothing is saved"
  means, and Profile → Tutorials (App overview, Logging expenses).
- **Architecture notes:**
  - the store is a core over a backend (server or memory);
  - `PracticeSessionsProvider` and `PracticeProfileProvider`;
  - the `practice` screen kind;
  - `GuideTour` as the engine, with the first-run tour as a wrapper.
- **The API reference:** `/api/sessions` and `/api/sessions/[id]` return 400 for `practice_` ids.
- **`docs/mobile-breakpoints.md`:** the "?" button's 44 px rule in `SessionWorkspace.module.css`.
- **`CLAUDE.md`:** changed in this PR (section 7). No further doc work.
- The Obsidian vault only when the owner asks.

## 10. Tasks (in order)

1. **Tests first.** Write the failing tests in section 8 (`memorySessions.test.ts`, the
   `apiValidation`, `staging` and `targets` additions, and `guides.test.ts`). Expected result:
   red.
2. **Lib.**
   - Add `src/lib/practiceId.ts`.
   - Add `src/lib/memorySessions.ts`.
   - In `src/lib/staging.ts`, add `PurchaseFormSeed` and `leaveMessage`.
   - Check: `memorySessions`, `staging` and `apiValidation` (once step 3 is done) are green.
3. **API.**
   - Add `isPracticeSessionId` to `api/_validate.ts`.
   - Add the guards in `api/sessions/index.ts` (POST) and `api/sessions/[id].ts` (all methods).
   - Check: `apiImports.test.ts` and `apiValidation.test.ts` are green.
4. **Store.**
   - Export `SessionsBackend` from `useServerSessions.ts`.
   - Add `useMemorySessions.ts`.
   - Split `SessionsStoreContext.tsx` into the core plus the two providers.
   - Add `PracticeProfileProvider`.
   - Check: `npx tsc -b`, and the app runs unchanged.
5. **Engine.**
   - `git mv OnboardingTour.module.css GuideTour.module.css`.
   - Write `GuideTour.tsx`, and make `OnboardingTour.tsx` the wrapper.
   - Check: `steps.test.ts` and `targets.test.ts` (first-run part) are green, and Preview Tour runs
     all 7 steps on both widths.
6. **Targets.**
   - Add Card's `'data-tour'` prop.
   - Add every attribute in the section 7 table.
   - Check: `targets.test.ts` is fully green.
7. **Seeds and props.**
   - `PurchaseItemCard`: `seed` and `fieldsFromSeed`.
   - `ExpensesPage`: `practice`.
   - `SessionWorkspace`: `practice`, `onHelp`, `onUnsavedChange`, "?", `leaveMessage`, and the CSS.
   - Add `HelpIcon` and `TutorialsIcon`.
   - Check: the `SessionWorkspace` test is green, and real Expenses behaves as before.
8. **Guide.**
   - Write `expensesScenes.ts`, `expensesSteps.ts`, `PracticeBanner` and `PracticeExpenses`.
   - Check: `guides.test.ts` is fully green.
9. **App and the menu.**
   - Write `TutorialsDialog`.
   - Add the Tutorials item to `Header`.
   - In `App.tsx`, add the screen kind, the start and end paths, the confirm dialog, the focus
     return, the loading, What's new and `canAsk` guards, and the `SyncBanner` condition.
   - Check: walk the tester table locally at 375 px and 1280 px with the network log open.
10. **CLAUDE.md.** Paste the section 7 block.
11. **Final checks.** Run `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`. Give the
    owner the local URL (`npm run dev:full`, port 3000) and the branch.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| Practice data reaches Neon `main`. | A practice subtree sits under nested providers, so its writes go to memory. The memory backend has no network code, and the isolation test enforces that. The server refuses `practice_` ids. The tester checks the network log. |
| A practice component outside the nested providers reaches the real store. | `PracticeScene` is the only place that mounts the practice workspace, and the providers wrap it. The banner and `GuideTour` call only callbacks. The render test exercises the full scene tree. |
| The engine refactor regresses the first-run tour. | `steps.test.ts` doesn't change. The wrapper keeps the props and Joyride options, and Escape keeps its default. The tester re-runs App overview and Preview Tour. |
| Joyride positioning at 375 px when a scene remounts under a step (architect unknown 7). | The targets are tight (Ben's block, `div.totals`, `div.list`), `targetWaitTimeout` covers the remount, and the tester checks at 375 px. If a tooltip still overlaps, the fix is a per-step `placement`, a copy-free change. |
| Typing is lost on a scene change. | By design (BR-TG13). The scene boundaries are as approved. |
| The first-run tour and the guides treat Escape differently. | Documented (decision D2). The guides meet AC-TG4.2. |
| A background reload of the real store would blank the practice. | The loading guard includes `practice`. |
| App overview replays write to `main`: one create and one delete of an empty draft. | Accepted by the owner (decision 4). It's the existing preview path. |
| `sub-items` moves if the reader gives Ana a second sub-item before E10. | Harmless: the step still shows, on Ana's block. A copy tweak can follow if the owner minds. |
| `renderToStaticMarkup` meets the lazy `DevDataBar` (DEV is true under Vitest). | React 18's server renderer outputs the `Suspense` fallback (`null`). If it doesn't, stop and report rather than adding a mock. |

**Size: large.** There are about 42 files: 13 new, 1 renamed and 28 edited. There's no schema change, and the
API change is two guards. The risk is concentrated in the store split and the engine
extraction, and both are mechanical moves covered by existing behaviour and new tests.

## 12. Decisions for the user

These are all small. The spec implements the recommendation in each case, so none blocks
approval.

- **D1. The "?" accessible name against its visible text.** AC-TG1.1 fixes the name as "How the
  Expenses tab works", while desktop shows "How this works". WCAG 2.5.3 (label in name) asks that
  the accessible name contain the visible text, so speech users saying "click How this works"
  may miss it.
  - **Recommendation:** keep the AC as written for PR 1, and change it if the owner wants, to
    either:
    - `aria-label="How this works: the Expenses tab"`; or
    - drop the `aria-label` on desktop.
- **D2. Escape in the first-run tour.** In react-joyride 3.2.0, Escape advances the first-run
  tour (it acts as Next). The guides make Escape act as Skip.
  - **Recommendation:** leave the first-run tour alone in PR 1, because its behaviour is out of
    scope. If the owner wants consistency, it's one later line: `escapeSkips` on the wrapper.
- **D3. `sub-items` on one block, not the container.** This is chosen for a smaller spotlight on
  phones and copy that matches ("Ben had two things"). It needs the targets scanner to learn the
  conditional form.
  - **Alternative:** the whole blocks container, which has a simpler attribute but a tall
    spotlight at 375 px.
- **D4. `renderToStaticMarkup` in the scene test.** I read this as within "static tests only",
  because existing tests already use it.
  - **Alternative, if the owner disagrees:** test 6 becomes a source-level check, which is
    weaker.

### Decided (2026-11-16)
The owner delegated these overnight, and the coordinating session decided them. The spec is
approved for the build with the following:

- **D1.** Use `aria-label="How this works: the Expenses tab"`. It contains the visible text, as
  WCAG 2.5.3 requires, and still names the tab when the button is icon-only on a phone.
  AC-TG1.1 is amended to match.
- **D2.** The first-run tour's Escape stays as it is in PR 1. It's flagged to the owner as a
  possible follow-up.
- **D3.** `sub-items` goes on one block, as specified.
- **D4.** `renderToStaticMarkup` in the scene test is accepted.

### Owner feedback, round 1 (2026-11-17)
The owner looked at PR 1 and changed the help control. This supersedes the "?" button in
section 6.3 and the "?" rows of the tester table in section 8, and amends AC-TG1.1 (in the
requirements) and decision D1.

1. **Placement.** The control is a third line in the right-hand title stack of the session bar,
   under the date, right-aligned with it. It's still shown only on the Expenses tab, only when
   `onHelp` is given, and not during the first-run tour. It's hidden while the session is being
   renamed, because the rename box replaces the title stack.
2. **Wording.** The visible text is "Need help?" with the "?" icon after it. The accessible name
   is `aria-label="Need help? See how to log expenses"`, which contains the visible text
   (WCAG 2.5.3).
3. **Style.** It's a small accent-green text link with no border or fill, but a real
   `<button type="button">`, with a visible focus ring. On a phone its padding makes the tap
   target about 44px tall, and negative margins give the height back, so the bar's row doesn't
   grow.
4. **Phones.** The icon-only round button is gone. Phones show "Need help?" the same way as
   desktop. No other phone-only rule was needed.
5. **Empty-session hint.** While a real session has no members, Group Members shows a second
   line under "No members yet. Add some above.": "New to Hati? See how to log expenses." The
   second part is a link-styled button that calls the same `startTutorial('expenses', 'help')`.
   It reaches Group Members through `onHelp` (`SessionWorkspace` → `ExpensesPage` →
   `MemberList`), so it's hidden whenever "Need help?" is (the first-run tour) and never appears
   in practice, which doesn't pass `onHelp` and always has members. It isn't a `data-tour`
   target. On return from the guide, focus goes to "Need help?" as before.
