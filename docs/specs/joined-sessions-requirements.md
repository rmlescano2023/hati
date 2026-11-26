# Requirements: members join a finished session to track their own payments

Author: business-analyst, 2026-11-20. Planned against branch `agent-defs-markdown-docs` (3e2443f). Nothing in the repo or the database was touched.

**Inputs, taken as fixed:**
- Intake brief: `/Users/rmlescano/.claude/plans/cached-waddling-wigderson.md`, decisions I-1 to I-8.
- Architect's feature brief: `/Users/rmlescano/.claude/plans/cached-waddling-wigderson-architecture.md`, owner decisions D1 to D10 and the chosen options A1, B1, C1, D1, E1.
- Today's behavior, from the code: `src/lib/collection.ts`, `src/pages/CollectionPage.tsx`, `src/components/collection/`, `src/pages/HistoryPage.tsx`, `src/pages/HistoryDetailPage.tsx`, `src/App.tsx`, `src/components/onboarding/`, `src/lib/sessionLabel.ts` (`deleteSessionMessage`), `src/pdf/SoaDocument.tsx`. Specs: `docs/specs/collection.md`, `collection-nicknames.md`, `settled-and-whats-new.md`, `tab-guides-2.md`.

Rule ids here are new: BR-J (joining), BR-V (what a participant sees), BR-O (organizer controls), BR-C (claims), BR-Q (QR), BR-G (onboarding). Existing ids (BR-14, BR-S1, BR-TG8 and so on) refer to the specs above.

Exact copy is in quotes or code spans. `{title}` is `sessionDisplayTitle(session)`, `{organizer}` is the organizer's Hati profile name, and amounts use `formatCents`, so they read `₱500.00`. Dates and times use the existing `formatLocalDate` and `formatLocalDateTime`.

---

## 0. Problem, outcome and shared definitions

**Problem.** Only the organizer can see a finished session's lines and record its payments. Everyone else gets the SOA PDF and nothing more. They can't follow what they owe or are owed, and they can't say they've paid, so the organizer chases and records every payment by hand (I-context).

**Outcome (checkable).**
- A member who opens the invite link, signs in and taps Join sees their own lines for that session in their Collection, and can open the whole session read-only in their History.
- A debtor's "I've paid" shows as waiting on both sides until the creditor confirms or declines it. The organizer does this when the creditor isn't on Hati. Once it's confirmed, both accounts show the same figures.
- The organizer can see who joined as whom, remove an account, and reset the link.
- The organizer's SOA for a finished session carries the link as a clickable link and as a QR that a phone camera can scan.

**Definitions used throughout.**
- **Organizer:** the account that owns the session (today's only account on it).
- **Participant:** an account that joined the session as one of its members. One account per member, one member per account per session (I-4).
- **Organizer's member:** the member stored in the organizer's `me`, when it is a member. When `me` is null or "not in this session", the organizer has no member.
- **On Hati (for a session):** a member who is the organizer's member, or whom a participant has claimed.
- **Claimable member:** a member who isn't on Hati.
- **Line, remaining, paid:** as in Collection today (BR-10 to BR-15), counting confirmed payments only.
- **Claim:** a debtor participant's "I've paid ₱X". It is *pending* until the creditor (or the organizer) confirms it, which turns it into a payment, or declines it (PR 2).
- **Pending on a line (P):** the sum of the pending claims on that line's exact debtor and creditor pair. Declined claims count for nothing.
- **Decider of a claim:** the creditor's account when the creditor is on Hati (the creditor's participant, or the organizer when the creditor is the organizer's member). Otherwise the organizer (I-7).
- **Claims waiting on an account:** pending claims that account is the decider of.

**Answers to the architect's hand-off (section 9), in brief.** Each is a rule in the PR it belongs to.

| Hand-off question | Settled as | Rule |
|---|---|---|
| Do pending claims count in the totals and buckets? | No. Totals, statuses, "X of Y settled" and buckets count confirmed payments only. Pending amounts show on the line and the card summary. One addition: a card with claims waiting on you is never in Settled. | BR-C14 to BR-C16 |
| How a joined card looks in each bucket | Never Needs setup. Outstanding and Settled as for a member, plus "Shared by {organizer}", "You joined as {member} · Stop tracking", and no Change, no Already settled, no Invite. | BR-V3 to BR-V7 |
| Wrong claims: what the organizer sees, and removal | The Invite members dialog lists each joined member with the joiner's profile name and join date, and a Remove button. Removal confirms first. | BR-O5 to BR-O9 |
| Remove: offer or force a link reset | Offered, not forced (forcing it would break every SOA already sent). The default is the open question Q1. | BR-O8 |
| Declined claims, and withdrawing | The debtor sees "Not confirmed" on the line until they dismiss it. Nobody else sees declined claims. A debtor can withdraw a pending claim at any time. | BR-C5, BR-C8, BR-C9 |
| A debtor's "Mark all as paid" | One tap sends one claim per You owe line, at what's left to claim. Lines owed to them are recorded directly. Each side is all-or-nothing on its own. | US-27, BR-C13 |
| Where "Stop tracking" goes, and what it does | On the joined card's open body and on its History detail page. No bin icon on a joined History card. It removes the account from the session; confirmed payments stay. | BR-V9, BR-V10 |
| Can a participant export the SOA? | Yes, from History detail, never with the link or QR. | BR-V8, BR-Q6 |
| The organizer's SOA when the link can't be fetched | Export without the QR and say so, with a way to try again. | BR-Q5 |
| Join dialog against the tour, offers and What's new | The join flow goes first. Everything else waits and then resumes as normal. The join dialog counts as this visit's one-time prompt. | BR-G1 to BR-G5 |
| The Collection guide and the tour | No new targets, no target moves. Organizer controls are hidden in the practice scenes. | BR-G6 to BR-G9 |

---

## PR 1: join and read-only access, organizer controls, the in-app link

### Scope

**In:**
- the invite link for finished sessions, minted on demand (old ones too, D6), shown and copyable in an Invite members dialog;
- who joined as whom (profile name and join date only, D3), removing a joined account, and resetting the link;
- the `?join=` entry, including signing in or signing up first, and the join dialog with its outcomes (already tracking, your own session, dead link, everyone already joined, someone just took that member);
- joined sessions in the participant's Collection and History, read-only, with SOA download (no QR);
- "Stop tracking";
- the delete warning that counts the members tracking the session;
- the organizer's Change and Needs setup pickers no longer offering claimed members;
- the server-side read-only guard on every finished session (D4);
- reloading when the tab comes back into view, at most about once every 30 seconds (D2, C1).

**Out of PR 1:** claims, creditors recording payments, confirm and decline (PR 2); the QR (PR 3). In PR 1 only the organizer records payments, exactly as today.

### User stories and acceptance criteria

**US-1. The organizer gets the invite link** (I-2, I-3, D6)
As an organizer, I want a link to my finished session, so that the others can follow their own payments.
- AC-1.1 Given a finished session I own, when I open it from History, then the header shows an "Invite members" button beside "↓ Download SOA".
- AC-1.2 Given a finished session I own with its card open on Collection (in Outstanding or Settled), then the card body ends with an "Invite members" button, after "Mark all as paid" or "Undo “Already settled”" when those show.
- AC-1.3 Given a draft, then no "Invite members" shows anywhere, and Summary is unchanged.
- AC-1.4 Given a finished session that has never had a link, including one finished before this feature, when I tap "Invite members", then the dialog shows "Getting the link…" and then a link of the form `{origin}/?join={22 characters}`, where `{origin}` is the address the app is open on (D9).
- AC-1.5 Given I open the dialog again later, from either place, then it shows the same link until I reset it.
- AC-1.6 Given the link can't be fetched, then the dialog shows "Couldn't get the invite link. Check your connection and try again." and a "Try again" button, and nothing else in the dialog is blocked: the list of who joined still shows if it loaded.
- AC-1.7 When I tap "Copy link", then the link is on the clipboard, the button reads "Copied" for about 2 seconds, and a screen reader hears "Link copied".
- AC-1.8 Given the clipboard isn't available or refuses, then the dialog says "Couldn't copy. Select the link and copy it yourself." and the link text is selected.
- AC-1.9 Given a practice session in a guide, then "Invite members" doesn't show (BR-G7).

**US-2. The organizer sees who joined** (I-8, D3)
- AC-2.1 Given nobody has joined, then the dialog's "Tracking on Hati" list reads "Nobody has joined yet."
- AC-2.2 Given Ben's member was claimed by an account named "Benjamin R." on Nov 20, 2026, then the list shows a row: "**Ben**" and under it "Benjamin R. · joined Nov 20, 2026".
- AC-2.3 Given the joining account has no profile name, then the second line reads "No name set · joined Nov 20, 2026".
- AC-2.4 Rows are sorted by member name, as members are everywhere else (`sortNames`). No email or other account detail shows.
- AC-2.5 Given someone joins while my dialog is open, then the list shows them after the next reload (on reopening the dialog, or when the tab comes back into view, BR-O12). There's no live update.

**US-3. The organizer resets the link** (I-8)
- AC-3.1 When I tap "Reset link", then a destructive confirmation opens: title "Reset the invite link?", message "The current link, and the QR on any statement you've already shared, will stop working. Members who already joined keep tracking. You'll get a new link to share.", buttons "Cancel" and "Reset link".
- AC-3.2 When I confirm, then the dialog shows a new link, a screen reader hears "Invite link reset.", and opening the old link anywhere gives the dead-link message (US-8).
- AC-3.3 Members who joined before the reset still see the session, unchanged.
- AC-3.4 Given the reset fails, then the dialog says "Couldn't reset the link. Try again." and the old link still works.

**US-4. The organizer removes a joined account** (I-8, hand-off: wrong claims)
As an organizer, I want to free up a member someone joined as by mistake, so that the right person can join.
- AC-4.1 Each row in "Tracking on Hati" has a "Remove" button, with `aria-label` "Remove {member}'s account from {title}".
- AC-4.2 When I tap it, then a destructive confirmation opens: title "Remove {member}?", message "{profile name, or "This account"} joined “{title}” as {member}. Removing them takes the session out of their Collection and History. Payments already recorded stay. They can join again with the invite link unless you reset it.", a checkbox "Also reset the invite link" (its default is Q1), and buttons "Cancel" and "Remove".
- AC-4.3 When I confirm, then the row leaves the list, and the member is claimable again.
- AC-4.4 Given the checkbox was ticked, then the link is also reset, as in AC-3.2.
- AC-4.5 Given the removed account loads Hati next (or its tab comes back into view), then the session is gone from its Collection and History. It gets no message (no notifications, I-out-of-scope). If it had the History detail open, the page reads "Session not found" as today.
- AC-4.6 Given the removal fails, then the row stays and the dialog says "Couldn't remove {member}. Try again."

**US-5. A member opens the link while signed out** (I-4, E1)
- AC-5.1 Given I'm signed out and open `…/?join={token}`, then the address bar loses `?join=…` right away, and the sign-in screen shows one extra line: "Sign in or create an account to join the session you were invited to."
- AC-5.2 Given I sign in, or create an account, within an hour, including through Google or an email link opened in a new tab, then the app opens with the join dialog (US-6). If more than an hour passes, the app opens normally and I need to open the link again.
- AC-5.3 Refreshing the page after the join dialog appeared doesn't open it a second time.

**US-6. A member joins** (I-1, I-4)
As a member, I want to pick who I am in the session once, so that my lines follow me.
- AC-6.1 Given I'm signed in and open a valid link, then once my sessions and profile have loaded, a dialog shows: "Checking the invite link…", then the join dialog.
- AC-6.2 The join dialog shows:
  - title `Join “{title}”?`;
  - "Finished {date} · {N} members";
  - "{organizer} shared this session. Pick who you are, and your share of it shows up in your Collection." When the organizer has no profile name: "You've been invited to this session. Pick who you are, and your share of it shows up in your Collection.";
  - "You can see the whole session, but only {organizer} can change it. {organizer} will see your Hati name and when you joined." With no organizer name, "the organizer" and "The organizer";
  - a list of the session's members, sorted; claimable members are radios, and members on Hati are shown disabled with " · on Hati" after the name;
  - when any member is on Hati: "Is your name taken? Ask {organizer, or "the organizer"} to remove it, then open the link again.";
  - the Remember checkbox, exactly as `MePicker` offers it today (BR-N10);
  - buttons "Cancel" and "Join". There's no "I'm not in this session" option.
- AC-6.3 Given my profile name matches exactly one claimable member, then that member is preselected and the legend reads "Which one are you?".
- AC-6.4 Given my profile name matches no member and one of my other names matches exactly one claimable member, then it's preselected and the legend reads `You go by “{member}” — is that you here?` (the existing `nicknamePrompt`).
- AC-6.5 Given no match, or the only match is a member already on Hati, then nothing is preselected, the legend reads "Which one are you?", and "Join" is disabled until I pick one.
- AC-6.6 When I tap "Join", then the dialog closes, the app shows Collection with the session's card open and scrolled into view, and a screen reader hears "Joined {title}."
- AC-6.7 Given Remember was shown and ticked, then my profile name (or another name) is saved as it is from the other pickers.
- AC-6.8 Given someone else claimed that member in the meantime, then the dialog stays open, the list refreshes with that member now " · on Hati", nothing is selected, and it says "Someone else just joined as {member}. Pick who you are again."
- AC-6.9 Given the join request fails for any other reason, then the dialog says "Couldn't join. Check your connection and try again." and Join stays enabled.
- AC-6.10 When I tap "Cancel" or press Escape, then nothing is created, and I stay on Home. Opening the link again shows the dialog again.

**US-7. Already tracking, and my own session** (I-5)
- AC-7.1 Given I already joined this session, when I open its link again, then instead of the join dialog I see: title "You're already tracking this session", message "“{title}” is in your Collection. You joined as {member}.", buttons "Close" and "Open in Collection". No second card appears anywhere.
- AC-7.2 Given I'm the organizer, when I open my own link, then I see: title "This is your session", message "You're the organizer of “{title}”, so it's already in your Collection. Share this link with the others so they can track their own payments.", buttons "Close" and "Open in Collection".
- AC-7.3 "Open in Collection" shows Collection with that card open and scrolled into view, opening Settled first if that's where it is (as landing from Finish does today). "Close" and Escape leave me on Home.

**US-8. A dead link** (I-2, architect: uniform 404)
- AC-8.1 Given the link was reset, the session was deleted, the token is unknown, or the text after `?join=` isn't a valid token, then I see: title "This link doesn't work any more", message "The organizer may have reset it or deleted the session. Ask them for a new link.", button "OK". All four cases read the same.

**US-9. Everyone has already joined**
- AC-9.1 Given every member is on Hati (and I'm neither the organizer nor already a participant), then I see: title "Everyone has already joined", message "Every member of “{title}” is already on Hati. If one of them is you, ask {organizer, or "the organizer"} to remove that member, then open the link again.", button "OK".

**US-10. A participant sees their lines in Collection** (I-6, D1)
- AC-10.1 Given I joined as Ben, then the session's card is in my Collection: in Outstanding while any line of mine has something left, otherwise in Settled. It's never in Needs setup.
- AC-10.2 The collapsed card shows the title, "Finished {date}", then "Shared by {organizer}" (or "Shared with you" when the organizer has no profile name), then the same summary a member's card shows today ("X of Y settled" and the money, or "Settled {date}" and "Received / Paid", or "Nothing to collect. You're even with everyone.").
- AC-10.3 The open card starts with "You joined as **Ben** · Stop tracking", then my Owed to you and You owe groups with each line's figures and its payment history, exactly as an organizer sees their own lines.
- AC-10.4 In PR 1, my lines have no "Record payment", "I paid", "Mark fully paid", "Undo" or "Mark all as paid", and the card has no "Change", no "Already settled" and no "Invite members". Under the lines it says "{organizer, or "The organizer"} records the payments on this session." (PR 2 replaces this line, BR-V11.)
- AC-10.5 The strip's "Owed to you" and "You owe" include my joined Outstanding cards, exactly as they include my own (BR-14).
- AC-10.6 Given the organizer records a payment on one of my lines, then my card shows it the next time it loads or my tab comes back into view.

**US-11. A participant sees the session in History** (I-6)
- AC-11.1 Given I joined a session, then it's in my History list among my own finished sessions, by finish date. Its card shows "Shared by {organizer}" (or "Shared with you") under the member names, and has no bin icon.
- AC-11.2 When I open it, then I see the read-only breakdown, as the organizer does, and the header shows "Shared by {organizer} · You joined as {member}" under the finished date, with "↓ Download SOA" and "Stop tracking".
- AC-11.3 When I tap "↓ Download SOA", then I get the same statement the organizer gets, without the invite link or QR (BR-Q6).
- AC-11.4 There's no way to edit anything: no Edit, no Change, no member changes.

**US-12. A participant stops tracking** (I-hand-off)
- AC-12.1 "Stop tracking" is on the joined card's open body ("You joined as **Ben** · Stop tracking", a ghost link-style button, `aria-label` "Stop tracking {title}") and in the History detail header.
- AC-12.2 When I tap it, then a destructive confirmation opens: title `Stop tracking “{title}”?`, message "It leaves your Collection and History. {organizer, or "The organizer"} keeps the session, and payments already recorded stay. You can join again with the invite link if it still works.", buttons "Cancel" and "Stop tracking".
- AC-12.3 When I confirm, then the session leaves my Collection and History at once, a screen reader hears "Stopped tracking {title}.", and if I was on its History detail I'm back on History.
- AC-12.4 The organizer's "Tracking on Hati" list no longer shows me after their next reload, and my member is claimable again.
- AC-12.5 Given it fails, then the session comes back and the banner says "Couldn't stop tracking “{title}”. Try again."

**US-13. The organizer deletes a session others are tracking** (D5)
- AC-13.1 Given 2 members have joined my finished session with 3 purchases and 4 payments, when I tap its bin in History, then "Delete this session?" says: "“{title}” and its 3 purchases will be deleted, along with its 4 recorded payments. 2 members are tracking it on Hati, and it will disappear from their Collection and History too. Its statement can no longer be downloaded and the payments cannot be recovered. This cannot be undone."
- AC-13.2 With no payments: "“{title}” and its 3 purchases will be deleted, and its statement can no longer be downloaded. 1 member is tracking it on Hati, and it will disappear from their Collection and History too. This cannot be undone."
- AC-13.3 With nobody joined, the message is today's, word for word.
- AC-13.4 Given I confirm, then the participants lose the session on their next load, and a write they had in flight gets today's "This session is gone." banner.

**US-14. The organizer's own pick ignores claimed members** (architect section 5)
- AC-14.1 Given Ben has been claimed, when I open "Change" or a Needs setup card on that session, then Ben is listed but disabled, with " · on Hati" after the name, and can't be chosen.
- AC-14.2 Given my profile name matches Ben and I never picked, then the session isn't placed as Ben: it goes by the remaining rules (a nickname suggestion or Needs setup), so I and a participant are never both "Ben".

**US-15. Up-to-date figures on returning to the app** (D2)
- AC-15.1 Given Hati has been in a background tab for more than about 30 seconds, when I come back to it, then it reloads my sessions, including joined ones, without a spinner over the page and without losing an open card or a typed amount.
- AC-15.2 Coming back again within about 30 seconds doesn't reload.

### Business rules (PR 1)

**Joining**
- **BR-J1** Only finished sessions have a link. A draft never gets one, and its SOA never carries one (I-3).
- **BR-J2** The link is minted the first time the organizer asks for it, for any finished session, however old (D6). It stays the same until it's reset. Reset replaces it at once; there is only ever one working link per session.
- **BR-J3** Opening a link always needs a signed-in account. A signed-out visitor sees only the generic sign-in line (AC-5.1), never the session's name or members.
- **BR-J4** A member can be claimed by one account only, and an account can claim one member per session (I-4). The organizer's member is never claimable, and the organizer can never become a participant of their own session.
- **BR-J5** The preselect uses `matchMember` over the claimable members only, with today's rules: the profile name first, then exactly one nickname hit as a suggestion (BR-N4). Joining always needs the Join tap; nothing joins on its own.
- **BR-J6** Outcomes are checked in this order: dead link; your own session; already tracking; everyone already joined; the join dialog.
- **BR-J7** A dead, reset, deleted, unknown or malformed link all show the same message (AC-8.1), so the message says nothing about which.
- **BR-J8** Joining doesn't change the session: its members, records, payments and the organizer's `me` stay as they are.
- **BR-J9** A participant can't switch member in place. To fix a wrong pick they stop tracking and join again, or the organizer removes them. This keeps "who is who" decided by one tap and one removal, with no third flow.

**What a participant sees and can do (PR 1)**
- **BR-V1** A participant sees the session's members and records (the SOA's content), and only the payments on lines where their member is the debtor or the creditor (D1). They never see payments between two other members.
- **BR-V2** A participant's member is the member they joined as. `resolveMe`, the profile name and nicknames are not consulted for a joined session.
- **BR-V3** A joined card's bucket comes from the participant's own lines only: Outstanding while any of them has remaining above ₱0.00, otherwise Settled. "Every pair is paid" can't be known from D1's payments, so it isn't used, and Needs setup can't occur.
- **BR-V4** The summary wording for a joined card follows the member-with-lines and member-with-no-lines cases of today (`summaryDetail`). The "Everyone's paid" variants, which need every pair, never show on a joined card.
- **BR-V5** A joined card is always expandable, because its open body holds "Stop tracking".
- **BR-V6** A joined card never offers "Already settled", "Undo “Already settled”", "Change" or "Invite members", and is never in the "Already settled?" question.
- **BR-V7** In PR 1 a participant records nothing: no payment buttons and no Undo on any line.
- **BR-V8** A participant can download the SOA from History detail. It never carries the link or QR (BR-Q6).
- **BR-V9** "Stop tracking" removes the account from the session: its participant row goes, the member becomes claimable, the session leaves its Collection and History. Payments already recorded stay, because they're facts about the money. There's no bin icon on a joined History card, because nothing the participant can do deletes the session.
- **BR-V10** After stopping, the account can join again with the link while it still works, as any member.
- **BR-V11** In PR 1 the open joined card says "{organizer, or "The organizer"} records the payments on this session." PR 2 removes this line.

**Organizer controls**
- **BR-O1** The Invite members dialog is opened from History detail (beside Download SOA) and from the organizer's open Collection card (last in its body). It's the same dialog in both places. Placement reason: History detail is the session's home after Finish, and Collection is where Finish lands, which is when the organizer is most likely to share.
- **BR-O2** The dialog holds, in order: a title "Invite members"; the intro "Anyone with this link can sign in to Hati, pick who they are in “{title}”, and track their own payments. They can see the whole session but can't change it."; the link as selectable text; "Copy link"; (PR 3: the QR); the heading "Tracking on Hati" and its list; "Reset link"; and "Done".
- **BR-O3** Only the organizer sees the dialog, the link and the list.
- **BR-O4** The list shows each joined member with the joiner's Hati profile name, or "No name set", and the join date. Never an email (D3).
- **BR-O5** Wrong claims are found by people, not by Hati: either the organizer spots an unexpected name in the list, or the real member finds their name marked " · on Hati" in the join dialog, which tells them to ask the organizer (AC-6.2). Hati can't verify who someone is.
- **BR-O6** Removing an account removes its participant row (PR 2: and its claims, BR-C17). Confirmed payments stay.
- **BR-O7** Removal confirms first (AC-4.2), because the removed person loses access with no message.
- **BR-O8** Removal *offers* a reset with a checkbox and never forces it. Forcing would break the link and QR on every statement already sent to the members who haven't joined yet, for a problem that is usually an honest mistake. The default state of the checkbox is Q1.
- **BR-O9** The organizer can't change which member a participant is; only remove them.
- **BR-O10** Deleting a session is allowed after others joined, with the warning in AC-13.1 and AC-13.2 (D5). The count is the number of joined accounts the organizer's screen last loaded.
- **BR-O11** The organizer's Change and Needs setup pickers disable claimed members, and the organizer's automatic profile-name match skips them (US-14).
- **BR-O12** The app reloads sessions when its tab becomes visible again, at most about once every 30 seconds (D2). There are no notifications, no polling and no badge.

**Read-only on the server (D4)**
- **BR-R1** Every finished session is read-only for its records and members, whoever asks and whatever an old tab sends. Saving a finished session can change only its name, the organizer's `me` and its activity time. Payments keep their own routes.
- **BR-R2** A participant can't change anything on the session through any route in PR 1. In PR 2 they can only do what BR-C1 to BR-C9 allow.

### Edge cases (PR 1)

| # | Case | Expected |
|---|---|---|
| E1-1 | One-member session where that member is the organizer's member | The organizer's own link says "This is your session"; anyone else sees "Everyone has already joined". |
| E1-2 | The organizer picked "I'm not in this session" | Every member is claimable. |
| E1-3 | The organizer's `me` is still unset, and the organizer's profile name matches Ben, and Ben gets claimed | The organizer's card stops treating them as Ben (AC-14.2) and falls to Needs setup or a nickname suggestion. |
| E1-4 | 20 members | The join dialog's list scrolls inside the dialog on a phone; Join stays reachable. The organizer's list shows up to 19 rows. |
| E1-5 | Very long member, organizer or session names | Wrap with `overflow-wrap: anywhere` in the dialogs, the card's "Shared by" line and the list; nothing is cut off or scrolls sideways at 375px. The link wraps anywhere, in the mono font. |
| E1-6 | A session with no settlement lines (everyone even) | Joining is allowed. The card is Settled with "Nothing to collect. You're even with everyone." |
| E1-7 | The joining account has no profile name (a brand-new account) | No preselect; the Remember checkbox offers "Remember as my name"; the organizer sees "No name set" if it's unticked. |
| E1-8 | The organizer opens the link on another device, or in another browser | "This is your session". |
| E1-9 | Two accounts tap Join on the same member at the same moment | One joins; the other gets AC-6.8. |
| E1-10 | The link is opened inside a chat app's built-in browser (Messenger, for example) | Sign-in may refuse Google there. Not an app change: the tester should note it, and email sign-in or "Open in browser" works. A QR scanned with the camera opens the phone's normal browser. |
| E1-11 | The stash is older than an hour by the time sign-up finishes | The app opens normally; the member opens the link again. |
| E1-12 | A participant is removed while their History detail is open | On the next reload the page reads "Session not found" (today's copy). |
| E1-13 | A participant stops tracking, then opens the same link again | Join dialog again, with their old member claimable unless someone else took it. |
| E1-14 | The organizer removes Ben, then Ben's account rejoins as Ben | Allowed unless the link was reset (BR-O8). |
| E1-15 | The organizer's session was finished before Collection and is offered "Already settled" | Unchanged for the organizer; participants are never offered it (BR-V6). |
| E1-16 | The organizer taps "Undo “Already settled”" on a session others joined | Allowed; every payment goes, as today. The message gains: "Members tracking it on Hati will see their lines unpaid again." |
| E1-17 | Old tab on an earlier build (organizer) | Its save of a finished session can't change members or records (BR-R1). Joined sessions don't appear in a participant's old tab. |
| E1-18 | Phone and desktop | Dialogs follow today's `ModalDialog` sizing. On a phone, History detail's two header buttons stack full width inside `@media (max-width: 640px)`; on desktop they sit side by side. Desktop layout is otherwise unchanged. |

---

## PR 2: "I've paid" claims, then confirm or decline

### Scope

**In:** a debtor participant's "I've paid" (part or full) and "Mark all as paid" as claims; pending claims shown to both sides; confirm and decline by the creditor, or by the organizer when the creditor isn't on Hati; withdrawing a pending claim; seeing and dismissing a declined claim; a creditor participant recording payments directly, and undoing them; the effect on totals, buckets, card summaries, Mark all, Already settled, removal, Stop tracking and delete.

**Out:** notifications, badges or counts on the Collection tab; an undo for a claim the organizer confirmed on someone else's line (Q3); the organizer recording payments on lines that aren't theirs; a strip note for pending amounts.

### User stories and acceptance criteria

**US-20. A debtor says they've paid** (I-7)
As a member who owes money, I want to say I've paid, so that the person I paid can confirm it and my balance goes down.
- AC-20.1 Given I joined as Ben and owe Ana ₱500.00 with nothing paid or pending, then my You owe line to Ana shows "I've paid" (`aria-label` "Tell Ana you've paid") and "I've paid it all" (`aria-label` "Tell Ana you've paid the full ₱500.00").
- AC-20.2 When I tap "I've paid", then a form opens with the label "Amount you paid", prefilled with 500.00, and the buttons "Send for confirmation" and "Cancel".
- AC-20.3 When I send ₱200.00, then the line shows the figures unchanged ("Paid ₱0.00 · ₱500.00 left", chip "Unpaid"), plus "₱200.00 waiting for Ana to confirm", and a history entry "You said you paid ₱200.00", its time, and "Waiting for Ana to confirm", with a "Withdraw" button.
- AC-20.4 Given ₱200.00 is pending, when I open the form again, then it's prefilled with 300.00, and typing 301 shows "That's more than what's left (₱300.00). ₱200.00 is already waiting for confirmation." with Send disabled.
- AC-20.5 Given pending claims cover the whole remaining amount, then "I've paid" and "I've paid it all" are hidden on that line.
- AC-20.6 "I've paid it all" sends one claim for what's left to claim (remaining minus pending), with no form.
- AC-20.7 The amount rules are today's: above ₱0.00, at most 2 decimals, "₱1,000" accepted (`parsePaymentAmount`), and the same messages apart from AC-20.4.
- AC-20.8 Given Ana isn't on Hati, then the waiting text names the organizer instead: "Waiting for {organizer} to confirm", or "Waiting for the organizer to confirm" when the organizer has no profile name. Given Ana is the organizer's member, it names Ana.
- AC-20.9 Given sending fails, then the form reopens with my amount and the message, as a refused payment does today, and nothing is shown as pending.
- AC-20.10 A double tap on Send, or a held Enter, sends one claim (as AC-7.10 today).

**US-21. The creditor confirms** (I-7)
- AC-21.1 Given Ben said he paid me ₱200.00 and I'm Ana, on Hati as the organizer or a participant, then my Owed to you line to Ben shows "₱200.00 waiting for you to confirm" and an entry "Ben says they paid ₱200.00", its time, with "Confirm" (`aria-label` "Confirm ₱200.00 from Ben") and "Decline" (`aria-label` "Decline ₱200.00 from Ben").
- AC-21.2 When I tap "Confirm", then without a dialog the entry becomes "Received ₱200.00" with the time Ben sent it, and Undo; the line reads "Paid ₱200.00 · ₱300.00 left", chip "Partial"; and a screen reader hears "Payment confirmed."
- AC-21.3 Given that confirmation pays the line, and the card, in full, then the card moves to Settled with today's announcement "Session fully settled. Moved to Settled."
- AC-21.4 On Ben's next load, his line shows "You paid ₱200.00", with no Undo, and the same figures as mine.
- AC-21.5 Given less is left on the line than the claim by the time I confirm (another payment landed first), then nothing changes and I see "Only ₱{left} is left on this line, so this can't be confirmed. Decline it, or ask {debtor} to withdraw it and send what's left."
- AC-21.6 Given Ben withdrew it before my tap landed, then I see "This payment is no longer waiting. It may have been withdrawn." and the entry goes.

**US-22. The creditor declines** (I-7)
- AC-22.1 When I tap "Decline", then a destructive confirmation opens: title "Decline this payment?", message "Ben said they paid you ₱200.00 on {date and time}. Declining records nothing, and Ben will see that it wasn't confirmed.", buttons "Cancel" and "Decline".
- AC-22.2 When I confirm, then the entry leaves my line and my figures don't change.
- AC-22.3 On Ben's next load, his line shows "Not confirmed: the ₱200.00 you said you paid on {date and time}", under it "If you did pay, talk to Ana, then send it again.", and a "Dismiss" button.

**US-23. The organizer decides for a creditor who isn't on Hati** (I-7)
- AC-23.1 Given Ben (a participant) owes Carla, Carla isn't on Hati, and Ben said he paid her ₱150.00, then the organizer's open card shows a group headed "To confirm for others" at the top of the body, with "Ben says they paid Carla ₱150.00", its time, "Carla isn't on Hati, so you confirm it.", and "Confirm" and "Decline".
- AC-23.2 Because this line isn't one of the organizer's, "Confirm" asks first: title "Confirm this payment?", message "This records ₱150.00 paid by Ben to Carla on “{title}”.", buttons "Cancel" and "Confirm". (Whether it also offers an undo is Q3.)
- AC-23.3 "Decline" works as AC-22.1, with the message "Ben said they paid Carla ₱150.00 on {date and time}. Declining records nothing, and Ben will see that it wasn't confirmed."
- AC-23.4 The collapsed card shows "1 payment to confirm" (or "{N} payments to confirm"), in any section.
- AC-23.5 Given the card would otherwise be in Settled, then it's in Outstanding while such a claim waits (BR-C12).
- AC-23.6 Given Carla later joins, then on the next load the claim is hers to decide, and it leaves the organizer's group.
- AC-23.7 Given the organizer's card is in Needs setup, then the group still shows, above "Which one are you?".

**US-24. A debtor withdraws a pending claim**
- AC-24.1 When I tap "Withdraw" on a pending entry, then a destructive confirmation opens: title "Withdraw this payment?", message "This takes back the ₱200.00 you said you paid Ana on {date and time}. Nothing was recorded yet.", buttons "Cancel" and "Withdraw".
- AC-24.2 When I confirm, then the entry and its waiting amount go, and "I've paid" offers the full remaining amount again.
- AC-24.3 Given Ana confirmed it before my tap landed, then I see "Ana has already confirmed this payment." and the line shows it as paid.

**US-25. A debtor dismisses a declined claim**
- AC-25.1 When I tap "Dismiss" (`aria-label` "Dismiss the note about the ₱200.00 you said you paid Ana"), then the note goes, with no dialog, and it doesn't come back.
- AC-25.2 A declined claim doesn't change any figure, and doesn't stop me sending a new one.

**US-26. A creditor participant records a payment directly** (I-7)
- AC-26.1 Given I joined as Ana and Ben owes me, then my Owed to you line has "Record payment" and "Mark fully paid", which count at once, as for an organizer today.
- AC-26.2 The most I can record is what's left minus what's pending on the line; the form's prefill and "Mark fully paid" use that amount, and with a pending claim the over-cap message is "That's more than what's left (₱{X}). ₱{P} is waiting for you to confirm."
- AC-26.3 Given pending claims cover the whole remaining amount, then "Record payment" and "Mark fully paid" are hidden; Confirm and Decline are the actions.
- AC-26.4 I can Undo any payment on my Owed to you lines, whoever recorded or confirmed it.
- AC-26.5 On my You owe lines I can't Undo payments; only claim (US-20).

**US-27. Mark all as paid on a joined card**
- AC-27.1 Given my joined card has something left to claim on You owe lines or something left to record on Owed to you lines, then "Mark all as paid" shows at the end of the open card.
- AC-27.2 Its confirmation ("Mark everything as paid?") reads:
  - with only You owe amounts: "This tells the people you owe on “{title}” that you've paid them {₱Y}, one payment per person. Each counts once it's confirmed, and you can withdraw any of them until then."
  - with both: "This records the {₱X} still owed to you as received, and tells the people you owe that you've paid them {₱Y}. What you've paid counts once it's confirmed."
  - with only Owed to you amounts: today's `markAllMessage`.
- AC-27.3 When I confirm, then each You owe line with something left to claim gets one claim for that amount, and each Owed to you line gets one payment for what's left minus pending.
- AC-27.4 The claims go as one all-or-nothing request and the payments as another. If one fails, it alone is undone on screen and the banner says "Couldn't send what you've paid. Nothing was sent. Try again." or today's payment refusal; the other side stands.

**US-28. Totals, sections and summaries with pending claims** (hand-off)
- AC-28.1 Given I owe ₱500.00 and have ₱500.00 pending, then the strip's "You owe" still counts ₱500.00, the card stays in Outstanding, its "X of Y settled" doesn't count that line, and the collapsed card adds "₱500.00 waiting for confirmation".
- AC-28.2 Given a claim of mine is declined, then no figure changes.
- AC-28.3 Given a claim waits on me (as the creditor or as the organizer for others), then the collapsed card adds "1 payment to confirm" or "{N} payments to confirm".

**US-29. Removal, Stop tracking and delete with claims**
- AC-29.1 Given a participant with pending or declined claims stops tracking or is removed, then their claims go with them, and the creditor's or organizer's waiting entries disappear on the next load.
- AC-29.2 The Stop tracking message gains, only when I have pending claims: "Any payment you've said you made that's still waiting for confirmation is withdrawn."
- AC-29.3 The Remove message gains, only when that account has pending claims: "Any payment they've said they made that's still waiting is withdrawn."
- AC-29.4 Given a creditor participant leaves or is removed, then claims sent *to* them stay pending, and the organizer now decides them (US-23).

### Business rules (PR 2)

**Who can do what**
- **BR-C1** Only a participant whose member is the debtor on a line can claim on it. The organizer never claims: when the organizer is the debtor, "I paid" records a payment at once, as today (I-7).
- **BR-C2** Only the decider can confirm or decline a claim (see Definitions). The server also lets the organizer decide any claim, but the app offers it to the organizer only when the creditor isn't on Hati, so a creditor who is on Hati isn't overruled from the organizer's screen.
- **BR-C3** A payment recorded by a line's creditor (organizer or participant) or by the organizer on their own lines counts at once (I-7). A participant records payments only on lines where they're the creditor.
- **BR-C4** A participant can undo payments only on lines where they're the creditor. The organizer's undo is unchanged.
- **BR-C5** Only the account that sent a claim can withdraw it (while pending) or dismiss it (once declined).

**Lifecycle**
- **BR-C6** A claim is pending until confirmed, declined or withdrawn. There's no expiry.
- **BR-C7** Confirming turns the claim into a payment of the same amount on the same pair, timed when the debtor sent it (that's when they say the money moved), and the claim no longer exists. The payment then behaves like any other: it can be undone by those allowed (BR-C4), which doesn't bring the claim back.
- **BR-C8** Declining keeps the claim as declined, visible only to the debtor, until they dismiss it, or leave or are removed. The creditor and organizer stop seeing it.
- **BR-C9** Withdrawing deletes a pending claim. A decided claim can't be withdrawn.

**Money**
- **BR-C10** Everything is whole centavos, as in Collection today (BR-11).
- **BR-C11** What's left to claim on a line is remaining minus P. A new claim is above ₱0.00, at most 2 decimals, and at most that. The client checks it and the server checks it again under the session lock.
- **BR-C12** Confirming re-checks that the claim is at most the line's remaining amount at that moment; otherwise it's refused (AC-21.5) and nothing changes. So a line can never be overpaid through a claim.
- **BR-C13** A creditor's or organizer's direct payment on a line is capped at remaining minus P, so recording a payment can't make a pending claim impossible to confirm. "Mark fully paid" and "Mark all as paid" use that amount, and skip a line where it's ₱0.00.
- **BR-C14** Totals, line status ("Unpaid", "Partial", "Paid"), "Paid ₱X · ₱Y left", "X of Y settled", the Settled date and the strip all count confirmed payments only. Pending amounts are shown beside them, never in them. Reason: pending means "said, not agreed", and `session_payments` keeps meaning confirmed money (architect A1).

**Sections**
- **BR-C15** A card with any claim waiting on this account is never in Settled: it's in Outstanding, or stays in Needs setup if the organizer hasn't said who they are. Reason: Settled means nothing is left for you to do, and an unanswered claim is something to do. It also keeps such a card out of the collapsed Settled section, where it would go unseen without notifications.
- **BR-C16** A debtor's own pending claims don't move a card: its lines still have remaining above ₱0.00, so it's in Outstanding anyway.
- **BR-C17** Removing or leaving deletes the claims that account sent, pending and declined. Claims sent to that account's member stay, and pass to the organizer as decider (AC-29.4).
- **BR-C18** "Already settled" isn't offered, on the card or in the question, for a session with any pending claim. Reason: it records full payments on every pair, which would make every pending claim unconfirmable.

**Copy rules**
- **BR-C19** The waiting text names the decider: the creditor's member name when the creditor is on Hati, else the organizer's profile name, else "the organizer".
- **BR-C20** The participant's You owe buttons read "I've paid" and "I've paid it all", because they send a claim rather than record a payment. The organizer's You owe buttons keep "I paid" and "Mark fully paid", because theirs still record at once.

### Edge cases (PR 2)

| # | Case | Expected |
|---|---|---|
| E2-1 | Several pending claims on one line (₱100 today, ₱150 tomorrow) | Allowed while their sum is at most what's left; each is its own entry, newest first; each is confirmed, declined or withdrawn on its own. |
| E2-2 | The creditor records a cash payment directly while a claim for the same money is pending | Capped by BR-C13. If the creditor wants to record it themselves, they decline the claim first. |
| E2-3 | A confirmed payment is undone by the creditor | The debtor's line goes back up on their next load; no claim returns (BR-C7). |
| E2-4 | Both creditor and organizer try to decide the same claim | The first wins; the second gets AC-21.6 or AC-24.3-style "no longer waiting" copy. |
| E2-5 | The debtor's account is removed with a declined note showing | The note goes with the account (BR-C17). |
| E2-6 | A participant has no lines | No claim or record actions; the card is Settled with "Nothing to collect. You're even with everyone." |
| E2-7 | The organizer is "not in this session" and Ben claims to Carla, who isn't on Hati | The organizer's card (no lines of their own) shows "To confirm for others" and sits in Outstanding (BR-C15). |
| E2-8 | Old organizer tab on an earlier build | It doesn't see claims. A participant's claim waits until the organizer loads the new build (architect section 6: accepted for testing). |
| E2-9 | A claim waits for weeks unseen | No notifications (I, C1). It shows the next time the decider opens Collection: as "N payments to confirm" on the card, kept out of Settled by BR-C15. |
| E2-10 | Twenty-member session where Ben owes 5 people | "I've paid it all" on each line, or Mark all, which sends 5 claims in one request. |
| E2-11 | Phone | The pending, declined and to-confirm entries wrap their buttons under the text inside `@media (max-width: 640px)`, as payment history rows do today. |

---

## PR 3: the QR on the SOA and on screen

### Scope

**In:** a hand-written QR encoder (no dependency, I-2); the QR in the Invite members dialog; the clickable link and QR on the organizer's SOA exported from History for a finished session; the fallback when the link can't be fetched; manual scan checks.

**Out:** an in-app scanner; a QR for drafts or on a participant's SOA; a QR in any other place; changing the SOA's other content.

### User stories and acceptance criteria

**US-30. The QR on screen**
- AC-30.1 Given the Invite members dialog shows a link, then above "Copy link" it shows the link's QR, about 200px square, with the caption "Scan with a phone camera to join.", and alternative text "QR code for the invite link to {title}".
- AC-30.2 The QR is dark on a white tile with its quiet zone, in light and dark mode alike (an inverted code doesn't scan reliably).
- AC-30.3 After "Reset link", the QR changes with the link.
- AC-30.4 Scanning it with the iPhone Camera app and an Android camera app opens the link in the phone's browser (manual check, owner and ui-ux-tester).

**US-31. The link and QR on the organizer's SOA**
- AC-31.1 Given I'm the organizer and tap "↓ Download SOA" on a finished session's History detail, then page 1 of the PDF carries, below the header and before the settlement, a block with the QR on the left and on the right: "Track what you owe on Hati", "Scan with your phone camera, or open:", and the full link in the mono font as a clickable link.
- AC-31.2 Tapping the link or the QR in a PDF viewer opens the invite link.
- AC-31.3 The link printed is the one in the Invite members dialog at that moment, minted first if the session had none (D6).
- AC-31.4 A printed SOA's QR scans with both camera apps (manual check).
- AC-31.5 The rest of the statement is unchanged, and page 1 still fits as it does today, including for 20 members.

**US-32. Export when the link can't be fetched** (hand-off)
- AC-32.1 Given the link can't be fetched as I export, then the SOA still downloads, without the block, and under the button I see "Downloaded without the invite QR, because the link couldn't be loaded. Download again to include it."
- AC-32.2 The next successful export includes the block.

**US-33. Where the QR never appears**
- AC-33.1 Given a draft's SOA from Summary, then no link or QR (I-3).
- AC-33.2 Given a participant's SOA from History detail, then no link or QR (BR-V8).

### Business rules (PR 3)

- **BR-Q1** The QR encodes exactly the invite link text, nothing more.
- **BR-Q2** The QR is drawn only for a link the organizer's screen has just fetched; it's never cached past a reset.
- **BR-Q3** The on-screen QR is always dark modules on white with a 4-module quiet zone, regardless of theme.
- **BR-Q4** The SOA block appears only on the organizer's export of a finished session from History detail.
- **BR-Q5** If the link can't be fetched, the SOA exports without the block and says so (AC-32.1). Reason: the statement's job is what people owe, which shouldn't wait on an add-on; the note makes sure the organizer doesn't send a QR-less copy without knowing.
- **BR-Q6** A participant's export never includes the link or QR. Participants can't see the link (BR-O3), and an export is the same content they already have.
- **BR-Q7** SOAs downloaded before PR 3 have no QR, and SOAs downloaded before a reset carry a dead link; this is expected (AC-3.1 says so to the organizer).

### Edge cases (PR 3)

| # | Case | Expected |
|---|---|---|
| E3-1 | A long origin (one-off deployment URL) | The link still fits the encoder's range (architect: up to 213 bytes); the printed link wraps. The one-off URL caveat is a known limitation (D9). |
| E3-2 | Exported on localhost | The QR carries a localhost link, useless to others; expected (architect, environments). |
| E3-3 | Dark mode, phone width | The white tile and caption fit at 375px without horizontal scroll. |
| E3-4 | The link is reset after an SOA was sent | The old QR gives the dead-link message (AC-8.1). |

---

## Onboarding: the tour, the guides, offers and What's new

**Ordering for a link opened at sign-in (all PRs from PR 1)**
- **BR-G1** The join flow (checking, the join dialog, or its outcome message) runs once the first load has landed and the profile has loaded, and goes before anything else: the welcome, What's new, a guide offer and "Already settled?" all wait until it closes. They are held, not lost.
- **BR-G2** When the join flow closes, the usual sequence carries on, on the screen it landed on. A brand-new account gets "Welcome to Hati!" and the tour as today, which starts from Home and comes back to Collection at its "Track who has paid" step. A returning account gets What's new if it's due.
- **BR-G3** The join flow counts as the visit's one-time prompt (BR-TG8). Landing on Collection after joining therefore never brings the Collection guide's offer on that same visit; it can come on a later visit.
- **BR-G4** "Already settled?" doesn't open over the join flow (it adds to `canAsk`'s conditions), and is judged afresh after it.
- **BR-G5** The join flow never opens during the tour or a guide. On a fresh load neither is running, so in practice this only means a stash read late must wait for them to end.

**The tour and the Collection guide**
- **BR-G6** No new step in the first-run tour or the Collection guide, and no change to their copy.
- **BR-G7** No new `data-tour` attribute. "Invite members", the dialog, "Shared by", "You joined as … · Stop tracking", pending, declined and to-confirm entries, "I've paid", and the QR carry none.
- **BR-G8** No existing target moves, is renamed or is duplicated. `collection-totals`, `collection-unsettled`, `collection-outstanding`, `collection-settled`, `collection-owed`, `collection-mark-all`, `nav-collection` and `nav-history` stay on the same elements. A joined card's Owed to you group and Mark all are the same elements as an organizer's, so they carry the same targets as they do today, and only one card is open at a time.
- **BR-G9** The practice scenes (K1 to K3, and the Expenses scenes) are organizer sessions with no participants and no claims, and "Invite members" is hidden in practice (AC-1.9). So nothing new appears in a guide, and nothing in a guide calls the invite, participants or claims routes. `steps.test.ts`, `targets.test.ts` and `guides/guides.test.ts` should pass unchanged.

**What's new:** whether, and in which PR, to bump `WHATS_NEW_VERSION` to announce this is Q2.

---

## Out of scope (all PRs)

Notifications (email or push), polling, realtime, badges or counts on the Collection tab; an in-app scanner; Clerk email lookup; editing or reopening finished sessions; invites for drafts; several links per session, or turning invites off; importing or copying a session; currency; a configurable link origin; stg and prod; a participant changing member in place (BR-J9); the organizer recording payments on lines that aren't theirs; a native share sheet for the link; a prompt to invite right after Finish; a new guide step about joined sessions.

**Later, if testers ask:** a strip note for pending amounts; a badge for claims waiting on you; native share; an undo for organizer-confirmed claims on others' lines (if Q3 is answered "not now").

## Traceability

| Requirement | Reason |
|---|---|
| US-1, US-3, BR-J1, BR-J2 | I-2, I-3, D6 |
| US-2, US-4, BR-O4 to BR-O9 | I-8, D3, hand-off (wrong claims, reset) |
| US-5, US-6, BR-J3 to BR-J5 | I-4, E1 |
| US-7, US-8, US-9, BR-J6, BR-J7 | I-5, architect (uniform 404) |
| US-10, US-11, BR-V1 to BR-V8 | I-6, D1, hand-off (buckets, SOA) |
| US-12, BR-V9, BR-V10 | intake hand-off ("Stop tracking") |
| US-13, BR-O10 | D5, hand-off (delete wording) |
| US-14, BR-O11 | architect section 5 (organizer's `me`) |
| US-15, BR-O12 | D2, C1 |
| BR-R1, BR-R2 | D4 |
| US-20 to US-29, BR-C1 to BR-C20 | I-7, A1, hand-off (pending, declined, withdraw, mark all) |
| US-30 to US-33, BR-Q1 to BR-Q7 | I-2, I-3, D8, D9, hand-off (participant SOA, export fallback) |
| BR-G1 to BR-G9 | hand-off (tour, offers, What's new), CLAUDE.md onboarding rules |

## Open questions for the owner

1. **Q1. When you remove a joined account, should "Also reset the invite link" start ticked or unticked?** Recommended: unticked. Most wrong picks are honest mistakes, and leaving the link alone means the SOAs already sent keep working for everyone who hasn't joined. You tick it when you don't recognise who joined.
2. **Q2. Should What's new announce this, and when?** Recommended: yes, once, bumping to version 3 with PR 2. Until PR 2, joined members can only look, so the announcement is worth more once "I've paid" exists, and PR 3's QR doesn't need its own.
3. **Q3. When you confirm a claim on someone else's line (the creditor isn't on Hati), can it ship without an undo on your screen?** Recommended: yes, ship with the "Confirm this payment?" check (AC-23.2) and add an undo later if testers need one. These lines aren't on your card, so an undo needs a new place to show them.
4. **Q4. Should PR 1 go to uat on its own, or together with PR 2?** Recommended: together. With PR 1 alone, testers who join can only look, and "Shared by … records the payments" is all they get. That tests joining but not the reason for joining.

## Owner answers (2026-11-20)

- **Q1.** "Also reset the invite link" starts **unticked** when removing a joined account.
- **Q2.** What's new announces the feature **once, as version 3, shipping with PR 2**.
- **Q3.** The organizer confirming a claim on a line whose creditor isn't on Hati **ships without an undo**, guarded by "Confirm this payment?". An undo can come later if testers ask for one.
- **Q4.** PR 1 and PR 2 are built and reviewed separately but **go to uat together**. PR 1 isn't promoted beyond `main` on its own.
