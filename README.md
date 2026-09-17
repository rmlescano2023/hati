# Hati

Track shared purchases and see who owes what.

Hati is a local-first web app for splitting group expenses. You add the people in
your group, log each purchase as a set of items, and Hati works out who needs to
pay whom — cancelling mutual debts so nobody pays in both directions. It can then
export the whole thing as a paginated PDF statement.

There is no account and no backend — everything lives in your browser's
`localStorage`, and your expenses never leave the machine. (The page does fetch
its webfonts from Google Fonts; nothing else goes over the network.)

## How it works

The app is four tabs.

Expenses are organised into **sessions**. Everything you log goes into the
current, open session, which is what Home, Breakdown and Summary show. When a
trip or a hangout is settled up, you close the session from the Summary page:
its records move to History and the working tabs reset, ready for the next
round. Your member list is not cleared — the same group carries on.

### Home — log a purchase

Add your group members once, then record purchases against them. A purchase is a
date, one or more payors, and a list of items. Each item is split one of two ways:

| Mode               | What it means                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| **Equal Split**    | You give the item's total price and tick who shared it. The cost is split evenly between them. |
| **Custom Amounts** | You give each member's amount directly. The item total is the sum of those amounts.            |

Items are staged as you add them, so a single saved record can mix both modes.
Saving again on the same date with the same payors adds to the existing
Breakdown card rather than starting a second one.

Payors work the same two ways. Under **One Payor**, one person fronted the whole
purchase. Under **Multiple Payors**, you enter how much each person put in, and
every non-payor's share is attributed back to the payors _in proportion to what
each of them contributed_. A member who helped pay a purchase owes nothing on it.

### Breakdown — check the numbers

One card per purchase, with a row per item and a column per member. Every cell is
editable in place: correct an item name, a price, or a single person's share
without re-entering the purchase. The **Item Total** column is the item's full
cost; the member columns are shares of it.

Editing has a time limit. Once a purchase's own date is more than **7 days** in
the past, its card is marked _Locked_ and becomes read-only — cells stop
accepting input and the remove-item button disappears. This is keyed to the
purchase date alone, so old expenses are protected even while their session is
still open, and the rule is enforced in `AppDataContext` as well as in the UI.

### Summary — settle up

Three views of the same data:

- **Final Settlement** — one block per debtor listing exactly who to pay. This is
  the answer most people want.
- **Who Owes Whom** — the full matrix, toggleable between _Before Deductions_
  (raw amounts) and _After Deductions_ (mutual debts cancelled pairwise, so if A
  owes B ₱100 and B owes A ₱30, only A → B ₱70 remains).
- **Net Balances** — each member's single net position: positive means they are
  owed money back, negative means they owe.

Net balances and the settlement always come from the netted matrix, whichever
view the matrix itself is showing, so nothing is double-counted.

At the bottom of the page, **Close Session** archives the current records to
History and resets Home, Breakdown and Summary for a new session. It confirms
first, and nothing is deleted — the records are moved, not discarded.

### History — look back

Every closed session, newest first, with a date-range filter across the top. The
range defaults to the full span of archived purchases; narrow it to focus on a
stretch of days.

Each session is shown under a **Closed \<date>** heading, with the same
Breakdown cards you already know — read-only, and rendered against the member
roster as it stood when the session was closed. Removing someone from your group
afterwards therefore never rewrites history.

Sessions stay separate rather than being flattened into one list, so two
unrelated sessions that happen to share a date and payor don't merge into a
single card.

### SOA export

**Download SOA** renders a Statement of Account PDF — settlement, balances, and
every line item — via `@react-pdf/renderer`. There are two entry points:

- **Summary** exports the current, open session, named `Hati-SOA-<today>.pdf`.
- **History** exports whatever the date range is showing, across sessions, named
  `Hati-SOA-<start>_to_<end>.pdf`.

Either way the statement's "Period" header is derived from the earliest and
latest purchase date in the records it was given.

The renderer is imported dynamically, so its ~1 MB never lands in the initial
page bundle. Statements with more than five members switch to landscape
automatically, and the fonts are self-hosted from `public/fonts/` because CDN
font URLs are unreliable at PDF-build time.

## Getting started

Requires **Node 22+**.

```bash
npm install
npm run dev
```

### Scripts

| Script               | Does                                        |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Vite dev server                             |
| `npm run build`      | Type-check (`tsc -b`) then build to `dist/` |
| `npm run preview`    | Serve the production build                  |
| `npm test`           | Run the Vitest suite once                   |
| `npm run test:watch` | Vitest in watch mode                        |
| `npm run lint`       | ESLint                                      |
| `npm run format`     | Prettier over `src/`                        |

## Money handling

Splitting money evenly is where this kind of app usually goes subtly wrong, so
the arithmetic is deliberate and covered by tests:

- Every amount is rounded to two decimals through `roundMoney`, which corrects
  for float representation error rather than trusting `Math.round` on a raw
  float.
- Even splits work in integer centavos and hand the leftover centavos out one at
  a time, so `splitEvenly(10, 3)` is `[3.34, 3.33, 3.33]` — the parts always sum
  back to the total exactly.
- Sums round once at the end, not per addend.
- Values under half a centavo are treated as zero, so float dust never shows up
  as a ₱0.00 debt in the settlement.

Amounts are Philippine pesos throughout; the currency is not configurable. The
PDF spells it `PHP` rather than `₱` because DM Sans has no glyph for U+20B1.

## Data and privacy

All state is a single `localStorage` key, `hati:data:v1`, holding the current
session's members and records plus every archived session. Nothing is uploaded,
and clearing your browser data clears your expenses. The stored blob is parsed
defensively on boot — anything unrecognisable is dropped rather than allowed to
crash the app.

The blob is at schema version 2. Version 1 predates sessions and has no
`archivedSessions`; it upgrades in place on first load, defaulting to an empty
history, with no data loss.

## Project layout

```
src/
  components/   UI, grouped by page (home, breakdown, summary, history) plus shared/ and layout/
  pages/        The four tabs
  context/      AppDataContext — the single source of truth, persisted to localStorage
  lib/          calculations, money, storage, freeze rule, formatting  (the *.test.ts files live here)
  pdf/          The SOA document, its layout maths and font registration
  styles/       Design tokens and global CSS
scripts/        Dev-only PDF render harness
public/fonts/   DM Sans / DM Mono, self-hosted for the PDF
```

Calculation logic is kept in `src/lib/` and is pure, which is what makes it
testable without rendering anything.

## Development notes

In a dev build only, a **Dev only** bar appears at the top of Home for seeding
demo data (12 members / 30 items, or a smaller 4-member set) and resetting. It is
gated on `import.meta.env.DEV`, which is statically false in a production build,
so the bar and its demo-data generator are dropped by the bundler.

To inspect PDF pagination without hand-entering data:

```bash
npx vite-node scripts/render-soa-check.tsx [members] [items] [outfile]
```

## Built with

React 18 · TypeScript · Vite 6 · Vitest · `@react-pdf/renderer` · CSS Modules
