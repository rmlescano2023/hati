# Shared orders, discounts and charges in Custom Amounts: architecture brief

Status: architect's feature brief, for the business-analyst and the tech-lead. Not a spec.
Base: `origin/main` at `343a8cb` (PR #137, custom orders). Builds on `docs/specs/custom-orders.md`.

## 1. Idea and problem

The owner settled intent and scope in intake. Both features live inside a Custom Amounts item only.

- **Shared orders.** Beside each member's own order lines, an item can have orders that several
  members share. Each has a name, a ₱ price and its own member picker, set to everyone in the item
  at first. The price is split equally across the picked members with Equal Split's leftover-centavo
  rule. Example: Glydel and Renmar at Mendokoro, Gly's Ramen 720, Ren's Ramen 750, Gyoza shared.
- **Discounts and charges.** Any number of named ₱ amounts as printed on the receipt, with no
  percentages. A discount comes off the chosen member(s) only (the PWD or senior cardholder), split
  equally when several are chosen. A charge is split equally across everyone in the item. Example:
  six members, a PWD discount of ₱300 for one, a service charge split six ways.

The problem behind both: a real restaurant receipt has things that aren't one person's order. Today
the user has to work those out by hand and type each member's final amount, which is exactly the
arithmetic Hati exists to do.

## 2. Goal

Checkable once built:

- A user can type a receipt as printed (own orders, shared orders, discounts, charges) and Hati
  shows each member's final amount, with the members' amounts adding up exactly to the receipt total
  after discounts and charges, to the centavo.
- Breakdown, History detail, the staging list and the SOA PDF show the shared orders, discounts and
  charges, and the item's total and each member's share are the amounts that were paid.
- Settlement, Summary and Collection need no change and give the same answers as if the user had
  typed the final amounts by hand.
- A tab still running PR #137 never saves wrong money for one of these items.
- No existing stored item changes until a user edits it.

## 3. Current state

- **Types** (`src/types/index.ts`): `CustomAmountItem = { id, mode: 'custom', name, amounts, lines? }`.
  `amounts` is member -> final amount, the single place every calculation reads money from.
  `lines?: OrderLine[]` (`{ member, name, amount > 0 }`) is stored only when at least one line has a
  name (BR-CO12), and each member's lines sum to their `amounts` entry (BR-CO10).
- **Money** (`src/lib/money.ts`): `splitEvenly` works in integer centavos and gives leftover centavos
  to the first recipients. `getItemShares` (`src/lib/calculations.ts`) applies it to Equal Split
  owners sorted with `compareNames`, so the extra centavo goes to the first member alphabetically.
- **Item total**: `getItemTotal` is `sumMoney(Object.values(amounts))` for Custom. A One Payor
  record's payor amount is that total (`stampFields` in `PurchaseItemCard.tsx`, `staging.ts`), and
  Multiple Payors contributions must match `enteredTotal`.
- **Writing an item**: `itemFromLines` (`src/lib/orderLines.ts`) builds `amounts` from the form's
  `LinesDraft` and keeps `lines` only if one is named. `linesFromItem` loads Edit. `fillRemainder`
  spreads Total Amount minus the entered lines across picked members with no priced line.
  `linesFromEqualSplit` carries an Equal Split price over when switching to Custom.
- **Switching modes** (`PurchaseItemCard.tsx`, the `ModeToggle` handler): Equal to Custom carries
  the price as each member's first line. Custom to Equal keeps only the name and the picked members;
  every line and the Total Amount are dropped.
- **Validation boundary**: `PUT /api/sessions/[id]` calls `parseSessionInput` (`api/_validate.ts`),
  which runs the client's own `parseSession` -> `parseItem` -> `parseOrderLines`
  (`src/lib/storage.ts`). `parseOrderLines` never rejects a session: lines that don't reconcile with
  `amounts` are dropped and the item is stored from `amounts` alone. The client does not parse what it
  loads; `loadSessions` (`api/_shared.ts`) returns the stored JSON as it is.
- **Member removal**: `purgeMemberFromItem` deletes the member's amount and lines and leaves everyone
  else's money unchanged; for Equal Split it shrinks the price by the departing share. The same rule
  runs for staged items (`purgeMemberFromStaged`).
- **Late member**: `includableGroups` / `includeMember` (`src/lib/includeMember.ts`) only ever offer
  Equal Split items. Custom items are never touched.
- **Readers of `lines`**: `BreakdownTable.tsx` (also used by `HistoryDetailPage` through
  `BreakdownGroup.tsx`), `ItemStagingList.tsx` (pills), `src/pdf/TransactionTable.tsx`. Each draws a
  line as a row with the amount in that member's column.
- **Tour** (`src/components/onboarding/steps.ts`): no step targets anything inside Custom Amounts;
  those fields are not on screen until the user switches mode.
- **Schema** (`scripts/db/schema.sql`): items are JSONB on `purchase_records.items`, with no
  column per field.

## 4. Options

All options keep `amounts` as the stored final per-member amount, so `getItemTotal`,
`getItemShares`, the owed matrices, settlement, Summary and Collection don't change. They differ in
where the receipt detail is stored and what an older tab does with it.

The case that decides it: a tab still on PR #137 that opens **Edit** on a new item. PR #137's
`linesFromItem` uses a member's stored `lines` whenever they have any, and its `itemFromLines`
rebuilds `amounts` from those lines on Save. If the stored lines are only the member's own orders,
their share of a shared order, discount or charge is silently lost on that save.

### Option A: new fields beside `lines`

`shared?: SharedOrder[]` and `adjustments?: Adjustment[]` on `CustomAmountItem`, with `lines` still
holding each member's own orders. Reconciliation is extended: own lines plus shared parts minus
discounts plus charges must equal `amounts`.

- Touches: types, `orderLines.ts`, `storage.ts`, `calculations.ts` (purge), the form, the three
  readers. No API or schema change.
- Effort: medium. Risk: **high for money**. A PR #137 tab's Edit of such an item changes amounts on
  save, with no warning, because its `lines` look complete to it. `lines` would also have to be kept
  for unnamed own orders (they're the base the shared parts sit on), which changes BR-CO12's meaning.
- Gives up: the older-tab guarantee PR #137 was designed around (its spec, section 3.3).

### Option B (recommended): a separate `bill`, used instead of `lines` when the item has more than own orders

Items with only own orders keep PR #137's shape exactly. An item with at least one shared order,
discount or charge stores its whole receipt in a new field and has no `lines`:

```ts
/** One row of a Custom item's receipt (sketch; the tech-lead fixes names). */
type BillLine =
  | { kind: 'order'; member: string; name: string; amount: number }
  | { kind: 'shared'; members: string[]; name: string; amount: number }
  | { kind: 'discount'; members: string[]; name: string; amount: number }
  | { kind: 'charge'; name: string; amount: number }; // split over everyone in the item

type CustomAmountItem = {
  // ...as today
  amounts: Record<string, number>; // still the final amount, still what everything reads
  lines?: OrderLine[];             // only on items with own orders alone (PR #137)
  bill?: BillLine[];               // only on items with a shared order, discount or charge
};
```

`amount` is always the positive figure printed on the receipt; `kind` says whether it adds or
subtracts. A charge carries no member list: "everyone in the item" is defined as the keys of
`amounts`, so it can never disagree with who is in the item.

What a PR #137 tab does with such an item:

| PR #137 tab action | Result |
|---|---|
| Shows it | Totals and shares come from `amounts`, so they're right. No `lines`, so it shows the item row only and per-member pills. |
| Saves the session without touching the item | It sends the loaded JSON back, so `bill` goes too and still reconciles. Kept. |
| Opens Edit and saves | `linesFromItem` sees no `lines` and gives each member one unnamed line holding their final amount. Saved as `amounts` alone: the money is unchanged, the receipt detail is lost. |
| Removes a member | Its purge returns `{ ...item, amounts }`, which keeps `bill` beside the shorter `amounts`. The server finds the bill no longer reconciles (the member is gone, or the charge split has changed) and drops it. The others' amounts are unchanged. |
| Includes a late member | Custom items are never offered. No effect. |

- Touches: types; a new pure module (for example `src/lib/bill.ts`) for the split maths; `storage.ts`
  (a `parseBill` beside `parseOrderLines`); `orderLines.ts` (stamping and loading Edit);
  `calculations.ts` (`purgeMemberFromItem`); `PurchaseItemCard.tsx`, `ItemModeFields.tsx`,
  `CustomAmountFields.tsx` (form); `BreakdownTable.tsx`, `ItemStagingList.tsx`, `TransactionTable.tsx`
  (display). No change to any `api/` file, route, status code or the schema.
- Effort: **medium to large**, nearly all of it in the form and the three displays. The data layer
  is small.
- Risk: low for money; the older-tab cases above are all money-safe. The main risks are on the
  screen (section 7).
- Gives up: two stored shapes for an itemized item (`lines` or `bill`), so every reader goes through
  one helper that turns either into display rows. An older tab's edit loses the detail, as PR #137
  already accepts for `lines`.

### Option C: one kinded line list for every itemized item

Replace `lines` with the `bill` list everywhere, so an item with own orders alone also uses
`kind: 'order'`. Existing rows keep `lines` (no data rewrite), so readers still need both shapes
until every such item is edited again. This is Option B plus reworking PR #137's code paths and
tests for no user gain. Effort: large. Not recommended now; Option B leaves the door open.

### Rejected outright: work out `amounts` from the detail when reading

Making the receipt the source of truth and computing shares in `getItemShares` would give two
places money lives, and PR #137 tabs (which read only `amounts`) would show different numbers from
new tabs. It contradicts the `amounts` contract.

## 5. Recommendation

**Option B.** It is the only option where a tab on the previous release can never save wrong
money, it leaves every calculation downstream of `amounts` alone, needs no schema or API change, and
keeps PR #137's stored shape and behaviour exactly for items that don't use the new features. The
cost is one more stored shape and a display helper that reads either.

The rule PR #137 introduced extends cleanly: **the receipt detail is a derivation that must
reproduce `amounts` to the centavo, or it is dropped.** That lets the server stay a pure validation
boundary that never rejects a session over detail, and makes a stale or buggy writer harmless to
money.

### 5.1 Where the calculation lives

One pure function, used by every path, computes member -> centavos from a bill and the set of
members in the item:

1. Each bill line is split on its own with `splitEvenly` over its members sorted with
   `compareNames` (an order line has one member; a charge's members are everyone in the item).
2. Order and shared parts and charge parts are added, discount parts are subtracted, per member, in
   integer centavos.

Callers:

- **Stamping** (the successor of `itemFromLines`): writes `amounts` from the bill, so `amounts` is
  always this function's output.
- **Parsing** (`parseBill` in `storage.ts`, which the server runs through `parseSessionInput`):
  recomputes and compares with `amounts`; on any mismatch the bill is dropped.
- **Purge**, the **form's live totals** and the **display rows** (shared parts, discount parts and
  charge parts per member column).

`getItemTotal` and `getItemShares` are unchanged. `getItemTotal` therefore means **the bill total
after discounts and charges**, which is what the payor paid. That is a technical necessity, not a
choice: a One Payor record's payor amount and Multiple Payors contributions must add up to the
money that changed hands.

### 5.2 What the data layer enforces (`parseBill`)

The bill is kept only if all of these hold, and is otherwise dropped with the item stored from
`amounts` alone (never a 400, as for `lines`):

- An array of objects with a known `kind`; `name` a string (tidied with `normaliseOrderName`);
  `amount` finite, above 0 after rounding to the centavo.
- `member` / `members` are strings, `members` non-empty with no repeats. Checked with own keys, as
  `parseOrderLines` does, so a member called `__proto__` isn't taken for one.
- Every member a shared or discount line names is in `amounts`. An order line for a member no
  longer in `amounts` is skipped, as PR #137 does for `lines` (a removal made by an older tab); a
  shared or discount line naming one makes the bill invalid.
- The bill has at least one shared, discount or charge line. Otherwise it is stored as PR #137's
  `lines` or `amounts` alone, so the same receipt always has one stored shape.
- Recomputed per member, every member in `amounts` matches to the centavo, and none is below zero.
- `lines` is ignored when a valid `bill` is present (the two never coexist).

Work stays linear in the size of the bill, since it runs on every session write over input with no
size limit.

### 5.3 Zero and below

A member below ₱0 within an item must never be stored. The owed matrix skips a non-positive record
share (`getRawOwedMatrix`), so a negative share would make a record's shares stop adding up to what
its payor paid. The client blocks it before Add Item, and `parseBill` drops a bill that produces one.

Exactly ₱0 is different (owner question 2). If it's allowed, the member must stay in `amounts` with
`0`, because `amounts`' keys are what defines "everyone in the item" for charges, and what
`purgeMemberFromItem` checks. Readers already cope: Breakdown and the PDF show `—` for a zero
share, and the owed matrix skips it. This would be the first time `amounts` holds a 0 (its doc
comment says members with no share are absent), so the doc comment changes and the tech-lead checks
every reader. If it isn't allowed, the rule is simply every final amount above 0, and nothing else
changes.

The item's total must stay above 0, as today.

Note, not in scope: `parseItem` already accepts negative `amounts` from any client. The app never
writes one. This feature doesn't change that.

### 5.4 Rounding

Each line is split in whole centavos with `splitEvenly` over its members sorted with `compareNames`,
the same rule as Equal Split. Each line's parts add up to its amount exactly, so the members' final
amounts always add up exactly to own orders + shared orders + charges - discounts. No final rounding
pass is needed.

- Mendokoro, with an illustrative Gyoza of ₱290.01: parts 145.01 (Glydel) and 145.00 (Renmar).
  Glydel 720 + 145.01 = 865.01, Renmar 750 + 145.00 = 895.00, total 1,760.01.
- Six members, a service charge of ₱345.50: 34,550 centavos / 6 = 5,758 remainder 2, so the first two
  alphabetically pay 57.59 and the other four 57.58.

Known effect: the alphabetically first member picks up the extra centavo on every line that doesn't
divide evenly, so across several shared orders and charges they can pay a few centavos more. That is
what Equal Split already does item by item, and what the owner asked for. A fairer rotation is
possible later but would differ from Equal Split.

### 5.5 Removing a member from the session

The existing rule for both modes is that removing a member leaves everyone else's money unchanged
and the item's total shrinks by what the member paid. Recommended for bills too: the member's own
orders go, and each shared order, discount and charge they were on shrinks by their part. A line
left with no members goes. The remaining members' parts are unchanged: `splitEvenly` over a sorted
list gives the extras to the first members, so removing one and splitting what's left over the rest
gives each of them what they had. The tech-lead should pin that with a test.

The other reading, re-splitting each charge and shared order as printed among the members who are
left, raises everyone else's amounts when someone is removed. It differs from Equal Split, so it is
owner question 3.

This is separate from unpicking a member while the form is open: the form always works from the
receipt as typed, so unpicking someone re-splits charges and shared orders among the members still
picked, just as unticking an Equal Split owner re-splits the price today.

### 5.6 Late members

No change. `includeMember` never offers Custom items, so a member added later never joins a shared
order, discount or charge on their own, and charges don't re-split. To put them on a shared order or
a charge, the user edits the item. Offering Custom items in that dialog is a separate idea.

### 5.7 Switching between Equal Split and Custom Amounts

- Equal Split to Custom: unchanged. Equal Split items have no bill, so there is nothing new to carry.
- Custom to Equal Split: today every Custom-specific field is dropped; the shared orders, discounts
  and charges would go the same way. Equal Split has nowhere to keep a discount for one member, and
  the owner put Equal Split items out of scope, so carrying them is not possible. Whether to warn
  first, now that more typed work is at stake, is a question for the analyst.

### 5.8 Total Amount, Fill Remainder and the Entered footer

Technical facts:

- Whatever the form shows as entered has to be the figure that will be stored: the net (own +
  shared + charges - discounts), which is what Multiple Payors contributions must match. Today that
  is `enteredTotal`, which becomes the net.
- For Fill Remainder to land the item on Total Amount exactly, the remainder has to be Total Amount
  minus the net so far, then split over the blank members as today.
- Because a charge splits over every picked member, blank or not, filling a blank member doesn't
  change the charge split, so the result is stable.

Business rules (for the analyst, not decided here): see section 9.1.

## 6. Architectural impact

- **Shape of the system:** unchanged. One more optional JSON field on a Custom item and one new pure
  module. Calculation stays client-side, in shared code the server runs for validation.
- **API:** no route, method, request shape or status code changes. `parseSessionInput` already
  covers it through `parseSession`. Auth (`getUserId`, 401), ownership (owner-scoped update, 404)
  and `client.sql` are untouched.
- **Schema:** none. Items are JSONB.
- **Stored data:** additive only. No existing row is rewritten. An item gets a `bill` only when a
  user saves one.
- **Dependencies:** none.
- **Tour:** none. No step targets Custom Amounts, and none can (those fields aren't on screen at the
  point in the tour where the reader is).
- **Environments:** reaches main -> sit -> qat -> uat as usual. stg and prod still run the version
  from before accounts, which has no Custom order lines at all, so this can't reach them without
  the larger release effort.
- **Rollback caveat:** if this release is rolled back, PR #137's `parseItem` drops `bill` on the
  next save of each session that has one. Money is safe (it's in `amounts`); the receipt detail is lost.
- **Decision record:** warranted. Proposed ADR-014: "Receipt detail on a Custom item is a derivation
  that must reproduce `amounts`, and an item with more than own orders keeps it in `bill`, never in
  `lines`." Written only if the owner asks for a documentation update.

## 7. Risks and unknowns

- **Form size, mostly on a phone.** Three new kinds of row, two with a member picker, inside an item
  form that already has a picker and per-member blocks. This is the largest cost and the most likely
  cause of rework. It needs the analyst's layout rules and a ui-ux-tester pass at 375px.
- **Display width.** Discount parts are negative. `formatAmount` prints a hyphen-minus; the PDF
  member columns are narrow, and "-1,234.56" may not fit. The tech-lead should check
  `TransactionTable.tsx` widths and decide how a negative is printed (and on Breakdown, where a
  discount row reads against a shaded total).
- **Silent drop.** A buggy new client whose bill fails to reconcile loses the detail without a
  message, exactly as `lines` can today. Mitigated by unit tests on stamp -> parse round trips,
  including odd centavos.
- **A 0 in `amounts`** (if the owner allows it) is new to every reader. The tech-lead lists each
  `amounts` / `getItemShares` reader and confirms it.
- **Couldn't determine:** whether any stored item already has a negative or zero amount. I didn't
  query the database. It matters only if the owner wants the data layer to tighten `amounts` too,
  which this brief does not recommend.

## 8. Scope

**In:** shared orders and named ₱ discounts and charges on Custom Amounts items; the stored `bill`
with reconciliation; stamping, Edit loading, purge, form, and display in Breakdown, History detail,
the staging list and the SOA PDF; tests, including the PR #137-tab cases in section 4.

**Out:** percentages; adjustments on Equal Split items or on a whole record or save; partial charges
(a charge for some members only); joining a late member to Custom items; a fairer centavo rotation;
moving PR #137 `lines` items to the new shape (Option C); any data migration; any schema or API
change; new tour steps.

## 9. Hand-off

### 9.1 For the business-analyst (business rules and wording)

1. **Discount limit.** Can a member's discounts go beyond their own and shared orders, and be
   absorbed by their charge share, or is the limit their orders before charges? Either is technically
   fine; the floor itself is the owner's (question 2).
2. **Who is "in the item".** May a member be in the item only through a shared order (no own order)?
   Only through a charge (ordered nothing, shares nothing)? This decides whether a picked member with
   nothing typed is blank (left out, as today) or in the charge split.
3. **Shared order with one member.** Allowed, or does it have to have at least two?
4. **Pickers when membership changes in the form.** When a member is picked after a shared order or
   discount exists, do they join its picker automatically? When unpicked, they leave every picker; a
   shared order or discount left with nobody: removed, or Add Item blocked with a message?
5. **Names.** Required for shared orders, discounts and charges, or optional with a "No name" label
   as for orders? Any suggested names (PWD, Senior, Service charge, VAT)?
6. **Total Amount and Entered.** Total Amount is the receipt's final total (after discounts and
   charges). Does the footer show only the net, or subtotal, discounts and charges too? Wording of
   the mismatch.
7. **Fill Remainder.** Who counts as blank now: no priced own order, even if they're on a shared
   order or hold a discount? (The remainder is Total Amount minus the net, section 5.8.)
8. **Custom to Equal Split.** Shared orders, discounts and charges are dropped with the lines.
   Warn first?
9. **Display.** Row order under an item (own orders by member, then shared, then discounts, then
   charges?), how a discount reads (−₱300.00, with the name?), and the same on Breakdown, History,
   the staging pills and the PDF.
10. **Messages.** Wording for each thing that blocks Add Item (a discount with no holder, a discount
    over its limit, a shared order with nobody, a named row with no price).
11. **Phone and desktop layout**, within `@media (max-width: 640px)` for phone-only styles.

### 9.2 For the tech-lead (points to specify)

- The exact `BillLine` type and field names; canonical order of lines and of `members` (sorted with
  `compareNames`) so two stamps of the same form serialize identically.
- The split function's signature and placement; `parseBill`'s rules (section 5.2); how `parseItem`
  chooses between `bill`, `lines` and `amounts` alone.
- Stamping from the form (the successor of `itemFromLines`), Edit loading (`draftFromItem`,
  `linesFromItem`), the form's draft shape, live per-member totals, `enteredTotal` as the net,
  `fillRemainder`, `contributionsMatch` against the net, the One Payor amount.
- `purgeMemberFromItem` for a bill (section 5.5, or the owner's other choice), and
  `purgeMemberFromStaged` and `stagedNamesMember` picking it up.
- One display helper turning `lines` or `bill` into rows of per-member parts, used by
  `BreakdownTable`, `ItemStagingList` and `TransactionTable`; negative amounts and PDF widths.
- `amounts`' doc comment if zero is allowed, and a check of every reader.
- Tests: split maths with odd centavos; stamp -> parse round trips; each mismatch path drops the bill;
  purge leaves the others unchanged; every row in the PR #137-tab table in section 4, as unit tests
  where possible and as a tester check against a `main` build in a second tab, as PR #137 did
  (BR-CO23).
- Run `steps.test.ts` if anything near a `data-tour` element moves (none expected).

## 10. Questions for the owner

1. **Storage approach.** Approve Option B: an item with a shared order, discount or charge stores its
   receipt in a new `bill` instead of `lines`, so a tab on the previous release always sees safe
   amounts. Trade-off: editing such an item in an older tab keeps the money but loses the receipt
   detail (as PR #137 accepted for order lines).
2. **The floor.** A member's share can never go below ₱0. May a discount bring it to exactly ₱0
   (for example a voucher covering someone's whole meal when there's no charge)? Recommended: yes,
   stored as 0 so they stay in the item.
3. **Removing a member from the session.** Recommended: like Equal Split today, everyone else's
   amounts stay the same and the item's total shrinks by what the removed member paid, including
   their part of shared orders and charges. The alternative is to re-split shared orders and charges
   as printed among those left, which raises their amounts. Which do you want?
4. **Decision record.** Do you want ADR-014 (section 6) recorded in the documentation when the
   feature ships?
