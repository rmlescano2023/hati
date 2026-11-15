# Spec: a clear button inside the Expenses form's text and amount boxes

Status: **pre-approved by the owner for the build** (2026-11-15). Branch `feature-custom-orders`; it
ships with custom orders (`docs/specs/custom-orders.md`), which is built but not yet reviewed.

## 1. Summary

Each of the seven boxes in the requirements' section 3 shows a grey counter-clockwise arrow (↺) at its right edge
whenever it shows any text. One tap empties the box, brings its placeholder back and puts the cursor
in it. Everything derived from the box updates exactly as if the text had been deleted by hand,
because the clear runs the box's own `onChange`.

It's built once, as `ClearableInput` in `src/components/shared/`. The seven call sites swap their
`<input>` for it and keep every attribute they have today. There's no type, schema, API, `src/lib`
or PDF change.

Source: the business-analyst's requirements,
[`docs/specs/clear-field-requirements.md`](clear-field-requirements.md) (US-CF1 to US-CF4, BR-CF1
to BR-CF11). Section 8 of that file records the owner's answers:

- **CQ1:** the button shows on every in-scope box that has text, focused or not.
- **CQ2:** Tab skips the buttons (`tabIndex={-1}`). Screen readers still reach them by
  `aria-label`.
- **CQ3:** Escape does nothing new.
- **CQ4:** on phones the order line's name and price boxes get a 44px-tall, 24px-wide tap area.
  Every other box gets 44 × 44. (The owner extended this to the name box after D1.)

The system-architect was skipped: nothing outside the UI changes.

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| UI (shared) | `src/components/shared/ClearableInput.tsx` (new) | The input, its clear button and the clear (5.1, 5.2) | `ClearIcon` |
| UI (shared) | `src/components/shared/ClearableInput.module.css` (new) | Wrapper, filled padding, button, phone tap areas (6.1) | tokens `--text2`, `--text3` |
| UI (shared) | `src/components/shared/icons.tsx` | Adds `ClearIcon`, and adds the clear button to the header comment's list of users | the file's `Icon` wrapper |
| UI | `src/components/home/ItemModeFields.tsx` | Item Name and Total Price use `ClearableInput` | none |
| UI | `src/components/home/CustomAmountFields.tsx` | Total Amount, order line name and order line price use `ClearableInput` | none |
| UI | `src/components/home/CustomAmountFields.module.css` | The phone rule `.line button` becomes `.line > button` (6.2) | none |
| UI | `src/components/home/PayorModeFields.tsx` | The contribution amount uses `ClearableInput` | none |
| UI | `src/components/home/PayorModeFields.module.css` | Adds `.contribAmount` (6.2) | none |
| UI | `src/components/home/MemberList.tsx` | The new-member box uses `ClearableInput` | none |
| UI | `src/components/home/MemberList.module.css` | Adds `.nameBox` and removes `.addRow input`, which the change leaves matching nothing that's a flex item (6.2) | none |
| Tests | `src/components/shared/ClearableInput.test.ts` (new) | Render tests (8) | `react-dom/server`, already installed |
| Tests | `src/lib/orderLines.test.ts` | Two cases for AC-CF2.3 and AC-CF2.5 (8) | the file's `line` builder |

Not touched: `PurchaseItemCard.tsx` and every derived value it computes, `src/lib/`, `src/types/`,
`api/`, `scripts/db/`, `src/pdf/`, `src/components/onboarding/`.

## 3. Data model

None.

## 4. API contract

None. A clear changes only the form on screen (BR-CF4).

## 5. Business logic

All of it lives in `ClearableInput`. Nothing goes into `src/lib/`, because the only rule is "behave
like deleting by hand", and that's delegated to each field's existing `onChange`.

### 5.1 Component API

```ts
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'className' | 'onInput'> & {
  /** The controlled value, as today. */
  value: string;
  /** The clear button's accessible name, e.g. "Clear item name". */
  clearLabel: string;
  /** Keeps the phone tap area 24px wide, for a box too narrow for 44px (CQ4). */
  compactClear?: boolean;
  /** Class for the wrapper, which takes the input's place in the parent's layout. */
  className?: string;
};

export function ClearableInput(props: Props): JSX.Element;
```

- Every other prop (`id`, `type`, `min`, `step`, `maxLength`, `placeholder`, `aria-label`,
  `onChange`, `onKeyDown`, `disabled`, `readOnly`) is passed to the `<input>` unchanged, so labels
  (`htmlFor`), `aria-label`s, limits and handlers work exactly as today.
- `onInput` is left out of the type because the component uses it itself (5.2). No call site
  passes one.
- `className` styles the wrapper, not the input. None of the seven inputs has a `className` today.
- No `ref` forwarding: no call site holds a ref to these inputs.

Markup:

```html
<div class="wrap [compact] [className]" data-filled="true" (only when filled)>
  <input class="input" … />
  <button type="button" class="clear" aria-label="{clearLabel}" tabindex="-1">  (only when filled)
    <ClearIcon />
  </button>
</div>
```

`data-filled` is an attribute rather than a module class so the contribution row's CSS can read it
(6.2).

### 5.2 Rules

- **When the button shows (BR-CF2, BR-CF6, BR-CF9).**
  `filled = !disabled && !readOnly && (value !== '' || badInput)`.
  - `value !== ''` covers text, spaces only, and a typed `0`.
  - `badInput` is component state, set on every native `input` event:
    `onInput={(e) => setBadInput(e.currentTarget.validity.badInput)}`. When a number box holds
    text the browser can't read (`-`, `1e`), its `value` stays `""`, so React fires no `onChange`
    and nothing re-renders. React's `onInput` isn't deduplicated against the value, so it still
    fires, and `validity.badInput` is `true`. For text boxes it's always `false`.
  - `disabled` and `readOnly` are read off the props and passed through to the input. No in-scope
    box uses them today; the guard is BR-CF9.
- **The clear (BR-CF3, BR-CF5, BR-CF6).** On click:
  1. Set the DOM value to `''` through the prototype's setter:
     `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '')`.
     Look the descriptor up inside the handler, not at module scope, so importing the component
     under Node (the render tests) doesn't touch `HTMLInputElement`.
  2. `input.dispatchEvent(new Event('input', { bubbles: true }))`.
  3. `setBadInput(false)`, then `input.focus()`.

  Why the setter. React tracks an input's last value through its own `value` property on the
  element. Going round it leaves React's tracker holding the old text, so the `input` event in step
  2 reads as a change and the field's own `onChange` runs with `e.target.value === ''`. That's the
  same path as deleting by hand, so the handler and everything derived from it update with no new
  code at the call sites, including MemberList's "already in the group" message. This is the same
  technique Testing Library's `fireEvent.change` uses.

  In the BR-CF6 case, the state is already `''`, so React's tracker sees no change and `onChange`
  doesn't run. The derived values don't change, which is the rule. The setter in step 1 still
  empties the visible text, and step 3 hides the button.

  The value is set to `''`, never `0` or `0.00`, so the placeholder shows (AC-CF1.4).
- **Focus.** The button has `onMouseDown={(e) => e.preventDefault()}`, so a box that's already
  focused keeps focus through the tap and a phone keyboard stays up. Step 3's `focus()` covers a box
  that wasn't focused (BR-CF5).
- **Keyboard (CQ2, CQ3, BR-CF10).** `tabIndex={-1}` on the button. No `onKeyDown` in the
  component; a call site's own `onKeyDown` (MemberList's Enter) passes through. Escape is untouched.
- **Never adds, saves or removes (AC-CF1.6, BR-CF4).** The button is `type="button"` and only calls
  the input's `onChange`. In MemberList that's `setDraft` and `setError`, never `submit`.

### 5.3 Call sites and labels

| # | Field | File | `clearLabel` | Wrapper `className` | `compactClear` |
|---|---|---|---|---|---|
| 1 | Item Name | `ItemModeFields.tsx` | `"Clear item name"` | none | no |
| 2 | Total Price | `ItemModeFields.tsx` | `"Clear total price"` | none | no |
| 3 | Total Amount | `CustomAmountFields.tsx` | `"Clear total amount"` | none | no |
| 4 | Order line name | `CustomAmountFields.tsx` | `` `Clear ${m}'s order ${i + 1} name` `` | none | **yes** |
| 5 | Order line price | `CustomAmountFields.tsx` | `` `Clear ${m}'s order ${i + 1} price` `` | none | **yes** |
| 6 | Contribution | `PayorModeFields.tsx` | `` `Clear ${m}'s contribution` `` | `styles.contribAmount` | no |
| 7 | New member name | `MemberList.tsx` | `"Clear new member name"` | `styles.nameBox` | no |

Each site replaces `<input` with `<ClearableInput`, adds `clearLabel` (and the class or flag above),
and leaves every other attribute and its order as it is. Rows 4 and 5 use the same `m` and `i + 1`
as the box's own `aria-label`, so labels renumber with the lines (edge case "Removing an order
line"). The order line's Remove `Button` doesn't change (AC-CF3.1, AC-CF3.2).

No other input changes (BR-CF1).

## 6. UI

### 6.1 `ClearableInput.module.css`

```css
/* The wrapper takes the input's place in its parent's layout; the button sits
   over the input's right padding, which only grows while the button shows. */
.wrap {
  position: relative;
  min-width: 0;
  --clear-slot: 24px;
}

/* Block, so the wrapper is exactly the input's height with no line-box gap. */
.input {
  display: block;
}

[data-filled] > .input {
  padding-right: var(--clear-slot);
}

.clear {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  width: var(--clear-slot);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--text3);
  cursor: pointer;
}

.clear:hover {
  color: var(--text2);
}

.clear svg {
  width: 16px;
  height: 16px;
}

/* Mobile shell: 44px tap areas. A 38px box lets the button overhang it by 3px
   above and below, which stays inside the gaps around every in-scope box. The
   order line's name and price boxes are too narrow for 44px across, so they keep 24px (CQ4). */
@media (max-width: 640px) {
  .wrap {
    --clear-slot: 44px;
  }

  .compact {
    --clear-slot: 24px;
  }

  .clear {
    min-height: 44px;
  }
}
```

Notes for the developer:

- **Text never runs under the icon (AC-CF4.3).** The padding equals the button's width, and it only
  applies while the button shows. An empty box keeps today's 11px padding, so placeholders don't
  move. A long name scrolls inside the remaining width, with the button fixed at the edge.
- **Specificity.** `[data-filled] > .input` is (0,2,0). It beats the global
  `input[type='text'|'number']` padding (0,1,1). It loses to the contribution row's
  `.contribRow input[type='number']` (0,2,1), which is what keeps the amount's own padding (6.2).
  Don't raise it. `.compact` sits after `.wrap` in the same block, so the order decides between
  them.
- **Icon.** `ClearIcon` in `icons.tsx`, drawn with the existing `Icon` wrapper so it's stroked in
  `currentColor` and `aria-hidden`: `<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />` and
  `<path d="M4 4v4.5h4.5" />`. Its doc comment says it clears a box's text, unlike the plain ×
  that removes a row (BR-CF8).

Sizes:

| Width | Box | Tap area (w × h) | Padding while filled |
|---|---|---|---|
| Desktop | every in-scope box | 24 × box height (38px; 36px inside the contribution row) | 24px |
| Phone | order line name and price | 24 × 44 | 24px |
| Phone | every other in-scope box | 44 × 44 | 44px |

### 6.2 Call-site CSS

- **`CustomAmountFields.module.css`, phone block.** `.line button, .addOrder { min-height: 44px;
  min-width: 44px; }` becomes `.line > button, .addOrder { … }`. The Remove `Button` is a direct
  child of `.line` and keeps its 44 × 44; the clear buttons, nested in the wrappers, no longer get
  a 44px minimum width, which would break the price box's 24px. `.line input { min-height: 44px; }`
  stays and still reaches the inputs inside the wrappers, so on phones the wrappers and buttons are
  44px tall. The grid columns don't change. The price wrapper sits inside its 92px column, the gap
  is 6px, then the 44px Remove column, so the two tap areas can't overlap (AC-CF3.3).
- **`PayorModeFields.module.css`.** Add, after the `.contribRow input[type='number']` rules:

  ```css
  /* The amount keeps its 96px; while it has text, its clear button takes a slot
     after it at the row's right edge, and the name gives up the room (BR-CF7). */
  .contribAmount {
    flex-shrink: 0;
    height: 100%;
  }

  .contribAmount[data-filled] {
    padding-right: var(--clear-slot);
  }
  ```

  The existing input rules (96px, `height: 100%`, `padding: 0 11px 0 0`, right-aligned, no frame)
  stay as they are and now apply inside the wrapper. `--clear-slot` is set on the same element by
  `.wrap`. The label's `flex: 1; min-width: 0` and its ellipsis already make the name give up the
  room. The row stays 38px tall at every width.
- **`MemberList.module.css`.** Add `.nameBox { flex: 1; min-width: 0; }` for the wrapper. Remove
  `.addRow input { flex: 1; min-width: 0; }`: the input is no longer a flex item, so the rule no
  longer does anything. `.addRow button { flex-shrink: 0; }` also reaches the clear button; that's
  harmless, because the button is absolutely positioned.
- **Item Name, Total Price and Total Amount** need no call-site CSS. Their wrappers are block
  children of the existing `.field` columns.

### 6.3 What it looks like

- **Desktop:** the boxes look exactly as today until they have text; then the 16px grey counter-clockwise arrow (↺)
  shows inside the right edge (AC-CF4.2). In a contribution row with text, the ↺ sits after the
  amount at the row's right edge, and the amount sits 24px further left than its placeholder did.
  That's the room BR-CF7 gives it.
- **Phone:** the same, with the tap areas in 6.1. No box gets taller (AC-CF4.1). At 320px nothing
  overflows sideways: every wrapper has `min-width: 0` and sits in a track that already shrinks.

## 7. Onboarding tour impact

None. No `data-tour` attribute is on or inside any of the four touched components; the targets are
in `App.tsx`, `HomePage.tsx`, `NavTabs.tsx`, `SessionTabs.tsx`, `SessionWorkspace.tsx` and
`CloseSessionButton.tsx`. `steps.ts` doesn't change, so `steps.test.ts` is unaffected. The new
files declare no `data-tour`, so `targets.test.ts`'s scan finds the same set. Run both anyway
(BR-CF11).

## 8. Test plan

`npm test` is Vitest in the `node` environment, collecting `src/**/*.test.ts` only. There's no DOM
and no Testing Library, so clicks, focus and `validity` can't run under Vitest without a new
dependency (section 12, D2). The plan is:

- render tests with `renderToStaticMarkup` from `react-dom/server` (already installed), written
  with `createElement` because test files are `.ts`;
- `src/lib` tests for the derived values;
- ui-ux-tester checks for interaction.

### `src/components/shared/ClearableInput.test.ts` (new)

The component:
1. Renders no button and no `data-filled` for `value: ''` (AC-CF1.1).
2. Renders the button for `'D'` and for `'   '` (AC-CF1.2, BR-CF2), and for `'0'` (edge case
   "Box holds `0`").
3. Gives the button `type="button"`, `tabindex="-1"` and `aria-label` equal to `clearLabel`, with
   no text content (BR-CF8, CQ2).
4. Renders no button when `disabled` or `readOnly`, even with text (BR-CF9).
5. Passes `id`, `type`, `min`, `step`, `maxLength`, `placeholder` and `aria-label` through to the
   `<input>` unchanged.

In the Expenses form (props-only components, no context needed):
6. `ItemModeFields`, Equal Split, name `'Dinner'`, price `''`: one button, "Clear item name", and
   none labelled "Clear total price" (AC-CF1.1, AC-CF1.2).
7. `ItemModeFields`, Custom Amounts, Ana picked with two lines `{ name: 'Pasta', price: '300' }`
   and `{ name: '', price: '' }`: buttons "Clear Ana's order 1 name" and "Clear Ana's order 1
   price", no "order 2" clear, and the line's Remove buttons still read "Remove Ana's order Pasta"
   and "Remove Ana's order" (AC-CF3.1, AC-CF3.2).
8. `PayorModeFields`, Multiple Payors, Ana `'600'` and Ben `''`: "Clear Ana's contribution" only.

### `src/lib/orderLines.test.ts` (two new cases)

A clear sets the same `''` that hand deletion does, so these pin the derived states US-CF2 relies
on:
- **AC-CF2.3:** with Ana `200` and Ben's only line priced `''`, `blankPicked` gives `['Ben']`, and
  `fillRemainder` with total `500` puts `'300.00'` in Ben's first line.
- **AC-CF2.5:** Ben with lines priced `'300'` and `''` isn't in `blankPicked`.

Already covered and unchanged: AC-CF2.4 by `unpricedNamedLine`'s "is null once priced or once the
name is cleared"; empty prices count as 0 by `linesTotal`'s "reads unreadable, negative and empty
prices as 0".

### Existing tests that must still pass

All of `npm test`, including `steps.test.ts` and `targets.test.ts` (BR-CF11).

### ui-ux-tester checks

On `npm run dev:full`, at 1280px and at 375px and 320px:
1. Each of the seven boxes: empty, no ↺; type one character, ↺ shows; delete it by hand, ↺ goes
   (AC-CF1.1, AC-CF1.2). Several filled boxes each show their own ↺ at once (CQ1).
2. Tap each ↺: the box empties, the grey placeholder shows ("0.00" stays a placeholder), the ↺ goes,
   and the cursor is in the box; on a phone the keyboard stays or comes up (AC-CF1.3 to AC-CF1.5,
   BR-CF5).
3. No clear adds a member, adds an item, saves edits or removes a line (AC-CF1.6, AC-CF2.8).
4. AC-CF2.1, AC-CF2.2, AC-CF2.3 (then press Fill Remainder), AC-CF2.4, AC-CF2.6 and AC-CF2.7, each
   as written.
5. BR-CF6: type `-` in Total Price and in an order price; the ↺ shows; tap it; the text is gone and
   no total moves.
6. New-member box: add an existing name, so "… is already in the group." shows; clear; the message
   goes and nothing is added. Clear, then press Enter: nothing happens.
7. Tab from Item Name goes to the next box, never to a ↺; a screen reader (VoiceOver) reads "Clear
   Ana's order 1 price, button" and the Remove as "Remove Ana's order" (CQ2, AC-CF3.2). Escape in a
   box does nothing (CQ3).
8. Phone: the name and price boxes' ↺ is about 24 × 44 and "1250.00" stays fully visible beside
   it; every other ↺ is 44 × 44; tapping the price ↺ never removes the line (CQ4, AC-CF3.3, AC-CF4.1). No box
   is taller than on `main`.
9. 320px: nothing scrolls sideways; no text sits under a ↺; a long member name in a contribution row
   truncates while the amount and ↺ stay whole (AC-CF4.3, BR-CF7).
10. Desktop: compared with `main`, the only difference is the ↺ in boxes with text (AC-CF4.2).
11. Edit a staged row and a saved item, clear a field, then Cancel: nothing changed (edge cases).
12. The onboarding tour still runs end to end.

## 9. Documentation impact

For the documentation-engineer:
- `docs/mobile-breakpoints.md`, 640px list: `shared/ClearableInput` gives 44px tap areas, 24px wide
  in the order line's price box.
- `Documentation/Hati System Documentation.md`, where it describes the Expenses form: the ↺
  empties a box, and differs from an order line's Remove ×. Only when the owner asks for a
  documentation update.

## 10. Tasks

1. `icons.tsx`: add `ClearIcon`, and update the header comment's list of users.
2. `ClearableInput.tsx` and `ClearableInput.module.css` as in 5.1, 5.2 and 6.1, with a comment on
   the setter technique saying why it's used.
3. `ClearableInput.test.ts` tests 1 to 5. Check: they pass.
4. `ItemModeFields.tsx`: rows 1 and 2.
5. `CustomAmountFields.tsx`: rows 3 to 5; `CustomAmountFields.module.css`: `.line > button`.
6. `PayorModeFields.tsx`: row 6; `PayorModeFields.module.css`: `.contribAmount`.
7. `MemberList.tsx`: row 7; `MemberList.module.css`: `.nameBox` in, `.addRow input` out.
8. `ClearableInput.test.ts` tests 6 to 8, and the two `orderLines.test.ts` cases.
9. `npm run lint`, `npx tsc -b`, `npm test` and `npm run build`. Then `npm run dev:full` and walk
   tester checks 1, 2, 5 and 8 yourself at 375px and 1280px before handing over.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| The setter technique depends on React's value tracking. It's stable across React 16 to 19 and is what Testing Library relies on, but it's not a public React API. | It's confined to one handler with a comment; tester checks 2 to 6 exercise every field. If it ever broke, the fallback is an `onClear` prop per call site. |
| CSS specificity between the component and the call sites (the contribution padding, the old `.line button` rule). | Spelled out in 6.1 and 6.2; tester checks 8 to 10. |
| A 44px slot would leave the order line's **name** box almost no visible text at 320px (measured: a 57px box, about 2px of text while filled). | Resolved: the name box uses `compactClear` too, so about 22px of text shows at 320px; see D1. |
| `renderToStaticMarkup` under the `node` environment imports CSS Modules. Vitest stubs them by default, and no existing test imports a component yet. | If a stub causes trouble, the developer reports it rather than changing the Vitest config. |
| Tab order or the tour shifts. | `tabIndex={-1}`; no `data-tour` nearby; both tour tests run. |

Effort: **small.** One component of about 60 lines plus CSS, seven mechanical swaps, three CSS
touch-ups and one test file. Risk: low.

## 12. Decisions for the user

Neither blocks the build; each has a default the developer follows.

- **D1. The order name box at 320px.** CQ4 gave every box other than the order price 44 × 44. On
  a 320px phone, that left an order name box with about 2px of visible text while it's filled
  (measured in the running app).
  - **Resolved by the owner:** pass `compactClear` to the order name box too, giving both
    order-line boxes a 24 × 44 tap area. Long names still scroll, and the full name is kept.
- **D2. Interaction tests under Vitest.** Running clicks, focus and `validity.badInput` in
  `npm test` would need `jsdom` (and ideally `@testing-library/react`) as new dev dependencies.
  - **Recommendation:** no. The render tests, the `src/lib` tests and the tester's checks cover
    the acceptance criteria, and the repo has kept its test setup DOM-free so far.
