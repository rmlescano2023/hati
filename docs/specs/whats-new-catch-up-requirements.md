# Requirements: cumulative "What's new" (catch-up)

Status: draft for the tech lead. Owner decisions 1 to 6 (in the task brief) are settled; the open questions
at the end are not.

## 1. Problem and outcome

**Problem.** "What's new in Hati" holds one release's text at a time (`src/App.tsx`), and each release has
replaced the one before. An account whose last seen version is older than the one before the current one
jumps straight to the current notes and never hears about the earlier features (Collection, Your name,
Receipts item by item, Guides).

**Outcome.** One dialog, shown once per account as today, lists every feature note released after the
version that account last saw: the current release under "Latest", every older unseen release under
"Earlier". One dismissal marks it all seen. Nothing changes for an account that is up to date, or for a new
account.

## 2. What exists today (from the code)

- `WHATS_NEW_VERSION = 3` (`src/lib/whatsNew.ts`). `whatsNewDue(onboardedAt, seen)` is true when the account
  is onboarded and `seen < 3`; anything that isn't a number counts as 0.
- `GET /api/user` returns `whatsNewVersion` (`null` if never set). Marking seen runs
  `greatest(coalesce(whats_new_version, 0), WHATS_NEW_VERSION)`, so the marker never goes down
  (`api/user.ts`). Finishing or skipping the tour stamps it in the same write (BR-W3).
- If the read fails, the dialog doesn't show (BR-W8, `useOnboarding.ts`).
- The dialog is `OnboardingDialog`: centred, `min(26rem, 100vw - 2rem)` wide, **no max height and no
  scroll region of its own**. With seven notes at 375px it would be taller than the screen, and the
  browser's default for a modal dialog is to scroll the whole dialog, buttons included.
- The dev-only "Preview What's new" (`DevSessionsBar`) opens the same dialog and writes nothing; a guide
  started from a preview writes nothing either.

## 3. Release notes (content)

Each note belongs to exactly one release. The text is the text each release shipped, unchanged (see OQ-3).
Within a release the notes keep their shipped order.

| Release | Note heading | Text |
|---|---|---|
| v3 | **Joined sessions.** | On a finished session, tap Share with members and share the link. Each person signs in, picks who they are, and follows what they owe or are owed in their own Collection. |
| v3 | **"I've paid."** | Members who joined can tell you they've paid. It waits until you confirm or decline it, so you both end up with the same figures. |
| v3 | **Collection and History.** | Collection now shows only what's still being paid; settled sessions are in History. |
| v2 | **Receipts, item by item.** | In Custom Amounts, type a receipt the way it's printed: what each person had, dishes people shared, discounts like PWD or senior, and service charges. Hati works out each person's share. |
| v2 | **Guides.** | Tap "Need help?" on Expenses or Collection for a quick practice run, or open Tutorials in your account menu. |
| v1 | **Collection.** | A new tab for finished sessions: see who owes you and who you owe, and record payments as they come in, even part payments. |
| v1 | **Your name.** | Set it in Profile, in your account menu, so Hati knows which member is you. |

Sources: v1 from commit e845b07 (BR-W11), v2 from PR #169 (`1c43f95`), v3 from PR #175 (current `App.tsx`).
Renames and polish are not notes (owner decision 1).

## 4. Business rules

- **BR-WC1. Which notes.** Let *seen* be the account's `whatsNewVersion`, read as a number; `null`, a missing
  value or any non-number counts as 0 (as `whatsNewDue` does today). The dialog lists every note whose
  release is greater than *seen* and not greater than `WHATS_NEW_VERSION`. No cap (owner decision 2).
- **BR-WC2. When it shows.** Unchanged: BR-W1, BR-W3 to BR-W5, BR-W7 to BR-W10 and the guide, practice and
  join-flow waits in `App.tsx` all still hold. It shows when at least one note qualifies, which is exactly
  when `whatsNewDue` is true today.
- **BR-WC3. Grouping.** Notes of release `WHATS_NEW_VERSION` go under **"Latest"**. Notes of every older
  release that qualifies go under **"Earlier"**, newest release first, as one list with no per-release
  labels. Headings show only when "Earlier" has at least one note (OQ-1); with only current-release notes
  the dialog looks as it does today.
- **BR-WC4. Buttons.** "Show me how" appears only when the v2 **Guides** note is among the notes shown
  (owner decision 3). Then the buttons are "Got it" (secondary) and "Show me how" (primary, last), and
  "Show me how" marks seen and starts the Expenses guide, as v2 did. Otherwise there is one button, "Got
  it" (primary). Whether the account has already done the Expenses guide doesn't matter. There is no "Take
  me to Collection" (the v1 button).
- **BR-WC5. Marking seen.** Any close ("Got it", "Show me how", Escape) marks seen once, stamping
  `WHATS_NEW_VERSION`. That covers every note shown. No schema, API or version change (owner decision 5).
- **BR-WC6. Supersedes BR-W2's last sentence.** "Only the current version's dialog ever shows; missed older
  ones don't queue up" becomes: still only one dialog, but it carries the missed releases' notes. BR-W6 and
  BR-W11 (v1 buttons and content) were already replaced by v2 and v3; section 3 is the content now.
- **BR-WC7. Guide offers unchanged.** The Expenses and Collection offers keep their own rules (owner
  decision 4).
- **BR-WC8. Preview.** The dev preview never writes the marker, and a guide started from it never marks the
  guide seen (unchanged). What it shows is OQ-2.
- **BR-WC9. Phone and short screens.** The dialog never grows taller than the viewport. When the notes don't
  fit, the notes scroll inside the dialog while the title and the buttons stay on screen. When they fit, it
  looks as it does today, on phone and desktop alike.
- **BR-WC10. Release order.** It ships before v3 is promoted to uat (owner decision 6).

## 5. User stories and acceptance criteria

For every AC below: the account is onboarded, the user-state read succeeded, and the dialog is the one
titled "What's new in Hati".

**US-WC1. Catch up on what I missed.** As a returning user who skipped a release or two, I want to see every
feature added since I last looked, so that I know about features that came before the latest one.

- **AC-WC1.1 (seen 0 or null).** Given an account whose `whatsNewVersion` is `null` or 0, when the app loads,
  then the dialog shows "Latest" with the three v3 notes in order (Joined sessions, "I've paid", Collection
  and History), then "Earlier" with Receipts item by item, Guides, Collection, Your name, in that order; and
  the buttons are "Got it" and "Show me how", with "Show me how" last.
- **AC-WC1.2 (seen 1).** Given `whatsNewVersion` 1, when the app loads, then "Latest" has the three v3 notes,
  "Earlier" has only Receipts item by item and Guides, and the buttons are "Got it" and "Show me how".
- **AC-WC1.3 (seen 2).** Given `whatsNewVersion` 2, when the app loads, then the dialog shows only the three
  v3 notes, with no "Latest" or "Earlier" heading (subject to OQ-1), and a single "Got it" button.
- **AC-WC1.4 (seen 3).** Given `whatsNewVersion` 3 (or higher), when the app loads, then no What's new dialog
  opens.
- **AC-WC1.5 (unreadable).** Given `whatsNewVersion` is not a number (for example `"1"`), when the app loads,
  then the dialog is the same as AC-WC1.1.
- **AC-WC1.6 (read fails).** Given `GET /api/user` fails, when the app loads, then no dialog opens (BR-W8,
  unchanged). This is different from AC-WC1.5.

**US-WC2. Dismiss once.** As a returning user, I want one dismissal to cover everything listed, so that I'm
not asked again.

- **AC-WC2.1.** Given the dialog from AC-WC1.1, when I tap "Got it", then it closes and stays where I was;
  after a reload it does not open again.
- **AC-WC2.2.** Given the dialog from AC-WC1.1 or AC-WC1.2, when I tap "Show me how", then it closes, the
  Expenses guide starts, and after a reload What's new does not open again.
- **AC-WC2.3.** Given any of these dialogs, when I press Escape, then it behaves as "Got it". Clicking the
  backdrop does nothing (BR-W7).

**US-WC3. New accounts.** As a new user, I want the tour, not a list of changes, so that my first visit isn't
crowded.

- **AC-WC3.1.** Given a brand-new account, including one created through a join link, when it first loads,
  then it gets the welcome and the tour; after finishing or skipping it, and after a reload, no What's new
  opens (BR-W3, unchanged).

**US-WC4. Later releases.** As the owner, I want a future release to slot in without rewriting older notes.

- **AC-WC4.1 (future v4).** Given `WHATS_NEW_VERSION` is 4 and v4 has notes, when an account with
  `whatsNewVersion` 2 loads, then "Latest" has the v4 notes and "Earlier" has the three v3 notes; with
  `whatsNewVersion` 3, only the v4 notes show, with no headings. This is checked with a unit test, not
  shipped.

**US-WC5. Phone.** As a user on a phone, I want to read every note and still reach the buttons.

- **AC-WC5.1.** Given the AC-WC1.1 dialog (seven notes) at 375×667, when it opens, then the title, the start
  of "Latest" and both buttons are visible without scrolling, and the page behind doesn't move.
- **AC-WC5.2.** Given the same, when I swipe in the notes, then they scroll to Your name, the last note,
  while both buttons stay visible and tappable throughout.
- **AC-WC5.3.** Given the same at a short height (667×375, phone on its side), then the buttons are still
  visible and the notes still scroll.
- **AC-WC5.4.** Given a keyboard user on desktop with a short window, then the notes can be scrolled with
  the keyboard and "Latest" and "Earlier" are read out as headings by a screen reader.
- **AC-WC5.5.** Given the AC-WC1.3 dialog (three notes) on desktop and at 375px, then it looks as it does on
  `main` today: no scroll bar, no headings.

## 6. Edge cases

- **Account onboarded between releases.** Its marker was stamped at onboarding with the version current then,
  so it only gets later releases' notes. Correct, nothing to do.
- **Marker above current** (for example 4 after a rollback). No dialog (AC-WC1.4).
- **Two devices.** BR-W9, unchanged: the same full list may show on both, once each.
- **Guide already done.** "Show me how" still shows when Guides is listed (BR-WC4).
- **Joining while due.** The join flow still goes first (BR-G1); What's new shows once it ends, unchanged.
- **Testing in the running app.** On the shared Neon `main` branch a marker only goes up, and new test
  accounts are stamped at 3, so testers can't make a real account at 0, 1 or 2. AC-WC1.1 to WC1.5 and
  WC4.1 are checked by unit tests on the note selection; the running app is checked through the preview
  (OQ-2) and a real seen-2 account on uat.

## 7. Scope

**In:** the note list by release, the selection and grouping in BR-WC1 to WC4, the scrolling dialog in
BR-WC9, unit tests for every AC-WC1 case and AC-WC4.1, and the preview change if OQ-2 is approved.

**Out:** a version bump, schema or API changes, renames and polish as notes, per-release labels inside
"Earlier", a version picker in the dev preview (unless the owner asks, OQ-2), per-release buttons other
than "Show me how", any change to the guide offers or to when the dialog opens.

## 8. Open questions for the owner

All three were resolved by the owner on 2026-11-28:

- **OQ-1, resolved: no headings** when every note shown is from the current release. "Latest" and
  "Earlier" appear only when there is an "Earlier" group.
- **OQ-2, resolved: the seen-0 view.** The dev "Preview What's new" shows all seven notes and "Show me
  how". No version picker.
- **OQ-3, resolved: keep all v1 and v2 wordings word for word**, including "A new tab for finished
  sessions".

The questions as they were asked:

- **OQ-1. Headings when there is nothing earlier.** When every note shown is from the current release (a
  seen-2 account today), show "Latest" anyway? *Recommend no headings*, as you lean: a single heading over a
  single group says nothing, and it keeps the common case (every tester on uat) looking as it does today.
- **OQ-2. What the dev preview shows.** *Recommend the seen-0 view: all seven notes and "Show me how".* It's
  the longest case, so it's the one that proves the phone layout, and it's the only way to see Earlier in
  the running app, since real accounts can't be set back. The cost: you can't preview the seen-1 or seen-2
  views; unit tests cover those. A dev-only picker (0, 1, 2) is possible but adds UI nobody asked for.
- **OQ-3. Do the v1 and v2 wordings still hold?** Checked against today's `main`. *Recommend keeping all
  four verbatim.*
  - **Collection (v1)** says "A new tab for finished sessions". Collection is still a tab (`NavTabs`) for
  finished sessions, and recording payments, including part payments, still works. Since History, it holds
  only sessions still being paid, but the v3 "Collection and History" note says so just above it under
  "Latest", so the two read together correctly. The only stale word is "new", which is acceptable under
  "Earlier". If you'd rather fix it: "A tab for finished sessions: see who owes you…".
  - **Your name (v1).** Profile is still in the account menu, first item (`Header.tsx`: Profile, Tutorials,
  Manage account, Sign out). Holds.
  - **Receipts, item by item (v2).** "Custom Amounts" is still the mode's label, and its sections (Shared
  items, Discounts, Charges) match "dishes people shared, discounts…, service charges". The note doesn't
  name the renamed controls, so the renames don't date it. Holds.
  - **Guides (v2).** "Need help?" is on Expenses (`SessionWorkspace`, Expenses tab of a draft) and on
  Collection (`CollectionPage`), and Tutorials is in the account menu. Holds.
