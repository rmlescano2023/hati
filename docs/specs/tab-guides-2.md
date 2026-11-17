# Spec: tab guides, PR 2 (Collection guide, seen flags and offers, What's new v2)

Status: **draft, waiting for the owner's approval.** Branch `tab-guides-2`, from `origin/main` at
`de41675` (PR #165 merged).

## 1. Summary

PR 1 shipped the practice session, the guide engine, the Expenses guide, "Need help?" on Expenses
and Tutorials. PR 2 adds:

- the 7-step **Collection guide** ("Tracking payments", C1 to C7). It runs in a practice
  Collection over the memory store, as "Ana", with the finished sessions from requirements
  section 6.2;
- **"Need help?"** beside Collection's first heading;
- **Tracking payments** in Tutorials;
- two **seen flags** on the account, and the **once-only offers** on the first Expenses and
  Collection visit, in the approved prompt order;
- **What's new v2**, whose "Show me how" starts the Expenses guide;
- a dev-only **Preview offer**;
- two extras the owner approved on 2026-11-17: the practice banner is **sticky**, and the
  practice workspace has **no rename pencil**.

Sources (all on `main`):

- [`tab-guides-requirements.md`](tab-guides-requirements.md): US-TG7 to US-TG12, US-TG14,
  US-TG13 for Collection, BR-TG5 and BR-TG8 to BR-TG12, BR-TG28, sections 6.2, 6.3 and 11. The
  small amendments this spec needs are in its new section 12;
- [`tab-guides-architecture.md`](tab-guides-architecture.md), option C1 (flags);
- [`tab-guides.md`](tab-guides.md), the PR 1 spec, whose patterns this follows;
- the owner's decisions in the intake plan: two `timestamptz` columns, approved for Neon `main`
  before the branch runs; flags written when a guide starts or an offer is declined; the
  onboarding PUT with no body never sets them; Preview offer writes nothing; What's new bumped to
  2.

Assumptions, stated openly:

1. **A visit to Expenses that started through Breakdown's Edit** is recognised by the open
   saved-item edit, which App already learns through `onUnsavedChange` (`unsavedNote`). The
   offer therefore also waits while items are staged. On arrival nothing is ever staged, so this
   only matters when the flags arrive late, and then it avoids interrupting someone mid-entry.
2. **The Collection offer needs the profile loaded** (`status === 'ready'`), because "Already
   settled?" can't be judged without it and goes first (BR-TG9). It doesn't open over "Couldn't
   load your profile".
3. **A guide started from a preview writes nothing.** That covers Preview offer, Preview What's
   new's "Show me how", and Show me after a replayed or previewed tour (BR-TG28, AC-TG6.3).
4. **`markGuideSeen` sends nothing when the flag is already known to be set.** The column keeps
   its first time anyway (`coalesce`), so a replay from "Need help?" costs no write to `main`.

## 2. Layers touched

**Schema and API**

| File | Change |
|---|---|
| `scripts/db/schema.sql` | Two `alter table users add column if not exists` (section 3). |
| `api/_validate.ts` | `parseUserMark` also accepts `expensesGuide` and `collectionGuide`. |
| `api/user.ts` | GET selects and returns both flags. PUT gets one branch per new mark, with `coalesce`. The header comment names the flags. |

**Lib and hooks**

| File | Change | Reuse |
|---|---|---|
| `src/lib/guideOffer.ts` (new) | `Guide`, `GuideSeen`, `OfferContext` and the pure `guideOfferDue` (section 5.2). | |
| `src/lib/whatsNew.ts` | `WHATS_NEW_VERSION = 2`. | |
| `src/hooks/useOnboarding.ts` | Reads the flags into `guideSeen`, and adds `markGuideSeen(guide)`. | the hook's GET and PUT pattern |

**Onboarding and guides**

| File | Change | Reuse |
|---|---|---|
| `src/components/onboarding/GuideTour.tsx` | Optional `scrollOffset` prop, passed to every step (section 6.3). | |
| `src/components/onboarding/guides/PracticeBanner.tsx` + `.module.css` | Sticky, with a shadow. Exports `PRACTICE_SCROLL_OFFSET`. | `SyncBanner`'s sticky rule |
| `src/components/onboarding/guides/sceneChecks.ts` (new) | `sameScene` and `targetShown`, moved out of `PracticeExpenses.tsx` unchanged (made generic) so both practices share them. | |
| `src/components/onboarding/guides/PracticeExpenses.tsx` | Imports those two, and passes `scrollOffset`. No other change. | |
| `src/components/onboarding/guides/collectionScenes.ts` (new) | Scenes K1 to K3 (section 5.3). | `settlePayments`, `PRACTICE_ID_PREFIX` |
| `src/components/onboarding/guides/collectionSteps.ts` (new) | `COLLECTION_STEPS`, C1 to C7 (section 6.5). | `GuideStep` |
| `src/components/onboarding/guides/PracticeCollection.tsx` (new) | `PracticeCollection` and `PracticeCollectionScene` (section 6.4). | `CollectionPage`, `GuideTour`, `PracticeBanner`, the practice providers, `isFullyPaid` |
| `src/components/onboarding/GuideOfferDialog.tsx` (new) | The two offers (section 6.2). | `OnboardingDialog`, `Button` |
| `src/components/onboarding/TutorialsDialog.tsx` | `Tutorial = 'overview' \| Guide`, and the Tracking payments entry. | |

**UI**

| File | Change | Reuse |
|---|---|---|
| `src/App.tsx` | The `practice` screen takes either guide; `launch` and `startTutorial` take `mark`; the offer state, visit counter and latch; What's new v2; BR-TG28 in "You're all set!"; focus return to Collection's "Need help?"; Collection's new props; Preview offer. | `launch`, `startTutorial`, `endGuide` |
| `src/pages/CollectionPage.tsx` + `.module.css` | "Need help?", four `data-tour` targets, a wrapper around Needs setup and Outstanding, and `onOfferClear`. | `HelpIcon`, PR 1's `.help` look |
| `src/components/collection/CollectionCard.tsx` | `collection-owed` on the open card's "Owed to you" group, `collection-mark-all` on Mark all. | |
| `src/components/layout/SessionWorkspace.tsx` | No rename pencil in practice. | |
| `src/pages/HomePage.tsx`, `src/components/home/DevSessionsBar.tsx` | `onPreviewOffer` and two dev buttons. | the lazy, DEV-gated bar |

**Tests:** `src/lib/apiValidation.test.ts`, `src/lib/whatsNew.test.ts`, `src/lib/guideOffer.test.ts`
(new), `src/components/onboarding/guides/guides.test.ts`, `src/components/onboarding/targets.test.ts`,
`src/components/onboarding/dialogs.test.ts` (new), `src/pages/CollectionPage.test.ts` (new),
`src/components/layout/SessionWorkspace.test.ts`. Section 8 maps them.

**Docs:** `docs/specs/tab-guides-requirements.md`, new section 12 (committed with this spec).

**Types (`src/types/index.ts`):** none. **PDF:** none. **No new dependency.**

## 3. Data model

```sql
-- When the account first started the Expenses guide ("Logging expenses") from any
-- way in, or declined its once-only offer. Null means neither yet, so the offer is
-- still due. The onboarding PUT with no body never sets it.
alter table users add column if not exists expenses_guide_seen_at timestamptz;

-- The same for the Collection guide ("Tracking payments").
alter table users add column if not exists collection_guide_seen_at timestamptz;
```

They go right after the `already_settled_answered_at` statement in `scripts/db/schema.sql`.

- **Existing rows:** both start null, so every account, testers who ran the PR 1 guide included,
  is offered each guide once (requirements section 7, "PR 1 on uat").
- **Idempotent:** `if not exists`; re-running `apply-schema.ts` does nothing.
- **Non-destructive:** two nullable columns with no default. That's a catalog-only change, with
  no rewrite, no backfill and a lock of milliseconds. Nothing is dropped or migrated.
- **Rollback:** if the code is reverted, leave the columns. Old code names its columns, so it
  never sees them. Never drop them on `main`.

### 3.1 Applying it to Neon `main` (before the branch runs)

`GET /api/user` names its columns. Once it selects the two new ones, every environment running
PR 2 code against an unaltered `main` gets a 500. `useOnboarding` then goes quiet, and Collection
shows "Couldn't load your profile". Old code (sit, qat and uat on PR 1) is unaffected by the
extra columns, so applying them first is safe everywhere.

- **Who:** the fullstack-developer. The owner already approved these two statements for `main`
  (intake decision 2), and approving this spec authorises exactly this one run. The coordinating
  session confirms that with the owner when the spec is approved.
- **When:** task 1, before any file in `api/` is edited and before `npm run dev:full` runs the
  new code. `vercel dev` reloads functions as soon as their files change.
- **How:**
  1. Add the two statements to `scripts/db/schema.sql`.
  2. From the repo root, run `npx vite-node scripts/db/apply-schema.ts` once. It reads
     `HATI_DATABASE_URL` from `.env.local` (Neon `main`) and runs the whole file, where every
     statement is idempotent. Report its output (the table list).
  3. Verify, either in the Neon SQL editor on `main`:

     ```sql
     select column_name, data_type, is_nullable from information_schema.columns
     where table_name = 'users'
       and column_name in ('expenses_guide_seen_at', 'collection_guide_seen_at');
     ```

     It returns two rows, `timestamp with time zone`, `YES`. Or, after task 3, check that
     `GET /api/user` returns 200 with both fields (`null` for the owner).
- **stg and prod:** the devops-engineer runs the same script with `DATABASE_URL_OVERRIDE`
  before the hop that first brings PR 2 there.
- **Nothing destructive** runs: no update, delete or truncate. The flags are written only by the
  app's own PUTs.

## 4. API contract

**`GET /api/user`** (auth `getUserId`, 401 without a user; the row is the caller's own)

- Select: `onboarded_at, display_name, nicknames, whats_new_version, already_settled_answered_at, expenses_guide_seen_at, collection_guide_seen_at`.
- The response gains two fields, ISO strings or `null`, formatted as `alreadySettledAnsweredAt` is:

  ```ts
  expensesGuideSeenAt: string | null;
  collectionGuideSeenAt: string | null;
  ```
- Status codes: 200, 401, 500 (auth misconfigured). Unchanged.

**`PUT /api/user`**

- Body: none (onboarding), or `{ "mark": "whatsNew" | "alreadySettled" | "expensesGuide" | "collectionGuide" }`.
- Validation (`api/_validate.ts`):

  ```ts
  export function parseUserMark(
    raw: unknown,
  ): 'onboarding' | 'whatsNew' | 'alreadySettled' | 'expensesGuide' | 'collectionGuide' | null {
    if (raw === undefined || raw === null) return 'onboarding';
    if (!isPlainObject(raw)) return null;
    return raw.mark === 'whatsNew' ||
      raw.mark === 'alreadySettled' ||
      raw.mark === 'expensesGuide' ||
      raw.mark === 'collectionGuide'
      ? raw.mark
      : null;
  }
  ```
- New branches, after `alreadySettled`, each `204` with no body. The column names are literal
  SQL, so there are two branches rather than one interpolated name:

  ```ts
  if (mark === 'expensesGuide') {
    await pool.sql`
      update users set expenses_guide_seen_at = coalesce(expenses_guide_seen_at, now())
      where id = ${userId}`;
    return res.status(204).end();
  }
  if (mark === 'collectionGuide') {
    await pool.sql`
      update users set collection_guide_seen_at = coalesce(collection_guide_seen_at, now())
      where id = ${userId}`;
    return res.status(204).end();
  }
  ```
- **The onboarding statement (no body) doesn't change**, so it never sets either flag.
- Status codes: 200 (onboarding), 204 (every named mark), 400 (malformed), 401, 405, 500.

## 5. Business logic

No money rule changes. The practice runs the real Collection code over memory, so payments,
undo, Mark all and the sections behave exactly as in a real session (BR-TG17).

### 5.1 Flags (`useOnboarding`)

```ts
import type { Guide, GuideSeen } from '../lib/guideOffer';

type Result = {
  // ...existing four members unchanged...
  /** Whether each guide was started or its offer declined; null until read, and for good if the read failed (AC-TG9.8). */
  guideSeen: GuideSeen;
  /** Records that a guide started or its offer was declined, on screen at once; silent on failure (BR-TG5, BR-TG12). */
  markGuideSeen: (guide: Guide) => void;
};
```

- The GET's body type gains `expensesGuideSeenAt?: unknown; collectionGuideSeenAt?: unknown;`,
  and on success:
  `setGuideSeen({ expenses: body.expensesGuideSeenAt != null, collection: body.collectionGuideSeenAt != null })`.
- `markGuideSeen(guide)`:
  - returns at once if `guideSeen?.[guide]` is already true (assumption 4);
  - `setGuideSeen((s) => (s === null ? s : { ...s, [guide]: true }))`;
  - PUTs `{ mark: guide === 'expenses' ? 'expensesGuide' : 'collectionGuide' }`, with the same
    token, headers and dev-only `console.warn` as `markWhatsNewSeen`. It's a `useCallback` over
    `[getToken, guideSeen]`.
- `markSeen` (the onboarding PUT) doesn't touch `guideSeen`.

**Where a flag is written** (BR-TG5, BR-TG11, BR-TG28):

| Event | Writes |
|---|---|
| A guide starts through `launch` with `mark` true: "Need help?" on either tab, Tutorials, an offer's Show me, What's new's Show me how, Show me after the first-run tour | that guide's flag |
| An offer's Not now or Escape | that guide's flag |
| "You're all set!" Maybe later or Escape after the **first-run** tour | Expenses flag |
| Show me or Maybe later after an **App overview replay or the dev Preview Tour** | nothing (AC-TG6.3) |
| A **Preview offer**'s Show me or Not now; **Preview What's new**'s Show me how | nothing (AC-TG14.2) |
| App overview from Tutorials; the onboarding PUT | nothing |

### 5.2 Offer gating (`src/lib/guideOffer.ts`)

```ts
export type Guide = 'expenses' | 'collection';

/** Whether each guide has been started or declined on this account; null until the account is read. */
export type GuideSeen = Record<Guide, boolean> | null;

export type OfferContext = {
  /** The tab this visit is on: a real session's Expenses tab, Collection, or neither. */
  tab: Guide | null;
  seen: GuideSeen;
  /** A one-time prompt (welcome, tour, "You're all set!", What's new) is open, or opened earlier this visit. */
  prompted: boolean;
  /** Profile, Tutorials, New Session, the app's "Leave without saving?", or an offer, is open. */
  dialogOpen: boolean;
  /** Expenses only: staged items or an open saved-item edit, which is how a visit through Breakdown's Edit looks. */
  unsaved: boolean;
  /** Collection only: the profile has loaded, and "Already settled?" is neither due nor asked this visit. */
  collectionClear: boolean;
};

/** The guide to offer on this visit, if any (BR-TG8, BR-TG9). */
export function guideOfferDue(c: OfferContext): Guide | null {
  if (c.tab === null || c.seen === null || c.seen[c.tab]) return null;
  if (c.prompted || c.dialogOpen) return null;
  if (c.tab === 'expenses' && c.unsaved) return null;
  if (c.tab === 'collection' && !c.collectionClear) return null;
  return c.tab;
}
```

**State table.** "any" means the row holds whatever the value. Rows are checked top to bottom.

| # | tab | seen | prompted | dialogOpen | unsaved | collectionClear | Result | AC / rule |
|---|---|---|---|---|---|---|---|---|
| 1 | null (Home, History, practice, Breakdown, Summary) | any | any | any | any | any | none | BR-TG10, AC-TG1.2 |
| 2 | any | null (not read, or read failed) | any | any | any | any | none | AC-TG9.8 |
| 3 | expenses | `{ expenses: true }` | any | any | any | any | none | AC-TG9.3, AC-TG9.4, AC-TG11.3 |
| 4 | collection | `{ collection: true }` | any | any | any | any | none | AC-TG10.4, AC-TG12.4 |
| 5 | any | unset | true | any | any | any | none | AC-TG9.6, AC-TG9.7, AC-TG11.4, BR-TG8 |
| 6 | any | unset | false | true | any | any | none | BR-TG8 |
| 7 | expenses | unset | false | false | true | any | none | AC-TG9.5 |
| 8 | expenses | unset | false | false | false | any | **expenses** | AC-TG9.1 |
| 9 | collection | unset | false | false | any | false | none | AC-TG10.2, AC-TG8.2 |
| 10 | collection | unset | false | false | any | true | **collection** | AC-TG10.1, AC-TG10.5 |

"unset" means the flag for that row's tab is false.

**How App feeds it** (section 6.1): `tab` from the screen; `seen` from `useOnboarding`;
`prompted` from the visit counter; `dialogOpen` from App's own dialog state; `unsaved` is
`unsavedNote !== null`; `collectionClear` is reported by `CollectionPage`. A due offer is
latched into state by an effect, which also refuses to open over any other open `<dialog>` (a
page's own Remove member, Clear All or Undo). An offer that can't open waits for a later visit.

**A visit** (requirements section 3) is one arrival on a screen or session tab. App counts visits
so that leaving Collection and coming back is a new one:

```ts
const visitKey =
  screen.kind === 'session' ? `session:${screen.sessionId}:${screen.tab}` : screen.kind;
```

### 5.3 The Collection practice (`guides/collectionScenes.ts`)

```ts
export type CollectionSceneId = 'K1' | 'K2' | 'K3';

export type CollectionScene = {
  id: CollectionSceneId;
  /** The finished practice sessions. Never saved (BR-TG3). */
  sessions: Session[];
  /** The card open as the scene starts. */
  openSessionId?: string;
};

export const PRACTICE_BEACH_ID = `${PRACTICE_ID_PREFIX}beach`;

/** The three scenes, dated relative to `now` (BR-TG16). */
export function collectionScenes(now: Date): Record<CollectionSceneId, CollectionScene>;
```

Two module-private helpers inside it:

- `daysAgo(n)` is `now` moved `n` calendar days back, at 12:00 local, as an ISO string;
- `dayOf(n)` is the local `YYYY-MM-DD` of `daysAgo(n)`, worked as `todayIso` does.

`rec(id, day, payor, item)` is a single-payor record:
`{ id, date: dayOf(day), payorMode: 'single', payors: [{ member: payor, amount: item.totalPrice }], items: [item], createdAt: daysAgo(day) }`.
Every item is an `EqualSplitItem`, and every session has `status: 'closed'`, `me: null`,
`activityAt: null` and `finishedWithCollection: true`, so none is offered "Already settled"
(AC-TG7.7).

| Session | id | createdAt / closedAt | members | Records (item, total, owners, payor, day) | payments |
|---|---|---|---|---|---|
| Beach trip | `practice_beach` | `daysAgo(6)` / `daysAgo(3)` | Ana, Ben, Carla, Dino | Cottage rental 4,000.00, all four, Ana, 5; Fuel 500.00, Ana and Ben, Ana, 5; Groceries 1,140.00, Ana and Carla, Carla, 4; Island hopping boat 2,300.00, Ana and Dino, Dino, 4 | `{ id: 'pay_practiceCarla', debtor: 'Carla', creditor: 'Ana', amountCents: 20000, createdAt: daysAgo(2) }` |
| Movie night | `practice_movie` | `daysAgo(11)` / `daysAgo(10)` | Anna, Ben, Carla | Movie tickets and popcorn 1,500.00, all three, Ben, 11 | none |
| Karaoke night | `practice_karaoke` | `daysAgo(22)` / `daysAgo(21)` | Ana, Ben | Karaoke room 1,200.00, Ana and Ben, Ana, 22 | `{ id: 'pay_practiceBen', debtor: 'Ben', creditor: 'Ana', amountCents: 60000, createdAt: daysAgo(14) }` |

Item ids are `practice_cottage`, `practice_fuel`, `practice_groceries`, `practice_boat`,
`practice_tickets`, `practice_room`; record ids are the item id plus `_rec`. Payment ids match
`/^pay_[A-Za-z0-9]{1,64}$/`, the same rule `parsePaymentsInput` enforces.

**The arithmetic, checked against `settlementPairs`** (pairwise netting only, `calculations.ts`
`getNettedOwedMatrix`; there's no debt simplification across people):

| Beach trip record | Per owner | Owed |
|---|---|---|
| Cottage 4,000 ÷ 4, paid by Ana | 1,000 | Ben → Ana 1,000; Carla → Ana 1,000; Dino → Ana 1,000 |
| Fuel 500 ÷ 2, paid by Ana | 250 | Ben → Ana 250 |
| Groceries 1,140 ÷ 2, paid by Carla | 570 | Ana → Carla 570 |
| Boat 2,300 ÷ 2, paid by Dino | 1,150 | Ana → Dino 1,150 |

- **Netted pairs:** Ben → Ana 1,250.00 (1,000 + 250); Carla → Ana 430.00 (1,000 − 570);
  Ana → Dino 150.00 (1,150 − 1,000).
- **Lines for Ana:**
  - Ben 1,250.00, unpaid;
  - Carla 430.00, with 200.00 paid, so Partial and 230.00 left;
  - Dino 150.00 owed by Ana, unpaid.
- **Movie night:** 1,500 ÷ 3 = 500, so Anna → Ben and Carla → Ben, 500.00 each. "Anna" isn't
  "Ana" under `compareNames`, so the session is Needs setup.
- **Karaoke night:** 1,200 ÷ 2 = 600, Ben → Ana 600.00, paid in full, so Settled.
- **Strip** (Outstanding cards only): Owed to you = 1,250.00 + 230.00 = **₱1,480.00**; You owe =
  **₱150.00**; "Not counting 1 session that needs setup" (AC-TG7.1). Every division is exact, so
  no rounding comes into play.

**Scenes:**

| Scene | sessions | openSessionId | On screen |
|---|---|---|---|
| K1, overview | the three above | none | Needs setup (1): Movie night; Outstanding (1): Beach trip; Settled (1) closed. Every card collapsed. |
| K2, Beach trip open | the same | `practice_beach` | K1 with Beach trip expanded: Owed to you (Ben, Carla), You owe (Dino), Mark all as paid. |
| K3, Beach trip settled | the same, with Beach trip's payments plus `settlePayments(beach)` mapped to ids `pay_practiceSettle0` to `2` and `createdAt: now.toISOString()` | none | Needs setup (1), Outstanding (0) with "Nothing outstanding. Everything is settled.", Settled (2) closed. |

K3 is what Mark all at C6 produces: Ben 1,250.00, Carla 230.00 and Dino 150.00 recorded, after
which `isFullyPaid(beach)` is true. It's a third scene, which amends BR-TG15 (section 12).

**What the reader's actions give** (BR-TG17, same code as a real session):

- C2, Movie night, pick "Anna", Confirm: `setMe` → Outstanding, You owe Ben 500.00
  (AC-TG7.6). The practice profile's `remember` sends nothing.
- C4, Record payment on Ben, 500, Save payment: "Paid ₱500.00 · ₱750.00 left", Partial
  (AC-TG7.3).
- C5, Undo Carla's 200.00: Carla back to Unpaid, Beach trip still Outstanding (AC-TG7.4).
- C6, Mark all as paid, confirm: Beach trip moves to Settled, and the guide moves on to C7
  (AC-TG7.5, section 6.4).

## 6. UI

### 6.1 App (`src/App.tsx`)

**Types**

```ts
import type { Guide } from './lib/guideOffer';

type Screen =
  | RealScreen
  | { kind: 'practice'; guide: Guide; back: RealScreen; via: 'help' | 'menu' };
```

`pendingTutorial` becomes `{ tutorial: Tutorial; via: 'help' | 'menu'; mark: boolean } | null`.

**From `useOnboarding`:** also `guideSeen` and `markGuideSeen`.

**New state**, declared with the other state, above the loading early return:

```ts
/** The once-only offer on screen, or a dev preview of one, which writes nothing (US-TG14). */
const [offer, setOffer] = useState<{ guide: Guide; preview: boolean } | null>(null);
/** Collection has loaded, and "Already settled?" is neither due nor asked this visit, as the page reports. */
const [collectionClear, setCollectionClear] = useState(false);
/** Whether the tour that just ended was a replay or a preview, which "You're all set!" must not mark (BR-TG28). */
const finishedPreview = useRef(false);
```

`endTour` records it first: `finishedPreview.current = previewing.current;`, before the existing
`if (previewing.current) ...`.

**What's new**

```ts
const whatsNewOpen =
  phase === 'off' &&
  screen.kind !== 'practice' &&
  offer === null &&
  (whatsNewDue || whatsNewPreview);
```

The dialog's message becomes:

```tsx
<span className={onboardingStyles.points}>
  <span>
    <strong>Receipts, item by item.</strong> In Custom Amounts, type a receipt the way it&apos;s
    printed: what each person had, dishes people shared, discounts like PWD or senior, and service
    charges. Hati works out each person&apos;s share.
  </span>
  <span>
    <strong>Guides.</strong> Tap “Need help?” on Expenses or Collection for a quick practice run,
    or open Tutorials in your account menu.
  </span>
</span>
```

"Got it" stays as it is. "Take me to Collection" is replaced by:

```tsx
<Button
  variant="primary"
  onClick={() => {
    // A previewed What's new writes nothing, so neither does the guide it starts.
    const mark = !whatsNewPreview;
    closeWhatsNew();
    startTutorial('expenses', 'menu', mark);
  }}
>
  Show me how
</Button>
```

**Visits and the offer** (section 5.2), next to the What's new block:

```ts
// A visit is one arrival on a screen or a session's tab (requirements section 3). It's counted
// rather than keyed, so leaving Collection and coming back is a new visit.
const visitKey =
  screen.kind === 'session' ? `session:${screen.sessionId}:${screen.tab}` : screen.kind;
const [visit, setVisit] = useState({ key: visitKey, n: 0 });
if (visit.key !== visitKey) setVisit({ key: visitKey, n: visit.n + 1 });
/** The visit a one-time prompt last showed on: no offer follows one on the same visit (BR-TG8). */
const [promptedVisit, setPromptedVisit] = useState(-1);
const promptShowing = phase !== 'off' || whatsNewOpen;
if (promptShowing && promptedVisit !== visit.n) setPromptedVisit(visit.n);

const offerDue = guideOfferDue({
  tab:
    screen.kind === 'session' && screen.tab === 'expenses'
      ? 'expenses'
      : screen.kind === 'collection'
        ? 'collection'
        : null,
  seen: guideSeen,
  prompted: promptShowing || promptedVisit === visit.n,
  dialogOpen: profileOpen || tutorialsOpen || naming || pendingTutorial !== null || offer !== null,
  unsaved: unsavedNote !== null,
  collectionClear,
});
useEffect(() => {
  if (offerDue === null) return;
  // A dialog a page opened itself (Remove member, Clear All, Undo) counts as open too (BR-TG8).
  if (document.querySelector('dialog[open]')) return;
  setOffer({ guide: offerDue, preview: false });
}, [offerDue]);
```

The render-time `setVisit` and `setPromptedVisit` follow the existing `hasLoaded` pattern.

**Starting and ending**

```ts
const startTutorial = (tutorial: Tutorial, via: 'help' | 'menu', mark = true) => {
  if (screen.kind === 'session' && unsavedNote !== null) setPendingTutorial({ tutorial, via, mark });
  else launch(tutorial, via, mark);
};

const launch = (tutorial: Tutorial, via: 'help' | 'menu', mark = true) => {
  if (phase === 'running') endTour(false);
  if (tutorial === 'overview') {
    previewTour();
    return;
  }
  // Starting a guide from any way in uses up its once-only offer (BR-TG5). Previews and replays don't.
  if (mark) markGuideSeen(tutorial);
  window.scrollTo(0, 0);
  setGuideKey((k) => k + 1);
  // Restarting during a guide keeps the first origin (BR-TG26), and may switch guides.
  setScreen((s) =>
    s.kind === 'practice' ? { ...s, guide: tutorial } : { kind: 'practice', guide: tutorial, back: s, via },
  );
};
```

- The confirm dialog's `onConfirm` passes `pending.mark` through to `launch`.
- **Focus return** (AC-TG4.1) becomes:

  ```ts
  useEffect(() => {
    if (!focusHelp.current) return;
    const id =
      screen.kind === 'session' ? 'workspace-help' : screen.kind === 'collection' ? 'collection-help' : null;
    if (id === null) return;
    focusHelp.current = false;
    document.getElementById(id)?.focus();
  }, [screen]);
  ```

**"You're all set!"** (BR-TG28):

```ts
/** Maybe later or Escape: for a new account it declines the Expenses offer; a replay writes nothing. */
const laterAfterTour = () => {
  setPhase('off');
  if (!finishedPreview.current) markGuideSeen('expenses');
};
```

`onDismiss` and Maybe later call `laterAfterTour`. Show me calls
`launch('expenses', 'menu', !finishedPreview.current)`. The message is unchanged.

**The offer dialog**, next to the What's new dialog:

```tsx
{offer && (
  <GuideOfferDialog
    guide={offer.guide}
    onAnswer={(show) => {
      const { guide, preview } = offer;
      setOffer(null);
      if (show) startTutorial(guide, 'menu', !preview);
      else if (!preview) markGuideSeen(guide);
    }}
  />
)}
```

The origin is the screen the offer opened on (BR-TG20).

**Pages**

- `CollectionPage` gets:
  - `canAsk={phase === 'off' && !whatsNewOpen && !profileOpen && !tutorialsOpen && !naming && offer === null}`
    (AC-TG10.3);
  - `onHelp={phase === 'running' ? undefined : () => startTutorial('collection', 'help')}`;
  - `onOfferClear={setCollectionClear}`.
- `HomePage` gets
  `onPreviewOffer={import.meta.env.DEV ? (guide) => setOffer({ guide, preview: true }) : undefined}`.
- The practice render:

  ```tsx
  {screen.kind === 'practice' &&
    (screen.guide === 'expenses' ? (
      <PracticeExpenses key={`guide-${guideKey}`} onEnd={endGuide} />
    ) : (
      <PracticeCollection key={`guide-${guideKey}`} onEnd={endGuide} />
    ))}
  ```

Nothing else in App changes. The loading guard, `SyncBanner` hiding and the nav bar already
treat both guides alike.

### 6.2 Dialogs

**`GuideOfferDialog.tsx`** (requirements 6.3; "?" now reads "Need help?", section 12):

```tsx
const OFFERS: Record<Guide, { title: string; message: string }> = {
  expenses: {
    title: 'Learn how to log a purchase?',
    message:
      'A quick practice run, about two minutes, with made-up people. Nothing you do in it is saved. You can find it any time under “Need help?” on this tab, or Tutorials in your account menu.',
  },
  collection: {
    title: 'Learn how to track payments?',
    message:
      'A quick practice run with made-up sessions: who owes you, recording payments, and undoing one. Nothing you do in it is saved. You can find it any time under “Need help?” on this page, or Tutorials in your account menu.',
  },
};

/** A guide's once-only offer (BR-TG8). Escape is Not now. */
export function GuideOfferDialog({ guide, onAnswer }: { guide: Guide; onAnswer: (show: boolean) => void }) {
  const { title, message } = OFFERS[guide];
  return (
    <OnboardingDialog open title={title} message={message} onDismiss={() => onAnswer(false)}>
      <Button variant="ghost" onClick={() => onAnswer(false)}>Not now</Button>
      <Button variant="primary" onClick={() => onAnswer(true)}>Show me</Button>
    </OnboardingDialog>
  );
}
```

**`TutorialsDialog.tsx`:** `export type Tutorial = 'overview' | Guide;` and a third entry,
`{ id: 'collection', label: 'Tracking payments', description: "Recording who has paid you, and what you've paid." }`
(AC-TG5.2).

**`DevSessionsBar.tsx`:** `onPreviewOffer?: (guide: Guide) => void`. When given, two `sm`
buttons go right after Preview What's new: "Preview Expenses offer" and "Preview Collection
offer". `HomePage` passes the prop through. Both files are already DEV-gated and lazy, so a
production build has neither (AC-TG14.3).

### 6.3 Practice banner and engine

**`PracticeBanner.module.css`**: `.banner`'s `position: relative` becomes:

```css
  /* Stays in view while the reader scrolls, so End practice is always reachable (owner, PR 2).
     Above the guide's overlay (z-index 10000), so it works by mouse and touch at every step. The
     tooltip is 10001 too and sits later in the page, so it still wins where they overlap. */
  position: sticky;
  top: calc(env(safe-area-inset-top) + 8px);
  z-index: 10001;
  box-shadow: var(--shadow-md);
```

The rest of the rule stays. `--info-bg` is opaque, so nothing shows through it. There's no media
query: the banner wraps to two lines at 375px as before.

**`PracticeBanner.tsx`** exports:

```ts
/**
 * Where a guide puts a step's target below the top of the screen when it scrolls to it: clear of
 * the sticky banner (about 95px on a phone, where it wraps to two lines, with its 8px top), the
 * spotlight's 10px padding, and a small gap.
 */
export const PRACTICE_SCROLL_OFFSET = 120;
```

**`GuideTour.tsx`** gets one optional prop:

```ts
/** Where a step's target lands below the top of the screen when the tour scrolls to it. Joyride's 20px when omitted. */
scrollOffset?: number;
```

The steps memo adds `...(scrollOffset !== undefined ? { scrollOffset } : {})` to each step and
`scrollOffset` to its dependencies. It's a constant, so the steps keep one identity. Both
practices pass `scrollOffset={PRACTICE_SCROLL_OFFSET}`. The first-run tour passes nothing and is
unchanged.

**`SessionWorkspace.tsx`:** the pencil's guard becomes
`session.status === 'draft' && !renaming && !practice`, with the comment "Practice is never
saved, so there's nothing to rename (owner, PR 2)." Without the pencil, the `:has(.rename)` rules
don't apply, and practice has no "Need help?" anyway.

### 6.4 The Collection practice (`guides/PracticeCollection.tsx`)

```tsx
/** C6: Mark all there does what Next would, so the guide follows the reader on to C7. */
const MARK_ALL_STEP = COLLECTION_STEPS.findIndex((s) => s.target === 'collection-mark-all');

/** The reader reached the next step's scene on their own, which only Mark all at C6 does. */
const reachedNext = (index: number, live: CollectionSceneId) =>
  COLLECTION_STEPS[index + 1]?.place === live;

export function PracticeCollection({ onEnd }: { onEnd: (to: 'origin' | 'home') => void }) {
  const [scenes] = useState(() => collectionScenes(new Date()));
  const [scene, setScene] = useState<CollectionSceneId>(COLLECTION_STEPS[0].place);
  /** Bumped to start the current scene again as designed (BR-TG14). */
  const [generation, setGeneration] = useState(0);
  /** The step Next or Back last moved to. */
  const step = useRef(0);

  const navigate = (place: CollectionSceneId, index: number) => {
    step.current = index;
    if (place !== scene) {
      setScene(place);
      return;
    }
    if (!targetShown(COLLECTION_STEPS[index].target)) setGeneration((g) => g + 1);
  };

  // Beach trip paid in full at C6 is scene K3, so moving there lets the tour follow along
  // (`reachedNext`) rather than leave C6's tooltip pointing at a card that has gone to Settled.
  const onBeachPaid = useCallback((paid: boolean) => {
    if (paid && step.current === MARK_ALL_STEP) setScene('K3');
  }, []);

  return (
    <>
      <PracticeBanner onEnd={() => onEnd('origin')} />
      <PracticeCollectionScene
        key={`${scene}:${generation}`}
        scene={scenes[scene]}
        onBeachPaid={onBeachPaid}
      />
      <GuideTour
        run
        steps={COLLECTION_STEPS}
        place={scene}
        matches={sameScene}
        wentToNextStep={reachedNext}
        onNavigate={navigate}
        onDone={() => onEnd('origin')}
        lastLabel="Done"
        escapeSkips
        scrollOffset={PRACTICE_SCROLL_OFFSET}
      />
    </>
  );
}

type SceneProps = {
  scene: CollectionScene;
  /** Whether Beach trip is paid in full, reported whenever it changes. */
  onBeachPaid: (paid: boolean) => void;
};

/** One scene's practice Collection, with its own store and profile ("Ana"). Exported for the render test. */
export function PracticeCollectionScene({ scene, onBeachPaid }: SceneProps) {
  return (
    <PracticeSessionsProvider seed={scene.sessions}>
      <PracticeProfileProvider>
        <PaidWatch sessionId={PRACTICE_BEACH_ID} onChange={onBeachPaid} />
        {/* Never asks "Already settled?" (AC-TG7.7). No onHelp, so no "Need help?" inside practice. */}
        <CollectionPage openSessionId={scene.openSessionId} canAsk={false} />
      </PracticeProfileProvider>
    </PracticeSessionsProvider>
  );
}
```

- `PaidWatch` is module-private, like `MembersWatch`. It reads `useSessionsStore().sessions`,
  computes `session !== undefined && isFullyPaid(session)`, reports it in an effect
  (`[paid, onChange]`), and renders nothing.
- **How C6 to C7 follows along:**
  1. Confirming Mark all records the payments in memory.
  2. `PaidWatch` reports `true` while `step.current` is C6, so `setScene('K3')` remounts the
     scene from K3's seed, which is the same state.
  3. `GuideTour`'s existing left-behind effect sees `place` K3 against C6's K2, asks
     `reachedNext(5, 'K3')`, which is true, and moves to C7.
  4. Back from C7 calls `navigate('K2', 5)`, a different scene, so K2 starts fresh.

  At any other step, Beach trip being paid changes nothing. If a step's own target has gone
  (BR-TG14), Next or Back puts the scene back, as in PR 1.
- No `lockTabs`: the practice Collection has no tabs, and no nav bar (BR-TG22).
- `CollectionPage`'s landing scroll for `openSessionId` (K2) runs first. Joyride's scroll, with
  the offset, runs after it and decides where the step sits.
- Reload, Skip, Escape, Done and End practice all behave as in the Expenses guide, through the
  same `endGuide`. Escape in the payment amount box closes only that form (`LineRow:202`), and
  Escape in the Undo and Mark all confirms closes only them (AC-TG4.2).

### 6.5 The steps (`guides/collectionSteps.ts`)

`export const COLLECTION_STEPS: GuideStep<CollectionSceneId>[]`, 7 steps. `title` and `content`
are copied **verbatim** from requirements section 6.2, which is unchanged. Only scenes and
targets differ from the requirements' proposals (section 12).

| # | Scene | Target | Element | Tap or type the copy asks for | In the spotlight? |
|---|---|---|---|---|---|
| C1 | K1 | `collection-totals` | Summary `<section>`: heading, strip and note | none ("tap freely" is general) | n/a |
| C2 | K1 | `collection-unsettled` | a new `<div>` around the Needs setup and Outstanding sections | open Movie night, pick a name, Confirm | Yes: the header, the picker and Confirm are inside, and so is Outstanding, where the confirmed card lands, still open (`openId` is kept). |
| C3 | **K1** | `collection-outstanding` | Outstanding's `div.list` | "Tap a card to open it" | Yes: Beach trip is collapsed in K1, and opening it grows the list, which the spotlight follows (`ResizeObserver`). |
| C4 | K2 | `collection-owed` | the open card's "Owed to you" `section.group` (Ben and Carla) | Record payment, change the amount, Save payment; Mark fully paid | Yes: the button, the form it opens in place of the button, and Mark fully paid are all inside. |
| C5 | K2 | `collection-owed` | the same | Undo on Carla's payment | Yes. The confirm is a native modal dialog, above the overlay. |
| C6 | K2 | `collection-mark-all` | `MarkAll`'s `div.markAll` | Mark all as paid | Yes. After the confirm, the guide follows on to C7 (section 6.4). |
| C7 | **K3** | `collection-settled` | Settled `<section>` | "Tap here to see them" | Yes: the toggle, and the list it opens, are inside the section. |

**The architect's C4 choice.** Neither `LineRow initialOpen` nor a step on the Record payment
button:

- `LineRow` renders the form **in place of** the button row (`showForm ? <form> : <div actions>`),
  so a button-only target disappears on the very tap the copy asks for. The form's Save payment
  would then be outside the spotlight and swallowed: the PR 1 Fill Remainder failure again.
- `initialOpen` would add a practice-only prop, and still leave Save payment closing the form.
- The group is stable through every action at C4 and C5: Ben and Carla's lines stay in it
  however much is paid or undone, and the card can't leave Outstanding from inside it, because
  Dino's line is outside the spotlight.

### 6.6 Collection page (`CollectionPage.tsx`)

**Props**

```ts
/** Starts the Collection guide. "Need help?" shows only while this is given (AC-TG8.1). */
onHelp?: () => void;
/**
 * Told whether the once-only guide offer may open: the profile has loaded, and "Already settled?"
 * is neither due nor asked this visit (BR-TG8, BR-TG9). False again on unmount.
 */
onOfferClear?: (clear: boolean) => void;
```

**The settled question, moved above the early returns** so the hooks run on every render:

```ts
const settledDue =
  profile.status === 'ready' &&
  (previewSettled ? !previewDone : !profile.alreadySettledAnswered) &&
  collection.alreadySettledOffers.length > 0;
// A page mount is one visit, so this remembers that the question showed on it.
const [asked, setAsked] = useState(false);
if (canAsk && settledDue && !asked) setAsked(true);
const offerClear = profile.status === 'ready' && !settledDue && !asked;
useEffect(() => {
  onOfferClear?.(offerClear);
}, [onOfferClear, offerClear]);
useEffect(() => () => onOfferClear?.(false), [onOfferClear]);
```

After the early returns, `askOpen` becomes `canAsk && settledDue`. That's the same condition as
today, rearranged.

**"Need help?"** is the same text link as on Expenses:

```tsx
// Beside the page's first heading, as on Expenses (OQ-TG2). The accessible name contains the
// visible text, so a voice user saying "click Need help" finds it.
const help = onHelp && (
  <button
    type="button"
    id="collection-help"
    className={styles.help}
    aria-label="Need help? See how to track payments"
    onClick={onHelp}
  >
    Need help?
    <HelpIcon className={styles.helpIcon} />
  </button>
);
```

| State | Where "Need help?" goes |
|---|---|
| Loading (spinner) | not rendered (AC-TG8.2) |
| Couldn't load your profile | `<div className={styles.helpRow}>{help}</div>` above the error block |
| No finished sessions (empty state, or a failed load with nothing to show) | the same row, above the empty state |
| Otherwise | in the Summary heading's row: `<div className={styles.headRow}><h2 className={homeStyles.heading}>Summary</h2>{help}</div>` |

`help` is declared between the `loading` return and the `error` return, which renders it. The
row wrapper is always there, with or without `help`, and doesn't move the heading: inside a flex
row the `h2` keeps its own bottom margin. When the profile has no name, `ProfileBanner` (a form
with its own "What should Hati call you?") still comes first, and "Need help?" stays with the
Summary heading, the page's first section heading.

**Targets and the wrapper:**

- `<section data-tour="collection-totals">` on the Summary section;
- `<div data-tour="collection-unsettled">` wrapping the Needs setup section and the Outstanding
  section, exactly as they are. `main` is a flex column, so margins never collapsed across these
  siblings, and the wrapper changes no spacing;
- `data-tour="collection-outstanding"` on Outstanding's `<div className={homeStyles.list}>`;
- `data-tour="collection-settled"` on the Settled `<section>`.

**`CollectionCard.tsx`:**

- the group `<section>` gains
  `data-tour={group.direction === 'owedToYou' ? 'collection-owed' : undefined}`;
- `MarkAll`'s `<div ref={row} className={styles.markAll}>` gains
  `data-tour="collection-mark-all"`.

Both render only inside an expanded card, and the page opens one card at a time (`openId`), so
each is one element on screen.

**CSS** (`CollectionPage.module.css`; every value from `tokens.css` or PR 1's link):

```css
/* The Summary heading, with "Need help?" at the right of its row (OQ-TG2). */
.headRow {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

/* With no heading on the page (empty, or the profile failed), "Need help?" sits alone at the right. */
.helpRow {
  display: flex;
  justify-content: flex-end;
}

/* The same small accent-green text link as Expenses' (SessionWorkspace.module.css): a real button. */
.help {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  color: var(--accent-text);
  cursor: pointer;
}

.help:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.help:focus-visible {
  outline: none;
  border-radius: var(--radius-sm);
  box-shadow: 0 0 0 2px var(--accent);
}

.helpIcon {
  width: 14px;
  height: 14px;
  display: block;
}
```

Inside the existing `@media (max-width: 640px)` block:

```css
  /* A thumb-sized target whose margins give the height back, so the heading row is no taller. */
  .help {
    padding-block: 12px;
    margin-block: -10px;
  }
```

**Phone and desktop**

| Element | Desktop (> 640px) | Phone (≤ 640px) |
|---|---|---|
| Collection "Need help?" | At the right of the Summary heading's row, baseline-aligned. The row grows by a few pixels at most (AC-TG13.4). | The same place, with a 44px tap target from padding and negative margins, in the 640px block only. |
| Practice banner | Sticky at 8px from the top, one line, shadow. | Sticky, two lines at 375px, no sideways scroll (AC-TG13.3). |
| Practice Collection | The real Collection page with no nav bar, the banner above it. | The same. |
| Offers, Tutorials (3 items), What's new v2 | `OnboardingDialog`, as today. | `OnboardingDialog`'s existing phone sizing. |
| Practice workspace | No rename pencil. | No rename pencil. |

## 7. Onboarding tour impact

**The first-run tour:** no change. `steps.ts` and `steps.test.ts` are untouched.

- Its step 6 runs on the real Collection. The new attributes there are inert, `nav-collection`
  doesn't move, "Need help?" is hidden while the tour runs (`onHelp` is undefined in phase
  `'running'`), and no offer opens (`prompted`).
- The first-run tour passes no `scrollOffset`, so its scrolling is as before.

**The new guide targets.** Each is declared in exactly one source location and is one element on
screen. They follow the approved rule:

- every target is supplied by its step's scene seed, which the render test proves;
- a target on a repeated element goes on one instance (`collection-owed`, the one open card's
  "Owed to you" group) or on a container (`collection-outstanding`, the list).

| Target | Element | File | Absent when |
|---|---|---|---|
| `collection-totals` | Summary `<section>` | `CollectionPage.tsx` | no finished sessions |
| `collection-unsettled` | `<div>` around Needs setup and Outstanding | `CollectionPage.tsx` | no finished sessions |
| `collection-outstanding` | Outstanding's list `<div>` | `CollectionPage.tsx` | nothing outstanding |
| `collection-owed` | the open card's "Owed to you" `<section>` | `CollectionCard.tsx` | no card open, or nothing owed to the user in it |
| `collection-mark-all` | `MarkAll`'s row | `CollectionCard.tsx` | no Outstanding card open |
| `collection-settled` | Settled `<section>` | `CollectionPage.tsx` | nothing settled |

The PR 1 Expenses targets aren't touched. The rename pencil isn't a target. Run `steps.test.ts`,
`targets.test.ts` and `guides/guides.test.ts` after any change near them.

## 8. Test plan

Write these first and watch them fail, then build until they pass.

**`src/lib/apiValidation.test.ts`, `parseUserMark`**

- No body still gives `'onboarding'`.
- It passes `expensesGuide` and `collectionGuide`, as well as the two existing marks.
- It still rejects `{ mark: 'expenses' }`, `{ mark: 'guide' }` and the existing bad list.

**`src/lib/whatsNew.test.ts`**

- "is not due once the current release has been seen": `(onboarded, 2)` and `(onboarded, 3)` are
  false.
- New: "is due to an account that saw version 1": `(onboarded, 1)` is true (AC-TG11.5).
- `WHATS_NEW_VERSION` is 2.
- The other cases are unchanged; `(null, null)` is still false (AC-TG11.6).

**`src/lib/guideOffer.test.ts`** (new): one `it` per row of the section 5.2 state table, using a
`base` context of row 8, then:

- each blocking field flipped on its own gives null;
- `seen: { expenses: true, collection: false }` still offers Collection on Collection
  (AC-TG12.4 is per guide).

**`src/components/onboarding/guides/guides.test.ts`** (extended; `NOW = new Date(2026, 10, 17, 9, 0)`)

1. **Steps** (AC-TG7.2): 7 steps. Targets in order are `collection-totals, collection-unsettled, collection-outstanding, collection-owed, collection-owed, collection-mark-all, collection-settled`.
   Places are `K1 ×3, K2 ×3, K3`. Every target matches `/^[a-z-]+$/`, and every content is
   longer than 20 characters.
2. **Every step names a scene that exists.**
3. **Seeds pass the validators** (BR-TG17), for every session of every scene:
   - `parseSession(session)` deep-equals `{ ...session, payments: [] }` (the parser leaves
     payments to the server);
   - every payment passes `parsePaymentsInput({ sessionId: session.id, payments: [{ id, debtor, creditor, amountCents }] })`,
     one at a time;
   - every id is `isPracticeId`, every session is `closed` with `finishedWithCollection: true`.
4. **Dates** (BR-TG16): Beach trip `closedAt` is 3 days before `NOW`, Carla's payment 2;
   Movie night 10; Karaoke night 21, with its payment 14. Compare calendar days.
5. **K1 figures** (AC-TG7.1). `buildCollection(K1.sessions, { displayName: 'Ana', nicknames: [] })`
   gives:
   - needsSetup `[practice_movie]`, outstanding `[practice_beach]`, settled `[practice_karaoke]`;
   - `owedToYouCents` 148000 and `youOweCents` 15000;
   - Beach trip lines: owedToYou Ben 125000 unpaid and Carla 43000 with 20000 paid (partial),
     youOwe Dino 15000 unpaid;
   - no card `offersAlreadySettled` (AC-TG7.7).
6. **The reader's actions** (lib level, same code as the practice):
   - Movie night with `me: 'Anna'` (what the store's `setMe` writes): `buildCard` is
     outstanding, with youOwe Ben 50000 (AC-TG7.6);
   - `addPaymentsTo(K2, beach, [Ben → Ana 50000])`: Ben's line is 50000 paid, 75000 left,
     partial (AC-TG7.3);
   - `removePaymentFrom(K2, beach, 'pay_practiceCarla')`: Carla's line is unpaid, and the card is
     still outstanding (AC-TG7.4);
   - `settleOne(K2, beach, ...)`: Beach trip is settled and `isFullyPaid`, and its buckets match
     K3's (AC-TG7.5).
7. **Render per scene** (AC-TG7.1, BR-TG14).
   `renderToStaticMarkup(<PracticeCollectionScene scene={…} onBeachPaid={noop} />)`:
   - each step whose place is that scene finds `data-tour="<target>"` exactly once;
   - K1 contains `₱1,480.00`, `₱150.00`, "Not counting 1 session that needs setup",
     "Needs setup (1)", "Outstanding (1)" and "Settled (1)";
   - K2 contains "Paid ₱200.00 · ₱230.00 left" and "Mark all as paid";
   - K3 contains "Settled (2)";
   - no scene contains "Already settled", `id="collection-help"` or `ProfileBanner`'s
     "What should Hati call you?" (AC-TG7.7).
8. **Isolation:** unchanged. It already scans every file in `guides/`, so it picks up the three
   new files.

**`src/components/onboarding/targets.test.ts`:** the "has an element" and "exactly one source
location" cases also run over `COLLECTION_STEPS`.

**`src/components/onboarding/dialogs.test.ts`** (new, `renderToStaticMarkup`)

- `TutorialsDialog` lists App overview, Logging expenses and Tracking payments, in that order,
  each with its description (AC-TG5.2).
- `GuideOfferDialog` for each guide shows its title and message from section 6.2, and "Not now"
  before "Show me" (AC-TG9.1, AC-TG10.1).

**`src/pages/CollectionPage.test.ts`** (new, inside `PracticeSessionsProvider` and
`PracticeProfileProvider`)

- With K1's sessions and `onHelp`: `aria-label="Need help? See how to track payments"` and
  `id="collection-help"` appear once, after the "Summary" heading's text and before the strip's
  "Owed to you" (AC-TG8.1).
- With no sessions and `onHelp`: "Nothing to collect yet" and the help link are both there
  (AC-TG8.1, AC-TG10.5).
- Without `onHelp`: no `collection-help`.

**`src/components/layout/SessionWorkspace.test.ts`:** a draft rendered with `practice={{}}` has
no `aria-label="Rename session"`, and without `practice` it has one.

**Unchanged and still green:** `steps.test.ts`, `memorySessions.test.ts`, `staging.test.ts`.

### 8.1 Tester rules for Neon `main` data

The flags and What's new live on the shared `main`. A mark written on any environment (local,
sit, qat or uat) is written for that account everywhere, for good. No one resets a flag or the
What's new version on `main`; that would be a data change needing the owner's explicit approval.

- **The owner's account starts PR 2 with both flags null and What's new at version 1.** The first
  PR 2 load shows What's new v2. The first real Expenses and Collection visits show the offers.
  Whoever answers them uses them up (decision D1).
- **The developer and tester check offer copy, buttons and Escape with Preview offer and
  Preview What's new** on Home's dev bar, which write nothing. They confirm that in the network
  log: no `PUT /api/user` from either preview.
- **Starting any guide** ("Need help?", Tutorials) writes that guide's flag the first time, and
  nothing after that. That's expected; it isn't a reason to avoid the guides.
- The existing rules still hold: no Seed or Clear All, no Load Demo Data, at most one "Test A /
  Test B" session, deleted afterwards. The practice needs none of them.

### 8.2 Checks for the ui-ux-tester

`npm run dev:full`, port 3000, at 390×844 and 1400×900 (and 375px where an AC says so), with the
network log open.

| AC | Check |
|---|---|
| AC-TG7.1, AC-TG7.2 | Tutorials → Tracking payments: the banner, then C1 to C7 in order with the copy from section 6.2. C1's strip reads ₱1,480.00, ₱150.00 and "Not counting 1 session that needs setup"; Needs setup (1), Outstanding (1), Settled (1) collapsed. |
| AC-TG7.6 | At C2, open Movie night, pick Anna, Confirm: it moves to Outstanding, still open and inside the spotlight, showing You owe Ben ₱500.00. |
| C3 | At C3, tap Beach trip: it opens inside the spotlight. |
| AC-TG7.3 | At C4, Record payment on Ben's line, type 500, Save payment: "Paid ₱500.00 · ₱750.00 left", Partial, with the payment listed with Undo. Every tap lands. |
| AC-TG7.4 | At C5, Undo Carla's ₱200.00 and confirm: Unpaid. Next: C6 still shows Mark all as paid. |
| AC-TG7.5 | At C6, Mark all as paid and confirm: Beach trip goes to Settled, and the tooltip moves to C7 by itself, on the Settled heading. Back returns to C6 with Beach trip open again. Also try Next at C6 without marking: C7 shows Settled (2). |
| AC-TG7.7 | No "Already settled?", no "Set your name" banner, no "Need help?" in practice. |
| AC-TG3.2, AC-TG3.3 | Through the whole Collection guide: no `/api/sessions` or `/api/payments` request. At most one `PUT /api/user` with `{"mark":"collectionGuide"}` at the start, and none on a replay. Real Collection is unchanged afterwards. |
| AC-TG4.1 to AC-TG4.3 | Skip, Escape, Done and End practice return to the origin. From "Need help?" on Collection, focus returns to it. Escape in the amount box closes only the form. |
| AC-TG8.1 to AC-TG8.4 | "Need help?" beside the Summary heading, and above the empty state; visible without scrolling at both sizes; named "Need help? See how to track payments". Absent while "Loading…". "Couldn't load your profile" (block `/api/user` in DevTools) still shows it, and the guide runs. A typed payment amount is gone on return. |
| AC-TG5.1 to AC-TG5.7 | Tutorials lists three items with descriptions; Tracking payments starts C1; with staged items on Expenses, "Leave without saving?" comes first. |
| AC-TG9.1 to AC-TG9.3, AC-TG10.1, AC-TG10.4, AC-TG14.1, AC-TG14.2 | Preview Expenses offer and Preview Collection offer: copy, Not now, Escape, and Show me (which starts the guide, ending on Home). No `PUT /api/user` from any of them. |
| AC-TG9.x, AC-TG10.x real offers | Per decision D1. Whoever meets the real offers first reports what they saw: the Expenses offer on the first Expenses visit (not via Breakdown's Edit), the Collection offer on the first Collection visit with no "Already settled?" due, and the matching `PUT` on Not now or Show me. Afterwards, neither offer opens again on a reload or a second browser (AC-TG12.3, AC-TG12.4). |
| AC-TG11.1 to AC-TG11.4, AC-TG11.7 | Preview What's new: the v2 text, Got it and Show me how. Show me how starts the Expenses guide from the current screen, with no `PUT`. |
| BR-TG28 | Preview Tour to the end, then Show me and Maybe later: no `PUT /api/user` either way. |
| Sticky banner | In both guides at both sizes, scroll the page during a step: the banner stays at the top, End practice works by tap and click, and where the tooltip overlaps the banner the tooltip is on top. Each step's target lands below the banner (E1 to E17 and C1 to C7). |
| No pencil | The practice workspace has no rename pencil; real drafts still have it. |
| AC-TG13.1 to AC-TG13.4 | Same steps on both widths; every tooltip fully on screen; banner at most two lines at 375px; no sideways scroll; desktop Collection unchanged apart from "Need help?". |
| Regression | The first-run tour (Preview Tour) runs all 7 steps on both widths, including Collection. The Expenses guide runs end to end. "Already settled?" still opens on a real Collection when due (dev "Ask Already settled"). |

Before the hand-off, run `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`, and report
the real results.

## 9. Documentation impact

For the documentation-engineer, after the change ships:

- **The user guide:** the Collection guide and "Need help?" on Collection; Tutorials' third item;
  the once-only offers; What's new v2; the sticky practice banner.
- **The API reference:** `GET /api/user`'s two new fields, and the `expensesGuide` and
  `collectionGuide` marks on `PUT` (204).
- **The data model:** `users.expenses_guide_seen_at` and `users.collection_guide_seen_at`.
- **Architecture notes:** the offer gating (`guideOfferDue`, visits, the latch), and the C6
  follow-along through `wentToNextStep`.
- **`docs/mobile-breakpoints.md`:** Collection's "Need help?" tap-target rule in
  `CollectionPage.module.css`.
- **CLAUDE.md:** no change.
- The Obsidian vault only when the owner asks.

## 10. Tasks (in order)

1. **Schema on `main`.** Add the two statements to `scripts/db/schema.sql`. Run
   `npx vite-node scripts/db/apply-schema.ts` once, and report its output (section 3.1). Don't
   edit `api/` before this has run.
2. **Tests first.** Write the section 8 tests. Expected result: red.
3. **API.** Update `parseUserMark`, and the GET and PUT in `api/user.ts`.
   - Check: `apiValidation.test.ts` is green, and `GET /api/user` returns 200 with both fields.
4. **Lib and hook.**
   - Add `src/lib/guideOffer.ts`, and bump `WHATS_NEW_VERSION`.
   - Add `guideSeen` and `markGuideSeen` to `useOnboarding`.
   - Check: `guideOffer.test.ts` and `whatsNew.test.ts` are green.
5. **Engine and banner.**
   - Add `GuideTour`'s `scrollOffset` prop.
   - Make the banner sticky, and add `PRACTICE_SCROLL_OFFSET`.
   - Move `sameScene` and `targetShown` to `guides/sceneChecks.ts`, and pass the offset from
     `PracticeExpenses`.
   - Hide the pencil in practice.
   - Check: the Expenses guide runs end to end with the sticky banner, and `SessionWorkspace.test.ts`
     is green.
6. **Collection page.**
   - Add the props, the settled-question move, "Need help?" and its CSS, the wrapper and the four
     targets.
   - Add the two `CollectionCard` targets.
   - Check: `CollectionPage.test.ts` and `targets.test.ts` are green, and real Collection looks
     the same on desktop.
7. **The Collection guide.**
   - Write `collectionScenes.ts`, `collectionSteps.ts` and `PracticeCollection.tsx`.
   - Check: `guides.test.ts` is fully green.
8. **Dialogs and App.**
   - Write `GuideOfferDialog`, add the third Tutorials entry, and the Preview offer buttons.
   - In `App.tsx`: the `Screen` union, `launch`/`startTutorial` with `mark`, the offer state,
     visits and latch, What's new v2, "You're all set!" for BR-TG28, focus return, the Collection
     props and the practice render.
   - Check: `dialogs.test.ts` is green. Walk section 8.2 locally, with section 8.1's rules.
9. **Final checks.** Run `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`. Give the
   owner the local URL (`npm run dev:full`, port 3000) and the branch.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| The app 500s on `/api/user` everywhere that shares `main`. | Task 1 applies the columns before any API edit. Adding columns is invisible to old code. |
| The owner's real offers and What's new v2 get used up during the build. | Decision D1. Preview offer and Preview What's new cover the copy and buttons without writing. |
| A step's invited action removes its own target and strands the tooltip (C2, C6). | C2's target spans both sections the card moves between. C6 follows along to K3. C3 moved to K1 so "tap a card" opens rather than closes it. |
| The C6 follow-along misfires, for example remounting at another step. | It fires only while `step.current` is C6. `reachedNext` only ever matches the next step's scene. If it ever fails, the tooltip is merely stranded and Next still reaches C7, which is the requirements' own fallback (section 7). |
| The sticky banner covers a target. | Every guide step scrolls to `PRACTICE_SCROLL_OFFSET` (120px). `CollectionPage`'s own `scrollIntoView` (landing, and placing a card at C2) can leave a card's top under the banner until the next step scrolls; that's cosmetic. The tester checks every step at both widths. |
| The offer gating misfires (stacked dialogs, or an offer after another prompt). | One pure function with a table test. The visit counter uses the existing render-time pattern. `whatsNewOpen` and `canAsk` both exclude an open offer, and the latch refuses to open over any `<dialog open>`. |
| Flags read late: an offer could open mid-visit. | Allowed by BR-TG8. It waits while there's unsaved work on Expenses (assumption 1). |
| A tall spotlight at C4 on a phone (two lines plus the open form, about 400px). | Joyride puts the target's top under the banner, and floating-ui flips the tooltip. If it overlaps, a per-step `placement` is a copy-free fix. |
| The wrapper `div` changes Collection's layout. | Its parent `main` is a flex column, so no margins collapse across it. The tester compares desktop. |
| `CollectionPage`'s hooks move above the early returns. | It's a rearrangement of the same condition. The real "Already settled?" regression check is in 8.2. |

**Size: medium to large.** About 30 files: 8 new and about 22 edited. There's one schema change
(two columns) and one API change (two fields, two marks). The engine and store from PR 1 are
reused unchanged apart from one prop.

## 12. Decisions for the user

None of these blocks the build: the spec implements the recommendation in each case.

- **D1. Whose real offers get used up.** From the first PR 2 run, the owner's account shows What's
  new v2 and both offers once, and starting any guide writes its flag. That's on the shared
  `main`, so it holds for uat too. The developer will meet them first.
  - **Recommendation:** accept that. The developer reports what the real prompts looked like, and
    everyone else checks with the dev previews. The owner sees the copy through the previews at
    the owner check.
  - **Alternative:** the owner signs in with a second account for the owner check, keeping the
    real account's prompts for uat.
- **D2. Mark all at C6 moves the guide on by itself** to C7, through a third scene K3
  (Beach trip settled). Otherwise the C6 tooltip is left pointing at a card that has gone to
  Settled until Next.
  - **Recommendation:** follow along, as specified. It amends BR-TG15 from 2 scenes to 3.
- **D3. Targets and scenes differ from the requirements' proposals**:
  - C2 spotlights Needs setup and Outstanding together, so the confirmed card stays in view;
  - C3 runs on the collapsed overview (K1), so "Tap a card to open it" opens it;
  - C4 and C5 share the "Owed to you" group, rather than Ben's button and Carla's payment list.
    The button is replaced by its own form when tapped, and the list disappears when its only
    payment is undone;
  - there's no `LineRow initialOpen`.

  The copy is unchanged. **Recommendation:** as specified.
- **D4. Copy amendments (copy-only).**
  - The offers and What's new v2 say "Need help?" where the requirements said "?", since PR 1
    renamed the control.
  - Collection's accessible name is "Need help? See how to track payments", not "How Collection
    works" (WCAG 2.5.3, as on Expenses).

  **Recommendation:** approve.
