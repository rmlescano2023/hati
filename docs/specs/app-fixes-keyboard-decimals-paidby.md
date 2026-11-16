# Spec: keyboard-reachable pills, two-decimal money boxes, remembered Paid By, and the slow local Home

Status: **final, no approval stop.** The owner's decisions are the requirements, and the build
follows this spec directly. Where the owner left something open, the recommendation below is the
decision, and it's listed in section 12. Branch `fix-keyboard-decimals-paidby`, from `origin/main`
at `0f78741` (PR #149 merged).

## 1. Summary

Four fixes. None of them changes a money rule, the stored data or the API.

1. **Pills reachable by keyboard.** `OwnerPill`'s checkbox is `display: none`, so Tab skips every
   pill: "All Members", the member pills, and the "Everyone" and member pills on shared-order and
   discount rows. The checkbox becomes visually hidden instead, the pill gets a `:focus-visible`
   ring, and Space toggles it natively. Nothing looks different until a pill has keyboard focus.
2. **Money boxes stop at two decimals as you type.** One helper, `clipMoneyInput` in
   `src/lib/money.ts`, runs in the change handler of every money box. A third decimal digit is
   dropped, never rounded, so a pasted "800.009" shows "800.00".
3. **Paid By remembered for the session.** The last Paid By pick (the mode, and the One Payor name)
   is kept in memory per session. It survives tab switches, Back to Home, adding a member and Save
   to Breakdown. It clears when that member is removed, on Clear All, and on reload.
4. **Slow Home after a reload, locally.** Measured. The cause is the local `vercel dev` function
   path, made worse by React StrictMode's dev-only double effects. It isn't Hati's code and UAT
   isn't affected. **No code change** (section 5.4 has the numbers).

Source: the owner's decisions, passed on by the coordinating session. The business-analyst was
skipped on purpose. This amends BR-12 in
[`flexible-paid-by-requirements.md`](flexible-paid-by-requirements.md) (item 3). BR-13 and BR-15
keep their wording and still hold (section 5.3).

Out of scope: money rules, other layout changes, the onboarding tour and new dependencies.

### Assumptions

- **A1.** "Locked" pills are the member pills that `OwnerGrid` disables while "All Members" or
  "Everyone" is ticked. No other locked state exists (checked: `OwnerPill` is used only by
  `OwnerGrid`, and `disabled` is its only lock).
- **A2.** Multiple Payors has no ticks. It shows one amount box per member (`PayorModeFields`).
  The owner's "only who is ticked, with amounts cleared" therefore comes down to remembering the
  mode alone (D7).
- **A3.** "For as long as the session is open" means until reload. The owner's list of what clears
  the pick doesn't include leaving the session, so the pick also survives Back to Home and
  reopening the same session (D5).

## 2. Layers touched

| Layer | File | Change | Item |
|---|---|---|---|
| Pure logic | `src/lib/money.ts` | New `clipMoneyInput(raw)` | 2 |
| Pure logic | `src/lib/staging.ts` | New `PaidByPick`, `NO_PAID_BY_PICK`, `keptPaidBy`, `paidByFor`, `PaidByPicks`, `PaidByMemory` and `paidByMemory` | 3 |
| UI | `src/components/shared/OwnerPill.tsx` | `className="visually-hidden"` on the checkbox | 1 |
| UI | `src/components/shared/OwnerPill.module.css` | Drop `display: none`. `.pill` gets `position: relative` and a `:has(input:focus-visible)` ring | 1 |
| UI | `src/components/home/ItemModeFields.tsx` | Total Price's onChange goes through `clipMoneyInput` | 2 |
| UI | `src/components/home/CustomAmountFields.tsx` | Total Amount's, each order line's price and each receipt row's amount onChange go through `clipMoneyInput` | 2 |
| UI | `src/components/home/PayorModeFields.tsx` | Each contribution's onChange goes through `clipMoneyInput` | 2 |
| Client state | `src/App.tsx` | Holds `paidByPicks`, a `Map` in state, and passes it to `SessionWorkspace` | 3 |
| Client state | `src/components/layout/SessionWorkspace.tsx` | New prop `paidByPicks`. Builds this session's `paidBy` with `paidByMemory` and passes it to `ExpensesPage` | 3 |
| Client state | `src/pages/ExpensesPage.tsx` | New prop `paidBy`. Passes it to the card. Clear All writes `NO_PAID_BY_PICK` | 3 |
| Client state | `src/components/home/PurchaseItemCard.tsx` | New prop `paidBy`. Starts from it, writes back to it, and Save no longer clears the One Payor pick | 3 |
| Tests | new `src/lib/money.test.ts`, `src/lib/staging.test.ts`, new `src/components/home/moneyBoxes.test.ts`, new `src/components/shared/OwnerPill.test.ts` | Section 8 | 1–3 |
| Docs | `docs/specs/flexible-paid-by-requirements.md` | An amendment note under BR-12, committed with this spec | 3 |

Types (`src/types/index.ts`), schema, API, `src/lib/calculations.ts`, `ClearableInput`,
`OwnerGrid`, `useServerSessions`, `SessionsStoreContext`, `AppDataContext`, the PDF and the tour:
**none.**

## 3. Data model

None. The Paid By pick lives in React state only, never in `localStorage` or on the server.

## 4. API contract

None. Item 4 changes nothing (section 5.4).

## 5. Business logic and behaviour, item by item

No money rule changes. Every box is still read by `parsePositiveAmount` (`num`), which already
rounds to the centavo, so a value the clip leaves alone is read exactly as today.

### 5.1 Item 1: pills reachable by keyboard

`src/components/shared/OwnerPill.tsx`: the input gains the global class.

```tsx
<input
  type="checkbox"
  // Hidden from sight but still in the tab order, so Tab reaches the pill and Space toggles
  // it (app-fixes item 1). `display: none` took it out of the tab order.
  className="visually-hidden"
  checked={checked}
  disabled={disabled}
  onChange={disabled ? undefined : onChange}
/>
```

`src/components/shared/OwnerPill.module.css`:

- Delete the `.pill input { display: none; }` rule.
- Add `position: relative;` to `.pill`, so the hidden 1px checkbox is anchored inside its own pill.
  It's out of the flex flow (absolute), so `gap` and the pill's size don't change.
- Add, after `.disabled`:

  ```css
  /* The checkbox is hidden, so the pill shows where keyboard focus is (app-fixes item 1).
     :focus-visible leaves a click or a tap without a ring. */
  .pill:has(input:focus-visible) {
    outline: 2px solid var(--accent-text);
    outline-offset: 2px;
  }
  ```

  An outline takes no space, so nothing moves. It follows the pill's radius in Chrome and Safari
  16.4+. Its 4px reach fits in `OwnerGrid`'s 6px gap. `:has` is already used in
  `SessionWorkspace.module.css`.

Behaviour, the same at every width:

- Tab and Shift+Tab move through "All Members" (or "Everyone") and then each enabled member pill,
  in screen order. Space toggles the focused pill through its existing `onChange`. Enter does
  nothing, as on any checkbox.
- A disabled pill (A1) has a `disabled` input: Tab skips it, and Space can't reach it. Its 0.38
  opacity and `not-allowed` cursor stay.
- Clicks and taps work as today: the `<label>` wraps the input.
- The phone sizes don't change. The 38px rule in `OwnerPill.module.css` and the 44px
  `.rowPicker label` rule in `CustomAmountFields.module.css` are untouched.

Screen readers: today the pills aren't announced as controls at all, because a `display: none`
input is out of the accessibility tree. After this, each pill is a checkbox named by the label's
text ("Ana, checkbox, checked"). The empty `.dot` span adds nothing to the name. The global
`input:focus` glow lands on the clipped 1px box and can't be seen. Equal Split's "Owner(s)" text is
a `<label>` with no control, so the pills there have no group name. That is unchanged and out of
scope (D3).

### 5.2 Item 2: money boxes stop at two decimals

`src/lib/money.ts`, after `parsePositiveAmount`:

```ts
/**
 * A money box's text held to two decimal places as it's typed (app-fixes item 2). Digits past the
 * second decimal are dropped, not rounded, so "800.009" becomes "800.00". Anything else is
 * returned as it is: "1.", "-", "" and the browser's own forms such as "1e5" are left for the
 * next key and for `parsePositiveAmount`, exactly as today.
 */
export function clipMoneyInput(raw: string): string {
  const match = /^(-?\d*\.\d{2})\d+$/.exec(raw);
  return match ? match[1] : raw;
}
```

Every money box, and its change, becomes `clipMoneyInput(e.target.value)`:

| Box | File | Today's onChange |
|---|---|---|
| Equal Split Total Price (`#item-price`) | `ItemModeFields.tsx` | `handlers.setPrice(e.target.value)` |
| Custom Amounts Total Amount (`#custom-total`) | `CustomAmountFields.tsx` | `onTotalAmountChange(e.target.value)` |
| Each order line's price | `CustomAmountFields.tsx` | `onLineChange(m, i, { price: e.target.value })` |
| Each shared order, discount and charge amount | `CustomAmountFields.tsx` | `onBillRowChange(section, i, { amount: e.target.value })` |
| Each Multiple Payors amount (`#contrib-<member>`) | `PayorModeFields.tsx` | `onContributionChange(m, e.target.value)` |

These five are every `type="number"` box in `src/` (checked with grep). The Collection payment box
in `LineRow.tsx` is left as it is (D9).

**Why the boxes stay `type="number"`.** This works the same in Chrome and iOS Safari:

- A number box reports either a valid floating-point string or "". "800.009" is valid, so it always
  reaches the handler as typed or pasted, in both browsers.
- Partial text the browser can't read ("1." in Safari, "-") reports "". The clip passes "" through,
  so state stays "" while the box keeps showing what was typed. That's today's behaviour, and
  `ClearableInput`'s `badInput` check already handles it.
- When the clip shortens the text, React writes it back, because its controlled-number check
  (`node.value != value`) sees "800.009" and "800.00" as different strings. The box then shows
  "800.00".
- The caret is never read or set. A number box's `selectionStart` is `null` and
  `setSelectionRange` throws, which is why the clip only ever cuts digits off the end. Writing the
  value puts the caret at the end, where a typed third digit was anyway.
- Switching to `type="text"` with `inputMode="decimal"` was rejected (D8).

Behaviour, the same at every width:

- Typing "800.00" and then "9" leaves "800.00". The 9 doesn't appear and nothing is rounded.
- Pasting "800.009" shows "800.00". "0.999" shows "0.99", not "1.00".
- Typing a digit into the middle of the decimals of "12.34", after the 3, gives "12.354" and shows
  "12.35". The digit at the end is the one dropped (D10).
- A negative such as "-5.678" shows "-5.67", and is still read as no amount, as today.
- Fill Remainder, Edit's loaded values and the Equal Split → Custom Amounts switch already write
  two decimals (`toFixed(2)`). They're unaffected.
- The ↺ clear sends "", which the clip passes through.

### 5.3 Item 3: Paid By remembered for the session

**Why it resets today.** All three Paid By states (`payorMode`, `singlePayor`, `contributions`)
are `useState` in `PurchaseItemCard`, so they're lost whenever the card unmounts:

- Leaving the Expenses tab unmounts `ExpensesPage` (`SessionWorkspace`, `tab === 'expenses'`).
- Back to Home unmounts the whole workspace.
- Clear All remounts the card on purpose (`formKey`).
- Save to Breakdown clears the One Payor pick on purpose: `setSinglePayor('')` in `save`
  (BR-12).

**The reset the tester saw when a member was added.** Adding a member doesn't touch the pick in
code:

- `addMember` (`SessionsStoreContext.tsx`) only appends the name and re-sorts.
- The card's member effect returns early when nobody was removed.
- Nothing remounts the card. Clerk's `getToken` is memoised (`useCallback` over
  `isomorphicClerk`), so the sessions load doesn't re-run, and `App` doesn't fall back to "Loading
  your sessions…".
- The controlled `<select>` keeps its value when options are inserted.

So the observed reset came from one of the paths above that happened just before the member was
added: Save to Breakdown (the usual order is item, Save, then the next person joins), a tab switch,
or Clear All. I couldn't reproduce it live, because adding a member writes to the shared database.
The fix covers every one of these paths, since the pick no longer lives only in the card. Tester
check 8 confirms it.

**The new rule** (amends BR-12):

- The pick that's remembered is `{ payorMode, singlePayor }`. `singlePayor` is kept only while One
  Payor is the mode on screen, because BR-13 clears the other mode's entry at the next Add Item or
  Save anyway (`keptPaidBy`).
- Multiple Payors amounts are never remembered. They clear at Add Item and Save, as today, and a
  tab switch drops them with the card (D7).
- The date isn't remembered (D6).
- It's per session, by session id, in memory only. It's kept until reload, and survives Back to
  Home (A3, D5).
- It clears:
  - when the picked member is removed. The card's member effect already sets `singlePayor` to ""
    and the write effect saves that. On the next mount, `paidByFor` also drops a name that's no
    longer a member.
  - on Clear All, which resets it to One Payor with nobody picked (D4).
  - on reload.

**`src/lib/staging.ts`** (next to `readContributions`; it already imports `PayorMode`):

```ts
/** A session's Paid By pick, which its Expenses tab remembers until reload (app-fixes item 3). */
export type PaidByPick = { payorMode: PayorMode; singlePayor: string };

/** A session's pick before anything is chosen, and after Clear All: One Payor, nobody picked. */
export const NO_PAID_BY_PICK: PaidByPick = { payorMode: 'single', singlePayor: '' };

/**
 * The pick as it's remembered: the mode, and the One Payor name only while One Payor is the mode
 * on screen. The other mode's entry is cleared at the next Add Item or Save anyway (BR-13).
 */
export function keptPaidBy(payorMode: PayorMode, singlePayor: string): PaidByPick {
  return { payorMode, singlePayor: payorMode === 'single' ? singlePayor : '' };
}

/** The pick the fields open with: a payor who has left the group since is dropped (BR-18). */
export function paidByFor(pick: PaidByPick, members: string[]): PaidByPick {
  return pick.singlePayor === '' || members.includes(pick.singlePayor)
    ? pick
    : { ...pick, singlePayor: '' };
}

/** Every session's remembered pick, by session id. */
export type PaidByPicks = Map<string, PaidByPick>;

/** One session's remembered pick: what its Expenses tab opens with, and where it saves changes. */
export type PaidByMemory = { read: () => PaidByPick; write: (pick: PaidByPick) => void };

export function paidByMemory(picks: PaidByPicks, sessionId: string): PaidByMemory {
  return {
    read: () => picks.get(sessionId) ?? NO_PAID_BY_PICK,
    write: (pick) => {
      picks.set(sessionId, pick);
    },
  };
}
```

**`src/App.tsx`:**

- `import type { PaidByPicks } from './lib/staging';`
- Next to the other state:

  ```ts
  /**
   * The Paid By pick each session's Expenses tab last used, by session id (app-fixes item 3).
   * Held here so it outlives the workspace and Back to Home, and in memory only, so a reload
   * forgets it. A Map, never replaced, because only the Expenses card reads it, and only as it
   * mounts.
   */
  const [paidByPicks] = useState<PaidByPicks>(() => new Map());
  ```

- `<SessionWorkspace … paidByPicks={paidByPicks} />`. Nothing else in `App` changes.

**`src/components/layout/SessionWorkspace.tsx`:**

- A new prop, `/** Every session's remembered Paid By pick, held by the app (app-fixes item 3). */
  paidByPicks: PaidByPicks;`. Add `useMemo` to the React import.
- `const paidBy = useMemo(() => paidByMemory(paidByPicks, sessionId), [paidByPicks, sessionId]);`
- `<ExpensesPage … paidBy={paidBy} />`.
- The `workspace-back` button isn't touched.

**`src/pages/ExpensesPage.tsx`:**

- A new prop, `/** This session's remembered Paid By pick (app-fixes item 3). */ paidBy: PaidByMemory;`.
- `<PurchaseItemCard … paidBy={paidBy} />`.
- In `onClearAll`, before `setFormKey`, add `paidBy.write(NO_PAID_BY_PICK);`. The `formKey` comment
  ("One Payor with no pick") stays true.

**`src/components/home/PurchaseItemCard.tsx`:**

- A new prop, `/** This session's remembered Paid By pick, which the fields start from and keep up to date (app-fixes item 3). */ paidBy: PaidByMemory;`.
- The two initialisers (lines 197 to 200) become:

  ```ts
  // A saved-item edit opens on the item's own Paid By. Anything else opens on this session's
  // last pick, less a payor who has left the group since (app-fixes item 3).
  const [remembered] = useState(() => paidByFor(paidBy.read(), members));
  const [payorMode, setPayorMode] = useState<PayorMode>(
    () => savedBoot?.fields.payorMode ?? remembered.payorMode,
  );
  const [singlePayor, setSinglePayor] = useState(
    () => savedBoot?.fields.singlePayor ?? remembered.singlePayor,
  );
  ```

  `contributions` still starts empty outside a saved-item edit.
- In `save` (line 552), replace `setSinglePayor('');` with the line `addItem` already uses:

  ```ts
  // The pick stays for the next purchase; only the mode that isn't on screen is cleared
  // (BR-12 as amended by app-fixes item 3, BR-13).
  if (payorMode === 'multiple') setSinglePayor('');
  ```

- A new effect, after the `restoreFocusTo` effect:

  ```ts
  // Remembers the pick for the next visit to this tab (app-fixes item 3). While a staged item is
  // being edited, the fields show that item's Paid By, so the pick from before Edit is the one
  // kept (BR-15). A saved-item edit shows the item's own and changes nothing here.
  useEffect(() => {
    if (savedEdit) return;
    const pick = editing ? editing.restore : { payorMode, singlePayor };
    paidBy.write(keptPaidBy(pick.payorMode, pick.singlePayor));
  }, [paidBy, savedEdit, editing, payorMode, singlePayor]);
  ```

  `paidBy` is stable (memoised by session id), so the effect re-runs only when the pick or the edit
  changes. A Map write sets no state, so it never causes a render. StrictMode's double run writes
  the same value twice, which is harmless.

How each existing flow behaves:

| Flow | Result |
|---|---|
| Pick Ana, Breakdown tab, back to Expenses | One Payor, Ana |
| Pick Multiple Payors, Summary tab, back | Multiple Payors, every amount empty |
| Pick Ana, Back to Home, reopen the same session | One Payor, Ana. Another session opens on its own pick, or One Payor with nobody |
| Add Item (One Payor, Ana) | Ana stays, as today |
| Add Item (Multiple Payors) | Mode stays, amounts clear, and the hidden One Payor pick clears (BR-13), as today |
| Save to Breakdown | Mode and One Payor pick stay. Amounts, split mode and item fields reset, as today |
| Add a member | Pick unchanged |
| Remove Ana while she's picked | "— Select —" now and on later visits (BR-18) |
| Clear All | One Payor, nobody picked (D4) |
| Staged-item Edit, then Save Edits or Cancel | Pre-edit pick back (BR-15), as today. Leaving mid-edit keeps the pre-edit pick |
| Saved-item Edit (from Breakdown) | Opens on the item's own Paid By, as today. The remembered pick isn't changed, so the next ordinary visit opens on it |
| Reload | One Payor, nobody picked |

Phone and desktop behave the same. No layout changes.

BR-13's wording ("until the next Add Item, Save Edits, Cancel or Save to Breakdown") still holds,
and so does BR-15. Only BR-12's "the One Payor pick … clear[s]" changes.

### 5.4 Item 4: slow Home after a reload (findings, no change)

Measured on 2026-11-16 in Chrome, signed in, with the page's own Resource Timing and with `curl`.
All requests were GETs. Times are milliseconds from navigation start unless stated.

**Local, `vercel dev` on port 3000 (warm, second reload):**

- The HTML arrives in 5 to 6ms (`curl`). All 154 Vite modules have arrived by 342ms. Vite isn't the
  problem.
- At 1,134ms, once Clerk is ready, **six** API calls go out together: `/api/user` four times and
  `/api/sessions` twice. Each effect runs twice because React StrictMode double-runs effects in
  development. `/api/user` is called by both `useOnboarding` and `ProfileContext`, which makes four.
- They come back **one at a time**: at 3,836, 4,461, 5,521, 6,577, 7,614 and 9,519ms.
- Home renders when the second `/api/sessions` lands, at **6,577ms**. The first one's result is
  discarded by the effect's `cancelled` flag. The lazy dev bar modules load at 6,587ms, right
  after. The last `/api/user` lands at 9.5s, which is the "about 10 seconds".
- The first, colder reload showed the same pattern: the six calls ended between 4.6s and 10.4s.
  The warm run wasn't faster, so this isn't a cold start.
- One authenticated `GET /api/sessions` from the page took 3,559, 2,758 and 2,490ms in a row.
  Three in parallel took 2,420, 5,636 and 8,160ms (8.2s wall): `vercel dev` served them one after
  another.
- Unauthenticated calls (401, no Clerk check and no database) took 0.38 to 0.46s each, and six in
  parallel took 0.54 to 0.58s each (0.61s wall). So the queueing and the 2.5s+ cost are both in
  the authenticated path: Clerk's `verifyToken` and the Neon queries (three queries in a row in
  `loadSessions`, and an insert plus a select in `/api/user`), run from this Mac. That part is
  inferred. I didn't instrument the handlers.

**UAT (`hati-git-uat-rlescano.vercel.app`, production build, warm reload):**

- The HTML arrives in 170 to 210ms. **Three** API calls go out at 650ms: `/api/user` twice and
  `/api/sessions` once. There's no StrictMode doubling in a production build.
- `/api/sessions` lands at **1,041ms**, and Home shows then. Everything has landed by 1,397ms.
- One authenticated `GET /api/sessions` took 363, 1,037 and 565ms. Three in parallel took 550,
  1,349 and 1,760ms.
- The response was 24,173 bytes on UAT and 31,389 bytes locally, so the two environments weren't
  returning the same rows. Both are small, so this doesn't change the timings. I noted it and didn't
  look further.

**Conclusion.** The ten seconds come from the local setup:

- Each authenticated function call costs 2.5 to 3.6s under `vercel dev`, against 0.4 to 1.0s on
  Vercel.
- `vercel dev` serves those calls one at a time.
- StrictMode doubles them in development, from 3 to 6.

None of this reaches UAT, where Home shows in about one second. The client has no waterfall:
`/api/sessions` is the only request Home waits for, and it starts in parallel with the others as
soon as Clerk is ready. The handlers are already lean. **No change is specified.**

One real inefficiency was found: `/api/user` is fetched twice on every load in every environment,
by `useOnboarding` and by `ProfileContext`. Home doesn't wait for it, so on UAT it costs one extra
function call and no visible time. Locally it adds two calls to the queue ahead of the second
`/api/sessions`. Fixing it touches the onboarding and profile loading, outside these four fixes,
so it's left as a follow-up (D11).

## 6. UI

- **Phone (≤640px):** pills keep their 38px height, and 44px on receipt rows. Tapping is unchanged.
  The focus ring appears only with a hardware keyboard. Money boxes and Paid By behave as on
  desktop.
- **Desktop:** pills look identical until Tab reaches one, which shows a 2px `--accent-text` ring
  2px outside the pill. Money boxes and Paid By as in section 5.
- No new CSS inside `@media (max-width: 640px)` is needed. The only CSS change is in
  `OwnerPill.module.css` and applies at every width, because keyboard focus applies at every width.

## 7. Onboarding tour impact

**None.**

- No `data-tour` attribute is added, moved, renamed or duplicated. `App.tsx` (`new-session`) and
  `SessionWorkspace.tsx` (`workspace-back`) gain a prop and a state line, but their `data-tour`
  elements aren't touched. `src/components/home` and `src/components/shared` have none (checked
  with grep).
- No step changes. Every step targets a tab, a nav button, New Session, Back to Home, the session
  list or Finish Session, never a pill, a money box or Paid By.
- The tour's session gets a remembered pick like any other, which is harmless. It's never shown,
  and it goes on reload.
- `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

The Vitest environment is `node` with no DOM, so focus, real key presses and remounts are the
ui-ux-tester's. Components without hooks (`OwnerPill`, `ItemModeFields`, `CustomAmountFields`,
`PayorModeFields`) are called as plain functions and their element trees walked, as
`EqualSplitFields.test.ts` and `SoaDocument.test.ts` already do. Every new case fails first.

### 8.1 Unit tests

- **`src/lib/money.test.ts` (new): `clipMoneyInput` (item 2)**
  - Typing, one string at a time: `'8'`, `'80'`, `'800'`, `'800.'`, `'800.0'`, `'800.00'` are each
    returned unchanged. `'800.009'` gives `'800.00'`.
  - Pasting: `'800.009'` gives `'800.00'`, `'800.0099999'` gives `'800.00'`, `'0.999'` gives
    `'0.99'` (not rounded), and `'.129'` gives `'.12'`.
  - Partial and empty: `'1.'`, `'.'`, `''` and `'-'` are unchanged.
  - Negatives: `'-5'` and `'-5.67'` are unchanged. `'-5.678'` gives `'-5.67'`.
  - Left alone: `'1e5'` and `'1.234e2'` are unchanged.
  - Reading is unchanged: `parsePositiveAmount(clipMoneyInput('800.009'))` is 800, and
    `parsePositiveAmount(clipMoneyInput('-5.678'))` is 0.
- **`src/components/home/moneyBoxes.test.ts` (new): every money box clips (item 2)**
  - A small local walker collects every element whose `type` is `ClearableInput` and whose
    `props.type` is `'number'`, through arrays and `props.children`.
  - **`ItemModeFields`** in `'equal'` mode, with `vi.fn()` handlers: exactly **1** box. Its
    `onChange({ target: { value: '800.009' } })` calls `setPrice` with `'800.00'`.
  - **`CustomAmountFields`** with members Ana and Ben, one line each, and a bill with one shared
    order, one discount and one charge: exactly **6** boxes (Total Amount, 2 line prices, 3 row
    amounts).
    - Total Amount calls `onTotalAmountChange('800.00')`.
    - Each line price calls `onLineChange(member, 0, { price: '800.00' })`.
    - Each row calls `onBillRowChange(section, 0, { amount: '800.00' })` for `shared`, `discounts`
      and `charges`.
  - **`PayorModeFields`** in `'multiple'` mode with Ana and Ben: exactly **2** boxes. Each calls
    `onContributionChange(member, '800.00')`.
  - For every box above, `'1.'` and `''` are passed through unchanged.
  - The counts make a box added later without the clip fail this test.
- **`src/components/shared/OwnerPill.test.ts` (new): keyboard reach (item 1)**
  - `OwnerPill({ label: 'Ana', checked: false, onChange })` called as a function: its `<label>`
    child `input` has `type: 'checkbox'`, `className: 'visually-hidden'`, `disabled: false`, no
    `tabIndex`, no `hidden`, and `onChange` is the given handler. Calling it calls the spy once.
    That's the path Space takes on a native checkbox.
  - With `disabled: true`, the input is `disabled` and its `onChange` is `undefined`.
  - `renderToStaticMarkup(OwnerGrid)` with Ana and Ben and `allSelected: true`: three
    `type="checkbox"` inputs, each with `class="visually-hidden"`. "All Members"'s isn't disabled,
    Ana's and Ben's are. With `allSelected: false`, none is disabled.
  - The CSS, read as text with `readFileSync` (as `targets.test.ts` reads sources):
    `OwnerPill.module.css` has no `display: none`, and has a `.pill:has(input:focus-visible)` rule
    with an `outline`.
- **`src/lib/staging.test.ts`: the remembered pick (item 3)**
  - `paidByMemory(new Map(), 's1').read()` is `NO_PAID_BY_PICK`.
  - **Survives a remount:** write `{ single, 'Ana' }` through `paidByMemory(picks, 's1')`, then a
    *new* `paidByMemory(picks, 's1').read()` (what a remounted card reads) returns it.
    `paidByMemory(picks, 's2').read()` is still `NO_PAID_BY_PICK`.
  - **Survives Save and Add Item:** `keptPaidBy('single', 'Ana')` is `{ single, 'Ana' }`.
    `keptPaidBy('multiple', 'Ana')` is `{ multiple, '' }`.
  - **Adding a member keeps it:** `paidByFor({ single, 'Ana' }, ['Ana', 'Ben', 'Cy'])` returns the
    same pick.
  - **A removed member is dropped:** `paidByFor({ single, 'Cy' }, ['Ana', 'Ben'])` is
    `{ single, '' }`. `paidByFor({ multiple, '' }, [])` is unchanged.
- **Tour:** `steps.test.ts` and `targets.test.ts` pass unchanged.

The card's own wiring (the initialiser, the write effect and `save`) needs a DOM and the store's
providers, so it's covered by tester checks 6 to 12.

### 8.2 Manual checks for the ui-ux-tester

Run `npm run dev:full` at 320px, 375px and desktop width, on a test session you create.

1. **Item 1, Tab:** on desktop, in Equal Split with three members, Tab from Total Price. Focus goes
   to "All Members", then Ana, Ben and Cy. Each shows a clear green ring and nothing shifts. Space
   ticks and unticks the focused pill, and the "(₱x each)" figure updates.
2. **Item 1, locked:** tick "All Members" with Space. Tab now skips the member pills, which stay
   dimmed, and Space can't change them.
3. **Item 1, Custom Amounts:** the same in "Who's in this item", and on a shared order's and a
   discount's "Everyone" and member pills.
4. **Item 1, no ring on click:** clicking or tapping a pill shows no ring, and the look matches
   `main` at all three widths. At 320px and 375px a pill is 38px tall, and a receipt row's pill is
   44px (DevTools box model).
5. **Item 1, screen reader:** with VoiceOver (macOS, or iOS), each pill is read as a checkbox with
   its name and state. A dimmed pill is read as dimmed or unavailable. On iPhone, tapping a pill
   while a money box has the keyboard up: report whether the keyboard now closes, and whether
   that's different from `main`.
6. **Item 2:** in each box (Total Price, Total Amount, an order line, a shared order, a discount, a
   charge, and a Multiple Payors amount):
   - type `800.009`: it shows `800.00`;
   - paste `800.009`: it shows `800.00`;
   - type `1.` and then `5`: it shows `1.5`.
   Do this in desktop Chrome and in iOS Safari. On iOS, also check the decimal key still types.
7. **Item 2, totals:** with `800.009` typed as an Equal Split price, the per-head figure and the
   staged item read ₱800.00.
8. **Item 3, the tester's case:** pick One Payor, Ana. Add a member, Dan. Ana is still picked. Add
   Item, Save to Breakdown, go back to Expenses: Ana is still picked.
9. **Item 3, tabs and Home:** pick Ben. Go to Breakdown, then Summary, then back: Ben. Back to
   Home, open another session (its own pick, or "— Select —"), then reopen the first: Ben.
10. **Item 3, Multiple Payors:** switch to Multiple Payors, type amounts, and go to Breakdown and
    back. Multiple Payors is shown, with every amount empty.
11. **Item 3, clearing:** remove Ben while he's picked: "— Select —", and still after a tab
    switch. Pick Ana, then Clear All: One Payor, "— Select —". Pick Ana and reload: One Payor,
    "— Select —".
12. **Item 3, edits:**
    - Staged-item Edit on an item paid by Cy, while Ana is picked. Cancel: Ana. Edit again, change
      to Ben and Save Edits: Ana.
    - Edit again, then Breakdown, "Discard and leave", and back to Expenses: Ana.
    - Saved-item Edit from Breakdown on an item paid by Cy: the form shows Cy. Cancel, then
      Expenses: Ana.
13. **Tour:** run the onboarding tour once. Every step shows as on `main`.

## 9. Documentation impact

- **This change:** an amendment note under BR-12 in `flexible-paid-by-requirements.md`, committed
  with this spec. It keeps the original text and says "Amended by
  `app-fixes-keyboard-decimals-paidby.md`".
- **For the documentation-engineer, when the owner asks:**
  - user-guide text on Paid By being remembered for a session, and on money boxes taking two
    decimals;
  - an accessibility note that the member pills work from the keyboard.
  - No README, API or architecture docs change. Item 4's finding, that local `vercel dev` is slow
    by nature, could go in the developer docs' running notes.

## 10. Tasks

1. `src/lib/money.test.ts`, then `clipMoneyInput` in `money.ts`. → `npm test -- money`
2. `moneyBoxes.test.ts`, then the clip in `ItemModeFields.tsx`, `CustomAmountFields.tsx` and
   `PayorModeFields.tsx`. → `npm test -- moneyBoxes`, plus `CustomAmountFields`,
   `PayorModeFields` and `ClearableInput` unchanged.
3. `OwnerPill.test.ts`, then `OwnerPill.tsx` and `OwnerPill.module.css`. → `npm test -- OwnerPill`
4. `staging.test.ts` cases, then the Paid By helpers in `staging.ts`. → `npm test -- staging`
5. `App.tsx` `paidByPicks`, the `SessionWorkspace` prop and `paidBy`, the `ExpensesPage` prop and
   Clear All write. → `npx tsc -b`
6. `PurchaseItemCard.tsx`: the `paidBy` prop, the initialisers, the `save` line and the write
   effect.
7. The BR-12 amendment note in `flexible-paid-by-requirements.md`.
8. Run `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and `targets.test.ts`)
   and `npm run build`. Report the real results.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| A browser reports "" for "800.009" in a number box, so the clip never runs | It's a valid floating-point string, which Chrome and Safari both report as typed. Tester check 6 covers both |
| The caret jumps when a digit is typed into the decimals | Only when the text already has two decimals. The caret goes to the end and the last digit is dropped (D10). Typing at the end, the usual case, is unaffected |
| A money box is missed, or one is added later without the clip | `moneyBoxes.test.ts` counts the boxes in each component. A grep for `type="number"` finds exactly these five |
| A hidden checkbox shifts the pill or scrolls the page on focus | It's absolute, 1px and clipped, inside a `position: relative` pill, so it's out of the flex flow and sits inside its pill. Tester check 4 |
| The ring is clipped or overlaps a neighbour | The 4px outline fits the 6px gap, and no ancestor clips overflow (checked `Card`, `CustomAmountFields` and `EqualSplitFields`) |
| Screen readers start announcing pills differently | That's the intended fix: they become checkboxes. Tester check 5 |
| On iPhone, tapping a pill now closes the keyboard, because the checkbox can take focus | Possible. A checkbox opens no keyboard. Tester check 5 reports it, and it doesn't block the change |
| A remembered payor has left the group | `paidByFor` drops them at mount, and the member effect clears them while mounted. Edge: removed on another device and re-added under the same name before this device's Expenses tab mounts again keeps the pick (D4) |
| An edit's Paid By leaks into the remembered pick | The write effect writes `editing.restore` during a staged edit and nothing during a saved-item edit. Tester check 12 |
| Clear All keeps Multiple Payors | It writes `NO_PAID_BY_PICK` before the remount. Tester check 11 |
| The Map grows with deleted or tour sessions | One small entry per session opened in this page load, gone on reload |

**Size: small.** 9 source files and 1 test file change, 3 test files are added, and 1 doc note is
added. No schema, API, type or dependency change.

**Risk: low.** Item 1 is CSS plus one attribute. Item 2 changes only text with three or more
decimals. Item 3 keeps every existing reset except Save's, and moves the starting value outside
the card.

## 12. Decisions taken

The owner sees these here. The build follows them.

- **D1. The focus ring is a 2px `--accent-text` outline, 2px out, on `.pill:has(input:focus-visible)`.**
  An outline takes no space, so the pill doesn't shift. `--accent-text` is the brightest accent
  token, so it reads on both checked (accent) and unchecked pills. The global glow
  (`box-shadow 0.18`) is too faint against a checked pill's accent border.
- **D2. The checkbox uses the existing global `visually-hidden` class.** It isn't copied into the
  module. `.pill` gains `position: relative` so the 1px box stays inside it.
- **D3. Equal Split's group label isn't fixed.** "Owner(s) — Split Equally Among" is a `<label>`
  with no control, so a screen reader gives the pills no group name. That's pre-existing and
  outside this fix.
- **D4. Clear All resets Paid By to One Payor with nobody picked.** It removes every member, so the
  One Payor pick has to go. The mode goes too, matching the existing "fresh Purchase Details"
  comment. A member removed on another device and re-added under the same name, while this device
  is off the Expenses tab, keeps the pick. That's rare and harmless.
- **D5. The pick is kept per session in `App` until reload, so it survives Back to Home.** The
  owner listed member removal and reload as what clears it, and leaving the session isn't on that
  list. `SessionWorkspace` would forget it on Back to Home, and so would the AppData context, which
  it mounts. It's a `Map` keyed by session id, read once as the card mounts, so other sessions
  can't see it and it causes no re-renders.
- **D6. The date isn't remembered.** It wasn't asked for. It still stays across Add Item and Save,
  as today, and resets to today on a remount.
- **D7. Multiple Payors remembers the mode only.** There are no ticks to keep (A2). Amounts belong
  to one item, so they clear as today, and a tab switch drops half-typed ones.
- **D8. The money boxes stay `type="number"`.** A `type="text"` box with `inputMode="decimal"` (as
  the Collection payment box uses) would also work, but it's a wider change. It would accept
  letters and need its own filter. iOS's decimal pad has no minus key. And `global.css` and
  `PayorModeFields.module.css` style `input[type='number']`, so the boxes would change look. The
  clip needs neither the caret nor partial text, so `type="number"` is enough (section 5.2).
- **D9. The Collection payment box (`LineRow.tsx`) is unchanged.** It's a text box, and it already
  refuses three decimals with its own message, "Use at most 2 decimal places." (the cap in
  [`collection.md`](collection.md)).
  The owner's list named the Expenses boxes. Clipping there too would make that message
  unreachable, so it's left for the owner to ask.
- **D10. A third decimal digit typed in the middle drops the last digit.** "12.34" with a 5 typed
  after the 3 becomes "12.35", not "12.34". Keeping the old text would need the caret, which a
  number box doesn't expose, and would stop a paste of "800.009" giving "800.00".
- **D11. Item 4: no change.** The slowness is the local `vercel dev` path plus StrictMode, with
  numbers in section 5.4. The duplicate `/api/user` fetch (`useOnboarding` and `ProfileContext`)
  is a real but small inefficiency in every environment. It's left as a separate follow-up for the
  owner to approve, because it touches onboarding and profile loading.
