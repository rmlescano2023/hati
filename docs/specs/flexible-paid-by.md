# Spec: per-item Date and Paid By, editing staged items, and a leave warning

Status: **draft, waiting for the owner's approval.** Branch `feature-flexible-paid-by`.

## 1. Summary

In a session's Expenses tab, Purchase Details has one Date and one Paid By for everything staged.
They are applied only at "Save to Breakdown", so items with different dates or payors need a save
in between. After this change:

- each staged item carries the Date and Paid By it was added with
- one save files every item into the Breakdown card for its own date and payor
- a staged item can be edited in place
- leaving the Expenses tab with staged items asks first

Removing a member also cleans up what's staged, which fixes a bug where a removed member stayed in
staged items and the payor pick.

Source: the business-analyst's requirements, copied to
[`docs/specs/flexible-paid-by-requirements.md`](flexible-paid-by-requirements.md) (US-1 to US-7,
BR-1 to BR-22). Section 10 of that file records the owner's final answers:

- **NQ1:** the split-mode switch keeps the name everywhere.
- **NQ2:** no in-app warning on Clerk sign-out.
- **Clear All:** clears staged work too.

The owner-approved intake brief is `/Users/rmlescano/.claude/plans/soft-humming-fiddle.md`. The
system-architect was skipped by the owner's choice.

**No schema or API change.** Section 3 explains why.

## 2. Layers touched

| Layer | File | Change | Reuses |
|---|---|---|---|
| Types | `src/types/index.ts` | Comment only: `NewPurchaseRecord`'s doc names `addRecords` instead of `addRecord`. | |
| Schema | none | | |
| API | none | | |
| Pure logic | `src/lib/money.ts` | Add `parsePositiveAmount`, which is the card's private `num` moved here unchanged. | `roundMoney` |
| Pure logic | `src/lib/calculations.ts` | Move `purgeMemberFromItem` here from `SessionsStoreContext.tsx`, unchanged, and export it. | `getItemShares`, `roundMoney` |
| Pure logic | `src/lib/staging.ts` (new) | `StagedItem` type, `readContributions`, `contributionsMatch`, `buildRecords`, `purgeMemberFromStaged`, `stagedNamesMember` (section 5). | `getItemTotal`, `purgeMemberFromItem`, `sumMoney`, `parsePositiveAmount` |
| Pure logic | `src/lib/saveMessage.ts` | Narrow `Missing` to `'items'` and drop the date and payor rules (section 5.6). | |
| Client state | `src/context/SessionsStoreContext.tsx` | Replace `addRecord` with `addRecords` (several records in one `updateSession`). Import `purgeMemberFromItem` from `calculations`. | `updateSession`, `createId` |
| Client state | `src/context/AppDataContext.tsx` | `addRecord` becomes `addRecords` in the type and the binding. | |
| UI | `src/components/shared/ConfirmDialog.tsx` | Optional `cancelLabel` prop, default `'Cancel'`. | |
| UI | `src/components/layout/SessionWorkspace.tsx` | Leave guard on the session tabs and Back to Home, plus the "Leave without saving?" dialog. | `ConfirmDialog`, `pluralize` |
| UI | `src/pages/ExpensesPage.tsx` | Owns the staged list (lifted from the card), reports its count up, registers `beforeunload`, and remounts the card on Clear All. | |
| UI | `src/components/home/MemberList.tsx` | Confirmation also covers staged items, with new wording, and Clear All resets Purchase Details. | `ConfirmDialog` |
| UI | `src/components/home/PurchaseItemCard.tsx` | Stamping, per-item contributions check, Edit / Save Edits / Cancel, locks, member-removal cleanup, and save via `buildRecords`. | everything above |
| UI | `src/components/home/PurchaseDetailsFields.tsx`, `PayorModeFields.tsx` | `stagedTotal` prop becomes `itemTotal` and `contributed`. | |
| UI | `src/components/home/ItemStagingList.tsx`, `.module.css` | Takes `StagedItem[]`. Each row gets a date and payor line, an Edit button, and an editing highlight with an "Editing" tag. | `Button`, `PencilIcon`, `formatLongDate`, `formatMoney` |
| PDF | none | Uses `groupRecordsForBreakdown`, which is unchanged. | |
| Tour | none | Section 7. | |
| Tests | `src/lib/staging.test.ts` (new), `src/lib/saveMessage.test.ts` | Section 8. | |
| Docs | none in the repo | Section 9. | |

## 3. Data model

**None.** A `PurchaseRecord` is already `{date, payorMode, payors, items}`, and
`groupRecordsForBreakdown` already makes one card per date plus set of payor names. One save simply
appends several records instead of one.

- `PUT /api/sessions/[id]` already replaces all of a session's records in one transaction. Its
  validation (`parseSession` / `parseRecord` in `src/lib/storage.ts`) has no limit on the number of
  records and accepts every record shape this feature produces.
- No existing rows are touched. Records already saved keep their shape and show exactly as today.
- Staged items stay client-only and are never persisted, as today.

## 4. API contract

**None.** No route, request shape, validation or status code changes.

## 5. Business logic

All new rules are pure functions in `src/lib/staging.ts`. Its imports use the `.js` suffix, as
`calculations.ts` does.

### 5.1 The staged item

```ts
/** One row of the staging list: the item plus the Date and Paid By stamped on it at Add Item (BR-1). */
export type StagedItem = {
  item: PurchaseItem;   // item.id is the row's id
  date: string;         // ISO YYYY-MM-DD, never empty (BR-3)
  payorMode: PayorMode; // as chosen when stamped; Edit restores it (AC-4.2)
  /**
   * single:   exactly one entry; its amount is ignored, because buildRecords recomputes it.
   * multiple: the contributions above 0, rounded, in member order (BR-5).
   */
  payors: PayorContribution[];
};
```

Stamping happens in the card's `addItem` and `saveEdits` (5.5). One Payor stamps
`[{ member: singlePayor, amount: getItemTotal(item) }]`. Multiple Payors stamps
`readContributions(contributions, members)`.

### 5.2 Parsing input and the contributions check (BR-5)

- `parsePositiveAmount(raw: string | undefined): number` in `money.ts` is today's `num`, moved
  unchanged: `parseFloat`, then `roundMoney` when finite and above 0, otherwise 0.
  `PurchaseItemCard` imports it as `num`, so none of its call sites change.
- `readContributions(raw: Record<string, string>, members: string[]): PayorContribution[]` reads
  each member in `members` order:
  - The amount is `parsePositiveAmount(raw[m])`, so it's rounded to the centavo first.
  - An entry is kept only if its amount is above 0. Blank, zero, negative, unparseable and
    sub-centavo values are dropped.
  - Keys that aren't current members are ignored.
- `contributionsMatch(payors: PayorContribution[], itemTotal: number): boolean` is true only when all
  of these hold:
  - `payors.length >= 1`. One contributor is allowed (Q7).
  - `itemTotal > 0`.
  - `Math.round(sumMoney(amounts) * 100) === Math.round(itemTotal * 100)`. This compares exact
    centavos, so float dust such as 0.1 + 0.2 against 0.3 doesn't fail it.
- The **item total** the check uses is the Equal Split price `num(draft.price)`, or for Custom
  Amounts the sum of the member amounts (`enteredTotal`). Total Amount is never used (AC-2.3).

### 5.3 Add Item and Save Edits enablement (BR-2 to BR-5, AC-1.6, AC-4.9)

Both buttons use the same rule, `canAddItem`:

```
itemValid  = today's rule, unchanged (BR-2)
dateValid  = date !== ''
payorValid = payorMode === 'single'
               ? members.includes(singlePayor)   // also rejects a stale removed name
               : contributionsMatch(readContributions(contributions, members), itemTotal)
canAddItem = itemValid && dateValid && payorValid
```

No hint is shown by a disabled button (Q5).

### 5.4 Building records at Save to Breakdown (BR-6 to BR-10)

`buildRecords(staged: StagedItem[]): NewPurchaseRecord[]` walks the list in staging order.

1. **Effective payor.** An item is single-payor if `payorMode === 'single'`, or if it's Multiple
   Payors with exactly one contribution (AC-2.6, and AC-6.8 after a removal). Its payor is that one
   member.
2. **Single-payor items:** grouped by the key `date + payor member`.
   - The first item with a key creates a record `{date, payorMode: 'single', payors: [{member,
     amount: 0}], items: [item]}` at the current end of the output.
   - Later items with the same key are appended to that record's `items`, in staging order.
3. **Multiple Payors items with two or more contributions:** each becomes **its own record**,
   `{date, payorMode: 'multiple', payors: item's contributions, items: [item]}`. Two of them are
   never merged, even with the same date and payors (BR-8).
4. When the walk is done, every single-payor record's `payors[0].amount` is set to
   `sumMoney(record.items.map(getItemTotal))`. That's the meaning a single-payor amount has today.
5. The output order is the order in which each record was first created.

**Why this is money-safe (BR-8).**
- `getRawOwedMatrix` splits a record among its payors using that record's contribution weights.
- A single-payor record gives its one payor weight 1. A one-contributor Multiple Payors record also
  gives weight 1 (`getPayorWeights`).
- So grouping single-payor items, and treating one-contributor items as single, changes no one's
  balance.
- A Multiple Payors item keeps its own weights because it has its own record. That's the case the
  analyst's worked example shows going wrong when merged.
- A test proves that building all the items at once gives the same matrix as building each item
  alone (section 8).

**Why the order holds (BR-9).** Within one card, the items from one click show in staging order:
- A single-payor card gets at most one record from a click, and its items are in staging order.
- A card for two or more payors gets one record per item, created in staging order.
- `addRecords` gives the records ascending `createdAt` values (5.7), which both the client
  (`groupRecordsForBreakdown`) and the server (`order by r.date, r.created_at`) sort by.
- Treating one-contributor items as single is what stops a one-contributor item being split off from
  single-payor items in the same card.

**Visible effect.** The count on Home's session card ("N purchases") and in the delete confirmation
counts records.
- A click of One Payor items still counts once for each date and payor, as today.
- Each Multiple Payors item with two or more contributors now counts as its own purchase.

**Rounding (BR-10):** unchanged. `splitEvenly` and `allocateProportionally` are untouched. The only
new arithmetic is `sumMoney` for single-payor amounts and the centavo comparison in 5.2.

### 5.5 The fields: what each action does

In this table, "Item fields" means `draft`, which holds the name, price, owners, All Members, Total
Amount and amounts. `restore` is captured when Edit is clicked.

| Action | date | payorMode | singlePayor | contributions | draft | staged |
|---|---|---|---|---|---|---|
| **+ Add Item** (not editing) | kept | kept | kept if `payorMode` is single, `''` if multiple (BR-13: clears the hidden mode) | `{}` | `{...EMPTY_DRAFT, mode: draft.mode}` | append the stamped item |
| **Edit** row X | X.date | X.payorMode | X's payor if single, else `''` | X's contributions as `amount.toFixed(2)` if multiple, else `{}` | `draftFromItem(X.item, members)` | unchanged |
| **Save Edits** | `restore.date` | `restore.payorMode` | `restore.singlePayor` | `{}` | `{...EMPTY_DRAFT, mode: restore.mode}` | replace X in place: same `item.id`, same index, newly stamped |
| **Cancel** | as Save Edits | as Save Edits | as Save Edits | `{}` | as Save Edits | unchanged |
| **Save to Breakdown** | kept | kept | `''` | `{}` | `{...EMPTY_DRAFT, mode: 'equal'}` | `[]` (BR-12, as today) |
| **Split-mode switch** (NQ1, BR-14) | kept | kept | kept | kept | `{...EMPTY_DRAFT, mode, name: draft.name}` | unchanged |
| **Payor-mode switch** | kept | new mode | kept | kept | kept | unchanged (BR-13) |

Notes on the table:

- `draftFromItem(item, members)` is a local function in `PurchaseItemCard.tsx`.
  - **Equal Split:** `{mode: 'equal', name, price: totalPrice.toFixed(2), totalAmount: '', amounts: {}}`.
    If `members.length > 0` and every member is an owner, it sets `allSelected: true, owners: {}`, as
    `toggleAll` does. Otherwise it sets `allSelected: false` and `owners` maps each owner to `true`.
  - **Custom Amounts:** `{mode: 'custom', name, price: '', owners: {}, allSelected: false, totalAmount:
    getItemTotal(item).toFixed(2), amounts}`, where each amount is written with `.toFixed(2)` (AC-4.2).
- `restore` is `{ date, payorMode, singlePayor, mode: draft.mode }`, taken just before Edit loads the
  row. A half-typed item is not part of it, so it's never restored (Q2, AC-4.3).
- Save Edits and + Add Item both dispatch `{ type: 'itemAdded' }` (AC-5.5).
- The card keeps edit state as `editing: { id: string; restore: … } | null`. "Editing" means
  `editing !== null`.

### 5.6 Locks during an edit (BR-11)

While editing:
- Save to Breakdown is `disabled`.
- **Every** row's Edit and × are disabled, including the edited row's own Edit and ×. The edited row
  is marked by its highlight and the "Editing" tag.

Save to Breakdown is no longer "never disabled". Update the comment in `save()` to say it's disabled
only during an edit.

### 5.7 One write per click (BR-6) and the save message (US-5)

`addRecords(sessionId, inputs: NewPurchaseRecord[], onSettled?)` replaces `addRecord`, whose only
caller is the card:

```ts
// One change for the whole click, so its records are saved together or not at
// all (BR-6). Each gets its own millisecond, in staging order: the server reads
// records back ordered by date and created_at, and a tie there has no defined
// order (BR-9).
const base = Date.now();
updateSession(sessionId, (session) => ({
  ...session,
  records: [
    ...session.records,
    ...inputs.map((input, i) => ({
      ...input,
      id: createId('rec'),
      createdAt: new Date(base + i).toISOString(),
    })),
  ],
}), onSettled);
```

- It makes one `mutateSession` call, so there's one PUT and one `onSettled`.
- The message therefore still describes the whole click with today's machinery:
  - "Saving…", then "Still saving…" after 10 s
  - then "Saved to Breakdown." only when that one write lands, or "Not saved." if it fails
- On a failure the records stay on screen with "Not saved." and the sync banner, and "Try again" restores the last saved version, so nothing is half-saved, unchanged from
  today (AC-5.2).

`saveMessage.ts` rework (AC-5.3, AC-5.4):
- `Missing` becomes `'items'`, `CHECK_ORDER` becomes `['items']`, and `VALIDATION_TEXT` keeps only
  `items: 'Add an item first.'`.
- `onlyResetGaps(missing)` becomes `missing.items`: a tap on an empty list while a save is in flight
  is ignored, as today's double-tap rule does.
- Update the comments that explain the date check and the cleared-date special case, which no longer
  exist.
- In the card, `missing` becomes `{ items: staged.length === 0 }`.

### 5.8 Removing a member (BR-16 to BR-18)

- `purgeMemberFromStaged(staged: StagedItem[], member: string): StagedItem[]` applies the saved-record
  rule to each staged item:
  - `item` becomes `purgeMemberFromItem(item, member)`, the function moved to `calculations.ts`.
  - `payors` drops `member`.
  - The staged item is dropped if the item becomes `null` or `payors` becomes empty.
  - An untouched staged item is returned as the same object.
  - Remaining contributions are not rescaled (BR-17).
- `stagedNamesMember(staged, member): boolean` is true when any staged item has `member` as an owner
  or a custom amount (`member in getItemShares(item)`), or as a payor or contributor.

**Wiring.** The cleanup runs in `PurchaseItemCard` on any change to `members`, wherever it came from
(this device, another device, or the dev bar):
- `const prevMembers = useRef(members)`.
- In an effect on `members` (and `staged`, `editing`, `setStaged` for the linter):
  1. `removed = prevMembers.current.filter(m => !members.includes(m))`, then
     `prevMembers.current = members`, then return if `removed` is empty.
  2. `next = removed.reduce(purgeMemberFromStaged, staged)`, then `setStaged(next)`.
  3. In `draft`, delete removed members from `owners` and `amounts`. Leave `allSelected` as is,
     because it means "every current member".
  4. Delete removed members from `contributions`. Set `singlePayor` to `''` if it was removed.
  5. If editing, set `restore.singlePayor` to `''` if it was removed (BR-15). If `next` no longer
     contains `editing.id`, end the edit as Cancel does, using that updated `restore` (AC-6.6).

This replaces nothing in the store. `removeMember` and `clearMembers` stay as they are.

**Confirmation** (`MemberList.tsx`). MemberList receives `staged` from ExpensesPage.
- **Remove:** a confirmation is needed when `records.length > 0 || stagedNamesMember(staged, name)`.
  The message:

  | Saved records exist | Staged items name the member | Message |
  |---|---|---|
  | yes | no | "Their shares are taken out of every saved record." (unchanged) |
  | yes | yes | "Their shares are taken out of every saved record and staged item." |
  | no | yes | "Their shares are taken out of the staged items." |

- **Clear All:** a confirmation is needed when `records.length > 0 || staged.length > 0`. The message:

  | Saved records exist | Staged items exist | Message |
  |---|---|---|
  | yes | no | "This also clears every saved record in this session." (unchanged) |
  | yes | yes | "This also clears every saved record and staged item in this session." |
  | no | yes | "This also clears the staged items." |

- **When Clear All goes through** (confirmed, or straight away when nothing is at stake), MemberList
  calls `clearMembers()` and then a new `onClearAll()` prop.
  - ExpensesPage handles it with `setStaged([])` and `setFormKey(k => k + 1)`.
  - `<PurchaseItemCard key={formKey} …>` then remounts as a fresh form: today's date, One Payor with
    no pick, Equal Split, empty fields and no edit (AC-6.9).
  - Like leaving the tab, the remount drops a "Saving…" message. The save itself carries on.

### 5.9 The leave warning (US-7, BR-19 to BR-22)

**Where the state lives.** `staged` moves from `PurchaseItemCard` to `ExpensesPage`
(`useState<StagedItem[]>([])`) and is passed down as `staged` and `setStaged`. That way:
- MemberList can read it.
- Unmounting ExpensesPage still discards it, which is what "Discard and leave" and the tour rely on.

**Count up to the workspace.** `ExpensesPage` takes a required `onStagedCountChange: (n: number) =>
void` prop and runs:

```ts
useEffect(() => {
  onStagedCountChange(staged.length);
  return () => onStagedCountChange(0);
}, [staged.length, onStagedCountChange]);
```

An open edit always has a staged item, so the count alone answers "is there staged work" (BR-19).

**In-app guard, in `SessionWorkspace.tsx`.**
- New state: `const [stagedCount, setStagedCount] = useState(0)` and
  `const [leaveTo, setLeaveTo] = useState<SessionTabId | 'home' | null>(null)`.
- It renders `<ExpensesPage onStagedCountChange={setStagedCount} />`.
- **SessionTabs `onChange(t)`:** keep `setRenaming(false)` first, so the name saves either way
  (AC-7.13). Then, if `stagedCount > 0 && t !== tab`, call `setLeaveTo(t)`. Otherwise call
  `onTabChange(t)`. Tapping the current tab therefore never asks (AC-7.11).
- **Back to Home `onClick`:** `stagedCount > 0 ? setLeaveTo('home') : onBack()`. Only the handler
  changes. The `<Button data-tour="workspace-back">` element and its attribute stay as they are.
- **The dialog**, rendered inside the provider after the tab pages:

  ```tsx
  <ConfirmDialog
    open={leaveTo !== null}
    title="Leave without saving?"
    message={`You have ${pluralize(stagedCount, 'staged item')} that ${stagedCount === 1 ? "isn't" : "aren't"} saved.`}
    confirmLabel="Discard and leave"
    cancelLabel="Stay"
    destructive
    onCancel={() => setLeaveTo(null)}
    onConfirm={() => {
      const to = leaveTo;
      setLeaveTo(null);
      if (to === 'home') onBack();
      else if (to) onTabChange(to);
    }}
  />
  ```

  - In `destructive` mode, Stay is the filled button and `showModal` focuses it.
  - Escape and the backdrop call `onCancel`, which is Stay (AC-7.3, AC-7.5).
  - Discard and leave navigates, which unmounts ExpensesPage and drops the staged work. It never
    saves (BR-22, AC-7.4).

**`ConfirmDialog`:** add `cancelLabel?: string` (default `'Cancel'`), documented as "The way-out
button's label", and render it in place of the hard-coded `Cancel`. Existing callers are unchanged.

**What isn't intercepted (BR-21):**
- **The tour.** `tourNavigate` and `endTour` in `App.tsx` call `setScreen` directly and never go
  through `SessionTabs` or Back to Home. They unmount ExpensesPage, which discards any staged work and
  removes its `beforeunload` listener, so the tour wins. The tour's click handler also swallows taps
  on tabs other than the highlighted one. No tour code changes.
- **A session that disappears.** `AppDataProvider`'s own "Session not found" Back button and the
  provider unmounting its children are separate paths, and neither is guarded.
- **Finishing a session** happens from Summary, where the count is always 0.

**Browser leave prompt (BR-20, AC-7.8, AC-7.9)**, in `ExpensesPage.tsx`:

```ts
/**
 * Its own function, not the one useServerSessions registers for writes in
 * flight: addEventListener ignores a second registration of the same function,
 * so sharing one would let either side remove the other's prompt.
 */
function warnAboutStaged(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = '';
}
// in the component
const hasStaged = staged.length > 0;
useEffect(() => {
  if (!hasStaged) return;
  window.addEventListener('beforeunload', warnAboutStaged);
  return () => window.removeEventListener('beforeunload', warnAboutStaged);
}, [hasStaged]);
```

- The browser's own Back leaves the app because there's no `pushState`, so this prompt covers it too.
- iOS Safari generally ignores `beforeunload`. That's a known limit, and the in-app dialog is
  unaffected.
- Clerk sign-out gets no in-app warning (NQ2).

## 6. UI

### Purchase Details (`PurchaseItemCard`)

- **Add Item row** (`.actions`):
  - Not editing: `+ Add Item` as today, `disabled={!canAddItem}`.
  - Editing: `<Button variant="ghost">Cancel</Button>` followed by `<Button
    disabled={!canAddItem}>Save Edits</Button>`. The row is right-aligned, so Save Edits sits where
    + Add Item was and Cancel sits to its left.
  - Both buttons fit on one line at 320px. No CSS change.
- **Save to Breakdown:** `disabled={editing !== null}`.
- **Paid By footer** (`PayorModeFields`): the props `itemTotal` and `contributed` replace
  `stagedTotal`.
  - The card passes `contributed = sumMoney(readContributions(contributions, members).map(p =>
    p.amount))`, so the footer uses the same numbers as the check.
  - Mismatch stays `itemTotal > 0 && Math.abs(contributed - itemTotal) >= 0.01`.
  - The footer reads "Contributed ₱250.00 of ₱300.00" (AC-2.1 to AC-2.5).
  - `PurchaseDetailsFields` passes both props through.
  - Remove the card's `stagedTotal` memo, which this leaves unused.
- **On Edit:**
  - The card calls `sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })`,
    with a ref on its `.section` div, so a phone user sees the fields fill.
  - On a fine pointer (`!window.matchMedia('(pointer: coarse)').matches`, the same test
    SessionWorkspace uses), it also focuses `#purchase-date` with `{ preventScroll: true }`.
  - On touch it doesn't focus, so no keyboard or date picker opens unasked.
- **When an edit ends:** focus moves to that row's Edit button (`id={`edit-${item.id}`}`) if the row
  still exists. Use a ref flag set by Save Edits and Cancel, plus an effect on `editing`, as
  `SessionWorkspace` does for its pencil.

### Staging list (`ItemStagingList`)

Props become `{ items: StagedItem[]; editingId: string | null; onEdit(id); onRemove(id) }`. The
total uses `sumMoney(items.map(s => getItemTotal(s.item)))` (AC-1.7).

Each row is:

1. **Item cell** (`.itemCell`, a `div` replacing the `.name` span as the grid child). It holds:
   - `.name`: the item name, unchanged styling.
   - When editing this row, an `.editingTag` pill reading "Editing" (AC-4.4, so the state doesn't
     rely on colour).
   - A `.meta` line: `{formatLongDate(date)} · Paid by {payor}`.
     - One Payor shows the member's name.
     - Multiple Payors shows `Ana: ₱200.00, Ben: ₱100.00` (AC-1.8), with contributions in stored
       order joined by ", ".
     - `.meta` uses 11px, `var(--text2)`, and `overflow-wrap: anywhere`, so long names wrap rather
       than widen the page.
2. **Price** and **Owners / Amounts pills:** unchanged. They read `s.item`.
3. **Actions cell** (`.actions`, replacing `.removeCell`). It holds:
   - `<Button variant="icon" className={styles.edit} id={`edit-${id}`} title="Edit item"
     aria-label={`Edit ${name}`} disabled={editingId !== null} onClick={() => onEdit(id)}>` with
     `<PencilIcon className={styles.editIcon} />` inside.
   - Then the existing × with `disabled={editingId !== null}`.

Styles (`ItemStagingList.module.css`):

- **Desktop**, where only the last column changes:
  - The grid's last column goes from `36px` to `76px`, for two icon buttons.
  - `.actions { display: flex; gap: 4px; justify-content: flex-end; }`
  - `.editIcon { display: block; width: 15px; height: 15px; }`
  - `.row .edit:hover:not(:disabled) { color: var(--text); background: var(--surface2); }`. The higher
    specificity overrides `Button`'s red icon hover, which signals delete.
  - `.editing, .editing:hover { background: var(--accent-bg); }`
  - `.editingTag` copies `.pill`'s shape, with `var(--accent-bg)` and `var(--accent-text)` and a
    1px `var(--accent)` border. It sits inline after the name with `margin-left: 6px`.
  - The header row keeps "Item", "Price", "Owners / Amounts" and the empty last cell.
- **Phone:** the existing `@media (max-width: 620px)` block changes as follows:
  - `grid-template-columns: minmax(0, 1fr) 76px`
  - areas `'item actions' 'price price' 'pills pills'`
  - `.row > .itemCell { grid-area: item; }`, which takes over the `font-weight: 500` that `.name` had
  - `.row > .actions { grid-area: actions; }`
  - Edit and × sit side by side on the first line (edge cases table), and are 38px tall from
    `Button`'s own 640px rule.

**Breakpoint decision: 620px, not 640px.** The new phone rules go in the file's existing 620px block.
- `docs/mobile-breakpoints.md` lists `ItemStagingList` at 620px as "intentionally not folded into
  640px". CLAUDE.md points to that doc for breakpoints.
- The new rules rearrange the same grid as the old ones, using `grid-template-areas`. Splitting them
  across two breakpoints would leave rows half rearranged between 621px and 640px.
- Moving the whole block to 640px would change today's staging list at those widths, which nothing
  here asks for.

### Group Members (`MemberList`)

Only the confirmation conditions and messages change, plus the `onClearAll` call (5.8). There's no
layout change.

### The leave dialog

It reuses `ConfirmDialog` as is, apart from the label. Its `.actions` row holds "Stay" and "Discard
and leave" on one line at 320px (AC-7.14, a tester check).

**Desktop:** the only visual changes are the staging row (second line, wider actions column, Edit
button, editing highlight), the Save Edits and Cancel pair while editing, and the new dialog. All of
them are required.

## 7. Onboarding tour impact

**None to steps or targets.**

- No `data-tour` attribute is added, moved, renamed or duplicated.
  - `workspace-back` stays on the same `Button` in `SessionWorkspace.tsx`; only its `onClick`
    changes.
  - `tab-*` in `SessionTabs.tsx` isn't touched. Its `onChange` is wrapped by the workspace, not
    changed.
- `src/components/home` has no targets.
- The tour moves through `tourNavigate` and `endTour`, which bypass the guard (5.9), so no dialog
  can appear during the tour (AC-7.12).
- Staged work can't exist during the tour in practice: it starts on Home, and its overlay blocks the
  form.
- The tour's "Leaving loses nothing" step copy is about the session, which still holds. No copy
  change.
- `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

The Vitest environment is `node` and only `src/**/*.test.ts` runs, so component behaviour is checked
by the ui-ux-tester. Tests marked "fail first" fail before the change, because the function doesn't
exist yet or the old rule is in place.

### Unit tests: `src/lib/staging.test.ts` (new, fail first)

**`readContributions` (BR-5)**
- Rounds each value to the centavo: `'100.004'` becomes 100.
- Drops blank, `'0'`, `'-5'`, `'abc'` and `'0.004'`.
- Keeps `members` order.
- Ignores keys that aren't members.

**`contributionsMatch` (BR-5)**
- 200 + 100 against 300 is true. 200 + 50 against 300 is false (AC-2.1). 350 against 300 is false
  (AC-2.4).
- A single contributor of 300 against 300 is true (AC-2.6).
- An empty list is false. An item total of 0 is false (AC-2.5).
- 0.1 + 0.2 against 0.3 is true.
- Inputs `'100.004'` and `'199.996'`, read through `readContributions`, match 300 because each is
  rounded first.

**`buildRecords` (BR-7, BR-8, BR-9)**
- **AC-3.1:** 12 Nov Ana, 12 Nov Ben and 13 Nov Ana give three single records with the right items.
  Each `payors[0].amount` is its item total.
- Two single items for 12 Nov Ana, with a Ben item between them, give one record holding both items
  in staging order, with an amount equal to their sum.
- **AC-3.3 / BR-8:** two Multiple Payors items on 12 Nov, both Ana and Ben (240/60 and 60/240), give
  **two** records, each keeping its own contributions.
  - `groupRecordsForBreakdown` on them, given ascending `createdAt`, shows one card whose payors are
    Ana 300 and Ben 300.
- **AC-3.4 worked example:** the requirements' BR-8 members and items, built and given ids and
  ascending `createdAt`, give a `getRawOwedMatrix` where Cy owes Ana 240 and Ben 60.
- **BR-8 equivalence:** for a mixed fixture (single, one-contributor multiple, and two-contributor
  multiple, across two dates), `getRawOwedMatrix` of `buildRecords(all)` equals the matrix of
  `buildRecords` applied to each item alone and concatenated.
- **AC-2.6:** a Multiple Payors item with one contributor (Ana) becomes a single record for Ana. It
  merges with a same-date One Payor Ana item, and the merged record keeps staging order.
- Records come out in first-appearance order.

**`purgeMemberFromStaged` (BR-16, AC-6.4, AC-6.8)**
- An Equal Split item with Ana, Ben and Cy at ₱300 drops Cy, and its price becomes 200. Ana's and
  Ben's shares are unchanged.
- A Custom item drops Cy's amount.
- A One Payor item paid by Cy is removed.
- A Multiple Payors item of 300 paid Ana 200 / Cy 100 keeps Ana 200 as its only contributor, with
  the item unchanged.
- An item whose only owner was Cy is removed.
- An item that doesn't name Cy is returned as the same object.
- Purging every member returns `[]`, which is the Clear All end state.

**`stagedNamesMember`**
- True for an owner, a custom amount, a single payor and a contributor.
- False when the member isn't named.

### Unit tests: `src/lib/saveMessage.test.ts` (update)

- Remove the date and payor cases: `noDate`, `noPayor`, `noItemsNoDate`, "checks items, then date,
  then payor", AC-D6.8, "treats a cleared date as a real gap while saving", and the multi-gap
  BR-D14 case.
- Re-key the fixtures to `{ items }` only.
- Keep, and adjust where needed:
  - "Add an item first." on an empty list (AC-5.3)
  - the quick second tap while saving is ignored
  - "still names the missing items once the save has an outcome"
  - `itemAdded` clears Saved but keeps Saving… and Not saved (AC-5.5)
- Add: `VALIDATION_TEXT` has no date or payor message. Assert that `saveMessageView` never returns
  "Pick a date." or "Choose who paid." (AC-5.4).

### Existing tests that must still pass

- `calculations.test.ts`: `purgeMemberFromItem` moved but unchanged.
- `steps.test.ts` and `targets.test.ts`.
- Everything else under `npm test`.

### ui-ux-tester checks

Run each check at 320px, 390px and desktop width, in `npm run dev:full`.

| AC | Check |
|---|---|
| AC-1.1, 1.2, 1.8 | Rows show their own date and payor line. Changing Date or the payor afterwards doesn't change the rows. A Multiple Payors row lists "Ana: ₱200.00, …". |
| AC-1.3, 1.4, 1.5 | After an add, the date and One Payor pick stay, the contributions clear, the item fields clear and the split mode stays. |
| AC-1.6 | An empty date, or "— Select —", disables + Add Item. |
| AC-1.7 | The total above the list sums every row. |
| AC-2.1 to 2.6 | The footer reads "Contributed ₱X of ₱Y" against the item price, and + Add Item enables only on an exact match. A single contributor works and lands in "Paid by Ana". |
| AC-3.1 to 3.6 | Mixed save: three cards with correct totals. Saving joins an existing card. Two Multiple Payors items with the same payors share one card with summed badge amounts. The worked example shows Cy owing Ana ₱240 and Ben ₱60 in Summary. The PDF matches Breakdown. |
| BR-9 | Within a card, one click's items keep staging order, including **after a page reload**, which proves the `createdAt` ordering. |
| AC-4.1 to 4.13 | Edit button and its label. The fields fill correctly for each mode, and All Members is ticked only when the owners are everyone. Highlight and "Editing" tag. Locks. Save Edits keeps the row's position and moves the item to its new card on save. Cancel leaves the item exactly as it was. Restore after an edit. Mode switches during an edit, with the name kept. On a phone, Edit scrolls the form into view. |
| NQ1 | Outside an edit, switching split mode keeps the name and clears the rest. |
| AC-5.1, 5.2 | Saving… / Still saving… / Saved for a mixed click. With the network blocked: "Not saved.", the items stay visible in Breakdown with the sync banner, and "Try again" restores the last saved version, so nothing is half-saved. |
| AC-5.3, 5.4 | An empty-list save shows "Add an item first.". "Pick a date." and "Choose who paid." never appear. |
| AC-6.1 to 6.9 | Each confirmation wording case. Removal cleans rows, fields, the payor pick and an open edit, including the edit ending when its row disappears. Clear All resets to a fresh form. Cancel in the confirmation changes nothing. |
| AC-7.1 to 7.7, 7.10, 7.11, 7.13, 7.14 | Dialog on Breakdown, Summary and Back to Home, with the singular and plural wording. Stay, Escape and the backdrop keep everything. Discard and leave goes to the target, and Expenses comes back fresh. No dialog without staged items, mid-save, or on the same tab. A rename typed and then a tab tap saves the name. The dialog fits at 320px. |
| AC-7.8, 7.9 | In a desktop browser, reload or close with staged items prompts, and without staged items doesn't. |
| AC-7.12 | Run the whole tour, Next, Back, Skip and Escape: no dialog appears. |
| Layout | Long item and member names wrap. Edit and × stay visible and tappable at 320px. There's no horizontal page scroll. Desktop rows are unchanged apart from the second line and the actions column. |

## 9. Documentation impact

- **None in the repo.** `docs/mobile-breakpoints.md` stays accurate, because the 620px block is kept.
- **For the documentation-engineer, when the owner asks for a docs update** (Obsidian notes):
  - the user guide's Expenses section: per-item Date and Paid By, the contributions-must-match
    rule, Edit / Save Edits / Cancel, and the leave warning
  - removing a member now also cleans staged items
  - Clear All also clears staged work
  - the split-mode switch keeps the name
  - "N purchases" counts each Multiple Payors item
  - add this spec to the technical-specifications list

## 10. Tasks

1. **Pure logic.**
   - Add `parsePositiveAmount` to `money.ts`.
   - Move `purgeMemberFromItem` to `calculations.ts` and export it.
   - Create `staging.ts` (5.1, 5.2, 5.4, 5.8).
   - Write `staging.test.ts` first and watch it fail, then make it pass.
2. **Save message.** Narrow `saveMessage.ts` (5.7) and update `saveMessage.test.ts`.
3. **Store.**
   - Replace `addRecord` with `addRecords` in `SessionsStoreContext.tsx`, with distinct ascending
     `createdAt`.
   - Import `purgeMemberFromItem` from `calculations`.
   - Update `AppDataContext.tsx` and the `NewPurchaseRecord` comment.
4. **ConfirmDialog.** Add the `cancelLabel` prop.
5. **ExpensesPage.** Own `staged` and `formKey`, report the count, register `beforeunload`, and pass
   `staged` and `onClearAll` to MemberList and `staged`, `setStaged` and `key` to the card.
6. **SessionWorkspace.** Add the guard and the dialog (5.9).
7. **PurchaseItemCard.**
   - Take `staged` and `setStaged` as props.
   - Add stamping, `canAddItem`, the edit state machine (5.5), locks, the member-removal effect, and
     save via `buildRecords` and `addRecords`.
   - Update the split-mode toggle (NQ1).
   - Pass `itemTotal` and `contributed` through `PurchaseDetailsFields` to `PayorModeFields`.
8. **ItemStagingList.** New props, the row markup and the CSS (section 6).
9. **MemberList.** New confirmation conditions and wording, and the `onClearAll` call.
10. **Checks.** Run `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and
    `targets.test.ts`) and `npm run build`. Then run through section 8's tester checks yourself in
    `npm run dev:full` at phone and desktop widths, and report the local URL and branch to the owner.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| Merging Multiple Payors items changes who owes whom | `buildRecords` never merges them. The worked example and the equivalence test prove it. |
| Records from one click come back from the server in a different order (ties on `created_at`) | Each record gets a distinct ascending `createdAt`. A tester checks the order after a reload. |
| Part of a click saved | One `updateSession` means one PUT, and the server replaces the records in one transaction. |
| The leave dialog interrupts the tour | The guard sits only on the user's tab and Back handlers. The tour uses `setScreen` directly, and AC-7.12 is a tester check. |
| Two `beforeunload` listeners removing each other | A separately named handler (5.9). |
| The member-removal effect misses a change, or loops | It works from a diff against `prevMembers` and returns early when nothing was removed. The tester covers removal during an edit. |
| Lifting `staged` breaks the card | The card gets the same `staged` and `setStaged` it used before, only as props. |
| The staging row breaks at 320px | The 620px grid gets a 76px actions column, and long text wraps. Tester check. |
| Users notice "N purchases" grow for Multiple Payors items | This is a necessary result of BR-8. It's listed in section 12 so the owner knows. |

**Size: medium to large.**
- 16 files change and 2 are added. It's all client side, with no schema or API work.
- The most behaviour sits in `PurchaseItemCard`.
- **Risk: medium.** The money logic is the delicate part, and it's isolated in a pure, tested module.

## 12. Decisions for the user

These are my recommendations. None of them blocks the build. Approving the spec accepts all of
them, unless you say otherwise.

1. **How one save becomes records.**
   - One Payor items with the same date and payor share one record, as one save does today.
   - Each Multiple Payors item with two or more contributors gets its own record. BR-8 requires
     that.
   - A Multiple Payors item with a single contributor is filed like a One Payor item, which gives
     the same money and the same "Paid by Ana" card.
   - The visible effect: Home's "N purchases" counts each Multiple Payors item separately.
   - **Alternative:** one record per item for everything. That's slightly less code, but One Payor
     batches would then count every item as a purchase too.
2. **Breakpoint: 620px** for the new staging-row phone styles, matching the file and
   `docs/mobile-breakpoints.md` (section 6).
3. **Desktop row:** the date and payor go on a second line under the item name, rather than in new
   columns. That's the smallest change to the desktop table. The actions column grows to fit Edit
   and ×.
4. **The edited row's own Edit button is also disabled** during an edit. The "Editing" tag and the
   highlight mark the row instead. Q3 only named its ×.
5. **Clear All resets Purchase Details to a fresh form:** today's date, One Payor with no pick,
   Equal Split, and no edit. That's the same as returning to the tab after "Discard and leave". It
   also drops any "Saving…" message on screen, but the save itself continues.
6. **Wording:**
   - The leave dialog says "1 staged item that isn't saved" and "3 staged items that aren't saved".
   - The confirmation texts are in 5.8. Two of them are new for Clear All.
7. **Focus on Edit:** the form scrolls into view. On desktop, focus also moves to Date. On a phone
   it doesn't, so no picker or keyboard opens unasked. When the edit ends, focus returns to the
   row's Edit button.
