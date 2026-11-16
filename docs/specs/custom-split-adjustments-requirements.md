# Requirements: shared orders, discounts and charges in Custom Amounts

Source: the owner's intake decisions (restated as business rules in section 4), the
system-architect's brief `docs/specs/custom-split-adjustments-architecture.md` with Option B
approved, the PR #137 documents `docs/specs/custom-orders-requirements.md` and
`docs/specs/custom-orders.md`, and the code at `origin/main` `343a8cb` (the working tree's
`src/` and `api/` are identical to it), as read on 2026-11-16. Statements about "today" come
from reading the code, not from the running app.

The members in the examples (Ana, Ben, Cy, Dan, Eve, Fay, Gus) are made up. Example A is the
owner's Mendokoro bill with the names changed; the alphabetical order of the two diners is kept,
because it decides where a leftover centavo goes.

IDs carry a `CA` prefix (`US-CA`, `AC-CA`, `BR-CA`, `OQ-CA`) so they don't clash with PR #137's
`CO` IDs. Where a PR #137 rule still holds unchanged it is cited, not repeated.

## 0. How it works today

Only what this feature builds on. The full picture is in section 0 of
`custom-orders-requirements.md`.

1. **A Custom Amounts item** stores `amounts` (member -> final amount) and, when at least one
   order line has a name, `lines` (`{ member, name, amount }`). Every calculation reads money from
   `amounts` only (`getItemTotal`, `getItemShares` in `src/lib/calculations.ts`).
2. **The form** (`CustomAmountFields.tsx`), top to bottom: Total Amount (₱) and Fill Remainder;
   "Who's in this item" (`OwnerGrid`: "All Members" plus a pill per member, nothing ticked at
   first); one block per picked member with order lines (name, price, × when there are two or
   more lines) and "+ Add order"; the missing-price hint; the footer "Entered ₱X", red with
   "of ₱Y" when it differs from a Total Amount above ₱0.
3. **"Entered"** is the sum of the picked members' priced lines (`linesTotal`). It's the item's
   total once stamped, the One Payor amount, and what Multiple Payors contributions must match
   ("Contributed ₱X of ₱Y" in `PayorModeFields.tsx`).
4. **Fill Remainder** splits Total Amount minus Entered with `splitEvenly` across the picked
   members whose lines all have no price, alphabetically, into each one's first line (BR-CO11).
5. **A picked member with nothing priced** is left out of the item at Add Item, with no warning
   (BR-CO8). `itemFromLines` stores an amount only when it is above ₱0, so today `amounts` never
   holds a 0.
6. **Rounding** (`splitEvenly` in `src/lib/money.ts`) works in whole centavos and gives leftover
   centavos one each to the first recipients. Equal Split sorts owners with `compareNames`
   (case-insensitive, alphabetical), so the first name alphabetically pays the extra centavo.
7. **Switching mode** keeps the name and the picked members. Equal Split to Custom carries each
   owner's equal share into their first line; Custom to Equal Split clears Total Amount and every
   line with no confirmation (BR-CO4).
8. **Display.** Breakdown, History (same `BreakdownTable`) and the PDF (`TransactionTable.tsx`)
   show one indented sub-row per line of an itemized item, the line's amount in its member's
   column and nothing in Item Total (BR-CO14, BR-CO15). A member cell with a share of ₱0 or less
   shows "—". The staged list shows one pill per line, "Ana · Sisig ₱280.00" or "Fay: ₱200.00".
9. **Removing a member** keeps everyone else's money unchanged: a Custom item loses the member's
   amount and lines; an Equal Split price shrinks by the departing share (`purgeMemberFromItem`).
   The late-member dialog offers Equal Split items only.
10. **The tour** (`src/components/onboarding/steps.ts`) has no step and no `data-tour` target in
    `src/components/home/`. The Custom Amounts fields are never on screen during the tour.

## 1. Problem

A real restaurant receipt has lines that aren't one person's order: a dish two people shared, a
PWD or senior discount that belongs to one diner, a service charge or VAT spread over the table.
Today the person logging has to work those out by hand and type each member's final amount,
which is the arithmetic Hati exists to do, and the receipt can't be checked afterwards because
only the final numbers are kept.

## 2. Outcome (checkable)

- In a Custom Amounts item the user can type the receipt as printed: each member's own orders,
  shared orders, discounts and charges, all in ₱.
- While typing, each member's final share and the receipt's subtotal, discounts, charges and
  total show in the form.
- The members' final shares add up exactly, to the centavo, to subtotal − discounts + charges.
- No member's final share in an item is below ₱0.00.
- The staged list, Breakdown, History and the PDF show the shared orders, discounts and charges
  under the item, and the item's total and each member's share are what was paid.
- Summary, net balances, the final settlement and Collection give the same answers as if each
  member's final share had been typed by hand. Nothing downstream of the stored amounts changes.
- An item with own orders only is stored, shown and calculated exactly as in PR #137, and no item
  saved before this release changes until a user edits it.
- A tab still running PR #137 never saves wrong money for one of these items.

## 3. User stories and acceptance criteria

Examples A to F are in section 5. "In the item" is defined in BR-CA13.

### US-CA1: Add a shared order

As the person logging, I want to add a dish several people shared, with its price, so that Hati
splits it between them.

- **AC-CA1.1** Given a Custom Amounts item with Ana and Ben picked, then below the member blocks I see "+ Add shared order", "+ Add discount" and "+ Add charge". Given nobody is picked, then none of the three shows.
- **AC-CA1.2** When I press "+ Add shared order", then a "Shared orders" section appears with one row: an "Order name" box, a price box, a × and a picker with "Everyone", "Ana" and "Ben", with "Everyone" ticked and both names shown ticked and locked, as "All Members" does.
- **AC-CA1.3** Given Example A, when I type "Gyoza" and "290" in the shared row, then Ana's block shows a share of ₱865.00, Ben's ₱895.00, and the footer reads "Entered ₱1,760.00".
- **AC-CA1.4** Given the variant in Example A (Gyoza ₱290.01), then Ana's share is ₱865.01 and Ben's ₱895.00: the extra centavo goes to Ana, first alphabetically.
- **AC-CA1.5** When I untick "Everyone" in the shared row, then nobody is ticked on that row, and a hint under Shared orders reads "Choose who shares Gyoza". Add Item is disabled until I tick at least one.
- **AC-CA1.6** Given a shared row with only Ben ticked, then all ₱290.00 goes to Ben, and Add Item is allowed (BR-CA9).
- **AC-CA1.7** When I press "+ Add shared order" again, then a second row appears under the first. Rows stay in the order I added them.
- **AC-CA1.8** When I press a shared row's × ("Remove shared order Gyoza", or "Remove shared order" with no name), then the row goes at once, and the shares and footer update. When the last row goes, the "Shared orders" section goes too.
- **AC-CA1.9** Given a shared row named "Gyoza" with no price, then Add Item is disabled and the hint reads "Add a price for Gyoza or remove it".
- **AC-CA1.10** Given a shared row with no name and no price, when I press Add Item, then it's added without that row and with no warning.
- **AC-CA1.11** Given Gus is picked with nothing typed and the shared Gyoza has "Everyone" ticked, then Gus is on the Gyoza and pays his part of it (BR-CA13).

### US-CA2: Add a discount for the cardholder

As the person logging, I want to take a PWD or senior discount off the cardholder's share only,
so that the others pay what they ordered.

- **AC-CA2.1** When I press "+ Add discount", then a "Discounts" section appears with one row: a "Discount name" box, an amount box, a × and a picker with "Everyone" and every picked member, with nobody ticked.
- **AC-CA2.2** Given a discount row with ₱300.00 and nobody ticked, then Add Item is disabled and the hint under Discounts reads "Choose who gets PWD" (or "Choose who gets the unnamed discount" with no name).
- **AC-CA2.3** Given Example B, when I name the discount "PWD", type 300 and tick Cy, then Cy's share is ₱260.93 and nobody else's share changes.
- **AC-CA2.4** Given Example E (₱250.01, Dan and Eve ticked), then ₱125.01 comes off Dan's share and ₱125.00 off Eve's.
- **AC-CA2.5** Given Example D1 (a ₱450.00 voucher on Ana's ₱450.00 order, no charges), then Ana's share shows ₱0.00 and Add Item is allowed.
- **AC-CA2.6** Given Example D2 with the voucher at ₱510.00, then Ana's share shows −₱7.50 in the warning colour, the hint above the footer reads "Ana's share would be −₱7.50. Lower the discount or add Ana's order.", and Add Item is disabled. At ₱502.50 her share is ₱0.00 and Add Item is allowed.
- **AC-CA2.7** Given a discount named "PWD" with no amount, then Add Item is disabled and the hint reads "Add an amount for PWD or remove it".
- **AC-CA2.8** Given I type "-300" or "0" as a discount amount, then it counts as no amount (BR-CA27).
- **AC-CA2.9** Given Cy holds a ₱300.00 discount but has no priced order and isn't on a shared order, then the hint reads "Cy's share would be −₱300.00. Lower the discount or add Cy's order." and Add Item is disabled.

### US-CA3: Add a charge

As the person logging, I want to add a service charge or VAT as printed, so that it's spread
evenly across everyone at the table.

- **AC-CA3.1** When I press "+ Add charge", then a "Charges" section appears with one row: a "Charge name" box, an amount box and a ×, with no picker, and the line "Split equally across everyone in this item."
- **AC-CA3.2** Given Example B, when I name the charge "Service charge" and type 245.55, then Ana, Ben and Cy each get ₱40.93 of it and Dan, Eve and Fay ₱40.92, and the six shares read as in Example B.
- **AC-CA3.3** Given Example D1 with a ₱105.00 charge added (Example D2), then Ana, whose voucher takes her orders to ₱0.00, still gets ₱52.50 of the charge.
- **AC-CA3.4** Given a charge of ₱100.00 and nobody in the item yet, then Add Item is disabled and the hint under Charges reads "Charges are split across the people with orders. Add an order first."
- **AC-CA3.5** Given a charge named "VAT" with no amount, then Add Item is disabled and the hint reads "Add an amount for VAT or remove it".
- **AC-CA3.6** Given a picked member with nothing priced and no shared order, then they get no part of a charge, and the charge is split across the others.

### US-CA4: See each person's share and the receipt totals while typing

As the person logging, I want to see each person's final amount and the receipt's totals as I
type, so that I can check them against the receipt before adding the item.

- **AC-CA4.1** Given the item has at least one shared order, discount or charge row, then each member block shows that member's share beside the name, from BR-CA16. Given it has none, then the blocks look exactly as in PR #137.
- **AC-CA4.2** Given a picked member with no priced order, no shared order and no discount, then their block shows "—" for the share.
- **AC-CA4.3** Given Example B with Total Amount ₱2,401.05, then the footer reads, one figure per line: "Subtotal ₱2,455.50", "Discounts −₱300.00", "Charges ₱245.55", and "Entered ₱2,401.05" with no red.
- **AC-CA4.4** Given an item with shared orders but no discount or charge (Example A), then the footer shows only "Entered ₱1,760.00", as today.
- **AC-CA4.5** Given Example B with Total Amount ₱2,400.00, then "Entered ₱2,401.05 of ₱2,400.00" shows in red, as today. Add Item is still allowed (BR-CO9).

### US-CA5: Fill Remainder from the receipt total

As the person logging, I want Fill Remainder to work out a forgotten price from the receipt's
final total, so that discounts and charges don't break it.

- **AC-CA5.1** Given Example C1 (Example A with Ben's ramen not typed, Total Amount ₱1,760.00), when I press Fill Remainder, then Ben's first line gets ₱750.00, even though he's on the shared Gyoza, and the footer reads "Entered ₱1,760.00" with no red.
- **AC-CA5.2** Given Example C2 (Example B with Fay's line empty, Total Amount ₱2,401.05), then before the fill Fay's share shows "—", the charge is split five ways at ₱49.11, and the footer reads "Entered ₱2,000.55 of ₱2,401.05" in red. When I press Fill Remainder, then Fay's line gets ₱400.50, the shares are exactly Example B's, and the footer reads "Entered ₱2,401.05" with no red.
- **AC-CA5.3** Fill Remainder's enabled rule and tooltips are as BR-CO11 and AC-CO3.3, with Entered as in BR-CA17. It never changes a shared order, discount or charge.

### US-CA6: Pay it

As the person logging, I want the payor's amount to be what was actually paid, so that the
balances are right.

- **AC-CA6.1** Given Example B with One Payor Ana, as the session's only purchase, when I add the item, then its staged price is ₱2,401.05, and after Save to Breakdown, Summary shows Ben owing Ana ₱490.93, Cy ₱260.93, Dan ₱335.92, Eve ₱450.92 and Fay ₱441.42 for it.
- **AC-CA6.2** Given Example B with Multiple Payors Ana ₱1,200.00 and Ben ₱1,201.05, then the payor footer reads "Contributed ₱2,401.05" with no red and Add Item is allowed.
- **AC-CA6.3** Given Ana ₱1,200.00 and Ben ₱1,200.00, then it reads "Contributed ₱2,400.00 of ₱2,401.05" in red and Add Item is disabled, as today.

### US-CA7: Check and fix before and after saving

As the person logging, I want the receipt to come back whole when I edit an item, so that I can
fix one line without retyping the rest.

- **AC-CA7.1** Given Example B is staged, then its row shows, in this order: one pill per own order ("Ana · Sisig ₱280.00" …), "PWD −₱300.00 · Cy", "Service charge ₱245.55 · split 6 ways". Example A shows "Gyoza (shared) ₱290.00 · Ana, Ben" after the two own-order pills (BR-CA36).
- **AC-CA7.2** When I press Edit on that staged row, or Edit on Breakdown and then "Edit item", then the form shows: the same picked members; each member's own orders with names and prices; each shared order with its name, price and ticks ("Everyone" ticked when it covers everyone in the item); each discount with its name, amount and holders; each charge with its name and amount; and Total Amount ₱2,401.05.
- **AC-CA7.3** Given a saved item where Ana's share is ₱0.00 (Example D1), when I edit it, then Ana is picked with her order and the voucher, not dropped.
- **AC-CA7.4** Given a member who is in the item only through a shared order, when I edit it, then they're picked, with one empty own-order line, and ticked on that shared order.
- **AC-CA7.5** When I press Save Edits without changing anything, then nothing is written (BR-CO32).
- **AC-CA7.6** When I change the service charge to ₱250.00 and press Save Edits, then every member's share, the item's total and Summary update to match, and the item stays in its card and position (BR-CO30).

### US-CA8: See the receipt after saving

As anyone checking the bill, I want the shared orders, discounts and charges shown under the
item, so that I can tick the receipt off line by line.

- **AC-CA8.1** Given Example B saved, then on Breakdown the item row shows "₱2,401.05" and each member's share, and beneath it, in this order: the own-order sub-rows (as BR-CO14), then "PWD" with −₱300.00 in Cy's column, then "Service charge" with ₱40.93 in Ana's, Ben's and Cy's columns and ₱40.92 in Dan's, Eve's and Fay's (BR-CA34).
- **AC-CA8.2** Given Example A saved, then the shared sub-row reads "Gyoza (shared)" with ₱145.00 in Ana's and Ben's columns.
- **AC-CA8.3** Given the same items in a finished session, then History shows the same sub-rows, with no Edit and no ×.
- **AC-CA8.4** Given the same items, then the PDF statement shows the same sub-rows under each item, with the discount part printed with a leading minus, in full, inside Cy's column (BR-CA35).
- **AC-CA8.5** Given the group's Total row on Breakdown and the PDF, then it adds up item rows only and reads the same as if the final shares had been typed by hand.
- **AC-CA8.6** Given Example D1 saved, then Ana's column on the item row shows "—" (her share is ₱0.00), and her sub-rows show Pasta ₱450.00 and Voucher −₱450.00.

### US-CA9: Remove a member

As the person logging, I want removing someone from the session to leave everyone else's
amounts alone, as Equal Split does.

- **AC-CA9.1** Given Example B saved, when I remove Ben from the session, then every other member's share for the item is exactly as before, and the item's total becomes ₱1,910.12 (Example F1).
- **AC-CA9.2** When I remove Cy instead, then the PWD row is gone, the service charge row shows ₱204.62 split five ways, nobody else's share changes, and the total becomes ₱2,140.12 (Example F2).
- **AC-CA9.3** Given Example A saved, when I remove Ben, then the item keeps "Gyoza (shared)" at ₱145.00 for Ana alone, and Ana's share stays ₱865.00 (Example F3).
- **AC-CA9.4** Given Example D1 saved, when I remove Ben, then the item is removed, because only Ana at ₱0.00 is left (BR-CA40).
- **AC-CA9.5** Given the form is open with Cy holding the PWD discount, when Cy is removed from the session, then Cy is unpicked, the PWD row stays with nobody ticked, and the hint "Choose who gets PWD" shows (BR-CA24).

### US-CA10: Older tabs and older items stay safe

As the owner, I want the previous release and existing data to keep working, so that nobody's
balances move.

- **AC-CA10.1** Given a session saved before this release, then Breakdown, Summary, History and the PDF show exactly the same items, amounts and balances after it.
- **AC-CA10.2** Given an item with own orders only (named or not), then it's stored, staged and shown exactly as in PR #137, with no "Share" figures in the form.
- **AC-CA10.3** Given Example B saved by this release and open in a second tab still running `343a8cb`, then that tab shows the item's total and each member's share correctly (without the receipt rows), and doesn't crash.
- **AC-CA10.4** When that older tab saves the session without touching the item (for example by adding another purchase), then the receipt rows are still there after a reload in the new tab.
- **AC-CA10.5** When that older tab edits the item and saves it unchanged, then every member's share and the item's total are unchanged after a reload; the receipt rows are gone, which is accepted (BR-CA45). A member who was at ₱0.00 is no longer listed in the item, and owes nothing either way.
- **AC-CA10.6** When that older tab removes a member who was on the service charge, then the other members' shares are unchanged after a reload; the receipt rows are gone.

### US-CA11: Phone and desktop

- **AC-CA11.1** Given a phone at 320px wide, when I fill Example B with every row, then the page never scrolls sideways, every box, pill, × and "+ Add" button is at least 44px tall, and each row's name box stays usable beside its amount and ×.
- **AC-CA11.2** Given a phone at 375px, then the same holds, and the footer's four lines are right-aligned and readable.
- **AC-CA11.3** Given a desktop, then everything outside the new sections, the share figures and the footer lines looks as in PR #137.
- **AC-CA11.4** Every × and every picker has an accessible name naming its row (section 7).

## 4. Business rules

### Settled by the owner

- **BR-CA1 Where these live.** Shared orders, discounts and charges exist only on Custom Amounts items. Not on Equal Split items, not on a whole record, not across a save.
- **BR-CA2 Amounts.** Every shared order, discount and charge is a ₱ amount as printed on the receipt. No percentages. Any number of each per item.
- **BR-CA3 Shared order.** A shared order has a name, a ₱ price and its own member picker, which starts with everyone in the item ticked ("Everyone", BR-CA21). Its price is split equally across the members ticked, the leftover centavos going one each to the first names alphabetically, as in Equal Split (BR-CA15).
- **BR-CA4 Discount.** A discount comes off the share of the member(s) ticked on it only (the PWD or senior cardholder). With more than one ticked, it's split equally across them under BR-CA15.
- **BR-CA5 Charge.** A charge (VAT, service charge, tip) is split equally across everyone in the item (BR-CA13) under BR-CA15. It has no picker.
- **BR-CA6 The floor.** A member's final share in an item can never be below ₱0.00. Exactly ₱0.00 is allowed (for example, a voucher covering a whole meal). That member stays in the item, still counts in the charge split, and is stored with ₱0.00.
- **BR-CA7 Removing a member from the session.** Everyone else's amounts stay exactly the same. Each shared order, discount and charge the removed member was on shrinks by their part, as Equal Split does. Their own orders go.
- **BR-CA8 Storage.** Option B: an item with at least one shared order, discount or charge keeps its whole receipt in a separate `bill`. An older tab that edits such an item keeps the money and loses the receipt detail. Accepted.

### Shared orders, discounts and charges

- **BR-CA9 One-member shared orders are allowed.** A shared order with one member ticked is valid; its whole price goes to that member, and it still shows as a shared order everywhere. *Reasoning:* Equal Split already allows a single owner, it arises naturally when a member is unticked or removed (Example F3), and blocking it would only add a message for something that does no harm.
- **BR-CA10 Who can be ticked.** A shared order's or discount's picker lists only the members picked in "Who's in this item", alphabetically. To put someone on a shared order, pick them in the item first.
- **BR-CA11 Discount limit.** A discount only has to keep each holder's final share (own orders + shared parts + charge parts − discount parts) at ₱0.00 or more. It may go beyond the holder's orders and take some or all of their charge part. *Reasoning:* the owner's floor (BR-CA6) is stated on the final share; a stricter cap at orders before charges would block valid receipts (a voucher covering a meal and its service charge) without protecting anyone, because a discount never moves anyone else's share.
- **BR-CA12 Several discounts or charges on one member.** Allowed and added up. A PWD receipt that prints a VAT exemption and a 20% discount as two lines is typed as two discounts with the same holder.

### Who is in the item

- **BR-CA13 (money) In the item.** A member is in the item when they're picked and have at least one priced own order or are ticked on at least one priced shared order. Only members in the item share the charges and are stored on the item, including any at ₱0.00 (BR-CA6).
  - A picked member with nothing priced and no shared order is not in the item: they owe nothing and get no part of a charge, as BR-CO8 says today.
  - Nobody is in the item through a charge alone, and nobody through a discount alone (that share would be negative, BR-CA6).
  - *Reasoning:* BR-CO8 (owner's CQ3) already settles that a picked member with nothing typed owes nothing. A charge is a percentage of what was ordered, so someone who ordered nothing pays none of it. A diner who only ate a shared dish is in the item through that dish.
- **BR-CA14 Late member in the open form.** When "All Members" is ticked in the item, a member added to the session is picked (AC-CO1.6). They join every shared order and discount that has "Everyone" ticked, and so are in the item through any priced "Everyone" shared order. Rows with a hand-picked selection show them unticked.

### Money

- **BR-CA15 (money) Rounding.** Every row is split on its own, in whole centavos, with `splitEvenly` over its members sorted alphabetically (`compareNames`), so each row's parts add up exactly to its amount. An own order has one member; a charge's members are everyone in the item (BR-CA13). The alphabetically first member can pay up to one centavo more per row, as in Equal Split; that's accepted.
- **BR-CA16 (money) A member's final share** = their own priced orders + their parts of shared orders + their parts of charges − their parts of discounts, in whole centavos. It's what's stored as their amount and what everything downstream reads (BR-CO10).
- **BR-CA17 (money) The receipt figures.**
  - **Subtotal** = every priced own order of the picked members + every priced shared order.
  - **Discounts** = every priced discount. **Charges** = every priced charge.
  - **Entered** = Subtotal − Discounts + Charges. Whenever Add Item is allowed, Entered equals the sum of the final shares, to the centavo.
- **BR-CA18 (money) The item's total** is Entered: the receipt's final total after discounts and charges, never Total Amount (BR-CO9 still holds). It's the staged price, the One Payor amount, the amount Multiple Payors contributions must match, and the figure on Breakdown, History and the PDF. It must be above ₱0.00 to add the item, as today (Add Item disabled, no hint).
- **BR-CA19 Total Amount** means the receipt's final total, after discounts and charges. Its label stays "Total Amount (₱)". The mismatch reads as today: "Entered ₱X of ₱Y" in red, and Add Item stays allowed. *Reasoning:* the footer's Subtotal line (BR-CA30) shows a user who typed the subtotal instead what they've done, without new wording on the box.
- **BR-CA20 (money) Fill Remainder.**
  - **Who is blank:** a picked member with no priced own order, whether or not they're on a shared order or hold a discount. Unpicked members are never blank.
  - **Remainder:** Total Amount − Entered. **Enabled when:** Total Amount is above ₱0, at least one picked member is blank, and the remainder is above ₱0.
  - **Split and placement:** as BR-CO11: `splitEvenly` across the blank members alphabetically, into each one's first own line, keeping a typed name. A part of ₱0.00 leaves that member blank.
  - It never changes a shared order, discount or charge.
  - The item lands exactly on Total Amount: filling a blank member can bring them into the charge split, which moves the charge parts between members but never changes Charges or Entered (Example C2).
  - *Reasoning:* Fill Remainder is for "the price nobody remembers" of someone's own dish. If being on a shared order made a member not blank, Example C1 (Ben's forgotten ramen) couldn't be filled.

### Pickers

- **BR-CA21 "Everyone".** Shared-order and discount pickers are the same control as "Who's in this item": an "Everyone" pill, then one pill per picked member. "Everyone" is live: it means every member picked in the item, now and later, and while it's ticked the individual pills show ticked and locked. Ticking every member one by one is the same as "Everyone".
- **BR-CA22 Starting state.** A new shared order starts with "Everyone" ticked (owner). A new discount starts with nobody ticked. *Reasoning:* a discount belongs to the cardholder, so ticking everyone by default would quietly turn it into a whole-table discount; "Who's in this item" also starts empty (BR-CO2).
- **BR-CA23 Picking a member in the item** adds them to every row with "Everyone" ticked, and shows them unticked on the others. *Reasoning:* the precedent of "All Members" (AC-CO1.6).
- **BR-CA24 Unpicking a member in the item**, or the member being removed from the session while the form is open, takes them off every shared order and discount at once, with no confirmation (BR-CO3). A row left with nobody ticked stays, with its name and amount, and blocks Add Item with its hint (section 7). It's never removed on its own. *Reasoning:* unticking every Equal Split owner keeps the price and blocks Add Item; a shared row is typed work the user may want to give to someone else.
- **BR-CA25 Unticking "All Members"** unpicks everyone, so their own lines go (AC-CO1.3) and every shared order and discount is left with nobody ticked; the rows stay (BR-CA24).

### Names, rows and amounts

- **BR-CA26 Names are optional**, as order names are (BR-CO6): trimmed, at most 60 characters, not unique. No suggested names; the boxes' placeholders are "Order name", "Discount name" and "Charge name". *Reasoning:* the precedent of order names; suggestions are extra behaviour nobody asked for, and receipts word these lines differently.
- **BR-CA27 Amounts** are read like price boxes today (`parsePositiveAmount`): rounded to the centavo; blank, 0, negative or unreadable means "no amount". A discount is always typed as a positive figure; it's the row's kind that subtracts it.
- **BR-CA28 Rows at Add Item and Save Edits:**
  - A shared, discount or charge row with no amount and no name is dropped.
  - A row with a name and no amount blocks Add Item (section 7).
  - A shared order or discount with an amount and nobody ticked blocks Add Item.
  - A priced charge with nobody in the item blocks Add Item.
  - A final share below ₱0.00 blocks Add Item (BR-CA6).
  - Own order lines follow BR-CO8 unchanged.
  - Save Edits is enabled under exactly the same checks.
- **BR-CA29 Sections.** "+ Add shared order", "+ Add discount" and "+ Add charge" show when at least one member is picked. A section ("Shared orders", "Discounts", "Charges") shows only while it has at least one row. Every row has a ×; a section can have no rows, unlike a member's own lines (BR-CO5).
- **BR-CA30 The footer.** When the item has at least one priced discount or charge, the footer shows, one per line, "Subtotal ₱X", "Discounts −₱Y" (only when there is a priced discount), "Charges ₱Z" (only when there is a priced charge), then "Entered ₱N" with the usual red "of ₱T". Otherwise it shows "Entered ₱N" alone, as today. *Reasoning:* receipts print these figures in this order, so the user can check each against the paper.
- **BR-CA31 Share figures.** While the item has at least one shared order, discount or charge row, each member block shows the member's final share (BR-CA16) beside their name: "—" when they have no priced order, no shared order and no discount; a negative share in the warning colour.

### Switching mode

- **BR-CA32 Equal Split to Custom Amounts:** unchanged (BR-CO4). No shared, discount or charge rows are created.
- **BR-CA33 Custom Amounts to Equal Split:** the picked members become the owners and the name stays, as today; Total Amount, every own line, shared order, discount and charge clear, with no confirmation. *Reasoning:* BR-CO4 and the flexible Paid By decision NQ1 both set "no confirmation" on a mode switch, and Equal Split has nowhere to keep a discount for one member. If the owner wants a warning, it should cover any Custom item with typed lines, not only these rows, so it's a change to BR-CO4 rather than part of this feature.

### Display

- **BR-CA34 Order of rows** everywhere (form, staged pills, Breakdown, History, PDF): own orders by member alphabetically, then in the order added (BR-CO13); then shared orders, then discounts, then charges, each in the order added. A row's members are listed alphabetically.
- **BR-CA35 Breakdown, History and the PDF**, for an item with a receipt (BR-CA8):
  - The item row is as today: name, Item Total (the item's total, BR-CA18) and each member's final share. A member at ₱0.00 shows "—", as any zero share does today.
  - Beneath it, one sub-row per row of the receipt, in the BR-CA34 order, in the sub-row style of BR-CO14 and BR-CO15 (indented, smaller, muted):

    | Row | Item column | Member columns |
    |---|---|---|
    | Own order | Its name, or "No name" (unchanged) | Its price in its member's column |
    | Shared order | "Gyoza (shared)", or "Shared order" with no name | Each ticked member's part |
    | Discount | Its name, or "Discount" with no name | Each holder's part, with a leading minus: "−₱300.00" |
    | Charge | Its name, or "Charge" with no name | Each in-the-item member's part |

  - The fallback labels ("No name", "Shared order", "Discount", "Charge") use the muted italic style "No name" uses today.
  - **Item Total on a shared, discount or charge sub-row** shows that row's printed amount (₱290.00, −₱300.00, ₱245.55) in the sub-row style. Own-order sub-rows keep it empty. Confirmed by the owner (OQ-CA1).
  - Columns of members not on a row are empty, never "—".
  - The group's Total row adds up item rows only, unchanged.
  - **PDF:** the same rows and labels. A discount part prints in full with a leading minus inside the narrowest member column the PDF uses (34pt), never clipped and never running into the next column. An item row is never left at the foot of a page without its first sub-row (BR-CO15).
- **BR-CA36 Staged pills**, for an item with a receipt, one pill per row in the BR-CA34 order:
  - own order: unchanged, "Ana · Sisig ₱280.00" or "Fay: ₱400.50"
  - shared order: "Gyoza (shared) ₱290.00 · Ana, Ben", or "Shared order ₱290.00 · Ana, Ben"
  - discount: "PWD −₱300.00 · Cy", or "Discount −₱300.00 · Cy"
  - charge: "Service charge ₱245.55 · split 6 ways", or "Charge ₱245.55 · split 6 ways"; with one member in the item, "· Ana" instead of "split 1 way"
  - The staged price is the item's total (BR-CA18).
- **BR-CA37 Negative amounts** read "−₱300.00" on screen (minus, then the peso sign), not "₱-300.00", which is what `formatMoney` prints for a negative today. The PDF spells the currency as it does today and prints a leading minus.

### Editing

- **BR-CA38 Edit loads the whole receipt** (a staged row's Edit, and Breakdown's Edit after "Edit item"):
  - picked: every member stored on the item, including any at ₱0.00, with "All Members" ticked when that's every current member (BR-CO27)
  - each member's own orders, names and prices, in stored order; a member with none gets one empty line
  - each shared order, discount and charge with its name and amount; a shared order's or discount's picker has "Everyone" ticked when its members are every member in the item, and the members ticked otherwise
  - Total Amount: the item's total
  - Save Edits with nothing changed writes nothing (BR-CO32). Stamping the loaded fields must give back the same stored item.
  - An item with own orders only loads exactly as in PR #137.
- **BR-CA39 Closed sessions** are read-only, as today; their receipts show in History and the PDF.

### Removing members and late members

- **BR-CA40 (money) Removing a member, saved and staged items** (BR-CA7 made exact):
  - The member's own orders go. Each shared order, discount and charge they were on loses their part; its amount becomes the old amount minus that part, and it's split across the members left under BR-CA15. That gives each of them exactly the part they had (Example F).
  - A shared order or discount left with nobody goes.
  - An item left with no receipt rows other than own orders goes back to PR #137's shape (named lines, or amounts alone).
  - An item left with nobody, or with a total of ₱0.00, is removed; a record left with no items or no payors is removed, as today (BR-CO21). *Reasoning:* an item worth ₱0.00 moves no money, and BR-CO21 already removes an item left with nothing priced.
  - Multiple Payors contributions aren't rescaled, as today.
- **BR-CA41 Late members** (`includeMember`): unchanged. Custom Amounts items are never offered, so a member added later never joins a shared order, discount or charge, and charges never re-split. To add them, edit the item.

### Storage and compatibility

- **BR-CA42** Every member in the item (BR-CA13) has a stored amount equal to their final share (BR-CA16), ₱0.00 included. The stored amounts stay the one place money is read from.
- **BR-CA43** An item keeps a receipt only when it has at least one priced shared order, discount or charge. Otherwise it's stored exactly as PR #137 stores it (BR-CO12, BR-CO17), so the same receipt always has one stored shape.
- **BR-CA44** The receipt is kept only if it reproduces every member's stored amount to the centavo and no share is below ₱0.00. Otherwise it's dropped and the item is stored from its amounts alone. A session is never rejected over a receipt, as for order lines today.
- **BR-CA45 Older tabs (PR #137):** as the architect's table in section 4 of the brief: they show correct money; an untouched save keeps the receipt; an Edit and save keeps the money and drops the receipt (and any member at ₱0.00, who owes nothing either way); a member removal keeps everyone else's money and drops the receipt when it no longer reconciles.
- **BR-CA46** No stored item is rewritten by this release. An item gets a receipt only when a user saves one.

### Onboarding tour

- **BR-CA47** No tour step is added or changed, and no step targets these fields: they're inside Custom Amounts, which is never on screen during the tour. No `data-tour` attribute is added, moved, renamed or duplicated. The `tab-expenses` step's text ("Split evenly or give each person an exact amount — one purchase can mix both.") stays true and doesn't change. `steps.test.ts` and `targets.test.ts` must pass.

## 5. Worked examples

Every figure is in whole centavos and has been checked by hand: each row's parts add up to its
amount, and each item's shares add up to Subtotal − Discounts + Charges.

### Example A: Mendokoro (the owner's bill, names changed)

Picked: Ana, Ben. One Payor: either.

| Row | Amount | Ana | Ben |
|---|---|---|---|
| Ana · Ramen | 720.00 | 720.00 | |
| Ben · Ramen | 750.00 | | 750.00 |
| Gyoza (shared, Everyone) | 290.00 | 145.00 | 145.00 |
| **Share** | **1,760.00** | **865.00** | **895.00** |

No discount or charge, so the footer shows "Entered ₱1,760.00" alone.

**Variant, Gyoza ₱290.01:** 29,001 centavos over 2 is 14,500 remainder 1, so Ana (first
alphabetically) gets 145.01 and Ben 145.00. Ana 865.01, Ben 895.00, total 1,760.01.

### Example B: six diners, a PWD discount and a service charge

Picked: Ana, Ben, Cy, Dan, Eve, Fay (Gus, also in the session, isn't picked). Total Amount
₱2,401.05.

| Row | Amount | Ana | Ben | Cy | Dan | Eve | Fay |
|---|---|---|---|---|---|---|---|
| Own orders | 2,455.50 | 380.00 (Sisig 280.00, Rice 100.00) | 450.00 (Kare-kare) | 520.00 (Bulalo) | 295.00 (Adobo) | 410.00 (Pancit 180.00, Halo-halo 230.00) | 400.50 (Sinigang) |
| PWD (Cy) | −300.00 | | | −300.00 | | | |
| Service charge | 245.55 | 40.93 | 40.93 | 40.93 | 40.92 | 40.92 | 40.92 |
| **Share** | **2,401.05** | **420.93** | **490.93** | **260.93** | **335.92** | **450.92** | **441.42** |

- Service charge: 24,555 centavos over 6 is 4,092 remainder 3, so the first three alphabetically
  (Ana, Ben, Cy) pay 40.93 and the others 40.92. 3 × 40.93 + 3 × 40.92 = 245.55.
- Footer: Subtotal ₱2,455.50 / Discounts −₱300.00 / Charges ₱245.55 / Entered ₱2,401.05.
- Shares: 420.93 + 490.93 + 260.93 + 335.92 + 450.92 + 441.42 = 2,401.05 = 2,455.50 − 300.00 + 245.55.
- One Payor Ana: the record's amount is ₱2,401.05; the others owe Ana 1,980.12 in all
  (2,401.05 − 420.93).

### Example C: Fill Remainder

**C1, Example A with Ben's ramen not typed,** Total Amount ₱1,760.00. Ben is blank (no priced
own order) although he's on the Gyoza. Entered = 720.00 + 290.00 = 1,010.00. Remainder 750.00,
all to Ben's first line. Result: Example A.

**C2, Example B with Fay's line empty,** Total Amount ₱2,401.05.

- Before: Fay has no priced own order and no shared order, so she isn't in the item (BR-CA13).
  The charge is split five ways: 24,555 / 5 = 4,911, so ₱49.11 each.
  Shares: Ana 429.11, Ben 499.11, Cy 269.11, Dan 344.11, Eve 459.11, Fay "—".
  Subtotal 2,055.00, Entered 2,055.00 − 300.00 + 245.55 = 2,000.55, shown "of ₱2,401.05" in red.
- Fill Remainder: 2,401.05 − 2,000.55 = 400.50, all to Fay's first line.
- After: Fay is in the item, the charge is split six ways, and every share is Example B's.
  Entered ₱2,401.05, no red.

### Example D: the floor

**D1, a voucher with no charge.** Picked: Ana, Ben. Ana "Pasta" 450.00, Ben "Steak" 600.00,
discount "Voucher" 450.00 for Ana. Ana 0.00, Ben 600.00, total 600.00. Allowed; Ana stays in the
item, stored at ₱0.00.

**D2, the same with a ₱105.00 service charge.** 10,500 / 2 = 5,250, so ₱52.50 each.

| Voucher | Ana's share | Ben's share | Total | Add Item |
|---|---|---|---|---|
| 450.00 | 450.00 + 52.50 − 450.00 = 52.50 | 652.50 | 705.00 | Allowed |
| 502.50 | 0.00 | 652.50 | 652.50 | Allowed (BR-CA11: the discount takes her charge part) |
| 510.00 | −7.50 | 652.50 | | Blocked: "Ana's share would be −₱7.50. Lower the discount or add Ana's order." |

### Example E: a discount for two holders

"Senior" ₱250.01 for Dan and Eve: 25,001 / 2 = 12,500 remainder 1, so Dan (first
alphabetically) gets −125.01 and Eve −125.00.

### Example F: removing a member from the session (saved items)

**F1, Example B, remove Ben.** His Kare-kare goes and his 40.93 of the charge goes: the charge
becomes 204.62 over Ana, Cy, Dan, Eve, Fay. 20,462 / 5 = 4,092 remainder 2, so Ana and Cy 40.93,
Dan, Eve and Fay 40.92: exactly what they had. Shares unchanged: Ana 420.93, Cy 260.93, Dan
335.92, Eve 450.92, Fay 441.42. Item total 1,910.12 (2,401.05 − 490.93).

**F2, Example B, remove Cy.** Bulalo goes, the PWD discount (Cy alone) goes, the charge becomes
204.62 over Ana, Ben, Dan, Eve, Fay: Ana and Ben 40.93, the others 40.92. Shares unchanged. Item
total 2,140.12 (2,401.05 − 260.93).

**F3, Example A, remove Ben.** Ben's ramen goes and the Gyoza becomes 145.00 for Ana alone (a
one-member shared order, BR-CA9). Ana 865.00. Item total 865.00. In the variant, Ana keeps 145.01.

**F4, Example E, remove Dan.** The Senior discount becomes 125.00 for Eve alone; remove Eve
instead and it becomes 125.01 for Dan. Either way the one left keeps their part.

**F5, Example D1, remove Ben.** Only Ana at ₱0.00 is left, so the item is removed (BR-CA40).

## 6. Edge cases

### The form

| Case | Expected |
|---|---|
| Nobody picked | No blocks and no "+ Add" buttons. Existing rows stay with nobody ticked (BR-CA24, BR-CA25). Add Item disabled |
| One member in the session | One pill everywhere; shared orders, discounts and charges all fall on that member; the floor still applies |
| Many members (15 or more) | Each shared and discount picker wraps onto several lines; "Everyone" is ticked by default on shared orders, so nothing has to be ticked one by one. No horizontal scroll |
| A member only on a shared order | In the item; their block has one empty own line and a share (Example A's Ben before C1) |
| A member only holding a discount | Not in the item; blocked by the floor message (AC-CA2.9) |
| A picked member with nothing at all, and a charge | Not in the item; no part of the charge (AC-CA3.6) |
| "All Members" ticked, a late member added while a shared order has "Everyone" | Picked and put on that shared order, so they pay a part (BR-CA14). Untick them or the order's "Everyone" if they weren't there |
| Unpicking the only member ticked on a discount | The discount stays with nobody ticked; "Choose who gets …" (BR-CA24) |
| A discount equal to every order and no charge | Every share ₱0.00, total ₱0.00: Add Item disabled, no hint, as a ₱0 item today |
| Discount typed as a negative, or 0 | No amount (BR-CA27) |
| Two discounts for the same holder (VAT exemption and PWD) | Both apply (BR-CA12) |
| A charge for some members only (corkage for three) | Out of scope. Enter it as a shared order ticked for those three |
| A percentage service charge | Type the ₱ amount the receipt prints (BR-CA2) |
| Total Amount typed as the subtotal | Red "of ₱Y"; the Subtotal line matches the typed figure, which shows what happened |
| Fill Remainder with a charge and a blank member | Lands exactly on Total Amount; charge parts move between members (Example C2) |
| Fill Remainder when the only blank member is on a shared order | They're filled (Example C1) |
| Several problems at once | Each section shows the first problem in its own rows; the floor hint shows above the footer |
| Very long names (member or row) | Wrap in the block header, pills, sub-rows and PDF; never push an amount or × off-screen. Row names capped at 60 characters |
| Same name on an order and a discount | Allowed |
| Custom to Equal Split with a receipt typed | Everything but the name and picked members clears, no confirmation (BR-CA33) |
| Switching mode during an edit | Same as above; nothing is saved until Save Edits |
| Multiple Payors, then a discount added | The contributions no longer match the new total: red "Contributed … of …", Add Item disabled until retyped |

### Saved and staged items

| Case | Expected |
|---|---|
| Item with own orders only | Exactly PR #137 (BR-CA43) |
| Item whose only shared, discount and charge rows had no amount | Rows dropped at Add Item; stored as PR #137 |
| A member at ₱0.00 on Breakdown | "—" in their column on the item row; their sub-rows show the order and the discount (AC-CA8.6) |
| A member at ₱0.00 who is the payor | Owes nothing, as any payor; others owe them as usual |
| Removing a member, every variant | Example F; BR-CA40 |
| Removing the item's One Payor | The record goes with its payor, as today |
| Late member | Never offered for Custom items (BR-CA41) |
| Edit of a member only on a shared order | Picked, empty own line, ticked on the order (AC-CA7.4) |
| Edit with nothing changed | No write (AC-CA7.5) |
| Older tab shows, saves, edits or removes a member | BR-CA45; AC-CA10.3 to AC-CA10.6 |
| Release rolled back | The previous release drops the receipt on the next save of each session that has one; the money is kept (architect's brief, section 6) |
| Closed session | Read-only; receipts in History and the PDF (BR-CA39) |
| A session with no purchases | Nothing changes; Breakdown's empty state as today |
| PDF with many members and a large discount | The minus and every digit fit the 34pt column (BR-CA35) |

## 7. Layout and messages

### The form, top to bottom (phone and desktop)

1. Total Amount (₱) and Fill Remainder: unchanged.
2. "Who's in this item": unchanged.
3. Member blocks: unchanged, plus the share figure beside each name while the item has a shared,
   discount or charge row (BR-CA31). The name wraps; the figure stays on the header line or
   wraps under the name on a narrow screen, never off the block.
4. The own-order hint "Add a price for Bulalo or remove it": unchanged.
5. **Shared orders**, then **Discounts**, then **Charges**, each only while it has a row:
   - a heading in the style of the "Who's in this item" label
   - Discounts' helper line: "Comes off the share of the people ticked." Charges' helper line:
     "Split equally across everyone in this item." Shared orders has none.
   - per row: name box, amount box and × in the same grid as an own-order line; for shared orders
     and discounts, the picker below the boxes
   - the section's hint below its rows
6. "+ Add shared order", "+ Add discount", "+ Add charge": ghost buttons in one row that wraps,
   shown while at least one member is picked.
7. The floor hint.
8. The footer (BR-CA30), each figure on its own right-aligned line, "Entered" in today's style.

**Phone (inside `@media (max-width: 640px)`):** rows use PR #137's phone line grid (name box, 92px
amount box, 44px ×); every box, pill, × and "+ Add" button at least 44px tall; picker pills wrap;
the "+ Add" buttons stack when they don't fit. At 320px, with the card's padding, a row's name box
keeps about 100px, as PR #137 measured; no horizontal page scroll.

**Desktop:** member blocks keep their grid. The three sections sit below it at the card's width;
their rows don't need to span it. Nothing outside the Custom Amounts fields changes.

### Messages that block Add Item and Save Edits

Hints use the 12px warning style of today's missing-price hint. One per section: the first
problem in that section's rows, top to bottom.

| Condition | Where | Wording |
|---|---|---|
| Own order with a name and no price | Under the member blocks | Add a price for Bulalo or remove it (unchanged) |
| Shared order with a name and no price | Under Shared orders | Add a price for Gyoza or remove it |
| Priced shared order with nobody ticked | Under Shared orders | Choose who shares Gyoza / Choose who shares the unnamed shared order |
| Discount with a name and no amount | Under Discounts | Add an amount for PWD or remove it |
| Priced discount with nobody ticked | Under Discounts | Choose who gets PWD / Choose who gets the unnamed discount |
| Charge with a name and no amount | Under Charges | Add an amount for Service charge or remove it |
| Priced charge, nobody in the item | Under Charges | Charges are split across the people with orders. Add an order first. |
| A share below ₱0.00 (first member alphabetically) | Above the footer | Cy's share would be −₱300.00. Lower the discount or add Cy's order. |
| No item name, or a total of ₱0.00 | None | Add Item disabled, as today |

When a section has a missing-amount problem and a nobody-ticked problem, the first in row order
shows.

### Accessible names

Following PR #137's pattern (`n` is the row's position in its section, from 1):

| Control | Label |
|---|---|
| Shared order name / price | Shared order n name / Shared order n price |
| Discount name / amount | Discount n name / Discount n amount |
| Charge name / amount | Charge n name / Charge n amount |
| Their clear buttons | Clear shared order n name, Clear discount n amount, and so on |
| × | Remove shared order Gyoza / Remove shared order (no name); Remove discount PWD / Remove discount; Remove charge Service charge / Remove charge |
| Pickers | A group named "Who shares Gyoza" / "Who shares shared order n"; "Who gets PWD" / "Who gets discount n" |
| "+ Add" buttons | Their visible text |
| Share figure | "Ana's share ₱420.93" |

## 8. Scope

**In:**
- shared orders, discounts and charges on Custom Amounts items, in the form, with pickers,
  share figures, footer lines and hints
- Fill Remainder counting Entered as the net (BR-CA20)
- One Payor and Multiple Payors against the net total
- the stored receipt (Option B) with reconciliation, and every PR #137-tab case (BR-CA45)
- Edit loading a receipt back, staged and saved
- member removal from saved and staged items (BR-CA40)
- display in the staged list, Breakdown, History and the PDF
- tests: Examples A to F to the centavo; the variant's extra centavo; stamp and reload round
  trips; each reconcile failure dropping the receipt and keeping the money; ₱0.00 members kept;
  removal leaving the others unchanged; Summary equal to the same shares typed by hand; the
  PR #137-tab cases as unit tests where possible and as a tester check against a `343a8cb` build in
  a second tab

**Out:**
- percentages
- discounts or charges on Equal Split items, on a whole record or on a save
- a charge for some members only (use a shared order)
- suggested or preset names
- a fairer rotation of leftover centavos
- offering Custom items in the late-member dialog
- a warning on switching Custom Amounts to Equal Split (BR-CA33)
- moving PR #137 `lines` items to the new shape (Option C), any data migration, any schema or API
  change
- new tour steps or tour copy
- the ADR and any documentation beyond this file
- anything in Summary, netting, settlement or Collection

**Notes for the tech lead** (findings in today's code):
1. `formatMoney(-300)` prints "₱-300.00"; BR-CA37 wants "−₱300.00".
2. `itemFromLines` stores an amount only when it's above ₱0, and `linesFromItem` skips members at
   ₱0 or less. The successors must keep ₱0.00 members (BR-CA42, AC-CA7.3). The `amounts` doc
   comment in `src/types/index.ts` ("Members with no share are absent") changes, and every reader
   of `amounts` and `getItemShares` needs a check: Breakdown and the PDF already show "—", the
   owed matrix skips shares of ₱0 or less, and `stagedNamesMember` already counts the member.
3. A PR #137 tab's Edit drops a ₱0.00 member from the item; money is unchanged (AC-CA10.5).
4. The PDF's narrowest member column is 34pt (`src/pdf/layout.ts`); the width of "-1,234.56" at
   the sub-row's 7pt DM Mono needs checking (BR-CA35).
5. `OwnerGrid` already takes an `allLabel`, so "Everyone" may not need a new control.

## 9. The architect's hand-off questions, answered

| # (brief 9.1) | Question | Answer | Rule |
|---|---|---|---|
| 1 | Discount limit | Final share at ₱0.00 or more only; may take the charge part | BR-CA11 |
| 2 | Who is in the item | Picked with a priced own order or on a priced shared order; not through a charge or discount alone; a picked member with nothing is out, as today | BR-CA13 |
| 3 | One-member shared orders | Allowed | BR-CA9 |
| 4 | Pickers when membership changes | "Everyone" is live; picked members join "Everyone" rows; unpicked members leave every row; a row left empty stays and blocks Add Item | BR-CA21 to BR-CA25 |
| 5 | Names | Optional, 60 characters, fallback labels; no suggestions | BR-CA26, BR-CA35 |
| 6 | Total Amount and the footer | Total Amount is the final receipt total; footer adds Subtotal, Discounts, Charges when there's a discount or charge; mismatch wording unchanged | BR-CA17 to BR-CA19, BR-CA30 |
| 7 | Fill Remainder | Blank = no priced own order; remainder = Total Amount − Entered | BR-CA20 |
| 8 | Custom to Equal Split | No warning, as BR-CO4 | BR-CA33 |
| 9 | Display | Row order, labels, minus sign, pills, PDF | BR-CA34 to BR-CA37; OQ-CA1 |
| 10 | Messages | Section 7 | BR-CA28 |
| 11 | Phone and desktop layout | Section 7 | AC-CA11 |
| Extra | Edit loading a receipt | BR-CA38 | |
| Extra | Payor totals against the net | BR-CA18; US-CA6 | |
| Extra | 320px | AC-CA11.1; section 7 | |
| Extra | Tour | None | BR-CA47 |

Owner questions 1 to 3 of the brief were settled at intake (BR-CA6, BR-CA7, BR-CA8); question 4
(the ADR) was answered no.

## 10. Open questions for the owner

1. **OQ-CA1: the printed amount on Breakdown, History and the PDF. Resolved: yes.** The owner
   confirmed the recommendation: shared, discount and charge sub-rows show the printed amount in
   the Item Total column, muted, and own-order sub-rows keep it empty. BR-CA35 holds as written. The
   original question follows.

   A shared order, discount or
   charge is split into parts in the member columns, so the figure printed on the receipt (₱290.00,
   −₱300.00, ₱245.55) doesn't appear anywhere. Should its sub-row show that figure in the Item
   Total column, in the muted sub-row style? **Recommendation: yes**, for shared orders, discounts
   and charges only (own orders already show their full price in the member's column). It lets the
   group tick the receipt off line by line, which is the point of the feature, and the Total row
   doesn't change because it adds up item rows only. The alternative keeps every sub-row's Item
   Total empty, as order lines are today, and the parts have to be added up to check against the
   receipt. BR-CA35 is written with the recommendation.
