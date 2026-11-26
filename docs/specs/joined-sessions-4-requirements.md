# Requirements: Collection holds what's active, History holds what's done (joined sessions, Part B)

Author: business-analyst, 2026-11-21. Read against `joined-sessions-2` (bd7af70, PR 1 + 2) and `joined-sessions-3` (PR 1 + 3). Nothing in the repo or the database was touched.

**Inputs, taken as fixed:**
- The owner's round 5 brief, Part B: `/Users/rmlescano/.claude/plans/cached-waddling-wigderson.md`. Its decisions are called B-1 to B-7 below:
  - B-1: Collection shows Needs setup and Outstanding only; Settled goes.
  - B-2: History shows settled sessions only.
  - B-3: a card leaves a viewer's Collection, and enters their History, when the viewer's own lines are all paid and nothing waits on them.
  - B-4: the link expires, and joining stops, only when every line in the session is paid.
  - B-5: History detail lists payments with Undo under today's rules; an undo brings the session back to Collection, and sharing works again.
  - B-6: Outstanding cards gain View details and Download SOA.
  - B-7: the Collection guide's last step is rewritten.
- Part A of the same brief, which is already decided: Share with members shows only on Outstanding organizer cards, and on History detail for a session that isn't fully paid.
- The joined-sessions requirements and specs: `docs/specs/joined-sessions-requirements.md` (BR-J, BR-V, BR-O, BR-C, BR-Q rules and the owner's answers Q1 to Q4), `joined-sessions.md`, `joined-sessions-2.md` and `joined-sessions-3.md`.
- Today's code on `-2`: `src/lib/collection.ts` (`buildCard`, `buildCollection`, `autoOpenTarget`), `src/pages/CollectionPage.tsx`, `HistoryPage.tsx`, `HistoryDetailPage.tsx`, `src/components/collection/CollectionCard.tsx` and `LineRow.tsx`, `src/components/onboarding/steps.ts`, `guides/collectionSteps.ts`, `guides/collectionScenes.ts` and `PracticeCollection.tsx`.

New rule ids: BR-H (where a session lives), BR-D (History detail), BR-A (arrivals and moves), BR-L (link expiry), BR-G (onboarding). The copy conventions are those of the joined-sessions requirements: `{title}` is `sessionDisplayTitle`, amounts use `formatCents`, and dates use `formatLocalDate`.

---

## 1. What today's code does, and what changes

| Today (on `-2`) | Under Part B |
|---|---|
| `buildCard` gives each finished session a bucket: `needsSetup`, `outstanding` or `settled`. A `settled` card is one where the viewer's own lines are all paid and no claim waits on the viewer (BR-V3, BR-C15). For an organizer, every pair being paid also counts as settled. | The bucket rule stays exactly as it is. `settled` now means "in History", and the other two mean "in Collection". So B-3 needs no new money rule: it is today's Settled bucket, moved to another tab. |
| Collection has a collapsed "Settled (N)" section (`data-tour="collection-settled"`). | It's removed (B-1). |
| History lists every `status === 'closed'` session, newest finished first, under "Closed Sessions". Drafts never show there; they're on Home. | History lists only the sessions whose card is `settled` for this viewer (B-2). Drafts still never show (checked: `HistoryPage` filters on `status === 'closed'`, and that stays). |
| History detail has the breakdown, Download SOA, and Share with members or Stop tracking. Payments, Undo, "Change" and "Undo “Already settled”" live only on Collection cards. | History detail gains the viewer's payments with Undo, "Change" for the organizer, and "Undo “Already settled”" (B-5, BR-D1 to BR-D8). |
| Delete is the bin on each History card, organizer only. Collection cards deliberately have no delete (AC-13.5). | The bin stays on History cards. Delete is added to the detail page, which View details reaches for Outstanding sessions (BR-H8). |
| Finish and a join land on Collection with the card open. | They land wherever the card is: Collection, or that session's History detail (BR-A1, BR-A2). |
| The strip counts Outstanding cards only (BR-14). | The figures are unchanged, because Settled cards never counted (BR-H6). |

**No schema change is needed.** Link expiry (B-4) is worked out from the session's records and payments whenever the link is asked for or used, so nothing new is stored (BR-L1). If the tech-lead finds otherwise, they stop and ask, as the brief says.

---

## 2. User stories and acceptance criteria

Examples use the owner's case. Renmar is the organizer and is on Hati. Jyllan joined. Kim isn't on Hati. Renmar's lines are all paid, and Jyllan still owes Kim ₱300.00.

### US-H1. Collection shows only what's active (B-1, B-3)
- AC-H1.1 Given Renmar's own lines are all paid and nothing waits on him, then the session isn't in Renmar's Collection, and there's no "Settled" heading or toggle anywhere on Collection.
- AC-H1.2 Given the same session, then it's in Jyllan's Collection under Outstanding, with her line to Kim at ₱300.00 left.
- AC-H1.3 Given a Needs setup card (an organizer who hasn't said who they are, with pairs still unpaid), then it's in Collection under Needs setup, as today.
- AC-H1.4 Given Collection has Needs setup cards but no Outstanding ones, then the page shows the heading "Outstanding (0)" and under it "Nothing outstanding. Sessions that are paid in full are in History."
- AC-H1.5 Given Collection has no cards and the account has no finished sessions at all (a brand-new account), then it shows today's empty state: "Nothing to collect yet" / "Finish a session and it will show up here."
- AC-H1.6 Given Collection has no cards but History has at least one, then it shows the empty state "All settled" / "Everything is paid. Settled sessions are in History."
- AC-H1.7 The strip, the profile banner and "Need help?" show by today's rules, counting Needs setup and Outstanding cards only: the strip and banner show when there's at least one such card, and "Need help?" always shows.

### US-H2. History shows only what's done (B-2)
- AC-H2.1 Given Renmar's card is settled for him, then the session is in Renmar's History, even though Jyllan still owes Kim.
- AC-H2.2 Given Jyllan's card is outstanding for her, then the session isn't in Jyllan's History.
- AC-H2.3 Given a session is outstanding for me, then it's never in my History, whatever its age.
- AC-H2.4 The list's heading is "Settled sessions" (it was "Closed Sessions").
- AC-H2.5 Given History has nothing, then it shows "Nothing settled yet" / "When a finished session is paid in full, it moves here from Collection." This applies to a brand-new account too.
- AC-H2.6 Given my profile is still loading, then History shows "Loading…" with the spinner, as Collection does. Given the profile failed to load, then it shows "Couldn't load your profile." and "Try again". Reason: whether a session is settled for me depends on which member I am, and that needs the profile (BR-H4).
- AC-H2.7 Drafts never appear in History. They stay on Home.

### US-H3. History cards are labelled and ordered (open item: ordering)
- AC-H3.1 Each History card keeps today's content (title, dates when named, total, members, purchase count, and "Shared by {organizer}" on a joined session) and adds one status line:
  - "Settled {date}" when I had lines, where the date is my last counted payment;
  - "Marked as already settled" for a session I marked "Already settled";
  - "You were even with everyone" when I'm a member with no lines;
  - "You weren't in this session" when I said so;
  - "Everyone's paid" when Hati never placed me and every pair is paid;
  - "Nothing to collect. Everyone's even." when the session has no pairs at all.
- AC-H3.2 Given I'm the organizer and some line between other members is still unpaid, then the card adds "Some members still owe each other". Reason: this tells the organizer why Share with members is still offered on its detail page (BR-L3).
- AC-H3.3 The list is ordered by most recently settled first. A card's settled date is my last counted payment, or the finish date when I had no payments (I had no lines, or I marked it "Already settled", Q3 precedent). Ties go by finish date, newest first, then by id.
- AC-H3.4 The bin shows on the organizer's cards, as today, and never on a joined card (BR-V9).

### US-H4. Outstanding cards gain View details and Download SOA (B-6)
- AC-H4.1 Given an Outstanding card I've opened, organizer or joined, then its body ends with a row holding "View details" and "↓ Download SOA". The row sits after Mark all as paid and Share with members, and is never inside the `collection-mark-all` element.
- AC-H4.2 When I tap "View details" (`aria-label` "View details of {title}"), then the session's detail screen opens (today's History detail screen), with the back button reading "← Collection".
- AC-H4.3 When I tap "← Collection", then I'm back on Collection with the same card open and scrolled into view.
- AC-H4.4 Given I'm the organizer, then "↓ Download SOA" exports with the invite link and QR, exactly as History detail does today (PR 3). That includes its "Downloaded without the invite QR, because the link couldn't be loaded. Download again to include it." fallback.
- AC-H4.5 Given I joined the session, then "↓ Download SOA" exports without the link or QR (BR-Q6).
- AC-H4.6 Needs setup cards get neither button (B-6 names Outstanding only; see Q2 for View details).
- AC-H4.7 Practice sessions in the Collection guide show neither button (BR-G5).

### US-H5. The detail page for a session in my History lists my payments, with Undo (B-5)
- AC-H5.1 Given a session in my History, when I open it, then below the header and above the breakdown there's a section headed "Your payments". It shows my lines exactly as the open Collection card did: the "You are {member} · Change" row (organizer) or "You joined as {member} · Stop tracking" (joined member), then the Owed to you and You owe groups, each line's figures, chip and payment history.
- AC-H5.2 Undo shows on the payments the Collection card would offer it on today:
  - organizer: every payment on their own lines;
  - joined member: payments on their Owed to you lines only (BR-C4);
  - a joined member's You owe payments show with no Undo.
- AC-H5.3 Tapping Undo opens today's confirmation: title "Undo this payment?", message `This removes the ₱500.00 received from Jyllan on {date and time}.` or `This removes the ₱500.00 you paid Renmar on {date and time}.`, confirm label "Undo payment", destructive.
- AC-H5.4 Given I'm the organizer of a session I marked "Already settled", then the section also has "Undo “Already settled”" with today's confirmation, including the participants sentence when someone joined (E1-16).
- AC-H5.5 Given a declined claim's note is still on one of my lines, then it shows with "Dismiss", as on the card.
- AC-H5.6 A paid line has no "Record payment", "I paid", "I've paid", "Mark fully paid" or "Mark all as paid", because nothing is left on it (unchanged line rules).
- AC-H5.7 Given I had no lines, then the section shows only the "You are … · Change" or "You're not in this session · Change" row, plus "Undo “Already settled”" when it applies, and "Every line in this session is marked as paid." when every pair is paid.
- AC-H5.8 The detail page reached through View details for an Outstanding session has no "Your payments" section, because the Collection card is where those are handled (BR-D2).

### US-H6. An undo brings the session back (B-5, open item: "comes back")
- AC-H6.1 Given I undo a payment in "Your payments", when the server confirms it, then I stay on the page, and a notice shows at the top of the section, also read by a screen reader: "“{title}” is back in Collection, because a payment was undone." with an "Open in Collection" button.
- AC-H6.2 "Open in Collection" goes to Collection with that card open and scrolled into view. "← History" goes to History, which no longer lists the session.
- AC-H6.3 Given the undo is refused or fails, then nothing moves, and today's banner explains it.
- AC-H6.4 Given Renmar undoes the ₱500.00 Jyllan paid him, then on Jyllan's next load her line to Renmar shows ₱500.00 left, and the session is in her Collection if it had been in her History.
- AC-H6.5 Given the undo leaves an unpaid line anywhere in the session, then the link works again (BR-L4) and Share with members shows again: on Renmar's Outstanding card, and on the detail page.
- AC-H6.6 The same holds for "Undo “Already settled”": the session goes back to Collection, with the same notice.
- AC-H6.7 Given I'm the organizer and I use "Change" in "Your payments" to pick a member who has something left, then the session goes back to Collection with the notice "“{title}” is back in Collection, because you changed who you are in it."

### US-H7. A card comes back when something new waits on me (B-3, the owner's example)
- AC-H7.1 Given Renmar's card is in his History and Jyllan sends "I've paid Kim ₱300.00", when Renmar next loads Hati (or his tab comes back into view), then the session is in his Collection under Outstanding, with "To confirm for others" holding Jyllan's claim and the collapsed card showing "1 to confirm".
- AC-H7.2 Collection opens that card on arrival, as it already does for the first card with a claim waiting (`autoOpenTarget`).
- AC-H7.3 When Renmar confirms it or declines it, and the server confirms, then the card leaves Collection again, with the move notice in US-H8.
- AC-H7.4 Changes made by someone else aren't announced. The card is simply in Collection again on the next load (no notifications, owner decision C1).
- AC-H7.5 Given the other side undoes a payment on my line (for example, Renmar undoes a payment Jyllan made him), then Jyllan's card comes back to her Collection on her next load, also unannounced.

### US-H8. Leaving Collection is visible (open item: "coming back" and announcements)
- AC-H8.1 Given my own action settles a card (a payment, Mark fully paid, Mark all as paid, Confirm, "Already settled"), when the server confirms it, then the card leaves Collection, and a notice shows at the top of Outstanding until I leave the page: "“{title}” is paid in full and has moved to History." with an "Open" button (`aria-label` "Open {title} in History") to its detail page.
- AC-H8.2 Several sessions marked at once from "Already settled?": "{N} sessions are settled and have moved to History."
- AC-H8.3 The screen reader hears the same text. It replaces today's "Session fully settled. Moved to Settled." and "{N} sessions moved to Settled."
- AC-H8.4 Focus goes to the next card's header in the same section, or to the "Outstanding" heading when no card is left. It's never lost to the page.
- AC-H8.5 Given a payment that would settle the card is refused, then the card stays and no notice shows. As today, nothing announces a move before the server has answered.

### US-H9. Where Finish and a join land (open item: arrival points)
- AC-H9.1 Given I finish a session and its card is in my Collection (Needs setup or Outstanding), then I land on Collection with that card open and scrolled into view, as today.
- AC-H9.2 Given I finish a session and its card is settled for me straight away (I picked "I'm not in this session", I have no lines, or nobody owes anybody), then I land on its detail page, with the back button "← History", and a notice: "There's nothing for you to collect or pay in “{title}”, so it's in History."
- AC-H9.3 Given I join a session and my card is outstanding, then I land on Collection with the card open, as today.
- AC-H9.4 Given I join a session and my card is settled for me (my lines are all paid, or I have none), then I land on its detail page with: "There's nothing for you to collect or pay in “{title}”, so it's in History."
- AC-H9.5 "You're already tracking this session" and "This is your session" label their primary button by where the card is: "Open in Collection" or "Open in History". The second opens the detail page.

### US-H10. Delete (open item: delete)
- AC-H10.1 The organizer's History cards keep the bin, with today's "Delete this session?" dialog and message (including the "N members are tracking it" sentence).
- AC-H10.2 The detail page, for the organizer only, has "Delete session" (a quiet destructive button, `aria-label` "Delete session {title}"), with the same dialog. This is how an Outstanding session is deleted: View details, then Delete session.
- AC-H10.3 After deleting from the detail page, I go back to where I came from (Collection or History).
- AC-H10.4 Collection cards still have no delete of their own (AC-13.5).
- AC-H10.5 A joined member never sees delete; they have Stop tracking.

### US-H11. The link expires once everything is paid (B-4, open item: link expiry)
- AC-H11.1 Given every line in the session is paid (every pair, not just the viewer's), then Share with members doesn't show anywhere.
- AC-H11.2 On the organizer's detail page, the header then reads, under the finished date: "Everyone has paid, so the invite link no longer works."
- AC-H11.3 The organizer's Download SOA for that session has no link or QR, and no "couldn't be loaded" note, because nothing failed.
- AC-H11.4 Given someone opens the link once everything is paid and they haven't joined, then they see: title "Everyone has paid", message "Every line in this session is paid, so there's nothing left to track and the link no longer works.", button "OK". The session's name and members aren't shown.
- AC-H11.5 Given a member who already joined opens it, then they see "You're already tracking this session" with "Open in History". Given the organizer opens it, they see "This is your session" with "Open in History".
- AC-H11.6 Given one line is still unpaid (Renmar settled, Jyllan still owes Kim), then the link works, and Kim can still join (B-4).
- AC-H11.7 Given an undo leaves a line unpaid again, then the same link works again (BR-L4, Q1).

### US-H12. Older sessions (open items: pre-Collection and "Already settled")
- AC-H12.1 Given a session finished before Collection, with no payments and pairs unpaid, then it's in Collection (Needs setup or Outstanding) with its "Already settled" button, and is counted by the "Already settled?" question as today.
- AC-H12.2 Given I mark it "Already settled" and the server confirms it, then it moves to History with the notice in AC-H8.1 or AC-H8.2.
- AC-H12.3 Given a session I marked "Already settled" earlier, then it's in History with "Marked as already settled", and its detail page has "Undo “Already settled”" (AC-H5.4).
- AC-H12.4 Given I already answered "Already settled?" and left older sessions unpaid, then those sessions now sit in Collection rather than History, and the question isn't asked again (see Q4).

---

## 3. Business rules

**Where a session lives**
- **BR-H1** A finished session is in exactly one of a viewer's two tabs. It's in History when its card's bucket is `settled` for that viewer, and in Collection otherwise. The bucket rule is today's (`buildCard`), unchanged:
  - an organizer's card is settled when every pair is paid and nothing waits on them, or when they're placed and their own lines are all paid and nothing waits on them;
  - a joined card is settled when its own lines are all paid and nothing waits on it (BR-V3);
  - a claim waiting on the viewer always keeps the card in Collection (BR-C15).
- **BR-H2** "Paid" counts confirmed payments only, in whole centavos (BR-C14). A line is paid when paid is at least its amount, so an overpaid line counts as paid. Pending claims never settle a line.
- **BR-H3** It's per viewer. The same session can be in the organizer's History and a member's Collection at once, and the other way round.
- **BR-H4** History waits for the profile, as Collection does. The organizer's placement can depend on their profile name, so History can't be sorted without it.
- **BR-H5** Drafts are on Home only, never in Collection or History (unchanged).
- **BR-H6** The strip counts the remaining amounts on Outstanding cards only (BR-14, unchanged), so removing Settled changes no figure. It shows whenever Collection has at least one card.
- **BR-H7** Collection has no Settled section, toggle, heading or count. "Nothing outstanding. Everything is settled." is replaced by AC-H1.4's line.
- **BR-H8** Delete stays off Collection cards (AC-13.5). The organizer deletes from a History card's bin, or from "Delete session" on the detail page, which covers Outstanding sessions through View details.

**The detail page**
- **BR-D1** One detail screen serves every finished session. It's reached from History, from View details on an Outstanding card, and from the arrivals in BR-A1 and BR-A2. Its back button names where it returns to: "← History" or "← Collection".
- **BR-D2** "Your payments" shows only when the session is in the viewer's History. An Outstanding session's payments are handled on its Collection card, so there's never a second place to record them.
- **BR-D3** In "Your payments", Undo follows today's rules (B-5): the organizer on any payment of their own lines; a joined member on their Owed to you lines only. The organizer's lines are their own only: claims they confirmed on others' lines still have no undo (owner's Q3 answer; see Q3 below).
- **BR-D4** The confirmation dialogs are today's, word for word.
- **BR-D5** The header's actions:
  - organizer: "↓ Download SOA", "Share with members" while the link works (BR-L3), and "Delete session";
  - joined member: "↓ Download SOA" (no QR) and "Stop tracking".
  On a phone they stack full width inside `@media (max-width: 640px)`; on desktop they sit in a row, as today's two do.
- **BR-D6** The organizer's "Change" moves to "Your payments", because the Settled card it lived on has gone. Without it, an organizer who picked the wrong member could never fix a session that went straight to History.
- **BR-D7** After an action on the page moves the session back to Collection (an undo, "Undo “Already settled”", "Change"), the page stays open, shows the notice and offers "Open in Collection" (AC-H6.1, AC-H6.7). The "Your payments" section then disappears, as BR-D2 says. The notice stays until the page is left.
- **BR-D8** The breakdown below is unchanged and read-only.

**Arrivals and moves**
- **BR-A1** Finish lands on Collection with the card open if the card is in Collection, otherwise on the detail page with the AC-H9.2 notice.
- **BR-A2** A join lands the same way (AC-H9.3, AC-H9.4).
- **BR-A3** A card leaving Collection because of the viewer's own action is announced and shown once the server confirms it (AC-H8.1). A card arriving in Collection because of someone else (a claim, their undo) isn't announced (AC-H7.4).
- **BR-A4** A card coming back because of the viewer's own action on the detail page is announced there (AC-H6.1).

**Link expiry**
- **BR-L1** The link is alive while at least one pair in the session has remaining above ₱0.00, counting confirmed payments only. It's worked out from the records and payments every time the link is fetched, previewed or used; nothing new is stored.
- **BR-L2** While it's not alive, the server refuses to hand out the link, to preview it and to join with it. A would-be joiner gets AC-H11.4; an existing member gets "already tracking"; the organizer gets "This is your session". The dead-link message for a reset, deleted or unknown link is unchanged (AC-8.1).
- **BR-L3** Share with members shows on an organizer's Outstanding card (Part A) and on the detail page while the link is alive. Since a card is Outstanding only while the session has something unpaid, the card's button always works.
- **BR-L4** The link isn't changed by expiry. When an undo makes it alive again, the same link works, including on every SOA and QR already sent (Q1). Only "Reset link" replaces it.
- **BR-L5** A session with no pairs (everyone even) is fully paid from the moment it's finished, so it never has a working link.
- **BR-L6** The SOA carries the link and QR only while the link is alive (AC-H11.3). PR 3's "couldn't be loaded" note is only for a real failure.

**Older sessions**
- **BR-H9** A session finished before Collection follows BR-H1 like any other. Unpaid, it's in Collection with "Already settled". Once marked, it's in History. The one-time "Already settled?" question and its stored answer are unchanged.
- **BR-H10** "Undo “Already settled”" moves to the detail page's "Your payments" (AC-H5.4), because the Settled card it lived on has gone.

---

## 4. Onboarding: the Collection guide and the tour

The Collection guide runs on a practice screen with no tab bar (`PracticeCollection` replaces the page, and `App` shows no nav on the practice screen). So the guide can't point at the History tab. The tour, on the other hand, does show the tab bar on History.

- **BR-G1** **The guide's last step (C7) is rewritten** to point at something the reader is looking at in scene K3:
  - In K3, Beach trip has just been paid in full by Mark all, Karaoke night was already paid, and Movie night still needs setup. Under Part B, K3's Collection shows the strip, Needs setup with Movie night, and the empty Outstanding section with AC-H1.4's line.
  - The step targets that line, through a new attribute `data-tour="collection-done"` on the "Nothing outstanding. Sessions that are paid in full are in History." paragraph. It's mounted in K3 because Outstanding is empty and Needs setup isn't.
  - New copy: title "All done", content "When every line of yours is paid, the session leaves Collection and moves to History. Beach trip is paid in full, so it has gone from here. In History you can still see its payments and undo one. That's it: tap Done to go back to your own Collection."
  - `place: 'K3'`, as today. K3's seed is unchanged.
- **BR-G2** `collection-settled` is removed together with the Settled section, as B-1 requires, and no step targets it any more. Every other target stays on the same element, unrenamed and unduplicated: `collection-totals`, `collection-unsettled`, `collection-outstanding`, `collection-owed`, `collection-mark-all`, `nav-collection` and `nav-history`.
- **BR-G3** No other guide step changes. "Fix a mistake" and "Everyone paid at once?" still hold: payments can still be undone, now from History too.
- **BR-G4** **The tour's History step** keeps its target, `nav-history`, which is always mounted on the History screen with no data. Its content becomes: "Once everyone has paid you, and you've paid everyone, a session moves here from Collection, read-only, with its statement and its payments. That is the whole app — go and add a real one." The Collection step's content becomes: "Finished sessions show up here until they're paid in full. Record payments as they come in, even part payments, and see who still hasn't paid you." Both steps keep their targets and screens.
- **BR-G5** The new controls (View details, Download SOA on a card, "Your payments", Delete session, the notices) carry no `data-tour`, and View details and Download SOA are hidden on practice sessions, as Share is (AC-1.9). So nothing new appears in a guide.
- **BR-G6** Tests the tech-lead should expect to change: the step list in `guides/guides.test.ts` (C7's target becomes `collection-done`), and its "K3 has two settled sessions" render check, which becomes "K3 shows the empty Outstanding line and no Settled section". `steps.test.ts` and `targets.test.ts` should pass with only the copy changes.

---

## 5. Edge cases

| # | Case | Expected |
|---|---|---|
| EH-1 | Organizer is "not in this session" | Their card has no lines, so it's in History from Finish (unless a claim for others waits), and Finish lands on the detail page (BR-A1). Share is on the detail page while anyone still owes anyone. |
| EH-2 | Organizer picked the wrong member, and the session went straight to History | "Change" in "Your payments" fixes it (BR-D6). If the new member has lines left, it comes back (AC-H6.7). |
| EH-3 | Session with no pairs (everyone even) | In History from Finish, "Nothing to collect. Everyone's even." or "You were even with everyone"; no link at all (BR-L5). |
| EH-4 | One-member session | No pairs, so as EH-3. |
| EH-5 | A joined member's lines are all paid, but others still owe | In that member's History; the session is still open for others, and the link still works. |
| EH-6 | A joined member with no lines joins | Lands on the detail page (AC-H9.4); the session is in their History. |
| EH-7 | An undo on the detail page while another payment on the same session is still saving | The move notice waits for both to end, as the Settled announcement does today (`announcesSettled`). |
| EH-8 | The detail page is open when another device or person settles or unsettles the session | On the next reload, "Your payments" appears or disappears per BR-D2. There's no notice, because it wasn't this viewer's action. |
| EH-9 | The session is deleted, or the member removed, while its detail page is open | "Session not found" (today's copy). |
| EH-10 | A refused payment would have settled the card | The card never leaves (AC-H8.5); the failed form comes back with the typed amount, as today. |
| EH-11 | Many older unpaid sessions after the owner answered "Already settled?" with "No" | They're all in Collection with "Already settled" on each card (AC-H12.4, Q4). |
| EH-12 | Organizer deletes an Outstanding session others are tracking | View details, then Delete session, with the "N members are tracking it" warning. |
| EH-13 | Very long titles in the notices | Wrap with `overflow-wrap: anywhere`; the buttons wrap under the text on a phone. |
| EH-14 | Outstanding card action row on a phone | View details and Download SOA share the width inside `@media (max-width: 640px)`, as LineRow's buttons do. On desktop they sit side by side at the end of the body. |
| EH-15 | Download SOA from a card while the PDF is building | "Preparing SOA…" and its error line, as the existing button does; the card stays open. |
| EH-16 | A History card whose organizer has no profile name | "Shared with you", as today. |
| EH-17 | Overpaid line (only possible if numbers changed after a payment) | It counts as paid, so it doesn't hold the session in Collection; "Overpaid by ₱X" shows in "Your payments". |

---

## 6. Scope

**In:** the History/Collection split per viewer; History's heading, labels, order, empty state and profile loading; Collection's empty states and empty-Outstanding line; View details and Download SOA on Outstanding cards; "Your payments" with Undo, Change and "Undo “Already settled”" on the detail page; Delete session on the detail page; the arrivals; the move notices; link expiry and reopening; the rewritten guide step and the tour's copy.

**Out:** notifications or a "back from History" marker on cards; an undo for claims the organizer confirmed on others' lines (Q3); recording payments from the detail page; a History search or filter; seeing or removing who joined once everything is paid (the Share dialog is gone then); re-asking "Already settled?" (Q4); a schema change.

## 7. Traceability

| Requirement | Reason |
|---|---|
| US-H1, US-H2, BR-H1 to BR-H7 | B-1, B-2, B-3; the owner's Renmar, Jyllan and Kim example |
| US-H3 | open item: History list ordering |
| US-H4 | B-6 |
| US-H5, US-H6, BR-D1 to BR-D8 | B-5 |
| US-H7, US-H8, BR-A3, BR-A4 | B-3 (the card comes back), open item: "comes back" moments |
| US-H9, BR-A1, BR-A2 | open item: what Finish lands on |
| US-H10, BR-H8 | open item: delete |
| US-H11, BR-L1 to BR-L6 | B-4, B-5 ("sharing works again"), Part A item 1 |
| US-H12, BR-H9, BR-H10 | open items: pre-Collection and "Already settled" sessions |
| BR-G1 to BR-G6 | B-7, open item: History tour step, CLAUDE.md onboarding rules |

## 8. Open questions for the owner

1. **Q1. After an undo makes a fully paid session owe money again, should the old link (and the QR on SOAs already sent) work again?** Recommended: yes, the same link. Money is owed again, so the people who still have the SOA should be able to join; "Reset link" is still there for anyone who wants a fresh one. It also needs nothing stored, so no schema change.
2. **Q2. Should Needs setup cards get "View details" too?** Recommended: yes, View details only (no Download SOA or Share). Seeing the breakdown helps you pick which member you are, and without it an unplaced session can't be deleted until you've placed it.
3. **Q3. Should "Your payments" on the detail page list only your own lines, or every line in the session?** Recommended: your own lines only. That's "today's rules" and what the Collection card showed. Listing every line would give the organizer Undo on others' payments, which you deferred in round 1 (Q3).
4. **Q4. If you already answered "Already settled?", your older unpaid sessions move from History into Collection. Is that fine, or should Hati ask once more?** Recommended: fine as is. Each card keeps its "Already settled" button, and asking again would need a new stored marker, which is a schema change.
5. **Q5. Should What's new tell testers about the new split?** Recommended: yes. If PR 4 goes to uat with PR 1 and PR 2, add one line to the version 3 text ("Collection now shows only what's still being paid; settled sessions are in History"). If it ships later, make it version 4. Testers who know History as "everything finished" will otherwise think sessions have gone missing.

## Owner answers (2026-11-21)

- **Q1:** yes. After an undo makes money owed again, the same link and its QR work again.
- **Q2:** Needs setup cards get **View details only**, with no Download SOA and no Share.
- **Q3:** "Your payments" lists **only the viewer's own lines**.
- **Q4:** accepted as recommended. Older unpaid sessions move to Collection with their "Already settled" button, and Hati doesn't ask again.
- **Q5:** PR 4 ships to uat **together with PR 1 and PR 2**. What's new v3 gains one line about History now holding settled sessions. Because PR 4 builds on PR 3, this means PR 1 to PR 4 go to uat together.
