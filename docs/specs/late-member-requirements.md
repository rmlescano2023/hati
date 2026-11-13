# Requirements: include a late-joining member in earlier purchases

Source: the owner-approved intake brief (`/Users/rmlescano/.claude/plans/soft-humming-fiddle.md`,
"include a late-joining member") and the code on `feature-flexible-paid-by` as read on
2026-11-13. The owner's decisions in the brief are final. Statements about "today" come from
reading the code, not from the running app. The members in the examples (Abe, Ana, Ben, Cy,
Dan) are made up.

This feature ships with flexible Paid By (`docs/specs/flexible-paid-by-requirements.md`). IDs
here carry an `LM` prefix so they don't clash with that document's IDs.

## 0. How it works today

1. **Adding a member** (`src/components/home/MemberList.tsx`): type a name and press "+ Add"
   or Enter.
   - The name is title-cased (`toTitleCase`). A blank name does nothing.
   - A name that matches an existing member, ignoring case (`compareNames`), shows
     "<Name> is already in the group." under the box, and the name stays typed.
   - Otherwise `addMember` (`src/context/SessionsStoreContext.tsx`) adds the name to the
     session's members, sorted, and the box clears. No dialog appears.
2. **A member added this way is in no saved purchase.** An item stores its owners by name:
   - an Equal Split item stores `owners: string[]` and a `totalPrice`
   - a Custom Amounts item stores `amounts: {name: amount}`
3. **Equal Split shares** (`getItemShares` in `src/lib/calculations.ts`): the owners are sorted
   alphabetically and the price is split with `splitEvenly` (`src/lib/money.ts`). That works in
   whole centavos and gives the leftover centavos one each to the first owners in alphabetical
   order. For example, ₱100 between three owners is ₱33.34, ₱33.33, ₱33.33.
4. **The Breakdown cells** (`src/components/breakdown/BreakdownTable.tsx`):
   - **Item Total cell on an Equal Split item:** changes its price, and the item stays Equal Split.
   - **Item Total cell on a Custom item:** scales every member's amount.
   - **A member's cell:** turns the item into Custom Amounts with the shares it already had,
     then sets that member's amount (`updateItemMemberAmount`). Typing a late member's amount
     therefore **adds to the item's total** instead of re-splitting it.
5. **How a change is written:** every store action calls `updateSession(sessionId, fn)`, which
   is `mutateSession` in `src/hooks/useServerSessions.ts`.
   - It applies `fn` to the session on screen at once.
   - It queues a save of the **whole session** (members and records together) as one write.
   - On a failure, the change stays on screen, the sync banner reports it and its retry sends
     the session again.
   - Because one `fn` changes members and records together, one action is saved whole or not
     at all.
6. **Removing a member** (flexible Paid By, `removeMember` with `purgeMemberFromItem`):
   - An Equal Split item drops the member, and **its price shrinks by their share**, so nobody
     else's share moves.
   - An item with no owners left is removed.
   - Staged items are cleaned up the same way.
7. **Staged items** (Purchase Details, `src/lib/staging.ts`) store their owners as explicit
   names, even when "All Members" was ticked. The item being typed in the fields, and an open
   Edit, read "All Members" live (`selectedOwners`), so a member added while "All Members" is
   ticked is included in that item.
8. **Payors:** a One Payor record's payor amount is the record's total. A Multiple Payors item
   is its own record, and its contributions add up to the item's price. A payor owes nothing on
   their own record.
9. Breakdown shows one card per date + set of payors, newest first (`groupRecordsForBreakdown`).
10. Closed sessions are read-only and never show Group Members.
11. **Onboarding tour:** it starts only on Home, and its overlay blocks the page apart from the
    highlighted target. Its session is created fresh and never has saved purchases.

## 1. Problem

When someone joins a session after purchases are saved, there's no way to say they shared
some of them, for example the hotel. The only workaround is typing their amount into a
Breakdown cell. That turns the item into Custom Amounts and adds to its total, so the cost is
never re-split and everyone else still pays their old share.

## 2. Outcome (checkable)

- Adding a member to a session with saved Equal Split items asks which of those items the new
  member shared in.
- Each item the user ticks keeps its price and is re-split across its old owners plus the new
  member, using today's centavo rule.
- Payors and contributions don't change. Breakdown, Summary and the PDF re-balance to match.
- Skip leaves everything as it is today.

## 3. User stories and acceptance criteria

### US-LM1: Asked about earlier items when a member joins
As the person logging, I want to be asked which earlier items a new member shared, so that
they pay their part without me re-entering anything.

- **AC-LM1.1** Given a draft session with saved Equal Split items, when I add "Cy", then a dialog opens titled "Include Cy in earlier items?". Cy isn't in Group Members yet, and "Cy" stays typed in the box.
- **AC-LM1.2** The dialog lists every saved Equal Split item, grouped under headings in Breakdown's order (newest date first):
  - **Heading:** the date and payor, as on the Breakdown card ("November 12, 2026 · Paid by Ana", or the contributors for Multiple Payors).
  - **Row:** a checkbox, the item name and its price ("Hotel ₱900.00").
- **AC-LM1.3** Every checkbox starts unticked.
- **AC-LM1.4** Custom Amounts items aren't listed. A heading whose items are all Custom Amounts isn't shown.
- **AC-LM1.5** Staged, unsaved items aren't listed.
- **AC-LM1.6** Given a draft session with no saved purchases, when I add "Cy", then Cy is added at once with no dialog, as today.
- **AC-LM1.7** Given saved purchases that are all Custom Amounts, when I add "Cy", then Cy is added at once with no dialog (BR-LM2).
- **AC-LM1.8** Given a blank name or a duplicate ("cy" when Cy exists), then no dialog opens, and today's behaviour applies: nothing happens for a blank name, and "Cy is already in the group." appears for a duplicate.

### US-LM2: Choose the items
As the person logging, I want to tick only the items the new member shared, so that they don't
pay for things they missed.

- **AC-LM2.1** Tapping anywhere on an item's row ticks or unticks its checkbox.
- **AC-LM2.2** "Select all" sits above the list:
  - With nothing or only some items ticked, it ticks every listed item.
  - With every item ticked, it unticks them all.
  - It shows as checked when all are ticked, and as partly checked when some are.
- **AC-LM2.3** "Include" is disabled while nothing is ticked (BR-LM6).
- **AC-LM2.4** Each checkbox is labelled with the item's name and price, so a screen reader announces "Hotel, ₱900.00".

### US-LM3: Include re-splits at the same price
As the group, I want an included item's cost shared again with the new member, so that
everyone's share drops instead of the total going up.

- **AC-LM3.1** Given Hotel ₱900.00 split equally between Ana, Ben and Dan (₱300.00 each), when I tick it and click Include for Cy, then:
  - Cy is added to Group Members and the box clears
  - in Breakdown, Hotel still shows ₱900.00 and each of the four shows ₱225.00
- **AC-LM3.2** Given the centavo example in BR-LM9, then the shares match it exactly, and they always add up to the item's price.
- **AC-LM3.3** Given an included item, then its payor badge and contributions in Breakdown are unchanged.
- **AC-LM3.4** Given an included item, then Summary's balances match the worked examples in BR-LM9, and the PDF statement shows the same shares.
- **AC-LM3.5** Given items I didn't tick, then they're unchanged, and Cy's cell shows "—" on them.
- **AC-LM3.6** Given an included item, then it is still Equal Split. Editing its Item Total cell later re-splits it across all four owners.

### US-LM4: Skip, or back out
As the person logging, I want to add the member without touching earlier items, or change my
mind, so that the prompt never forces a choice.

- **AC-LM4.1** When I click Skip, then Cy is added, the box clears and no saved item changes. Ticked boxes are ignored.
- **AC-LM4.2** When I press Escape or tap outside the dialog, then the dialog closes, Cy is **not** added and "Cy" stays typed in the box (pending LQ1).
- **AC-LM4.3** When I add the same name again after backing out, then the dialog opens again, with everything unticked.

### US-LM5: One change, saved whole
As the person logging, I want the new member and their shares saved together, so that a failure
can't leave them half-added.

- **AC-LM5.1** Given Include or Skip, then adding the member and re-splitting the ticked items is one change, sent as one write (BR-LM7).
- **AC-LM5.2** Given that write fails, then:
  - the change stays on screen
  - the sync banner reports the failure as for any other change
  - the banner's retry sends the member and the re-split together
  - at no point is the member saved without their shares, or the shares without the member
- **AC-LM5.3** Given the failure can't be recovered and a reload brings back the server's copy, then neither the member nor the re-split is there, and today's note about a reverted edit applies.

## 4. Business rules

### When the dialog appears

- **BR-LM1** The dialog appears only in a draft session, only after the name passes today's checks (not blank, not a duplicate ignoring case), and only when at least one saved item can be offered (BR-LM2).
- **BR-LM2** An item is offered when:
  - it is saved, not staged
  - it is Equal Split
  - its owners don't already include the new name, ignoring case
  - Custom Amounts items, Breakdown-edited ones included, are never offered
  - When no item qualifies, the member is added at once with no dialog. This is the owner's suggested default for "saved purchases but no Equal Split items".
- **BR-LM3** An Equal Split item whose price was set to ₱0.00 in Breakdown is still offered and shows ₱0.00. Including it changes nothing in money.

### The list and its controls

- **BR-LM4** Grouping and order:
  - Items are grouped exactly as Breakdown groups them (date plus set of payors), in Breakdown's order: newest date first.
  - Within a group, items appear in Breakdown's row order.
  - Groups left with no Equal Split items are hidden.
- **BR-LM5** Every checkbox starts unticked, every time the dialog opens. "Select all" covers every listed item across all groups.
- **BR-LM6** Include needs at least one ticked item. With none ticked, Skip is the way through.
- **BR-LM7** Answering the dialog is one change:
  - **Include:** add the member and re-split the ticked items in the same session update, so they're saved together or not at all.
  - **Skip:** add the member only.
  - **Escape or backdrop:** change nothing (pending LQ1).
  - The member isn't added before the dialog is answered.
  - The checks in BR-LM1 run again when the dialog is answered: if the name has meanwhile arrived from another device, today's "already in the group" message applies and nothing is included.
- **BR-LM8** Items are checked again when Include is clicked. A ticked item that has since disappeared, turned into Custom Amounts or gained the new name is skipped without a message. This can only happen through a background reload while the dialog is open.

### Money

- **BR-LM9 (money)** Re-split at the same price:
  - **Price and owners:** an included item keeps its price to the centavo, and its owners become the old owners plus the new member.
  - **Shares:** recalculated with `getItemShares`. The owners are sorted alphabetically, and `splitEvenly` gives the leftover centavos one each to the first owners, so the shares always add up to the price.
  - **Payors:** the payors, the One Payor's amount and the Multiple Payors contributions don't change. They still add up to the item's price, because the price didn't change.
  - **Unchanged cases:** items that aren't ticked, staged items and the session's other members' records stay exactly as they were.

  **Example A, centavo rounding.** Taxi ₱100.00, Equal Split between Ben and Cy, paid by Ben.
  Before, it's ₱50.00 each, and Cy owes Ben ₱50.00.

  | New member included | Shares after the re-split | Owed on Taxi |
  |---|---|---|
  | Dan | Ben ₱33.34, Cy ₱33.33, Dan ₱33.33 | Cy owes Ben ₱33.33; Dan owes Ben ₱33.33 |
  | Abe | Abe ₱33.34, Ben ₱33.33, Cy ₱33.33 | Abe owes Ben ₱33.34; Cy owes Ben ₱33.33 |

  Where the extra centavo lands depends on where the new name sorts, and an old owner's share
  can differ by one centavo depending on who joins. The total stays ₱100.00 either way.

  **Example B, Multiple Payors.** Dinner ₱1,000.00, Equal Split between Ana, Ben and Cy (Ana
  ₱333.34, Ben ₱333.33, Cy ₱333.33), paid Ana ₱600.00 / Ben ₱400.00.
  - **Before:** Cy owes Ana ₱200.00 and Ben ₱133.33. Ana and Ben owe nothing on it, because they paid.
  - **Include Dan:** the shares become ₱250.00 each, and the contributions stay Ana ₱600.00 / Ben ₱400.00.
  - **After:** Cy owes Ana ₱150.00 and Ben ₱100.00; Dan owes Ana ₱150.00 and Ben ₱100.00.

- **BR-LM10** Including a member is no different from saving the item with that member as an owner in the first place. Summary, netting and the final settlement need no change.

### Interactions

- **BR-LM11** Staged items are never changed by adding a member, whether by Include or Skip. The user fixes them with Edit before saving. The item being typed, or an open Edit, picks up the new member only if its "All Members" is ticked, as today (§0.7). A Multiple Payors item in the fields gets a blank contribution box for the new member.
- **BR-LM12** Removing a member works as flexible Paid By defined it, including a member who was included this way. Their share is taken out and **the price shrinks by it**; it is not spread back over the others. Including Cy in a ₱900.00 hotel (₱225.00 each) and then removing Cy leaves the hotel at ₱675.00, still at ₱225.00 each. See LQ2.
- **BR-LM13** The dialog never opens over the onboarding tour. The tour's session never has saved purchases and its overlay blocks Group Members, so a member added during the tour is added with no dialog (BR-LM2).
- **BR-LM14** There's no undo. To reverse an include, the user edits the cells in Breakdown, which turns the item into Custom Amounts, or removes the member (BR-LM12).

## 5. Edge cases

| Case | Expected |
|---|---|
| No saved purchases | Added at once, no dialog (AC-LM1.6) |
| Saved purchases, but no Equal Split items | Added at once, no dialog (AC-LM1.7) |
| Items owned by every current member ("All Members" when saved) | Offered and unticked like any other. This is the usual "everyone shared the hotel" case. |
| An item that already names the new member | Not offered (BR-LM2). Not reachable normally, since removal purges names. |
| A Breakdown-edited item that's now Custom Amounts | Not offered. Typing the new member's amount in its cell adds to the total, as today. |
| An Equal Split item whose total was edited in Breakdown | Still Equal Split, so offered at its current price |
| ₱0.00 Equal Split item | Offered; including it changes nothing (BR-LM3) |
| Duplicate name, any case | Today's error message, no dialog (AC-LM1.8) |
| Blank name | Nothing happens, as today |
| Very long new name | Wraps in the title; it never pushes the buttons off-screen |
| Very long item names | Wrap or truncate within the row; the checkbox and price stay visible |
| Two items with the same name in one group | Both listed, in Breakdown row order. See LQ3 for telling them apart. |
| Long list on a phone | See the row after this table. |
| Many members (owners) | No effect on the dialog, which doesn't show owners (LQ3) |
| A failed save | AC-LM5.2 and AC-LM5.3; never half-saved |
| Including in several items across several groups | All of them re-split in the one change |
| Staged items exist when a member is added | Not listed and not changed (BR-LM11). The leave warning still counts them as before. |
| An Edit is open when a member is added | The edit stays open. With "All Members" ticked, the edit picks up the new member on Save Edits (BR-LM11). |
| Removing a member who was included | The price shrinks by their share (BR-LM12, LQ2). |
| Clear All after an include | Clears everything, as today |
| A member added while the tour is running | Added with no dialog (BR-LM13). Run `steps.test.ts` and `targets.test.ts`. No `data-tour` target moves. |
| Closed session | Not reachable (§0.10) |

**Long list on a phone:**
- The dialog fits the screen at 320px with no horizontal scrolling.
- The title, "Select all" and the Skip and Include buttons stay visible, and only the list between them scrolls.
- Each row is at least 44px tall and tappable across its width.
- At desktop widths, the dialog keeps ConfirmDialog's look.

## 6. Scope

**In:**
- the dialog on add, with its list, grouping, unticked checkboxes, Select all, Skip, Include and backing out
- the one-change add and re-split
- tests:
  - re-split rounding, including where the extra centavo lands
  - the price, the payor amount and the contributions staying unchanged
  - Summary balances for Examples A and B
  - only Equal Split saved items being offered
  - no dialog when nothing qualifies

**Out:**
- including late members in Custom Amounts items
- editing saved items' owners from Breakdown
- re-prompting for members already in the group
- closed sessions
- schema or API changes
- an undo
- changing how member removal treats prices (LQ2)
- a preview of the new per-person share in the dialog

**Notes for the tech lead:**
- `ConfirmDialog` takes a plain message string. The list needs a dialog body of its own, using the same `<dialog>` behaviour and styles.
- `addMember` returns a boolean and takes no callback today. The add with include needs to be one store action, one `updateSession` call (BR-LM7).

## 7. Open questions for the owner

1. **LQ1. Escape or tapping outside the dialog: cancel the add, or treat it as Skip?**
   - **Recommended:** cancel. The member isn't added and their name stays in the box, so nothing changes without a clear choice, and adding again reopens the dialog.
   - **Alternative:** treat it as Skip, which adds the member to nothing, as today.
2. **LQ2. Removing a member who was included shrinks each item's price by their share, instead of re-splitting the old price.**
   - Example: the ₱900.00 hotel becomes ₱675.00 at ₱225.00 each, not ₱900.00 at ₱300.00 each.
   - This is the removal rule flexible Paid By uses ("nobody else's share moves").
   - **Recommended:** keep it for this feature and treat a change as separate work. It is asymmetric with Include, though, so please confirm it's acceptable.
3. **LQ3. Should each row show the item's current owners, for example "Ana, Ben, Dan" under "Taxi ₱100.00"?**
   - It would tell apart two items with the same name on the same date and payor, such as two taxis.
   - **Recommended:** no. Keep the name and price only, as decided, since such duplicates are rare and the rows follow Breakdown's order.
