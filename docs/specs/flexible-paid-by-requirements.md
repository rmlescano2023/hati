# Requirements: per-item Date and Paid By in Purchase Details

Final version, with the owner's answers to Q1 to Q8 folded in. Source: the intake brief
(`/Users/rmlescano/.claude/plans/soft-humming-fiddle.md`), the owner's answers, and the code
as read on 2026-11-13. Statements about "today" come from reading the code, not from the
running app. The members in the examples (Ana, Ben, Cy) are made up.

## 0. How it works today

Purchase Details is `src/components/home/PurchaseItemCard.tsx`, on the Expenses tab
(`src/pages/ExpensesPage.tsx`) under Group Members (`MemberList.tsx`).

1. **Date** starts as today. **Paid By** is either One Payor (a dropdown that starts on
   "— Select —") or Multiple Payors (an amount box for each member). Both apply to the whole card.
2. **"+ Add Item"** is disabled until the item itself is valid. Equal Split needs a name, a
   price above 0 and at least one owner. Custom Amounts needs a name and member amounts adding
   up to more than 0; the "Total Amount" box is only a target and is never checked. Add Item
   stages the item, clears the item fields (the split mode stays) and clears a "Saved to
   Breakdown." message.
3. **Switching between Equal Split and Custom Amounts** clears every item field, the name
   included (`resetItemDraft`).
4. **"Save to Breakdown →"** is never disabled. A click with something missing shows one
   message, checked in this order: "Add an item first.", "Pick a date.", "Choose who paid."
5. Otherwise it saves **one record**: `{date, payorMode, payors, items: all staged}`. With One
   Payor, the payor's amount is the staged total. With Multiple Payors, the footer turns red with
   "Contributed ₱X of ₱Y" when the amounts don't match, **but the save goes through anyway**.
6. After the click, the staging list, the payor pick, the contributions and the item fields
   clear, and the split mode goes back to Equal Split. The date and the payor mode stay.
7. The message beside the button: "Saving…", then "Still saving…" after 10 s, then
   "Saved to Breakdown." or "Not saved." (`src/lib/saveMessage.ts`). Each change saves the whole
   session in one write (`mutateSession` in `src/hooks/useServerSessions.ts`). On a failure,
   the change stays on screen and the sync banner offers a retry.
8. Breakdown and the PDF statement both use `groupRecordsForBreakdown`, which makes one card per
   **date + set of payor names**. The contribution amounts don't decide the card.
9. **Getting off the Expenses tab:** the session tabs (`SessionTabs.tsx`, through
   `SessionWorkspace.tsx`'s `onTabChange`) and "← Back to Home" (`SessionWorkspace.tsx`). Inside
   a session the Home / Collection / History nav isn't shown (`App.tsx`, `TOP_LEVEL`), so
   Collection is reached only by finishing the session from Summary, and History isn't
   reachable at all. There's no browser history routing (no `pushState`), so the browser's
   Back button leaves the app. Either way, the card unmounts and staged items are lost
   **without a warning**.
10. The only leave prompt today is the browser's own `beforeunload`, which is registered only
    while server writes are still in flight (`useServerSessions.ts`, `warnBeforeLeaving`).
11. Removing a member (`removeMember` in `SessionsStoreContext.tsx`) cleans up saved records
    only. The confirmation ("Their shares are taken out of every saved record.") appears only
    when saved records exist. "Clear All" clears members and every record.
12. **Onboarding tour:**
    - Next and Back move the app by setting the screen directly (`tourNavigate` in `App.tsx`),
      not through `SessionTabs` or Back to Home.
    - Ending the tour sends the app to Home (`endTour`).
    - The tour overlay blocks the page apart from the highlighted target.
    - The tour starts only from Home: on a first login, or from the dev-only Preview Tour button.
13. Closed sessions open in History and never show the Expenses tab.

## 1. Problem

Date and Paid By apply to everything staged. To log items with different dates or payors,
such as a trip's receipts entered afterwards, the user has to save between each group. That's
easy to forget, and the wrong date or payor then ends up on a whole batch. Staged work is also
lost without a word if the user leaves the tab.

## 2. Outcome (checkable)

- One staging session holds items with different dates and payors, and each row shows its own.
- One "Save to Breakdown" click puts every item into the card for its date and payor,
  existing cards included.
- Summary balances equal what saving each item on its own would give.
- A staged item can be corrected (Edit, then Save Edits or Cancel) without retyping it.
- Removing a member never leaves them in staged items or the fields.
- Leaving with staged items, from inside the app or by reloading or closing, first asks.

## 3. User stories and acceptance criteria

"Item fields" means the name, price, owners, Total Amount and member amounts.

### US-1: Each item carries its own date and payor
As the person logging expenses, I want each item to keep the Date and Paid By I had when I
added it, so that I can stage items from different days or payors together.

- **AC-1.1** Given Date is 12 Nov and One Payor is Ana, when I add "Taxi", then the row shows 12 Nov and Ana.
- **AC-1.2** Given "Taxi" is staged with 12 Nov and Ana, when I change Date to 13 Nov and the payor to Ben, then the "Taxi" row still shows 12 Nov and Ana.
- **AC-1.3** Given I add an item with One Payor, then Date and the payor pick stay as they were.
- **AC-1.4** Given I add an item with Multiple Payors, then Date and the payor mode stay, and every contribution box is blank.
- **AC-1.5** Given any add, then the item fields clear and the split mode stays.
- **AC-1.6** Given the Date is empty, or One Payor is on "— Select —", then "+ Add Item" is disabled even when the item fields are valid. No hint explains why (Q5).
- **AC-1.7** The total above the list ("N items staged ₱X") sums every staged item.
- **AC-1.8** A Multiple Payors row shows each contributor with their amount ("Ana: ₱200.00"). A One Payor row shows the payor's name.

### US-2: Multiple Payors contributions belong to the item
As the person logging, I want the contributions to cover the item I'm adding, so that each
item's payors are recorded exactly.

- **AC-2.1** Given Multiple Payors, an Equal Split price of ₱300, Ana ₱200 and Ben ₱50, then "+ Add Item" is disabled and the footer reads "Contributed ₱250.00 of ₱300.00" in the mismatch style.
- **AC-2.2** When Ben is changed to ₱100, then the mismatch styling goes and "+ Add Item" is enabled.
- **AC-2.3** Given Custom Amounts with Ana ₱120 and Cy ₱80, then the footer compares against ₱200.00, the sum of the amounts, whatever is in Total Amount.
- **AC-2.4** Given ₱350 contributed on a ₱300 item, then "+ Add Item" is disabled.
- **AC-2.5** Given no item price yet, then the footer shows the amount contributed without a mismatch, and "+ Add Item" is disabled.
- **AC-2.6** Given Multiple Payors with only Ana ₱300 on a ₱300 item, then "+ Add Item" is enabled, and after the save the item lands in the "Paid by Ana" card for its date (Q7).

### US-3: One save creates the right cards
As the person logging, I want one save to file every staged item under its own date and payor,
so that I don't have to save group by group.

- **AC-3.1** Given items staged for 12 Nov paid by Ana, 12 Nov paid by Ben and 13 Nov paid by Ana, when I click Save, then Breakdown shows three cards, each holding only its own items with the right total.
- **AC-3.2** Given a "12 Nov, Paid by Ana" card already exists, when I save an item for 12 Nov paid by Ana, then it joins that card and no second card appears.
- **AC-3.3** Given two Multiple Payors items on the same date with the same payors but different amounts (Ana ₱240 / Ben ₱60, and Ana ₱60 / Ben ₱240), then both land in one card whose badge shows the summed contributions (Ana ₱300, Ben ₱300).
- **AC-3.4** Given the worked example in BR-8, then Summary shows Cy owing Ana ₱240 and Ben ₱60, not ₱150 each.
- **AC-3.5** After the click, the staging list is empty and the fields follow BR-12.
- **AC-3.6** The Summary totals and the PDF statement match the Breakdown cards.

### US-4: See and fix a staged item
As the person logging, I want to edit a staged item, so that I can correct it without
deleting it.

- **AC-4.1** Every staged row has an icon-only Edit button to the left of ×, with `aria-label="Edit <item name>"`, on phone and desktop.
- **AC-4.2** Given I click Edit, then the fields fill with that item's values:
  - its date
  - its payor mode, and the payor pick or the contributions
  - its split mode
  - its name
  - for Equal Split, its price and owners, with "All Members" ticked only if the owners are every current member
  - for Custom Amounts, the member amounts, with Total Amount set to their sum
- **AC-4.3** Given the fields held a half-typed item when I clicked Edit, then it's replaced without a prompt and doesn't come back when the edit ends (Q2).
- **AC-4.4** Given an edit is open, then:
  - the row is highlighted, and marked in a way that doesn't rely on colour alone (a visible "Editing" tag, or the Edit button shown as pressed)
  - "+ Add Item" reads "Save Edits", with "Cancel" next to it
- **AC-4.5** Given an edit is open, then these are all disabled: "Save to Breakdown", every other row's Edit and ×, and this row's own × (Q3).
- **AC-4.6** Given I change the edited item's date or payor and click Save Edits, then:
  - the row updates in place, keeps its position and shows the new date and payor
  - the highlight goes and the button reads "+ Add Item" again
  - after the next save, the item lands in the card for its new date and payor, not its old one
- **AC-4.7** Given I click Cancel, then the staged item is exactly as before, the highlight goes and the buttons return to normal.
- **AC-4.8** Given an edit ends, by Save Edits or Cancel, then (Q1):
  - Date, the payor mode and the One Payor pick go back to what they were before Edit was clicked
  - the item fields clear
  - the Multiple Payors amounts clear
  - the split mode goes back to what it was before Edit was clicked (BR-15)
- **AC-4.9** Save Edits is enabled under exactly the same rules as "+ Add Item" (BR-2 to BR-5).
- **AC-4.10** Given the edited item was One Payor Ana and I switch to Multiple Payors, then the contributions start blank, and Save Edits stays disabled until they add up to the price.
- **AC-4.11** Given the edited item was Multiple Payors and I switch to One Payor, then Save Edits needs a payor pick, and the saved item keeps no contribution amounts.
- **AC-4.12** Given the edited item "Dinner" is Equal Split and I switch to Custom Amounts, or the other way round, then the name "Dinner" stays, and the price, owners, Total Amount and member amounts clear (Q6). The staged item doesn't change unless I click Save Edits.
- **AC-4.13** Given a staging list with one item, editing and ending the edit works the same way.

### US-5: The save message still tells the truth
As the person logging, I want the message beside Save to Breakdown to describe the whole
click, so that I know whether everything landed.

- **AC-5.1** Given mixed staged items, when I click Save, then the message reads "Saving…", turns into "Still saving…" after 10 s if the save is still running, and ends on "Saved to Breakdown." only once every item from that click is saved.
- **AC-5.2** Given the server fails that save, then the message reads "Not saved." and none of the click's items is saved. Some can't be saved while others fail. The items stay visible in Breakdown with "Not saved." and the sync banner. "Try again" restores the last saved version, so nothing is half-saved, as today.
- **AC-5.3** Given the staging list is empty, when I click Save, then the message reads "Add an item first."
- **AC-5.4** "Pick a date." and "Choose who paid." never appear beside Save to Breakdown any more.
- **AC-5.5** "+ Add Item" and Save Edits clear "Saved to Breakdown.", but leave "Saving…" and "Not saved." alone.

### US-6: Removing a member also cleans staged work (Q4)
As the person logging, I want removing a member to take them out of what I've staged too, so
that no saved purchase ever names someone who isn't in the group.

- **AC-6.1** Given no saved records, and a staged item that names Cy as an owner, an amount, the One Payor or a contributor, when I tap × on Cy in Group Members, then the remove confirmation appears and says that staged items are affected. Suggested wording: "Their shares are taken out of the staged items."
- **AC-6.2** Given saved records exist and staged items name Cy, then the confirmation's message covers both. Suggested wording: "Their shares are taken out of every saved record and staged item."
- **AC-6.3** Given no saved records, and no staged item names Cy, then Cy is removed without a confirmation (as today), even if Cy is ticked or typed in the fields.
- **AC-6.4** When I confirm, then each staged item is cleaned up exactly as a saved record would be (BR-16):
  - An Equal Split item drops Cy, and its price shrinks by Cy's share, so nobody else's share moves.
  - A Custom item drops Cy's amount.
  - Cy is dropped as a payor or contributor.
  - An item left with no owners, or with no payor, disappears from the list.
- **AC-6.5** When I confirm, then Cy is also cleared from the fields: unticked, any amount cleared, any contribution cleared, and a One Payor pick of Cy resets to "— Select —".
- **AC-6.6** Given an edit is open, when I remove Cy, then:
  - Cy is cleared from the open edit's fields
  - the staged original is cleaned up as in AC-6.4
  - if the original disappears from the list, the edit ends as in AC-4.8, but with Cy cleared from the restored payor pick
- **AC-6.7** Given I tap Cancel in the confirmation, then nothing changes.
- **AC-6.8** Given a Multiple Payors staged item of ₱300 paid Ana ₱200 / Cy ₱100, when Cy is removed, then the item stays with Ana ₱200 as its only contributor, as a saved record would. Save to Breakdown doesn't block it (BR-17).
- **AC-6.9** Given "Clear All" in Group Members while items are staged, then the confirmation appears and the staging list, the fields and any open edit are cleared too (BR-16).

### US-7: Warn before leaving with staged items (Q8)
As the person logging, I want to be warned before I leave items I haven't saved, so that I
don't lose a batch of entries by tapping the wrong tab.

"Staged work" means at least one staged item, or an open edit. An open edit always has a
staged item.

- **AC-7.1** Given staged work, when I tap Breakdown or Summary, then a dialog opens and I stay on Expenses for now.
  - Title: "Leave without saving?"
  - Message: "You have 3 staged items that aren't saved."
  - Buttons: Stay and Discard and leave
- **AC-7.2** Given the same, when I tap "← Back to Home", then the same dialog opens.
- **AC-7.3** Given the dialog, when I choose Stay, press Escape or tap the backdrop, then the dialog closes and I'm still on Expenses, with the staged items, any open edit and the fields exactly as they were.
- **AC-7.4** Given the dialog, when I choose "Discard and leave", then the app goes to where I tapped: Breakdown, Summary or Home. The staged items, the open edit and the fields are gone, and nothing is saved. Returning to Expenses shows a fresh form: today's date, no payor and an empty list.
- **AC-7.5** The dialog is Hati's ConfirmDialog in its destructive style:
  - Stay is the filled, focused button.
  - "Discard and leave" is styled as the danger action.
  - There is no "Save and leave".
- **AC-7.6** The count uses singular and plural correctly: "1 staged item", "2 staged items". With an open edit, the count is still the number of staged items (BR-19).
- **AC-7.7** Given no staged items and no open edit, then tabs and Back to Home work at once with no dialog, even if the fields hold a half-typed item.
- **AC-7.8** Given staged work, when I reload or close the browser tab, or use the browser's Back to leave Hati, then the browser shows its own leave prompt. Its wording is the browser's and can't be changed. Choosing to stay keeps everything.
- **AC-7.9** Given no staged work, then reloading or closing shows no prompt from this feature. The existing prompt for saves still in flight is unchanged.
- **AC-7.10** Given I just clicked Save to Breakdown and it's still "Saving…", when I tap Breakdown, then no dialog opens, because the staging list is already empty. A reload in that moment shows only the existing in-flight prompt.
- **AC-7.11** Given I tap the Expenses tab while already on it, then no dialog opens.
- **AC-7.12** Given the onboarding tour is running, when its Next, Back, Skip or Escape moves between Expenses, Breakdown, Summary and Home, then no dialog appears and the tour carries on as today (BR-21). `steps.test.ts` still passes.
- **AC-7.13** Given staged work, when I tap a session tab while the session-name box is open, then the name I typed is saved as it is today, whichever choice I then make in the dialog.
- **AC-7.14** At 320px and on desktop, the dialog and its two buttons fit without horizontal scrolling.

## 4. Business rules

### Validation at Add Item and Save Edits

- **BR-1** The date and payor are stamped onto the item when it's added or its edit is saved. Changing the fields afterwards never changes staged items.
- **BR-2** The item rules are unchanged:
  - Equal Split needs a trimmed name, a price above ₱0 and at least one owner.
  - Custom Amounts needs a trimmed name and member amounts adding up to more than ₱0.
  - "Total Amount" stays a target only.
- **BR-3** The date must be filled in. Any past or future date is allowed.
- **BR-4** With One Payor, a current member must be picked.
- **BR-5** With Multiple Payors:
  - Each contribution is rounded to the centavo first. A blank, zero or negative contribution counts as ₱0 and isn't stored.
  - The contributions above ₱0 must add up to the item's price exactly, to the centavo. For Equal Split that's the price; for Custom Amounts it's the sum of the member amounts.
  - One contributor is allowed (Q7).

### Building the records at Save to Breakdown

- **BR-6** One click saves every staged item in **one write**: all of the click's records are added in a single session change. Nothing from one click can be partly saved.
- **BR-7** An item's card is decided by its date plus the set of members who contributed, as `groupRecordsForBreakdown` does today. A Multiple Payors item with one contributor lands in that member's card.
- **BR-8 (money)** Summary balances must equal what saving each staged item on its own would give.
  - **Single-payor items:** grouping those with the same date and payor into one record doesn't change the money. The payor's amount on a record is the sum of its items' prices.
  - **Multiple Payors items:** two of them must **never** be merged into one record with summed contributions. Splits between payors are weighted per record, so merging changes who owes whom. The safe choice is one record per Multiple Payors item.
  - **Worked example.** Members are Ana, Ben and Cy.
    - Item 1 is ₱300, Custom Amounts (Cy ₱300), on 12 Nov, paid Ana ₱240 / Ben ₱60.
    - Item 2 is ₱300, Equal Split between Ana and Ben, on 12 Nov, paid Ana ₱60 / Ben ₱240.
    - **Correct:** Cy owes Ana ₱240 and Ben ₱60.
    - **Wrong:** merging them into one record of Ana ₱300 / Ben ₱300 gives Cy owing ₱150 each.
- **BR-9** Within a card, the items from one click appear in the order they were staged.
- **BR-10** Rounding is unchanged:
  - Equal splits give the leftover centavo to owners in alphabetical order (`splitEvenly`).
  - Splits between payors use the existing proportional allocation.
  - Nothing new is added.

### The fields and editing

- **BR-11** Edit mode:
  - These are locked while it's open: Save to Breakdown, every row's Edit and ×, and the edited row's own × (Q3).
  - Save Edits updates the item in place, keeping its id and position.
  - Cancel changes nothing in the list.
- **BR-12** After Save to Breakdown, the fields behave as today:
  - the date stays
  - the One Payor pick and the contributions clear
  - the payor mode stays
  - the split mode returns to Equal Split
  - the item fields clear
- **BR-13** Switching payor mode keeps what was typed in the other mode until the next Add Item, Save Edits, Cancel or Save to Breakdown. Only the mode on screen counts.
- **BR-14** During an edit, switching the split mode keeps the name, and clears the price, owners, Total Amount and member amounts (Q6). Outside an edit, see NQ1.
- **BR-15** When an edit ends, by Save Edits or Cancel:
  - Date, the payor mode and the One Payor pick go back to what they were before Edit was clicked.
  - A pre-edit pick of a member removed during the edit becomes "— Select —".
  - The item fields and the Multiple Payors amounts clear.
  - The split mode goes back to what it was before Edit.
  - A half-typed item that Edit replaced isn't restored (Q1, Q2).
  - The split mode part goes slightly beyond Q1, which covered Date and Paid By. I chose it for consistency.
- **BR-16** Removing a member cleans up staged items exactly as `removeMember` cleans up saved records (Q4).
  - **Equal Split:** drop the member as an owner, and shrink the price by their share.
  - **Custom Amounts:** drop their amount.
  - **Payors:** drop them as a payor or contributor.
  - **Removal:** drop the item if it has no owners or amounts left, or no payor left.
  - **Clear All:** clears every saved record today, so it also clears the staging list, the fields and any open edit, and its confirmation appears when saved records **or** staged items exist. This follows from "exactly as saved records".
- **BR-17** Save to Breakdown doesn't re-check contributions. A Multiple Payors item that stopped matching only because a member was removed is saved as it is. Its remaining payors split it in proportion, exactly like a saved record that lost a payor.
- **BR-18** Removed members are always cleared from the fields, from the open edit and from the One Payor pick, whether or not a confirmation was shown.

### Leave warning

- **BR-19** The warning applies whenever at least one item is staged or an edit is open. A half-typed item in the fields alone doesn't trigger it. The count in the message is the number of staged items.
- **BR-20** Every route the user can take out of the Expenses tab shows the in-app warning first:
  - the Breakdown and Summary tabs
  - "← Back to Home"
  - any future route out of the session to Home, Collection or History. Today, Back to Home is the only exit from a session (see §0.9).
  - Reload, close and the browser's Back use `beforeunload`, which is registered only while there is staged work and removed as soon as there isn't, as the existing in-flight prompt does.
- **BR-21** Navigation the user didn't start isn't intercepted:
  - **The tour:** Next, Back, Skip, Escape and its end send the app to Home without the warning. In practice no staged work can exist then, because the tour starts on Home and its overlay blocks the form. If it ever did exist, the tour wins and the work is discarded.
  - **A session that disappears:** for example one deleted from another device, which sends the app Home on its own.
- **BR-22** "Discard and leave" only drops staged work. It never saves, and never changes saved records.

## 5. Edge cases

| Case | Expected |
|---|---|
| Editing an item into a different date or payor | AC-4.6. The old card is simply not created if no other item has that date and payor. |
| Switching One Payor and Multiple Payors during an edit | AC-4.10, AC-4.11 |
| Switching Equal Split and Custom Amounts during an edit | AC-4.12 (name kept) |
| Edit clicked with a half-typed item in the fields | Replaced without asking, not restored (AC-4.3) |
| Member removed while staged items, or the edit, name them | US-6, BR-16 to BR-18. Single-payor items whose payor is removed disappear from the list. |
| Member added after items were staged | Staged items keep their owners. "All Members" was stored as the actual names, so editing such an item shows "All Members" unticked. |
| Clear All with staged items | AC-6.9 |
| One member | One Payor works. With Multiple Payors, that member's contribution equals the price. |
| No members | "Add group members first." and Add Item disabled |
| Many members | The pills on Multiple Payors rows wrap without widening the page at 320px. |
| Leaving the tab mid-edit | US-7: dialog, then Stay or Discard and leave |
| Leaving while a save is in flight | No dialog; the list is already empty (AC-7.10). |
| Reload or close on an iPhone | iOS Safari generally doesn't show `beforeunload` prompts, so this part may not warn on iPhones. The in-app dialog still works. Testers should check AC-7.8 on a desktop browser. |
| Failed save of mixed items | AC-5.2: all or nothing for the click, "Not saved." and the sync banner, and "Try again" restores the last saved version. |
| Saving with a half-typed item in the fields | It's ignored and cleared, as today. Save is disabled during an edit. |
| Session with no purchases | "Add an item first."; no rows and no Edit buttons |
| Zero or negative values | BR-2 and BR-5 |
| Very long item or member names | Name, payor and pills truncate or wrap; Edit and × always stay visible and tappable on a phone. |
| Phone and desktop | Both show the date and payor on each row. On a phone, Edit sits next to × on the row's first line. The staging list's mobile CSS uses a 620px breakpoint, not 640px; that's pre-existing, and the tech lead should decide which the new styles follow. |
| Closed session | Not reachable (§0.13) |

## 6. Scope

**In:**
- stamping the date and payor at Add Item
- the per-item contributions check
- the date and payor on each staged row
- Edit, Save Edits and Cancel, and the locks during an edit
- splitting one save into records by date and payor
- the save-message rule changes
- removing and clearing members, including the confirmation wording (US-6)
- the leave warning (US-7)
- tests for BR-5, BR-8, BR-9 and BR-16

**Out:**
- schema or API changes
- changes to Breakdown, Summary or the PDF beyond their existing cards
- desktop layout changes beyond the staging row and the dialog
- a fill-remainder button for contributions
- reordering or grouping the staging list
- editing saved records
- a "Save and leave" choice
- a hint by a disabled Add Item (Q5)
- the deliberately absent features: calculator, sharing, currency selection, offline use

**Notes for the tech lead:**
- `ConfirmDialog` hard-codes its cancel label as "Cancel". The "Stay" label needs a small optional prop.
- The tour moves between screens through `tourNavigate`, not `SessionTabs`. Keep the warning out of that path (BR-21).
- Don't move, rename or add any `data-tour` attribute (`tab-expenses`, `tab-breakdown`, `tab-summary`, `workspace-back`), and run `steps.test.ts`.
- With the date and payor checks gone from save, the `saveMessage.ts` rules that only exist for them, such as the special case for a cleared date while saving, need rework.

## 7. Findings in today's code

1. **A removed member stays in staged items and the payor pick.** Staged items aren't cleaned
   up when a member is removed, and the One Payor dropdown keeps the removed name while showing
   "— Select —". The next save then stores them. `getRawOwedMatrix` skips non-members, so that
   money silently drops out of Summary while Breakdown still counts it. US-6 fixes this.
2. **Payors who paid less than their share.** A member who is a payor on a record owes nothing
   on it, even if they paid less than their share (in BR-8's item 2, Ana paid ₱60 against a
   ₱150 share). This is how the calculation works today; per-item records don't make it worse.
3. **Later Breakdown edits can unbalance contributions.** Editing a total or a member's amount
   in Breakdown changes an item without changing its contributions, so a Multiple Payors item
   can stop matching after it's saved. This is unchanged.

## 8. Owner decisions

| # | Question | Answer | Status |
|---|---|---|---|
| Q1 | Fields when an edit ends | Date and Paid By go back to their pre-edit values; the item fields and Multiple Payors amounts clear. | Resolved (BR-15) |
| Q2 | Edit over a half-typed item | Replace without asking | Resolved (AC-4.3) |
| Q3 | Edited row's own × | Disabled | Resolved (BR-11) |
| Q4 | Member removed while staged items name them | Clean up like saved records, clear them from the fields and the edit, and confirm when staged items name them | Resolved, now in scope (US-6) |
| Q5 | Hint by a disabled Add Item or Save Edits | No hint | Resolved |
| Q6 | Split-mode switch during an edit | Keep the name; clear the price, owners and amounts | Resolved (BR-14); outside an edit, see NQ1 |
| Q7 | Multiple Payors with one contributor | Allowed | Resolved (BR-5, AC-2.6) |
| Q8 | Leaving with staged work | In-app warning plus `beforeunload` | Resolved, now in scope (US-7) |

## 9. New open questions

- **NQ1. Should switching between Equal Split and Custom Amounts also keep the name outside an edit?**
  - **Recommended:** yes, keep the name everywhere.
    - One toggle that behaves differently depending on whether an edit is open is a trap, and harder to test.
    - The name never affects money, and someone who types "Dinner" and then switches mode wants to keep it.
  - This changes today's non-edit behaviour, so it's the owner's call.
  - If not, the toggle keeps today's clear-everything behaviour outside an edit, and BR-14 applies to edits only.
- **NQ2. Should signing out from the account menu warn about staged work?**
  - Signing out goes through Clerk's menu, which Hati doesn't control.
  - **Recommended:** no in-app warning. The browser's prompt covers it only if the sign-out actually reloads the page.
  - If the owner wants a guaranteed warning here, the sign-out entry has to be intercepted, which is more work.

## 10. Owner answers after this version (2026-11-13)

Recorded by the tech lead when this file was copied into `docs/specs/`. The text above is
unchanged; these answers override section 9.

- **NQ1:** yes. Switching between Equal Split and Custom Amounts keeps the item name
  everywhere, whether or not an edit is open, and clears only the price, owners, Total Amount
  and member amounts. This changes today's behaviour outside an edit too.
- **NQ2:** no in-app warning on sign-out from the Clerk account menu. The browser's
  `beforeunload` prompt covers it only if sign-out reloads the page.
- **BR-16, Clear All:** approved as written. Clear All also clears the staging list, the
  fields and any open edit, and its confirmation appears when saved records or staged items
  exist.
