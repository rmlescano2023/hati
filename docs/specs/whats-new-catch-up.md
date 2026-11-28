# Spec: cumulative "What's new" (catch-up)

Status: **draft, awaiting the owner's approval.** Branch `whats-new-catch-up`, read at `0996585`
(up to date with `origin/main`).

## 1. Summary

"What's new in Hati" shows one release's text, hard-coded in `src/App.tsx`, so an account that missed v1 or
v2 never hears about Collection, Your name, Receipts item by item or Guides. This change keeps every
release's notes in one list in `src/lib/whatsNew.ts`, picks the ones newer than the account's seen version
with a pure function, and renders them in the same once-only dialog: the current release under "Latest",
older unseen ones under "Earlier", headings only when there is an "Earlier". The dialog gains an opt-in
scroll layout so seven notes fit on a phone with the title and buttons always on screen.

No schema, API or version change. `WHATS_NEW_VERSION` stays 3, `whatsNewDue` is unchanged, and marking seen
still stamps 3 through the existing PUT.

Source: `docs/specs/whats-new-catch-up-requirements.md` (BR-WC1 to WC10, US-WC1 to WC5), with the owner's
answers of 2026-11-28 (OQ-1 no headings without "Earlier", OQ-2 preview shows seen 0, OQ-3 wordings kept
word for word), recorded in its section 8.

**One change from the approved approach.** The dialog markup moves from `App.tsx` into a small
`src/components/onboarding/WhatsNewDialog.tsx`, the way `GuideOfferDialog.tsx` already sits beside it. The
reason is testing: `App.tsx` can't be rendered statically, but a separate component can, so the headings,
note order and buttons for each seen version get Vitest coverage in `dialogs.test.ts` (static markup, no
jsdom). `App.tsx` keeps every handler, including the v2 "Show me how" one; only the markup moves.

## 2. Layers touched

| Layer | File | Change |
|---|---|---|
| Logic | `src/lib/whatsNew.ts` | Add `WhatsNewNote`, `WhatsNewNotes`, `WHATS_NEW_NOTES`, `whatsNewNotes()`. `WHATS_NEW_VERSION` and `whatsNewDue` untouched. |
| Client state | `src/hooks/useOnboarding.ts` | Keep the raw `whatsNewVersion` from the existing GET in state and return it as `whatsNewSeen`. |
| UI | `src/components/onboarding/OnboardingDialog.tsx` | New opt-in `scrollable` prop (default `false`), like `stacked`: adds a class and makes the message keyboard-focusable only while it actually overflows. |
| UI | `src/components/onboarding/OnboardingDialog.module.css` | `.scrollable` rules (caps the body to the screen, the message scrolls); `.notesHeading`. |
| UI | `src/components/onboarding/WhatsNewDialog.tsx` (new) | Renders the notes, the headings and the one or two buttons. |
| UI | `src/App.tsx` | Replace the hard-coded What's new `OnboardingDialog` with `WhatsNewDialog`; drop the now-unused `onboardingStyles` import. |
| Tests | `src/lib/whatsNew.test.ts`, `src/components/onboarding/dialogs.test.ts` | See section 8. |
| Types, schema, API, PDF, tour | none | |

Reused as is: `OnboardingDialog` (shell, Escape handling, no backdrop dismiss), `onboardingStyles.points`,
`Button`, `startTutorial`, `closeWhatsNew`, `markWhatsNewSeen`, and the scroll pattern of
`src/components/home/IncludeMemberDialog.module.css` (`.body` capped at `100dvh - 2rem - 8px`, the list
`min-height: 0; overflow-y: auto; overscroll-behavior: contain`).

No existing static markup test renders the What's new dialog today (it lives only in `App.tsx`).

## 3. Data model

None. `whats_new_version` is read and written exactly as today.

## 4. API contract

None. `GET /api/user` already returns `whatsNewVersion` (`null` if never set); `PUT /api/user` with
`{ mark: 'whatsNew' }` already stamps `greatest(coalesce(whats_new_version, 0), WHATS_NEW_VERSION)`.

## 5. Business logic (`src/lib/whatsNew.ts`)

No money rules.

### 5.1 The notes

Add, below `WHATS_NEW_VERSION`:

```ts
/** One feature note in "What's new". `showMeHow` marks the note whose dialog offers the Expenses guide (BR-WC4). */
export type WhatsNewNote = { version: number; title: string; body: string; showMeHow?: true };
```

`WHATS_NEW_NOTES: readonly WhatsNewNote[]` lists every note, **newest release first, each release's notes in
the order they shipped**, so filtering keeps the order BR-WC3 needs. Its doc comment says why: each
release's text is the text it shipped with, and a new release adds its notes at the top and bumps
`WHATS_NEW_VERSION`.

The strings are exactly what each release rendered, including its typography: curly double quotes where
the JSX had `&ldquo;`/`&rdquo;` or `“ ”`, straight apostrophes where it had `&apos;`.

| version | title | body |
|---|---|---|
| 3 | `Joined sessions.` | `On a finished session, tap Share with members and share the link. Each person signs in, picks who they are, and follows what they owe or are owed in their own Collection.` |
| 3 | `“I've paid.”` | `Members who joined can tell you they've paid. It waits until you confirm or decline it, so you both end up with the same figures.` |
| 3 | `Collection and History.` | `Collection now shows only what's still being paid; settled sessions are in History.` |
| 2 | `Receipts, item by item.` | `In Custom Amounts, type a receipt the way it's printed: what each person had, dishes people shared, discounts like PWD or senior, and service charges. Hati works out each person's share.` |
| 2 | `Guides.` (`showMeHow: true`) | `Tap “Need help?” on Expenses or Collection for a quick practice run, or open Tutorials in your account menu.` |
| 1 | `Collection.` | `A new tab for finished sessions: see who owes you and who you owe, and record payments as they come in, even part payments.` |
| 1 | `Your name.` | `Set it in Profile, in your account menu, so Hati knows which member is you.` |

Sources: v3 from `src/App.tsx` on `main`, v2 from `1c43f95:src/App.tsx`, v1 from `e845b07:src/App.tsx`.

### 5.2 The selection

```ts
export type WhatsNewNotes = {
  /** The current release's notes, shown under "Latest" (or with no heading when `earlier` is empty). */
  latest: WhatsNewNote[];
  /** Every older release's unseen notes, newest release first, shown under "Earlier". */
  earlier: WhatsNewNote[];
  /** Whether the Guides note is among them, which adds "Show me how" (BR-WC4). */
  showMeHow: boolean;
};

export function whatsNewNotes(
  seenVersion: unknown,
  notes: readonly WhatsNewNote[] = WHATS_NEW_NOTES,
  current: number = WHATS_NEW_VERSION,
): WhatsNewNotes
```

Rules:

1. `seen = typeof seenVersion === 'number' ? seenVersion : 0`, the same reading as `whatsNewDue` (BR-WC1).
2. `latest = notes.filter(n => n.version === current && n.version > seen)`.
3. `earlier = notes.filter(n => n.version > seen && n.version < current)`.
4. `showMeHow = [...latest, ...earlier].some(n => n.showMeHow === true)`.

So a note above `current` (written ahead of a bump) never shows, and a seen version at or above `current`
gives empty lists. `notes` and `current` are parameters only so the AC-WC4.1 future-v4 case can be tested
without shipping v4; the doc comment says so. Production code always calls `whatsNewNotes(seen)`.

`whatsNewDue` stays as it is. The tests pin that it is true exactly when `whatsNewNotes` returns at least
one note (BR-WC2), and that `WHATS_NEW_VERSION` equals the highest version in `WHATS_NEW_NOTES`.

## 6. UI

### 6.1 `useOnboarding.ts`

- Add state `const [whatsNewSeen, setWhatsNewSeen] = useState<unknown>(null);`.
- In the GET, next to `setNewDue(...)`: `setWhatsNewSeen(body.whatsNewVersion);`.
- Add to `Result`, after `whatsNewDue`:
  `/** The account's last seen "What's new" version as read, unparsed; whatsNewNotes() reads it (BR-WC1). */ whatsNewSeen: unknown;`
  and return it.
- Nothing else changes. A failed read leaves `whatsNewDue` false, so no dialog opens (BR-W8, AC-WC1.6).

### 6.2 `OnboardingDialog.tsx`

Add an optional prop, documented like `stacked`:

```ts
/** Lets a long message scroll inside the dialog, so the title and buttons stay on screen (What's new, BR-WC9). */
scrollable?: boolean;
```

- `<dialog className={`${styles.dialog} ${scrollable ? styles.scrollable : ''}`} …>`.
- A `messageRef` on the `.message` div, and `const [overflows, setOverflows] = useState(false)`.
- A second `useEffect`, declared **after** the `showModal` one, with deps `[open, scrollable]`: return early
  unless `scrollable && open && messageRef.current && typeof ResizeObserver !== 'undefined'` (the guard
  `GuideTour.tsx` uses). Otherwise observe the message with a `ResizeObserver` whose callback sets
  `overflows` to `message.scrollHeight > message.clientHeight`; the cleanup disconnects and calls
  `setOverflows(false)`.
- The message div gets `tabIndex={scrollable && overflows ? 0 : undefined}`.
- Comment, in full sentences, why: the notes hold no focusable element, so without a tab stop a keyboard
  user can't scroll them in every browser (AC-WC5.4); it's added only while they overflow, so a dialog whose
  notes fit has the same tab order as today. It's set after `showModal`, so the first focus still goes to
  the first button, as today; the reset on close keeps a reopened dialog from starting with a stale tab
  stop. The observer also catches a phone being turned.

With `scrollable` absent, the rendered markup and behaviour of the welcome, "You're all set!", "Already
settled?" (both steps), Tutorials and both guide offers are byte-for-byte unchanged: no class, no
`tabindex`, no observer. That is why the scroll layout is opt-in rather than applied to `.message` for
every dialog: an `overflow` on Tutorials' or "Already settled?"'s message would clip the focus rings of the
buttons and checkboxes inside it, and "Already settled?" already scrolls its own list.

### 6.3 `OnboardingDialog.module.css`

Add after `.points` (outside any media query, because a short desktop window needs it too, AC-WC5.4; it
changes nothing on desktop or phone while the notes fit):

```css
/* A long message scrolls inside the dialog, so the title and buttons stay on
   screen. The cap matches IncludeMemberDialog's: it keeps the dialog inside
   the browser's own limit for a modal, so the dialog itself never scrolls. */
.scrollable .body {
  max-height: calc(100vh - 2rem - 8px);
  max-height: calc(100dvh - 2rem - 8px);
}

.scrollable .message {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

/* "Latest" and "Earlier": real headings under the dialog's h2, sized as labels. */
.notesHeading {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
}

.notesHeading ~ .notesHeading {
  margin-top: 6px;
}
```

How it works: `.body` is already a flex column. Capped, it shrinks its children; the title and the actions
can't shrink below their content, and the message, a scroll container, can, so only it gives up height.
Nothing goes under `@media (max-width: 640px)` because no rule is phone-only. Buttons keep their existing
38px phone minimum from `Button.module.css`.

### 6.4 `WhatsNewDialog.tsx` (new)

```ts
type Props = {
  open: boolean;
  notes: WhatsNewNotes;
  /** "Got it" and Escape. */
  onClose: () => void;
  /** "Show me how": the caller closes the dialog and starts the Expenses guide. */
  onShowMeHow: () => void;
};
```

Renders `<OnboardingDialog open={open} scrollable title="What's new in Hati" message={…} onDismiss={onClose}>`.

- **Message:** one `<div className={styles.points}>` (`styles` is `OnboardingDialog.module.css`). A `div`, not
  today's `span`, because it now may hold headings; it's `display: flex` either way, so it renders the same.
  Inside, in order:
  - if `earlier.length > 0`: `<h3 className={styles.notesHeading}>Latest</h3>`;
  - each `latest` note as `<span key={title}><strong>{title}</strong> {body}</span>` (the space between
    them on the same JSX line, as today's markup has);
  - if `earlier.length > 0`: `<h3 className={styles.notesHeading}>Earlier</h3>`, then each `earlier` note
    the same way.
  - A comment says why there are no headings otherwise: one heading over one group says nothing, and the
    common case keeps today's look (OQ-1).
- **Buttons**, when `notes.showMeHow`: `<Button variant="ghost" onClick={onClose}>Got it</Button>` then
  `<Button variant="primary" onClick={onShowMeHow}>Show me how</Button>` (v2's markup).
- **Otherwise:** today's v3 comment and button, reworded for the condition:
  `{/* No guide covers the notes shown, so there is no "Show me how" to point at the wrong thing. */}` and
  `<Button variant="primary" onClick={onClose}>Got it</Button>`.
- A one-line doc comment: the once-only "What's new" (BR-WC1 to WC5); Escape is "Got it".

### 6.5 `App.tsx`

- Import `WhatsNewDialog` from `./components/onboarding/WhatsNewDialog` and `whatsNewNotes` from
  `./lib/whatsNew`. Remove `import onboardingStyles …` (its only use is the block being replaced).
- Destructure `whatsNewSeen` from `useOnboarding()`.
- Replace the `<OnboardingDialog open={whatsNewOpen} title="What's new in Hati" …>…</OnboardingDialog>`
  block (lines 582 to 609) with:

```tsx
<WhatsNewDialog
  open={whatsNewOpen}
  // The preview shows what an account that has seen nothing would, the longest list (OQ-2).
  notes={whatsNewNotes(whatsNewPreview ? 0 : whatsNewSeen)}
  onClose={closeWhatsNew}
  onShowMeHow={() => {
    // A previewed What's new writes nothing, so neither does the guide it starts.
    const mark = !whatsNewPreview;
    closeWhatsNew();
    startTutorial('expenses', 'menu', mark);
  }}
/>
```

- `whatsNewOpen`, `closeWhatsNew`, `whatsNewPreview` and every wait (welcome, tour, guide, offer, join
  flow) are unchanged, so when the dialog opens and what closing it writes stay exactly as today (BR-WC2,
  BR-WC5, BR-WC8). `DevSessionsBar` is unchanged.

### 6.6 What the reader sees

| Account | Phone (375 wide) and desktop |
|---|---|
| seen 0, null or unreadable; and the dev preview | "Latest" with the three v3 notes, "Earlier" with Receipts, Guides, Collection, Your name. "Got it" (ghost) and "Show me how" (primary, last), side by side as in v2. At 375×667 and 667×375 the notes scroll; the title and buttons don't move. On a tall desktop window it may all fit with no scroll bar. |
| seen 1 | "Latest" with the v3 notes, "Earlier" with Receipts and Guides; both buttons. |
| seen 2 (every real tester today) | The three v3 notes, no headings, one primary "Got it": identical to `main`. |
| seen 3 or more, or the read failed | No dialog. |

## 7. Onboarding tour impact

None. No `data-tour` attribute is added, moved, renamed or duplicated, and no step changes. The tour's
intro and sign-off dialogs use `OnboardingDialog` without `scrollable`, so their markup is unchanged.
`steps.test.ts`, `targets.test.ts` and `guides/guides.test.ts` are run as a check.

## 8. Test plan

Static Vitest only.

**`src/lib/whatsNew.test.ts`** (extend; keep the existing `whatsNewDue` tests):

| Test | Covers |
|---|---|
| `WHATS_NEW_VERSION` equals the highest `version` in `WHATS_NEW_NOTES` | BR-WC1, approach |
| `WHATS_NEW_NOTES` equals the section 5.1 table exactly (version, title, body, and `showMeHow` only on Guides), in order | Section 3 of the requirements, OQ-3 |
| seen `null` and `0`: `latest` titles are Joined sessions., “I've paid.”, Collection and History.; `earlier` titles are Receipts, item by item., Guides., Collection., Your name.; `showMeHow` true | AC-WC1.1 |
| seen `1`: same `latest`; `earlier` is Receipts, item by item., Guides.; `showMeHow` true | AC-WC1.2 |
| seen `2`: same `latest`; `earlier` empty; `showMeHow` false | AC-WC1.3 |
| seen `3` and `4`: both lists empty, `showMeHow` false | AC-WC1.4 |
| seen `'1'`, `undefined` and `{}`: equal to the seen-0 result | AC-WC1.5 |
| for each of `null, 0, 1, 2, 3, 4, '1'`: `whatsNewDue(onboarded, s)` equals "any note returned" | BR-WC2 |
| with a test list of two v4 notes plus `WHATS_NEW_NOTES` and `current` 4: seen 2 gives `latest` = the v4 notes and `earlier` = the three v3 notes; seen 3 gives only the v4 notes and empty `earlier` | AC-WC4.1 |
| with a v4 note in the list but `current` 3: seen 2 doesn't include it | BR-WC1 upper bound |

**`src/components/onboarding/dialogs.test.ts`** (new `describe('WhatsNewDialog', …)`, rendering with
`renderToStaticMarkup(createElement(WhatsNewDialog, { open: true, notes, onClose: noop, onShowMeHow: noop }))`
and the file's existing `text()` helper):

| Test | Covers |
|---|---|
| seen 0: contains `<h3` "Latest" before the first v3 title, `<h3` "Earlier" after the last v3 title and before Receipts; all seven titles in order; "Got it" before "Show me how" | AC-WC1.1, AC-WC5.4 (real headings) |
| seen 1: both headings; Receipts and Guides after "Earlier"; no "Collection." note and no "Your name."; both buttons | AC-WC1.2 |
| seen 2: no `<h3`, no "Latest", no "Earlier"; the three v3 notes in full; "Got it" present, "Show me how" absent | AC-WC1.3, AC-WC5.5 (no headings) |
| any: no `tabindex` in the static markup (the tab stop only appears while overflowing) | 6.2 |
| reads `OnboardingDialog.module.css` with `readFileSync` (as `QrCode.test.ts` does): the `.scrollable .message` block has `overflow-y: auto`, and the plain `.message` block has no `overflow` | BR-WC9, other dialogs unchanged |

**Checks for the ui-ux-tester** (local `npm run dev:full`, the dev bar's "Preview What's new" for the seen-0
view, and a real seen-2 account on uat for the rest):

- AC-WC5.1 to WC5.3: preview at 375×667 and at 667×375: title, start of "Latest" and both buttons visible
  without scrolling; swiping the notes reaches Your name with both buttons visible and tappable throughout;
  the page behind doesn't move; no scroll bar on the dialog itself.
- AC-WC5.4: desktop, window about 500px tall, preview: Tab or Shift+Tab reaches the notes, Arrow and Page
  Down scroll them; a screen reader lists "Latest" and "Earlier" as headings. First focus is the first
  button; a browser that makes scrollers focusable on its own may put it on the notes instead, which is
  also fine.
- AC-WC5.5: a seen-2 account (or `main` side by side) on desktop and at 375px: identical to `main`, no
  scroll bar, no headings, a single "Got it".
- AC-WC2.1 and WC2.3 on the preview: "Got it" and Escape close it where you were; a backdrop click does
  nothing. On the seen-2 uat account: "Got it", reload, it doesn't return.
- AC-WC2.2 on the preview: "Show me how" closes it and starts the Expenses guide; the guide's offer still
  shows later (the preview wrote nothing).
- AC-WC3.1 and AC-WC1.6: a new account gets the welcome and tour, and no What's new after a reload; these
  paths are unchanged code, so a quick regression pass is enough.
- The welcome, "You're all set!", Tutorials, both guide offers and "Already settled?" (both steps) look and
  tab exactly as on `main` at 375px and desktop.

Also run `steps.test.ts`, `targets.test.ts`, `guides/guides.test.ts`, then `npm run lint`, `npx tsc -b`,
`npm test`, `npm run build`.

## 9. Documentation impact

For the documentation-engineer when asked: the user-facing description of "What's new" now lists every
release since the account last looked (Latest and Earlier), with "Show me how" only when Guides is listed;
the developer note that a release adds its notes at the top of `WHATS_NEW_NOTES` and bumps
`WHATS_NEW_VERSION` (the test enforces they agree); and the dev preview showing the seen-0 view. No repo
doc outside `docs/specs/` mentions What's new today.

## 10. Tasks

1. `src/lib/whatsNew.ts`: add the type, `WHATS_NEW_NOTES` (section 5.1, strings copied exactly) and
   `whatsNewNotes` (5.2). Write the `whatsNew.test.ts` cases first and see the new ones fail, then pass.
2. `src/hooks/useOnboarding.ts`: `whatsNewSeen` state, set and returned (6.1).
3. `OnboardingDialog.tsx` and `.module.css`: the `scrollable` prop, observer and tab stop (6.2), and the CSS
   (6.3).
4. `WhatsNewDialog.tsx` (6.4), with its `dialogs.test.ts` cases written first.
5. `App.tsx` (6.5): swap in `WhatsNewDialog`, remove the `onboardingStyles` import.
6. Run the tour tests, then lint, `tsc -b`, `npm test`, `npm run build`; check the preview at 375×667,
   667×375 and desktop in `npm run dev:full` and give the owner the local URL.

## 11. Risks and effort

- **Wording drift** in copying the notes: pinned by the exact-table test, with sources named in 5.1.
- **The 3-note dialog changing look**: the only differences in that case are a `div` for a `span` (both
  `display: flex`) and a scroll container that doesn't overflow; a static test pins "no headings, one
  button", and the tester compares against `main`.
- **Other dialogs changing**: the layout is opt-in, and a static test pins that plain `.message` has no
  overflow.
- **`dvh` support**: the `100vh` line before it is the fallback, as in `IncludeMemberDialog`.
- **Delivery order (BR-WC10)**: ship this before v3 is promoted to uat; devops should hold the uat
  promotion until it's on `main`.

Size: **small**. Risk: **low**.

## 12. Decisions for the user

None blocking. One thing to confirm when approving:

- **The dialog markup moves into `WhatsNewDialog.tsx`** instead of staying inline in `App.tsx` (section 1).
  It keeps the approved behaviour and handlers and makes the headings and buttons testable statically.
  Recommended. The alternative, keeping it inline, leaves AC-WC1.1 to WC1.3 at the markup level to the
  tester only.
