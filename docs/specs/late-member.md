# Spec: include a late-joining member in earlier purchases

Status: **draft, waiting for the owner's approval.** Branch `feature-flexible-paid-by`, on top of
the flexible Paid By build (a396b1c..ce36c99). Both features are reviewed, tested and shipped
together.

## 1. Summary

Adding a member to a draft session that has saved Equal Split items opens a dialog, "Include Cy
in earlier items?". It lists those items, grouped as Breakdown groups them, each unticked with
its name and price.

- **Include** adds Cy and makes Cy an owner of the ticked items. Each keeps its price and is
  re-split with today's centavo rule.
- **Skip** adds Cy to nothing, as today.
- **Escape or the backdrop** cancels the add.

The add and the include are one change, saved together or not at all. Payors and contributions
never change.

Source: the business-analyst's requirements,
[`docs/specs/late-member-requirements.md`](late-member-requirements.md) (US-LM1 to US-LM5,
BR-LM1 to BR-LM14). Section 8 of that file records the owner's final answers:

- **LQ1:** Escape or the backdrop cancels the add.
- **LQ2:** removing an included member keeps today's price-shrinking rule.
- **LQ3:** the dialog shows names and prices only.

The owner-approved intake brief is `/Users/rmlescano/.claude/plans/soft-humming-fiddle.md`. The
system-architect was skipped, because there's no data model or API change.

## 2. Layers touched

| Layer | File | Change | Reuses |
|---|---|---|---|
| Types | none | `EqualSplitItem.owners` is already a list. | |
| Schema | none | | |
| API | none | | |
| Pure logic | `src/lib/includeMember.ts` (new) | `ItemRef` and `IncludeGroup` types, `includableGroups`, `includeMember` (section 5). | `groupRecordsForBreakdown`, `compareNames` |
| Client state | `src/context/SessionsStoreContext.tsx` | `addMember` takes an optional `include: ItemRef[]` and applies it in the same `updateSession` as the new member. | `includeMember` |
| Client state | `src/context/AppDataContext.tsx` | `addMember(rawName, include?)` is passed through. | |
| UI | `src/components/home/IncludeMemberDialog.tsx` and `.module.css` (new) | The dialog: list, Select all, Skip and Include. | `ModalDialog`, `ConfirmDialog.module.css`, `Button`, `formatLongDate`, `formatMoney`, `joinNames` |
| UI | `src/components/home/MemberList.tsx` | `submit` runs the duplicate check itself, opens the dialog when anything can be offered, and finishes the add from the dialog's answer. | `includableGroups`, `compareNames` |
| PDF | none | Uses the same records, so it shows the new shares on its own. | |
| Tour | none | Section 7. | |
| Tests | `src/lib/includeMember.test.ts` (new) | Section 8. | |
| Docs | none in the repo | Section 9. | |

## 3. Data model

**None.**
- Including a member only appends a name to an Equal Split item's existing `owners` list.
- The session is saved through the same `PUT /api/sessions/[id]`, whose validation
  (`parseItem` in `src/lib/storage.ts`) already accepts any list of owner names.
- No existing rows are touched until the user includes someone, and then only the ticked items'
  `owners` change.

## 4. API contract

**None.** No route, request shape, validation or status code changes.

## 5. Business logic

All of it lives in `src/lib/includeMember.ts`, a pure module tested on its own. Its imports use
the `.js` suffix, as `staging.ts` does.

### 5.1 Types

```ts
/** One saved item, addressed the way Breakdown addresses it. */
export type ItemRef = { recordId: string; itemId: string };

/** One heading in the dialog: a Breakdown card's date and payors, with its offerable items. */
export type IncludeGroup = {
  key: string;                      // the Breakdown group's key
  date: string;
  payorMode: PayorMode;
  payors: PayorContribution[];      // as the Breakdown card has them (merged, sorted)
  items: (ItemRef & { name: string; price: number })[];
};
```

### 5.2 What the dialog offers (BR-LM2 to BR-LM4)

`includableGroups(records: PurchaseRecord[], members: string[], name: string): IncludeGroup[]`

1. Start from `groupRecordsForBreakdown(records, members)`. That gives Breakdown's own grouping
   (date plus set of payors), its order (newest first, using the default `'desc'`) and its row
   order.
2. In each group, keep a row when both of these hold:
   - `row.item.mode === 'equal'`
   - no owner matches `name` ignoring case (`compareNames(owner, name) !== 0`)
3. Each kept row becomes `{ recordId, itemId: item.id, name: item.name, price: row.total }`.
4. Drop groups left with no rows.
5. A ₱0.00 Equal Split item is still offered (BR-LM3).

The caller treats an empty result as "add at once, no dialog" (BR-LM1, AC-LM1.6, AC-LM1.7).
Staged items are never passed in, so they're never offered (AC-LM1.5).

### 5.3 The re-split (BR-LM9, BR-LM10)

`includeMember(records: PurchaseRecord[], name: string, include: ItemRef[]): PurchaseRecord[]`

- For each record, each item that matches an `include` ref (same `recordId` and `itemId`) is
  replaced by `{ ...item, owners: [...item.owners, name] }`, but only when:
  - the item is still `mode === 'equal'`
  - no owner matches `name` ignoring case
- Anything else is skipped without a message. That covers a ref whose record or item has gone, an
  item that turned into Custom Amounts, and one that already names the member (BR-LM8).
- `totalPrice`, `payors`, `payorMode`, `date`, `createdAt` and the order of items and records stay
  exactly as they were.
- A record with no changed item is returned as the same object, and so is an unchanged item.

Why the money is right:
- **Shares** come from `getItemShares`, unchanged: owners sorted with `compareNames`, then
  `splitEvenly` over the unchanged price. They always add up to the price, and the leftover
  centavos go one each to the first owners alphabetically. That's the Abe and Dan cases in
  Example A.
- **Payors** are untouched.
  - A One Payor record's amount is its items' total, which is unchanged because no price changed.
  - Multiple Payors contributions still add up to the item's price.
- **Summary, netting, the settlement and the PDF** all read the records, so an included item
  behaves exactly as if it had been saved with that owner from the start (BR-LM10). None of that
  code changes.
- An included item stays Equal Split. A later Item Total edit re-splits it across every owner
  (AC-LM3.6), and removing the member shrinks the price by their share (LQ2, BR-LM12). Both use
  existing code.

### 5.4 One write (BR-LM7, US-LM5)

`addMember` in `SessionsStoreContext.tsx` gains an optional third parameter, and its type in the
store value and in `AppDataContext` changes to match:

```ts
addMember: (sessionId: string, rawName: string, include?: ItemRef[]) => boolean;
```

Inside the action:
- The name checks stay exactly as they are: title-case, blank, then a case-insensitive duplicate,
  each returning `false`.
- The updater adds the member and the shares together, which is the one change:

  ```ts
  updateSession(sessionId, (s) =>
    s.members.some((m) => compareNames(m, name) === 0)
      ? s
      : {
          ...s,
          members: [...s.members, name].sort(compareNames),
          // The member and their shares travel in the same change, so they're
          // saved together or not at all (BR-LM7).
          records: include.length > 0 ? includeMember(s.records, name, include) : s.records,
        },
  );
  ```

  `include` defaults to `[]`, so existing calls are unchanged.

What follows from that:
- One `updateSession` call is one `mutateSession`, which is one PUT carrying members and records.
- A failure keeps the change on screen, "Try again" in the banner restores the last saved version, and a reload after
  an unrecoverable failure brings back neither the member nor the shares (AC-LM5.2, AC-LM5.3).
  All of that is existing behaviour.
- The duplicate check inside the updater still covers a name that arrived from another device
  while the dialog was open (BR-LM7).

### 5.5 MemberList's add flow

New state: `const [including, setIncluding] = useState<string | null>(null)`. It holds the
title-cased name while the dialog is open.

```ts
const submit = () => {
  const name = toTitleCase(draft);
  if (!name) { setDraft(''); return; }                       // unchanged
  if (members.some((m) => compareNames(m, name) === 0)) {    // AC-LM1.8: no dialog for a duplicate
    setError(`${name} is already in the group.`);
    return;
  }
  if (includableGroups(records, members, name).length > 0) { setIncluding(name); return; }
  finishAdd(name, []);
};

const finishAdd = (name: string, include: ItemRef[]) => {
  setIncluding(null);
  if (!addMember(name, include)) {                           // re-checked at answer time (BR-LM7)
    setError(`${name} is already in the group.`);
    return;
  }
  setError('');
  setDraft('');
};
```

- **The dialog's groups** come from `includableGroups(records, members, including)` on each
  render while it's open. A background reload then updates the list instead of offering items
  that are gone. BR-LM8 is still enforced by `includeMember`.
- **Its answers:**
  - Include calls `finishAdd(including, ticked)`.
  - Skip calls `finishAdd(including, [])`.
  - Escape or the backdrop calls `setIncluding(null)` and nothing else. The member isn't added and
    the name stays typed (LQ1, AC-LM4.2).
- **The member isn't added before an answer.** "Cy" stays in the box, and the error line is
  untouched while the dialog is open (AC-LM1.1).
- **The duplicate check** is added before the dialog, because `addMember`'s own check would come
  too late to stop it opening. It's the same comparison `addMember` uses.

### 5.6 Fit with flexible Paid By (BR-LM11, BR-LM12)

- **Staging area.** Staged items live in `ExpensesPage` and never reach the store, so neither
  Include nor Skip can touch them.
  - The card's member effect in `PurchaseItemCard.tsx` reacts only to *removed* members, so an
    add changes nothing there.
  - The item in the fields and an open Edit pick up the new member only through a ticked "All
    Members" (`selectedOwners` reads `members` live).
  - The Multiple Payors fields get a blank box for the new member, because `PayorModeFields`
    renders one per member.
  - No code changes in any of these.
- **Removing a member who was included** goes through the existing `removeMember`, which uses
  `purgeMemberFromItem`: the share is taken out and the price shrinks by it (LQ2). The
  confirmation's wording is unchanged: there are saved records, so it says "every saved record".
- **Leave warning.** It counts staged items only, and Include doesn't change them.
  - The dialog is modal, so a tab or Back to Home can't be tapped while it's open.
  - A reload while it's open loses only the unanswered add, which was never saved.
  - Nothing changes.
- **Clear All** after an include clears everything, as today.

## 6. UI

### Group Members (`MemberList`)

There's no layout change. `<IncludeMemberDialog>` is rendered only while `including !== null`, so
it mounts fresh, with nothing ticked, every time it opens (BR-LM5, AC-LM4.3).

### The dialog (`IncludeMemberDialog`)

```ts
type Props = {
  name: string;
  groups: IncludeGroup[];
  onInclude: (include: ItemRef[]) => void;
  onSkip: () => void;
  onCancel: () => void;
};
```

**Shell.** It's built on `ModalDialog` (`src/components/shared/ModalDialog.tsx`), the shared
`<dialog>` shell that Finish Session, Profile and Change already use. That shell gives it:
- `ConfirmDialog`'s look, through `confirmStyles.dialog`
- `showModal` focus trapping
- Escape and a click that starts and ends on the backdrop both call `onCancel`
- on a phone, tracking of the visible viewport

`ConfirmDialog` itself isn't used, because it only takes a plain-text message.

Markup, with class names from `ConfirmDialog.module.css` (`confirmStyles`) and the new module
(`styles`):

```
<ModalDialog labelledBy="include-title" onCancel={onCancel}>
  <div className={`${confirmStyles.body} ${styles.body}`}>
    <h2 id="include-title" className={`${confirmStyles.title} ${styles.title}`}>
      Include {name} in earlier items?
    </h2>
    <p className={confirmStyles.message}>
      Tick the saved items {name} shared. Each keeps its price and is split again with {name}.
    </p>
    <label className={styles.selectAll}>
      <input type="checkbox" ref={selectAllRef} checked={allTicked} onChange={toggleAll} />
      Select all
    </label>
    <div className={styles.list}>
      {groups.map((g) => (
        <section key={g.key} className={styles.group} aria-labelledby={`include-${g.key}`}>
          <h3 id={...} className={styles.groupHead}>{heading(g)}</h3>
          {g.items.map((i) => (
            <label key={...} className={styles.row}>
              <input type="checkbox" aria-label={`${i.name}, ${formatMoney(i.price)}`} ... />
              <span className={styles.name}>{i.name}</span>
              <span className={styles.price}>{formatMoney(i.price)}</span>
            </label>
          ))}
        </section>
      ))}
    </div>
    <div className={confirmStyles.actions}>
      <Button onClick={onSkip}>Skip</Button>
      <Button variant="primary" disabled={tickedCount === 0} onClick={() => onInclude(ticked)}>
        Include
      </Button>
    </div>
  </div>
</ModalDialog>
```

The group `id` is a sanitised one made with `useId()` plus the group's index, because a group key
holds `::` and `|`.

**Behaviour:**
- **Ticks.** `ticked` is a `Set` of `` `${recordId}\u0000${itemId}` `` keys in component state.
  - The counts and the value sent to Include use only keys that are still listed, so an item that
    vanished on a reload is ignored.
  - `allTicked` means everything listed is ticked. `someTicked` means at least one is.
- **Select all** (AC-LM2.2):
  - If `allTicked`, it clears the set. Otherwise it ticks every listed item.
  - Its `indeterminate` is set in an effect (`someTicked && !allTicked`), because React has no
    attribute for it.
- **Row taps.** The whole row is a `<label>`, so a tap anywhere on it toggles the checkbox
  (AC-LM2.1).
- **Screen readers.** Each checkbox's `aria-label` is "Hotel, ₱900.00" (AC-LM2.4).
- **Include** is disabled with nothing ticked (BR-LM6, AC-LM2.3).
- **Skip** ignores any ticks (AC-LM4.1).
- **Group headings** read `${formatLongDate(g.date)} · Paid by ${payorNames}`. `payorNames` is the
  single payor's name, or `joinNames(g.payors.map((p) => p.member))` for Multiple Payors, such as
  "Ana and Ben". Contribution amounts aren't shown (section 12).
- **Focus.** `showModal` focuses the first focusable element, which is Select all, as the shell
  already does.

**Styles** (`IncludeMemberDialog.module.css`).
- **Layout.** The dialog keeps `ConfirmDialog`'s width, which is `min(26rem, 100vw - 2rem)`, so
  288px at 320px with no horizontal scroll. Only the list scrolls:

  ```css
  .body {
    /* The title, Select all and the buttons stay put, and only the list scrolls.
       The cap keeps the whole dialog inside the visible screen, and the
       visible height comes from ModalDialog's viewport tracking on a phone. */
    max-height: calc(100vh - 2rem - 8px);
    max-height: calc(var(--visible-height, 100dvh) - 2rem - 8px);
    min-height: 0;
  }
  .title { overflow-wrap: anywhere; }   /* a very long new name wraps in the title */
  .list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    border-block: 1px solid var(--border);
    margin-inline: -22px;               /* full-bleed inside .body's 22px padding */
    padding: 4px 22px;
  }
  ```

  `.body` is already a flex column from `confirmStyles.body`. The `--visible-height` variable is
  set on the dialog element and inherited.
- **Desktop.** On a desktop screen the cap is far above a normal list, so the dialog looks like
  `ConfirmDialog`. A very long list scrolls inside the same frame.
- **Select all and rows** copy MePicker's `.option` pattern:
  - `display: flex; align-items: center; gap: 10px; min-height: 32px; font-size: 13px; cursor: pointer`
  - the input at 16px with `accent-color: var(--accent)`
  - Select all also gets `font-weight: 500`
- **Row parts.**
  - `.name { flex: 1; min-width: 0; overflow-wrap: anywhere; }`
  - `.price { flex: none; font-family: var(--mono); font-size: 12px; white-space: nowrap; }`

  The checkbox and price never get pushed out by a long name.
- **Group headings.**
  - `.groupHead { font-size: 11px; font-weight: 600; color: var(--text2); margin-top: 10px; overflow-wrap: anywhere; }`
  - The first group's heading has no top margin.
- **Phone**, mobile-only: `@media (max-width: 640px) { .row, .selectAll { min-height: 44px; } }`.
  It follows the 640px rule in CLAUDE.md, since this is a new file with no older breakpoint.

## 7. Onboarding tour impact

**None.**
- No `data-tour` attribute is added, moved or renamed.
- `MemberList` and the new dialog have no targets.
- The tour's session is created fresh and never has saved purchases, so `includableGroups` is
  empty and a member added during the tour goes straight in with no dialog (BR-LM13).
- The overlay blocks Group Members anyway.
- `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

Vitest runs in `node`, and only `src/**/*.test.ts`. Component behaviour is checked by the
ui-ux-tester.

### Unit tests: `src/lib/includeMember.test.ts` (new)

Write these first. They fail until `includeMember.ts` exists.

**`includeMember`: the analyst's worked examples come first (BR-LM9)**

- **Example A, Dan.**
  - Setup: Taxi ₱100.00, Equal Split between Ben and Cy, paid by Ben.
  - Including Dan gives the shares Ben 33.34, Cy 33.33, Dan 33.33, still adding up to 100.
  - In `getRawOwedMatrix`, Cy owes Ben 33.33 and Dan owes Ben 33.33.
- **Example A, Abe.**
  - Same setup, including Abe instead.
  - The shares are Abe 33.34, Ben 33.33, Cy 33.33.
  - Abe owes Ben 33.34, and Cy owes Ben 33.33.
- **Example B.**
  - Setup: Dinner ₱1,000.00, Equal Split between Ana, Ben and Cy, in a Multiple Payors record
    paid Ana 600 / Ben 400.
  - Before the include, Cy owes Ana 200 and Ben 133.33.
  - Including Dan gives 250 each, and the payors stay deep-equal to Ana 600 / Ben 400.
  - After the include, Cy owes Ana 150 and Ben 100, and Dan owes Ana 150 and Ben 100.
- **AC-LM3.1.**
  - Hotel ₱900.00 between Ana, Ben and Dan becomes 225 each with Cy included.
  - `totalPrice` stays 900.
- **Payors unchanged (AC-LM3.3).**
  - On a One Payor record with two items where one is included, `payors` is the same reference
    and its amount still equals `getRecordTotal`.
- **Only what was ticked changes (AC-LM3.5).**
  - Unticked items are the same objects, and so are records with nothing ticked.
  - `date`, `createdAt`, the item order and the record order are unchanged.
- **It stays Equal Split (AC-LM3.6).** The included item still has `mode: 'equal'`.
- **Skipped without a message (BR-LM8):**
  - a ref to a Custom Amounts item
  - a ref whose record or item is missing
  - an item that already has the owner "cy" in a different case
- **The ₱0.00 item (BR-LM3).** Including it gives a share of 0 and changes no balance.
- **The removal rule (LQ2, BR-LM12).**
  - Include Cy in the ₱900 hotel, then apply `purgeMemberFromItem` for Cy.
  - The price becomes 675, at 225 each for the remaining three.
- **Breakdown agrees.**
  - After an include, `groupRecordsForBreakdown` shows Cy's total on the card.
  - The card's `grandTotal` is unchanged.

**`includableGroups` (BR-LM2 to BR-LM4)**

- **No records** gives `[]` (AC-LM1.6).
- **Only Custom Amounts records** gives `[]` (AC-LM1.7).
- **A mix** lists only the Equal Split items. A group whose items are all Custom Amounts is
  dropped (AC-LM1.4).
- **Order.** Groups come newest date first and match the order of `groupRecordsForBreakdown`'s
  keys. Rows keep Breakdown's row order (BR-LM4).
- **Names already there.** An item already owned by the name, in any case, isn't listed.
- **₱0.00 items** are listed with price 0.
- **Every-member items** (the "All Members" case) are listed.

### Existing tests that must still pass

- `staging.test.ts`, `calculations.test.ts` and `saveMessage.test.ts`.
- `steps.test.ts` and `targets.test.ts`.
- Everything else under `npm test`.

### ui-ux-tester checks

Run each check at 320px, 390px and desktop width, in `npm run dev:full`. Both features are
reviewed and tested together.

| AC | Check |
|---|---|
| AC-LM1.1 to 1.5 | With saved Equal Split and Custom items, adding "Cy" opens the dialog with the right title. Only the Equal Split items are listed, under Breakdown-style headings, newest first, all unticked. Staged items aren't listed. Cy isn't in Group Members yet, and "Cy" stays typed. |
| AC-LM1.6 to 1.8 | An empty session, or one with only Custom items, adds at once. A blank name does nothing. A duplicate ("cy") shows "Cy is already in the group." with no dialog. |
| AC-LM2.1 to 2.4 | A tap anywhere on a row toggles it. Select all ticks everything, then clears it, and shows its partial state. Include is disabled with nothing ticked. A screen reader reads "Hotel, ₱900.00". |
| AC-LM3.1 to 3.6 | Include: Hotel stays ₱900.00 at ₱225.00 each, and payor badges are unchanged. Summary and the PDF match Examples A and B. Unticked items show "—" for Cy. A later Item Total edit re-splits across four. |
| AC-LM4.1 to 4.3 | Skip adds Cy and nothing else changes. Escape, and a tap on the backdrop, add nothing and keep "Cy" typed. Adding again reopens the dialog with nothing ticked. |
| AC-LM5.1 to 5.3 | With the network blocked, Include shows the banner, and "Try again" restores the last saved version, with neither the member nor the shares. After a reload where the save didn't land, neither is there. |
| BR-LM11 | With staged items and an open Edit, adding a member through Include or Skip leaves the staged rows unchanged. The leave warning still counts them. An edit with All Members ticked picks the member up on Save Edits. |
| BR-LM12 | Removing an included member shrinks the hotel to ₱675.00 at ₱225.00 each. |
| BR-LM13 | Run the whole tour. A member added during it gets no dialog. |
| Phone layout | With about 15 items, at 320px: the title, Select all, Skip and Include stay on screen and only the list scrolls. Rows are at least 44px tall. Long item and member names wrap. There's no horizontal scroll. |
| Desktop | The dialog looks like the other confirmation dialogs. |

## 9. Documentation impact

- **None in the repo.**
- **For the documentation-engineer, when the owner asks** (Obsidian notes):
  - the user guide's Group Members section: the "Include … in earlier items?" prompt, Skip, and
    that Escape cancels
  - that an included item keeps its price and is re-split
  - that removing an included member shrinks the price
  - add this spec to the technical-specifications list

## 10. Tasks

1. **Pure logic.** Write `src/lib/includeMember.test.ts` with the worked examples first and watch
   it fail. Then write `src/lib/includeMember.ts` (5.1 to 5.3) and make it pass.
2. **Store.** Give `addMember` the optional `include` parameter in `SessionsStoreContext.tsx`,
   covering the type, the implementation and the `useCallback` body (5.4). Pass it through in
   `AppDataContext.tsx`.
3. **Dialog.** Write `IncludeMemberDialog.tsx` and `IncludeMemberDialog.module.css` (section 6).
4. **MemberList.** Add the `including` state, the duplicate check before the dialog, `finishAdd`,
   and the dialog's mounting (5.5).
5. **Checks.** Run `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and
   `targets.test.ts`) and `npm run build`. Then run through section 8's tester checks yourself in
   `npm run dev:full` at phone and desktop widths, and report the local URL and branch to the owner.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| The member is saved without their shares, or the reverse | One `updateSession`, so one PUT, with members and records in the same body. This is existing write machinery. |
| A share changes someone else's money unexpectedly | The price is unchanged, `getItemShares` is unchanged, and payors are untouched. Examples A and B are unit-tested against `getRawOwedMatrix`. |
| A stale list after a background reload | The list is recomputed on each render, and `includeMember` re-checks every ref (BR-LM8). |
| The dialog grows past a phone screen | `.body` is capped to the visible height, and only `.list` scrolls. Tester check at 320px. |
| Duplicate logic drifts | MemberList's pre-check uses the same `compareNames` test as `addMember`, which still re-checks inside its updater. |
| The tour breaks | Nothing tour-facing changes, and the tour's session has no records. Both tour tests run. |

**Size: small to medium.**
- One new pure module with its tests, one new dialog component, and small changes in three files.
- **Risk: low.** The money path reuses existing share and settlement code unchanged.

## 12. Decisions for the user

These are my recommendations. None of them blocks the build. Approving the spec accepts all of
them, unless you say otherwise.

1. **The dialog is built on `ModalDialog`**, the shared shell already used by Finish Session,
   Profile and Change. It gives the dialog `ConfirmDialog`'s look and its Escape and backdrop
   behaviour. `ConfirmDialog` itself isn't changed.
2. **Group headings name the payors without amounts**, for example "November 12, 2026 · Paid by
   Ana and Ben". Breakdown's badge shows the contribution amounts too, but they don't help choose
   items, and they crowd a heading at 320px.
3. **Wording:**
   - Title: "Include Cy in earlier items?"
   - Message: "Tick the saved items Cy shared. Each keeps its price and is split again with Cy."
   - Buttons: Skip, then Include. Include is the filled button.
4. **`addMember` gains an optional `include` list** rather than a second, near-identical store
   action. The name checks then live in one place, and existing callers don't change.
5. **The list stays live while the dialog is open.** If a background reload changes the saved
   items, the list follows, and only items still listed can be included.
6. **Focus.** The dialog opens with focus on Select all, which is the shell's default. After Skip
   or Include, focus isn't moved back to the name box. That matches the app's other dialogs.
