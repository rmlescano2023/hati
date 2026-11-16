# Spec: bill UX polish, round 2, and a PDF fix

Status: **final, no approval stop.** The owner's decisions are the requirements, and the build
follows this spec directly. Where the owner left something open, the recommendation below is the
decision, and it's listed in section 12. Branch `feature-bill-ux-polish-2`, from `origin/main` at
`fa693d3` (PR #145 merged).

## 1. Summary

Five small changes and one PDF fix that follow [`bill-ux-polish.md`](bill-ux-polish.md) (PR #145).
None of them changes a money rule, the stored data or the API.

1. **PDF payor matrix:** amounts in "Amounts Owed to Each Payor" shrink to fit their column, so they
   no longer run together ("13,945.6751,600.00…").
2. **Fill Remainder explained:** while Total Amount follows Entered, a muted line under the box
   reads "Matches Entered. Type a total to use Fill Remainder.", and Fill Remainder's tooltip says
   the same.
3. **Floor warning on phones:** no code change. The floor hint already sits directly above the
   footer.
4. **A3 landscape from 17 members:** the PDF's breakdown page is A3 landscape from 17 members. The
   first page stays portrait A4.
5. **Tappable Equal Split hint:** the hint's second sentence becomes a link-styled button. It
   switches to Custom Amounts with the price as one shared order for everyone and one empty
   discount.
6. **"Edit item" dialog:** its message gains "Cancel brings you back to Breakdown."

Source: the owner's decisions, passed on by the coordinating session. The business-analyst was
skipped on purpose. The rules this changes are marked as amended by this spec:

- In [`custom-split-adjustments-requirements.md`](custom-split-adjustments-requirements.md):
  BR-CA32 (item 5), BR-CA35 (items 1 and 4) and BR-CA38 (item 2).
- In [`custom-orders-requirements.md`](custom-orders-requirements.md): BR-CO25 (item 6).

Out of scope: money rules, other layout changes, the onboarding tour and new dependencies.

### Assumptions

- **A1.** "Large amounts" in item 1 means anything `formatAmount` prints, up to `1,234,567.89`
  (12 characters).
- **A2.** Item 5's "Everyone ticked" means the shared order's own "Everyone" pill (BR-CA21). It
  covers every member picked in the item, so it includes "All Members" when that's ticked.
- **A3.** Item 5 behaves the same whether or not an edit is open, as the mode toggle does (BR-CO4).

## 2. Layers touched

| Layer | File | Change | Items |
|---|---|---|---|
| PDF | `src/pdf/layout.ts` | New pure `breakdownPage(memberCount)`. The page constants move here | 4 |
| PDF | `src/pdf/SoaDocument.tsx` | Breakdown page from `breakdownPage`. Matrix amount cells through `fitMonoFontSize`. `OwedMatrixSection` is exported for its test | 1, 4 |
| Pure logic | `src/lib/orderLines.ts` | New pure `billForOneDiscount(price)` | 5 |
| Client state | `src/components/home/ItemModeFields.tsx` | `ItemDraftHandlers.switchForDiscount`. Passes `totalFollows` and `onSwitchForDiscount` down | 2, 5 |
| Client state | `src/components/home/PurchaseItemCard.tsx` | The `switchForDiscount` handler, and a focus effect | 5 |
| UI | `src/components/home/CustomAmountFields.tsx` and `.module.css` | The follow line and tooltip. An `id` on each receipt row's name box | 2, 5 |
| UI | `src/components/home/EqualSplitFields.tsx` and `.module.css` | The hint's button | 5 |
| UI | `src/components/layout/SessionWorkspace.tsx` | The dialog message, as an exported constant | 6 |
| Tests | `layout.test.ts`, new `src/pdf/SoaDocument.test.ts`, new `src/pdf/pdfTree.testutil.ts` (moved out of `TransactionTable.test.ts`), `orderLines.test.ts`, `CustomAmountFields.test.ts`, `EqualSplitFields.test.ts`, `ClearableInput.test.ts` (fixture only), new `src/components/layout/SessionWorkspace.test.ts` | Section 8 | all |
| Docs | `custom-split-adjustments-requirements.md`, `custom-orders-requirements.md` | Amendment notes, committed with this spec | 1, 2, 4, 5, 6 |

Types (`src/types/index.ts`), schema, API, `src/lib/calculations.ts`, `src/lib/money.ts`,
`TransactionTable.tsx`, `styles.ts`, Breakdown and the tour: **none.**

## 3. Data model

None. Item 5 builds a draft that's stamped and stored the way any Custom item with a shared order
and a discount already is.

## 4. API contract

None.

## 5. Business logic

No money rule changes.

- `fitMonoFontSize` (item 1) and `breakdownPage` (item 4) only change PDF sizes.
- `billForOneDiscount` (item 5) only fills the form. Its shared order is split by the existing
  `billAmounts` (BR-CA3, BR-CA15). That gives every member exactly the share Equal Split gave them,
  because both use `splitEvenly` over the members sorted by `compareNames`. For example, ₱1,000.00
  over Ana, Ben and Cy gives ₱333.34, ₱333.33 and ₱333.33 either way.
- Item 5's price is read with `parsePositiveAmount` (the existing `num`), as the mode toggle reads
  it. Blank, 0, negative or unreadable means "no price".

## 6. UI and PDF, item by item

### Item 1: the payor matrix fits its amounts

`src/pdf/SoaDocument.tsx`, `OwedMatrixSection`. In the `members.map` for each payor row:

```tsx
const amount = member === payor ? -1 : (matrix[payor]?.[member] ?? 0);
const text = amount < 0 ? '—' : formatAmount(amount);
return (
  <Text
    key={member}
    style={[
      styles.cellNum,
      { width: memberWidth },
      amount > EPSILON ? styles.owes : styles.muted,
      // Shrinks only an amount that would run into the next column, as the breakdown
      // tables do (BR-CA35). 7.5 is `cellNum`'s size.
      { fontSize: fitMonoFontSize(text, memberWidth, 7.5) },
    ]}
  >
    {text}
  </Text>
);
```

- Import `fitMonoFontSize` from `./layout`. Don't move or export `fitted` from
  `TransactionTable.tsx`: one inline call is simpler than a shared helper.
- `styles.owes` is weight 500 (DMMono-Medium), which advances 0.6 em per glyph as Regular does, so
  `fitMonoFontSize` holds for it (checked in PR #145).
- `memberWidth` stays `(usableWidth - 92) / Math.max(1, members.length)`.
- Add `export` to `function OwedMatrixSection`, for its test. Nothing else imports it.

What changes (the matrix's member column has 6pt of padding, as every number cell does):

| Members, page | Matrix column | `1,600.00` | `13,945.67` | `1,234,567.89` |
|---|---|---|---|---|
| 5, A4 portrait | 84.66pt | 7.5 | 7.5 | 7.5 |
| 16, A4 landscape | 41.87pt | **7.4** (runs over today) | **6.6** (runs over today) | **4.9** |
| 17, A3 landscape (item 4) | 59.91pt | 7.5 | 7.5 | **7.4** |
| 24, A3 landscape | 42.44pt | 7.5 | **6.7** | **5.0** |

Anything that fits keeps 7.5pt, so no matrix that prints correctly today changes. The owner's
example, 17 members on A4 landscape (39.41pt), can't happen after item 4. Without item 4 it would
print `13,945.67` at 6.1pt.

**Header cells: no change.**

- The matrix header (`Payor`, then one cell per member) holds names, in DM Sans Bold at 6.5pt,
  upper case, with 0.5pt letter spacing. It has no amounts, so nothing in it runs together the way
  the amounts did.
- `fitMonoFontSize` can't size it, because DM Sans isn't monospaced.
- A name wraps at its spaces. A3 from 17 members gives each header at least 59.91pt here (53.91pt
  for text). I measured DM Sans Bold: "CHRISTOPHER" is 50.0pt and "ALEXANDRA" 43.5pt, so both fit.
- A single word wider than its column still runs over, as it does today, in both the matrix and the
  breakdown table headers. For example, "ALEXANDRA" in a 41.87pt column at 16 members. That's a
  separate layout change and outside this round (see section 12, D1).

### Item 2: Fill Remainder explained while Total Amount follows

`src/components/home/CustomAmountFields.tsx`:

- A module constant:

  ```ts
  /** Under Total Amount while it follows Entered (bill-ux-polish-2 item 2), and Fill Remainder's tooltip then. */
  const FOLLOW_NOTE = 'Matches Entered. Type a total to use Fill Remainder.';
  ```

- A new prop `totalFollows: boolean`, documented "True while Total Amount follows Entered after
  Edit (`ItemDraft.totalFollows`)." `ItemModeFields` passes `totalFollows={draft.totalFollows}`.
- Wrap the existing `.topRow` div in `<div className={styles.totalGroup}>`. After `.topRow`, inside
  the wrapper:

  ```tsx
  {totalFollows && (
    <p id="custom-total-follows" className={styles.helper}>
      {FOLLOW_NOTE}
    </p>
  )}
  ```

  - `.helper` already exists: 12px, `--text3`. It's the Discounts and Charges helper line's style.
- On the Total Amount `ClearableInput`, add
  `aria-describedby={totalFollows ? 'custom-total-follows' : undefined}`. `ClearableInput` spreads
  it onto the `<input>`. A screen reader reads the line with the box's name and value. The
  attribute is there only while the line is, so it never points at a missing id.
- Fill Remainder's `title`:
  `canFill ? <today's "Split …"> : totalFollows ? FOLLOW_NOTE : 'Enter a total amount and leave at least one member blank'`.
  - While following, `canFill` is always false, because the remainder is ₱0.00. So the tooltip is
    `FOLLOW_NOTE` for the whole time the line shows.

`CustomAmountFields.module.css`, outside any media query, next to `.topRow`:

```css
/* Total Amount's row and, while the box follows Entered, the line that says so. The line sits
   5px under the box, as a label sits above its box. */
.totalGroup {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
```

When it shows and goes away:

- It shows from the moment Edit loads a Custom item (`draftFromItem` sets `totalFollows: true`),
  for both Edit paths.
- It goes as soon as the user types in the box or presses its ↺. Both go through
  `handlers.setTotalAmount`, which already sets `totalFollows: false`.
- It's also gone after any reset (`EMPTY_DRAFT`): Add Item, Save Edits, Cancel and a mode switch.
- It shows whenever the box follows, even when the box is empty because Entered is ₱0.00 or less.
  Entered and the box still match then, so the line stays true.
- It isn't a live region. It appears with the form that Edit loads and goes when the user types,
  and neither moment needs an announcement.

Layout:

- **Desktop:** the line sits under the 220px box, left-aligned, on one line that runs on under Fill
  Remainder. It isn't inside `.totalField`: `.topRow` aligns its children to the bottom, so a
  taller field would push Fill Remainder down to the line instead of the box.
- **Phone (≤ 640px):** the line spans the card's width under the row (the box plus Fill
  Remainder), and wraps to two lines at 320px. There are no phone-only rules.
- With the line hidden, the wrapper has one child, so nothing on screen moves.

### Item 3: floor warning on phones

**No code change.** In `CustomAmountFields.tsx`, `{billView.floorHint && <p …>}` is the element
rendered directly before `{footer}`. So at every width the floor hint sits directly above the
Subtotal/Discounts/Charges/Entered lines, below the "+ Add" row. The ui-ux-tester confirms it at
320px (section 8.2, check 6).

### Item 4: A3 landscape from 17 members

`src/pdf/layout.ts`. Add:

```ts
/** Paper sizes in points, as react-pdf has them: [short side, long side]. */
const A4 = [595.28, 841.89] as const;
const A3 = [841.89, 1190.55] as const;
/** `styles.page` pads 40pt on the left and the right. */
const H_MARGIN = 80;

export type BreakdownPage = {
  size: 'A4' | 'A3';
  orientation: 'portrait' | 'landscape';
  /** What the tables can use: the page's width less its padding. */
  usableWidth: number;
};

/**
 * The breakdown page's paper: portrait A4 up to 5 members, landscape A4 up to 16, and landscape
 * A3 from 17 (bill-ux-polish-2 item 4), so wide member lists get readable columns.
 */
export function breakdownPage(memberCount: number): BreakdownPage {
  if (memberCount <= 5) {
    return { size: 'A4', orientation: 'portrait', usableWidth: A4[0] - H_MARGIN };
  }
  if (memberCount <= 16) {
    return { size: 'A4', orientation: 'landscape', usableWidth: A4[1] - H_MARGIN };
  }
  return { size: 'A3', orientation: 'landscape', usableWidth: A3[1] - H_MARGIN };
}
```

`src/pdf/SoaDocument.tsx`:

- Remove `A4_WIDTH`, `A4_HEIGHT`, `H_MARGIN` and `needsLandscape`. They have no other use.
- Replace the `landscape` and `breakdownWidth` lines with:

  ```ts
  const page = breakdownPage(sortedMembers.length);
  const breakdownWidth = page.usableWidth;
  ```

- `columns` stays `computeColumnWidths(sortedMembers.length, breakdownWidth)`, and the matrix keeps
  `usableWidth={breakdownWidth}`. Both now follow the paper.
- The breakdown page becomes
  `<Page size={page.size} orientation={page.orientation} style={styles.page}>`.
- The first page stays `<Page size="A4" style={styles.page}>`, portrait.
- The footer is `position: absolute` with `left`/`right` 40, so it follows the page width with no
  change. A mixed-size PDF is valid, and react-pdf sizes each `Page` on its own.

The exact sizes:

| Paper | Points (width × height as printed) | Usable width |
|---|---|---|
| A4 portrait (first page; breakdown up to 5) | 595.28 × 841.89 | 515.28 |
| A4 landscape (breakdown 6 to 16) | 841.89 × 595.28 | 761.89 |
| A3 landscape (breakdown from 17) | 1190.55 × 841.89 | 1110.55 |

These are react-pdf's own sizes (`@react-pdf/layout`: `A3: [841.89, 1190.55]`).

**Do the fitted sizes go back to full?** Yes, at 17 members, for every realistic amount:

- `computeColumnWidths(17, 1110.55)` gives item 130pt, price 58pt and member **54.27pt** (it was
  34pt on A4 landscape). That leaves 48.27pt for text.
- Item and Total rows at 7.5pt fit up to 10 characters, so `123,456.78` prints at full size.
  `5,145.26` goes from 5.8pt back to **7.5pt**, and `12,345.67` from 5.1pt to **7.5pt**.
- Sub-rows at 7pt fit up to 11 characters, so `−1,234.56` goes from 5.1pt to **7pt**.
- The matrix's column is 59.91pt (item 1's table).
- As the member count grows on A3, the columns narrow again:
  - A four-digit share (`5,145.26`) keeps 7.5pt up to 21 members in the tables and 24 in the matrix.
  - From 28 members the tables reach their 34pt minimum again, and `fitMonoFontSize` shrinks
    amounts as it does on A4 landscape today. Nothing ever overflows.

### Item 5: tappable Equal Split hint

**The control.** `EqualSplitFields.tsx`. A new prop `onSwitchForDiscount: () => void`, documented
"Switches the item to Custom Amounts with its price as a shared order and an empty discount
(bill-ux-polish-2 item 5)." The hint becomes:

```tsx
{members.length > 0 && selectedCount > 0 && (
  <p className={styles.hint}>
    Need a discount for one person?{' '}
    <Button
      variant="ghost"
      size="sm"
      className={`link-action ${styles.hintLink}`}
      onClick={onSwitchForDiscount}
    >
      Switch to Custom Amounts and add a shared order.
    </Button>
  </p>
)}
```

- It's a `<button>` (`Button` defaults `type="button"`), not a link, because it changes the form
  rather than going anywhere. It reuses the global `link-action` class (`global.css`), the
  link-styled ghost button that "Change" on Collection and "Add a name" on Profile use.
- **Accessible name:** its visible text, "Switch to Custom Amounts and add a shared order.". There's
  no `aria-label`. The visible text is the whole name, so speech input works. A longer label that
  promised a shared order would be wrong when there's no price.
- The period sits inside the button. On phones the button takes its own line (below), where a
  period outside it would wrap onto a line by itself.
- The wording of the whole hint is unchanged. Keep the existing comment above it, and add one line:
  "Tapping it does that switch for the user (bill-ux-polish-2 item 5)."
- It still shows only while at least one member is picked.

`EqualSplitFields.module.css`. Add after `.hint`:

```css
/* The hint's action, inside the sentence like a link. The selector outranks Button's .btn, .sm
   and .ghost (0,1,0), which would pad it, keep it on one line and give it a border. */
.hint > .hintLink {
  display: inline;
  padding: 0;
  border: 0;
  font-size: inherit;
  line-height: inherit;
  white-space: normal;
  text-align: left;
}

/* Its own line on phones, so it's a 44px tap target without stretching the sentence's line. */
@media (max-width: 640px) {
  .hint > .hintLink {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    min-height: 44px;
  }
}
```

- **Desktop:** one sentence, 12px, with "Switch to … shared order." in `link-action`'s
  `--accent-text` and underlined. Hover and focus are the existing ghost and `button:focus-visible`
  styles, as on the other link-actions. Nothing else on the form moves.
- **Phone:** "Need a discount for one person?" on one line, then the button on its own line, at
  least 44px tall, left-aligned. Its text wraps inside it at 320px. (0,2,0) outranks Button's
  phone `min-height: 38px` on `.btn`, `.sm` and `.ghost`.

**Wiring.**

- `ItemDraftHandlers` (`ItemModeFields.tsx`) gains `switchForDiscount: () => void`.
- `ItemModeFields` passes `onSwitchForDiscount={handlers.switchForDiscount}` to `EqualSplitFields`.

**The receipt it starts.** `src/lib/orderLines.ts`, after `addBillRow`:

```ts
/**
 * What the Equal Split hint's switch starts the receipt with (bill-ux-polish-2 item 5): the price
 * as one unnamed shared order on "Everyone", when there is a price, then one empty discount with
 * nobody ticked (BR-CA22), ready for the person who gets it.
 */
export function billForOneDiscount(price: number): BillDraft {
  const shared =
    price > 0
      ? setBillRow(addBillRow(EMPTY_BILL_DRAFT, 'shared'), 'shared', 0, {
          amount: price.toFixed(2),
        })
      : EMPTY_BILL_DRAFT;
  return addBillRow(shared, 'discounts');
}
```

It reuses `addBillRow`, which already starts a shared order on "Everyone" and a discount on nobody.

**The handler.** In `PurchaseItemCard.tsx`, `handlers`:

```ts
// The Equal Split hint's switch: like the mode toggle it keeps the name and who is in the
// item, but the price becomes one shared order rather than equal shares in each member's
// lines, and an empty discount is added for the user to fill (bill-ux-polish-2 item 5).
switchForDiscount: () => {
  setDraft((d) => ({
    ...EMPTY_DRAFT,
    mode: 'custom',
    name: d.name,
    owners: d.owners,
    allSelected: d.allSelected,
    bill: billForOneDiscount(num(d.price)),
  }));
  dispatch({ type: 'clearValidation' });
  focusDiscount.current = true;
},
```

**Focus.** Add next to `restoreFocusTo`:

```ts
// Set by the Equal Split hint's switch. Its button unmounts with Equal Split, so focus goes
// to the new discount's name box instead of being dropped on the page.
const focusDiscount = useRef(false);
```

And an effect, next to the one that restores focus after an edit:

```ts
useEffect(() => {
  if (draft.mode !== 'custom' || !focusDiscount.current) return;
  focusDiscount.current = false;
  document.getElementById('custom-discounts-1-name')?.focus();
}, [draft.mode]);
```

- In `CustomAmountFields.tsx`, the receipt row's name `ClearableInput` gets
  `id={`custom-${section}-${n}-name`}`. That's `custom-shared-1-name`, `custom-discounts-1-name`,
  and so on, following `custom-${section}-label`. The ids are unique, because only one
  `CustomAmountFields` is ever mounted. They're on every row, so no section is a special case.
- Focus moves on every pointer type. The user asked for the discount, the button they pressed is
  gone, and the name box is the next thing to fill. `focus()` scrolls the row into view, which on
  a phone with many members brings the Discounts section on screen.
- The name box comes first because it's the first control in the row. The picker under it is next
  in tab order.

**The result**, for `members` Ana, Ben, Cy with all three picked and price `1000`:

| | Result |
|---|---|
| Mode | Custom Amounts |
| Name | Kept |
| Who's in this item | Kept, "All Members" too |
| Total Amount | Empty, and not following (`totalFollows: false`), so no item 2 line and no "of ₱Y" |
| Each member's own order line | One empty line (no `lines` entry, BR-CO5). Not the equal shares of BR-CO4 |
| Shared orders | One row: name empty, price `1000.00`, "Everyone" ticked. It reads "Shared order" in pills, Breakdown and the PDF (BR-CA35, BR-CA36) |
| Discounts | One row: name and amount empty, nobody ticked, no hint (an empty row blocks nothing, BR-CA28) |
| Charges | None |
| Shares and footer | Ana ₱333.34, Ben ₱333.33, Cy ₱333.33, beside each name (BR-CA31). Footer "Entered ₱1,000.00" alone (BR-CA30) |
| Add Item | Allowed when the name, date and Paid By are, as for any valid item |
| Focus | The discount's name box |

With **no price** (empty, 0, negative or unreadable): the same, but no shared order. The
Discounts section has its one empty row, Entered is ₱0.00, and Add Item stays disabled until an
order is priced (BR-CA18).

**Shared order name: unnamed (D6).** The item name is already above it, and "Shared order" is the
fallback label everywhere. A copy of the item name would read twice in the pills ("Dinner (shared)"
under "Dinner").

**The mode toggle is unchanged.** Equal Split → Custom Amounts through the toggle still spreads the
price into each member's first line and puts it in Total Amount (BR-CO4, BR-CA32).

### Item 6: the "Edit item" dialog

`src/components/layout/SessionWorkspace.tsx`. A module constant above the component:

```ts
/** The "Edit item" prompt's message (BR-CO25, amended by bill-ux-polish-2 item 6). */
export const EDIT_ITEM_MESSAGE =
  'It opens on the Expenses tab with its date and Paid By. Breakdown keeps it as it is until you press Save Edits. Cancel brings you back to Breakdown.';
```

The second `ConfirmDialog` takes `message={EDIT_ITEM_MESSAGE}`. Nothing else changes.

- `endSavedEdit` already does what the sentence says: the Expenses tab's Cancel calls
  `onSavedEditEnd(false)`, which sets the tab to `'breakdown'`.
- The dialog's own Cancel also leaves the user on Breakdown, so the sentence holds for either
  Cancel.
- The lint rule `react-refresh/only-export-components` allows the constant (`allowConstantExport`).
- The message wraps inside the dialog at 320px, as long messages do now.

## 7. Onboarding tour impact

**None.**

- No `data-tour` attribute is added, moved, renamed or duplicated. `src/components/home` and
  `src/pdf` have none. `SessionWorkspace.tsx` has `workspace-back`, which isn't touched (checked
  with grep).
- No step changes. The tour never opens Custom Amounts, the Edit prompt or the PDF.
- The hint's button appears only once a member is picked, and no step points into the item fields.
- `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

The Vitest environment is `node`, so component state and focus are the ui-ux-tester's. Every new
case fails first.

### 8.1 Unit tests

- **`src/pdf/layout.test.ts`: L-3, `breakdownPage` (item 4)**
  - 0 and 5 members: `{ size: 'A4', orientation: 'portrait' }`, `usableWidth` ≈ 515.28 (use
    `toBeCloseTo(…, 2)`).
  - 6 and **16**: `A4`, `landscape`, ≈ 761.89.
  - **17** and 30: `A3`, `landscape`, ≈ 1110.55.
  - Sizes back to full at 17: with `w = computeColumnWidths(17, breakdownPage(17).usableWidth).member`,
    `w` ≈ 54.27, `fitMonoFontSize('5,145.26', w, 7.5)` and `('12,345.67', w, 7.5)` are 7.5, and
    `('−1,234.56', w, 7)` is 7.
- **`src/pdf/pdfTree.testutil.ts` (new, test-only)**
  - Move `StyleValue`, `flatten`, `includes`, `textOf`, `Cell`, `textCells` and `monoCells` out of
    `TransactionTable.test.ts` unchanged, and export them.
  - `TransactionTable.test.ts` imports them. Its cases don't change. It keeps `cellsFor(17, 761.89)`,
    which still tests the 34pt columns that A3 reaches again from 28 members.
  - The name doesn't match Vitest's `src/**/*.test.ts`, so it isn't run as a test, and no app code
    imports it.
- **`src/pdf/SoaDocument.test.ts` (new)**
  - **M-PDF, the matrix fit (item 1).**
    - Call `OwedMatrixSection({ matrix, members, usableWidth })` as a function, and walk it with
      `textCells`.
    - Fixture: members `P01` to `Pnn`. `P01` is owed `13945.67` by every other member, and `P02` is
      owed `1600` by every member but `P01`.
    - At 16 members, with `usableWidth = breakdownPage(16).usableWidth`:
      - Every mono cell has `text.length * 0.6 * fontSize <= width - 6 + 1e-9`.
      - `13,945.67` is 6.6pt and `1,600.00` is 7.4pt.
    - At 17 members, with `breakdownPage(17).usableWidth`, both are 7.5pt. A third payor `P03` owed
      `1234567.89` by `P04` prints `1,234,567.89` at 7.4pt.
    - At 3 members (`breakdownPage(3).usableWidth`), every mono cell is 7.5pt.
    - Header cells keep `styles.headCell` and no `fontSize` override: names aren't fitted (D1).
  - **P-PDF, the page choice (item 4).**
    - Call `SoaDocument({ members, records: [], name: null })` and take its two `Page` children
      (`Children.toArray(doc.props.children)`).
    - 16 members: the first page is `size: 'A4'` with no orientation, and the second is `'A4'`,
      `'landscape'`.
    - 17 members: the first page is unchanged, and the second is `'A3'`, `'landscape'`.
    - 5 members: the second page is `'A4'`, `'portrait'`.
- **`src/lib/orderLines.test.ts`: `billForOneDiscount` (item 5)**
  - **With a price.** `billForOneDiscount(1000)`:
    - `shared` is one row: `name: ''`, `amount: '1000.00'`, `everyone: true`, `members: {}`.
    - `discounts` is one row: `name: ''`, `amount: ''`, `everyone: false`, `members: {}`.
    - `charges` is `[]`.
    - With `picked = ['Ana', 'Ben', 'Cy']` and `lines = {}`, `readBillDraft(picked, {}, bill)` has:
      - `entered` 1000;
      - `shares` equal to `getItemShares({ mode: 'equal', totalPrice: 1000, owners: picked, … })`
        (Ana 333.34, Ben 333.33, Cy 333.33);
      - all four hints `null`.
    - `linesOf({}, m)` is one empty line for each member, so the own lines stay empty.
  - **Without a price.** For each of `0` and `-5`, `shared` is `[]`, and there's one empty discount
    with nobody ticked. `readBillDraft(picked, {}, bill).entered` is 0, and every hint is `null`.
  - `billForOneDiscount(100.5).shared[0].amount` is `'100.50'`.
- **`src/components/home/CustomAmountFields.test.ts`: the follow line (item 2), and row ids (item 5)**
  - The `render` helper gains a `totalFollows = false` parameter and passes it.
  - **Following** (`totalFollows: true`, `totalAmount: '1760.00'`):
    - The HTML contains `<p id="custom-total-follows"` with the exact text "Matches Entered. Type
      a total to use Fill Remainder.".
    - The Total Amount input has `aria-describedby="custom-total-follows"`.
    - Fill Remainder's `title` is that same text.
  - **Not following:** no `custom-total-follows`, no `aria-describedby` on the box, and Fill
    Remainder's title is "Enter a total amount and leave at least one member blank".
  - A discount row renders `id="custom-discounts-1-name"` on its name box, and the Gyoza fixture
    renders `id="custom-shared-1-name"`.
- **`src/components/home/EqualSplitFields.test.ts`: the hint's button (item 5)**
  - `render` passes `onSwitchForDiscount: noop`.
  - Existing cases compare with tags stripped (`html.replace(/<[^>]+>/g, '')`), so the full hint
    text still matches. The two "absent" cases are unchanged.
  - With one member picked, the HTML has a `<button type="button"` whose class includes
    `link-action`. Its text is "Switch to Custom Amounts and add a shared order." and it has no
    `aria-label`.
  - Calling `EqualSplitFields(props)` with a `vi.fn()` and walking the returned tree to the element
    with `props.className` containing `link-action`, `props.onClick()` calls the spy once.
- **`src/components/layout/SessionWorkspace.test.ts` (new): the dialog text (item 6)**
  - `EDIT_ITEM_MESSAGE` is exactly "It opens on the Expenses tab with its date and Paid By.
    Breakdown keeps it as it is until you press Save Edits. Cancel brings you back to Breakdown."
  - The module imports under Vitest. I checked this with a throwaway test.
- **`src/components/shared/ClearableInput.test.ts`:** add `switchForDiscount: () => {}` to its
  `handlers` object so `tsc -b` passes. No assertion changes.
- **Tour:** `steps.test.ts` and `targets.test.ts` pass unchanged.

### 8.2 Manual checks for the ui-ux-tester

Run `npm run dev:full` at 320px, 375px and desktop width.

1. **Item 1, matrix at 16:** make a 16-member session where two payors are owed ₱1,600.00 and
   ₱13,945.67 by everyone. Download the PDF. On the landscape A4 breakdown page, no amount in
   "Amounts Owed to Each Payor" touches or runs into the next one, and the last column stays inside
   the right margin.
2. **Item 4, paper:** add a 17th member and download again.
   - Page 1 is portrait A4.
   - The breakdown page is landscape A3 (the viewer's document properties show 420 × 297 mm).
   - The matrix and tables span the wider page, and the amounts print visibly larger than at 16.
   - With 5 and with 6 members, the breakdown page is portrait A4 and landscape A4, as on `main`.
3. **Item 1, headers:** in those PDFs, the member names in both table headers wrap at spaces and
   don't overlap. Report any one-word name that runs into its neighbour, but it doesn't fail this
   round (D1).
4. **Item 2, follow line:**
   - Stage a Custom item, then press Edit. Under Total Amount, "Matches Entered. Type a total to
     use Fill Remainder." shows in grey.
   - Hover the disabled Fill Remainder: the tooltip says the same.
   - Type one digit in Total Amount: the line goes, and the tooltip goes back to today's.
   - Edit again and press ↺ on Total Amount: the line goes.
   - The same from Breakdown → Edit → "Edit item".
   - Desktop: one line, and Fill Remainder stays level with the box. 320px: two lines, no sideways
     scroll.
   - With VoiceOver, or the accessibility tree in Chrome DevTools, the box's description is the
     line.
5. **Item 2, fresh item:** a new Custom item, never edited, shows no line.
6. **Item 3, floor hint at 320px:** make a discount push Cy below ₱0.00. The floor hint shows
   directly above the footer's figures (Subtotal … Entered), below the "+ Add" buttons, with
   nothing between them. Same at 375px and desktop.
7. **Item 5, with a price:**
   - In Equal Split, type "Dinner", ₱1,000.00, and tick All Members (Ana, Ben, Cy). Tap "Switch to
     Custom Amounts and add a shared order."
   - The mode reads Custom Amounts and All Members is still ticked. Total Amount is empty with no
     follow line. Each member's order line is empty.
   - Shared orders has one unnamed row at 1000.00 with "Everyone" ticked. Discounts has one empty
     row with nobody ticked.
   - The shares read ₱333.34, ₱333.33 and ₱333.33, and the footer reads "Entered ₱1,000.00".
   - Focus is in the discount's name box (desktop: its focus ring; phone: the box is on screen).
   - Type "PWD" with ₱200.00, tick Cy, and Add Item. The staged pills read "Shared order ₱1,000.00 ·
     Ana, Ben, Cy" and "PWD −₱200.00 · Cy".
8. **Item 5, no price:** the same with the price empty. Only Discounts appears, with one empty row,
   and Add Item stays disabled.
9. **Item 5, the control:**
   - Desktop: the hint is one line, with the second sentence underlined in the accent colour.
     Tab reaches it, and Enter and Space trigger it.
   - 320px and 375px: the button is on its own line, at least 44px tall (DevTools box model), and
     its text wraps with no sideways scroll.
   - The mode toggle's own Equal Split → Custom Amounts still fills each member's line with an
     equal share, as on `main`.
10. **Item 6:** on Breakdown, press Edit on an item. The prompt's message ends "Cancel brings you
    back to Breakdown." Press "Edit item", then Cancel on Expenses: Breakdown shows. At 320px the
    message wraps inside the dialog.
11. **Tour:** run the onboarding tour once. Every step shows as on `main`.

## 9. Documentation impact

- **This change:** amendment notes, committed with this spec. Each keeps the original text and says
  "Amended by `bill-ux-polish-2.md`":
  - `custom-split-adjustments-requirements.md`: under BR-CA32 (item 5), BR-CA35 (items 1 and 4)
    and BR-CA38 (item 2).
  - `custom-orders-requirements.md`: under BR-CO25 (item 6).
- **For the documentation-engineer, when the owner asks:**
  - user-guide text in the vault on the Equal Split hint, Edit's Total Amount, the "Edit item"
    prompt, and the PDF's paper size for 17 or more members;
  - any screenshot of those.
  - No README or API docs change.

## 10. Tasks

1. `layout.test.ts` L-3, then `breakdownPage` in `layout.ts`. → `npm test -- layout`
2. Move the walker to `pdfTree.testutil.ts`, and import it in `TransactionTable.test.ts`. →
   `npm test -- TransactionTable` passes unchanged.
3. `SoaDocument.test.ts` (M-PDF, P-PDF). It fails first. Then, in `SoaDocument.tsx`, use
   `breakdownPage`, drop the old constants, fit the matrix cells and export `OwedMatrixSection`
   (items 1 and 4). → `npm test -- SoaDocument`
4. `orderLines.test.ts` cases, then `billForOneDiscount`. → `npm test -- orderLines`
5. `ItemModeFields.tsx`: `switchForDiscount` on `ItemDraftHandlers`, and the two new props passed
   down. Add `switchForDiscount` to the `ClearableInput.test.ts` handlers. → `npx tsc -b`
6. `CustomAmountFields.test.ts` cases, then `CustomAmountFields`: `FOLLOW_NOTE`, the `totalFollows`
   prop, `.totalGroup`, `aria-describedby`, the title, and the row ids (items 2 and 5).
7. `EqualSplitFields.test.ts` cases, then the button and `.hintLink` (item 5).
8. `PurchaseItemCard.tsx`: `focusDiscount`, the `switchForDiscount` handler and the focus effect
   (item 5).
9. `SessionWorkspace.test.ts`, then `EDIT_ITEM_MESSAGE` (item 6).
10. Run `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and `targets.test.ts`)
    and `npm run build`. Report the real results.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| An A3 page printed on A4 paper shrinks to 71% | The PDF is mainly read on screen, where it zooms. Shrunk to A4, 7.5pt prints at about 5.3pt, no smaller than the 5.1pt to 5.8pt that A4 landscape fits amounts to at 17 members today. It's the owner's decision, and the tester checks the page size, not a printout |
| Viewers or printers that mishandle mixed page sizes | Mixed sizes are standard PDF, and react-pdf sizes each `Page` on its own. Tester check 2 opens the file |
| A PDF that prints correctly today changes | Up to 16 members the paper and widths are unchanged, and `fitMonoFontSize` returns the size unchanged when text fits. M-PDF pins 7.5 at 3 members, and L-3 pins the 16/17 boundary |
| Matrix amounts become small with many members on A3 | They're never clipped or overlapped. It's the trade-off PR #141 and #145 accepted for the tables |
| A one-word member name overflows a header cell | It happens today too, and A3 makes it rarer. It's left for a separate decision (D1) |
| The follow line pushes Fill Remainder out of line | The line is outside `.topRow`, in a wrapper. Tester check 4 |
| The hint's button picks up Button's padding, nowrap or 38px height | `.hint > .hintLink` is (0,2,0), above every Button rule it overrides. Tester check 9 measures 44px |
| Focus doesn't raise the keyboard on iOS | Focus set from an effect isn't part of the tap, so iOS may not open the keyboard. The box is still focused and scrolled into view, and a tap opens it. Desktop and Android are covered by tester check 7 |
| The hint's switch leaves a stale follow line or "of ₱Y" | It builds from `EMPTY_DRAFT`, so `totalFollows` is false and Total Amount is empty |
| Adding `id`s to every receipt row's name box collides | Ids combine the section and the row's position, and only one form is ever mounted |

**Size: small.** About 9 source files and 6 test files change, and 3 test files are added. There's
no schema, API, type or dependency change.

**Risk: low.** Items 1 and 4 change PDF sizes only above today's breaking points. Items 2, 5 and 6
change the form only, and item 5's money comes from the existing `billAmounts`.

## 12. Decisions taken

The owner sees these here. The build follows them.

- **D1. Header cells are left as they are.** They hold names in DM Sans, which `fitMonoFontSize`
  can't measure. Names wrap at spaces, and A3 gives them more room from 17 members. A one-word name
  wider than its column still runs over, in both the matrix and the table headers, as it does
  today. If the owner wants that fixed, it's a separate change: shrinking a name needs DM Sans's
  per-glyph widths, or a break inside the word.
- **D2. The matrix calls `fitMonoFontSize` inline.** It doesn't export `fitted` from
  `TransactionTable.tsx`.
- **D3. The paper choice is one pure function, `breakdownPage`, in `layout.ts`.** The A4 and A3
  constants move there from `SoaDocument.tsx`. The boundary is 5/6 (unchanged) and 16/17 (new).
- **D4. The follow line sits under the whole Total Amount row, not inside the 220px field.**
  Inside the field it would pull Fill Remainder down to the line. It reuses `.helper`. It shows
  whenever the box follows, even when the box is empty because Entered is ₱0.00 or less. It's tied
  to the box by `aria-describedby`, only while it shows, and isn't a live region.
- **D5. The hint's control is a `<button>` styled with the existing `link-action` class.** Its
  accessible name is its visible text, "Switch to Custom Amounts and add a shared order.", with no
  `aria-label`. On phones it takes its own 44px line. The period moves inside the button so it
  doesn't wrap alone.
- **D6. The shared order is unnamed,** as the owner suggested. It reads "Shared order" everywhere.
- **D7. Total Amount stays empty and doesn't follow,** as the owner suggested. The item's total is
  Entered, as always (BR-CA18).
- **D8. Focus goes to the discount's name box on every pointer type.** It isn't held back on touch
  the way Edit's date focus is, because here the user asked for the discount and the button they
  pressed is gone. Every receipt row's name box gets an id for this, so no section is a special
  case.
- **D9. The hint's switch clears a validation message,** as the mode toggle does. It behaves the
  same during an edit (A3).
- **D10. The dialog sentence is exactly the owner's.** It's true for both Cancels: the prompt's
  own, and the one on Expenses during the edit. The message becomes an exported constant so a test
  can pin it.
- **D11. The PDF test walker moves to a shared test-only file** (`pdfTree.testutil.ts`) instead of
  being copied into a second test file.
