# Spec: shared orders, discounts and charges in Custom Amounts

Status: **draft, waiting for the owner's approval.** Branch `feature-custom-adjustments`, from
`origin/main` at `343a8cb`.

## 1. Summary

A Custom Amounts item can hold only each member's own orders today. A real receipt also has a dish
several people shared, a PWD or senior discount that belongs to one diner, and a service charge or
VAT spread over the table, so the person logging works those out by hand. After this change, a
Custom Amounts item can also hold:

- **shared orders** (a name, a ₱ price and a member picker that starts on "Everyone"), split equally
  across the ticked members;
- **discounts** (a name, a ₱ amount and a picker that starts empty), taken off the ticked members'
  shares only;
- **charges** (a name and a ₱ amount, no picker), split equally across everyone in the item.

While these rows are being typed, the form shows each member's final share and the receipt's
Subtotal, Discounts, Charges and Entered. The staged list, Breakdown, History and the PDF show the
rows under the item.

Sources:

- the business-analyst's requirements,
  [`custom-split-adjustments-requirements.md`](custom-split-adjustments-requirements.md) (US-CA1 to
  US-CA11, BR-CA1 to BR-CA47, Examples A to F, section 7);
- the architect's brief, [`custom-split-adjustments-architecture.md`](custom-split-adjustments-architecture.md),
  with **Option B** approved: a separate `bill` field, used instead of `lines` when an item has a
  shared order, discount or charge;
- the PR #137 spec, [`custom-orders.md`](custom-orders.md), which this builds on.

The owner's decisions are final and this spec doesn't re-open them:

- Option B, with no ADR and no docs beyond this spec.
- A share can be exactly ₱0.00, never below. A member at ₱0.00 stays in `amounts` as an explicit 0.
- Removing a session member leaves everyone else's amounts unchanged.
- OQ-CA1 is yes: shared, discount and charge sub-rows show the printed amount in Item Total.
- BR-CA11 and BR-CA33 are confirmed.

**No schema change, no API change, no new dependency.** The receipt lives inside the existing
`items` JSONB. Nothing touches existing rows on Neon `main`. `amounts` stays the one place money is
read from, so Summary, netting, settlement and Collection don't change.

### 1.1 Phasing

There are two build phases on this branch. Each can ship and be tested alone. **The stored `bill`
shape is final in Phase 1 and doesn't change in Phase 2.**

- **Phase 1 (P1): shared orders.** This phase builds:
  - the whole data layer, for all four row kinds: types, `bill.ts`, `parseBill`, member removal,
    and the display helper;
  - every display (staged pills, Breakdown, History, PDF), for every row kind;
  - in the form: shared orders, the share figures, and Fill Remainder counting shared orders.
- **Phase 2 (P2): discounts and charges in the form.** This phase builds:
  - the Discounts and Charges sections and their buttons;
  - their hints, the floor hint and the footer's Subtotal / Discounts / Charges lines;
  - Edit loading discounts and charges back.

**Why the data layer and displays for all four kinds land in P1.** Local development, sit, qat and
uat share one Neon `main` database. After P2 reaches sit, a uat tab still on P1 can open a session
that has a discount. P1's parser, member removal and displays therefore already handle every kind,
so nothing is dropped, mis-split or crashes.

The one thing P1's form can't show is a discount or charge row. So P1's Edit loads such an item the
way an older tab does: one unnamed line per member, holding their final amount. The money is kept
and the receipt detail goes (BR-CA45). P2 deletes that guard (section 5.4, `draftFromItem`).

Every section marks what belongs to **P1** or **P2**.

### 1.2 Assumptions

Each assumption is stated so it can be challenged:

1. The session's `members` array is alphabetical. The store sorts it with `compareNames`
   (`SessionsStoreContext.tsx` lines 266 and 362), so `selectedOwners` is alphabetical.
2. Row pickers on a phone are 44px tall. The item's own "Who's in this item" picker keeps PR #137's
   38px (decision 2).
3. On desktop the new sections are capped at 520px wide (section 6.1). On a phone they span the
   card.
4. A member on a row whose part is ₱0.00 (for example a ₱0.01 charge split three ways) shows
   "₱0.00" in that row's column, because they are on the row. Members who aren't on a row show
   nothing, as BR-CA35 says.
5. The PDF has no italic face, so the fallback labels ("Shared order", "Discount", "Charge") print
   in the sub-row's grey, as "No name" does today.

## 2. Layers touched

| Layer | File | Phase | Change | Reuses |
|---|---|---|---|---|
| Types | `src/types/index.ts` | P1 | New `BillLine`; optional `bill` on `CustomAmountItem`; the `amounts` doc comment (section 3.1). | |
| Schema | none | | | |
| API | `api/_validate.ts`, `api/sessions/[id].ts`, every other `api/` file | | **No change.** `parseSessionInput` → `parseSession` → `parseItem` picks up `parseBill`. | |
| Money (new) | `src/lib/bill.ts` | P1 | The split maths, the reconcile check and the display helper (section 5.2). | `splitEvenly`, `roundMoney`, `compareNames`, `formatMoney` |
| Format | `src/lib/format.ts` | P1 | New `formatSignedMoney` and `formatSignedAmount`. `formatMoney` and `formatAmount` don't change (section 5.6). | `formatAmount` |
| Validation | `src/lib/storage.ts` | P1 | New private `parseBill`, used by `parseItem` ahead of `parseOrderLines` (section 4). | `billMatches`, `normaliseOrderName`, `roundMoney` |
| Form logic | `src/lib/orderLines.ts` | P1, P2 | The bill draft types and row operations, `readBillDraft`, `itemFromLines` with a bill, `linesFromItem` and `billDraftFromItem` for Edit, and `fillRemainder`'s new `others` argument (section 5.4). | `linesOf`, `linesTotal`, `parsePositiveAmount`, `createId` |
| Money | `src/lib/calculations.ts` | P1 | `purgeMemberFromItem` gets a bill branch (section 5.5). **`getItemTotal` and `getItemShares` don't change.** | `billLineParts`, `billMatches` |
| Staging | `src/lib/staging.ts` | | **No change.** `purgeMemberFromStaged`, `stagedNamesMember`, `buildRecords` and `contributionsMatch` already read `amounts` and `getItemTotal`. | |
| UI | `src/components/home/PurchaseItemCard.tsx` | P1, P2 | `EMPTY_DRAFT.bill`, the derived bill view, new handlers, unpicking clears rows, `draftFromItem` and `stampFields` pass the bill, and the member-removal effect (section 5.4). | |
| UI | `src/components/home/ItemModeFields.tsx` | P1 | `ItemDraft.bill`, new handlers and the `derived.bill` prop passed through. | |
| UI | `src/components/home/CustomAmountFields.tsx`, `.module.css` | P1, P2 | The share figures, the three sections, the "+ Add" row, the hints and the footer lines (section 6.1). | `OwnerGrid` (`allLabel="Everyone"`), `ClearableInput`, `Button`, `.line`, `.priceBox`, `.lineHint`, `visually-hidden` |
| UI | `src/components/home/ItemStagingList.tsx` | P1 | Pills come from `receiptRows` for both `lines` and `bill` items (section 6.2). | `.linePill` |
| UI | `src/components/breakdown/BreakdownTable.tsx` | P1 | Sub-rows come from `receiptRows`; Item Total shows the printed amount on shared, discount and charge rows (section 6.3). **No CSS change.** | `.lineRow`, `.lastLine`, `.lineName`, `.noName`, `.num` |
| PDF | `src/pdf/TransactionTable.tsx` | P1 | Sub-rows come from `receiptRows`; signed amounts; font size fitted to the column (section 6.4). | `lineRow`, `lineCell`, `lineCellNum` |
| PDF | `src/pdf/layout.ts` | P1 | New `fitMonoFontSize` (section 6.4). | |
| Tour | none | | Section 7. | |
| Tests | `src/lib/bill.test.ts` (new), `src/lib/orderLines.test.ts`, `src/lib/calculations.test.ts`, `src/lib/storage.test.ts`, `src/lib/apiValidation.test.ts`, `src/lib/staging.test.ts`, `src/lib/format.test.ts`, `src/pdf/layout.test.ts` (new) | P1, P2 | Section 8. | |
| Docs | none (owner decision) | | Section 9. | |
| Requirements | `docs/specs/custom-split-adjustments-requirements.md` | | OQ-CA1 marked resolved; BR-CA35 no longer pending. Done with this spec. | |

## 3. Data model

**No schema change.** Items are already JSON in `purchase_records.items` (`jsonb`). There's no SQL
and no migration, and nothing is rewritten (BR-CA46). An item gets a `bill` only when a user saves
one.

### 3.1 Types (`src/types/index.ts`, P1)

```ts
/**
 * One row of a Custom item's receipt (BR-CA2 to BR-CA5). `amount` is always the
 * positive figure printed on the receipt, rounded to the centavo; `kind` says
 * whether it adds to the members' shares or comes off them.
 */
export type BillLine =
  /** One member's own order. */
  | { kind: 'order'; member: string; name: string; amount: number }
  /** Split equally across `members` (BR-CA3). */
  | { kind: 'shared'; members: string[]; name: string; amount: number }
  /** Comes off `members`' shares, split equally (BR-CA4). */
  | { kind: 'discount'; members: string[]; name: string; amount: number }
  /** Split equally across everyone in the item, the keys of `amounts` (BR-CA5). */
  | { kind: 'charge'; name: string; amount: number };
```

On every line:

- `name` is tidied with `normaliseOrderName`, and `''` means no name.
- `members` is non-empty, has no repeats, and is sorted with `compareNames` when this app writes it.

`CustomAmountItem` gains one field, and two doc comments change:

```ts
export type CustomAmountItem = {
  id: string;
  mode: 'custom';
  name: string;
  /**
   * member -> amount owed for this item, the one place every calculation reads
   * money from (BR-CO10, BR-CA42). A member who isn't in the item is absent.
   * With `lines`, each amount is the sum of that member's lines. With `bill`,
   * every member in the item is present, at ₱0.00 too (BR-CA6), and each amount
   * is what the bill gives them (`billAmounts`).
   */
  amounts: Record<string, number>;
  /** ...unchanged... */
  lines?: OrderLine[];
  /**
   * The whole receipt, own orders included, in BR-CA34 order: own orders by
   * member alphabetically and then as added, then shared orders, discounts and
   * charges, each as added. Present only when the item has at least one shared
   * order, discount or charge, and never alongside `lines` (BR-CA8, BR-CA43).
   */
  bill?: BillLine[];
};
```

### 3.2 Stored shapes

**Example A** (Mendokoro). Every member in the item is on an order or shared line:

```json
{
  "id": "item_…", "mode": "custom", "name": "Mendokoro",
  "amounts": { "Ana": 865, "Ben": 895 },
  "bill": [
    { "kind": "order", "member": "Ana", "name": "Ramen", "amount": 720 },
    { "kind": "order", "member": "Ben", "name": "Ramen", "amount": 750 },
    { "kind": "shared", "members": ["Ana", "Ben"], "name": "Gyoza", "amount": 290 }
  ]
}
```

**Example B**, abbreviated:

```json
"amounts": { "Ana": 420.93, "Ben": 490.93, "Cy": 260.93, "Dan": 335.92, "Eve": 450.92, "Fay": 441.42 },
"bill": [
  { "kind": "order", "member": "Ana", "name": "Sisig", "amount": 280 },
  { "kind": "order", "member": "Ana", "name": "Rice", "amount": 100 },
  …,
  { "kind": "order", "member": "Fay", "name": "Sinigang", "amount": 400.5 },
  { "kind": "discount", "members": ["Cy"], "name": "PWD", "amount": 300 },
  { "kind": "charge", "name": "Service charge", "amount": 245.55 }
]
```

**Example D1:** `"amounts": { "Ana": 0, "Ben": 600 }`. This is the first time `amounts` holds a 0.

**Every other item** keeps its PR #137 shape exactly:

- `{ id, mode, name, amounts }`;
- `{ id, mode, name, amounts, lines }`;
- an Equal Split item.

This includes a receipt whose shared, discount and charge rows all had no amount (BR-CA43).

The keys of each object are always built in the order shown, so two stamps of the same fields
serialize identically. `sameStaged` depends on that.

### 3.3 Readers of `amounts` now that it can hold a 0

| Reader | With a member at 0 |
|---|---|
| `getItemTotal` | Adds 0. Unchanged. |
| `getItemShares` (custom) | Returns `{ Ana: 0 }`. |
| `getRecordBreakdown`, `groupRecordsForBreakdown` totals | Add 0. The Total row is unchanged. |
| `getRawOwedMatrix` | Skips shares of 0 or less (`if (owed <= 0) continue`), so Ana owes nothing. |
| Net balances, settlement, Collection, `api/payments` (`settlementPairs`) | Built on the matrix. Unchanged. |
| `BreakdownTable`, `TransactionTable` item row | Show "—" for a share of 0 or less (AC-CA8.6). |
| `ItemStagingList` | A `bill` item draws its pills from the bill (6.2), never one pill per member, so "Ana: ₱0.00" never shows. |
| `stagedNamesMember` | `member in getItemShares(...)` is true, so removing Ana asks for confirmation, because she is on the item. |
| `linesFromItem` | The PR #137 branch still skips amounts of 0 or less. The new bill branch keeps every member (5.4). |
| `includeMember` | Only ever offers Equal Split items. Unchanged. |
| `demoSessions.renameMembers` (dev only) | Demo data has no `bill`. Unchanged. |

### 3.4 Why this shape is safe for an older tab (BR-CA45)

"Older tab" means a tab still running `343a8cb` (PR #137), or P1 once P2 ships. Such a tab doesn't
parse what it loads, and reads money only from `amounts`.

| What the older tab does | Result | Test (section 8) |
|---|---|---|
| Shows the session | `getItemTotal` and `getItemShares` read `amounts`, so the totals and shares are right. `item.lines` is absent, so it draws the item row with no sub-rows, and nothing crashes (AC-CA10.3). | OT-1 |
| Saves the session without touching the item | It sends the JSON as loaded, `bill` included. The server's `parseBill` keeps it (AC-CA10.4). | OT-2 |
| Edit, then Save with nothing changed | PR #137's `linesFromItem` sees no `lines` and gives each member with an amount above 0 one unnamed line. Its `itemFromLines` stores `amounts` alone. Every share and the total are unchanged. The bill and any member at ₱0.00 are gone, and that member owed nothing either way (AC-CA10.5). | OT-3 |
| Removes a member | PR #137's purge returns `{ ...item, amounts }`, keeping `bill` beside the shorter `amounts`. Either a shared or discount line names the removed member, or the charge split no longer matches, so `parseBill` drops the bill. The others' amounts are unchanged (AC-CA10.6). If the bill still reconciles, it's a correct receipt for the money stored. | OT-4 |
| Includes a late member | Custom items are never offered. No effect. | (existing `includeMember.test.ts`) |

**Rollback caveat.** If this release is rolled back, PR #137's `parseItem` drops `bill` on the next
save of each session that has one. Money is safe, because it's in `amounts`; the receipt detail is
lost. It's listed in section 11.

## 4. API contract

**No route, method, request shape, response shape or status code changes.**

- `PUT /api/sessions/[id]` keeps `getUserId` (401) and the owner-scoped update (404 for another
  account's id).
- It keeps `parseSessionInput` in `api/_validate.ts`, with 400 "Malformed session." only for a body
  that isn't an object.
- It keeps the `client.sql` templates.
- `GET /api/sessions` returns the stored JSON, which can now include `bill`.

The one change is what `parseItem` in `src/lib/storage.ts` keeps for a Custom item. Like
`parseOrderLines`, it **never rejects a session over a bill**. A bad bill is dropped whole, and the
item is stored from `amounts` alone (BR-CA44).

```ts
// in parseItem, the custom branch: amounts parsed exactly as today, then
const bill = parseBill(raw.bill, amounts);
if (bill) return { id, mode: 'custom', name, amounts, bill };
const lines = parseOrderLines(raw.lines, amounts);   // unchanged from here
return lines ? { id, mode: 'custom', name, amounts, lines } : { id, mode: 'custom', name, amounts };
```

A valid `bill` wins, and any `lines` beside it is ignored, so the two never coexist. An invalid
`bill` falls through to today's `lines` rule.

`parseBill(raw: unknown, amounts: Record<string, number>): BillLine[] | null` is private to
`storage.ts`. **Any failure returns `null`**, which means "store no bill":

1. `raw` must be a non-empty array.
2. Every entry must be an object with `name` a string and `amount` a finite number.
   `amount = roundMoney(amount)` must be above 0. `name = normaliseOrderName(name)`.
3. `kind` picks the line, which is rebuilt from known fields only, in the key order of 3.1:
   - `'order'`: `member` must be a string. **If `member` isn't an own key of `amounts`, the line is
     skipped, not failed.** That is a member removal made by an older tab, as `parseOrderLines`
     does today.
   - `'shared'` or `'discount'`: `members` must be an array of strings, non-empty, with no repeats
     (checked with a `Set`). The array is kept in the order sent.
   - `'charge'`: no member fields.
   - Any other `kind` fails.
4. With no shared, discount or charge line left, it returns `null`, so the item is stored as PR #137
   stores it (BR-CA43).
5. `billMatches(bill, amounts)` must be true (section 5.2). That covers members, BR-CA13, the
   centavo match and the floor.

An Equal item is rebuilt from its own fields, as today, so a stray `bill` on one is dropped.

**Cost.** This runs on every session write, over input with no size limit. Every step is linear in
the size of the bill plus `amounts`. In particular, `billAmounts` adds charges up without one
`splitEvenly` per charge per member (5.2). A test (S-12) parses 100,000 charges over 5,000 members
inside Vitest's default 5-second timeout. A version that splits each charge separately would need
about 5×10⁸ steps.

**Limits.** None on the number of rows, matching items, records and order lines. The 4.5 MB Vercel
body limit bounds a session.

## 5. Business logic

Everything new is a pure function in `src/lib`, with `.js` import suffixes, because `storage.ts`
(and so `bill.ts` and `orderLines.ts`) is reachable from `api/`. `apiImports.test.ts` checks this.
All money is handled in whole centavos (`Math.round(roundMoney(x) * 100)`) and compared in centavos.

### 5.1 Money rules at a glance

| Rule | Where | How |
|---|---|---|
| A row's parts (BR-CA15) | `billLineParts` | `splitEvenly(amount, n)` over the row's members sorted with `compareNames`. An order has its one member; a charge has everyone in the item. The leftover centavos go one each to the first names. Each row's parts add up to its amount exactly. |
| A member's final share (BR-CA16) | `billAmounts` | Own orders + shared parts + charge parts − discount parts, in centavos. |
| Who is in the item (BR-CA13) | `billMembers` | Every member on a priced order or a priced shared line. Never through a charge or discount alone. |
| Stored amounts (BR-CA42) | `itemFromLines` with a bill | `amounts = billAmounts(bill, billMembers(bill))`. Members at 0 are kept. |
| Item total (BR-CA18) | `getItemTotal`, **unchanged** | `sumMoney(Object.values(amounts))`, which equals Subtotal − Discounts + Charges whenever Add Item is allowed, because each row's parts add up to its amount. |
| Reconciling with `amounts` (BR-CA44) | `billMatches` | Each member's recomputed share equals `amounts[m]` to the centavo, and none is below 0. |
| The floor (BR-CA6, BR-CA11) | `readBillDraft().floorHint`, `billMatches` | A final share below 0 blocks Add Item and is never stored. Exactly 0 is fine. |
| Receipt figures (BR-CA17) | `readBillDraft` | Subtotal = own + every priced shared order. Entered = Subtotal − Discounts + Charges. |
| Fill Remainder (BR-CA20) | `fillRemainder(total, picked, lines, others)` | Remainder = Total Amount − own − `others`, split over the blank members as BR-CO11. |
| One Payor amount, Multiple Payors match (BR-CA18) | `stampFields`, `buildRecords`, `contributionsMatch`, **unchanged** | They read `getItemTotal` and `enteredTotal`, which are now the net. |
| Removing a member (BR-CA40) | `purgeMemberFromItem` | Each row loses the member's part. Everyone else's parts are provably unchanged (5.5). |

### 5.2 `src/lib/bill.ts` (new, P1)

Imports: `splitEvenly` and `roundMoney` from `./money.js`; `compareNames`, `formatMoney` and
`formatSignedMoney` from `./format.js`; types from `../types`. It imports nothing from
`orderLines.ts`, so there's no cycle.

```ts
const cents = (value: number) => Math.round(roundMoney(value) * 100);

/** Everyone in the item (BR-CA13): each member on an order or shared line, alphabetically, once. */
export function billMembers(bill: readonly BillLine[]): string[];

/** One member's part of one row, positive. */
export type BillPart = { member: string; amount: number };

/**
 * A row's parts (BR-CA15), alphabetically: an order is its member's; a shared
 * order or discount is `splitEvenly` over its members sorted with compareNames;
 * a charge is the same over `inItem`, and has no parts when nobody is in the item.
 */
export function billLineParts(line: BillLine, inItem: readonly string[]): BillPart[];
```

**`billAmounts(bill, inItem): Record<string, number>`** returns the final share of each member
(BR-CA16):

- **Who it covers.** Every member of `inItem` is present, at 0 too. So is any discount holder
  outside `inItem`, with a negative share, so the form can say whose share would go below zero.
- **Key order.** Keys are added in `compareNames` order.
- **Accumulator.** It's a `Map<string, number>` of centavos, turned into the record with
  `Object.fromEntries`. That makes a member called `__proto__` an own key, not the prototype.
- **Orders:** `+cents(amount)` to `member`.
- **Shared and discounts:** `parts = splitEvenly(amount, members.length)` over the members sorted
  with `compareNames`. Each part's centavos are added (shared) or subtracted (discount).
- **Charges** are added up in one pass, not one `splitEvenly` per charge (which would be lines ×
  members). Every charge splits over the same sorted `inItem` of size `n`, and
  `splitEvenly(c, n)` gives everyone `floor(c / n)` plus one centavo to the first `c mod n`.
  - So keep `base += Math.trunc(c / n)`, and a difference array `extra` of length `n + 1`, where
    `extra[0] += 1` and `extra[c % n] -= 1`.
  - Then walk the sorted members with a running sum `run += extra[i]`, and add `base + run` to
    member `i`.
  - This gives exactly what one `splitEvenly` per charge would, in O(charges + n). Test B-7 pins the
    equivalence.
  - With `n === 0`, charges contribute nothing. The form blocks that case with the charge hint.

```ts
/**
 * Whether `bill` is a receipt for exactly these amounts (BR-CA13, BR-CA42, BR-CA44).
 * The server keeps a bill, and member removal keeps one, only when this holds.
 */
export function billMatches(bill: readonly BillLine[], amounts: Record<string, number>): boolean;
```

1. `inItem = Object.keys(amounts)`. It must be non-empty.
2. Every member that an order, shared or discount line names must be an own key of `amounts`
   (`Object.hasOwn`).
3. Every key of `amounts` must be on at least one order or shared line (BR-CA13).
4. `got = billAmounts(bill, inItem)`. For every `m` of `inItem`, `cents(got[m]) >= 0` and
   `cents(got[m]) === cents(amounts[m])`.

**The display helper.** It's the one place that turns either stored shape into display rows. Every
reader uses it: staged pills, Breakdown and History, and the PDF.

```ts
export type ReceiptRow = {
  kind: BillLine['kind'];
  /** As stored; '' when unnamed. */
  name: string;
  /** The printed amount, positive. */
  amount: number;
  /** member -> their part, negative for a discount. A Map, so a member called `constructor` reads safely. */
  parts: Map<string, number>;
};

/**
 * The rows under an item, in stored order (BR-CA34), or null when it has none.
 * A `bill` item gives one row per line, its parts from `billLineParts` over the
 * keys of `amounts`. A `lines` item gives one 'order' row per line, so it draws
 * exactly as in PR #137. Equal Split and amounts-only items give null.
 */
export function receiptRows(item: PurchaseItem): ReceiptRow[] | null;

/** The row's label (BR-CA35); `fallback` when it has no name, so it's styled as "No name" is. */
export function receiptRowLabel(row: ReceiptRow): { text: string; fallback: boolean };
```

| `kind` | Named | Unnamed (`fallback: true`) |
|---|---|---|
| `order` | `name` | `No name` |
| `shared` | `` `${name} (shared)` `` | `Shared order` |
| `discount` | `name` | `Discount` |
| `charge` | `name` | `Charge` |

```ts
/** The staged-list pill for a row (BR-CA36). */
export function receiptPillText(row: ReceiptRow): string;
```

`receiptPillText` builds one string per kind:

- **`order`:** the PR #137 text, `` `${member} · ${name} ${formatMoney(amount)}` `` or
  `` `${member}: ${formatMoney(amount)}` ``.
- **`shared` and `discount`:** `` `${label} ${printed} · ${members.join(', ')}` ``. The label is
  `receiptRowLabel(row).text`. The printed amount is `formatMoney(amount)` for a shared order, or
  `formatSignedMoney(-amount)` for a discount. The members are `[...parts.keys()]`, which is already
  alphabetical.
- **`charge`:** `` `${label} ${formatMoney(amount)} · ${n === 1 ? onlyMember : `split ${n} ways`}` ``,
  where `n = parts.size`.

### 5.3 `src/lib/storage.ts` (P1)

`parseBill` and the `parseItem` change, as section 4 describes. `parseOrderLines` doesn't change.

### 5.4 `src/lib/orderLines.ts` and the form state

#### Draft types (P1, all three sections, so the draft doesn't change shape in P2)

```ts
/** A shared order or discount as typed (BR-CA3, BR-CA4). */
export type SplitRowDraft = {
  key: string;
  name: string;
  amount: string;
  /** "Everyone": every picked member, now and later (BR-CA21). */
  everyone: boolean;
  /** Who is ticked while `everyone` is off. */
  members: Record<string, boolean>;
};
/** A charge as typed: split over everyone in the item, so it has no picker (BR-CA5). */
export type ChargeRowDraft = { key: string; name: string; amount: string };
export type BillDraft = { shared: SplitRowDraft[]; discounts: SplitRowDraft[]; charges: ChargeRowDraft[] };
export type BillSection = keyof BillDraft;
export const EMPTY_BILL_DRAFT: BillDraft = { shared: [], discounts: [], charges: [] };
```

#### Row operations

These are pure, they never mutate their input, and they're written once for all three sections in
P1:

| Function | Effect |
|---|---|
| `hasBillRows(bill): boolean` | True when any section has a row, priced or not (BR-CA31). |
| `rowMembers(row, picked): string[]` | `row.everyone ? picked : picked.filter((m) => row.members[m])`. Unpicked members never count, so unpicking takes them off at once (BR-CA24). |
| `addBillRow(bill, section)` | Appends `{ key: createId('row'), name: '', amount: '' }`. Shared adds `everyone: true, members: {}` (BR-CA22). Discounts add `everyone: false, members: {}`. |
| `setBillRow(bill, section, index, patch: { name?: string; amount?: string })` | Merges `patch` into that row. |
| `removeBillRow(bill, section, index)` | Drops that row. A section can be emptied (BR-CA29). |
| `toggleRowEveryone(bill, section: 'shared' \| 'discounts', index)` | Ticked → `{ everyone: false, members: {} }`, so nobody is ticked (AC-CA1.5). Unticked → `{ everyone: true, members: {} }`. |
| `toggleRowMember(bill, section, index, member, picked)` | Flips `members[member]`. If `picked` is non-empty and every picked member is now ticked, the row becomes `{ everyone: true, members: {} }` (BR-CA21). |
| `unpickFromBill(bill, removed: string[], pickedAfter: string[])` | Deletes each removed member from every shared and discount row's `members` (BR-CA24). When `pickedAfter` is empty, also sets every row's `everyone` to false, so with nobody picked every row has nobody ticked (BR-CA25). Rows are never removed. |

#### `billFromDraft(picked, lines, bill): BillLine[]`

The receipt the form stands for, priced rows only, in BR-CA34 order:

1. **Own orders.** For each `m` of `picked` sorted by `compareNames`, and each line of
   `linesOf(lines, m)` with `parsePositiveAmount(l.price) > 0`:
   `{ kind: 'order', member: m, name: normaliseOrderName(l.name), amount }`.
2. **Shared orders.** For each `bill.shared` row with `amount = parsePositiveAmount(row.amount) > 0`
   and `members = rowMembers(row, picked).sort(compareNames)` non-empty:
   `{ kind: 'shared', members, name: normaliseOrderName(row.name), amount }`.
3. **Discounts.** The same, with `kind: 'discount'`.
4. **Charges.** For each priced charge: `{ kind: 'charge', name, amount }`.

A priced shared order or discount with nobody ticked is left out here. It still counts in the
figures and blocks Add Item through its hint.

#### `readBillDraft(picked, lines, bill): BillDraftView`

One memo in the card computes it.

```ts
export type BillDraftView = {
  /** member -> share (BR-CA16): billAmounts(receipt, billMembers(receipt)). A picked member absent here shows "—". */
  shares: Record<string, number>;
  subtotal: number;      // sumMoney([linesTotal(picked, lines), Σ priced shared])
  discounts: number;     // Σ priced discounts                      (P2)
  charges: number;       // Σ priced charges                        (P2)
  /** Entered (BR-CA17): sumMoney([linesTotal, others]). Equals linesTotal with no rows. */
  entered: number;
  /** Σ shared − Σ discounts + Σ charges: what Fill Remainder takes off besides own orders. */
  others: number;
  sharedHint: string | null;
  discountHint: string | null;   // P2
  chargeHint: string | null;     // P2
  floorHint: string | null;      // P2
};
```

`receipt = billFromDraft(picked, lines, bill)`. Each section's hint is the **first** problem in its
rows, in row order (section 7 of the requirements). `name` is `normaliseOrderName(row.name)` and
`amount` is `parsePositiveAmount(row.amount)`.

| Hint | Problem, checked per row in order | Text |
|---|---|---|
| `sharedHint` | `name !== ''` and `amount === 0` | `` `Add a price for ${name} or remove it` `` |
| | `amount > 0` and `rowMembers(row, picked)` empty | `` `Choose who shares ${name}` ``, or `Choose who shares the unnamed shared order` |
| `discountHint` | `name !== ''` and `amount === 0` | `` `Add an amount for ${name} or remove it` `` |
| | `amount > 0` and nobody ticked | `` `Choose who gets ${name}` ``, or `Choose who gets the unnamed discount` |
| `chargeHint` | `name !== ''` and `amount === 0` | `` `Add an amount for ${name} or remove it` `` |
| | `amount > 0` and `billMembers(receipt)` empty | `Charges are split across the people with orders. Add an order first.` |
| `floorHint` | The first member, by `compareNames`, with `cents(shares[m]) < 0` | `` `${m}'s share would be ${formatSignedMoney(shares[m])}. Lower the discount or add ${m}'s order.` `` |

A row with no name and no amount is never a problem. It's dropped at Add Item (BR-CA28, AC-CA1.10).

#### `fillRemainder(totalAmount, picked, lines, others = 0)` (P1)

The new last argument is the net of the item's shared orders, discounts and charges (BR-CA20). The
call becomes:

```ts
distributeRemainder(totalAmount, [linesTotal(picked, lines), others], blank.length)
```

- Nothing else changes: blank is still `blankPicked`, and the result goes into each blank member's
  first line.
- The default of 0 keeps every PR #137 caller and test as it is.
- Filling never touches a bill row. Entered after the fill is own + fills + `others`, which is Total
  Amount, because the fills add up to the remainder exactly.

#### `itemFromLines(id, name, picked, lines, bill = EMPTY_BILL_DRAFT)` (P1)

```ts
const receipt = billFromDraft(picked, lines, bill);
if (receipt.some((l) => l.kind !== 'order')) {
  return { id, mode: 'custom', name, amounts: billAmounts(receipt, billMembers(receipt)), bill: receipt };
}
// ...PR #137's body, unchanged: amounts above 0 only, `lines` only when one is named (BR-CA43).
```

#### `linesFromItem(item, members)` (P1)

A new first branch handles a `bill` item:

- It covers each `m` of `members` that is an own key of `item.amounts`, at 0 too (BR-CA38,
  AC-CA7.3), in `members` order.
- The member's drafts are their `kind: 'order'` lines in stored order, each as
  `{ name, price: amount.toFixed(2) }`.
- With none, the member gets `[{ name: '', price: '' }]`. They are only on a shared order and still
  need an entry, because `draftFromItem` reads the picked members from `Object.keys(lines)`
  (AC-CA7.4).
- Keys are `FIRST_LINE_KEY` for each member's first line, then `createId('line')`.

Items without a `bill` take PR #137's branch, unchanged.

#### `billDraftFromItem(item, members): BillDraft` (P1 shared, P2 discounts and charges)

- Without `item.bill`, it returns `EMPTY_BILL_DRAFT`.
- Otherwise, `picked = members.filter((m) => Object.hasOwn(item.amounts, m))`.
- **Each shared or discount line** becomes:

  ```ts
  {
    key: createId('row'),
    name: line.name,
    amount: line.amount.toFixed(2),
    everyone,
    members: everyone ? {} : { [m]: true for each m of line.members that is in picked },
  }
  ```

  where `everyone` is true when the line's members are exactly `picked`, as a set (BR-CA38).
- **Each charge** becomes `{ key, name, amount }`.
- Rows stay in stored order, within their section.

**Round trip (BR-CA38).** `itemFromLines(id, name, picked, linesFromItem(item), billDraftFromItem(item))`
deep-equals `item` for any item `parseBill` keeps and that this app wrote. The reasons:

- `picked` is the keys of `amounts`.
- "Everyone" resolves back to the same members.
- `toFixed(2)` → `parsePositiveAmount` returns the same centavos.
- `normaliseOrderName` is idempotent.

Two such stamps are `JSON.stringify`-equal, so an unchanged Save Edits writes nothing (AC-CA7.5).

#### `PurchaseItemCard.tsx`

- **`EMPTY_DRAFT`** gains `bill: EMPTY_BILL_DRAFT`. That alone clears every row on Custom → Equal
  Split, because the mode switch's `keep` spreads `EMPTY_DRAFT` (BR-CA33, no confirmation). Equal
  Split → Custom stays as it is, with no rows (BR-CA32).
- **`draftFromItem`, custom branch:**

  ```ts
  // P1 only: P1's form can't show a discount or charge, so such an item loads the
  // way an older tab loads it, money only (BR-CA45). Deleted in P2.
  const source = item.bill?.some((l) => l.kind === 'discount' || l.kind === 'charge')
    ? { id: item.id, mode: 'custom' as const, name: item.name, amounts: item.amounts }
    : item;
  const lines = linesFromItem(source, members);
  // ...picked, everyone and totalAmount as today...
  return { ...as today, lines, bill: billDraftFromItem(source, members) };
  ```

  In P2, `source` is simply `item`.
- **`stampFields`, custom branch:** `itemFromLines(id, name, owners, draft.lines, draft.bill)`.
- **Derived values:**

  ```
  billView     = useMemo(() => readBillDraft(selectedOwners, draft.lines, draft.bill), [...])
  enteredTotal = billView.entered        // replaces linesTotal(...); equal to it with no rows
  remainder    = roundMoney(num(draft.totalAmount) - enteredTotal)   // unchanged formula
  itemValid (custom) = enteredTotal > 0 && missingPrice === null && billView.sharedHint === null
                       && billView.discountHint === null && billView.chargeHint === null
                       && billView.floorHint === null
  ```

  `itemTotal`, `contributionsMatch`, `canAddItem` and Save Edits' enabled state are unchanged in
  code, and now read the net (AC-CA6.1 to AC-CA6.3, BR-CA28).
- **Handlers** (the ones not listed are unchanged):

  | Handler | Effect on `draft` |
  |---|---|
  | `toggleAll` (un-ticking) | As today, plus `bill: unpickFromBill(d.bill, members, [])` (BR-CA25). |
  | `toggleOwner(m)` (un-ticking) | As today, plus `bill: unpickFromBill(d.bill, [m], pickedAfter)`, where `pickedAfter` is the picked members after the change (BR-CA24). |
  | `addBillRow(section)`, `setBillRow`, `removeBillRow`, `toggleRowEveryone`, `toggleRowMember(section, index, m)` | `bill: fn(d.bill, ...)`. `toggleRowMember` passes `picked` computed from `d`. |
  | `fillRemainder` | `fillRemainder(num(d.totalAmount), selectedOwners, d.lines, billView.others)`. |

- **Member-removal effect:** inside its `setDraft`, also run
  `bill: unpickFromBill(d.bill, removed, pickedAfter)` (AC-CA9.5).
- **Late member** (BR-CA14): nothing to add. With "All Members" ticked, `picked` grows, and
  `rowMembers` puts them on every "Everyone" row.

`ItemModeFields.tsx` adds `bill: BillDraft` to `ItemDraft`, the five bill handlers to
`ItemDraftHandlers`, and `bill: BillDraftView` to `ItemDraftDerived`, and passes them through to
`CustomAmountFields`.

### 5.5 Removing a member: `purgeMemberFromItem` (P1, BR-CA40)

The custom branch gains one line before `if (!item.lines)`:

```ts
if (item.bill) return purgeMemberFromBill(item, member, amounts);  // amounts: without the member, non-empty
```

`purgeMemberFromBill` is private to `calculations.ts`:

1. **Nothing left to pay.** If `cents(sumMoney(Object.values(amounts))) <= 0`, return `null`
   (BR-CA40, Example F5). An item worth ₱0.00 moves no money.
2. **The parts it removes.** `before = Object.keys(item.amounts)`. For each line, in order:
   - **An order:** kept unless it is the member's own.
   - **Shared, discount or charge:** take the member's part from `billLineParts(line, before)`. If
     they have none, the line is kept as it is. Otherwise `amount = roundMoney(line.amount - part)`.
     - If `amount <= 0`, the line goes. The others' parts on it were 0.
     - A charge keeps `{ ...line, amount }`.
     - A shared order or discount keeps `{ ...line, members: without the member, amount }`, unless
       no member is left, in which case it goes.
3. **What it returns.** `ok = billMatches(next, amounts)`.
   - `ok` and some non-order line left: `{ id, mode: 'custom', name, amounts, bill: next }`.
   - `ok` and some order line named: `{ id, mode: 'custom', name, amounts, lines }`, built from the
     order lines. This is PR #137's shape (BR-CA40).
   - Otherwise: `{ id, mode: 'custom', name, amounts }`.
   - The `ok` check catches the rare centavo case where removal leaves a member on no priced order or
     shared line. The money is never touched; only the detail can go.

**Why nobody else's part moves.** Say a row of `c` centavos is split over sorted members, with
`b = floor(c / n)` and `r = c mod n`, so the first `r` members get `b + 1`. Remove the member at
index `k`:

- **`k < r`:** `c' = (n−1)b + (r−1)`, with `r − 1 < n − 1`. So the first `r − 1` of the rest get
  `b + 1`. Those are exactly the ones that had it.
- **`k ≥ r` and `r < n − 1`:** `c' = (n−1)b + r`. So the first `r` get `b + 1`, as before.
- **`k ≥ r` and `r = n − 1`:** then `k = n − 1`, so `c' = (n−1)(b+1)`, and everyone left gets
  `b + 1`, as before.

So `amounts` is never recomputed. It's the old one minus the member, and `billMatches` confirms the
new bill against it. Test C-4 pins this over a grid of row amounts and member counts.

Saved records (`removeMember`) and staged items (`purgeMemberFromStaged`) both go through this:

- A `null` item is dropped.
- A record left with no items or no payors goes, as today.
- Multiple Payors contributions aren't rescaled, as today.

### 5.6 Negative amounts (`src/lib/format.ts`, P1, BR-CA37)

`formatMoney(-300)` gives "₱-300.00" today, and nets and balances may already rely on that, so
**`formatMoney` and `formatAmount` don't change.** Two new functions:

```ts
/** U+2212: the true minus sign. DM Mono has it at the digits' width (600/1000 em), so it fits the PDF's columns. */
const MINUS = '−';

/** Money with a leading minus, "−₱300.00", for a discount (BR-CA37); otherwise formatMoney. */
export function formatSignedMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe <= -0.005 ? `${MINUS}${formatMoney(-safe)}` : formatMoney(safe);
}

/** The same for the PDF, whose amounts carry no currency: "−300.00". */
export function formatSignedAmount(value: number): string;  // same rule over formatAmount
```

A value between −0.005 and 0 reads "₱0.00", so "−₱0.00" never shows. Test F-2 pins
`formatMoney(-300) === '₱-300.00'`, so the existing output is checked as unchanged.

## 6. UI

### 6.1 Custom Amounts fields (`CustomAmountFields.tsx`, `.module.css`)

**New props:** `bill: BillDraft`, `billView: BillDraftView`, `onAddBillRow`, `onBillRowChange`,
`onRemoveBillRow`, `onToggleRowEveryone` and `onToggleRowMember`, with the signatures of 5.4. With
no rows, everything below renders exactly the PR #137 markup (AC-CA10.2, AC-CA11.3).

From top to bottom, matching section 7 of the requirements:

1. **Total Amount and Fill Remainder:** unchanged. `canFill` and the tooltip use `remainder`, which
   is now Total Amount − the net (AC-CA5.3).
2. **"Who's in this item":** unchanged.
3. **Member blocks.** When `hasBillRows(bill)`, the name is wrapped in
   `<div className={styles.blockHead}>` together with the share:

   ```tsx
   <span className={`${styles.share} ${negative ? styles.negative : ''}`}>
     <span className="visually-hidden">{m}'s share </span>
     {m in-shares ? formatSignedMoney(shares[m]) : '—'}
   </span>
   ```

   - The test for "in shares" is `Object.hasOwn(billView.shares, m)`.
   - `negative` is `cents < 0`, and shows in `var(--warn-text)`.
   - The accessible text reads "Ana's share ₱420.93", or "Ana's share —" (AC-CA4.1, AC-CA4.2).
   - Without rows, the block keeps PR #137's lone `<span className={styles.blockName}>`.
4. **Own-order hint:** unchanged.
5. **Sections**, in the order Shared orders, Discounts, Charges, each rendered only while it has a
   row (BR-CA29). Each section is a `<div className={styles.billSection} role="group"
   aria-labelledby={`custom-${section}-label`}>` holding:
   - `<span id=… className={styles.sectionLabel}>` with "Shared orders", "Discounts" or "Charges".
   - A helper line `<p className={styles.helper}>`, for Discounts ("Comes off the share of the people
     ticked.") and Charges ("Split equally across everyone in this item."). Shared orders has none.
   - One `<div className={styles.billRow} key={row.key}>` per row, holding:
     - A **`<div className={styles.line}>`**: PR #137's line grid and phone rules, reused unchanged.
       It holds:
       - the name `ClearableInput`, `type="text"`, `compactClear`, `maxLength={ORDER_NAME_MAX}`,
         with the placeholder "Order name", "Discount name" or "Charge name";
       - the amount `ClearableInput`, `type="number"`, `className={styles.priceBox}`, `min="0"`,
         `step="0.01"`, `placeholder="0.00"`;
       - the `<Button variant="icon">×</Button>`, on **every** row (BR-CA29), with `title`
         "Remove shared order", "Remove discount" or "Remove charge".
     - For shared orders and discounts, the picker:
       `<div className={styles.rowPicker} role="group" aria-label={…}><OwnerGrid members={picked}
       selected={row.members} allSelected={row.everyone} onToggleAll={…} onToggle={…}
       allLabel="Everyone" /></div>`. This is the same control as the item picker (BR-CA21), and its
       pills are locked while "Everyone" is ticked.
   - The section's hint, `<p className={styles.lineHint}>`, from `billView`.
6. **"+ Add" buttons.** `<div className={styles.addRow}>` with ghost `size="sm"` buttons
   "+ Add shared order" (P1), and "+ Add discount" and "+ Add charge" (P2). They render only when
   `picked.length > 0` (AC-CA1.1). Their accessible name is their visible text.
7. **Floor hint (P2):** `<p className={styles.lineHint}>{billView.floorHint}</p>` when set.
8. **Footer.** When `billView.discounts > 0 || billView.charges > 0` (P2), a
   `<div className={styles.totals}>` holds these lines, then today's `.footer` unchanged:
   - `<div className={styles.figure}><span>Subtotal</span><span className={styles.figureValue}>₱X</span></div>`;
   - "Discounts −₱Y", only when `discounts > 0`, with `formatSignedMoney(-discounts)`;
   - "Charges ₱Z", only when `charges > 0`.

   Otherwise the footer renders alone, as today (AC-CA4.3, AC-CA4.4).

**Accessible names** (`n = index + 1`, `name = normaliseOrderName(row.name)`):

| Control | Shared orders | Discounts | Charges |
|---|---|---|---|
| Name box | `Shared order n name` | `Discount n name` | `Charge n name` |
| Amount box | `Shared order n price` | `Discount n amount` | `Charge n amount` |
| Clear buttons | `Clear shared order n name` / `… price` | `Clear discount n name` / `… amount` | `Clear charge n name` / `… amount` |
| × | `Remove shared order ${name}` / `Remove shared order` | `Remove discount ${name}` / `Remove discount` | `Remove charge ${name}` / `Remove charge` |
| Picker group | `Who shares ${name}` / `Who shares shared order n` | `Who gets ${name}` / `Who gets discount n` | none |

The "Everyone" and member pills are `OwnerPill` labels. Their names are "Everyone" and the member's
name, inside the named group (AC-CA11.4).

**CSS**, added to `CustomAmountFields.module.css`. Nothing existing changes.

```css
/* The share sits on the name's line and wraps under it when the name is long. */
.blockHead { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 2px 8px; }
.share { font-family: var(--mono); font-size: 12px; color: var(--text); }
.negative { color: var(--warn-text); }

/* Rows don't need the card's whole width on a desktop (requirements, section 7). */
.billSection { display: flex; flex-direction: column; gap: 6px; max-width: 520px; }
.sectionLabel { font-size: 12px; font-weight: 500; color: var(--text2); }  /* the "Who's in this item" label */
.helper { font-size: 12px; color: var(--text3); }
.billRow { display: flex; flex-direction: column; gap: 6px; }
.billRow + .billRow { padding-top: 8px; border-top: 1px solid var(--border); }
.addRow { display: flex; flex-wrap: wrap; gap: 6px; }

.totals { display: flex; flex-direction: column; gap: 4px; }
.figure { display: flex; justify-content: flex-end; gap: 8px; font-size: 12px; color: var(--text2); }
.figureValue { font-family: var(--mono); color: var(--text); }
```

Inside the existing `@media (max-width: 640px)` block:

```css
.billSection { max-width: none; }
.addRow > button { min-height: 44px; }
/* The row pickers' pills, 44px like every other control in a row (AC-CA11.1). */
.rowPicker label { min-height: 44px; }
```

- `.line input` and `.line > button` already give the boxes and × 44px on a phone.
- `.rowPicker label` (0,1,1) outranks `OwnerPill`'s phone `.pill` rule (0,1,0).
- `.addRow` wraps, so the three "+ Add" buttons stack when they don't fit.
- At 320px, a row uses PR #137's `minmax(0, 1fr) 92px 44px` grid, so the name box keeps about 100px
  and there's no horizontal scroll (AC-CA11.1, AC-CA11.2).

**Desktop:** the member blocks keep their grid. The new sections, share figures and footer lines
are the only additions; nothing else in Purchase Details moves (AC-CA11.3).

### 6.2 Staged list pills (`ItemStagingList.tsx`, P1)

`const rows = receiptRows(item)`:

- When `rows` is set, the list draws one `<span className={`${styles.pill} ${styles.linePill}`}>`
  per row with `receiptPillText(row)`, keyed `` `${item.id}:${i}` ``. A `lines` item gives exactly
  today's text (AC-CA10.2). A `bill` item gives BR-CA36's text (AC-CA7.1).
- Otherwise it keeps today's per-member pills.
- The price column stays `getItemTotal(item)`, which is the net (BR-CA18).

No CSS change: `.linePill` already wraps.

### 6.3 Breakdown and History (`BreakdownTable.tsx`, P1)

`const rows = receiptRows(row.item)` replaces `const lines = …`. With rows, the item row gets
`styles.hasLines`, and each sub-row is:

```tsx
<tr key={`${row.item.id}:${i}`} className={`${styles.lineRow} ${last ? styles.lastLine : ''}`}>
  <td className={styles.lineName}>
    {label.fallback ? <span className={styles.noName}>{label.text}</span> : label.text}
  </td>
  <td className={styles.num}>{r.kind === 'order' ? '' : formatSignedMoney(r.kind === 'discount' ? -r.amount : r.amount)}</td>
  {members.map((m) => (
    <td key={m} className={styles.num}>{r.parts.has(m) ? formatSignedMoney(r.parts.get(m)!) : ''}</td>
  ))}
  {editable && <td />}
</tr>
```

- **Own-order sub-rows** render exactly as in PR #137: the same label, an empty Item Total (BR-CO14),
  and the amount in the member's column.
- **Shared, discount and charge sub-rows** show the printed amount in Item Total, in the sub-row
  style that `.table tr.lineRow td` already gives (OQ-CA1, BR-CA35). Members not on a row get an
  empty cell, never "—".
- The item row and Total row are unchanged (AC-CA8.5).
- History renders the same table with `editable={false}`, so its sub-rows come for free (AC-CA8.3).
- On a phone, sub-rows scroll inside the same table, as today. A member column is at least 96px, and
  "−₱1,234.56" in 12px mono is about 72px.

### 6.4 PDF (`TransactionTable.tsx`, `layout.ts`, P1)

`receiptRows` replaces `lines`, and the keep-together wrapper stays (BR-CO15). For each sub-row:

- **Item cell:** `receiptRowLabel(r).text`, in `lineCell`.
- **Price cell:** `''` for an order. Otherwise `formatSignedAmount(signed amount)`.
- **Member cells:** `formatSignedAmount(r.parts.get(m))` for members on the row, `''` for the rest.

**Width of the 34pt column.** I measured this from `public/fonts/DMMono-Regular.ttf`:

- Every digit, `,`, `.`, `-` and U+2212 is 600/1000 em wide. At the sub-row's 7pt, that's 4.2pt
  per character.
- The narrowest member column is 34pt (`computeColumnWidths`, from 17 members). After
  `lineCellNum`'s 3pt padding on each side, it has a 28pt text box.
- "−300.00" needs 29.4pt and "−1,234.56" needs 37.8pt, so **even a three-digit discount doesn't fit
  at 7pt.**

New pure helper in `src/pdf/layout.ts`:

```ts
/** DM Mono draws every character 0.6 em wide (DMMono-Regular.ttf: digits, separators and U+2212 alike). */
const MONO_ADVANCE = 0.6;
/** `cellNum` and `lineCellNum` pad 3pt on each side. */
const NUM_CELL_PADDING = 6;

/**
 * The largest font size, up to `size`, at which `text` fits a number cell of
 * `columnWidth`, rounded down to 0.1pt, so an amount is never clipped or runs
 * into the next column (BR-CA35).
 */
export function fitMonoFontSize(text: string, columnWidth: number, size: number): number {
  const room = columnWidth - NUM_CELL_PADDING;
  const per = text.length * MONO_ADVANCE;
  return per * size <= room ? size : Math.floor((room / per) * 10) / 10;
}
```

Every sub-row number cell, in the price and member columns, gets
`{ fontSize: fitMonoFontSize(text, width, 7) }`. Wherever the text fits at 7pt, which is every
column wider than 34pt for amounts like today's, it returns 7 and the PDF is unchanged. At 34pt,
"−300.00" prints at 6.6pt and "−1,234.56" at 5.1pt.

This also applies to own-order sub-rows, so a PR #137 line of ₱1,000 or more at 17+ members now
shrinks instead of overflowing (decision 3). The item rows (7.5pt) are left as they are. The same
overflow already exists there at 17+ members and isn't part of this change.

## 7. Onboarding tour impact

**None** (BR-CA47):

- No `data-tour` attribute is added, moved, renamed or duplicated. `src/components/home`,
  `src/components/breakdown`, `src/components/shared` and `src/pdf` have none (checked with grep).
- No step is added or changed, and none can target these fields. They're inside Custom Amounts,
  which is never on screen during the tour.
- The `tab-expenses` copy ("Split evenly or give each person an exact amount — one purchase can mix
  both.") stays true.
- `steps.test.ts` and `targets.test.ts` must pass unchanged.

## 8. Test plan

The Vitest environment is `node`, and only `src/**/*.test.ts` runs, so component behaviour is the
ui-ux-tester's. Every new test fails first, because the function or rule doesn't exist yet. Test IDs
(B-, O-, C-, S-, A-, T-, F-, L-, OT-) are referenced from the mapping in 8.2.

### 8.1 Unit tests

**`src/lib/bill.test.ts`** (new, P1):

- **B-1 `billLineParts`, shared and the variant:**
  - Example A's Gyoza ₱290.00 over `['Ben', 'Ana']` gives Ana 145.00, Ben 145.00.
  - ₱290.01 gives Ana 145.01, Ben 145.00 (AC-CA1.4).
  - Members are sorted with `compareNames` whatever order they come in, case-insensitively
    (`'ana'` before `'Ben'`).
- **B-2 `billLineParts`, charge:** Example B's ₱245.55 over six gives Ana, Ben and Cy 40.93, and
  Dan, Eve and Fay 40.92 (AC-CA3.2). With nobody in the item it gives `[]`.
- **B-3 `billLineParts`, discount:** Example E's ₱250.01 over Dan and Eve gives Dan 125.01, Eve
  125.00 (AC-CA2.4).
- **B-4 `billMembers`:** order and shared members, once each, alphabetically. A discount-only holder
  isn't included (BR-CA13).
- **B-5 `billAmounts`, Examples A to E as tables:**
  - A: 865.00 / 895.00. The variant: 865.01 / 895.00.
  - B: the six shares. Their sum is 2,401.05 = 2,455.50 − 300.00 + 245.55.
  - C2 before the fill: 429.11, 499.11, 269.11, 344.11, 459.11, with no Fay key.
  - D1: `{ Ana: 0, Ben: 600 }`, with the Ana key present.
  - D2 at ₱450.00 / ₱502.50 / ₱510.00: Ana 52.50 / 0.00 / −7.50, and Ben 652.50 each time.
  - E: Dan −125.01, Eve −125.00.
- **B-6 `billAmounts`, discount outside the item:** a holder outside `inItem` gets a negative share
  (AC-CA2.9).
- **B-7 Linear charges equal `splitEvenly` per charge:**
  - For charge amounts 0.01 to 1.00 in steps of 0.01, and 1 to 7 members, plus three charges at
    once, `billAmounts` equals the sum of the signed `billLineParts` to the centavo.
  - Every row's parts sum to its amount.
- **B-8 `billMatches`:**
  - True for a stamp of Example B.
  - False for each of these: an amounts key on no order or shared line; a shared or discount member
    not in amounts; one centavo off; a share below 0; empty amounts.
- **B-9 `receiptRows`:**
  - A `lines` item gives one `order` row per line, with `parts` holding just that member, so the
    display is unchanged (AC-CA10.2).
  - A `bill` item gives its lines in stored order, with discount parts negative.
  - Equal Split and amounts-only items give `null`.
  - A member called `constructor` reads from `parts` correctly.
- **B-10 `receiptRowLabel` and `receiptPillText` (BR-CA35, BR-CA36, AC-CA7.1):**
  - "Ana · Sisig ₱280.00", "Fay: ₱400.50", "Gyoza (shared) ₱290.00 · Ana, Ben",
    "Shared order ₱290.00 · Ana, Ben", "PWD −₱300.00 · Cy", "Discount −₱300.00 · Cy",
    "Service charge ₱245.55 · split 6 ways", "Charge ₱245.55 · split 6 ways".
  - A one-member charge gives "VAT ₱12.00 · Ana".
  - The fallback flag is set for unnamed rows.

**`src/lib/orderLines.test.ts`** (add). These are P1 unless marked P2:

- **O-1 Row operations (BR-CA21 to BR-CA25):**
  - `addBillRow`: a shared row starts with `everyone: true`, a discount row with nobody, and a charge
    row has no picker fields.
  - `toggleRowEveryone` unticks to nobody (AC-CA1.5).
  - Ticking every picked member one by one becomes `everyone: true`.
  - `rowMembers` ignores unpicked members, and picks up a late member on an "Everyone" row
    (BR-CA14, AC-CA1.11).
  - `unpickFromBill` removes the member from hand-picked rows. With nobody left picked, it unticks
    "Everyone" too (BR-CA25). It never removes a row (AC-CA9.5).
  - None of them mutate their input.
- **O-2 `readBillDraft`, shared (P1):**
  - Example A: shares 865/895, entered 1,760.00 (AC-CA1.3). The variant: 865.01/895.00 (AC-CA1.4).
  - Only Ben ticked: Ben gets all 290.00, with no hint (AC-CA1.6).
  - Named and unpriced: "Add a price for Gyoza or remove it" (AC-CA1.9).
  - Priced with nobody ticked: "Choose who shares Gyoza", and "Choose who shares the unnamed shared
    order" with no name (AC-CA1.5).
  - An unnamed, unpriced row: no hint, and no line in `billFromDraft` (AC-CA1.10).
  - Gus picked with nothing typed and the Gyoza on "Everyone": Gus is in `shares` (AC-CA1.11).
  - With no rows, `entered === linesTotal` and every hint is null.
- **O-3 `readBillDraft`, discounts and charges (P2):**
  - Example B: shares, `subtotal` 2,455.50, `discounts` 300.00, `charges` 245.55, `entered` 2,401.05
    (AC-CA2.3, AC-CA3.2, AC-CA4.3).
  - E (AC-CA2.4).
  - D1: Ana 0, no floor hint (AC-CA2.5).
  - D2's three vouchers: the floor hint at ₱510.00 reads exactly "Ana's share would be −₱7.50. Lower
    the discount or add Ana's order.", and none at ₱502.50 (AC-CA2.6).
  - Cy holding ₱300.00 with nothing ordered: "Cy's share would be −₱300.00. …" (AC-CA2.9).
  - The hints "Choose who gets PWD" and "Choose who gets the unnamed discount" (AC-CA2.2).
  - "Add an amount for PWD or remove it" (AC-CA2.7) and "… for VAT …" (AC-CA3.5).
  - "-300" and "0" read as no amount (AC-CA2.8).
  - A priced charge with nobody in the item: the charge hint (AC-CA3.4).
  - D2's charge gives Ana 52.50 (AC-CA3.3).
  - A blank picked member gets no charge part and isn't in `shares` (AC-CA3.6, AC-CA4.2).
  - Example A: `discounts === 0 && charges === 0`, so the footer lines don't show (AC-CA4.4).
  - With a missing amount on row 2 and nobody ticked on row 1, row 1's hint shows.
- **O-4 `fillRemainder` with `others`:**
  - C1: Ben's first line gets "750.00", although he's on the Gyoza (AC-CA5.1, P1).
  - C2: Fay gets "400.50", and `readBillDraft` afterwards gives Example B's shares and entered
    2,401.05 (AC-CA5.2, P2).
  - `others` defaults to 0, so every existing `fillRemainder` test passes unchanged.
- **O-5 `itemFromLines` with a bill:**
  - Example A stamps to exactly the JSON of 3.2, keys in that order (P1). Example B likewise (P2).
  - D1 keeps `Ana: 0` (P2, BR-CA42).
  - With only unpriced shared, discount and charge rows, the item is PR #137's shape, with no `bill`
    key (BR-CA43, P1).
  - Two stamps are `JSON.stringify`-equal. "Everyone" resolves to the picked members, sorted.
- **O-6 Edit round trip (BR-CA38):**
  - `itemFromLines(id, name, picked, linesFromItem(item, members), billDraftFromItem(item, members))`
    deep-equals the item, and two such stamps are JSON-equal (AC-CA7.2, AC-CA7.5). This covers A
    (P1) and B, D1 and E (P2).
  - D1 loads Ana picked with her Pasta (AC-CA7.3, P2).
  - A member only on a shared order loads picked, with one empty own line, and ticked on it
    (AC-CA7.4, P1).
  - "Everyone" is ticked only when a row's members are every member in the item.
  - PR #137 items: `billDraftFromItem` gives `EMPTY_BILL_DRAFT`, and every existing `linesFromItem`
    test passes unchanged.

**`src/lib/calculations.test.ts`** (add, P1):

- **C-1 Example F through `purgeMemberFromItem`** (AC-CA9.1 to AC-CA9.4):
  - F1, remove Ben: every other share is identical, the total is 1,910.12, and the charge is ₱204.62.
  - F2, remove Cy: the PWD line is gone, the charge is ₱204.62, and the total is 2,140.12.
  - F3, remove Ben: Gyoza ₱145.00 stays as a one-member shared order for Ana, and Ana is 865.00. The
    variant keeps 145.01.
  - F4, remove Dan: Senior becomes ₱125.00 for Eve. Removing Eve instead gives ₱125.01 for Dan.
  - F5, D1 remove Ben: `null`.
  - Every result that keeps a bill passes `billMatches`.
- **C-2 Back to PR #137's shape:**
  - A bill left with orders only becomes `lines` when one is named, and amounts alone otherwise.
  - A ₱0.01 charge over three, removing the member who had the centavo, drops the charge line and
    leaves the others unchanged.
- **C-3 A member not on the item** comes back as the same object.
- **C-4 Parts don't move (5.5):** for row amounts 0.01 to 2.00 and 2 to 6 members, removing each
  member in turn leaves every other member's `billLineParts` part identical.
- **C-5 Summary equals hand-typed shares** (AC-CA6.1, AC-CA8.5):
  - Example B as a `bill` item and as `amounts` alone give equal `getItemTotal` (2,401.05),
    `getItemShares`, `getRawOwedMatrix`, `getNetBalances` and `getFinalSettlement`.
  - With One Payor Ana, the raw matrix has Ben 490.93, Cy 260.93, Dan 335.92, Eve 450.92, Fay 441.42
    owing Ana.
  - D1 with One Payor Ben: Ana owes nothing.
- **OT-1 Older tab shows:** Example B's `bill` item has no `lines` key. `getItemTotal` and
  `getItemShares` equal the hand-typed item, so a PR #137 reader shows the right money and no
  sub-rows (AC-CA10.3).
- **OT-3 Older tab edits and saves:** strip `bill` (what a tab that doesn't know the field sees),
  then run PR #137's path, which is today's `linesFromItem` and `itemFromLines` for items without a
  `bill`. This test only holds because that path is unchanged.
  - Every share above 0 and the total are unchanged.
  - D1's Ana is absent.
  - `parseSession` of the result has no `bill` and no `lines` (AC-CA10.5).
- **OT-4 Older tab removes a member:** `{ ...item, amounts: withoutBen }`, which is PR #137's
  purge, run through `parseSession`:
  - Example B: the bill is dropped, because the charge split changed, and the others' amounts are
    unchanged (AC-CA10.6).
  - Example A: dropped, because the Gyoza names Ben.
  - Orders plus a discount for Ana, removing Ben: the bill is kept, and it's still a correct
    receipt.

**`src/lib/storage.test.ts`** (add, P1). These run `parseSession` on a session whose one record
holds the item, as `sessionValidation.test.ts` does:

- **S-1** A valid `bill` is kept, in the order sent, with names tidied and cut to 60, and lines
  rebuilt with known keys only (an extra field is dropped).
- **S-2** These each drop `bill`, keep `amounts` exactly, and never drop the session:
  - `bill` isn't an array, or is empty;
  - an entry isn't an object;
  - an unknown `kind`;
  - `name` isn't a string;
  - an amount of 0, negative, `NaN`, `Infinity` or a string;
  - an order `member` that isn't a string;
  - `members` missing, empty, holding a non-string, or with a repeat.
- **S-3** A shared or discount member not in `amounts` drops the bill.
- **S-4** An order line for a member not in `amounts` is skipped. The rest are kept when they still
  reconcile.
- **S-5** An `amounts` key on no order or shared line drops the bill (BR-CA13).
- **S-6** One centavo off, on any member, drops the bill.
- **S-7** A share below 0, even when `amounts` says so too, drops the bill (BR-CA6).
- **S-8** A bill with only order lines is dropped. Any `lines` beside it is still parsed as today
  (BR-CA43).
- **S-9** A valid `bill` beside `lines`: only `bill` is kept. An invalid `bill` beside valid
  `lines`: `lines` is kept.
- **S-10** A member called `__proto__` in `amounts` and on an order line is handled as an own key.
- **S-11** An Equal item with a `bill` comes back without it.
- **S-12** 100,000 charges over 5,000 members parse correctly inside the default timeout (linear
  work, section 4).
- **S-13** D1 with `Ana: 0` is kept, `Ana: 0` included.
- **OT-2 Older tab saves untouched:** a session holding Example B, through
  `JSON.parse(JSON.stringify(...))` with the `amounts` keys reordered (as `jsonb` does), parses with
  the same `bill` (AC-CA10.4).

**`src/lib/apiValidation.test.ts`** (add, P1):

- **A-1** `parseSessionInput(id, sessionWithExampleB)` returns the session with `bill`.
- **A-2** With a broken bill, it returns the session, not `null` (never a 400), with the bill dropped
  and `amounts` kept.

**`src/lib/staging.test.ts`** (add, P1):

- **T-1** `buildRecords` for Example B with One Payor Ana gives a payor amount of 2,401.05
  (AC-CA6.1).
- **T-2** `contributionsMatch` gives true for 1,200.00 + 1,201.05 and false for 1,200.00 + 1,200.00
  against 2,401.05 (AC-CA6.2, AC-CA6.3).
- **T-3** `purgeMemberFromStaged` on a staged Example B (F1) leaves the others' shares unchanged.
- **T-4** `stagedNamesMember` is true for a member at ₱0.00.

**`src/lib/format.test.ts`** (add, P1):

- **F-1** `formatSignedMoney`: −300 gives "−₱300.00" (U+2212); 300 gives "₱300.00"; 0 and −0.004 give
  "₱0.00"; −1,234.5 gives "−₱1,234.50". `formatSignedAmount(-300)` gives "−300.00".
- **F-2** `formatMoney(-300)` is still "₱-300.00", and `formatAmount(-300)` still "-300.00": the
  existing output doesn't change.

**`src/pdf/layout.test.ts`** (new, P1):

- **L-1** `fitMonoFontSize`:
  - ("300.00", 34, 7) gives 7.
  - ("−300.00", 34, 7) gives 6.6.
  - ("−1,234.56", 34, 7) gives 5.1.
  - ("−1,234.56", 58, 7) gives 7.
  - For every result, `text.length × 0.6 × size ≤ 28`.

**Existing tests that must still pass:** `orderLines.test.ts`, `sessionValidation.test.ts`,
`calculations.test.ts`, `staging.test.ts`, `storage.test.ts`, `includeMember.test.ts`,
`apiImports.test.ts` (which now walks into `bill.ts`), `steps.test.ts`, `targets.test.ts`, and
everything else under `npm test`.

### 8.2 Acceptance criteria mapping

"Tester" means a ui-ux-tester check in `npm run dev:full` at 320px, 375px and desktop width.

| AC | Phase | Verified by |
|---|---|---|
| AC-CA1.1 | P1 (shared), P2 (other two) | Tester: buttons only with someone picked |
| AC-CA1.2 | P1 | Tester: section, row, picker with "Everyone" ticked and the pills locked. O-1 |
| AC-CA1.3, 1.4 | P1 | O-2, B-1, B-5. Tester: Example A on screen |
| AC-CA1.5 | P1 | O-1, O-2. Tester: Add Item disabled |
| AC-CA1.6 | P1 | O-2 |
| AC-CA1.7, 1.8 | P1 | Tester: order of rows, × labels, section disappears |
| AC-CA1.9, 1.10, 1.11 | P1 | O-2, O-1 |
| AC-CA2.1 | P2 | Tester: section, picker empty |
| AC-CA2.2 to 2.9 | P2 | O-3, B-3, B-5, B-6. Tester: the floor colour and Add Item state |
| AC-CA3.1 | P2 | Tester: no picker, helper line |
| AC-CA3.2 to 3.6 | P2 | O-3, B-2, B-5 |
| AC-CA4.1, 4.2 | P1 | O-2, O-3. Tester: share figures only with rows, "—" |
| AC-CA4.3, 4.4 | P2 | O-3. Tester: the four right-aligned lines |
| AC-CA4.5 | P2 | Tester: red "of ₱2,400.00", Add Item still allowed |
| AC-CA5.1 | P1 | O-4 |
| AC-CA5.2 | P2 | O-4, B-5 |
| AC-CA5.3 | P1 | Tester: tooltips and enabled state. O-4 (no bill row changed) |
| AC-CA6.1 | P2 | T-1, C-5. Tester: staged price and Summary |
| AC-CA6.2, 6.3 | P2 | T-2. Tester: payor footer |
| AC-CA7.1 | P1 (A), P2 (B) | B-10. Tester: pill order |
| AC-CA7.2 to 7.4 | P1 (A), P2 (B, D1) | O-6. Tester: staged Edit and Breakdown "Edit item" |
| AC-CA7.5 | P1 | O-6. Tester: **no PUT** in the network panel |
| AC-CA7.6 | P2 | Tester: change the charge to ₱250.00, Save Edits, same card and position, Summary updates |
| AC-CA8.1, 8.2, 8.6 | P1 (display), P2 (to create B and D1) | B-9, B-10. Tester: Breakdown sub-rows, Item Total printed amounts, "—" for Ana |
| AC-CA8.3 | P1 | Tester: History, no Edit and no × |
| AC-CA8.4 | P1 | L-1, F-1. Tester: PDF with 17+ members and a ₱1,234.56 discount, minus and digits inside Cy's column |
| AC-CA8.5 | P1 | C-5. Tester: Total row |
| AC-CA9.1 to 9.4 | P1 | C-1, C-2, T-3. Tester: remove Ben/Cy on Breakdown |
| AC-CA9.5 | P2 | O-1. Tester: remove Cy from Group Members while the form is open |
| AC-CA10.1 | P1 | Tester: a copy of a pre-release session reads the same before and after. S-8, O-5 (shape unchanged) |
| AC-CA10.2 | P1 | O-5, B-9. Tester: an own-orders-only item, staged, saved and on the PDF, as PR #137 |
| AC-CA10.3 | P1 | OT-1. Tester: second tab |
| AC-CA10.4 | P1 | OT-2, A-1. Tester: second tab adds a purchase; reload the new tab, the receipt is there |
| AC-CA10.5 | P1 | OT-3. Tester: second tab Edit and Save Edits; shares unchanged on reload |
| AC-CA10.6 | P1 | OT-4. Tester: second tab removes a member |
| AC-CA11.1, 11.2 | P1, P2 | Tester: 320px and 375px, Example B with every row: no sideways scroll, controls at least 44px (decision 2), footer lines |
| AC-CA11.3 | P1, P2 | Tester: desktop side by side with `main`, nothing else moves |
| AC-CA11.4 | P1, P2 | Tester: accessibility tree for each ×, picker group and share figure |
| BR-CA33 | P2 | Tester: Custom → Equal Split clears everything but the name and picked members, no dialog |
| BR-CA47 | P1 | `steps.test.ts`, `targets.test.ts`. Tester: whole tour with Next, Back, Skip, Escape |

**The older-tab checks** (AC-CA10.3 to AC-CA10.6) need a second build:

1. Run `origin/main` at `343a8cb` from a separate worktree with `vercel dev --listen 3001`.
2. Sign in as the same account. Both builds use the same Neon `main` branch.
3. Do every action of 3.4 in the 3001 tab, then reload the 3000 tab.

The tester must delete the test session it creates. The Neon `main` branch holds real data, so this
means only the tester's own session.

## 9. Documentation impact

**None in this change.** The owner decided there's no ADR and no docs beyond this spec. If the owner
later asks, the documentation-engineer would update:

- the README's Custom Amounts row, to cover shared orders, discounts and charges;
- `docs/mobile-breakpoints.md`, to add `CustomAmountFields`' new 640px rules (row pickers and
  "+ Add" buttons at 44px);
- the Obsidian user guide's Expenses section, Breakdown, History and the PDF;
- this spec in the technical-specifications list.

## 10. Tasks

Each phase ends with its own checks. Within a phase, the order is data, logic, state, then UI, and
tests come first.

### Phase 1: shared orders, and the data layer for every kind

1. **Types.** Add `BillLine` and `bill?`, and update both doc comments (3.1).
2. **Format, tests first.** Write F-1 and F-2, then add `formatSignedMoney` and `formatSignedAmount`
   (5.6).
3. **Split maths, tests first.** Write `bill.test.ts` (B-1 to B-10), then `src/lib/bill.ts` (5.2),
   with `.js` imports.
4. **Validation, tests first.** Write S-1 to S-13, OT-2, A-1 and A-2, then add `parseBill` and the
   `parseItem` change (section 4). Run `apiImports.test.ts`.
5. **Member removal, tests first.** Write C-1 to C-5, OT-1, OT-4, T-3 and T-4, then add
   `purgeMemberFromBill` (5.5).
6. **Form logic, tests first.** Write O-1, O-2, O-4 (C1), O-5 (A) and O-6 (A, AC-CA7.4). Then add to
   `orderLines.ts`: the draft types, the row operations, `billFromDraft`, `readBillDraft` (shares,
   subtotal, entered, others, sharedHint), `fillRemainder`'s `others`, `itemFromLines`'s bill branch,
   `linesFromItem`'s bill branch and `billDraftFromItem` (shared rows) (5.4). Write OT-3.
7. **Form state.** In `ItemModeFields.tsx` and `PurchaseItemCard.tsx`: `EMPTY_DRAFT.bill`,
   `billView`, `enteredTotal`, `itemValid`, the handlers, the unpick and removal changes,
   `draftFromItem` with the **P1 load guard**, and `stampFields` (5.4).
8. **Custom Amounts UI.** In `CustomAmountFields.tsx` and its CSS (6.1): the share figures, the
   Shared orders section with its picker, hint and labels, and "+ Add shared order".
9. **Displays.** Use `receiptRows` in `ItemStagingList.tsx` (6.2), `BreakdownTable.tsx` (6.3) and
   `TransactionTable.tsx`. Add `fitMonoFontSize` with L-1 (6.4).
10. **Checks.** Run `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and
    `targets.test.ts`) and `npm run build`. Then walk the P1 rows of 8.2 yourself in
    `npm run dev:full` at phone and desktop width, and give the owner the local URL and branch.

### Phase 2: discounts and charges

11. **Logic, tests first.** Write O-3, O-4 (C2), O-5 (B, D1) and O-6 (B, D1, E). Then add
    `readBillDraft`'s `discounts`, `charges`, `discountHint`, `chargeHint` and `floorHint`, and
    `billDraftFromItem`'s discount and charge rows.
12. **Remove the P1 load guard** in `draftFromItem` (5.4).
13. **UI.** Add the Discounts and Charges sections, "+ Add discount" and "+ Add charge", the floor
    hint and the footer lines, with their CSS (6.1).
14. **Checks.** Run the same four commands, then walk the P2 rows of 8.2 and the older-tab checks
    against a `343a8cb` build, and report the URL and branch.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| The bill and `amounts` disagree, so money is two things at once | Money is read only from `amounts`. Stamping writes `amounts` from `billAmounts`. `parseBill` and purge keep a bill only when `billMatches` holds. Covered by B-8, S-2 to S-8, C-1 and C-2. |
| An older tab saves wrong money | Every row of 3.4 is a unit test (OT-1 to OT-4) and a tester check against a `343a8cb` build. |
| A uat tab on P1 meets a P2 bill (environments share Neon `main`) | P1 parses, removes members from and displays every kind. P1's Edit loads a discount or charge item as money only, as an older tab would. |
| A rollback drops receipts | Money is safe in `amounts`. Only receipt detail is lost, on the next save of each affected session. The owner should know before shipping. |
| A buggy client's bill fails to reconcile and is silently dropped | The stamp → parse round trips (O-5, O-6, S-1) and the odd-centavo grids (B-7, C-4). It's the same exposure as `lines` today. |
| A crafted body makes the server's split quadratic | Charges are added in one pass (5.2). S-12 runs 100,000 charges over 5,000 members. |
| A member at ₱0.00 surprises a reader | Every reader is listed in 3.3 and checked. D1 runs through C-5, S-13 and the tester. |
| Removing a member moves someone else's share | Proven in 5.5, pinned by C-4, and Example F is tested exactly. |
| Unchanged Save Edits rewrites an item | The round trip is JSON-equal (O-6), and the tester checks for no PUT. |
| Member names such as `__proto__` or `constructor` | `Object.hasOwn`, `Map` and `Object.fromEntries` everywhere new. S-10 and B-9. |
| The form gets crowded on a phone | It reuses PR #137's line grid and touch sizes. The tester checks 320px and 375px with Example B in full. |
| The PDF prints a discount part at 5pt at 17+ members | It's legible and never clipped (L-1). The alternative, wider columns, would change every PDF's layout. |
| A future row kind is unknown to this release | `parseBill` drops the whole bill and keeps the money, the same rule as for anything it can't read. |

**Size: large.**

- 19 files change (13 source, 6 tests) and 3 are added (`bill.ts`, `bill.test.ts`,
  `layout.test.ts`). It's all client and shared parser code, with no schema, route or dependency
  change.
- P1 is roughly two thirds of it, because of the data layer and the displays.

**Risk: medium.**

- The money and compatibility rules are isolated in pure, tested functions in `bill.ts`,
  `storage.ts`, `orderLines.ts` and `calculations.ts`.
- The largest UI change is `CustomAmountFields`.

## 12. Decisions for the user

These are my recommendations. Approving the spec accepts them unless you say otherwise. None of them
blocks writing the code.

1. **Shipping the two phases.**
   - **Recommended:** build both on this branch and ship them in one PR, so testers meet the whole
     receipt at once and the P1 load guard never reaches an environment.
   - **Alternative:** ship P1 to uat first. That's safe: its guard keeps the money of any P2 item a
     P1 tab edits.
2. **Pill height on a phone.**
   - **Recommended:** the new row pickers' pills are 44px, as AC-CA11.1 asks. The "Who's in this
     item" picker keeps PR #137's 38px, which is the height Equal Split's identical picker has.
   - **Alternative:** make every pill in Custom Amounts 44px, which reads AC-CA11.1 to include the
     item picker. The Equal Split and Custom pickers would then differ by 6px when you switch mode.
3. **The PDF font fit applies to every sub-row amount**, own orders included.
   - **Recommended:** yes. It's a no-op wherever the text already fits. The only PR #137 output it
     changes is an order line of ₱1,000 or more at 17+ members, which overflows its column today.
   - **Alternative:** discount parts only, which leaves shared and own-order parts of ₱1,000 or more
     overflowing at 17+ members.
   - Either way, item rows (7.5pt) keep the same overflow they have today at 17+ members. I noticed
     it and haven't changed it; it would be a separate fix.
4. **Desktop width of the new sections:** capped at 520px, so a name box doesn't stretch across a
   wide card. Say if you'd rather have them full width.
