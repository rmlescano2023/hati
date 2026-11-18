# Requirements: Expenses and Collection guides, with a practice session

Source: the owner's intake decisions and answers to the architect
(`~/.claude/plans/buzzing-roaming-lark.md`), the architect's brief
(`~/.claude/plans/buzzing-roaming-lark-architecture.md`, options A1, B1, C1 and D1 approved), and
the code at `95b79c8` on branch `rename-add-sub-item`, read on 2026-11-16. Statements about
"today" come from reading the code, not from the running app.

Everything the owner has already decided is restated in section 5 under "Settled by the owner"
and isn't asked again. The people, sessions and items in the guides are made up. None comes from
`src/lib/demoData.ts`.

IDs carry a `TG` prefix (`US-TG`, `AC-TG`, `BR-TG`, `OQ-TG`). Every story is tagged **PR 1** or
**PR 2**, following the owner's split (section 9).

## 0. How it works today

Only what this feature builds on.

1. **The first-run tour** (`src/components/onboarding/steps.ts`, `OnboardingTour.tsx`) has 7
   steps, one per screen, and runs in the account's real, empty tour session. It's offered once,
   gated on `users.onboarded_at`, by the "Welcome to Hati!" dialog. It ends with "You're all
   set!" when finished. Developers can rerun it with a dev-only Preview Tour that writes nothing.
2. **The tour's controls.** Next moves the app to the step's screen. Back works from step 2 on.
   Skip ends the tour. A click on the dimmed area does nothing (`overlayClickAction: false`). A
   tap on a tab that isn't highlighted shows "Tap Next to continue" and is swallowed. Moving to a
   screen the tour didn't choose ends it.
3. **With no members**, the Expenses form shows "Add group members first." in place of Paid By
   (`PayorModeFields.tsx:50`), the Equal Split owners (`EqualSplitFields.tsx:46`) and all of
   Custom Amounts (`CustomAmountFields.tsx:141`). A new account's Collection shows "Nothing to
   collect yet". So the tour can only name the tabs.
4. **The Expenses tab, top to bottom:**
   - **Group Members:** a name box, + Add, the name chips with ×, and Clear All.
   - **Purchase Details:**
     - Date.
     - Paid By: One Payor with a picker, or Multiple Payors with one amount box per member and
       "Contributed ₱X", highlighted with "of ₱Y" when it doesn't match.
     - The Add Item mode toggle (Equal Split / Custom Amounts).
     - Item Name, plus Total Price (₱) in Equal Split.
     - Equal Split: "Owner(s) — Split Equally Among (₱X each)" with All Members and a pill per
       member.
     - Custom Amounts:
       - Total Amount (₱) and Fill Remainder.
       - "Who's in this item".
       - One block per picked member: sub-item name and price rows, "+ Add sub-item", and the
         member's share beside the name once any shared item, discount or charge exists.
       - Shared items, Discounts and Charges sections, added with "+ Add shared item",
         "+ Add discount" and "+ Add charge".
       - The footer: Subtotal, Discounts and Charges (when there's a discount or charge), then
         "Entered ₱X", highlighted with "of ₱Y" when it differs from Total Amount.
     - + Add Item.
   - **The staged list:** "N items staged ₱X", then a row per item with a pencil (Edit) and ×
     (Remove).
   - **Save to Breakdown →.**
5. **There is no line labelled "Remainder".** The remainder is shown by the footer's
   "Entered ₱X of ₱Y" and filled by the Fill Remainder button beside Total Amount. This document
   reads the brief's "remainder line" as those two things (OQ-TG4).
6. **Leaving Expenses with unsaved work.** With staged items, or with a saved item open for
   editing ("Editing saved item: X"), Back to Home or another tab first asks "Leave without
   saving?", with Stay and Discard and leave. Fields typed but not yet added with + Add Item are
   dropped on leaving, with no prompt. The browser also asks before a reload while items are
   staged.
7. **Collection** shows finished sessions only, in three sections:
   - **Needs setup:** Hati can't tell which member is the user.
   - **Outstanding:** something still to collect or pay.
   - **Settled:** collapsed behind a "Settled (N)" toggle.

   At the top, a Summary strip shows "Owed to you (they pay you)" and "You owe (you pay them)".
   A card opens to lines, each with Record payment (or I paid) and Mark fully paid, a list of the
   line's payments with Undo, and Mark all as paid for the whole card.
8. **"Already settled?"** is a one-time Collection dialog about sessions finished before
   Collection existed. It never opens over the tour, What's new or another dialog (`canAsk`).
9. **What's new** (version 1) shows once to an onboarded account, on whatever screen is open.
   Its buttons are "Got it" and "Take me to Collection". A new account never sees it, because the
   onboarding mark stamps the current version.
10. **The account menu** (Clerk's `UserButton`) lists Profile, Manage account and Sign out.
    Profile opens `ProfileDialog`, which shows its form only once the profile has loaded.
11. **`SyncBanner`** sits at the app level and reports real save failures, with Try again (or
    Refresh). It's pinned on Collection.

## 1. Problem

People who don't use apps like this every day can't work out how to log a purchase from the
first-run tour. The tour names each tab, but it never shows Paid By, Equal Split against Custom
Amounts, sub-items, shared items, discounts and charges, or the path from + Add Item to Save to
Breakdown. It doesn't show how to track payments on Collection either, and it can't, because it
runs on an empty session. Accounts that onboarded before the Custom Amounts changes were never
shown them, and no one can rerun the tour.

## 2. Outcome (checkable)

- From Expenses or Collection, in one tap, a user can run a guide that walks through every field
  on that tab with the field filled in, on phone and desktop.
- The guide runs in a practice session with made-up people. Nothing in it reaches the server,
  and the user's real sessions are exactly as they were afterwards.
- Any guide, including the first-run tour, can be replayed at any time from Tutorials in the
  account menu.
- Each account is offered each tab's guide once, the first time it opens that tab after release,
  and never again on any device once it has started or declined it.
- Existing accounts see a What's new about the Custom Amounts changes, with a way straight into
  the Expenses guide.
- No two one-time prompts (welcome, What's new, "Already settled?", guide offers) ever stack up
  on the same screen.

## 3. Terms

- **Guide:** the Expenses guide ("Logging expenses") or the Collection guide ("Tracking
  payments"). The first-run tour ("App overview") isn't a guide in this document.
- **Practice:** the screen a guide runs on. It's built from made-up data, held in memory only,
  and replaces the real screen while the guide runs.
- **Scene:** one designed state of the practice screen (people, fields, staged items, cards).
  Each guide step names its scene.
- **Origin:** the screen the user was on when the guide started. Most endings return there
  (BR-TG20).
- **Offer:** the once-only "Want a quick guide?" dialog for a tab.
- **Visit:** one arrival on a screen. A visit to Expenses starts when a real session's Expenses
  tab comes on screen. A visit to Collection starts when Collection comes on screen. Each visit
  ends when the user goes to another screen or tab.
- **Prompt:** any one-time dialog: the welcome and the first-run tour, "You're all set!", What's
  new, "Already settled?", or a guide offer.

## 4. User stories and acceptance criteria

The guide outlines (steps E1 to E17 and C1 to C7) and the example data are in section 6.

### US-TG1: Start the Expenses guide from "?" (PR 1)

As someone logging a purchase, I want a "How this works" button on the Expenses tab, so that I
can see how every field works whenever I'm unsure.

- **AC-TG1.1** Given I'm on a real session's Expenses tab, then I see a "?" button without
  scrolling, on phone (375px) and desktop (1280px). It reads "Need help?" with a "?" icon after
  the text, as a small text link under the date. Its accessible name is "Need help? See how to log
  expenses" (amended in the owner feedback, round 1).
- **AC-TG1.2** Given I'm on Breakdown or Summary, then the "?" button isn't shown.
- **AC-TG1.3** Given nothing is staged and no saved item is open for editing, when I tap "?",
  then the practice screen replaces the session at once, with no prompt, and step E1 shows.
- **AC-TG1.4** Given 2 staged items, when I tap "?", then "Leave without saving?" opens with
  "You have 2 staged items that aren't saved.", Stay and Discard and leave.
  - When I tap Stay, then I'm still on my session's Expenses tab with both items staged, and no
    guide starts.
  - When I tap Discard and leave instead, then the staged items are dropped and the guide starts.
- **AC-TG1.5** Given I came from Breakdown's Edit with "Editing saved item: Taxi" showing, when I
  tap "?", then the prompt reads "Your changes to Taxi aren't saved." When I tap Discard and
  leave, then the edit ends with Taxi unchanged on Breakdown, and the guide starts.
- **AC-TG1.6** Given I've typed an item name but haven't pressed + Add Item, when I tap "?", then
  the guide starts with no prompt, and the typed fields are gone when I come back. This is what
  switching tabs does today.
- **AC-TG1.7** Given the first-run tour is running, then the "?" button isn't shown.

### US-TG2: Walk through the Expenses guide (PR 1)

As a non-technical user, I want each part of the form shown to me already filled in and explained
in plain words, so that I understand it without having to fill it in first.

- **AC-TG2.1** Given the guide has started, then steps E1 to E17, with E14a after E14, show in the order in
  section 6.1, each highlighting its target and showing its title and text.
- **AC-TG2.2** Given any step, then its target is filled as its scene describes. For example, at
  E10 Ben's block shows "Chicken inasal ₱120.00" and "Iced tea ₱40.00".
- **AC-TG2.3** Given any step from E2 on, then the tooltip offers Back, Skip and Next. E1 offers
  Skip and Next. E17's primary button reads "Done".
- **AC-TG2.4** Given a step, when I tap inside the highlighted element, then I can use it as in
  a real session: type a name, tick a member, tap Fill Remainder, Edit a staged item.
- **AC-TG2.5** Given step E14a, when I tap Fill Remainder, then Dino's first sub-item becomes
  ₱120.00 and the footer reads "Entered ₱860.00" with no highlighted "of".
- **AC-TG2.6** Given step E15, when I tap + Add Item, then the item appears in the staged list,
  and the form clears as it does in a real session.
- **AC-TG2.7** Given I typed something within a scene, when Next or Back stays in the same scene,
  then what I typed is still there. When Next or Back moves to a different scene, then that
  scene starts exactly as designed (BR-TG13).
- **AC-TG2.8** Given I removed something a later step in the same scene points at (for example,
  I removed the Senior discount row), when I reach that step, then the scene is put back as
  designed and the step shows (BR-TG14).
- **AC-TG2.9** Given I tap the dimmed area outside the highlight, then nothing happens.

### US-TG3: Practice is make-believe (PR 1)

As a user, I want the practice to be clearly separate from my real sessions, so that I can try
things without worrying about my group's numbers.

- **AC-TG3.1** (Removed, owner, 2026-11-18, section 12: there is no practice banner. The practice
  screens look like the real ones, and the step copy no longer says "practice, nothing is saved".)
- **AC-TG3.2** Given I run the Expenses guide, add a person, + Add Item and Save to Breakdown in
  practice, then the browser's network log shows no request to `/api/sessions` from the moment
  the guide starts to the moment it ends. In PR 2 the only request is the guide's seen mark to
  `/api/user`.
- **AC-TG3.3** Given I note my sessions (count, names, members, items and payments) before a
  guide, then after it ends they're identical. Home's order is unchanged, and no session named
  "Beach trip", "Movie night" or "Karaoke night" appears on Home, Collection or History.
- **AC-TG3.4** Given I picked "Ben" in Paid By on my real session before the guide, when the
  guide ends and I'm back on that session's Expenses, then Paid By still shows Ben. The
  practice's own picks never touch it.
- **AC-TG3.5** Given a real session id starts with `practice_`, then `/api/sessions` refuses the
  write with 400 (approved server guard). Ordinary ids are unaffected.
- **AC-TG3.6** Given my profile name is "Mara", then in the Collection guide I'm "Ana", and my
  real profile name is unchanged afterwards.

### US-TG4: Leave a guide and land somewhere sensible (PR 1)

As a user, I want every way out of a guide to put me back in my own app, so that I'm never stuck
in the practice.

- **AC-TG4.1** Given any step, when I tap Skip, then the practice closes and I'm back on the
  origin, scrolled to the top with focus on the "?" button if that's how I came in.
- **AC-TG4.2** Given any step, when I press Escape, then it ends as Skip does. The exception is
  when focus is in the Collection payment form's amount box: there Escape closes that form only,
  as it does today.
- **AC-TG4.3** Given E17 or C7, when I tap Done, then I'm back on the origin with no closing
  dialog (BR-TG24).
- **AC-TG4.4** Given the Expenses practice, when I activate "← Back to Home", then the guide ends
  and I land on Home (BR-TG21).
- **AC-TG4.5** (Removed, owner, 2026-11-18, section 12: there is no End practice button. Skip,
  Escape and Done are the ways out, and Back to Home in the Expenses practice.)
- **AC-TG4.6** Given the Expenses practice, when I tap the Breakdown or Summary tab, then nothing
  changes and the tooltip says "Tap Next to continue". The same goes for keyboard activation.
  Finish Session is never reachable in practice (BR-TG22).
- **AC-TG4.7** Given I reload the page mid-guide, then there's no "leave site?" prompt for the
  practice items, the app opens on Home as after any reload, the guide doesn't resume, and the
  practice data is gone.

### US-TG5: Profile → Tutorials (PR 1; "Tracking payments" in PR 2)

As a returning user, I want to find the tutorials again, so that I can refresh my memory or show
a friend.

- **AC-TG5.1** Given I open the account menu, then I see, in this order: Profile, Tutorials,
  Manage account, Sign out. Tutorials has its own hand-drawn icon.
- **AC-TG5.2** When I choose Tutorials, then a "Tutorials" dialog opens with one button per
  tutorial and a one-line description under each, plus Close:
  - App overview: "A one-minute tour of Hati's screens."
  - Logging expenses: "Adding people and purchases, including receipts with shared dishes and
    discounts."
  - Tracking payments (PR 2): "Recording who has paid you, and what you've paid."
- **AC-TG5.3** In PR 1, the dialog lists App overview and Logging expenses only.
- **AC-TG5.4** When I choose Logging expenses, then the dialog closes and the Expenses guide
  starts at E1 on the practice screen. The origin is the screen I was on.
- **AC-TG5.5** Given I'm on a session's Expenses tab with staged items or a saved-item edit open,
  when I choose any tutorial, then "Leave without saving?" opens first, as in AC-TG1.4 and
  AC-TG1.5.
- **AC-TG5.6** Given my profile failed to load, then Tutorials still opens and every tutorial
  still runs.
- **AC-TG5.7** Escape or Close shuts the dialog and starts nothing.

### US-TG6: Replay the App overview (PR 1)

As a user who skipped the first-run tour, I want to take it later, so that I'm not stuck with
the choice I made on day one.

- **AC-TG6.1** When I choose App overview, then the first-run tour runs from its first step on
  Home, exactly as for a new account, with no welcome dialog first.
- **AC-TG6.2** Given I finish it, then "You're all set!" shows with the Expenses offer (AC-TG6.5).
  Given I skip it, then I land on Home with no dialog.
- **AC-TG6.3** Replaying never changes whether my account counts as onboarded, never shows What's
  new, and never writes a guide's seen mark.
- **AC-TG6.4** The empty session the tour creates is removed afterwards if I didn't type into it,
  as with the dev Preview Tour today (owner decision 4).
- **AC-TG6.5** (owner feedback, round 3) Given I finish the tour, whether it's the first-run tour,
  an App overview replay or the dev Preview Tour, then "You're all set!" reads "Next, see how to
  log an expense with a practice group. Nothing you do there is saved." with Maybe later and Show
  me (primary).
  - When I tap Maybe later, or press Escape, then the dialog closes and I stay on Home.
  - When I tap Show me, then the dialog closes and the Expenses guide starts on the practice
    screen, with Home as its origin. When it ends (Skip, Escape, Done or Back to
    Home), I land on Home.
  - Given I skipped the tour or left it by navigating away, then no dialog and no guide follow.
  - The tour's empty draft is still removed, and the guide never shows it.
- **BR-TG28 (PR 2 rule, for the tech lead).** For a new account's first-run tour, Show me counts
  as starting the Expenses guide and Maybe later counts as declining the Expenses offer. Either
  way the Expenses guide flag is written once flags exist, so the reader isn't offered the guide
  again on their first Expenses visit. A replay or the dev Preview Tour writes no flag
  (AC-TG6.3).

### US-TG7: Walk through the Collection guide (PR 2)

As someone who's owed money, I want to see how Collection tracks payments with real-looking
cards, so that I can use it when my friends start paying me back.

- **AC-TG7.1** Given the guide has started, then the practice Collection shows "Movie night"
  under Needs setup (1), "Beach trip" under Outstanding (1) and "Settled (1)" collapsed. The
  strip reads Owed to you ₱1,480.00 and You owe ₱150.00, with "Not counting 1 session that needs
  setup".
- **AC-TG7.2** Steps C1 to C7 show in the order in section 6.2.
- **AC-TG7.3** Given C4, when I tap Record payment on Ben's line, type 500 and Save payment, then
  Ben's line reads "Paid ₱500.00 · ₱750.00 left" with "Partial", and the payment is listed with
  Undo.
- **AC-TG7.4** Given C5, when I tap Undo on Carla's ₱200.00 payment and confirm, then her line
  goes back to Unpaid. When I go on to C6, then Mark all as paid is still there.
- **AC-TG7.5** Given C6, when I tap Mark all as paid and confirm, then Beach trip moves to Settled
  and C7 still shows. (Amended for PR 2, section 12: the guide moves on to C7 by itself.)
- **AC-TG7.6** Given C2, when I open Movie night, pick "Anna" and Confirm, then it moves to
  Outstanding, showing that I owe Ben ₱500.00. Nothing is remembered on my real profile.
- **AC-TG7.7** "Already settled?" never appears in the practice, and neither does the profile
  banner ("Set your name").

### US-TG8: Start the Collection guide from "?" (PR 2)

As someone on Collection, I want a "How this works" button there too.

- **AC-TG8.1** Given I'm on Collection, with or without finished sessions, including the
  "Nothing to collect yet" empty state and "Couldn't load your profile", then a "?" button shows
  without scrolling. Its accessible name is "How Collection works". (Amended for PR 2, section 12:
  "Need help?", named "Need help? See how to track payments".)
- **AC-TG8.2** While Collection shows its "Loading…" spinner, the button isn't shown.
- **AC-TG8.3** When I tap it, then the Collection guide starts at C1. There's never a "Leave
  without saving?" prompt from Collection.
- **AC-TG8.4** Given I had typed an amount into a Record payment form, when I tap "?", then the
  form and its amount are gone when I come back, as leaving the tab does today.

### US-TG9: Offered the Expenses guide once (PR 2)

As a user who has never seen the Expenses guide, I want to be offered it once when I start
logging, so that I find out it exists without being nagged.

- **AC-TG9.1** Given my account has never started or declined the Expenses guide, and nothing
  else is showing, when I open a session's Expenses tab, then the "Learn how to log a purchase?"
  offer opens (copy in section 6.3), with "Not now" and "Show me".
- **AC-TG9.2** When I tap Show me, then the Expenses guide starts, and the origin is this
  session's Expenses tab.
- **AC-TG9.3** When I tap Not now, or press Escape, then the offer closes, and it never opens
  again for this account on any device after that device's next load.
- **AC-TG9.4** Given I started the Expenses guide in any way ("?", Tutorials, "Show me how", this
  offer), then this offer never opens again.
- **AC-TG9.5** Given I arrive on Expenses through Breakdown's Edit item, then the offer doesn't
  open on that visit.
- **AC-TG9.6** Given the first-run tour is running and it opens its own session's Expenses, then
  the offer doesn't open.
- **AC-TG9.7** Given another prompt opened during this visit to Expenses, then the offer doesn't
  open on this visit (BR-TG8).
- **AC-TG9.8** Given my account's flags couldn't be read, then no offer opens. "?" and Tutorials
  still work.

### US-TG10: Offered the Collection guide once (PR 2)

- **AC-TG10.1** Given my account has never started or declined the Collection guide, when I open
  Collection (from the tab, or by finishing a session) and nothing else is due, then the "Learn
  how to track payments?" offer opens once the page has loaded.
- **AC-TG10.2** Given "Already settled?" is due on this visit, then it opens and the guide offer
  doesn't. On my next visit to Collection, with "Already settled?" answered, the guide offer
  opens (BR-TG9).
- **AC-TG10.3** Given the offer is open, then "Already settled?" doesn't open over it.
- **AC-TG10.4** Show me, Not now and Escape behave as in AC-TG9.2 and AC-TG9.3, for the
  Collection guide. When the guide started from the offer ends, I'm back on Collection, and
  "Already settled?" may open then, if it's due.
- **AC-TG10.5** Given Collection is empty ("Nothing to collect yet"), then the offer still opens
  on the first visit.

### US-TG11: What's new v2 with "Show me how" (PR 2)

As a returning user, I want to hear about the Custom Amounts changes and get straight into a
guide, so that I learn them in context.

- **AC-TG11.1** Given an onboarded account that hasn't seen version 2, when the app opens, then
  "What's new in Hati" opens with the version 2 text (section 6.3) and the buttons "Got it" and
  "Show me how". "Take me to Collection" is gone.
- **AC-TG11.2** When I tap Show me how, then What's new is marked seen and the Expenses guide
  starts. The origin is the screen What's new opened over, usually Home.
- **AC-TG11.3** Given I tapped Show me how, then the Expenses offer never opens afterwards
  (AC-TG9.4).
- **AC-TG11.4** When I tap Got it or press Escape, then What's new is marked seen, and the
  Expenses offer stays due for my next visit to Expenses.
- **AC-TG11.5** Given an account that saw version 1, then it sees version 2 once. Given an
  account still on version 0, then it sees version 2 only, once.
- **AC-TG11.6** A new account never sees version 2: it gets the welcome and tour instead, as
  today.
- **AC-TG11.7** Given What's new is due while a guide is running, then it waits until the guide
  ends, and opens on the origin.

### US-TG12: Prompts in the right order (PR 2)

As a user, I want one prompt at a time, in a sensible order, so that a new release doesn't bury
me in dialogs.

- **AC-TG12.1** **New account.** Given I've just signed up, then I see the welcome, the
  first-run tour (or Skip tutorial), and "You're all set!" if I finished it. The first time I
  open a real session's Expenses tab afterwards, the Expenses offer opens. The first time I open
  Collection, the Collection offer opens. I never see What's new v2.
- **AC-TG12.2** **Existing account.** Given I onboarded before this release, then the first time
  the app opens I see What's new v2 on Home. After that, the Expenses offer opens on my next
  visit to Expenses (unless I chose Show me how), and the Collection offer on my first visit to
  Collection without "Already settled?" due.
- **AC-TG12.3** **Another device.** Given I declined the Expenses offer on my phone, when I open
  Hati on my laptop afterwards (a fresh load), then the offer doesn't open there.
- **AC-TG12.4** Given both offers were started or declined, then neither offer ever opens again.
  "?" and Tutorials still start the guides.

### US-TG13: Phone and desktop (PR 1 for Expenses, PR 2 for Collection)

- **AC-TG13.1** Every step is the same on phone and desktop: same order, same text, same target.
- **AC-TG13.2** At 375px and at 1280px, each step's tooltip is fully on screen, and the page
  scrolls so the highlighted element is in view. When the element is taller than the screen,
  its top is in view.
- **AC-TG13.3** At 375px, a practice screen doesn't make the page scroll sideways. (Amended,
  owner, 2026-11-18, section 12: there is no practice banner.)
- **AC-TG13.4** On desktop, the "?" buttons and the Tutorials item keep the
  existing layout: no element moves except to make room for the "?" button.

### US-TG14: Preview an offer while developing (PR 2, dev only)

- **AC-TG14.1** Given a development build, then Home shows a "Preview offer" control next to
  Preview Tour, which opens the Expenses or Collection offer.
- **AC-TG14.2** Neither declining nor accepting a previewed offer writes any mark.
- **AC-TG14.3** A production build has no Preview offer control.

## 5. Business rules

### Settled by the owner

- **BR-TG1** Two guides this round, Expenses and Collection. Breakdown and Summary are out of
  scope. The first-run tour stays as it is.
- **BR-TG2** A guide runs in a practice session pre-filled with example data, "watch, then try":
  each step shows a filled field and explains it, Next moves on, and the reader can tap and type.
- **BR-TG3** Nothing in practice is saved, and nothing reaches Neon `main`. Practice ids start
  with `practice_`, which `/api/sessions` refuses with 400.
- **BR-TG4** Four ways in: "?" on each tab, Profile → Tutorials, What's new v2's "Show me how"
  (Expenses only), and a once-only offer per tab.
- **BR-TG5** Each guide is offered at most once per account, across devices, through two
  server-side flags. Each guide's flag is written when the guide starts from any entry point, or
  when its offer is declined. The onboarding PUT with no body never sets them. Every guide stays
  replayable.
- **BR-TG6** "?" with staged items or an open saved-item edit shows the existing "Leave without
  saving?" prompt first.
- **BR-TG7** App overview reuses the dev preview path: it writes no onboarding mark and no guide
  mark, and its empty draft is created and removed as today.

### Prompt order

- **BR-TG8** **At most one guide offer per visit.** An offer opens only when all of these hold:
  - the account's flags have loaded, and that guide's flag is unset;
  - nothing else is open: no first-run welcome, tour or "You're all set!", What's new, "Already
    settled?", Profile, Tutorials, New Session naming or any other dialog;
  - no other prompt has opened during this visit;
  - on Expenses, the visit didn't start through Breakdown's Edit item;
  - on Collection, the page has loaded (no spinner) and "Already settled?" isn't due.

  If the flags arrive later in the same visit, the offer may open then, under the same rules.
  An offer that couldn't open waits for a later visit.
- **BR-TG9** **Priority,** highest first:
  1. the first-run welcome and tour, with "You're all set!";
  2. What's new;
  3. "Already settled?" (Collection only);
  4. the guide offer.

  "Already settled?" keeps today's rule: it may open as soon as What's new closes, in the same
  visit. A guide offer never does (BR-TG8).
- **BR-TG10** **During a guide,** no prompt opens: no What's new, no "Already settled?", no offer.
  A due one waits until the guide ends, and then follows BR-TG8 and BR-TG9 on the origin.
- **BR-TG11** **Show me how** marks What's new seen and starts the Expenses guide, which sets the
  Expenses flag (BR-TG5).
- **BR-TG12** **Other devices.** Flags are read when the app loads. A device that loaded before
  another device set a flag may still show that offer once, until it's reloaded. That's
  accepted (OQ-TG8). A failed flag write is silent: at worst, the offer shows once more on the
  next load.

### Scenes

- **BR-TG13** **A scene is a complete state:** the practice members, the Purchase Details fields,
  the item mode and its fields, and the staged list (or, on Collection, the practice sessions,
  their payments and which card or section is open). Entering a different scene, with Next or
  Back, starts it exactly as designed, and anything typed in the previous scene is gone. Staying
  in the same scene keeps what was typed.
- **BR-TG14** **A step always has its target.** If what the reader did removed a step's target
  (an unticked member, a removed row, a switch back to Equal Split, a card moved to another
  section), reaching that step resets its scene as designed first.
- **BR-TG15** **Scene boundaries.** The Expenses guide has 4 scenes (X1 to X4), and the
  Collection guide 2 (K1, K2), as listed in section 6. (Amended for PR 2, section 12: Collection
  has 3, K1 to K3.) A guide adds a scene only when a step
  needs a state the reader can't be expected to create with Next alone.
- **BR-TG16** **Dates in practice are relative to today,** so the practice never looks stale:
  - the Expenses purchase date is today;
  - Beach trip finished 3 days ago, and Carla's payment was recorded 2 days ago;
  - Movie night finished 10 days ago;
  - Karaoke night finished 21 days ago and was settled 14 days ago.
- **BR-TG17** **Practice money follows the real rules.** Everything the reader does in practice
  (Fill Remainder, rounding, shares, payments, Mark all) gives the same results as in a real
  session. The practice seeds are checked by the same validators as real input (approved static
  tests).

### Practice behaviour

- **BR-TG18** **The practice screen replaces the real one.** The real workspace or Collection is
  unmounted while a guide runs. Ending the guide puts the real screen back as a fresh visit:
  staged items and typed fields that were discarded stay gone.
- **BR-TG19** **Practice has fixed identities.** On Collection the practice "you" is Ana. The
  practice never reads or changes the real profile name, nicknames, Paid By picks, "recently
  opened" order or the "Already settled?" answer.
- **BR-TG20** **Where a guide ends.** Skip, Escape and Done return to the origin.
  The origin is:

  | Started from | Origin |
  |---|---|
  | "?" on Expenses | that session's Expenses tab |
  | "?" on Collection | Collection |
  | Tutorials | the screen the account menu was opened on |
  | Show me how | the screen What's new opened over |
  | An offer | the tab the offer opened on |

  If the origin's session no longer exists (deleted on another device meanwhile), the reader
  lands on Home.
- **BR-TG21** **Back to Home in practice** ends the guide and goes to Home, as the label says.
- **BR-TG22** **Tabs in practice.** In the Expenses practice, the session tabs are shown but only
  Expenses works. Breakdown and Summary do nothing, apart from the "Tap Next to continue" nudge,
  so Finish Session can't be reached. The practice screens show no Home / Collection / History
  bar and no + New Session.
- **BR-TG23** (Removed, owner, 2026-11-18, section 12.) There is no practice banner and no End
  practice button. A guide ends with Skip or Escape on any step, Done on the last, or Back to Home
  in the Expenses practice. The practice workspace shows no rename pencil.
- **BR-TG24** **No closing dialog.** A guide ends on its last step's Done. The last step's text
  says the reader is going back to their own sessions. The first-run tour keeps
  "You're all set!".
- **BR-TG25** **Real save failures during practice.** `SyncBanner` isn't shown while a guide
  runs, because practice actions can't fail and a real failure would read as a practice one. A
  real failure that happened meanwhile (a save or payment started before "?") shows as soon as
  the guide ends. The browser's existing warning about real changes still being saved still
  applies to a reload during practice.
- **BR-TG26** **Starting a guide while a guide runs** (for example, Tutorials reached by
  keyboard) ends the current one, with no mark changes beyond BR-TG5, and starts the chosen one
  with the original origin.
- **BR-TG27** **"?" and Tutorials during the first-run tour.** "?" is hidden while the tour runs,
  and Tutorials can't be reached under its overlay. If it's reached anyway, choosing a tutorial
  ends the tour as Skip does (marking it seen, as Skip does today) and starts the chosen one.

## 6. Guide outlines and example data

Plain-language copy for the owner to approve. "Target" names the element. The `data-tour`
values in brackets are proposals, and the tech lead fixes the final ones. A target on a repeated
row or card goes on exactly one instance or on its container (approved rule).

### 6.0 The made-up people and places

- **People:** Ana, Ben, Carla, Dino. Alphabetical, so the order in pickers and blocks matches the
  copy. All names are invented.
- **On Collection** the reader is "Ana". "Anna" is the spelling a friend used in Movie night.
- **Sessions:** Beach trip (the Expenses practice, and Outstanding on Collection), Movie night
  (Needs setup), Karaoke night (Settled).

### 6.1 The Expenses guide ("Logging expenses"), 18 steps (E1 to E17, plus E14a)

**Scenes:**

- **X1, Groceries with one payor:**
  - Members: Ana, Ben, Carla, Dino. Date: today.
  - Paid By: One Payor, Ana.
  - Equal Split: Item Name "Groceries", Total Price 1,200.00, owners Ana, Ben and Carla
    (₱400.00 each).
  - Nothing staged.
- **X2, Groceries with two payors:** X1 with Paid By set to Multiple Payors, Ana 700.00 and Ben
  500.00. It shows "Contributed ₱1,200.00".
- **X3, Dinner with Custom Amounts:**
  - Members: Ana, Ben, Carla, Dino. Date: today. One Payor: Ana. Custom Amounts.
  - Item Name: "Dinner at the grill". Total Amount: 860.00. Who's in this item: All Members.
  - Sub-items:
    - Ana: Pork BBQ 180.00.
    - Ben: Chicken inasal 120.00, Iced tea 40.00.
    - Carla: Pancit 150.00.
    - Dino: one blank sub-item.
  - Shared items: Rice platter 200.00, Everyone.
  - Discounts: Senior discount 30.00, Dino.
  - Charges: Service charge 80.00.
  - Shares beside the names: Ana ₱250.00, Ben ₱230.00, Carla ₱220.00, Dino ₱40.00.
  - Footer: Subtotal ₱690.00, Discounts −₱30.00, Charges ₱80.00, then "Entered ₱740.00" highlighted
    with "of ₱860.00".
  - Fill Remainder would give Dino ₱120.00. His share would then be ₱160.00, and Entered
    ₱860.00.
  - Nothing staged.
- **X4, two items staged:**
  - The form is empty: Equal Split, One Payor Ana, today.
  - The staged list holds two items:
    1. Groceries as in X2.
    2. Dinner at the grill as in X3, with Dino's sub-item filled at 120.00, paid by Ana.
  - The list reads "2 items staged ₱2,060.00".

| # | Scene | Target | Title | Text |
|---|---|---|---|---|
| E1 | X1 | Group Members card [`group-members`] | Who's sharing? | Start by adding everyone who's sharing the costs. Type a name and tap + Add. Tap × on a name to remove it. |
| E2 | X1 | Date [`purchase-date`] | When was it? | Pick the day of the purchase. It starts on today. |
| E3 | X1 | Paid By [`paid-by`] | Who paid? | Choose who paid at the counter. Here, Ana paid. |
| E4 | X2 | Paid By [`paid-by`] | More than one payer? | If several people paid, switch to Multiple Payors and type what each one put in. Ana paid ₱700 and Ben ₱500. Together they have to match the price. |
| E5 | X2 | Item Name and Total Price row [`item-name`] | What was bought? | Give it a name you'll recognise later, and type the total price. |
| E6 | X2 | Equal Split owners [`equal-owners`] | Split it evenly | Equal Split shares the price evenly between the people ticked. Dino wasn't in on the groceries, so Ana, Ben and Carla pay ₱400 each. All Members ticks everyone at once. |
| E7 | X3 | Item split mode toggle [`item-mode`] | Different orders? | When people had different things, like at a restaurant, switch to Custom Amounts and type the receipt as it's printed. |
| E8 | X3 | Total Amount [`custom-total`] | The receipt total | Type the total at the bottom of the receipt. Hati uses it to check that nothing's missing. |
| E9 | X3 | Who's in this item [`who-in-item`] | Who's at the table? | Tick everyone in this item. Each person gets their own box below. |
| E10 | X3 | Ben's block [`sub-items`] | What each person had | Type what each person ordered and its price. Ben had two things, so he used + Add sub-item for the second. The amount beside each name is what that person pays. |
| E11 | X3 | Shared items [`shared-items`] | Shared dishes | A dish people shared goes here. Hati splits it between the people ticked. Everyone shared the rice platter. |
| E12 | X3 | Discounts [`discounts`] | Discounts | A discount, like PWD or senior, comes off only the share of the people ticked. Dino gets the senior discount. |
| E13 | X3 | Charges [`charges`] | Charges | A service charge or delivery fee goes here. It's split equally across everyone in the item. |
| E14 | X3 | Footer, Subtotal to Entered [`custom-figures`] | Does it add up? | Entered is what you've typed so far. It's highlighted, with "of" and the receipt total, until the two match. Dino's order is still blank, so ₱120 is missing. |
| E14a | X3 | Total Amount and Fill Remainder [`custom-total`] | Fill in what's missing | Tap Fill Remainder and Hati gives the missing ₱120 to whoever is still blank, here Dino. Entered then matches the receipt. |
| E15 | X3 | + Add Item [`add-item`] | Add it to the list | When the item looks right, tap + Add Item. It waits in the list below, so you can add several before saving. |
| E16 | X4 | Staged list [`staged-list`] | Check before saving | Everything you've added waits here. Tap the pencil to load an item back into the form and change it, or × to take it out. |
| E17 | X4 | Save to Breakdown [`save-to-breakdown`] | Save it | Tap Save to Breakdown to save everything in the list to the session. That's it: tap Done to go back to your own session. |

**Order check against the brief:**

| Topic | Steps |
|---|---|
| 1. Adding people | E1 |
| 2. Date | E2 |
| 3. Paid By, one payor and several | E3, E4 |
| 4. Naming an item | E5 |
| 5. Equal Split and who's in it | E6 |
| 6. Custom Amounts: total, who's in it, sub-items, shared items, discounts and charges, the remainder line | E7 to E14 |
| 7. + Add Item into the staged list, editing and removing a staged item | E15, E16 |
| 8. Save to Breakdown | E17 |

Fill Remainder sits beside Total Amount, far from the footer on a phone. (Done, QA round: E14a
is in the table above, with target `custom-total`. The note below is the original suggestion.)
If the owner wants it highlighted, add a step E14a on Fill Remainder [`fill-remainder`] in X3, making 18 steps
(OQ-TG5).

### 6.2 The Collection guide ("Tracking payments"), 7 steps

**Practice sessions** (all finished, with `finishedWithCollection` set, so none offers
"Already settled"):

- **Beach trip** (Outstanding). Members: Ana, Ben, Carla, Dino. The reader is Ana.
  - The settlement lines should come out as:
    - Ben owes Ana ₱1,250.00, unpaid;
    - Carla owes Ana ₱430.00, with ₱200.00 paid 2 days ago (Partial);
    - Ana owes Dino ₱150.00, unpaid.
  - One set of purchases that gives these lines (the tech lead may use another that gives the
    same lines):
    - Cottage rental ₱4,000.00 paid by Ana, Equal Split among all four;
    - Fuel ₱500.00 paid by Ana, Equal Split among Ana and Ben;
    - Groceries ₱1,140.00 paid by Carla, Equal Split among Ana and Carla;
    - Island hopping boat ₱2,300.00 paid by Dino, Equal Split among Ana and Dino.
- **Movie night** (Needs setup). Members: Anna, Ben, Carla. No "me" is set, and no member
  matches "Ana".
  - Movie tickets and popcorn ₱1,500.00, paid by Ben, Equal Split among all three. Anna and
    Carla each owe Ben ₱500.00.
- **Karaoke night** (Settled). Members: Ana, Ben.
  - Karaoke room ₱1,200.00, paid by Ana, Equal Split. Ben owes Ana ₱600.00, paid in full.

**Expected strip:** Owed to you ₱1,480.00, You owe ₱150.00, "Not counting 1 session that needs
setup".

**Scenes:**

- **K1, overview:** every card collapsed, Settled closed.
- **K2, Beach trip open:** K1 with the Beach trip card expanded.

(Amended for PR 2, section 12: a third scene K3, C3 in K1, C7 in K3, and the final targets.)

| # | Scene | Target | Title | Text |
|---|---|---|---|---|
| C1 | K1 | Summary strip [`collection-totals`] | Who owes what | Collection tracks money from finished sessions only. A session lands here when you finish it on its Summary tab. In this practice you're Ana. Owed to you is what others still have to pay you; You owe is what you still have to pay them. |
| C2 | K1 | Needs setup section [`collection-needs-setup`] | Which one is you? | Hati finds you by the name in your Profile. In Movie night your name was spelled "Anna", so Hati asks. Open the card, pick your name and confirm, and it moves to the right section. |
| C3 | K2 | Beach trip card [`collection-card`] | Money still to collect | Outstanding sessions still have money to collect or pay. Tap a card to open it. Each line is one person: what they owe, what's been paid and what's left. |
| C4 | K2 | Record payment on Ben's line [`record-payment`] | Record a payment | When Ben pays you, tap Record payment. It fills in the full amount, so change it if he paid only part. Mark fully paid records the whole amount in one tap. For money you owe, the button says I paid. |
| C5 | K2 | Carla's payment list [`payment-history`] | Fix a mistake | Each payment is listed with Undo, in case one was recorded by mistake. Try it on Carla's ₱200: her line goes back to Unpaid. |
| C6 | K2 | Mark all as paid [`mark-all`] | Everyone paid at once? | Mark all as paid records what's left on every line in this session. Hati asks you to confirm first, and each payment can still be undone. |
| C7 | K2 | Settled toggle [`settled-toggle`] | All done | When every line is paid, the session moves to Settled. Tap here to see them. That's it: tap Done to go back to your own Collection. |

**Coverage:**

| Topic | Steps |
|---|---|
| Finished sessions only | C1 |
| Needs setup, Outstanding, Settled | C2, C3, C7 |
| Owed to you against You owe | C1, C4 |
| Opening a card | C3 |
| A full or part payment | C4 |
| Undoing a payment | C5 |
| Mark all as paid | C6 |
| The Settled section | C7 |

The architect left one choice to the tech lead: point C4 at the button, or open the form with a
`LineRow` `initialOpen` prop. From the business side, pointing at the button is enough, because
the reader can tap it to see the form.

### 6.3 Dialog copy

(Amended for PR 2, section 12: "?" reads "Need help?" in the offers and What's new.)

**Expenses offer:**

- Title: "Learn how to log a purchase?"
- Message: "A quick practice run, about two minutes, with made-up people. Nothing you do in it is
  saved. You can find it any time under ? on this tab, or Tutorials in your account menu."
- Buttons: "Not now" (ghost), "Show me" (primary). Escape is "Not now".

**Collection offer:**

- Title: "Learn how to track payments?"
- Message: "A quick practice run with made-up sessions: who owes you, recording payments, and
  undoing one. Nothing you do in it is saved. You can find it any time under ? on this page, or
  Tutorials in your account menu."
- Buttons: "Not now", "Show me".

**What's new, version 2:**

- Title: "What's new in Hati" (unchanged).
- Points:
  - **Receipts, item by item.** In Custom Amounts, type a receipt the way it's printed: what
    each person had, dishes people shared, discounts like PWD or senior, and service charges.
    Hati works out each person's share.
  - **Guides.** Tap ? on Expenses or Collection for a quick practice run, or open Tutorials in
    your account menu.
- Buttons: "Got it" (ghost), "Show me how" (primary).

**Tutorials dialog:** as in AC-TG5.2, with the title "Tutorials" and a Close button.

**Practice banner:** none (owner, 2026-11-18, section 12).

## 7. Edge cases

| Case | What happens | Rule |
|---|---|---|
| What's new, an offer and "Already settled?" all due on Collection | What's new opens first. "Already settled?" opens when What's new closes. The Collection offer waits for a later visit with neither due. | BR-TG8, BR-TG9 |
| What's new and the Expenses offer due on the same visit (What's new loaded late) | What's new only. Show me how starts the guide and sets the flag. Got it leaves the offer for the next visit. | BR-TG8, BR-TG11 |
| An offer due while the first-run tour runs in its own session | No offer. It's due on the first real visit after the tour. | BR-TG8 |
| "?" with staged items | "Leave without saving?". Stay starts nothing. Discard and leave starts the guide. | BR-TG6 |
| "?" with a saved-item edit open | The same prompt, with "Your changes to X aren't saved." | BR-TG6 |
| "?" with typed but unadded fields | No prompt. The fields are gone on return, as with a tab switch today. | BR-TG18 |
| Tutorials chosen from a session with staged items | The same prompt first. | AC-TG5.5 |
| Skip, Escape, Done | The guide ends and the reader returns to the origin. | BR-TG20 |
| Back to Home in practice | The guide ends and the reader lands on Home. | BR-TG21 |
| Breakdown or Summary tapped in practice | The nudge only. No navigation, no Finish Session. | BR-TG22 |
| Escape in a Collection payment amount box | Closes that form only. | AC-TG4.2 |
| Escape in a practice confirm dialog (Mark all, Undo, Remove member) | Closes that dialog only, as today. | Existing dialogs |
| Reload mid-guide | Lands on Home. Practice gone, guide not resumed, flag already written, no practice reload prompt. | AC-TG4.7, BR-TG25 |
| Sign-out in another tab mid-guide | Signed-out screen, as today. Practice gone. | None |
| Real save failure before or during practice | Not shown in practice. Shown on return. | BR-TG25 |
| A real payment in flight when "?" is tapped on Collection | It finishes in the background. If refused, the sync banner shows on return, and the typed amount is lost, as with a tab switch today. | BR-TG25 |
| The origin session is deleted on another device during practice | The reader lands on Home. | BR-TG20 |
| The reader removes every practice member (Clear All) | Allowed. The next step in that scene resets it, and a new scene starts fresh anyway. | BR-TG13, BR-TG14 |
| The reader types a very long member name in practice | Same limits and wrapping as a real session. | BR-TG17 |
| The reader saves to Breakdown in practice | "Saved." shows. Nothing is sent. The guide carries on. | BR-TG3 |
| The reader marks Beach trip all paid at C6 | It moves to Settled, and C7 still has its target. | AC-TG7.5 |
| The reader undoes Carla's payment, then goes Back to C5 | Same scene: the list is gone, so the scene resets and C5 shows. | BR-TG14 |
| A new account with no finished sessions opens Collection | The Collection offer opens. The guide shows the practice cards. | AC-TG10.5 |
| The account's flag read fails | No offers. "?" and Tutorials work. A flag write still happens on start. | AC-TG9.8 |
| The flag write fails | Silent. The offer may show once more on the next load. | BR-TG12 |
| Two devices open at once | Each device may offer once until it reloads. | BR-TG12, OQ-TG8 |
| PR 1 on uat, before the flags exist | "?" and Tutorials write nothing. After PR 2, each tester gets each offer once, even if they ran the guide in PR 1. | Section 9 |
| A one-member or many-member real session | No effect: practice data is fixed. | BR-TG19 |
| The real profile name is "Ana", or a real member is called Ana | No effect: practice never reads real data. | BR-TG19 |

## 8. Recommendations on the open UX points

The architect's "For the business-analyst to settle" list, answered:

| Point | Recommendation | Rule |
|---|---|---|
| "Already settled?" against the Collection offer | "Already settled?" first. It changes what the user's real Collection shows, and the practice can't show it anyway. The offer waits for a later visit. | BR-TG9 |
| What's new and an offer at once | What's new first. The offer never follows another prompt in the same visit. | BR-TG8 |
| Practice marker banner | None (owner, 2026-11-18). Escape is the exit if a step fails to show. | BR-TG23 |
| What ends a guide, and where it returns | Skip, Escape and Done return to the origin. Back to Home goes Home. Tabs are inert. | BR-TG20 to BR-TG22 |
| A closing dialog | None. The last step says where the reader is going, and Done takes them there. | BR-TG24 |
| `SyncBanner` in practice | Hidden. Real failures show on return. | BR-TG25 |
| Scene boundaries and reset | 4 Expenses scenes and 2 Collection scenes. A new scene starts fresh, and a step whose target is gone resets its scene. | BR-TG13 to BR-TG15 |
| Example data and copy | Section 6, for the owner to approve. | Section 6 |
| Where Tutorials lives | A separate Tutorials item in the account menu, right under Profile, opening a small Tutorials dialog. `ProfileDialog` is a form with Save and Cancel that waits for the profile to load. A launcher inside it would be hidden whenever the profile fails to load, and would mix two jobs in one dialog. Sitting next to Profile in the same menu keeps the owner's "Profile → Tutorials" wording true. | AC-TG5.1 |
| Tabs and Finish Session in practice | The tabs are shown but only Expenses works, so Finish Session can't be reached. | BR-TG22 |

Other recommendations:

1. **Where "?" goes.**
   - **On Expenses:** at the right end of the workspace bar (the row with ← Back to Home and the
     session name), shown only while the Expenses tab is active. It's visible on arrival on both
     widths, and it's clear that the guide covers the whole tab, Group Members included.
   - **On Collection:** at the right of the page's first heading row.
   - **Size and label:** a round "?" icon button, at least 44px on a phone. On desktop it
     carries the visible text "How this works"; on a phone it's icon-only. Placement is for the
     owner to confirm (OQ-TG2).
2. **Focus when a guide ends.** It returns to the "?" button when the guide started from there.
   Otherwise it goes to the top of the origin screen.
3. **Guide length.** 18 Expenses steps (E1 to E17, plus E14a) cover the eight required topics at one idea per step. The
   candidates to cut, if the owner wants it shorter, are:
   - merging E2 (Date) into E3 (Paid By), as "When and who paid";
   - merging E12 and E13 into "Discounts and charges".

   Cutting both gives 15 steps.
4. **What's new v2 for accounts that missed v1.** Don't repeat the Collection announcement in v2.
   Those accounts get the Collection offer on their first visit, which explains Collection
   better than a line of text.
5. **The CLAUDE.md tour rule** is already approved (owner answer 7) and ships in PR 1. These
   requirements follow it. Every guide step names its scene, and every target is supplied by
   that scene's seed.

## 9. Scope

**In, PR 1:**

- The practice session (memory store, practice profile, `practice_` ids, the server guard) and
  the practice banner.
- The shared guide engine and the Expenses guide (E1 to E17 plus E14a, scenes X1 to X4).
- "?" on Expenses, with the "Leave without saving?" prompt.
- Profile → Tutorials, with App overview and Logging expenses (Tracking payments may arrive with
  PR 2).
- The App overview replay.
- The tour-rule update in CLAUDE.md and the memory note.
- US-TG1 to US-TG6, and US-TG13 for Expenses.

**In, PR 2:**

- The Collection guide (C1 to C7, scenes K1 and K2) and "?" on Collection.
- The two flags and the once-only offers, with the prompt order.
- The Tracking payments item in Tutorials.
- What's new v2 with Show me how.
- The dev-only Preview offer.
- US-TG7 to US-TG12 and US-TG14, and US-TG13 for Collection.

**Out:**

- Guides for Breakdown and Summary, and anything in practice beyond the Expenses tab and
  Collection.
- Changing the first-run tour's steps or copy.
- Resuming a guide after a reload.
- Progress saved partway through a guide.
- Analytics on guide use.
- Any change to how money is calculated.

Deliberately absent features stay absent: no in-app calculator, sharing, currency choice or
offline use.

## 10. Open questions for the owner

1. **OQ-TG1: Tutorials location.** A separate Tutorials item in the account menu, under Profile,
   opening a small dialog (recommended), or a Tutorials section inside the Profile dialog?
2. **OQ-TG2: "?" placement and label.**
   - **Recommended:** at the right end of the session bar on Expenses (only while Expenses is
     active), and beside Collection's first heading.
   - **Look:** a round "?" icon, with "How this works" beside it on desktop and icon-only on a
     phone.
   - **Alternative for Expenses:** the Purchase Details card's header. It's nearer the form, but
     it suggests the guide only covers that card.
3. **OQ-TG3: Prompt order.**
   - At most one guide offer per visit, and never right after another prompt on the same visit.
   - "Already settled?" goes before the Collection offer, which waits for the next visit.

   Recommended as written in BR-TG8 and BR-TG9. The alternative chains the offer straight after
   "Already settled?" or What's new: one fewer visit, but two dialogs back to back.
4. **OQ-TG4: The "remainder line".** There's no line labelled "Remainder" today. Is it right to
   read it as the footer's "Entered ₱X of ₱Y" together with Fill Remainder, as step E14 does?
5. **OQ-TG5: Fill Remainder step.** E14 explains Fill Remainder but points at the footer. Should
   Fill Remainder get its own highlighted step (E14a, 18 steps), so the reader can tap it at E14
   and watch Dino's share fill? Recommended: no, to keep the guide short. The reader can still
   scroll up and tap it. Separately, would you like the guide shortened to 15 steps (section 8,
   point 3)?
6. **OQ-TG6: Back to Home in practice.** It goes Home, as its label says (recommended). The
   alternative returns to where the guide started, like every other way out.
7. **OQ-TG7: No closing dialog after a guide.** Done on the last step simply returns
   (recommended). The alternative is a short "You're ready" dialog, like the first-run tour's
   "You're all set!".
8. **OQ-TG8: Two devices at once.** A device that already had Hati open may show an offer once,
   even though it was just declined on another device, until it's reloaded. Is that acceptable
   (recommended), or should the app re-check the flag on the server just before each offer?
9. **OQ-TG9: Copy approval.** Please approve or edit:
   - the step texts in section 6.1 (E1 to E17) and 6.2 (C1 to C7);
   - the offers, What's new v2 and the Tutorials descriptions (section 6.3);
   - the example people (Ana, Ben, Carla, Dino, plus "Anna") and sessions (Beach trip, Movie
     night, Karaoke night).

## 11. Decisions on the open questions (2026-11-16)

The owner delegated these decisions overnight ("I'll leave things to decide to
you"). The coordinating session made them, choosing the recommended option
each time. The owner reviews them at the owner check, and any of them can be
reversed then.

- **OQ-TG1, Tutorials.** A separate **Tutorials** item in the account menu,
  under Profile, that opens a small dialog.
- **OQ-TG2, "?" placement.** As recommended:
  - Expenses: at the right end of the session bar, shown only while Expenses
    is active.
  - Collection: beside the page's first heading.
  - A round "?" icon, with "How this works" beside it on desktop and icon-only
    on a phone (with an `aria-label`).
- **OQ-TG3, prompt order.** At most one guide offer per visit, never straight
  after another prompt in the same visit. "Already settled?" comes first, and
  the Collection offer waits for the next visit.
- **OQ-TG4, remainder line.** Yes: the footer's "Entered ₱X of ₱Y" together
  with Fill Remainder.
- **OQ-TG5, guide length.** ~~Keep 17 steps. Fill Remainder doesn't get its own
  step, and no steps are merged.~~ **Reversed (QA round, 2026-11-17).** At E14 the Fill Remainder
  button sat outside the footer's spotlight, so a tap on it was swallowed (AC-TG2.5 failed).
  Fill Remainder now has its own step, E14a, on the Total Amount row, making 18 steps.
- **OQ-TG6, Back to Home in practice.** It goes Home, as its label says.
- **OQ-TG7, closing dialog.** None. Done on the last step returns to where the
  guide started.
- **OQ-TG8, two devices.** Accepted: a device already open may show an offer
  once more until it reloads.
- **OQ-TG9, copy.** Steps E1–E17 and C1–C7, the dialog and banner copy, and the
  example people (Ana, Ben, Carla, Dino) and sessions are **provisionally
  approved** for the build. The owner reviews the exact wording at the owner
  check, and changes are expected to be copy-only.

## 12. Amendments for PR 2 (tech lead, 2026-11-17)

Made in the PR 2 spec ([`tab-guides-2.md`](tab-guides-2.md)), for the owner to approve with it.
Copy in sections 6.2 and 6.3 is otherwise unchanged.

- **Collection scenes (BR-TG15, section 6.2).** Three scenes:
  - K1, the overview: every card collapsed;
  - K2: Beach trip open;
  - K3: Beach trip paid in full and moved to Settled, which is what Mark all at C6 produces.
- **Steps and targets (section 6.2).**

  | Step | Scene | Target |
  |---|---|---|
  | C1 | K1 | `collection-totals`, the Summary section |
  | C2 | K1 | `collection-unsettled`, the Needs setup and Outstanding sections together, so the confirmed card stays in the spotlight as it moves |
  | C3 | K1 | `collection-outstanding`, the Outstanding list, collapsed, so "Tap a card to open it" opens it |
  | C4, C5 | K2 | `collection-owed`, the open card's "Owed to you" group: Record payment, the form it opens and Undo are all inside |
  | C6 | K2 | `collection-mark-all` |
  | C7 | K3 | `collection-settled`, the Settled section |

  C4 points at neither the Record payment button alone nor a `LineRow initialOpen` form.
- **AC-TG7.5.** Given C6, when I tap Mark all as paid and confirm, then Beach trip moves to
  Settled and the guide moves on to C7 by itself. Back from C7 shows C6 with Beach trip open
  again.
- **AC-TG8.1.** The control is the "Need help?" text link, as on Expenses, beside the Summary
  heading, or alone at the right above the empty state and "Couldn't load your profile". Its
  accessible name is "Need help? See how to track payments".
- **Section 6.3.** The offers say 'under “Need help?” on this tab' (Expenses) and 'on this page'
  (Collection). What's new v2's second point says 'Tap “Need help?” on Expenses or Collection'.
- **BR-TG23 and AC-TG13.3 (owner, 2026-11-17).** The practice banner is sticky at the top while
  the reader scrolls, above the guide's overlay, with the tooltip on top where they overlap. Each
  step scrolls its target clear of it. The practice workspace shows no rename pencil.
- **Step C5 copy (QA, 2026-11-18).** "Carla has paid ₱200 of ₱430, so her line says Partial" goes
  stale the moment the reader undoes her payment, and the step invites exactly that. The text is now
  "Each payment is listed with Undo, in case one was recorded by mistake. Try it on Carla's ₱200: her
  line goes back to Unpaid." (section 6.2's C5 row carries it.)
- **Owner feedback (2026-11-18): no practice banner, no preamble.** The practice banner and its End
  practice button are gone from both guides, which removes AC-TG3.1, AC-TG4.5, BR-TG23, and the
  banner in AC-TG13.3, AC-TG13.4 and section 6.3. The ways out are Skip and Escape on every step,
  Done on the last, and Back to Home in the Expenses practice (BR-TG20, BR-TG21). The first step
  of each guide drops its opening sentence ("This is a practice with made-up people, so tap and
  type freely: nothing here is saved." for E1, the same for sessions in C1). The dialogs' "Nothing
  you do there is saved" is unchanged.
