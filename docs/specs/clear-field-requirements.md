# Requirements: a clear button inside the Expenses form's text and amount fields

Source: the owner's intake decisions (1 to 4) and the intake defaults, plus the code on
`feature-custom-orders` as read on 2026-11-15. The owner's decisions are final. Statements about
"today" come from reading the code, not from the running app. The members in the examples (Ana,
Ben, Cy) are made up.

This feature ships with custom orders (`docs/specs/custom-orders-requirements.md`). IDs here carry
a `CF` prefix so they don't clash with that document's `CO` IDs.

## 0. How it works today

1. **Emptying a box** means selecting its text and deleting it. Nothing in the Expenses form
   clears a single field. Add Item, Save Edits, Cancel and a mode switch clear the item fields as a
   group.
2. **Every in-scope box is a controlled input** whose `onChange` writes the raw text to the form's
   state. Every derived value is read from that state:
   - Entered, Contributed and their red "of ₱Y" mismatch text
   - the "(₱X each)" share and the "Add a price for <order> or remove it" hint
   - whether Add Item / Save Edits and Fill Remainder are enabled
3. **Amount boxes** are `type="number"`. A box that's empty, `0`, negative or unreadable counts as
   ₱0 (`parsePositiveAmount`). When the browser can't read what's typed (for example `-` or `1e`),
   the input's `value` is `""`, so the state is `""` while the box still shows the text.
4. **Order lines** (`CustomAmountFields.tsx`): each line is a name box, a price box, and, when the
   member has more than one line, a plain × button outside the boxes labelled "Remove <Member>'s
   order" or "Remove <Member>'s order <order name>". On phones the line is the name, a 92px price
   box and a 44px × column, with 44px-tall boxes. On desktop the price box is 96px.
5. **Paid By contributions** (`PayorModeFields.tsx`, Multiple Payors only): each is one 38px-tall
   box with the member's name on the left and a 96px amount input on the right.
6. **New-member box** (`MemberList.tsx`): typing clears the "<Name> is already in the group."
   message. While the "Include <Name> in earlier items?" dialog is open, the page behind it is
   inert.
7. **No in-scope box is ever disabled or read-only.** Some aren't shown in some states: with no
   members, Total Amount, the order lines and the contributions are replaced by "Add group members
   first."; with One Payor there are no contribution boxes; a closed session has no Expenses tab.
8. **Escape** does nothing in the Expenses form's boxes. It closes the page's dialogs.
9. No onboarding-tour target (`data-tour`) is on or inside any in-scope box.

## 1. Problem

People type and retype names and amounts on the Expenses form a lot, more so with order lines.
Emptying a box means selecting and deleting its text, which is fiddly on a phone.

## 2. Outcome (checkable)

- Every in-scope box that has text shows a grey counter-clockwise arrow (↺) at its right edge.
- One tap on it empties the box, shows its placeholder, and puts the cursor in it.
- Everything derived from the box updates exactly as if the text had been deleted by hand.

## 3. In-scope fields

| # | Field | Visible label | Placeholder | Clear button `aria-label` |
|---|---|---|---|---|
| 1 | Item Name (`ItemModeFields`) | Item Name | e.g. Dinner, Groceries, Taxi | Clear item name |
| 2 | Total Price, Equal Split (`ItemModeFields`) | Total Price (₱) | 0.00 | Clear total price |
| 3 | Total Amount, Custom Amounts (`CustomAmountFields`) | Total Amount (₱) | 0.00 | Clear total amount |
| 4 | Order line name (`CustomAmountFields`) | none; `aria-label` "Ana's order 1 name" | Order (optional) | Clear Ana's order 1 name |
| 5 | Order line price (`CustomAmountFields`) | none; `aria-label` "Ana's order 1 price" | 0.00 | Clear Ana's order 1 price |
| 6 | Paid By contribution, Multiple Payors (`PayorModeFields`) | the member's name, "Ana" | 0.00 | Clear Ana's contribution |
| 7 | New member name (`MemberList`) | none; `aria-label` "New member name" | Enter member name… | Clear new member name |

In rows 4 to 6, "Ana" is the member and "1" is the line's position in that member's block, the same
number the box's own `aria-label` uses.

## 4. User stories and acceptance criteria

### US-CF1: Empty a box in one tap
As the person logging, I want to empty a box with one tap, so that I can retype it quickly on my
phone.

- **AC-CF1.1** Given any in-scope box that's empty, then no clear button shows in it.
- **AC-CF1.2** Given I type one character in it, then a grey ↺ appears inside the box at its right edge. When I delete the last character by hand, it disappears.
- **AC-CF1.3** Given Item Name holds "Dinner", when I tap its clear button, then the box is empty, shows "e.g. Dinner, Groceries, Taxi" in grey, the clear button is gone, and the cursor is in Item Name.
- **AC-CF1.4** Given Total Price holds "1500", when I tap its clear button, then the box is empty and shows the grey "0.00" placeholder, not a typed "0.00".
- **AC-CF1.5** The same holds for every field in section 3: after a clear, the box is empty, shows its placeholder, and has focus.
- **AC-CF1.6** Clearing never adds, saves or removes anything. The new-member box's clear doesn't add a member, and no clear adds an item, saves edits or removes an order line.

### US-CF2: Everything else follows the cleared box
As the person logging, I want the totals and hints to react to a clear as they do to deleting by
hand, so that I can trust what the form shows.

- **AC-CF2.1** Given Equal Split with Total Price ₱900 between three owners ("₱300.00 each"), when I clear Total Price, then "(₱300.00 each)" disappears and Add Item is disabled.
- **AC-CF2.2** Given Item Name is cleared, then Add Item (or Save Edits) is disabled.
- **AC-CF2.3** Given Custom Amounts with Total Amount ₱500, Ana ₱200 and Ben ₱300 on one line each, when I clear Ben's price, then:
  - Entered shows ₱200.00 in red with "of ₱500.00"
  - Fill Remainder is enabled, and pressing it puts 300.00 in Ben's first line
- **AC-CF2.4** Given Ben's first line is named "Pasta" and priced ₱300, when I clear its price, then "Add a price for Pasta or remove it" appears and Add Item is disabled. When I then clear its name instead of retyping the price, the hint goes.
- **AC-CF2.5** Given Ben has two lines, the first priced ₱300 and the second ₱50, when I clear the second line's price, then Ben still has a priced line, so he isn't blank for Fill Remainder.
- **AC-CF2.6** Given Total Amount ₱500 with a mismatch, when I clear Total Amount, then the red "of ₱500.00" goes, Entered stays, and Fill Remainder is disabled.
- **AC-CF2.7** Given Multiple Payors on a ₱1,000 item with Ana ₱600 and Ben ₱400, when I clear Ben's contribution, then Contributed shows ₱600.00 in red with "of ₱1,000.00", and Add Item is disabled.
- **AC-CF2.8** Given clearing an order line's name and its price, then the line stays, empty. Only its × removes it.

### US-CF3: Clear and Remove can't be confused
As the person logging, I want clearing an order and removing an order to look and sound different,
so that I don't delete a line when I meant to retype it.

- **AC-CF3.1** Given Ana has two order lines, then each box that has text shows its grey ↺ inside the box, and the line's Remove × stays the plain × outside the boxes.
- **AC-CF3.2** A screen reader announces the price box's clear as "Clear Ana's order 1 price" and the line's Remove as "Remove Ana's order" (or "Remove Ana's order Pasta" when the line is named Pasta).
- **AC-CF3.3** Given a phone, when I tap the clear button in a price box, then the line is never removed. The two buttons' tap areas don't overlap.

### US-CF4: Works on a phone and on desktop
- **AC-CF4.1** On a phone (640px wide or less), each clear button's tap area is at least 44px tall, and no box gets taller than it is today (see CQ4 for the width).
- **AC-CF4.2** On desktop, the only visible change is the icon inside boxes that have text. Boxes keep their size and position.
- **AC-CF4.3** At 320px wide, nothing scrolls sideways, and the clear button never covers the box's text (see CQ4).

## 5. Business rules

- **BR-CF1** A clear button belongs to each field in section 3 and to no other field. Session names, the profile name and nicknames, Collection's payment amount, the purchase date and the checkboxes get none.
- **BR-CF2** The button shows exactly when the box shows any text, including spaces only and text the browser can't read as a number (BR-CF6). Whether the box has focus doesn't matter (pending CQ1).
- **BR-CF3** A clear sets the box to empty, never to `0` or `0.00`, so its placeholder shows. It goes through the field's own change path, exactly as deleting the text by hand does, so every value in section 0, item 2, updates with it.
- **BR-CF4** A clear changes only the form on screen. It writes nothing to the server, changes no staged row and no saved item, and adds no member.
- **BR-CF5** After a clear, focus moves to the cleared box. On a phone this opens the keyboard, which is the point: the next step is retyping.
- **BR-CF6** A number box showing text the browser can't read (its `value` is `""`, for example after typing `-`) shows the clear button. The clear empties the visible text too, even though the form's state already reads empty. The derived values don't change, because that text already counted as ₱0.
- **BR-CF7** The Paid By contribution's "box" is the whole bordered row (name and amount). Its clear button sits at that row's right edge, after the amount. The amount keeps its width, and the member's name gives up the room, truncating with an ellipsis as it does today.
- **BR-CF8** The button is a grey counter-clockwise arrow (↺), visibly different from the order line's plain Remove ×. It has the `aria-label` in section 3 and no other text.
- **BR-CF9** If an in-scope box is ever disabled or read-only, it shows no clear button. None is today (section 0, item 7).
- **BR-CF10** Escape doesn't clear a box (pending CQ3). Pressing it in a box does what it does today, which is nothing.
- **BR-CF11** No `data-tour` target moves. Run `steps.test.ts` and `targets.test.ts`.

## 6. Edge cases

| Case | Expected |
|---|---|
| Box holds only spaces ("   ") | Button shows (BR-CF2); a clear empties it. Derived values don't change, since spaces already count as no name. |
| Number box shows text the browser can't read (`-`, `1e`) | Button shows; a clear empties the visible text and nothing derived changes (BR-CF6) |
| Box holds `0` or `0.00` typed | Button shows; a clear leaves it empty with the placeholder (BR-CF3) |
| Clear during an Edit of a staged row | Only the form changes. The staged row is untouched until Save Edits; Cancel leaves it as it was and empties the item fields, as today. |
| Clear during an Edit of a saved item | Nothing is saved (BR-CF4). Save Edits is disabled while the item is invalid. Clearing and retyping the same value counts as nothing changed (BR-CO32). Cancel writes nothing. |
| New-member box showing "Cy is already in the group." | A clear empties the box and the message goes with it, as deleting by hand does today |
| New-member box while the include dialog is open | Not reachable: the page behind the dialog is inert |
| Clearing the new-member box, then "+ Add" or Enter | Nothing happens, as for any blank name today |
| A member's only order line, cleared | The line stays, empty, with no Remove × (a member always keeps one line) |
| Removing an order line after clearing it | Works as today; the remaining lines renumber, and their clear labels follow ("order 2" becomes "order 1") |
| Very long member name | The clear label reads the full name. In a contribution row the name truncates, never the amount or the button (BR-CF7). |
| Very long item or order name | The text scrolls inside the box as today; the button stays visible at the right edge |
| Many members, many filled lines | Every box with text shows its own button (pending CQ1) |
| No members | Only Item Name, Total Price (Equal Split) and the new-member box are shown, so only they can show a button |
| One Payor | No contribution boxes, so no contribution clears |
| Mode switch after clearing Total Price | Custom Amounts starts with no lines filled, as it does today with no price |
| Keyboard: Tab | Pending CQ2. Recommended: Tab moves box to box and skips the clear buttons. |
| Keyboard: Escape | Doesn't clear (BR-CF10, CQ3) |
| Closed session | Not reachable: closed sessions have no Expenses tab |

## 7. Scope

**In:**
- the clear button in the seven fields of section 3, on phone and desktop
- unit or component tests that a clear empties each field and that the derived values in US-CF2 update

**Out:**
- every other field (BR-CF1)
- a clear-all-fields button, or an undo for a clear
- changing the order line's Remove × or any other existing control
- Escape clearing a box (unless CQ3 says otherwise)

**Notes for the tech lead:**
- BR-CF6 means the button's visibility and the clear can't rely on the form's state alone for number boxes.
- There's no shared input component today, so the button will be added to four components; `src/components/shared/` is where a shared piece would go. The icon goes in `icons.tsx`.

## 8. Open questions for the owner

All four were resolved by the owner on 2026-11-15. The "pending CQn" notes above now read as these answers.

1. **CQ1. Should the button show on every box that has text, or only on the box you're typing in?**
   - **Every box with text** (as decision 3 reads): one tap from anywhere, but a Custom Amounts block full of orders shows a × in every box, and on a phone the price box's × sits next to the line's Remove ×.
   - **Only the box being edited** (as many phone text boxes do): less clutter, but clearing an untouched box takes two taps.
   - **Recommended:** every box with text, because the point is one tap.
   - **Resolved:** every in-scope box that has text, not only the one being typed in.
2. **CQ2. Should Tab stop on each clear button?**
   - **Stopping:** a keyboard user can clear with Enter, but a filled Custom Amounts item adds up to two extra Tab stops per line.
   - **Skipping:** Tab goes box to box as today. Keyboard users clear with select-all and Delete as now, and screen-reader users still reach the button by its label.
   - **Recommended:** skip, as browsers do with their own search-box clear.
   - **Resolved:** skip. Tab doesn't stop on the clear buttons (`tabIndex={-1}`); screen readers still reach each one by its `aria-label`.
3. **CQ3. Should Escape clear the box you're typing in?**
   - **Recommended:** no. It would be easy to lose an amount by accident, and Escape already means "close" for the page's dialogs.
   - **Resolved:** no. Escape does nothing new.
4. **CQ4. On a phone, the order line's price box is only 92px wide. A 44px-wide tap area inside it leaves room for about four digits.**
   - **Option A (recommended):** in that box only, the tap area is the full 44px tall but narrower (about 24px), so amounts of up to seven characters, such as "1250.00", stay fully visible. Every other box gets 44 × 44. (Extended to the order name box too; see the resolution.)
   - **Option B:** widen the price box on phones, which narrows the order name box (to about 60px on a 320px phone).
   - **Option C:** keep 44 × 44 and let the button cover the end of longer amounts.
   - **Resolved:** Option A. In the order line's price box on phones, the tap area is 44px tall and about 24px wide, so amounts like "1250.00" stay visible. The order line's name box gets the same 44px-tall, 24px-wide tap area, because a 44px slot left it almost no visible text at 320px. Every other box gets 44 × 44.
