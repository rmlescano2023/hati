# Spec: order lines in Custom Amounts, picking who's in an item, and editing saved items

Status: **draft, waiting for the owner's approval.** Branch `feature-custom-orders`.

## 1. Summary

Custom Amounts can say how much each person owes but not what they ordered, Fill Remainder
charges everyone in the session who has no amount, and a saved item can only be changed one
cell at a time on Breakdown. After this change:

- Custom Amounts starts with a "Who's in this item" picker. Each picked member gets a block of
  order lines, each with an optional name (up to 60 characters) and a price, and a
  "+ Add order" button.
- Fill Remainder fills only the picked members who have no priced line.
- Order names show as pills in the staged list, and as indented sub-rows on Breakdown, on
  History and in the PDF statement.
- Breakdown is read-only for every item. Each item row gets an Edit control (behind a confirm
  prompt) that reopens the whole item, with its date and Paid By, on the Expenses tab. Save
  Edits writes it back in one change, in place or moved to the record its new date and Paid By
  belong to. × stays.

Source: the business-analyst's requirements,
[`docs/specs/custom-orders-requirements.md`](custom-orders-requirements.md) (US-CO1 to US-CO9,
BR-CO1 to BR-CO38). The owner resolved CQ1 to CQ9 (section 8 there) and NQ1 to NQ4 (section 9),
so this spec doesn't re-open them.

**No schema change, no new route, no new dependency.** Lines live inside the existing `items`
JSON (section 3). Nothing touches existing rows on Neon `main`.

**Phasing.** I recommend two build phases on this branch, in this order (section 12, decision 1):

- **Phase 1: read-only Breakdown and Edit for saved items.** It works with today's item shapes,
  needs no data change, and can ship on its own.
- **Phase 2: order lines, the picker, the new Fill Remainder, and the sub-rows.** It's the data
  change, and it relies on Phase 1 for correcting a saved itemized item.

Building the edit flow first means neither phase needs temporary code. The other order would
leave Phase 1's itemized items behind Breakdown's inline cells, which drop the lines
(BR-CO23), so those cells would need a temporary lock. Every section below marks what belongs
to which phase as **P1** or **P2**.

## 2. Layers touched

| Layer | File | Phase | Change | Reuses |
|---|---|---|---|---|
| Types | `src/types/index.ts` | P2 | New `OrderLine`; optional `lines` on `CustomAmountItem`; doc comments (section 3). | |
| Schema | none | | | |
| API | `api/_validate.ts`, `api/sessions/[id].ts` | | **No code change.** `parseSessionInput` already calls `parseSession`, which gains the line rules through `parseItem`. | |
| Validation | `src/lib/storage.ts` | P2 | `parseItem` keeps valid `lines` through a new private `parseOrderLines` (section 4). | `roundMoney`, `sumMoney`, `normaliseOrderName` |
| Pure logic | `src/lib/orderLines.ts` (new) | P2 | Line drafts, sums, Fill Remainder, Equal Split carry-over, item ⇄ lines (section 5.2). | `splitEvenly` through `distributeRemainder`, `getItemShares`, `parsePositiveAmount`, `sumMoney`, `normaliseSessionName`, `compareNames`, `createId` |
| Pure logic | `src/lib/calculations.ts` | P2 | `purgeMemberFromItem` also drops the member's lines (section 5.5). `getItemTotal` and `getItemShares` **don't change**. | |
| Pure logic | `src/lib/staging.ts` | P1 | `SavedItemRef`, `findSavedItem`, `stagedFromSaved`, `sameStaged`, `applyItemEdit` (section 5.6). | `buildRecords`, `allocateProportionally`, `getItemTotal`, `sumMoney`, `roundMoney`, `compareNames` |
| Pure logic | `src/lib/includeMember.ts` | P1 | `includableGroups` takes an optional item to leave out (BR-CO36). | |
| Client state | `src/context/SessionsStoreContext.tsx` | P1 | Add `saveItemEdit`. Remove `updateItemName`, `updateItemTotal`, `updateItemMemberAmount`, `toCustomItem`, and the `roundMoney` and `getItemShares` imports they leave unused. `mapRecordItem` stays: `removeItem` uses it. | `updateSession`, `createId` |
| Client state | `src/context/AppDataContext.tsx` | P1 | Add `saveItemEdit`; remove the three `updateItem*` bindings and types. | |
| UI | `src/components/layout/SessionWorkspace.tsx`, `.module.css` | P1 | Holds the saved-item edit; the Edit prompt; the leave guard counts the edit; the removal notice (section 6.1). | `ConfirmDialog` |
| UI | `src/components/shared/ConfirmDialog.module.css` | P1 | `.title` wraps long words (6.1). | |
| UI | `src/pages/BreakdownPage.tsx` | P1 | Passes `onEditItem` to each card. | |
| UI | `src/components/breakdown/BreakdownGroup.tsx` | P1 | Passes `onEdit` through to the table. | |
| UI | `src/components/breakdown/BreakdownTable.tsx`, `.module.css` | P1, P2 | P1: plain-text cells, Edit beside × (desktop) or by the name (phone). P2: line sub-rows. | `Button`, `PencilIcon`, `formatMoney` |
| UI | `src/pages/ExpensesPage.tsx` | P1 | Passes the edit to the card and Group Members; `beforeunload` counts it. | |
| UI | `src/components/home/MemberList.tsx` | P1 | Leaves the item out for editing from the include dialog. | `includableGroups` |
| UI | `src/components/home/PurchaseItemCard.tsx`, `.module.css` | P1, P2 | P1: loads and saves a saved item; pure `fieldsFromStaged` and `stampFields`. P2: lines in the draft, the picker, Fill Remainder, mode carry-over. | everything above |
| UI | `src/components/home/ItemModeFields.tsx` | P2 | `ItemDraft.amounts` becomes `lines`; new handlers and derived values. | |
| UI | `src/components/home/CustomAmountFields.tsx`, `.module.css` | P2 | Picker, member blocks, lines, "+ Add order", the missing-price hint. | `OwnerGrid`, `Button` |
| UI | `src/components/home/ItemStagingList.tsx`, `.module.css` | P2 | One pill per line for itemized items. | |
| UI | `src/components/shared/EditableCell.tsx`, `.module.css` | P1 | **Deleted.** Breakdown was its only user (checked with grep). | |
| UI | `src/components/sessions/SessionNameInput.tsx`, `src/components/summary/OwedMatrix.module.css` | P1 | Comment only: drop the mention of the deleted `EditableCell`. | |
| PDF | `src/pdf/TransactionTable.tsx`, `src/pdf/styles.ts` | P2 | Line sub-rows; an item row is kept together with its first line (section 6.5). | |
| Tour | `src/components/onboarding/steps.ts` | P1 | Copy only: the `tab-breakdown` step no longer says cells edit in place (section 7). Target unchanged. | |
| Tests | `src/lib/staging.test.ts`, `src/lib/includeMember.test.ts` | P1 | Section 8. | |
| Tests | `src/lib/orderLines.test.ts` (new), `src/lib/sessionValidation.test.ts`, `src/lib/calculations.test.ts`, `src/lib/staging.test.ts` | P2 | Section 8. | |
| Docs | none in code; see section 9 | | | |

## 3. Data model

**No schema change.** Items are already JSON in `purchase_records.items` (`jsonb`). No SQL, no
migration, nothing rewritten. Existing rows are read and saved exactly as today (AC-CO9.1,
AC-CO9.2).

### 3.1 Types (P2)

```ts
/** One thing a member ordered, inside a Custom Amounts item (BR-CO5). */
export type OrderLine = {
  member: string;
  /** Tidied (`normaliseOrderName`); '' means the line has no name. */
  name: string;
  /** Above 0, rounded to the centavo. */
  amount: number;
};

export type CustomAmountItem = {
  id: string;
  mode: 'custom';
  name: string;
  /**
   * member -> amount owed for this item. Members with no share are absent.
   * With `lines`, each amount is the sum of that member's lines, kept here so
   * every calculation, and a tab still running an older release, reads the
   * money from one place (BR-CO10, BR-CO23).
   */
  amounts: Record<string, number>;
  /**
   * What each member ordered, by member alphabetically and then in the order
   * added (BR-CO13). Present only when at least one line has a name: an item
   * whose lines are all unnamed is stored as `amounts` alone (BR-CO12, BR-CO17).
   */
  lines?: OrderLine[];
};
```

### 3.2 Stored shapes

**Itemized** (at least one named line). Example A from BR-CO11, abbreviated:

```json
{
  "id": "item_…", "mode": "custom", "name": "Dinner",
  "amounts": { "Ana": 280, "Ben": 450, "Cy": 220, "Dan": 380, "Eve": 300, "Fay": 200 },
  "lines": [
    { "member": "Ana", "name": "Sisig", "amount": 280 },
    { "member": "Ben", "name": "Kare-kare", "amount": 450 },
    { "member": "Cy", "name": "Adobo", "amount": 220 },
    { "member": "Dan", "name": "Sinigang", "amount": 380 },
    { "member": "Eve", "name": "Pancit", "amount": 180 },
    { "member": "Eve", "name": "Halo-halo", "amount": 120 },
    { "member": "Fay", "name": "", "amount": 200 }
  ]
}
```

**Not itemized** (no named line): today's shape, `{ id, mode: 'custom', name, amounts }`, with a
member's unnamed lines added together. No `lines` key at all.

### 3.3 Why this shape is safe for an older tab (BR-CO23)

A tab still running the previous release doesn't parse what it loads, and reads only `amounts`:

| What the old tab does | Result |
|---|---|
| Shows the session | `getItemTotal` and `getItemShares` read `amounts`, which hold the sums, so totals and shares are right. It ignores `lines`, so it shows no names and doesn't crash. |
| Saves the session without touching the item (another purchase, a rename) | It sends the JSON as it loaded it, so `lines` goes too and the server keeps it (section 4). |
| Renames the item on Breakdown | `{ ...item, name }` keeps `lines`, which still agree with `amounts`, so they're kept. |
| Changes an Item Total or a member cell | `amounts` change but `lines` don't, so the server finds them disagreeing and drops `lines`. The amounts the tab saved win (section 4, rule 6). |
| Removes a member | `amounts` lose the member but `lines` still have them. The server drops that member's lines and keeps the rest, which still agree (rule 5). |

The old tab's screen keeps the stale `lines` in memory until it reloads, but never reads them.

**Rollback caveat.** If this release is ever rolled back, the old server's `parseItem` drops
`lines` on the next save of each session that has them. Money is unaffected (it's in
`amounts`), but the order names are lost. Section 11 lists this.

## 4. API contract

**No route, method, request shape or status code changes.** `PUT /api/sessions/[id]` keeps
`getUserId` (401), the owner-scoped update (404 for another account's id or a deleted session),
`parseSessionInput` in `api/_validate.ts` (400 "Malformed session."), and `client.sql`
templates. `GET /api/sessions` returns the stored JSON, which now includes `lines`.

The one change is what `parseItem` in `src/lib/storage.ts` keeps for a Custom item. Like the rest
of `parseSession`, it **never rejects a session over lines**. A bad `lines` value is dropped
whole, and the item is stored from `amounts` alone, exactly as today. This keeps the stale-tab
cases in 3.3 saving rather than failing.

```ts
// in parseItem, the custom branch: amounts parsed exactly as today, then
const lines = parseOrderLines(raw.lines, amounts);
return lines
  ? { id, mode: 'custom', name, amounts, lines }
  : { id, mode: 'custom', name, amounts };
```

`parseOrderLines(raw: unknown, amounts: Record<string, number>): OrderLine[] | null`, private to
`storage.ts`, applies these rules in order. **Any failure returns `null`**, which means "store
no lines".

1. `raw` must be a non-empty array.
2. Every entry must be an object with `member` a string, `name` a string, and `amount` a finite
   number.
3. `name` becomes `normaliseOrderName(name)`: whitespace and control characters collapse to
   single spaces, it's trimmed, and it's cut to 60 code points. This is the session-name rule
   (BR-CO6), and it also keeps a U+0000 out of `jsonb`, which rejects one.
4. `amount` becomes `roundMoney(amount)` and must be above 0.
5. Lines whose `member` isn't a key of `amounts` are left out. This is the stale-tab member
   removal in 3.3.
6. For every member in `amounts`, the member must have at least one line, and
   `Math.round(sumMoney(their line amounts) * 100) === Math.round(amounts[member] * 100)`.
   This is the stale-tab cell edit in 3.3: money is never two things at once.
7. At least one line must have a non-empty `name`. Otherwise the item isn't itemized and is
   stored in today's shape (BR-CO12).

The lines are returned in the order they were sent. The client always sends them in BR-CO13
order (5.2, `itemFromLines`).

An Equal Split item is rebuilt from its own fields, as today, so a stray `lines` on one is
dropped.

**Limits.** The server enforces the 60-character name, positive centavo amounts, and agreement
with `amounts`. I've set no cap on the number of lines, matching items and records, which have
none either. The 4.5 MB Vercel request body limit bounds a session anyway (section 12,
decision 5).

## 5. Business logic

All new rules are pure functions in `src/lib`, with `.js` import suffixes, because `storage.ts`
(and so `orderLines.ts`) is reachable from `api/`. `apiImports.test.ts` checks this.

### 5.1 Money rules at a glance

| Rule | Where | How |
|---|---|---|
| Reading a price | `parsePositiveAmount` (`money.ts`), unchanged | Rounded to the centavo; blank, 0, negative or unreadable is 0, which means "no price" (BR-CO7). |
| A member's share | `itemFromLines` | `sumMoney` of their priced lines, stored in `amounts[member]` (BR-CO10). |
| Item total | `getItemTotal`, unchanged | `sumMoney(Object.values(amounts))`. Never Total Amount (BR-CO9). |
| Form footer "Entered" | `linesTotal` | `sumMoney` of every priced line of the picked members. It equals the stamped item's total in whole centavos, because every line is already rounded to the centavo. |
| Fill Remainder | `fillRemainder` | `distributeRemainder` (`splitEvenly`) over the blank picked members, alphabetically (BR-CO11). |
| Equal Split → Custom | `linesFromEqualSplit` | `getItemShares` of an Equal item with the picked owners: `splitEvenly` over them sorted by `compareNames` (BR-CO4, NQ4). |
| Pre-PR #133 item's share of its record | `stagedFromSaved` | `allocateProportionally(itemTotal, contributions)`, in whole centavos (BR-CO28, NQ2). |
| What the old record keeps | `applyItemEdit` | Each contribution minus that share (BR-CO31). See 5.6. |
| One Payor record amount | `applyItemEdit`, `buildRecords` | `sumMoney` of the record's item totals, as today. |
| Comparisons | everywhere | In whole centavos (`Math.round(x * 100)`), as `contributionsMatch` does. |

Summary, netting and settlement don't change (AC-CO5.5). They read `getItemShares`, which reads
`amounts`.

### 5.2 `src/lib/orderLines.ts` (new, P2)

```ts
/** The longest an order name can be: the session-name rule (BR-CO6). */
export const ORDER_NAME_MAX = SESSION_NAME_MAX;

/** An order name tidied as a session name is, or '' when nothing is left (BR-CO6). */
export function normaliseOrderName(raw: unknown): string {
  return normaliseSessionName(raw) ?? '';
}

/** One order line as typed: strings, like every other box in the form. */
export type LineDraft = { key: string; name: string; price: string };

/** member -> their lines in the order added. A picked member with no entry has one empty line. */
export type LinesDraft = Record<string, LineDraft[]>;

/**
 * The key of a block's first line. It's fixed, so the empty line a picked
 * member shows before typing keeps its inputs when typing makes it real.
 */
export const FIRST_LINE_KEY = 'first';
```

Each function below takes `picked: string[]`, which is the card's `selectedOwners` (members
order, which is alphabetical), and `lines: LinesDraft`. None of them mutates its input.

- **`linesOf(lines, member): LineDraft[]`** is `lines[member]`, or
  `[{ key: FIRST_LINE_KEY, name: '', price: '' }]` when there's no entry. Every reader below goes
  through it, so a picked member always has at least one line (BR-CO5) without the form having to
  create entries on every tick.
- **`linesTotal(picked, lines): number`** is `sumMoney` of `parsePositiveAmount(l.price)` over every
  line of every picked member.
- **`blankPicked(picked, lines): string[]`** returns the picked members whose lines all read as ₱0
  (BR-CO11 "who is blank"), sorted by `compareNames`.
- **`unpricedNamedLine(picked, lines): string | null`** walks the picked members sorted by
  `compareNames`, then their lines in order. It returns `normaliseOrderName(l.name)` for the first
  line with a name and no price, or `null` when there's none (BR-CO8, AC-CO2.7).
- **`fillRemainder(totalAmount: number, picked, lines): LinesDraft`** (BR-CO11):
  1. `blank = blankPicked(picked, lines)`.
  2. `fills = distributeRemainder(totalAmount, [linesTotal(picked, lines)], blank.length)`. That's
     the existing helper, so the parts come from `splitEvenly` and add up to the remainder, with
     the leftover centavos going one each to the first names.
  3. For each `blank[i]` with `fills[i] > 0`, take `linesOf(lines, m)` and set the **first** line's
     `price` to `fills[i].toFixed(2)`, keeping its `name` (AC-CO3.4).
  4. A part of ₱0.00 leaves that member blank.
  5. Members not picked, and members with a priced line, are never touched (AC-CO3.5).
- **`linesFromEqualSplit(price: number, picked): LinesDraft`** (BR-CO4):
  - It takes `shares = getItemShares({ id: '', mode: 'equal', name: '', totalPrice: price, owners: picked })`.
  - Each picked member gets `[{ key: FIRST_LINE_KEY, name: '', price }]`, where `price` is
    `shares[m].toFixed(2)` when the share is above 0, and `''` otherwise.
  - With `price <= 0` it returns `{}`, so every picked member shows one empty line.
- **`linesFromItem(item: CustomAmountItem, members: string[]): LinesDraft`** is what Edit loads
  (AC-CO4.3, AC-CO7.4, AC-CO7.6, BR-CO17, BR-CO18):
  - It covers each `m` in `members` with `item.amounts[m] > 0`, in `members` order.
  - **With `item.lines`:** the member's lines in stored order, each as
    `{ key, name: l.name, price: l.amount.toFixed(2) }`.
  - **Without `item.lines`, or when the member has no line:** one line
    `{ key, name: '', price: item.amounts[m].toFixed(2) }`.
  - `key` is `FIRST_LINE_KEY` for each member's first line and `createId('line')` for the rest.
  - Members with no amount, or no longer in `members`, are left out, so they show as unpicked.
- **`itemFromLines(id: string, name: string, picked, lines): CustomAmountItem`** is what Add Item
  and Save Edits store (BR-CO8, BR-CO12, BR-CO13, BR-CO17):
  1. For each `m` of `picked` sorted by `compareNames`, and each line of `linesOf(lines, m)` in
     order, `amount = parsePositiveAmount(l.price)`. Lines at 0 are dropped.
  2. `amounts[m] = sumMoney(that member's amounts)`, set only when it's above 0. A picked member
     with nothing priced isn't in the item.
  3. `kept` is the list of `{ member: m, name: normaliseOrderName(l.name), amount }` in that order.
  4. It returns `{ id, mode: 'custom', name, amounts, lines: kept }` when any `kept` line has a
     name, and `{ id, mode: 'custom', name, amounts }` otherwise. The keys are built in this order
     every time, so two stamps of the same fields serialize identically (5.6, `sameStaged`).
  - `name` is passed already trimmed, as `stampItem` does today.

### 5.3 The form (P2)

`ItemDraft` (`ItemModeFields.tsx`) replaces `amounts: Record<string, string>` with
`lines: LinesDraft`. `owners` and `allSelected` now also mean "picked" in Custom Amounts, so the
picker and Equal Split's owner grid share one state, and a mode switch carries it over for free.
`EMPTY_DRAFT.lines` is `{}`.

Derived values in `PurchaseItemCard`:

```
picked        = selectedOwners                        // the existing memo, unchanged
enteredTotal  = linesTotal(picked, draft.lines)
blankMembers  = blankPicked(picked, draft.lines)
missingPrice  = unpricedNamedLine(picked, draft.lines)
remainder     = roundMoney(num(draft.totalAmount) - enteredTotal)   // unchanged formula
itemValid     = name.trim() !== '' && (equal ? (unchanged) : enteredTotal > 0 && missingPrice === null)
```

`canAddItem`, the Multiple Payors check and `itemTotal` are unchanged. `itemTotal` is still
`enteredTotal` in Custom Amounts.

Handlers. The ones not listed are unchanged:

| Handler | Effect on `draft` |
|---|---|
| `toggleAll` | As today. When it un-ticks, it also sets `lines: {}` (AC-CO1.3, BR-CO3). |
| `toggleOwner(m)` | As today. When it un-ticks `m`, it also deletes `lines[m]` (AC-CO1.7). |
| `setLine(m, index, patch: Partial<Pick<LineDraft, 'name' \| 'price'>>)` | Replaces `lines[m]` with `linesOf(lines, m)`, with `patch` merged into that index. |
| `addLine(m)` | `lines[m] = [...linesOf(lines, m), { key: createId('line'), name: '', price: '' }]` (AC-CO2.2). |
| `removeLine(m, index)` | Drops that index. It's only reachable when the block has two or more lines (BR-CO5). |
| `fillRemainder` | `lines = fillRemainder(num(d.totalAmount), picked, d.lines)`. |

The `setAmount` handler and `ItemDraftHandlers.setAmount` go.

**Mode switch** (`ModeToggle onChange`, BR-CO4). It replaces today's
`{ ...EMPTY_DRAFT, mode, name: d.name }`:

```ts
setDraft((d) => {
  const keep = { ...EMPTY_DRAFT, mode, name: d.name, owners: d.owners, allSelected: d.allSelected };
  if (mode !== 'custom') return keep;                  // Custom → Equal: lines and Total Amount clear
  const price = num(d.price);
  const picked = d.allSelected ? members : members.filter((m) => d.owners[m]);
  return price > 0
    ? { ...keep, totalAmount: price.toFixed(2), lines: linesFromEqualSplit(price, picked) }
    : keep;
});
```

This applies whether or not an edit is open, as the name rule does today.

**`draftFromItem`, custom branch** (Edit on a staged or saved item):

```ts
const lines = linesFromItem(item, members);
const picked = Object.keys(lines);
const everyone = members.length > 0 && members.every((m) => picked.includes(m));
return {
  ...EMPTY_DRAFT, mode: 'custom', name: item.name,
  totalAmount: getItemTotal(item).toFixed(2),
  allSelected: everyone,
  owners: everyone ? {} : Object.fromEntries(picked.map((m) => [m, true])),
  lines,
};
```

**`stampFields`, custom branch:** `itemFromLines(id, name, selectedOwners, draft.lines)`.

**Member-removal effect:** it deletes `lines[m]` where it deletes `amounts[m]` today.
`allSelected` is still left alone.

**Late member** (AC-CO1.6, BR-CO22): with "All Members" ticked, `picked` includes them, and
`linesOf` gives them an empty line. Nothing else is needed.

### 5.4 Staged list pills (P2)

- **Not itemized** (no `item.lines`): exactly today's pills (AC-CO4.2).
- **Itemized:** one pill per `item.lines` entry, in stored order (AC-CO4.1). A named line shows
  `` `${member} · ${name} ${formatMoney(amount)}` ``; an unnamed one shows
  `` `${member}: ${formatMoney(amount)}` ``.
- The key is `` `${item.id}:${index}` ``.
- The staged price stays `getItemTotal(item)`, which is the sum of the lines (AC-CO4.5).

### 5.5 Removing a member (P2, BR-CO21)

`purgeMemberFromItem`, custom branch:

```ts
if (!(member in item.amounts)) return item;
const amounts = { ...item.amounts };
delete amounts[member];
if (Object.keys(amounts).length === 0) return null;
if (!item.lines) return { ...item, amounts };
const lines = item.lines.filter((l) => l.member !== member);
// With no named line left it isn't itemized any more, so it goes back to today's shape (BR-CO12).
return lines.some((l) => l.name !== '')
  ? { ...item, amounts, lines }
  : { id: item.id, mode: 'custom', name: item.name, amounts };
```

Nobody else's lines or amounts move, and the total shrinks by the member's sum. Saved records
(`removeMember`) and staged items (`purgeMemberFromStaged`) both go through this, so neither of
them changes.

### 5.6 Editing a saved item: `src/lib/staging.ts` (P1)

```ts
/** A saved item addressed as Breakdown addresses it, with its name as it was when Edit was pressed. */
export type SavedItemRef = ItemRef & { name: string };

export function findSavedItem(records, ref): { record: PurchaseRecord; item: PurchaseItem } | null;
```

**`stagedFromSaved(record, item): StagedItem`** is what Edit loads (BR-CO28):

| Record | `payorMode` | `payors` |
|---|---|---|
| `payorMode === 'single'` | `'single'` | `[{ member: record.payors[0].member, amount: getItemTotal(item) }]` |
| `'multiple'` with one item | `'multiple'` | the record's payors, copied as they are, even if they no longer add up (the footer then shows the mismatch and Save Edits stays disabled) |
| `'multiple'` with two or more items (pre-PR #133) | `'multiple'` | `shares = allocateProportionally(getItemTotal(item), record.payors.map((p) => p.amount))`, zipped with the payors, keeping only shares above 0 (NQ2) |

`date` is `record.date` and `item` is the item.

**`sameStaged(a, b): boolean`** is `JSON.stringify(a) === JSON.stringify(b)`. It's only used on
two values built by `stampFields`, which always builds keys in the same order. **Never compare
against the saved JSON directly:** `jsonb` reorders object keys, so a loaded item's key order
differs from a stamped one's.

**`applyItemEdit(records, ref, next: StagedItem, fresh: { id: string; createdAt: string }): PurchaseRecord[]`**
(BR-CO30, BR-CO31):

1. `found = findSavedItem(records, ref)`. If it's null, return `records` itself. Nothing is written
   (BR-CO35).
2. `loaded = stagedFromSaved(found.record, found.item)`, from the record **as it is now**.
3. **Same date and Paid By** (`samePaidBy(next, loaded)`, private):
   - `next.date === loaded.date`, `next.payorMode === loaded.payorMode`, and then:
   - **single:** the same `payors[0].member`.
   - **multiple:** the same members with the same centavos, compared after sorting by `compareNames`.

   When it holds, the item is replaced **in place**:
   - same record, same index, `next.item` (which carries the same id)
   - a single record's `payors` becomes
     `[{ member, amount: sumMoney(items.map(getItemTotal)) }]`
   - a multiple record keeps its payors
   - every other record is returned as the same object.
4. **Otherwise it moves:**
   - `rest` is the record's other items, in their order.
   - **`rest` empty:** the old record is removed.
   - **Single record:** `payors = [{ member, amount: sumMoney(rest.map(getItemTotal)) }]`.
   - **Multiple record:** with `weights = record.payors.map((p) => p.amount)` and
     `share = allocateProportionally(getItemTotal(found.item), weights)`, each payor keeps
     `roundMoney(p.amount - share[i])` (NQ2, "the old record keeps the rest").
     - Every payor stays, even at ₱0.00, so the record is never left without a payor. A record
       with no payors would be dropped by `parseRecord`, items and all.
     - **Fallback:** if the record's contributions add up to less than the item's old total in
       centavos (only possible after a contributor was removed), a subtraction could go below
       ₱0.00. In that case each payor keeps
       `allocateProportionally(sumMoney(rest.map(getItemTotal)), weights)[i]` instead. Both rules
       keep the payors' weights, so the remaining items' balances don't move.
   - The item is placed with `[built] = buildRecords([next])` and appended as
     `{ ...built, id: fresh.id, createdAt: fresh.createdAt }`. That's a One Payor record for one
     payor or one contributor, and a Multiple Payors record for two or more. The item keeps its
     id. Its `createdAt` is now, so Breakdown shows it at the bottom of its card (BR-CO31).
5. The input is never mutated.

**Why a date-only move changes no balance** for a pre-PR #133 record:
- The moved item's new record carries contributions in proportion to the old weights, and so does
  the old record.
- `getRawOwedMatrix` splits each record by its own weights, so every non-payor's share is split
  in the same proportion as before, to the centavo where the amounts divide exactly.
- A test covers this (section 8).

**The store** (`SessionsStoreContext.tsx`):

```ts
const saveItemEdit = useCallback(
  (sessionId: string, ref: ItemRef, next: StagedItem) => {
    // One change, so the item leaves its old place and lands in its new one in
    // a single write, or not at all (AC-CO8.1).
    const fresh = { id: createId('rec'), createdAt: new Date().toISOString() };
    updateSession(sessionId, (session) => {
      const records = applyItemEdit(session.records, ref, next, fresh);
      return records === session.records ? session : { ...session, records };
    });
  },
  [updateSession],
);
```

- It makes one `mutateSession` call, so it's one PUT through the existing queue.
- A failure shows the sync banner, and "Try again" reloads the server copy, which has the item in
  its old place.
- The `beforeunload` guard for writes in flight covers a reload mid-save, as in
  `lost-edits-on-reload.md`.
- There's no `onSettled`: Expenses unmounts at once, so there's no message to drive.
- There's no closed-session check (BR-CO37).

`AppDataContext` binds it as `saveItemEdit: (ref: ItemRef, next: StagedItem) => void`.

### 5.7 The edit in the card (P1)

`startEdit`'s and `stampItem`'s bodies move into two module-level pure functions in
`PurchaseItemCard.tsx`, next to `draftFromItem`. Their callers behave exactly as before:

```ts
type Fields = {
  date: string; payorMode: PayorMode; singlePayor: string;
  contributions: Record<string, string>; draft: ItemDraft;
};
/** The fields as they stand to show `row`: what startEdit loads today. */
function fieldsFromStaged(row: StagedItem, members: string[]): Fields;
/** The fields as a staged item with this id: what stampItem builds today. */
function stampFields(fields: Fields, members: string[], id: string): StagedItem;
```

`stampItem(id)` becomes `stampFields({ date, payorMode, singlePayor, contributions, draft }, members, id)`.
`startEdit` applies `fieldsFromStaged(row, members)` with its five setters.

New props:

```ts
/** A saved item out for editing, or null; set only while this tab is open (BR-CO27). */
savedEdit: SavedItemRef | null;
/** Ends that edit and goes back to Breakdown; `removed` when the item had gone (BR-CO33, BR-CO35). */
onSavedEditEnd: (removed: boolean) => void;
```

**Loading, once per mount.** Expenses always mounts fresh for an edit, because Edit is pressed
on Breakdown.

```ts
const { members, records, addRecords, saveItemEdit } = useAppData();
const [savedBoot] = useState(() => {
  const found = savedEdit && findSavedItem(records, savedEdit);
  if (!savedEdit || !found) return null;
  const fields = fieldsFromStaged(stagedFromSaved(found.record, found.item), members);
  // What Save Edits compares against: the loaded fields stamped the same way
  // the edited ones will be, so an untouched old item counts as unchanged (BR-CO32).
  return { fields, baseline: stampFields(fields, members, savedEdit.itemId) };
});
```

The five field states take their initial values from `savedBoot?.fields` when it's set, and
otherwise keep today's initial values (`todayIso`, `'single'`, `''`, `{}`, `EMPTY_DRAFT`).

**Saving and cancelling:**

```ts
const saveSavedEdit = () => {
  if (!savedEdit || !savedBoot || !canAddItem) return;
  const next = stampItem(savedEdit.itemId);
  // Nothing changed writes nothing, so an old item is never rewritten (BR-CO32, AC-CO9.2).
  if (!sameStaged(next, savedBoot.baseline)) saveItemEdit(savedEdit, next);
  onSavedEditEnd(false);
};
```

- **The buttons in `.actions`:**
  - When `savedEdit` is set: `Cancel` → `onSavedEditEnd(false)` and `Save Edits` →
    `saveSavedEdit`, with `disabled={!canAddItem}` (AC-CO7.12).
  - When `editing` is set: today's staged-edit pair, unchanged.
  - Otherwise: `+ Add Item`.
- Save to Breakdown is `disabled={editing !== null || savedEdit !== null}`. Update the comment in
  `save()` to say so.

**The item disappearing** (BR-CO35):

```ts
useEffect(() => {
  if (savedEdit && !findSavedItem(records, savedEdit)) onSavedEditEnd(true);
}, [records, savedEdit, onSavedEditEnd]);
```

This covers a member removal that takes the record with its payor, Clear All, another device,
and a "Try again" reload. Clear All also remounts the card (`formKey`). The remount finds no
item, so `savedBoot` is null, and this effect ends the edit straight away.

**Scroll and focus:** on mount with `savedBoot` set, do what `startEdit` does today. Scroll
`sectionRef` into view, and on a fine pointer focus `#purchase-date` with `preventScroll`.

A member removed during the edit is cleaned from the fields by the existing effect (BR-CO36).
`savedBoot.baseline` isn't updated, so a later Save Edits writes the form's version, which is
what BR-CO36 asks for.

### 5.8 The include dialog (P1, BR-CO36)

`includableGroups(records, members, name, skip?: ItemRef)` leaves out the row whose `recordId`
and `item.id` match `skip`. `MemberList` takes a new `savedEdit: SavedItemRef | null` prop and
passes it as `skip` at both of its calls (the `submit` check and the dialog's `groups`).

## 6. UI

### 6.1 Session workspace (P1)

New state in `SessionWorkspace`:

```ts
/** The saved item the user chose to edit; meaningful only on the Expenses tab (BR-CO27). */
const [savedEdit, setSavedEdit] = useState<SavedItemRef | null>(null);
/** The item whose Edit prompt is open. */
const [editPrompt, setEditPrompt] = useState<SavedItemRef | null>(null);
/** Shown on Breakdown after an edit closed because its item had gone (BR-CO35). */
const [notice, setNotice] = useState<string | null>(null);

// Any way off the tab ends the edit, the tour's setScreen included, so a
// stale one can never come back on the next visit to Expenses. The notice
// belongs to the Breakdown visit it was shown on.
useEffect(() => {
  if (tab !== 'expenses') setSavedEdit(null);
  if (tab !== 'breakdown') setNotice(null);
}, [tab]);

const hasUnsaved = stagedCount > 0 || savedEdit !== null;
```

- **The leave guard:** `SessionTabs onChange` and Back to Home test `hasUnsaved` in place of
  `stagedCount > 0`. The `data-tour="workspace-back"` button and its attribute don't change; only
  the condition in its `onClick` does.
- **The leave dialog message:** when `savedEdit` is set, it reads
  `` `Your changes to ${savedEdit.name} aren't saved.` `` (AC-CO8.2). Otherwise it's today's
  staged-item message. "Discard and leave" navigates as today, and the effect above ends the
  edit. Nothing is written.
- **`<ExpensesPage>`** gets `savedEdit={savedEdit}` and `onSavedEditEnd={endSavedEdit}`, where:

  ```ts
  const endSavedEdit = useCallback((removed: boolean) => {
    if (removed && savedEdit) setNotice(`${savedEdit.name} was removed, so the edit was closed.`);
    setSavedEdit(null);
    onTabChange('breakdown');
  }, [savedEdit, onTabChange]);
  ```

- **`<BreakdownPage onEditItem={setEditPrompt} />`**.
- **The Edit prompt** (BR-CO25, AC-CO7.1, AC-CO7.2). It's a `ConfirmDialog`, not destructive, so
  "Edit item" is the filled, focused action:

  ```tsx
  <ConfirmDialog
    open={editPrompt !== null}
    title={`Edit ${editPrompt?.name ?? ''}?`}
    message="It opens on the Expenses tab with its date and Paid By. Breakdown keeps it as it is until you press Save Edits."
    confirmLabel="Edit item"
    onCancel={() => setEditPrompt(null)}
    onConfirm={() => {
      setSavedEdit(editPrompt);
      setEditPrompt(null);
      onTabChange('expenses');
    }}
  />
  ```

  Escape and a tap outside are Cancel. **A long name must wrap in the title** (BR-CO25), but
  today only `.message` has `overflow-wrap: anywhere`. Add the same declaration to `.title` in
  `ConfirmDialog.module.css`, with the comment "A title can quote a user's own text too, such as
  an item name with no spaces." This also lets every other dialog's title wrap, such as
  "Remove <name>?", which can only help: a title that fits is unchanged.
- **The notice:** rendered after `<SessionTabs>` when `tab === 'breakdown' && notice` as
  `<p className={styles.notice} role="status">{notice}</p>`. Its style:

  ```css
  .notice {
    margin: 0 0 0.85rem;
    padding: 10px 14px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text);
    overflow-wrap: anywhere;
  }
  ```

  It applies at all widths, and it's a new element, so no existing layout changes.

**BR-CO26 ("Finish on Expenses first") isn't built** (section 12, decision 2). Breakdown is only
on screen after Expenses has unmounted, which drops its staged items and typed fields, so the
condition can't be true when Edit is pressed. Leave a comment at the Edit prompt's `onConfirm`
saying so.

### 6.2 Expenses page and Group Members (P1)

- `ExpensesPage` takes the same two props and passes them to `PurchaseItemCard`. It also passes
  `savedEdit` to `MemberList` (5.8).
- **`beforeunload`:** the condition becomes `staged.length > 0 || savedEdit !== null`, with the
  same `warnAboutStaged` handler (AC-CO8.3).
- Update the count comment: an open staged edit still always has a staged item, and a saved-item
  edit is reported separately, through the workspace's own state.

### 6.3 Purchase Details (P1 for the edit line, P2 for the fields)

- **"Editing saved item" line (P1, AC-CO7.3).** When `savedEdit` is set, render
  `<p className={styles.savedEditNote}>Editing saved item: {savedEdit.name}</p>` just above the
  `.subhead` row (the "Add Item" label and the split toggle). Its style:

  ```css
  .savedEditNote {
    font-size: 12px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: var(--accent-bg);
    color: var(--accent-text);
    border: 1px solid var(--accent);
    overflow-wrap: anywhere;
  }
  ```

  The same at every width.
- **Save Edits / Cancel:** the same buttons and placement as a staged edit. The staging list is
  empty during a saved edit, so it has nothing to lock.

**Custom Amounts fields (P2)** in `CustomAmountFields.tsx`. Its new props:

```ts
{
  members, totalAmount, onTotalAmountChange, onFillRemainder,
  owners: Record<string, boolean>, allSelected: boolean,
  onToggleAll: () => void, onToggleOwner: (m: string) => void,
  picked: string[], lines: LinesDraft,
  onLineChange: (m: string, index: number, patch: Partial<Pick<LineDraft, 'name' | 'price'>>) => void,
  onAddLine: (m: string) => void, onRemoveLine: (m: string, index: number) => void,
  enteredTotal: number, blankCount: number, remainder: number,
  missingPrice: string | null,
}
```

From top to bottom:

1. With no members: "Add group members first." and nothing else (AC-CO1.5, unchanged).
2. `.topRow`: Total Amount and Fill Remainder, unchanged. That includes `canFill` and both
   tooltip texts (AC-CO3.3).
3. **The picker** (AC-CO1.1 to AC-CO1.4): a `.field` with `<label>Who's in this item</label>` and
   `<OwnerGrid members owners allSelected onToggleAll onToggle />`, the same component and
   behaviour as Equal Split.
4. **Blocks** (`.blocks`), one per `picked` member in that order, so nobody picked means no
   blocks. Each is a `.block` holding:
   - `.blockName`: the member's name, wrapping (`overflow-wrap: anywhere`).
   - One `.line` per `linesOf(lines, m)` entry, keyed by `line.key`, holding:
     - **Name:** `<input type="text" maxLength={ORDER_NAME_MAX} placeholder="Order (optional)" aria-label={`${m}'s order ${i + 1} name`}>` (AC-CO2.9).
     - **Price:** `<input type="number" min="0" step="0.01" placeholder="0.00" aria-label={`${m}'s order ${i + 1} price`}>`.
     - **×:** only when the block has two or more lines. It's `<Button variant="icon" title="Remove order">×</Button>` with
       `` aria-label={normaliseOrderName(line.name) ? `Remove ${m}'s order ${normaliseOrderName(line.name)}` : `Remove ${m}'s order`} `` (AC-CO2.4).
   - `<Button variant="ghost" size="sm" className={styles.addOrder} aria-label={`Add order for ${m}`}>+ Add order</Button>`.
     The label contains the visible text, so voice control still matches it.
5. **Missing-price hint** (AC-CO2.7): when `missingPrice` is set,
   `<p className={styles.lineHint}>Add a price for {missingPrice} or remove it</p>`, in 12px
   `var(--warn-text)`.
6. **Footer:** unchanged. "Entered ₱X", with "of ₱Y" in red on a mismatch (AC-CO2.1, AC-CO2.6).

CSS (`CustomAmountFields.module.css`). The old `.grid` and `.memberField` rules go with the
per-member boxes.

```css
.blocks { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.block {
  display: flex; flex-direction: column; gap: 6px;
  padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
}
.blockName { font-size: 12px; font-weight: 500; color: var(--text2); overflow-wrap: anywhere; }
/* The × column is always there, so the boxes line up whether or not a line has one. */
.line { display: grid; grid-template-columns: minmax(0, 1fr) 96px 36px; gap: 6px; align-items: center; }
.addOrder { align-self: flex-start; }
.lineHint { font-size: 12px; color: var(--warn-text); }

/* Mobile shell: one block per row, and touch-sized boxes and buttons. */
@media (max-width: 640px) {
  .blocks { grid-template-columns: minmax(0, 1fr); }
  .line { grid-template-columns: minmax(0, 1fr) 92px 44px; }
  .line input { min-height: 44px; }
  .line button, .addOrder { min-height: 44px; min-width: 44px; }
}
```

At 320px, the name box keeps about 100px beside the price and ×, so there's no horizontal scroll
(edge case "Phone, the form"). With 15 or more blocks they stack and scroll with the page.

### 6.4 Breakdown and History (P1 for cells and Edit, P2 for sub-rows)

**`BreakdownTable`** gets `onEdit?: (ref: SavedItemRef) => void`. `BreakdownGroup` passes it
through, and `BreakdownPage` passes `onEditItem`. History doesn't pass it, and keeps
`editable={false}`.

**Item row, all items (P1, AC-CO6.1, AC-CO6.2):**

- **Item cell:** `<td className={styles.itemCell}>` holds
  `<div className={styles.itemWrap}><span className={styles.itemName}>{name}</span>{phone Edit}</div>`.
- **Item Total:** `<td className={`${styles.num} ${styles.price}`}>{formatMoney(row.total)}</td>`.
- **Member cells:** `<td className={`${styles.num} ${share > 0 ? '' : styles.muted}`}>`, showing
  `formatMoney(share)` or "—".
- **Action cell** (only when `editable`): `<span className={styles.actions}>{desktop Edit}{×}</span>`.
  The × is unchanged.
- **Edit buttons:** there are two, the same apart from their class, and CSS shows exactly one at
  any width (NQ3). `display: none` also takes the hidden one out of the tab order and the
  accessibility tree:

  ```tsx
  <Button variant="icon" className={`${styles.edit} ${styles.editInline /* or editAction */}`}
    title="Edit item" aria-label={`Edit ${row.item.name}`}
    onClick={() => onEdit?.({ recordId: row.recordId, itemId: row.item.id, name: row.item.name })}>
    <PencilIcon className={styles.editIcon} />
  </Button>
  ```

  Both render only when `editable && onEdit`.

**Sub-rows (P2, AC-CO5.1, AC-CO5.2, AC-CO5.4, BR-CO14):** for a Custom item with `item.lines`,
one `<tr className={styles.lineRow}>` per line, in stored order, keyed `` `${item.id}:${i}` ``,
right after the item row. The last one also gets `styles.lastLine`, and the item row gets
`styles.hasLines`.

- **First cell:** `<td className={styles.lineName}>`, showing the name, or
  `<span className={styles.noName}>No name</span>`.
- **Item Total cell:** empty.
- **Member cells:** `formatMoney(line.amount)` in the line's member's column, and empty in the
  others.
- **Action cell** (when `editable`): empty. There's no Edit and no × on a sub-row (AC-CO6.3).
- **Total row:** unchanged, because it sums `group.totals`, which are item rows only.

CSS (`BreakdownTable.module.css`):

```css
.actionCol { width: 76px; }                    /* was 36px: Edit and × side by side */
.table td.itemCell { padding-left: 13px; }     /* lines up with the Item header */
.itemWrap { display: flex; align-items: center; gap: 6px; }
.itemName { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.table td.num { text-align: right; font-family: var(--mono); font-size: 12px; padding-right: 13px; }
.table td.price { font-weight: 600; }          /* replaces .priceInput */
.table td.muted { color: var(--text3); }
.actions { display: inline-flex; gap: 4px; }
.editIcon { display: block; width: 15px; height: 15px; }
/* Edit isn't a delete, so it doesn't take the icon button's red hover. */
.table .edit:hover:not(:disabled) { color: var(--text); background: var(--surface2); }
.editInline { display: none; }
.table tr.hasLines td { border-bottom: none; }
.table tr.lineRow td { border-bottom: none; padding-top: 2px; padding-bottom: 2px; font-size: 12px; color: var(--text2); }
.table tr.lineRow.lastLine td { border-bottom: 1px solid var(--border); padding-bottom: 6px; }
.table td.lineName { padding-left: 29px; overflow-wrap: anywhere; }  /* 16px indent past the item name */
.noName { color: var(--text3); font-style: italic; }
```

Inside the existing `@media (max-width: 640px)` block:

```css
.actionCol { width: 36px; }
.editInline { display: inline-flex; min-width: 44px; min-height: 44px; }
.editAction { display: none; }
```

- Remove `.priceInput` and its comment; `.price` replaces it.
- Shorten the `.priceCol` comment's sentence about `input.cell:hover`, which no longer exists.
- The phone block's 8px vertical cell padding stays, because item rows now hold 44px Edit buttons.
  Update its comment from "taller EditableCell inputs" to "the 44px Edit button".
- `.table tr.lineRow td` outranks the phone rule's `.table td`, so sub-rows stay compact on a
  phone too.

**Desktop:** the cells look as they did at rest (the same alignment, mono numbers and "—"). The
changes are the wider action column with Edit beside ×, and the sub-rows (P2). **Phone:** Edit
sits by the name in the first column, so it's visible without scrolling sideways. The × stays in
the last column, as today. The sub-rows scroll inside the same table.

**History** (`editable={false}`) shows the sub-rows and no Edit and no × (AC-CO5.2, AC-CO6.4),
with no code of its own.

### 6.5 PDF statement (P2, AC-CO5.3, BR-CO15)

In `TransactionTable.tsx`, for each row:

- **Not itemized:** exactly today's `<View style={styles.row} wrap={false}>`.
- **Itemized:**

  ```tsx
  {/* The item row and its first line stay together, so an item is never
      stranded at the foot of a page; later lines may break onto the next
      page, under the repeated header (BR-CO15). */}
  <View wrap={false}>
    {itemRow}
    {lineRow(lines[0])}
  </View>
  {lines.slice(1).map((l) => lineRow(l))}   // each its own <View style={styles.lineRow} wrap={false}>
  ```

  - `lineRow` has `lineCell` (width `columns.item`) with the name, or "No name" in `muted`; an
    empty price cell; and in the member columns, `formatAmount(line.amount)` in the line's member's
    column and an empty string elsewhere.
  - Keys are `` `${item.id}:${i}` ``.

New styles in `src/pdf/styles.ts`:

```ts
lineRow: { flexDirection: 'row', paddingVertical: 2 },
lineCell: { fontSize: 7, paddingLeft: 11, paddingRight: 3, color: palette.text3 },
lineCellNum: { fontFamily: 'DM Mono', fontSize: 7, paddingHorizontal: 3, textAlign: 'right', color: palette.text3 },
```

Borders: an itemized item's row gets `{ borderBottomWidth: 0 }`, and its last line row gets
`{ borderBottomWidth: 1, borderBottomColor: '#f0efe9' }`, which is `row`'s border. That way an
item and its lines read as one block, as on Breakdown. Order names are printed as item names
are, with no extra processing.

### 6.6 What doesn't change on desktop

Apart from what the requirements ask for, nothing does:

- Summary, Home, History's layout and the payor fields are untouched.
- Equal Split's fields are untouched.
- Outside Custom Amounts, Purchase Details looks as it does today.

## 7. Onboarding tour impact

- **No `data-tour` target is added, moved, renamed or duplicated.**
  - `workspace-back` keeps its `Button`; only the condition inside its `onClick` changes.
  - `tab-*` in `SessionTabs.tsx` isn't touched. Its `onChange` is wrapped by the workspace, as
    today.
  - Breakdown, the card, `src/components/home` and `src/pdf` have no targets.
- **No step targets anything new.** The tour's session has no purchases, so Breakdown shows its
  empty state and no Edit (BR-CO38).
- **The tour bypasses the guards.** It moves through `tourNavigate` and `setScreen`. The
  workspace's tab effect (6.1) ends any saved-item edit on those paths too, so none can linger.
- **Copy change, required.** The `tab-breakdown` step says "every cell edits in place for as long
  as the session is open", which would be false. Its `content` becomes (section 12, decision 4):

  > Breakdown lists every purchase, item by item: one row per item and one column per person.
  > While the session is open, Edit takes an item back to the form to change it.

  The target, title and screen don't change. `steps.test.ts` only checks that the content is
  longer than 20 characters.
- `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

The Vitest environment is `node` and only `src/**/*.test.ts` runs, so component behaviour is the
ui-ux-tester's. Tests marked **fail first** fail before the change because the function or rule
doesn't exist yet.

### P1 unit tests

**`src/lib/staging.test.ts`** (add; fail first)

- `findSavedItem`: it finds an item by `recordId` and `itemId`, and returns null for a wrong record,
  a wrong item, or an item that sits in another record.
- `stagedFromSaved` (BR-CO28):
  - A single record with two items gives One Payor, that payor, and `amount` equal to the item's
    total.
  - A multiple record with one item gives its contributions as they are, including ones that no
    longer add up.
  - A pre-PR #133 record (Ana 600 / Ben 400, items X ₱700 and Y ₱300), loading Y, gives Ana 180 /
    Ben 120.
  - With contributions Ana ₱0.01 / Ben ₱999.99, a share of 0 for a payor is left out.
- `sameStaged`: true for two stamps of the same fields; false when only a contribution's centavo
  or the date differs.
- `applyItemEdit`, **in place** (BR-CO30, AC-CO7.7):
  - Changing an item's price in a single Ana record replaces it at the same index with the same id.
  - The record's payor amount becomes the new total.
  - The other records are the same objects.
  - The result has the same length and order.
- `applyItemEdit`, **moved by date** (AC-CO7.8):
  - The item leaves a single Ana record of three items, and the old record keeps two, in order,
    with the amount as their sum.
  - A new single record `{ date: new, payors: [Ana, item total], items: [item] }` with
    `fresh.id`/`fresh.createdAt` is appended.
  - The item id is kept.
  - `groupRecordsForBreakdown` puts it last in the new date's card.
- `applyItemEdit`, **moving the only item** removes the old record, and its card is gone from
  `groupRecordsForBreakdown`.
- `applyItemEdit`, **to Multiple Payors** (AC-CO7.9): Ana 1000 / Ben 830 gives a new
  `payorMode: 'multiple'` record holding only the item, and `getRawOwedMatrix` follows the new
  weights.
- `applyItemEdit`, **to a Multiple Payors item with one contributor** gives a single record, as
  `buildRecords` does.
- **Pre-PR #133 date-only move** (NQ2, the scope's "split by an edit with every balance checked"):
  - Setup: members Ana, Ben, Cy; record Ana 600 / Ben 400; X Custom `{Cy: 700}`, Y Equal ₱300
    owned by Cy.
  - Move Y to another date with Paid By as loaded.
  - The old record keeps Ana 420 / Ben 280.
  - The new record is Ana 180 / Ben 120.
  - `getRawOwedMatrix` before and after is identical: Cy owes Ana 600 and Ben 400.
- **Pre-PR #133 centavo case:** Ana, Ben, Cy each contributed ₱1.00, with items ₱1.00 and ₱2.00,
  both owned by Dee. A date-only move of the ₱1.00 item gives 0.34/0.33/0.33, and the old record
  keeps 0.66/0.67/0.67. Dee owes each payor ₱1.00 before and after.
- **Pre-PR #133 fallback:** the contributions (Ana 100, after Ben was removed) are below the moved
  item's ₱200 in a ₱300 record. The old record's Ana becomes ₱100.00, which is its remaining
  total, and never negative.
- **Pre-PR #133 payor change** (a real change): moving Y to One Payor Ana leaves the old record at
  420/280, and Y is a single Ana record.
- `applyItemEdit` with a ref that no longer exists returns the very same array (BR-CO35).
- `applyItemEdit` doesn't mutate its input (deep-equal snapshot before and after).

**`src/lib/includeMember.test.ts`** (add): `includableGroups` with `skip` leaves out exactly that
item. A group left with nothing offerable disappears. With no `skip`, it's unchanged.

### P2 unit tests

**`src/lib/orderLines.test.ts`** (new; fail first)

- `normaliseOrderName`: it trims, collapses inner whitespace, and cuts at 60 code points without
  splitting an emoji. Blank and whitespace become `''`, and so does a non-string. A NUL becomes a
  space.
- `linesOf`: a missing entry gives one empty line with `FIRST_LINE_KEY`.
- `linesTotal`: AC-CO2.1 (Sisig 280 gives 280) and AC-CO2.3 (Eve 180 + 120 gives 300). It ignores
  unpicked members' lines and reads `'abc'`, `'-5'` and `''` as 0 (BR-CO7).
- `blankPicked`: a member with only a named, unpriced line is blank. Unpicked members never are.
  The result is alphabetical.
- `unpricedNamedLine`: it returns "Bulalo" for AC-CO2.7, null once priced or once the name is
  cleared, and the first such line in member and line order.
- `fillRemainder`:
  - **Example A** (AC-CO3.1): Fay's first line gets "200.00" and nothing else changes, including
    the four unpicked members, who have no entries.
  - **Example B** (AC-CO3.2): Cy 166.67, Dan 166.67, Eve 166.66.
  - **AC-CO3.4:** "Bulalo" keeps its name and gets the price.
  - **AC-CO3.5:** a member with a priced line is untouched, and a member with an entry fills their
    first line, not a new one.
  - ₱0.02 across three gives 0.01, 0.01, and the third left blank.
  - A remainder of zero or less changes nothing.
- `linesFromEqualSplit`: ₱100 over Ana, Ben, Cy gives 33.34, 33.33, 33.33, matching
  `getItemShares`. A price of 0 gives `{}`. ₱0.01 over three gives "0.01", "" and "".
- `itemFromLines`:
  - **AC-CO2.8:** a picked member with only an empty line isn't in `amounts`.
  - **BR-CO17:** two unnamed lines (100 + 50) give `amounts: {Ana: 150}` and **no `lines` key**.
  - **Mixed named and unnamed:** gives `lines` with `name: ''` for the unnamed one, in BR-CO13
    order (members alphabetical, lines in order), and `amounts` equal to the per-member sums.
  - Names are tidied.
  - Two calls on the same input give `JSON.stringify`-equal output.
- **Round trip, old items (AC-CO7.6, AC-CO9.2):**
  - `itemFromLines(id, name, picked, linesFromItem(old, members))` equals an amounts-only `old`
    item.
  - The same for an itemized item.
  - An old item with an amount of 0 for Ben (from a pre-release Equal → Custom cell edit) loads Ben
    unpicked.

**`src/lib/sessionValidation.test.ts`** (add; fail first except the first case)

- An amounts-only Custom item comes back as exactly `{ id, mode, name, amounts }`, with no `lines`
  key. This passes today and must keep passing (AC-CO9.2).
- A valid itemized item keeps `lines` in the order sent, with names tidied and cut to 60.
- `lines` is dropped and `amounts` kept when any of these holds:
  - a member's lines don't add up to their amount (a stale-tab cell edit)
  - a member in `amounts` has no line
  - no line is named
  - a line has an amount of 0, negative, `NaN` or a string
  - an entry isn't an object, or has a non-string `member` or `name`
  - `lines` isn't an array, or is empty
- A line for a member not in `amounts` is dropped, and the rest are kept when they still agree
  (a stale-tab member removal).
- An Equal item with a `lines` field comes back without it.
- A whole session carrying all of the above still parses, so it's never a 400.

**`src/lib/calculations.test.ts`** (add)

- `purgeMemberFromItem` on an itemized item: the member's amount and lines go and the others are
  untouched. When no named line is left, it returns today's shape with no `lines` key. When the
  last member goes, it returns null (BR-CO21).
- **AC-CO5.5:** Example A as an itemized item and as amounts-only give equal `getItemTotal`,
  `getItemShares`, `getRawOwedMatrix`, `getNetBalances` and `getFinalSettlement`.

**`src/lib/staging.test.ts`** (add for P2)

- `purgeMemberFromStaged` drops a member's lines from a staged itemized item.
- `applyItemEdit` in place with an itemized `next` keeps its `lines`.

### Existing tests that must still pass

`staging.test.ts`, `calculations.test.ts`, `storage.test.ts`, `includeMember.test.ts`,
`apiImports.test.ts` (which now walks into `orderLines.ts`), `steps.test.ts`,
`targets.test.ts`, and everything else under `npm test`.

### ui-ux-tester checks

Run every check at 320px, 390px and desktop width in `npm run dev:full`.

| AC / rule | Check |
|---|---|
| AC-CO1.1–1.7 (P2) | The picker starts empty with no blocks. Ticking gives blocks in alphabetical order. All Members locks the pills, and ticking it again clears everything. Ticking everyone one by one equals All Members. With no members, only the hint shows. A late member with All Members ticked gets an empty line; otherwise they appear unticked. Unpicking drops the lines at once. |
| AC-CO2.1–2.9 (P2) | The footer sums. "+ Add order" appends. A line's × has the right label, and the only line has no ×. An unnamed price counts. The red "of ₱Y" shows and Add Item is still allowed. The "Bulalo" hint disables Add Item and Save Edits until it's fixed. An empty picked member is left out silently. 60 characters is the most a name takes. |
| AC-CO3.1–3.5 (P2) | Examples A and B on screen. The tooltips and the disabled states. The name is kept on a fill. Unpicked members are untouched. |
| BR-CO4 (P2) | Equal ₱300 for Ana, Ben, Cy switched to Custom gives Total Amount 300.00 and 100.00 each. With no price, empty lines. All Members stays ticked. Custom → Equal keeps the owners and clears the lines. The same during an edit. |
| AC-CO4.1–4.5 (P2) | Pills per line ("Ana · Sisig ₱280.00", "Fay: ₱200.00"), and today's pills for a non-itemized item. Edit on a staged itemized item restores the picker, lines and Total Amount. Save Edits and Cancel. The Multiple Payors sum must match the lines. |
| AC-CO5.1–5.4 (P2) | Sub-rows on Breakdown and History, with "No name" for unnamed lines and the Total row unchanged. The PDF shows the same sub-rows. A PDF with a long itemized item crossing a page keeps the item with its first line and repeats the header. An item with no named lines has no sub-rows anywhere. |
| AC-CO5.5 | Summary for a session with Example A equals the same dinner typed as plain amounts. |
| AC-CO6.1–6.4 (P1) | Breakdown cells are text and focusing them does nothing. Edit and × on every item row, including Equal Split, Custom and itemized. No controls on sub-rows (P2). History has neither. |
| AC-CO7.1–7.3 (P1) | The prompt's title, message and buttons, with a long name wrapping at 320px. Cancel, Escape and the backdrop do nothing. "Edit item" opens Expenses with the date, Paid By, mode, fields, "Editing saved item: …" line, Save Edits / Cancel, and Save to Breakdown disabled. On a phone the form scrolls into view. |
| AC-CO7.4–7.6 | Itemized lines come back (P2). All Members is ticked only for everyone. An old Custom item gives one unnamed line per member (P2), or today's boxes in P1. |
| AC-CO7.7–7.12 (P1) | A price change stays in place in the same card and row. A date change moves it to the bottom of the other card, and an emptied card disappears. Multiple Payors makes its own record. Cancel leaves it exactly as it was. An unchanged Save Edits sends **no PUT** (check the network panel) and keeps the position. Save Edits is enabled under Add Item's rules, including a ₱0.00 Equal item staying disabled. |
| BR-CO28 (P1) | Remove a Multiple Payors contributor first: the edit loads the rest, the footer is red, and Save Edits is disabled until they match. |
| AC-CO8.1 (P1) | Block the network and Save Edits a move: the sync banner shows, and "Try again" puts the item back in its old place. |
| AC-CO8.2–8.3 (P1) | During an edit, tapping Breakdown, Summary or Back to Home asks with "Your changes to Dinner aren't saved.". Stay keeps the edit, and Discard writes nothing. On desktop, reload or close prompts, and after a reload Dinner is unchanged. |
| BR-CO35, BR-CO36 (P1) | Remove the One Payor during an edit: back on Breakdown with "Dinner was removed, so the edit was closed.". Clear All does the same. Removing a non-payor drops them from the form, and Save Edits writes the form. The include dialog for a late member doesn't offer the item being edited. |
| BR-CO23 (P2) | Open the session in a second tab on the previous release (`main` build). It shows the right totals, a rename there keeps the lines, and a cell edit there drops them on reload. |
| AC-CO9.1 (P1, P2) | A copy of a pre-release session shows the same Breakdown, Summary, History and PDF before and after. |
| Tour | Run the whole tour with Next, Back, Skip and Escape. No dialog appears, and the Breakdown step shows the new copy. |
| Layout | No horizontal page scroll at 320px. Order and member names wrap in the form, the pills, the sub-rows and the PDF. Edit and × are at least 44px on a phone. Desktop rows are unchanged apart from the action column and sub-rows. |

## 9. Documentation impact

In the repo, these are the documentation-engineer's when the owner asks:

- **`README.md`:**
  - "Breakdown — check the numbers" says every cell edits in place. It should describe Edit and ×
    instead. That paragraph and the one after it are already stale about the 7-day lock.
  - The Custom Amounts row of the modes table should cover the picker and order lines.
- **`docs/mobile-breakpoints.md`:** drop `EditableCell (44px)` from the 640px list, and describe
  `BreakdownTable`'s padding as room for the 44px Edit button. Add `CustomAmountFields`' 640px
  rules (one block per row, 44px boxes).

For the Obsidian notes, when the owner asks:

- the user guide's Expenses section (the picker, order lines, Fill Remainder, the mode switch)
- Breakdown (read-only, Edit, the prompt, Save Edits moving an item, Cancel)
- the leave and reload warnings for an open edit
- History and PDF sub-rows
- this spec in the technical-specifications list

## 10. Tasks

Each phase ends with its own checks. Within a phase, the order is data, logic, state, then UI.

### Phase 1: read-only Breakdown and Edit for saved items

1. **Logic, tests first.** In `staging.test.ts`, write the P1 tests (section 8) and watch them
   fail. Then add `SavedItemRef`, `findSavedItem`, `stagedFromSaved`, `sameStaged`, and
   `applyItemEdit` with its private `samePaidBy` to `staging.ts` (5.6).
2. **Include dialog.** Add `skip` to `includableGroups`, with its test (5.8).
3. **Store.**
   - Add `saveItemEdit` (5.6) to `SessionsStoreContext.tsx` and `AppDataContext.tsx`.
   - Remove `updateItemName`, `updateItemTotal`, `updateItemMemberAmount` and `toCustomItem`, from
     the value, the types and the `useMemo` dependencies.
   - Remove the `roundMoney` and `getItemShares` imports they leave unused. Keep `mapRecordItem`.
4. **Breakdown.**
   - Rewrite `BreakdownTable`'s cells as plain text and add the two Edit buttons and `onEdit`
     (6.4).
   - Thread `onEdit` through `BreakdownGroup` and `BreakdownPage`.
   - Update the CSS.
   - Delete `EditableCell.tsx` and `EditableCell.module.css`, and fix the two comments that
     mention it.
5. **Card.**
   - Extract `fieldsFromStaged` and `stampFields`, with `startEdit` and `stampItem` using them.
   - Add the `savedEdit` and `onSavedEditEnd` props, `savedBoot`, `saveSavedEdit`, the
     disappearance effect, scroll and focus on mount, the Save to Breakdown lock, and the
     "Editing saved item" line and its CSS (5.7, 6.3).
6. **Expenses page and Group Members.** Thread the props through, and extend `beforeunload`
   (6.2). Pass `savedEdit` to `MemberList`.
7. **Workspace.** Add the state, the tab effect, `hasUnsaved`, the leave message, the Edit
   prompt, `endSavedEdit`, and the notice and its CSS (6.1). Add `overflow-wrap: anywhere` to
   `ConfirmDialog.module.css`'s `.title`.
8. **Tour copy.** Update the `tab-breakdown` step's `content` (section 7).
9. **Checks.** Run `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and
   `targets.test.ts`) and `npm run build`. Then walk the P1 tester checks yourself in
   `npm run dev:full` at phone and desktop widths, and give the owner the local URL and branch.

### Phase 2: order lines and the picker

10. **Types.** Add `OrderLine` and `lines?` to `CustomAmountItem` (3.1).
11. **Order-line logic, tests first.** Write `orderLines.test.ts` and watch it fail, then write
    `orderLines.ts` (5.2).
12. **Validation, tests first.** Add the `sessionValidation.test.ts` cases, then add
    `parseOrderLines` to `storage.ts` and use it in `parseItem` (section 4).
13. **Member removal.** Update `purgeMemberFromItem` (5.5), with the `calculations.test.ts` and
    `staging.test.ts` cases.
14. **Form state.**
    - In `ItemModeFields.tsx`, change `ItemDraft` (`lines`), `ItemDraftHandlers` and
      `ItemDraftDerived`, and pass the picker and line props down.
    - In `PurchaseItemCard.tsx`, add the derived values, the handlers, the mode switch, the
      `draftFromItem` and `stampFields` custom branches, and the removal effect's `lines` (5.3).
15. **Custom Amounts UI.** Rewrite `CustomAmountFields.tsx` and its CSS (6.3).
16. **Staged pills.** Update `ItemStagingList.tsx` and add the line-pill CSS (5.4). The pill keeps
    `.pill`; line pills add `white-space: normal; overflow-wrap: anywhere;` so a long name wraps.
17. **Breakdown sub-rows.** Add them to `BreakdownTable` with their CSS (6.4).
18. **PDF.** Add the sub-rows and the keep-together wrapper to `TransactionTable.tsx`, and the
    styles to `styles.ts` (6.5).
19. **Checks.** Run the same four commands, then walk the P2 tester checks (including BR-CO23
    against a `main` build in a second tab) and report the URL and branch.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| Lines and amounts disagree, so money is two things at once | Money is only ever read from `amounts`. The parser drops `lines` that don't add up to them (section 4, rule 6), and `itemFromLines` writes both from the same sums. Tests cover both. |
| An older tab crashes or saves wrong money | `amounts` keeps today's meaning; section 3.3 walks every stale-tab action. Tester check BR-CO23. |
| A rollback of this release loses order names | Money is safe in `amounts`. Only names go, on the next save of each affected session. The owner should know before shipping. |
| Old items get rewritten by an unchanged Save Edits | `sameStaged` compares two stamps of the form, never the `jsonb`-reordered saved JSON, and a no-change Save Edits sends nothing. Unit and network-panel checks. |
| A move half-applies, so the item is lost or doubled | `applyItemEdit` builds the whole new list in one `updateSession`, which is one PUT, and the server replaces records in one transaction. Tests check that the item exists exactly once afterwards. |
| A pre-PR #133 split changes balances | Proportional shares in whole centavos, the old record keeping the rest, and a fallback that keeps the weights. Three tests prove the balances. |
| A saved-item edit lingers after leaving the tab | The workspace's tab effect clears it on every path, the tour's included. StrictMode-safe, since it doesn't rely on unmount cleanup. |
| The edited item vanishes mid-edit | The card's effect ends the edit with the notice, and `applyItemEdit` is a no-op for a missing ref. |
| Two Edit buttons per row confuse assistive tech | Exactly one is displayed at any width, and `display: none` removes the other from the tree and the tab order. |
| PDF pagination strands an item | The item row and its first line share one `wrap={false}` view. Tester check with a long item at a page break. |
| A very long unbroken order name overflows a PDF cell | It's treated like item names, which have the same exposure today. Tester check. If it overflows, it's a shared follow-up for item names too, not part of this change. |
| Removing inline editing surprises users | The owner decided it (CQ1). The tour copy and docs are updated. |

**Size: large.** About 25 files change, 1 is added and 2 are deleted. It's all client and shared
parser code, with no schema or route change. **Risk: medium.** The money and compatibility logic
is isolated in pure, tested functions in `staging.ts`, `orderLines.ts` and `storage.ts`. The
largest UI change is `PurchaseItemCard` and `CustomAmountFields`.

## 12. Decisions for the user

These are my recommendations. Approving the spec accepts all of them unless you say otherwise.
None of them blocks writing the code.

1. **Phasing: the edit flow first, then order lines.** That's the reverse of "lines first".
   Phase 1 changes no data and is complete on its own. Lines-first would need a temporary lock on
   Breakdown's inline cells for itemized items, because those cells drop the lines. Both phases
   are built on this branch, and you check each one locally.
   - **Recommended:** ship them together in one PR, so testers meet Edit and order lines at once.
   - **Alternative:** ship Phase 1 to UAT first. That's safe, because it changes no data.
2. **Not building the "Finish on Expenses first" prompt (BR-CO26, AC-CO8.4).** The requirements
   themselves note it can't trigger. Breakdown is only on screen after Expenses has unmounted and
   dropped its staged items and typed fields. CLAUDE.md asks for no handling of impossible cases,
   so I recommend a code comment instead.
   - **If you want it anyway:** add a `single` prop to `ConfirmDialog` that hides the way-out
     button, and show that dialog from the Edit prompt's `onConfirm` when `stagedCount > 0`. That's
     about 10 lines.
3. **Where "Dinner was removed, so the edit was closed." appears.**
   - **Recommended:** following "ends as Cancel does", the app returns to Breakdown and shows the
     message in a small notice above the cards until you leave that tab.
   - **Alternative:** stay on Expenses with a fresh form and show the message in the save-message
     line. That feels more natural when you removed the payor yourself on that page, but it departs
     from BR-CO33.
4. **Tour copy for the Breakdown step**, which today promises cells that edit in place: "Breakdown
   lists every purchase, item by item: one row per item and one column per person. While the
   session is open, Edit takes an item back to the form to change it." Reword it freely; the
   target doesn't change.
5. **No cap on the number of order lines per item.** Items and records have none either. The
   server enforces the 60-character name, positive amounts, and agreement with the amounts.
   - **Alternative:** a cap such as 100 lines per item, with "+ Add order" disabled at the cap so
     the server never has to drop anything.
6. **The pre-PR #133 fallback (5.6).** If such a record's contributions already fall short of the
   edited item (only after a contributor was removed), subtracting could go below ₱0.00. The old
   record then keeps its remaining total, split in the same proportions, rather than a negative
   contribution. Balances for its other items don't move.
7. **The removed helpers.** `updateItemName`, `updateItemTotal`, `updateItemMemberAmount`,
   `toCustomItem` and `EditableCell` have no other caller (checked with grep), so this change
   deletes them, as CLAUDE.md asks for orphans. `mapRecordItem` stays for `removeItem`.
