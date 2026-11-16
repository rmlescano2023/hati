# Requirements: order lines in Custom Amounts, picking who's in an item, and editing saved items

Source: the owner's intake decisions (1 to 8), the owner's answers to CQ1 to CQ9 (section 8),
including the scope change in CQ1, and the code on `feature-custom-orders` (branched from
`main` after PR #133), as read on 2026-11-15. The owner's decisions are final. Statements about
"today" come from reading the code, not from the running app. The members in the examples (Ana,
Ben, Cy, Dan, Eve, Fay, Gus, Hal, Ivy, Jo) are made up.

IDs here carry a `CO` prefix so they don't clash with the flexible Paid By (`BR-1`…) and late
member (`BR-LM1`…) documents.

**Changed by the owner's CQ1 answer.** Decision 7's "inline edits stay as they are for items
without order names" no longer holds. Breakdown loses all inline editing, for every item, and
every saved item gets an Edit that takes it back to the Expenses tab (US-CO6, US-CO7, BR-CO16
to BR-CO19, BR-CO24 to BR-CO38).

## 0. How it works today

### Custom Amounts and Fill Remainder

1. **A Custom Amounts item stores one number per member** (`CustomAmountItem.amounts` in
   `src/types/index.ts`): `{name: amount}`. Members with no share are left out. The item's
   total is the sum of the amounts (`getItemTotal`), and each member's share is their amount
   (`getItemShares`). There's nowhere to say what a member ordered.
2. **The Custom Amounts form** (`src/components/home/CustomAmountFields.tsx`):
   - a "Total Amount (₱)" box, which is only a target and is never checked
   - a "Fill Remainder" button
   - one amount box for **every member of the session**, in the session's order (alphabetical)
   - a footer, "Entered ₱X", which turns red with "of ₱Y" when the amounts don't match a Total
     Amount above ₱0
   - with no members, only "Add group members first."
3. **Fill Remainder** (`fillRemainder` in `PurchaseItemCard.tsx`, `distributeRemainder` in
   `src/lib/calculations.ts`):
   - A member is "blank" when their box reads as ₱0 (empty, 0, negative or unreadable).
   - It's enabled when Total Amount is above ₱0, at least one member is blank, and Total Amount
     minus the entered amounts is above ₱0.
   - It splits that remainder with `splitEvenly` across **every blank member in the session**,
     in alphabetical order, so the leftover centavos go one each to the first names.
   - A blank member whose part rounds to ₱0.00 stays blank (₱0.02 across three gives ₱0.01,
     ₱0.01 and nothing).
   - This is the problem in decision 5: with 10 members and 6 at dinner, the 4 who weren't
     there are charged too unless their boxes are filled first.
4. **Add Item** (`itemValid`) needs a trimmed name and amounts adding up to more than ₱0. Only
   amounts above ₱0 are stored. With Multiple Payors, the contributions must match the sum of
   the amounts, not Total Amount.
5. **Equal Split's owner picker** is `OwnerGrid`: an "All Members" pill plus a pill per member.
   It starts with nothing ticked. "All Members" is live: it means every current member, so a
   member added while it's ticked is included (`selectedOwners`).
6. **Switching between Equal Split and Custom Amounts** keeps the item name and clears
   everything else: price, owners, Total Amount and amounts (`ModeToggle` `onChange`, owner
   answer NQ1 of flexible Paid By).

### Staging, editing a staged item, and saving

7. **Staged items** (`ItemStagingList.tsx`) show a Custom item's members as pills,
   "Ana: ₱150.00". Each row has a pencil (Edit) and a ×.
8. **Edit on a staged row** (`startEdit` in `PurchaseItemCard.tsx`):
   - It loads the row's date, Paid By (mode, payor, contributions) and item into the form
     (`draftFromItem`). Equal Split ticks "All Members" only when the owners are every current
     member; Custom sets Total Amount to the item's total and each member's box to their amount.
   - Whatever was half-typed is replaced without asking.
   - Add Item becomes **Save Edits** and **Cancel**. Every row's Edit and × are locked, the
     row shows an "Editing" tag, and Save to Breakdown is disabled.
   - **Save Edits** replaces the staged row in place, with the same id. **Cancel** leaves it.
     Either way, the date and Paid By go back to what they were before Edit, and the item
     fields clear (`endEdit`).
   - If a member removal deletes the row being edited, the edit ends as Cancel does.
9. **Save to Breakdown** (`buildRecords` in `src/lib/staging.ts`) writes every staged item in
   one change:
   - items paid by one member (One Payor, or Multiple Payors with one contributor) share a
     record per date and payor, and that payor's amount is the record's total
   - an item with two or more contributors always gets a record of its own
   - each new record gets its own `createdAt`, in staging order
10. **Breakdown cards** (`groupRecordsForBreakdown`) group records by date plus the set of payor
    names, newest date first. Within a card, records are in `createdAt` order and items in
    record order.

### Breakdown, History and the PDF

11. **Breakdown** (`src/components/breakdown/BreakdownTable.tsx`) has one row per item: an
    editable name cell, an editable Item Total cell, an editable cell per member, and a × at the
    far right. The table scrolls sideways inside its card; no column is pinned, so on a phone
    with several members the × is off-screen until you scroll.
    - **Item Total on a Custom item** scales every member's amount by the same factor, each
      rounded to the centavo (`updateItemTotal`).
    - **A member's cell** sets that member's amount; ₱0 removes them, and an item with nobody
      left is removed. On an Equal Split item it first converts the item to Custom Amounts with
      the shares it had (`toCustomItem`, `updateItemMemberAmount`).
    - `updateItemName`, `updateItemTotal` and `updateItemMemberAmount` (and `toCustomItem`)
      have **no caller other than these Breakdown cells**, through `AppDataContext`. The
      late-member flow uses `includeMember`, not these. `EditableCell` is used only here.
12. **History** (`HistoryDetailPage.tsx`) shows the same cards with `editable={false}`: no
    inputs, no ×, a "Locked" tag. Nothing in the code makes a finished session editable.
13. **The PDF statement** (`src/pdf/TransactionTable.tsx`) prints one row per item: name, price
    and a column per member. A row never splits across pages.

### Tabs, leaving and reloading

14. **The session's tabs** (`SessionWorkspace.tsx`) show one page at a time: Expenses,
    Breakdown or Summary. Leaving Expenses unmounts it, which drops the staged items and the
    form. With staged items, leaving (another tab, or Back to Home) first asks "Leave without
    saving?" ("Discard and leave" / "Stay"). Half-typed fields with nothing staged are dropped
    without asking.
15. **So the Expenses form is always empty when Breakdown is on screen.** Nothing staged or
    typed survives the switch.
16. **Reloading** loses the form and staged items; they're held only in memory. While anything
    is staged, the browser's `beforeunload` prompt asks first. While a save is still on its way
    to the server, the same prompt asks, and a reload keeps the on-screen copy of a session
    with a save in flight (`docs/specs/lost-edits-on-reload.md`).

### Members, storage

17. **Removing a member** (`removeMember`, `purgeMemberFromItem`) drops them from items and
    payors. An Equal Split item's price shrinks by their share. A Custom item loses their amount.
    An item left with nobody is removed, and so is a record left with no items **or no payors**.
    Remaining Multiple Payors contributions aren't rescaled, so they can stop adding up.
    Group Members sits on the Expenses tab, above the form.
18. **Adding a late member** (`includableGroups`, `IncludeMemberDialog`) offers only saved Equal
    Split items. Custom Amounts items are never offered.
19. **Storage:** a record's items are one `jsonb` column on `purchase_records`. Every save goes
    through `parseSession` → `parseItem` (`src/lib/storage.ts`), on the server too
    (`api/_validate.ts`). For a Custom item, `parseItem` keeps only `id`, `name`, `mode` and
    `amounts`, so **any extra field is dropped on save today**. The browser doesn't parse what
    it loads; it uses the JSON as it arrives.
20. **Records saved before flexible Paid By** (PR #133) can hold several items under one set of
    Multiple Payors contributions that cover the whole record. Since PR #133, a record with
    two or more contributors holds exactly one item.

## 1. Problem

- A Custom Amounts item can say how much each person owes but not what they ordered, so a long
  restaurant bill can't be checked line by line afterwards.
- Fill Remainder charges every member who has no amount, including the people who weren't
  there, so it's unusable in a large group unless the absent members are filled in first.
- Once saved, an item can only be changed one cell at a time on Breakdown. Its date and Paid By
  can't be changed at all, and an item with order lines would have no way to be corrected.

## 2. Outcome (checkable)

- In Custom Amounts, the user picks who's in the item first. Only those members get price boxes.
- Each picked member can have one or more lines, each with an optional order name and a price.
  A member's share of the item is the sum of their lines.
- Fill Remainder splits (Total Amount − sum of the lines) evenly across the picked members with
  no priced line, and never touches a member who wasn't picked.
- Order names show in the staged list, under the item on Breakdown and History, and in the PDF.
- Breakdown shows every item as plain text, with an Edit and a × on each item row. Edit opens
  the whole item, with its date and Paid By, in the Expenses form. Save Edits puts it back
  under the right date and payor; Cancel leaves it exactly as it was.
- An item with no order names is saved, shown and calculated exactly as a Custom item today.
- Every existing item loads, shows and calculates exactly as it does today.
- Summary, net balances and the final settlement come out the same as if each member's sum had
  been typed as today's single amount.

## 3. User stories and acceptance criteria

### US-CO1: Pick who's in the item

As the person logging, I want to choose who was at this purchase before typing prices, so that
nobody who wasn't there is charged.

- **AC-CO1.1** Given a draft session with 10 members, when I switch to Custom Amounts, then I see a "Who's in this item" picker with "All Members" and a pill for each of the 10, and nothing is ticked. No price boxes show yet.
- **AC-CO1.2** When I tick Ana, Ben, Cy, Dan, Eve and Fay, then a block appears for each of the six, in alphabetical order, each with one empty line (an order name box and a price box). Gus, Hal, Ivy and Jo get no block.
- **AC-CO1.3** When I tick "All Members", then every member is picked and the individual pills are locked, as in Equal Split. Ticking it again unpicks everyone.
- **AC-CO1.4** Ticking every member one by one is the same as "All Members", as in Equal Split.
- **AC-CO1.5** Given the session has no members, then Custom Amounts shows "Add group members first.", as today, and no picker.
- **AC-CO1.6** Given "All Members" is ticked, when a member is added to the session, then they're picked and get an empty line. Given only some members are ticked, then the new member appears in the picker unticked.
- **AC-CO1.7** Given Eve is picked and has lines, when I unpick her, then her block and all her lines disappear at once, with no confirmation.

### US-CO2: Type orders

As the person logging, I want to write what each person ordered with its price, so that the
group can check the bill afterwards.

- **AC-CO2.1** Given Ana is picked, when I type "Sisig" and "280" in her line, then the footer reads "Entered ₱280.00".
- **AC-CO2.2** When I press "+ Add order" in Eve's block, then a second empty line appears under her first one. Lines stay in the order I added them.
- **AC-CO2.3** Given Eve has "Pancit ₱180" and "Halo-halo ₱120", then her lines add up to ₱300.00 and the footer counts both.
- **AC-CO2.4** Given a member has two or more lines, when I press a line's × (labelled "Remove Eve's order Halo-halo", or "Remove Eve's order" when it has no name), then that line goes and the footer updates. A member's only line has no × (BR-CO5).
- **AC-CO2.5** Given I leave the order name empty and type only "150" for Cy, then Cy's line counts ₱150.00, exactly like today's amount box.
- **AC-CO2.6** Given a Total Amount of ₱1,830.00 and lines adding up to ₱1,630.00, then the footer reads "Entered ₱1,630.00 of ₱1,830.00" in red, as today. Add Item is still allowed (BR-CO9).
- **AC-CO2.7** Given Fay's line reads "Bulalo" with no price, then Add Item (or Save Edits) is disabled and a hint reads "Add a price for Bulalo or remove it". Typing a price or clearing the name enables it again.
- **AC-CO2.8** Given Gus is picked and his only line is empty, when I add the item, then it's added without Gus and with no warning. He owes nothing for it.
- **AC-CO2.9** An order name box accepts at most 60 characters.

### US-CO3: Fill in the unknown price

As the person logging, I want Fill Remainder to work out the price nobody remembers from the
bill's total, so that I don't have to do the sum myself.

- **AC-CO3.1** Given the owner's dinner (Example A in BR-CO11), when I press Fill Remainder, then Fay's line shows ₱200.00 and the footer reads "Entered ₱1,830.00" with no red. Gus, Hal, Ivy and Jo are unchanged and owe nothing for the item.
- **AC-CO3.2** Given Example B, when I press Fill Remainder, then Cy gets ₱166.67, Dan ₱166.67 and Eve ₱166.66.
- **AC-CO3.3** Fill Remainder is disabled when any of these holds: Total Amount isn't above ₱0; no picked member is without a priced line; the lines already add up to Total Amount or more. Its tooltip says why, as today.
- **AC-CO3.4** Given Fay's line has the name "Bulalo" and no price, when I press Fill Remainder, then the price goes into that line and the name "Bulalo" stays.
- **AC-CO3.5** Fill Remainder never adds a line to, or changes a line of, a member who wasn't picked, or a member who already has a priced line.

### US-CO4: Add, check and fix before saving

As the person logging, I want to see the orders in the staged list and fix them with Edit, so
that I catch mistakes before they reach Breakdown.

- **AC-CO4.1** Given an item with named lines is added, then its staged row shows one pill per line, "Ana · Sisig ₱280.00", in the order of BR-CO13. An unnamed line shows as today, "Fay: ₱200.00".
- **AC-CO4.2** Given an item with no named lines is added, then its staged row looks exactly as today: one pill per member, "Ana: ₱150.00".
- **AC-CO4.3** When I press Edit on a staged item with lines, then the picker shows the members who have lines as picked ("All Members" when that is every current member), each block shows their lines with names and prices as added, and Total Amount shows the item's total.
- **AC-CO4.4** When I change a line and press Save Edits, then the staged row shows the change. Cancel leaves it as it was.
- **AC-CO4.5** Given an item is added, then its staged price is the sum of its priced lines, and with One Payor that's what the payor paid. With Multiple Payors, the contributions must add up to that sum, as today.

### US-CO5: See the orders after saving

As anyone checking the bill, I want the orders shown under each item on Breakdown and in the
PDF, so that I can see what each amount was for.

- **AC-CO5.1** Given a saved item with named lines, then on Breakdown its row shows the item's name, total and each member's sum, and its lines show beneath it as indented sub-rows (BR-CO14).
- **AC-CO5.2** Given the same item, then History's page for the finished session shows the same sub-rows.
- **AC-CO5.3** Given the same item, then the PDF statement's transaction table shows the same sub-rows under the item (BR-CO15).
- **AC-CO5.4** Given a saved item with no named lines, then Breakdown, History and the PDF show it with no sub-rows, as today.
- **AC-CO5.5** Given any session, then Summary (who owes whom, net balances, the final settlement) is the same as if each member's sum had been typed as one amount.

### US-CO6: Breakdown is read-only apart from Edit and ×

As the person logging, I want one way to change a saved item, so that a quick tap on a cell
can't change money without me seeing the whole item.

- **AC-CO6.1** Given an open session's Breakdown, then every item's name, Item Total and member cells show as plain text, for Equal Split, Custom and itemized items alike. Tapping or focusing them doesn't turn them into inputs.
- **AC-CO6.2** Given the same page, then each item row (not its sub-rows) has an Edit control and a ×, and the × removes the item as today.
- **AC-CO6.3** Given an itemized item, then its order sub-rows have no Edit and no ×.
- **AC-CO6.4** Given History's page for a finished session, then there's no Edit and no ×, as today.

### US-CO7: Edit a saved item

As the person logging, I want to reopen a saved item in the purchase form, so that I can fix
its orders, prices, people, date or payor the same way I fix a staged item.

- **AC-CO7.1** Given Breakdown with nothing unsaved on Expenses, when I press Edit on "Dinner" (₱1,830.00, November 12, 2026, paid by Ana), then a prompt opens: title "Edit Dinner?", message "It opens on the Expenses tab with its date and Paid By. Breakdown keeps it as it is until you press Save Edits.", buttons "Edit item" and "Cancel" (BR-CO25).
- **AC-CO7.2** When I press Cancel, press Escape or tap outside the prompt, then it closes and nothing changes.
- **AC-CO7.3** When I press "Edit item", then the Expenses tab opens with:
  - Date: November 12, 2026, and Paid By: One Payor, Ana
  - the item's mode, name and contents (Equal Split owners and price, or Custom picked members with every line)
  - Save Edits and Cancel in place of Add Item
  - a line above the item fields reading "Editing saved item: Dinner"
  - Save to Breakdown disabled
- **AC-CO7.4** Given the item is an itemized Custom item, then every line comes back, with its name and price, under its member, and Total Amount shows the item's total.
- **AC-CO7.5** Given an Equal Split item owned by every current member, then "All Members" is ticked. Given it's owned by some, then only they are ticked.
- **AC-CO7.6** Given an amounts-only Custom item saved before this feature, then each member with an amount is picked, with one unnamed line holding that amount.
- **AC-CO7.7** When I change Fay's line to ₱220.00 and press Save Edits, then I'm back on Breakdown (BR-CO33), Dinner shows ₱1,850.00 and Fay's share ₱220.00 in the same card and the same row position, and Summary updates to match.
- **AC-CO7.8** When I change the date to November 13, 2026 and press Save Edits, then Dinner leaves the November 12 card and appears at the bottom of the "November 13, 2026 · Paid by Ana" card, creating that card if it didn't exist. The other items of the November 12 card are unchanged. If Dinner was the card's only item, that card is gone.
- **AC-CO7.9** When I change Paid By to Multiple Payors, Ana ₱1,000.00 and Ben ₱830.00, and press Save Edits, then Dinner appears in the November 12 card for Ana and Ben, as a record of its own, and Summary's balances follow the new contributions.
- **AC-CO7.10** When I press Cancel, then I'm back on Breakdown and Dinner is exactly as it was: same card, same position, same amounts. Nothing was saved.
- **AC-CO7.11** Given I press Save Edits without having changed anything, then nothing is saved, Dinner stays exactly where it was, and I'm back on Breakdown.
- **AC-CO7.12** Save Edits is enabled under the same checks as Add Item: a name, a valid item (including AC-CO2.7), a date and a valid Paid By.

### US-CO8: Nothing is lost or half-done

As the person logging, I want an edit of a saved item to be all or nothing, so that the item
is never lost or duplicated.

- **AC-CO8.1** Given Save Edits, then removing the item from its old place and putting the new version in its new place is one change, sent as one write. On a failure, the sync banner reports it as for any other change, and "Try again" restores the last saved version, with the item in its old place.
- **AC-CO8.2** Given an edit is open, when I tap Breakdown, Summary or Back to Home, then "Leave without saving?" asks first, with a message naming the edit ("Your changes to Dinner aren't saved."). "Discard and leave" ends the edit as Cancel does; "Stay" keeps it open.
- **AC-CO8.3** Given an edit is open, when I reload or close the tab, then the browser's prompt asks first. If I reload anyway, the edit is gone and Dinner is exactly as it was.
- **AC-CO8.4** Given the Expenses tab holds staged items or typed fields when I press Edit on Breakdown, then the prompt instead says "Finish on Expenses first" / "The Expenses tab has unsaved work. Save it to Breakdown or clear it, then edit this item.", with one "OK" button, and no edit starts (BR-CO26).

### US-CO9: Old items keep working

As the owner, I want every item saved before this feature to behave as it does now, so that
nobody's real balances move.

- **AC-CO9.1** Given a session saved before this feature, then Breakdown, Summary, History and the PDF show exactly the same items, amounts and balances after the release as before it. Only the cells' editability changes.
- **AC-CO9.2** Given an old item, when its session is saved again for any reason (another purchase added, a rename, an unchanged Save Edits), then the item is stored unchanged.

## 4. Business rules

### Picking members

- **BR-CO1** In Custom Amounts, only picked members get blocks and lines. The picker behaves like Equal Split's: "All Members" plus a pill per member, alphabetical, with "All Members" meaning every current member, live.
- **BR-CO2** The picker starts with nobody picked whenever the fields are cleared: a fresh form, after Add Item, after Save to Breakdown, after an edit ends.
- **BR-CO3** Unpicking a member removes their block and all of their lines from the fields at once, with no confirmation. Nothing saved or staged changes until Add Item or Save Edits.
- **BR-CO4** Switching mode carries the picked members over and clears the rest:
  - **Equal Split → Custom Amounts:** the owners become the picked members. "All Members" stays ticked if it was. The name stays. When the price is above ₱0, it moves into Total Amount, and each picked member's first line is filled, unnamed, with their equal share, split as `getItemShares` splits it (`splitEvenly` over the owners sorted alphabetically). With no price, each picked member gets one empty line (NQ4).
  - **Custom Amounts → Equal Split:** the picked members become the owners, and "All Members" stays ticked if it was. The name stays; Total Amount and every line clear, as today, with no confirmation.
  - This applies whether or not an edit is open, like today's name rule.

### Lines

- **BR-CO5** A line has an optional order name, exactly one member and a price. In the form, lines are grouped under their member. Each picked member always has at least one line, so a member's only line has no ×; to drop the member, unpick them.
- **BR-CO6** Order name: trimmed; a name that's blank after trimming means the line is unnamed. At most 60 characters, as session names. Names don't need to be unique; two "Rice" lines for one member are fine.
- **BR-CO7** Price: read like today's amount boxes (`parsePositiveAmount`): rounded to the centavo; blank, 0, negative or unreadable counts as ₱0.00, which means "no price".
- **BR-CO8** At Add Item and Save Edits:
  - Lines with no price and no name are dropped.
  - A line with a name and no price blocks Add Item and Save Edits, with a hint naming the line: "Add a price for Bulalo or remove it".
  - A picked member left with no priced line is simply not in the item, so they owe nothing for it, like a blank member today. No warning.
  - The item still needs a trimmed name and priced lines adding up to more than ₱0, as today.
- **BR-CO9** The item's total is the sum of its priced lines, never Total Amount. Total Amount stays a target: the red "of ₱Y" hint, nothing more, as today.
- **BR-CO10** A member's share of the item is the sum of their priced lines, rounded to the centavo. Everything downstream (Breakdown sums, Summary, netting, settlement, payor amounts, Multiple Payors checks) uses that share exactly as it uses today's per-member amount. No money rule changes.

### Fill Remainder

- **BR-CO11 (money)** Fill Remainder:
  - **Who is blank:** a picked member whose lines all have no price. Members who weren't picked are never blank, and never filled.
  - **Enabled when:** Total Amount is above ₱0, at least one picked member is blank, and Total Amount − (sum of every priced line) is above ₱0.
  - **The split:** that remainder is split with `splitEvenly` across the blank picked members in alphabetical order, so the leftover centavos go one each to the first names. The parts always add up to the remainder.
  - **Where it goes:** into the blank member's first line, keeping any order name typed there. Otherwise the line stays unnamed, matching decision 5.
  - **Tiny remainders:** a member whose part rounds to ₱0.00 stays blank, as today.
  - **Repeat presses:** after a fill there are no blank members (unless a part was ₱0.00), so the button disables.

  **Example A, the owner's scenario.** Ten members, six at dinner (Ana, Ben, Cy, Dan, Eve, Fay).
  Total Amount ₱1,830.00.

  | Member | Lines before | After Fill Remainder |
  |---|---|---|
  | Ana | Sisig ₱280.00 | unchanged |
  | Ben | Kare-kare ₱450.00 | unchanged |
  | Cy | Adobo ₱220.00 | unchanged |
  | Dan | Sinigang ₱380.00 | unchanged |
  | Eve | Pancit ₱180.00, Halo-halo ₱120.00 | unchanged |
  | Fay | (empty) | ₱200.00, unnamed |
  | Gus, Hal, Ivy, Jo | not picked | not in the item |

  The lines add up to ₱1,630.00, so the remainder is ₱200.00, all to Fay. The item's total is
  ₱1,830.00, and Eve's share is ₱300.00.

  **Example B, centavo rounding.** Total Amount ₱1,000.00. Picked: Ana, Ben, Cy, Dan, Eve.
  Ana "Burger" ₱300.00, Ben "Pasta" ₱200.00, Cy, Dan and Eve empty. Remainder ₱500.00 across
  three: Cy ₱166.67, Dan ₱166.67, Eve ₱166.66. Total ₱1,000.00.

### Display

- **BR-CO12** An "itemized" item is a Custom Amounts item with at least one named line. An item whose lines are all unnamed is not itemized: it is today's item.
- **BR-CO13** Line order everywhere (staged pills, Breakdown, History, PDF): by member, alphabetically, then in the order the lines were added for that member.
- **BR-CO14** Breakdown and History, itemized items only:
  - The item's own row shows its name, Item Total and each member's sum.
  - Beneath it, one indented sub-row per priced line, in smaller, muted text: the order name in the Item column (an unnamed line shows "No name"), nothing in Item Total, and the line's price in its member's column only.
  - The group's Total row adds up item rows only, so it doesn't change.
  - Sub-rows have no Edit and no ×.
- **BR-CO15** PDF statement, itemized items only: the same sub-rows as BR-CO14, under the item. An item's row is never printed at the bottom of a page without at least its first line; a long list of lines may continue on the next page, under the repeated table header.

### Breakdown cells and stored shapes

- **BR-CO16** On Breakdown, no cell can be edited: item names, Item Totals and member amounts are plain text for every item. The only actions are Edit and × on each item row. A saved item's contents, date and Paid By change only through Edit (BR-CO24 onwards).
- **BR-CO17** An item with no named lines is saved in today's shape: one amount per member, with a member's unnamed lines added together. Editing it later shows one unnamed line per member, holding that sum.
- **BR-CO18** An item saved before this feature, or in today's shape, is never rewritten by loading or re-saving its session. Editing it (staged or saved) shows each member with an amount as picked, with one unnamed line holding that amount.
- **BR-CO19** With the Breakdown cells gone, `updateItemName`, `updateItemTotal`, `updateItemMemberAmount`, `toCustomItem` and `EditableCell` have no remaining caller (section 0, item 11). Whether they're removed is the tech lead's call. No other flow depends on them.
- **BR-CO20** Closed sessions are read-only, as today; their itemized items show their lines in History and the PDF.

### Members joining and leaving

- **BR-CO21** Removing a member removes every line of theirs from saved and staged items. Nobody else's lines or shares move, and the item's total shrinks by the member's sum. An item left with no priced lines is removed, and a record left with no items is removed, as today. In the open form, the member is unpicked and their lines go.
- **BR-CO22** Adding a late member doesn't touch Custom Amounts items, itemized or not: the include dialog still offers Equal Split items only (BR-LM2). In the open form, the new member is picked only when "All Members" is ticked (AC-CO1.6). The saved item that's out for editing is never offered in the include dialog (BR-CO36).

### Compatibility

- **BR-CO23** A session saved with itemized items must stay safe in a browser tab still running the previous release, until it reloads:
  - it must not crash
  - it must show the right total and per-member amounts (without the order names)
  - if that tab saves the session without touching the item, the lines must survive
  - that tab still has inline cells; if it edits the item's cells, the amounts it saves win and the item's lines are dropped, so money is never two things at once
  - In practice this means an itemized item also carries each member's sum where today's code reads it. That's for the tech lead to confirm.

### Editing a saved item

- **BR-CO24** Every item row on an open session's Breakdown has an Edit control: Equal Split, Custom and itemized items alike. Order sub-rows have none. History has none. An itemized item is always edited whole, with all of its lines.
- **BR-CO25** Edit always asks first. The prompt:
  - **Title:** "Edit <item name>?"
  - **Message:** "It opens on the Expenses tab with its date and Paid By. Breakdown keeps it as it is until you press Save Edits."
    - *Amended by [`bill-ux-polish-2.md`](bill-ux-polish-2.md), item 6:* the message ends with "Cancel brings you back to Breakdown." The same goes for the message AC-CO7.1 quotes.
  - **Buttons:** "Edit item" (the main action, not styled as destructive) and "Cancel". Escape and tapping outside are Cancel.
  - A long item name wraps in the title.
- **BR-CO26** Unsaved work on Expenses blocks the edit. If the Expenses tab holds staged items or any typed field when Edit is pressed, the prompt says "Finish on Expenses first" / "The Expenses tab has unsaved work. Save it to Breakdown or clear it, then edit this item." with one "OK" button, and nothing else happens. Today this can't arise, because leaving Expenses already discards it (section 0, item 15), but the rule holds if that ever changes.
- **BR-CO27** "Edit item" switches to the Expenses tab and loads, as Edit on a staged row does today:
  - the item's date, Paid By mode, payor and contributions, all editable
  - the item's mode, name and contents, all editable (BR-CO17, BR-CO18 for Custom items; "All Members" ticked for an Equal Split item only when its owners are every current member)
  - Save Edits and Cancel instead of Add Item; Save to Breakdown disabled
  - a line above the item fields: "Editing saved item: <item name>"
  - the staging list is empty, as BR-CO26 guarantees, so it shows nothing to lock
- **BR-CO28** What gets loaded as the item's Paid By:
  - **One Payor record:** One Payor, that payor.
  - **Multiple Payors record holding only this item:** Multiple Payors with the record's contributions. If they no longer add up to the item's price (a contributor was removed, or a Breakdown edit before this release changed the price), the footer shows the mismatch in red and Save Edits stays disabled until it's fixed.
  - **Multiple Payors record holding several items (saved before PR #133):** Multiple Payors with each contributor's share of this item, in proportion to their contributions to the record (NQ2).
- **BR-CO29** Nothing is written until Save Edits. Until then, the saved item is unchanged everywhere: on Breakdown, Summary, the PDF, and other devices. Breakdown shows no "being edited" mark. It can't be seen on this device without leaving the edit anyway, and other devices only ever see saved data.
- **BR-CO30 (money)** Save Edits writes the change in one session update:
  - **Same date and same Paid By** (same mode, same payors, same contributions): the item is replaced in its own record, at the same position, with the same item id. A One Payor record's payor amount becomes the record's new total.
  - **Different date or Paid By:** the item is taken out of its record and placed as described in BR-CO31.
  - Either way, nothing else in the session changes.
- **BR-CO31** When the item moves:
  - **The old record** keeps its other items in their order. A One Payor record's payor amount becomes the new total of what's left. A record left with no items is removed. A record saved before PR #133 with Multiple Payors over several items keeps its contributions minus this item's proportional share (BR-CO28), so it still adds up to its remaining items.
  - **The item** goes into a new record of its own, built by today's `buildRecords` rule: One Payor, or Multiple Payors with one contributor, becomes a One Payor record whose amount is the item's total; two or more contributors become a Multiple Payors record. The item keeps its id; the record gets a new id and `createdAt`.
  - **On Breakdown**, it appears at the bottom of the card for its new date and payors, which is created if needed. A card left empty disappears.
  - Balances are what they would be had the item been saved that way in the first place.
- **BR-CO32** Save Edits with nothing changed writes nothing. "Nothing changed" means the date, the Paid By (mode, payors, contributions) and the item (mode, name, owners and price, or each member's lines after BR-CO8 and BR-CO17 tidy them) all equal what was loaded. The item stays where it was, untouched, even if it's an old item or in a pre-PR #133 record.
- **BR-CO33** After Save Edits or Cancel, the app returns to Breakdown, and the form is left fresh (today's date, One Payor with no pick, Equal Split, empty fields) for the next visit to Expenses (NQ1). Cancel writes nothing.
- **BR-CO34** An open edit counts as unsaved work:
  - leaving the Expenses tab or the session asks "Leave without saving?" with "Your changes to <item name> aren't saved."; "Discard and leave" ends the edit as Cancel does
  - reloading or closing the tab shows the browser's `beforeunload` prompt
  - a reload or a lost tab drops the edit and leaves the saved item exactly as it was
- **BR-CO35** If the saved item disappears while the edit is open (removed through a member removal, Clear All, or a reload that brings back a server copy without it), the edit ends as Cancel does, with the message "<item name> was removed, so the edit was closed." Nothing is written. Today's rule for a staged row's edit is the same (flexible Paid By, AC-6.6).
- **BR-CO36** While the edit is open:
  - **A member is removed** (from Group Members on the same page, or another device): the form drops them as it does for a staged edit, and the saved item drops them under BR-CO21. Save Edits then writes the form's version. If the removed member was the One Payor, the saved record is removed with its payor (section 0, item 17), so BR-CO35 applies.
  - **A member is added:** the form picks them up only if "All Members" is ticked, as today. The include dialog doesn't offer the item being edited, so it can't be changed twice.
- **BR-CO37** Saving in a draft session only. Edit isn't available in History, and the Breakdown page exists only for open sessions. Save Edits does no closed-session check of its own, matching Save to Breakdown today.
- **BR-CO38** The onboarding tour never reaches this flow: its session has no saved purchases, so Breakdown shows no Edit. No `data-tour` target moves.

## 5. Edge cases

### Order lines and Fill Remainder

| Case | Expected |
|---|---|
| A member with lines is later removed from the session | Their lines go from saved and staged items; the item total shrinks by their sum; an item with no lines left goes (BR-CO21) |
| A late member who should be in an itemized item | Not offered by the include dialog (BR-CO22). Edit the item (staged or saved), pick them, add their line |
| A late member added while the form has "All Members" ticked | Picked, with an empty line (AC-CO1.6). Fill Remainder now counts them as blank |
| Lines don't match Total Amount, under | Red "of ₱Y"; Fill Remainder enabled if a picked member is blank; Add Item allowed at the sum of the lines (BR-CO9) |
| Lines don't match Total Amount, over | Red "of ₱Y"; Fill Remainder disabled; Add Item allowed at the sum of the lines |
| No Total Amount | No hint; Fill Remainder disabled; Add Item allowed |
| All lines unnamed | Today's item: saved in today's shape, shown as today (BR-CO12, BR-CO17) |
| One member with two unnamed lines (₱100 + ₱50) and no named lines | Saved as ₱150.00 for that member. Edit shows one line of ₱150.00 (BR-CO17) |
| Named and unnamed lines in one item | Itemized. The unnamed lines show "No name" in their sub-rows (BR-CO14) |
| A picked member with no line and no remainder to fill | Not in the item and owes nothing for it; no warning; on Edit they show unpicked (BR-CO8) |
| Unpicking a member who has lines | Their block and lines go at once, no confirmation (BR-CO3) |
| A line with a price of 0, or blank | Counts as no price. Without a name it's dropped at Add Item; with a name it blocks Add Item (BR-CO8) |
| A negative or unreadable price | Read as ₱0.00, as today (BR-CO7) |
| Fill Remainder with a named, unpriced line | The price goes into that line; the name stays (BR-CO11) |
| Fill Remainder of ₱0.02 across three blank members | ₱0.01, ₱0.01 and one left blank, as today |
| Nobody picked | No blocks; Fill Remainder disabled; Add Item disabled (sum is ₱0) |
| One member in the session | One pill; their lines make the item; if they're also the payor they owe nothing, as today |
| Many members (15 or more) picked | One block each, stacked; the form scrolls with the page; no horizontal scrolling |
| Equal Split → Custom Amounts with "All Members" ticked | "All Members" stays ticked; with a price, Total Amount takes it and every member's first line holds their equal share; with no price, every member has an empty line (BR-CO4) |
| Custom Amounts with lines → Equal Split | The picked members become owners; lines clear without asking (BR-CO4) |
| Switching mode during an edit (staged or saved) | Same carry-over; nothing is saved until Save Edits |
| Multiple Payors on an itemized item | Contributions must add up to the sum of the lines; a fill changes that sum, so they must be retyped to match |
| Very long order names | Wrap inside the line on the form, the staged pill, the Breakdown sub-row and the PDF; never push the price or × off-screen. Capped at 60 characters (BR-CO6) |
| Very long member names | The block header wraps; the price box stays visible |
| Two identical lines for one member | Both kept and both counted |
| Stale tab from the previous release | BR-CO23 |

### Editing a saved item

| Case | Expected |
|---|---|
| Edit on an Equal Split, a Custom or an itemized item | Same prompt and flow for all (BR-CO24) |
| Edit while Expenses has staged items or typed fields | Blocked with "Finish on Expenses first" (BR-CO26). Not reachable today, since leaving Expenses discards them |
| The item's One Payor was removed before Edit | The record went with its payor, so the item isn't on Breakdown to edit (section 0, item 17) |
| A Multiple Payors contributor was removed before Edit | The remaining contributions load; red mismatch; Save Edits disabled until they add up (BR-CO28) |
| The item's One Payor is removed during the edit | The saved record goes; the edit closes with "<item name> was removed, so the edit was closed." (BR-CO35) |
| A non-payor member is removed during the edit | Dropped from the form and from the saved item; Save Edits writes the form's version (BR-CO36) |
| A member is added during the edit | In the form only if "All Members" is ticked; the include dialog doesn't offer this item (BR-CO36) |
| Save Edits with nothing changed | No write; the item stays where it was (BR-CO32) |
| Save Edits that changes only the name | Replaced in place, same card and position (BR-CO30) |
| Save Edits that changes the date or Paid By | Moves to a new record at the bottom of the matching card; an emptied card disappears (BR-CO31) |
| Moved to a date and payor that already have a card | Joins the bottom of that card, as its own record; balances identical to merging (BR-CO31) |
| Edited item was the only one in its record | The old record is removed (BR-CO31) |
| A record saved before PR #133 with Multiple Payors over several items | The item's contributions load as its proportional share; on a real change, the old record keeps the rest (BR-CO28, BR-CO31, NQ2) |
| An Equal Split item at ₱0.00 (set on Breakdown before this release) | Loads at ₱0.00; Save Edits stays disabled until a price is typed; Cancel leaves it as it was |
| An Equal Split item owned by every member at saving, after a late member who wasn't included | Only the original owners are ticked, not "All Members" (BR-CO27) |
| Cancel | Back to Breakdown; nothing written; the item is exactly as it was (BR-CO33) |
| Tab switch or Back to Home during the edit | "Leave without saving?" names the edit; discarding is Cancel (BR-CO34) |
| Reload or closing the tab during the edit | Browser prompt; if confirmed, the edit is gone and the item is unchanged (BR-CO34) |
| Reload right after Save Edits, while the write is still sending | As `lost-edits-on-reload.md`: the browser prompt asks first; after a reload, the item is either fully old or fully new, never both or neither (AC-CO8.1) |
| Switching to another session mid-edit | Only through Back to Home, so the leave prompt applies (BR-CO34) |
| The write fails | Sync banner; "Try again" restores the item in its old place (AC-CO8.1) |
| Clear All during the edit | Clears everything as today; the edit closes (BR-CO35) |
| The same item edited on another device at the same time | Whichever save lands last wins, as for any change today. No locking |
| Session finished on another device mid-edit | Save Edits behaves as Save to Breakdown does today in that case (BR-CO37) |
| History, finished session | No Edit, no × (AC-CO6.4) |
| Onboarding tour | Never reaches Breakdown with saved items (BR-CO38). Run `steps.test.ts` and `targets.test.ts` anyway |

### Phone and desktop

| Case | Expected |
|---|---|
| Phone (320px to 640px), the form | Each line's name and price fit on one row or stack, with no horizontal page scroll; boxes, "+ Add order" and × are at least 44px tall; the × has an `aria-label` |
| Phone, Breakdown | The table keeps its horizontal scroll, with sub-rows inside it. The Edit control is reachable without scrolling sideways (NQ3) |
| Desktop | The picker and blocks follow Equal Split's look; Purchase Details outside Custom Amounts doesn't change. Edit sits with the × (NQ3) |
| The Edit control | Icon-only (the pencil from the staged list), with `aria-label="Edit <item name>"` and a "Edit item" tooltip, at least 44px to tap on a phone |
| The prompts | Fit at 320px with no horizontal scroll; long item names wrap in the title |

## 6. Scope

**In:**
- the picker in Custom Amounts, with "All Members", starting empty
- lines grouped under picked members: optional name, price, "+ Add order", ×
- Fill Remainder limited to picked members, filling into their first line
- carrying picked members across a mode switch
- order names in the staged list, Breakdown, History and the PDF
- removing every inline edit from Breakdown, for all items
- Edit on every saved item row on Breakdown, with its prompt, the blocked prompt, the Expenses edit, Save Edits (in place or moved), Cancel and the leave and reload protection
- storage and validation accepting both shapes (`src/lib/storage.ts`, `api/_validate.ts`), inside the existing `items` JSON, with no new table and no destructive migration
- member removal, late members and the compatibility rule (BR-CO21 to BR-CO23)
- tests:
  - Examples A and B, including where the extra centavo lands
  - unpicked members never filled
  - an item with no named lines stored in today's shape
  - old items parsed and re-saved unchanged
  - removing a member with lines
  - Summary balances equal to the same item typed as plain amounts
  - Save Edits in place, moved (single and multiple payors), unchanged (no write), and emptying its old record
  - a pre-PR #133 multi-item Multiple Payors record split by an edit, with every balance checked
  - Cancel and a failed write leaving the item exactly as it was

**Out:**
- a third split mode (decision 1)
- one line shared by several people (decision 2: use an Equal Split item)
- editing on Breakdown itself, including order names and the item name
- editing several saved items at once, or moving a whole card
- editing in History
- quantities, unit prices, tax, service charge or tip lines
- carrying Total Amount or lines back into Equal Split's price on a switch from Custom Amounts
- offering Custom Amounts items in the late member dialog
- converting existing items to lines
- locking an item against edits from another device
- any change to Summary, netting or settlement

**Notes for the tech lead:**
- `parseItem` drops unknown fields today, so lines need the parser change on both the browser and server sides in the same release.
- `getItemTotal` reads `Object.values(item.amounts)`; an item with no `amounts` would throw in an older tab (BR-CO23).
- `draftFromItem`, `stampItem`, `purgeMemberFromItem`, `getItemShares`, `getItemTotal`, `purgeMemberFromStaged` and `ItemStagingList` read or write `amounts` today.
- The Expenses form unmounts on a tab switch, so carrying an item from Breakdown into it needs state above both tabs (BR-CO27). The leave prompt and `beforeunload` count only staged items today (`stagedCount`); an open saved-item edit has none, so it needs counting too (BR-CO34).
- Save Edits for a saved item is one `updateSession` call (BR-CO30, AC-CO8.1).

## 7. Findings in today's code

1. **Extra item fields are dropped on save.** `parseItem` rebuilds a Custom item from `id`,
   `name` and `amounts` only, on the server too, so lines saved before the parser changes would
   be lost.
2. **Scaling a Custom item on Breakdown can miss the typed total by a centavo.** Each member's
   amount is rounded on its own, so ₱100.00 over three ₱100.00 amounts gives ₱33.33 each,
   ₱99.99 in all. This goes away with the inline cells.
3. **Fill Remainder fills every blank member in the session**, the problem decision 5 fixes.
4. **The "unsaved work blocks Edit" rule can't trigger today.** Leaving Expenses already
   discards staged items (after "Leave without saving?") and drops half-typed fields without
   asking, so the form is always empty when Breakdown is on screen. BR-CO26 is kept as a guard.
5. **Half-typed fields are dropped silently on a tab switch** when nothing is staged. That's
   unchanged here, except for an open saved-item edit, which now asks (BR-CO34).
6. **The inline-edit actions have no other callers.** `updateItemName`, `updateItemTotal`,
   `updateItemMemberAmount`, `toCustomItem` and `EditableCell` are used only by the Breakdown
   cells. The late-member flow doesn't use them.
7. **Records saved before PR #133** can carry Multiple Payors over several items, which an edit
   of one item has to split (BR-CO28, BR-CO31, NQ2). How many exist in real data isn't known;
   a count can be taken if the owner asks.

## 8. Owner answers (2026-11-15)

All of CQ1 to CQ9 and NQ1 to NQ4 (section 9) are resolved. Sections 3 to 6 above already reflect them.

| # | Question | Answer | Status |
|---|---|---|---|
| CQ1 | How a saved itemized item is changed | Scope change: every saved item gets Edit on Breakdown, behind a confirm prompt, which opens it whole (with date and Paid By) on the Expenses tab; Save Edits can move it to another record. All Breakdown inline editing is removed; × stays. Unsaved work on Expenses blocks it. History stays read-only. | Resolved (US-CO6 to US-CO8, BR-CO16, BR-CO24 to BR-CO38) |
| CQ2 | Fill Remainder and a named, unpriced line | Fills that line and keeps the name | Resolved (BR-CO11) |
| CQ3 | Named line with no price; picked member with nothing | Named line blocks Add Item with a hint; empty member owes nothing, no warning | Resolved (BR-CO8) |
| CQ4 | Unpicking a member with lines | Removes the lines at once, no confirmation | Resolved (BR-CO3) |
| CQ5 | Picker's starting state | Nobody picked | Resolved (BR-CO2) |
| CQ6 | Lines on Breakdown, History and the PDF | Indented sub-rows; "No name" for an unnamed line in an itemized item | Resolved (BR-CO14, BR-CO15) |
| CQ7 | Order name length | 60 characters | Resolved (BR-CO6) |
| CQ8 | Unnamed lines in an item with no names | Saved in today's shape, summed per member | Resolved (BR-CO17) |
| CQ9 | Form layout | Lines grouped under each picked member, with "+ Add order" | Resolved (BR-CO5) |

## 9. Follow-up questions, resolved (2026-11-15)

The owner accepted every recommendation.

| # | Question | Answer | Status |
|---|---|---|---|
| NQ1 | Where Save Edits and Cancel land | Back on Breakdown, with the form fresh | Resolved (BR-CO33) |
| NQ2 | Splitting a pre-PR #133 Multiple Payors record with several items | The edited item takes each payor's proportional share, in whole centavos; the old record keeps the rest | Resolved (BR-CO28, BR-CO31) |
| NQ3 | Where Edit sits | Beside the × on desktop; next to the item name on a phone | Resolved (section 5, Phone and desktop) |
| NQ4 | Equal Split → Custom Amounts keeping shares | Yes: each owner's first line gets their equal share, and the price goes into Total Amount | Resolved (BR-CO4) |
