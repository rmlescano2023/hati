# Hati

Track shared purchases and see who owes what.

Hati is a local-first web app for splitting group expenses. You add the people in
your group, log each purchase as a set of items, and Hati works out who needs to
pay whom — cancelling mutual debts so nobody pays in both directions. It can then
export the whole thing as a paginated PDF statement.

You sign in with an account, and your sessions are stored on a server so they
follow you between devices and browsers. Each account's data is private to that
account — there is no sharing between accounts.

This is a change from how Hati used to work. It was previously local-first:
no account, no backend, everything in your browser's `localStorage`, and the
claim that your expenses never left the machine. That is no longer true. Your
expenses are sent to a server and stored in a database, and the app needs a
network connection to load or save anything — it no longer works offline.

If you used the local-first version, that data is still in your browser's
`localStorage`, but the app no longer reads it: there is no way to reach it
from the UI, and signing in gives you a fresh, empty account. Nothing is
migrated.

## How it works

Expenses are organised into **sessions** — one per trip, hangout or night out.
Several can be in progress at once, and each owns its own member roster, so two
unrelated groups never share names.

The top level is two tabs, **Home** and **History**. Home lists the sessions you
have in progress and starts new ones; History holds the ones you have closed.
Opening a session drops you into its own workspace with three inner tabs —
**Expenses**, **Breakdown** and **Summary**.

A session is a _draft_ until you finish it. Leaving the workspace changes
nothing: the draft is already saved and waiting on Home. Finishing it, from the
Summary tab, files it into History and makes it read-only.

### Home — your sessions

One card per draft, newest first, showing when it was started, who is in it, how
many purchases it holds and the running total. Click one to resume exactly where
you left off, or start a fresh one with **New Session**.

### Expenses — log a purchase

Add the session's members, then record purchases against them. A purchase is a
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

At the bottom of the page, **Finish Session** files the session into History and
takes you there. It confirms first, and nothing is deleted — the session moves,
and stays readable on History for good.

### History — look back

A list of closed sessions, newest first, as the same summary cards Home uses —
led by the date it was closed rather than started. The list stays scannable;
nothing expands in place.

Opening one takes you to that session on its own, showing the same Breakdown
cards you already know — read-only, and rendered against that session's own
member roster, so nothing you do later can rewrite it. Its **Download SOA**
button sits at the top of that screen, and is never gated by the freeze rule:
a session stays downloadable however old it gets.

### SOA export

**Download SOA** renders a Statement of Account PDF — settlement, balances, and
every line item — via `@react-pdf/renderer`. There are two entry points:

- A session's **Summary** tab exports that session, named `Hati-SOA-<today>.pdf`.
- A closed session's **History** screen exports that session, named for the date
  it was closed, `Hati-SOA-<closed-date>.pdf`.

Either way the statement's "Period" header is derived from the earliest and
latest purchase date in the records it was given.

The renderer is imported dynamically, so its ~1 MB never lands in the initial
page bundle. Statements with more than five members switch to landscape
automatically, and the fonts are self-hosted from `public/fonts/` because CDN
font URLs are unreliable at PDF-build time.

## Getting started

Requires **Node 22+**, plus access to the Vercel project (for the Clerk keys and
the database connection).

```bash
npm install
npm i -g vercel        # once, if you don't have it
vercel login
vercel link            # associates this directory with the Hati project
vercel env pull .env.local
npm run dev
```

`npm run dev` runs `vercel dev`, not plain Vite, because the app now needs the
`/api/app-data` endpoint that Vite alone does not serve. `npm run dev:ui` still
runs Vite by itself if you are only working on UI that does not read data.

Three environment variables are needed, all of them pulled by the command
above rather than written by hand — see `.env.example`:

| Variable                     | Where it is used                                       |
| ---------------------------- | ------------------------------------------------------ |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser. Public by design; ships in the bundle.        |
| `CLERK_SECRET_KEY`           | Server only. Verifies session tokens. Never expose it. |
| `POSTGRES_DATABASE_URL`      | Server only. The pooled connection string.             |

A production build **fails** if the publishable key is missing rather than
building without it — Vite inlines `VITE_*` variables as literals, so an absent
key would make the signed-in branch statically dead and silently strip the
entire app from the bundle.

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

### First run

A new account gets a guided walkthrough the first time it signs in: Home, into
a session, through Expenses, Breakdown and Summary, back out, and finally
History. It follows what you actually do — a step that asks you to open a tab
waits until you open it, rather than clicking through on its own — and
wandering off it ends the tour rather than trapping you in it.

Whether you have seen it is a real column, `users.onboarded_at`, rather than
something inferred from having no sessions, so it follows the account across
devices and cannot be re-triggered by clearing data. Finishing and skipping
count the same.

The tour asks you to create a session in its first step. That session is
removed when the tour ends, so onboarding does not leave one behind — unless
you put members or purchases in it, in which case it is yours and stays.

## Data and privacy

Your data lives in three tables, keyed to your Clerk user id:

```sql
create table users (
  id           text primary key,     -- Clerk user id
  created_at   timestamptz not null default now(),
  onboarded_at timestamptz           -- null until the first-run tour is done
);

create table expense_sessions (
  id         text primary key,
  user_id    text not null references users (id) on delete cascade,
  status     text not null check (status in ('draft', 'closed')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz,
  members    jsonb not null default '[]'
);

create table purchase_records (
  id         text primary key,
  session_id text not null references expense_sessions (id) on delete cascade,
  date       date not null,
  payor_mode text not null check (payor_mode in ('single', 'multiple')),
  payors     jsonb not null,
  items      jsonb not null,
  created_at timestamptz not null default now()
);
```

Sessions and records are real rows; items and payors stay as JSON on the
record. Nothing in the app queries an item independently of the purchase it
belongs to, so splitting those out further would add tables, and move
knowledge of how splits work onto the server, for no query it would serve.

The point of rows rather than one document per account is write size. Editing
one item's price used to rewrite an account's entire history; now it touches
only the session it belongs to.

Every write goes through the app's own parser **on the server** as well as in
the browser, so a hostile or malformed request cannot put something in the
database that the app would later choke on. A write names one session, so that
check is scoped to that session rather than run over everything you own.

Writes are optimistic: the screen updates immediately and the save follows. If
a save fails you get a banner saying so, rather than finding out when the data
is missing on the next load.

What this means for your privacy: your expenses leave your machine. They are
sent to the server and stored in the database above. Only your account can read
them back, but they are no longer yours alone in the way they were when
everything lived in `localStorage`.

## Project layout

```
api/            The serverless endpoint backing the app (GET/PUT one blob per account)
src/
  components/   UI, grouped by page (home, breakdown, summary, history) plus shared/ and layout/
  pages/        Home and History, plus the three pages inside a session workspace
  context/      SessionsStoreContext — every session, synced to the server
                AppDataContext — a thin adapter scoping that store to the open session
  hooks/        useServerAppData — the [data, setData] seam the store is built on
  lib/          calculations, money, storage, freeze rule, formatting  (the *.test.ts files live here)
  pdf/          The SOA document, its layout maths and font registration
  styles/       Design tokens and global CSS
scripts/        Dev-only PDF render harness
public/fonts/   DM Sans / DM Mono, self-hosted for the PDF
```

Calculation logic is kept in `src/lib/` and is pure, which is what makes it
testable without rendering anything.

## Development notes

In a dev build only, two **Dev only** bars appear. The one on Home seeds a
spread of sessions — three drafts (including an empty one) and four closed ones
ranging from weeks to over a year old — so the launcher and History can be
eyeballed without creating a dozen by hand; it can replace the current sessions
or add to them, and clear everything. The one inside a session's Expenses tab
seeds that one session's members and records (12 members / 30 items, or a
smaller 4-member set) and resets it.

Both are gated on `import.meta.env.DEV`, which is statically false in a
production build, so the bars and the demo-data generators behind them are
dropped by the bundler.

To inspect PDF pagination without hand-entering data:

```bash
npx vite-node scripts/render-soa-check.tsx [members] [items] [outfile]
```

## Built with

React 18 · TypeScript · Vite 6 · Vitest · `@react-pdf/renderer` · CSS Modules
