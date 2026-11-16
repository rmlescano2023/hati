# Spec: bill UX polish after PR #141

Status: **draft, waiting for the owner's approval.** Branch `feature-bill-ux-polish`, from
`origin/main` at `4bb95e1` (PR #141 merged).

## 1. Summary

Eight small fixes that follow PR #141 (shared orders, discounts and charges in Custom Amounts, on
UAT). None of them changes a money rule, the stored data or the API.

1. Total Amount follows Entered after Edit until the user types in it.
2. Entered is muted while the ₱0-floor hint blocks Add Item.
3. A staged pill for a shared order or discount that covers everyone in the item reads "· all N" when
   N ≥ 4.
4. PDF: sub-rows are easier to read, and item-row and Total-row amounts shrink to fit their column.
5. The "+ Add" buttons in Custom Amounts are outlined on phones.
6. The PDF item-row overflow at 17+ members (from before PR #141) is fixed by item 4.
7. Each Multiple Payors amount box has its own accessible name.
8. Equal Split shows a one-line hint that points to Custom Amounts for a one-person discount.

Source: the owner's decisions, passed on by the coordinating session. They're final and are the
requirements. The business-analyst was skipped on purpose. The rules they change in
[`custom-split-adjustments-requirements.md`](custom-split-adjustments-requirements.md) are marked
there as amended by this spec: BR-CA30, BR-CA35, BR-CA36 and BR-CA38 (see section 9).

Out of scope: money rules, other layout changes, the onboarding tour and new dependencies.

### Assumptions

- **A1.** "Edit loads a saved Custom item" covers both Edit paths, because both go through
  `draftFromItem`: Edit on a staged row and "Edit item" from Breakdown.
- **A2.** While the box follows and Entered is ₱0.00 or less, the box shows empty (its `0.00`
  placeholder), the way a new item starts. It doesn't show `0.00`.
- **A3.** Item 2 mutes both parts of the Entered line, the figure and any "of ₱Y", while the floor
  hint shows (Q2).
- **A4.** Item 7 changes only the amount boxes. Their clear buttons keep "Clear Ana's contribution".

## 2. Layers touched

| Layer | File | Change | Items |
|---|---|---|---|
| Client state | `src/components/home/ItemModeFields.tsx` | `ItemDraft` gets `totalFollows: boolean` | 1 |
| Client state | `src/lib/orderLines.ts` | New pure `shownTotalAmount` | 1 |
| UI | `src/components/home/PurchaseItemCard.tsx` | `EMPTY_DRAFT`, `draftFromItem`, `setTotalAmount`, `remainder`, the `ItemModeFields` call | 1 |
| UI | `src/components/home/CustomAmountFields.tsx` and `.module.css` | Muted Entered (item 2). Outlined "+ Add" on phones (item 5) | 2, 5 |
| Pure logic | `src/lib/bill.ts` | `receiptPillText(row, people)` | 3 |
| UI | `src/components/home/ItemStagingList.tsx` | Passes `owners.length` to `receiptPillText` | 3 |
| PDF | `src/pdf/styles.ts` | `lineCell`, `lineCellNum`: `palette.text3` → `palette.text2` | 4 |
| PDF | `src/pdf/TransactionTable.tsx` | Item-row and Total-row amounts go through `fitMonoFontSize` | 4, 6 |
| PDF | `src/pdf/layout.ts` | Comment only: `totalCellNum` pads 3pt too | 4 |
| UI | `src/components/home/PayorModeFields.tsx` | `aria-label` on each contribution box | 7 |
| UI | `src/components/home/EqualSplitFields.tsx` | The hint line | 8 |
| Tests | `bill.test.ts`, `orderLines.test.ts`, `layout.test.ts`, `CustomAmountFields.test.ts`, `ClearableInput.test.ts` (fixture only), new `src/pdf/TransactionTable.test.ts`, new `src/components/home/PayorModeFields.test.ts`, new `src/components/home/EqualSplitFields.test.ts` | Section 8 | all |
| Docs | `docs/specs/custom-split-adjustments-requirements.md` | Amendment notes | 2, 3, 4, 1 |

Types (`src/types/index.ts`), schema, API, `src/lib/calculations.ts`, `src/lib/money.ts`, Breakdown
and the tour: **none.**

## 3. Data model

None. `totalFollows` lives in form state only. `stampFields` never reads it or `totalAmount`.

## 4. API contract

None.

## 5. Business logic

No money rule changes.

- `shownTotalAmount` (item 1) only decides what the Total Amount box shows.
- `receiptPillText` (item 3) only changes display text.
- `fitMonoFontSize` (item 4) only changes PDF font sizes.

## 6. UI, item by item

### Item 1: Total Amount follows Entered after Edit

**How following is tracked.** Add a field to `ItemDraft` in `ItemModeFields.tsx`:

```ts
/**
 * Custom Amounts: true from the moment Edit loads an item until the Total Amount box is
 * typed in (or cleared with its ↺). While true the box shows Entered, so editing a row never
 * shows a mismatch the user didn't make.
 */
totalFollows: boolean;
```

Then, in `PurchaseItemCard.tsx`:

- `EMPTY_DRAFT`: `totalFollows: false`. Every reset goes through `EMPTY_DRAFT`: Add Item, Save,
  Cancel, the end of an edit and a mode switch. So following stops whenever the form starts fresh.
- `draftFromItem`, Custom branch: add `totalFollows: true`. Keep `totalAmount:
  getItemTotal(item).toFixed(2)` as it is. The Equal Split branch is unchanged, so it stays false.
- `handlers.setTotalAmount`:
  `setDraft((d) => ({ ...d, totalAmount, totalFollows: false }))`.
  - The ↺ button empties the box through the input's own `onChange` (see `ClearableInput.clear`).
    So a clear reaches this same handler with `''`. It counts as typing with no extra code, and
    the box stays empty.
- Every other handler spreads `d`, so they keep `totalFollows` as it is. That covers rows, picks,
  the member-removal effect and Fill Remainder.

**What the box shows.** Add a pure function to `src/lib/orderLines.ts`:

```ts
/**
 * What the Total Amount box shows: Entered while it follows (bill-ux-polish item 1),
 * empty when Entered is ₱0.00 or less, and otherwise what was typed.
 */
export function shownTotalAmount(typed: string, follows: boolean, entered: number): string {
  if (!follows) return typed;
  return entered > 0 ? entered.toFixed(2) : '';
}
```

In `PurchaseItemCard`, right after `enteredTotal`:

```ts
const totalAmount = shownTotalAmount(draft.totalAmount, draft.totalFollows, enteredTotal);
const remainder = roundMoney(num(totalAmount) - enteredTotal);
```

Pass `draft={{ ...draft, totalAmount }}` to `ItemModeFields`. With that, the box, the mismatch and
Fill Remainder all read the shown value, and `CustomAmountFields` doesn't change for this item.

**Behaviour:**

| Situation | Result |
|---|---|
| Edit loads Example B | Box shows `2401.05`, Entered ₱2,401.05, no red (AC-CA7.2 still holds) |
| Change a price, add or remove a row, change a pick or a discount | Box shows the new Entered. Never red. |
| Type in the box (any keystroke) | Following stops. From then on it behaves exactly as today, red "of ₱Y" included |
| ↺ on the box | Following stops, the box is empty, no red (no target) |
| Fill Remainder while following | Disabled: the remainder is always ₱0.00. Its tooltip is today's "Enter a total amount and leave at least one member blank". Typing a total enables it as today (Q1). |
| Fill Remainder after typing | As today |
| Save Edits with nothing changed | No PUT. `stampFields` reads neither `totalAmount` nor `totalFollows`, so `sameStaged(next, savedBoot.baseline)` holds as before (BR-CO32). |
| Equal Split → Custom with a price | Unchanged: Total Amount gets the price and doesn't follow |
| New Custom item (not from Edit) | Unchanged: doesn't follow |

Same on phone and desktop.

### Item 2: Entered muted while the floor hint shows

`CustomAmountFields.tsx`, `footerLine`:

- Add `const held = billView.floorHint !== null;`.
- On the `.sum` span: `held ? styles.held : mismatch ? styles.mismatch : ''`.
- On the "of ₱Y" span: `held ? styles.held : styles.mismatch`. It still shows only when `mismatch`.

`CustomAmountFields.module.css`. Add this after `.mismatch`, outside any media query, so it outranks
`.sum` and `.mismatch` by source order:

```css
/* Entered while the floor hint blocks Add Item: still readable, but not a total yet. */
.held {
  color: var(--text3);
}
```

- The Subtotal, Discounts and Charges lines don't change.
- The floor hint keeps `--warn-text`.
- Phone and desktop are the same.
- The words don't change, so a screen reader reads the same text, and the hint just above says why.

### Item 3: "· all N" in staged pills

`src/lib/bill.ts`. Change the signature to `receiptPillText(row: ReceiptRow, people: number)`, where
`people` is the number of members in the item. Update the doc comment.

- For a shared order or discount, compute `members = [...row.parts.keys()]`.
  - When `people >= 4 && members.length === people`, it ends `· all ${people}`.
  - Otherwise it ends `· ${members.join(', ')}`, as today.
- Own orders and charges are unchanged. Charges keep "split N ways", or the one name.

`ItemStagingList.tsx`: `receiptPillText(row, owners.length)`.

- `owners` is already `Object.keys(getItemShares(item))`, which for a Custom item is every key of
  `amounts`, ₱0.00 members included.
- That's "everyone in the item" (BR-CA13), because `billMatches` guarantees it for a stored bill.

Examples:

- "Group platter (shared) ₱1,700.00 · all 17"
- "Promo −₱400.00 · all 4"
- "Gyoza (shared) ₱290.00 · Ana, Ben" (2 people, unchanged)
- "Shared order ₱90.00 · Ana, Ben, Cy" (3 people, everyone)
- "Nachos (shared) ₱300.00 · Ana, Ben, Cy" (3 of 4)

**Accessible text: no change.**

- The pill is a plain `<span>` whose visible text is its accessible text. "all 17" reads naturally
  after the price.
- An `aria-label` on a span with no role isn't reliably announced (ARIA doesn't allow naming a
  generic element), so adding one would do nothing.
- No information is lost: "all" means every member in the item, and the item's other pills name
  them.

Phone and desktop: the same text. On a phone it's shorter, which is the point.

### Item 4 (and 6): PDF readability and fit

`src/pdf/styles.ts`: in `lineCell` and `lineCellNum`, change `color: palette.text3` to
`color: palette.text2`. Sizes stay as they are (7pt). The item row's `muted` "—" stays `text3`.

`src/pdf/TransactionTable.tsx`:

- Move the `fitted` helper to module level and give it a size argument:

  ```ts
  /** A number cell's font size, shrunk only when the text would overflow its column (BR-CA35). */
  const fitted = (text: string, width: number, size: number) => ({
    fontSize: fitMonoFontSize(text, width, size),
  });
  ```

- Sub-rows: `fitted(price(line), columns.price, 7)` and `fitted(text, columns.member, 7)`. That's
  today's behaviour.
- Item row:
  - Price cell: `fitted(formatAmount(row.total), columns.price, 7.5)`.
  - Each member cell: compute `text = share > 0 ? formatAmount(share) : '—'` once, use it as the
    child, and add `fitted(text, columns.member, 7.5)` last in the style array.
- Total row:
  - Price cell: `fitted(formatAmount(group.grandTotal), columns.price, 7.5)`.
  - Each member cell: the same pattern, with `group.totals[m] > 0 ? formatAmount(...) : '—'`.
- 7.5 and 7 are the sizes of `cellNum`, `totalCellNum` and `lineCellNum`. Add a one-line comment
  saying so, as today's `fitted` call does.

`src/pdf/layout.ts`: the `NUM_CELL_PADDING` comment becomes "`cellNum`, `totalCellNum` and
`lineCellNum` pad 3pt on each side". No logic change.

I checked the fonts: `DMMono-Regular.ttf` and `DMMono-Medium.ttf` (the Total row's weight 500)
both advance every glyph 600/1000 em, so `MONO_ADVANCE = 0.6` holds for the Total row too.

What changes, at 17+ members (landscape, `computeColumnWidths(17, 761.89)` → 34pt members, a 28pt
text box):

| Cell | Text | Today | After |
|---|---|---|---|
| Item-row member | `145.26` | 7.5pt, fits | 7.5pt, unchanged |
| Item-row member | `5,145.26` | 7.5pt, 36pt wide, runs into the next column ("5,145.26145.26") | 5.8pt |
| Last item-row member | `1,379.80` | touches the right margin | 5.8pt, inside its column |
| Total-row member | `12,345.67` | 40.5pt, overflows | 5.1pt |
| Item Total (58pt, 52pt box) | `87,469.42` / `123,456.78` | fits | 7.5pt, unchanged |
| Total-row Item Total | `1,234,567.89` (12 chars) | 54pt, overflows | 7.2pt |

With 16 or fewer members, every column is wider than 34pt, and anything that fits keeps 7.5pt. No
PDF that prints correctly today changes size. The colour change shows on every PDF that has
sub-rows.

### Item 5: outlined "+ Add" buttons on phones

`CustomAmountFields.module.css`, inside the existing `@media (max-width: 640px)` block:

```css
  /* Outlined on phones, so they read as buttons rather than loose text. The selectors
     outrank Button's .ghost rules, hover included, which a tap leaves applied on touch. */
  .block > .addOrder,
  .block > .addOrder:hover:not(:disabled),
  .addRow > button,
  .addRow > button:hover:not(:disabled) {
    border-color: var(--border2);
  }
```

- This covers "+ Add order" (`.addOrder`, a direct child of `.block`) and "+ Add shared order", "+
  Add discount" and "+ Add charge" (the buttons in `.addRow`).
- Specificity: (0,2,0) and (0,1,1) beat `.ghost` (0,1,0); (0,4,0) and (0,3,1) beat
  `.ghost:hover:not(:disabled)` (0,3,0).
- `--border2` is the default button's border. The background stays `.ghost`'s, so on hover it is
  still `--surface2`. Sizes (44px) are unchanged.
- Desktop: nothing changes, because the rule is phone-only.

### Item 7: Multiple Payors amount boxes

`PayorModeFields.tsx`, the `ClearableInput` in `contribRow`: add `aria-label={`${m}'s amount paid`}`,
for example "Ana's amount paid".

- It replaces the `<label htmlFor>` name ("Ana") for assistive tech. The visible label stays.
- It contains the visible text "Ana", so speech input ("click Ana") still works (WCAG 2.5.3).
- The clear button keeps "Clear Ana's contribution" (A4).
- Phone and desktop are the same.

### Item 8: Equal Split hint toward Custom Amounts

`EqualSplitFields.tsx`, inside `.field`, after the `OwnerGrid`, in the `members.length > 0` branch:

```tsx
{/* Equal Split can't take a discount off one person; Custom Amounts can, with a
    shared order for everyone and a discount for that person. */}
{selectedCount > 0 && (
  <p className={styles.hint}>
    Need a discount for one person? Switch to Custom Amounts and add a shared order.
  </p>
)}
```

- The wording is exactly as above.
- It uses the existing `.hint` (12px, `--text3`, 5px top padding), the style "Add group members
  first." uses. There's no new CSS.
- It shows only when at least one member is picked. That's `selectedCount`, which is
  `derived.picked.length` and counts "All Members".
- It wraps naturally on a phone.
- Desktop gains only this line under the pills. Nothing else moves.
- It's plain text with no link: the mode toggle is just above.

## 7. Onboarding tour impact

**None.**

- No `data-tour` attribute is added, moved, renamed or duplicated. `src/components/home`,
  `src/components/shared` and `src/pdf` have none (checked with grep).
- No step changes. The `tab-expenses` copy still holds.
- The Equal Split hint appears only once a member is picked, and no step points into the item
  fields.
- `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

The Vitest environment is `node`, so component state is the ui-ux-tester's. Every new case fails
first.

### 8.1 Unit tests

- **`src/lib/orderLines.test.ts`: `shownTotalAmount` (item 1)**
  - Not following: it returns what was typed, `''` included, whatever Entered is.
  - Following: Entered 1760 gives `'1760.00'`, 2401.05 gives `'2401.05'`, and 0 or −7.5 gives `''`.
  - Following: `roundMoney(parsePositiveAmount(shownTotalAmount('x', true, e)) - e) === 0` for
    2401.05, 0.01 and 87469.42. So the remainder is 0 and Fill Remainder can't be pressed.
- **`src/lib/bill.test.ts`: B-10 extended (item 3)**
  - Existing cases now pass `people`: Example A gives 2, Example B gives 6, and the VAT case 1. Their
    expected text is unchanged.
  - A 17-member item (`P01` to `P17`, ₱100.00 each) with a shared "Group platter" ₱1,700.00 over
    all 17 gives "Group platter (shared) ₱1,700.00 · all 17". The same row unnamed gives "Shared
    order ₱1,700.00 · all 17".
  - A 4-member item with a "Promo" discount over all four gives "Promo −₱400.00 · all 4".
  - 3 members, shared by everyone: the names, "Ana, Ben, Cy".
  - 4 members, shared by 3: the names.
  - A 17-member charge still gives "· split 17 ways".
- **`src/pdf/layout.test.ts`: L-2 (item 4)**
  - `fitMonoFontSize('145.26', 34, 7.5)` is 7.5.
  - `('5,145.26', 34, 7.5)` and `('1,379.80', 34, 7.5)` are 5.8.
  - `('12,345.67', 34, 7.5)` is 5.1.
  - `('123,456.78', 58, 7.5)` is 7.5.
  - `('1,234,567.89', 58, 7.5)` is 7.2.
  - Extend the "never outgrows" loop to size 7.5.
- **`src/pdf/TransactionTable.test.ts` (new): T-PDF (items 4, 6)**
  - Call `TransactionTable({ group, members, columns })` as a function and walk the returned
    element tree through `props.children`.
  - For each `Text` element, flatten its `style` array into one object. A `Text` is a mono cell when
    that style has `fontFamily === 'DM Mono'`.
  - Fixture: 17 members `P01` to `P17`, hand-built as a `BreakdownGroup`. It has two rows:
    - a Custom item with `amounts` of ₱5,145.26 each;
    - a `bill` item with an own order of ₱1,500.00 per member, a shared ₱1,700.00 over everyone and
      a ₱1,234.56 discount for `P01`, with `amounts` from `billAmounts` (`P01` at ₱365.44, the rest
      at ₱1,600.00).
  - The fixture fills `shares` and `total` from `getItemShares` and `getItemTotal`, and `totals` and
    `grandTotal` by summing.
  - The fixture uses `columns = computeColumnWidths(17, 761.89)`.
  - **No overflow:** every mono cell satisfies `text.length * 0.6 * fontSize <= width - 6 + 1e-9`.
  - **Sizes kept where the text fits:** the same table with 3 members (`computeColumnWidths(3,
    515.28)`) has every item-row and Total-row mono cell at 7.5, and every sub-row cell at 7.
  - **Colour:** every sub-row cell (`lineCell`, `lineCellNum`) has colour `palette.text2`.
- **`src/components/home/CustomAmountFields.test.ts` (item 2)**
  - Import `styles` from `./CustomAmountFields.module.css`. Vitest returns stable class names, the
    same ones the component gets.
  - The existing "over" case (Cy at −₱380.00) renders `class="${styles.sum} ${styles.held}"` and no
    `styles.mismatch` on the sum.
  - Without the floor hint and with `totalAmount: '2400'`, the sum has `styles.mismatch`, as today.
- **`src/components/home/PayorModeFields.test.ts` (new, item 7)**
  - With Multiple Payors for `['Ana', 'Ben']`, the boxes' `aria-label`s are "Ana's amount paid" and
    "Ben's amount paid".
  - The visible `<label>` texts are still "Ana" and "Ben".
- **`src/components/home/EqualSplitFields.test.ts` (new, item 8)**
  - With `selectedCount: 1` the exact hint text renders.
  - With `selectedCount: 0` it doesn't.
  - With `members: []` only "Add group members first." renders.
- **`src/components/shared/ClearableInput.test.ts`:** add `totalFollows: false` to its two
  `ItemDraft` literals so `tsc -b` passes. No assertion changes.
- **Tour:** `steps.test.ts` and `targets.test.ts` pass unchanged.

### 8.2 Manual checks for the ui-ux-tester

Run `npm run dev:full` at 320px, 375px and desktop width.

1. **Item 1, staged Edit:** stage Example B, press Edit, and change Ana's Sisig to 300. The box
   follows to `2421.05`, and there's no red anywhere. Add and remove a charge: it still follows.
2. **Item 1, typing:** type in Total Amount. Then change a price: red "Entered ₱X of ₱Y" shows,
   as today.
3. **Item 1, ↺:** edit an item, press ↺ on Total Amount, then change a price. The box stays empty
   and there's no red.
4. **Item 1, Fill Remainder:** edit an item and empty one member's price. Fill Remainder is
   disabled and the box follows. Type a total: Fill Remainder enables and fills as today.
5. **Item 1, saved edit:** open a saved Custom item from Breakdown ("Edit item") and press Save
   Edits without changing anything. No `PUT /api/sessions/...` appears in the network log. Then
   change one price and save: one PUT, and Breakdown shows the new figure.
6. **Item 2:** make a discount push Cy below ₱0.00. The floor hint shows in the warning colour, and
   "Entered ₱X" (and any "of ₱Y") is grey and still readable. Lower the discount: the normal colour
   comes back.
7. **Item 3:** with 17 members, stage a shared order over Everyone. Its pill reads "… · all 17"
   and wraps cleanly at 320px. With 3 members, the pill shows the three names.
8. **Items 4 and 6:** download the PDF for a 17-member session with item shares of ₱1,000 or more
   and a shared order and discount. No amount runs into the next column or touches the right
   margin, in item rows, sub-rows or the Total row. Sub-rows are visibly darker than before. A
   3-member PDF looks the same as on `main` apart from the sub-row colour.
9. **Item 5:** at 320px and 375px, "+ Add order" and the three "+ Add" buttons have a visible
   border, including after a tap. On desktop they're borderless, as on `main`.
10. **Item 7:** with VoiceOver (or the accessibility tree in Chrome DevTools), the Multiple Payors
    boxes read "Ana's amount paid", and so on.
11. **Item 8:** in Equal Split, the hint is absent with nobody picked. It appears under the pills
    once one member, or All Members, is picked, and wraps at 320px with no sideways scroll. The
    desktop layout is otherwise unchanged.
12. **Tour:** run the onboarding tour once. Every step shows as on `main`.

## 9. Documentation impact

- **This change:** the amendment notes in `custom-split-adjustments-requirements.md`, under BR-CA30
  (item 2), BR-CA35 (item 4), BR-CA36 (item 3) and BR-CA38 (item 1). They're committed with this
  spec. The original text is kept, and each note says "Amended by `bill-ux-polish.md`".
- **For the documentation-engineer, when the owner asks:** any user guide text in the vault that
  shows a staged pill with names, PDF sub-row styling, or the Equal Split form. No README or API
  docs change.

## 10. Tasks

1. `ItemModeFields.tsx`: add `totalFollows` to `ItemDraft`. Add `totalFollows: false` to the
   `ClearableInput.test.ts` literals. → `npx tsc -b`
2. `orderLines.ts`: write the `shownTotalAmount` tests, then add the function. →
   `npm test -- orderLines`
3. `PurchaseItemCard.tsx`: update `EMPTY_DRAFT`, `draftFromItem`, `setTotalAmount`, the shown
   `totalAmount`, `remainder`, and the `ItemModeFields` `draft` prop (item 1).
4. `bill.ts`: write the B-10 cases, then change `receiptPillText`. Update `ItemStagingList.tsx`
   (item 3). → `npm test -- bill`
5. `layout.test.ts` L-2, and the new `TransactionTable.test.ts`. Both fail first. Then change
   `TransactionTable.tsx`, the `styles.ts` colours and the `layout.ts` comment (items 4 and 6).
6. `CustomAmountFields`: write the test first, then `.held` and the footer classes (item 2). Then the
   phone outline rule (item 5).
7. `PayorModeFields.test.ts`, then the `aria-label` (item 7).
8. `EqualSplitFields.test.ts`, then the hint (item 8).
9. Run `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and `targets.test.ts`)
   and `npm run build`. Report the real results.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| Following leaks into a new item, or a mode switch carries it | Every reset builds from `EMPTY_DRAFT` (`totalFollows: false`). Only `draftFromItem`'s Custom branch sets it true. Tester checks 1 to 4. |
| An unchanged Save Edits now writes | `stampFields` doesn't read `totalAmount` or `totalFollows`, and the baseline is built the same way. Tester check 5 watches the network log. |
| Fill Remainder can't be pressed straight after Edit | It's intended under the owner's rule. Typing a total brings it back (Q1). |
| The phone outline loses to `.ghost` on hover after a tap | The selectors' specificity is stated in 6, item 5. Tester check 9 includes "after a tap". |
| The CSS change leaks to desktop | The rule is only inside `@media (max-width: 640px)`. Tester check 9 covers desktop. |
| Shrunk PDF figures at 17+ members are small (5.1pt to 5.8pt) | They're never clipped or overlapped. It's the same trade-off PR #141 accepted for sub-rows. Wider columns would change every PDF. |
| A PDF that fits today changes | `fitMonoFontSize` returns the size unchanged when the text fits. T-PDF pins 7.5 and 7 at 3 members. |
| `receiptPillText` gets the wrong count | The count is `owners.length`, the keys of `amounts`, which `billMatches` ties to the bill. B-10 covers 2, 3, 4 and 17. |

**Size: small.** About 11 source and test files change, and 3 test files are added. There's no
schema, API, type or dependency change.

**Risk: low.** Every change is display-only, and the one state change (item 1) is a single boolean
that resets with the form.

## 12. Decisions for the user

These are recommendations. Approving the spec accepts them. None of them blocks the build.

1. **Q1: Fill Remainder while Total Amount follows.**
   - The owner's rule makes Total Amount equal Entered, so the remainder is ₱0.00 and Fill
     Remainder is disabled until the user types a total. Today, after Edit, you can empty a price
     and press Fill Remainder at once to put the old total back.
   - **Recommended:** accept that, as specified. It's the direct reading of "follows until typed",
     and it keeps one simple rule.
   - **Alternative:** while following, let Fill Remainder aim at the total the item had when it was
     loaded. That keeps the old shortcut but adds a second hidden target, which is the confusion
     item 1 removes.
2. **Q2: what's muted in item 2.**
   - **Recommended:** both the Entered figure and its "of ₱Y" go grey while the floor hint shows,
     so the footer doesn't show a second warning colour beside the hint.
   - **Alternative:** mute only the figure and keep "of ₱Y" red.
