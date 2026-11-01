# Spec: user-named sessions

Status: **approved by the owner on 2026-11-01.** Branch `session-names`.

## 1. Summary

A session can carry an optional name the user chooses ("Bali Trip"). When it has one, the name replaces the
date title everywhere a session is identified: Home and History cards, the open session's header, the
History detail heading, the delete confirmation, screen-reader labels, and the SOA PDF (page-1 heading,
embedded title, file name). The dates then show as a quieter second line. Unnamed sessions look exactly as
they do today.

Only drafts can be named or renamed, from three places: the "+ New Session" prompt (Cancel / Create), a
pencil on each In Progress card (inline edit), and a pencil in the open session's header. Closed sessions
show their name but can't be renamed.

Source: the business-analyst's revised requirements, "User-named sessions" (BR-1 to BR-24, US-1 to US-7),
with the owner's answers folded in. The system-architect was skipped by the owner's choice.

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Types | `src/types/index.ts` | `Session.name: string \| null` | — |
| Schema | `scripts/db/schema.sql` | one `alter table … add column if not exists` | `scripts/db/apply-schema.ts`, unchanged |
| API | `api/_shared.ts` | `loadSessions` selects and returns `name` | `SessionRow` type |
| API | `api/_validate.ts` | new `parseSessionName` for the POST body | `normaliseSessionName` |
| API | `api/sessions/index.ts` | POST stores an optional `name` | existing insert |
| API | `api/sessions/[id].ts` | PUT inserts and updates `name` | `parseSessionInput` already covers validation |
| Pure logic | `src/lib/sessionName.ts` **(new)** | `SESSION_NAME_MAX`, `normaliseSessionName`, `applySessionName` | — |
| Pure logic | `src/lib/storage.ts` | `parseSession` reads `name`; `migrateV1` sets `name: null` | — |
| Pure logic | `src/lib/sessionLabel.ts` | new `sessionDisplayTitle`; `sessionTitle` unchanged | `sessionTitle` |
| Pure logic | `src/lib/soaName.ts` **(new)** | `printableSessionName`, `breakLongWords`, `soaFileName`, DM Sans coverage table | — |
| Dev data | `src/lib/demoSessions.ts` | `name: null` on each built session | — |
| Client state | `src/hooks/useServerSessions.ts` | `addSession` POSTs `{ id, name }` | — |
| Client state | `src/context/SessionsStoreContext.tsx` | `createSession(name?)`, new `renameSession` | `updateSession` / `mutateSession` |
| Client state | `src/context/AppDataContext.tsx` | expose `name` to the open session's pages | — |
| UI | `src/components/shared/icons.tsx` | new `PencilIcon` | `Icon` wrapper |
| UI | `src/components/sessions/SessionNameInput.tsx` + `.module.css` **(new)** | the inline rename box (card and header) | global `input[type='text']` styles |
| UI | `src/components/sessions/NewSessionDialog.tsx` + `.module.css` **(new)** | the "+ New Session" prompt | `ConfirmDialog.module.css` classes, `Button` |
| UI | `src/components/sessions/SessionCard.tsx` + `.module.css` | name and dates lines, pencil, inline edit; restructured so the pencil can sit beside the title | `TrashIcon`, existing classes |
| UI | `src/pages/HomePage.tsx` | one-edit-at-a-time state, rename wiring, delete wording, delete looked up by id | `ConfirmDialog`, `pluralize` |
| UI | `src/App.tsx` | New Session opens the prompt (except while the tour runs); `endTour` counts a name as "touched" | `newSession`, `tourSession` |
| UI | `src/components/layout/SessionWorkspace.tsx` + `.module.css` | name and dates in the header, pencil, inline edit | `.started` style |
| UI | `src/pages/HistoryDetailPage.tsx` + `.module.css` | name as heading, then a dates line | `.date`, `.meta` |
| UI | `src/pages/SummaryPage.tsx` | pass `name` to `ExportSoaButton` | `useAppData()` |
| PDF | `src/components/summary/ExportSoaButton.tsx` | new required `name` prop, passed through | — |
| PDF | `src/pdf/downloadSoa.ts` | `name` arg; file name from `soaFileName` | — |
| PDF | `src/pdf/SoaDocument.tsx` | `name` prop; heading line in `DocHeader`; embedded title | `DocHeader` |
| PDF | `src/pdf/styles.ts` | new `headerName` style | `palette` |
| Dev tooling | `scripts/render-soa-check.tsx` | optional 5th argument: a session name | — |
| Tests | see section 8 | | |

Not touched: `HistoryPage.tsx` (it renders `SessionCard` without rename or delete), `steps.ts`,
`OnboardingTour.tsx`, `SyncBanner`, `calculations.ts`, `money.ts`, and `scripts/db/verify-migration.ts`
(a one-off script that no tsconfig type-checks).

## 3. Data model

Add this to `scripts/db/schema.sql`, directly after the `expense_sessions_user_id_idx` index, with the
comment:

```sql
-- The name the user gave the session, if any. Null means unnamed, and the app
-- titles it by its dates instead. Length is enforced by the app's parser
-- rather than a check constraint, so the limit can change without a migration.
alter table expense_sessions add column if not exists name text;
```

- **Existing rows:** they get `null`, meaning unnamed, so they display exactly as today (BR-13). No backfill,
  no default, and no existing value is changed.
- **Idempotent:** `if not exists` makes re-running `apply-schema.ts` a no-op.
- **Non-destructive:** nothing is dropped, rewritten or migrated. On Postgres 11 and later, adding a
  nullable column with no default only changes the catalog: the table isn't rewritten, and the lock is held
  for milliseconds.
- **Rollback:** if the feature code is ever reverted, leave the column in place. Old code ignores it. Never
  drop it on `main`.

### Applying it to the shared Neon `main` branch (settled point 1)

**What runs it.** `npx vite-node scripts/db/apply-schema.ts`, run from the repo root. It reads
`HATI_DATABASE_URL` from `.env.local`, which is the shared Neon `main` branch used by local dev, sit, qat
and uat. It runs the whole of `schema.sql`, and every statement in it is idempotent.

**When.** It runs once, as the first build task, before any new code talks to the database. That means
before `npm run dev:full` is started with the new code, and before any Vercel deployment of this branch.
The new `loadSessions` selects `name`, so new code against an unaltered table fails `GET /api/sessions`
with a 500.

**Who.** The fullstack-developer runs it, once, after the owner approves this spec. Approving the spec
authorises exactly that run, and the developer reports the script's output. (This is decision 1 in
section 12.)

**Old code keeps working against the altered table.** sit, qat and uat will run old code against the
altered table from the moment it's applied until the feature is promoted to each of them. That's safe
because:
- Every old `select` names its columns. There's no `select *`, so the extra column is invisible.
- Old inserts list their columns explicitly, so `name` defaults to `null`.
- The old PUT upsert's `on conflict do update set` lists only `status`, `closed_at` and `members`. An old
  deployment saving a session therefore leaves any `name` untouched; it can't wipe one.

**stg and prod.** If those stages use a different Neon branch, the devops-engineer runs the same command
against it with `DATABASE_URL_OVERRIDE=<that branch's URL>`, before the hop that first brings this code to
the stage.

**Verify.** The script prints its table list. The functional check is that Home loads on
`npm run dev:full`, because GET selects the new column.

## 4. API contract

Every route keeps its current shape:
- `getUserId`: 401 `{ error: 'Not signed in.' }` without a user, and 500 if auth is misconfigured.
- Explicit ownership checks: another account's id is a 404.
- `pool.sql` templates only.

### `GET /api/sessions` (changed response only)

- **200:** `Session[]`. Each session gains `name: string | null`.
- `loadSessions` in `api/_shared.ts`:
  - The query becomes `select id, status, created_at, closed_at, members, name`.
  - `SessionRow` gains `name: string | null`.
  - The mapping adds `name: s.name`.

### `POST /api/sessions` (creates a draft; request gains `name`)

- **Request:** `{ id: string, name?: unknown }`.
- **Validation:**
  - `id` is unchanged: a non-empty string, or 400 `{ error: 'A session id is required.' }`.
  - `name` goes through `parseSessionName(body.name)` from `api/_validate.ts`. It never rejects: a missing,
    non-string or blank value becomes `null`, and an over-long one is cut to 60 characters (BR-3).
- **SQL:**
  ```sql
  insert into expense_sessions (id, user_id, status, members, name)
  values (${id}, ${userId}, 'draft', '[]'::jsonb, ${name})
  on conflict (id) do nothing
  ```
- **Response:** 201 `{ id }`, unchanged. Also unchanged: 405 for other methods, with `Allow: GET, POST`.

Add this to `api/_validate.ts`:

```ts
/**
 * The name a draft is created with. Never a reason to reject the request:
 * anything unusable is simply no name, so a bad name cannot cost the user
 * the session itself.
 */
export function parseSessionName(raw: unknown): string | null {
  return normaliseSessionName(raw);
}
```

It imports `normaliseSessionName` from `'../src/lib/sessionName.js'`. The `.js` extension is required:
`apiImports.test.ts` enforces it.

### `PUT /api/sessions/:id` (request and response gain `name`)

- **Request:** the whole `Session`, now with `name`.
- **Validation:** unchanged entry point, `parseSessionInput` → `parseSession`, which now sets
  `name: normaliseSessionName(raw.name)`.
  - A missing, non-string, blank or over-long `name` never produces a 400 or a 500. Each becomes `null`,
    except an over-long one, which is truncated (AC-6.3).
  - An absent field means no name, so older clients stay valid.
- **SQL:** the upsert adds the column to the insert list and to the update set:
  ```sql
  insert into expense_sessions (id, user_id, status, created_at, closed_at, members, name)
  values (
    ${sessionId}, ${userId}, ${session.status},
    ${session.createdAt}, ${session.closedAt},
    ${JSON.stringify(session.members)}::jsonb,
    ${session.name}
  )
  on conflict (id) do update set
    status    = excluded.status,
    closed_at = excluded.closed_at,
    members   = excluded.members,
    name      = excluded.name
  ```
- **Response:** 200, the parsed session (now including `name`).
- **Other statuses, unchanged:** 400 for a missing id or a malformed session, 404 for another account's id,
  405 with `Allow: PUT, DELETE`.

**Assumption:** the server doesn't block renaming a closed session. That rule (BR-11) is enforced in the UI
and the store. A client that bypasses them can only rename its own data, so it isn't a security boundary.

### `DELETE /api/sessions/:id`

Unchanged. The name goes with the row (BR-12).

There is no separate rename endpoint (out of scope). A rename is an ordinary PUT through `mutateSession`.

## 5. Business logic

No money logic changes (BR-14): `calculations.ts`, `money.ts`, the Breakdown and Summary totals, and the PDF
amounts are all untouched.

### `src/lib/sessionName.ts` (new; no runtime imports, so the API can load it)

```ts
import type { Session } from '../types';

/** The longest a session name can be, in characters, once tidied. */
export const SESSION_NAME_MAX = 60;

export function normaliseSessionName(raw: unknown): string | null
export function applySessionName(session: Session, raw: string): Session
```

**`normaliseSessionName`** (BR-1 to BR-4). It's the one rule used by the server parser, the POST, the store,
and both create and rename.
1. A non-string returns `null`.
2. `raw.replace(/[\s\p{Cc}]+/gu, ' ').trim()`. This collapses whitespace runs and turns control characters
   into spaces. Postgres `text` rejects U+0000, so this step is also what keeps a NUL from causing a 500.
3. An empty result returns `null`.
4. Keep the first 60 **code points** (`Array.from(s).slice(0, 60).join('')`), then `trimEnd()`. Counting
   code points means an emoji is never split into a lone surrogate.
   - The inputs use `maxLength={SESSION_NAME_MAX}`, which counts UTF-16 units and is therefore at least as
     strict. Anything the UI lets through is never truncated by the server; truncation only applies to
     non-UI clients.
5. Casing is kept as typed: no title-casing (BR-4). Duplicate names are allowed (BR-5).

**`applySessionName(session, raw)`**, used inside `updateSession`:
- It returns **the same object** when `session.status !== 'draft'` (BR-11), or when
  `normaliseSessionName(raw) === session.name` (BR-6).
- Otherwise it returns `{ ...session, name: normaliseSessionName(raw) }`.
- Because `mutateSession` treats an identical object as a no-op, an unchanged save, an Escape, or any
  repeated save of the same value sends no request (AC-3.7). Section 6 relies on that.

### `src/lib/sessionLabel.ts`

Add this; `sessionTitle` doesn't change (BR-8):

```ts
/** The session's own name when it has one, otherwise the dates it covers (BR-7). */
export function sessionDisplayTitle(session: Session): string {
  return session.name ?? sessionTitle(session);
}
```

The secondary dates line is always `sessionTitle(session)`, shown only when `session.name !== null`. It keeps
following the purchases as they change.

### `src/lib/storage.ts`

- `parseSession` adds `name: normaliseSessionName(raw.name)`. The import is `'./sessionName.js'`.
- `migrateV1` adds `name: null`.

### Store (`src/context/SessionsStoreContext.tsx`)

- `createSession: (name?: string | null) => string` creates the session with
  `name: normaliseSessionName(name ?? null)`. The tour's `createSession()` call is unchanged and creates an
  unnamed draft.
- New `renameSession: (sessionId: string, rawName: string) => void`, which runs
  `updateSession(sessionId, (s) => applySessionName(s, rawName))`. Add it to the value type, the `useMemo`
  object and the dependency list.
- `closeSession` already spreads the session, so closing keeps the name (BR-11, AC-1.9).

`useServerSessions.addSession` posts `JSON.stringify({ id: session.id, name: session.name })`. A name chosen
in the prompt therefore persists on creation (AC-2.5). The dev seeder's `replaceAll` is unchanged, because
its PUT carries the name.

`useServerSessions` keeps each in-flight create's promise in a `creating` map, by session id, and
`removeSession` awaits it before sending the DELETE. Without that, a delete sent right after a create (the
tour removing its untouched session as it ends) could reach the server first, find nothing (404), and the
create would then leave an empty draft behind. (Added after the ui-ux-tester's run.)

### PDF rules (`src/lib/soaName.ts`, new, pure)

```ts
/** The longest unbroken run the page-1 heading prints before forcing a line break. */
export const PDF_HEADING_WORD_MAX = 18;

export function printableSessionName(name: string | null): string | null
export function breakLongWords(text: string, maxChars: number): string
export function soaFileName(name: string | null, suffix: string): string
```

**`printableSessionName`** (BR-21) is shared by the heading and the embedded title.
1. `null` returns `null`.
2. Apply `name.normalize('NFC')`, so a decomposed "é" becomes the precomposed glyph DM Sans has.
3. Keep only the code points in `DM_SANS_COVERAGE`. Emoji, ZWJ and variation selectors drop out.
4. `.replace(/\s+/g, ' ').trim()`.
5. An empty result returns `null`: the PDF is treated as unnamed.

**`DM_SANS_COVERAGE`** is a module-level array of inclusive `[from, to]` ranges. It's the cmap of
`public/fonts/DMSans-{Regular,Medium,Bold}.ttf` (all three are identical), read with fontkit while this
spec was written. Add a comment that says so, and that it must be regenerated if the fonts change. U+20B1
(₱) is absent, which matches the README's note.

```
[0x20,0x7e],[0xa0,0xac],[0xae,0x107],[0x10a,0x11b],[0x11e,0x123],[0x126,0x133],[0x136,0x137],
[0x139,0x148],[0x14a,0x15b],[0x15e,0x165],[0x168,0x17e],[0x18f,0x18f],[0x192,0x192],[0x1fc,0x1fd],
[0x218,0x21b],[0x237,0x237],[0x259,0x259],[0x2c6,0x2c7],[0x2d8,0x2dd],[0x300,0x304],[0x306,0x308],
[0x30a,0x30c],[0x312,0x312],[0x326,0x328],[0x3c0,0x3c0],[0x1e80,0x1e85],[0x1e9e,0x1e9e],
[0x1ebc,0x1ebd],[0x1ef2,0x1ef3],[0x1ef8,0x1ef9],[0x2013,0x2014],[0x2018,0x201a],[0x201c,0x201e],
[0x2020,0x2022],[0x2026,0x2026],[0x2030,0x2030],[0x2039,0x203a],[0x2044,0x2044],[0x2074,0x2074],
[0x20a8,0x20a8],[0x20ac,0x20ac],[0x20b9,0x20ba],[0x20bd,0x20bd],[0x2113,0x2113],[0x2122,0x2122],
[0x2126,0x2126],[0x212e,0x212e],[0x2190,0x2199],[0x2202,0x2202],[0x2206,0x2206],[0x220f,0x220f],
[0x2211,0x2212],[0x2215,0x2215],[0x221a,0x221a],[0x221e,0x221e],[0x222b,0x222b],[0x2248,0x2248],
[0x2260,0x2260],[0x2264,0x2265],[0x25ca,0x25ca],[0xfb01,0xfb02]
```

(The font's U+000D and U+FFFF entries are left out on purpose. Whitespace is already collapsed, and U+FFFF
is a noncharacter.)

**`breakLongWords(text, maxChars)`** (AC-7.10):
- Split on `' '`.
- Cut any word longer than `maxChars` code points into `maxChars`-sized pieces, joined with `'\n'`.
- Rejoin the words with `' '`.

React-pdf honours `'\n'` as a hard line break. Hyphenation is globally off (`fonts.ts`) and stays off.

The arithmetic behind 18:
- The heading's column is `maxWidth: '60%'` of 515.28pt, which is 309pt.
- The widest covered glyph in DM Sans Bold is ‰, at 1.28em. At 13pt that's 16.6pt.
- 309 / 16.6 = 18.6, so an 18-character run always fits, whatever the characters.

**`soaFileName(name, suffix)`** (BR-22, BR-23):
1. `name === null` returns `` `Hati-SOA-${suffix}.pdf` ``, exactly as today.
2. `s = name.normalize('NFC')`.
3. `s = s.replace(/[^\p{L}\p{N}\p{M}_]+/gu, '-')`: runs of anything that isn't a letter, digit, mark or
   underscore become one hyphen.
4. `s = s.replace(/(^|-)\p{M}+/gu, '$1')`: marks not attached to a letter or digit are removed. This covers
   emoji variation selectors and keycaps.
5. `s = s.replace(/-+/g, '-').replace(/^-+|-+$/g, '')`.
6. `s = Array.from(s).slice(0, 40).join('').replace(/-+$/, '')`.
7. An empty result gives the unnamed form. Otherwise the result is `` `Hati-SOA-${s}-${suffix}.pdf` ``.

Steps 3 and 4 refine BR-23 slightly. BR-23 literally keeps only letters, digits and underscores, which would
split accented letters in other scripts (Devanagari, Thai) with hyphens. Keeping marks that follow a letter
is the intent of "letter in any language". Every BR-23 example comes out the same either way. (This is
assumption A3.)

**Where the name comes from (BR-24).** It's the store's current value at the moment the button is tapped:
`useAppData().name` on Summary, and `session.name` on History detail.

## 6. UI

Shared conventions:
- All new mobile-only rules go inside `@media (max-width: 640px)`.
- Where desktop changes, it's only to show the name, the dates line and the pencil.
- A 60-character name, including one with no spaces, wraps: never an ellipsis, and never a horizontal
  scroll at 320px (BR-9, AC-1.8). Every name-bearing element gets `overflow-wrap: anywhere` and a
  `min-width: 0` flex parent.

### `PencilIcon` (`src/components/shared/icons.tsx`)

```tsx
export function PencilIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}
```

It's decorative (`aria-hidden` comes from `Icon`). Every button that holds it has an `aria-label`.

### `SessionNameInput` (new: `src/components/sessions/SessionNameInput.tsx`)

Why a new component instead of `EditableCell` (settled point 2): `EditableCell` doesn't fit the inline
rename, and bending it would change behaviour inside `BreakdownTable`.
- It's an always-mounted input that shows a resting value. The rename box mounts only after the pencil is
  tapped.
- Its text commit **drops empty values**, but clearing a name must save `null` (AC-3.6).
- It has no `maxLength` (AC-2.7), and it doesn't collapse internal whitespace (BR-2).
- It has a table-cell look: transparent until hover, and a 44px mobile height tuned to the Breakdown table.

The new component is about 50 lines.

**Props:**

```ts
type Props = {
  /** The saved name; null shows an empty box with the placeholder. */
  initialName: string | null;
  className?: string;
  /** Raw text. May be called more than once with the same value: the store makes repeats a no-op. */
  onSave: (raw: string) => void;
  /** The edit is over. Keyboard endings return focus to the pencil. */
  onClose: (via: 'enter' | 'escape' | 'blur') => void;
};
```

**Rendering:**
- `<input type="text">` with `aria-label="Session name"`, `placeholder="Name your session"` and
  `maxLength={SESSION_NAME_MAX}`. The owner set this placeholder after approval, to match the New Session
  prompt's heading; it replaces AC-3.2's "Name this session".
- `value` is local `draft` state, initialised to `initialName ?? ''`. Dates are never prefilled (AC-3.2).
- The latest draft is mirrored in a ref, so the unmount cleanup can read it.

**Behaviour.** A `finished` ref makes the first ending win.
- **Mount:** a `useEffect` calls `focus()` and then `select()` (AC-3.2).
- **Enter:** `preventDefault`; `finished = true`; `onSave(draft)`; `onClose('enter')`.
- **Escape:** `preventDefault`; `finished = true`; `onClose('escape')`. Nothing is saved (AC-3.5).
- **Blur:** if not finished: `finished = true`; `onSave(draft)`; `onClose('blur')`.
- **Unmount cleanup:** if not finished, `onSave(draftRef.current)`. It doesn't set `finished`.
  - This is the backstop for every "do something else while editing" case where the browser doesn't fire a
    blur first. iOS Safari is the known case: tapping a button there doesn't always blur the input, and the
    parent unmounts the box instead.
  - StrictMode's simulated unmount runs this with the untouched initial draft. That makes it a no-op through
    `applySessionName`, so nothing is sent.

**CSS** (`SessionNameInput.module.css`): `.input { width: 100%; min-width: 0; }`. Everything else comes from
the global `input[type='text']` (38px, 13px). There's no mobile override.

### Home cards (`SessionCard.tsx`, `SessionCard.module.css`)

**New prop** (only HomePage passes it; History never does):

```ts
/** Drafts on Home only: the pencil and the inline name editor. */
rename?: {
  editing: boolean;
  onStart: () => void;
  onSave: (raw: string) => void;
  onEnd: () => void;
};
```

**Restructure.** The pencil has to sit beside the title, and a button can't nest inside the card's
`<button>`. So the card becomes the **stretched-button pattern**:
- `.row` takes over the card's visual box: border, background, radius, padding, and a column with a 6px
  gap. It stays `position: relative`.
- The title becomes the card's one `<button className={styles.open}>`, whose `::after` covers the whole row:
  `content: ''; position: absolute; inset: 0; border-radius: var(--radius)`. Tapping anywhere on the card
  still opens it, and it's still a real button, which matters to the existing comment about keyboard
  behaviour.
- The pencil and the delete button get `position: relative; z-index: 1` (delete stays `absolute`, adding
  `z-index: 1`), so they sit above the overlay.

```tsx
<div className={styles.row} onPointerDownCapture={…} onClickCapture={…}>
  <span className={styles.top}>
    <span className={styles.titles}>
      <span className={styles.titleLine}>
        {editing ? (
          <SessionNameInput className={styles.nameInput} initialName={session.name} … />
        ) : (
          <button type="button" className={styles.open} onClick={onClick}
                  aria-describedby={/* ids of dates (if named), total, members, count */}>
            {sessionDisplayTitle(session)}
          </button>
        )}
        {rename && !editing && (
          <button type="button" ref={pencilRef} className={styles.rename}
                  title="Rename session"
                  aria-label={`Rename session ${sessionDisplayTitle(session)}`}
                  onClick={rename.onStart}>
            <PencilIcon className={styles.icon} />
          </button>
        )}
      </span>
      {session.name !== null && <span id={…} className={styles.dates}>{sessionTitle(session)}</span>}
    </span>
    <span id={…} className={styles.total}>{formatMoney(getGrandTotal(session.records))}</span>
  </span>
  <span id={…} className={styles.members}>…unchanged…</span>
  <span id={…} className={styles.count}>…unchanged…</span>
  {onDelete && <button … aria-label={`Delete session ${sessionDisplayTitle(session)}`}>…</button>}
</div>
```

The ids come from `useId()`. Before the restructure, the card button's accessible name was its whole text;
`aria-describedby` keeps that information. The outer elements stay `span`s, as today.

**CSS changes:**
- **Move:** the `.card` box rules (border, radius, background, padding, flex column, gap, transition) move
  to `.row`.
- **Hover:** `.card:hover` becomes `.row:has(.open:hover)`, so hovering the delete or pencil doesn't
  highlight the card, which matches today.
- **Focus:** keyboard focus rings the whole card as today:
  `.row:has(.open:focus-visible) { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(78, 168, 124, 0.18); }`
  plus `.open:focus-visible { box-shadow: none; }`.
- `.open` takes the old `.date` text styles (16px, 600, -0.02em, `--text`) plus `font: inherit` overrides,
  `background: none; border: none; padding: 0; text-align: left; cursor: pointer; color: inherit;
  overflow-wrap: anywhere; min-width: 0`. Delete `.date`. `.card` is removed.
- `.titles`: flex column, gap 2px, `flex: 1 1 auto`, `min-width: 0`. `.top` keeps
  `align-items: baseline`, so the total aligns with the title's first line (BR-9). `.total` keeps `nowrap`
  and adds `flex: none`.
- `.titleLine`: flex, `align-items: flex-start`, gap 4px, `min-width: 0`.
- `.dates`: 12px, `--text3`, `overflow-wrap: anywhere`.
- `.rename` (desktop): 26 × 23px (one title line), flex-centred, no border, `background: none`,
  `border-radius: var(--radius-sm)`, `color: var(--text2)` at `opacity: 0.8`, `cursor: pointer`,
  `flex: none`, `position: relative; z-index: 1`. Hover and focus-visible: `opacity: 1; color: var(--text);
  background: var(--surface2)`. The icon uses its own 16px `.pencilIcon` (the 15px `.icon` stays for
  delete). The owner asked for a stronger pencil after the ui-ux-tester's run (the original `--text3` at 0.7
  opacity was hard to find), then a touch quieter than full opacity: `--text2` at 0.8 is plainly visible but
  a step quieter than the `--text` title.
- `.rename` at 640px and below: `min-width: 32px; min-height: 32px; margin: -4.5px 0`. That's at least the
  delete button's 25px target (AC-3.12), without making the title line taller.
- `.titleLine .nameInput`: `flex: 1 1 auto`, `height: 28px`, `margin: -2.4px 0`, `padding: 0 8px`, and the
  title's type (16px, 600, -0.02em). The box takes the 23.2px title line's place without changing the
  card's height, so nothing below it moves while renaming (the first build grew the card by about 12px). The
  16px type also stops iOS zooming on focus. The two-class selector outranks the global
  `input[type='text']`. Only one box shows at a time.

An unnamed card in History or on Home renders the same as today, apart from the pencil on Home.

**Interaction while editing** (AC-3.8 to AC-3.11). There's no `.open` button while editing, so the card body
is inert apart from the input and the delete. Two guards on `.row`, using a `swallowClick` ref:
- `onPointerDownCapture`:
  - When not editing, set `swallowClick = false`.
  - When editing and the target is outside the input and outside the delete button, set
    `swallowClick = true`.
- `onClickCapture`: if `swallowClick`, reset it, call `e.stopPropagation()`, and, if still editing (the
  browser didn't blur), call `rename.onEnd()`.

So the tap that ends the edit never opens the session, and the next tap does (AC-3.8). A tap on delete isn't
swallowed. The blur saves first, and the confirmation reads the saved name (AC-3.9; see HomePage). Tapping
another card's pencil works either way: the blur saves the first edit, or the parent switches `editingId`
and the first box's unmount saves it (AC-3.10). A nav tab or "+ New Session" works the same way: blur or
unmount saves, and the action proceeds (AC-3.11).

**Focus:** when `onClose` reports `'enter'` or `'escape'`, set a `restoreFocus` ref. A `useEffect` on
`rename?.editing` then focuses `pencilRef` once the pencil is back (AC-2.8 spirit).

### HomePage (`src/pages/HomePage.tsx`)

- `const [editingId, setEditingId] = useState<string | null>(null)` keeps one edit open at a time (BR-17).
- Each draft card gets:
  ```ts
  rename={{
    editing: editingId === session.id,
    onStart: () => setEditingId(session.id),
    onSave: (raw) => renameSession(session.id, raw),
    onEnd: () => setEditingId((id) => (id === session.id ? null : id)),
  }}
  ```
  The card wires `onClose` to `onEnd`.
- **Delete is looked up by id, not snapshotted.** That removes the stale-title risk.
  - `pendingDelete` state becomes `pendingDeleteId: string | null`.
  - `const pendingDelete = drafts.find((s) => s.id === pendingDeleteId) ?? null`.
  - `onDelete={() => setPendingDeleteId(session.id)}`.
  - `onConfirm` deletes `pendingDelete.id`.
  - Remove the now-unused `Session` type import.
- **Delete message** (AC-1.5, AC-1.6). Let `title = sessionDisplayTitle(pendingDelete)`:
  - With records: `` `“${title}” and its ${pluralize(n, 'purchase')} will be deleted. This cannot be undone.` ``
    That's today's sentence with the display title.
  - Empty and named: `` `“${pendingDelete.name}” is empty. Deleting it cannot be undone.` ``
  - Empty and unnamed: `'This session is empty. Deleting it cannot be undone.'`, unchanged.
  - The shared `ConfirmDialog.module.css` `.message` gains `overflow-wrap: anywhere`, so a quoted
    60-character name with no spaces wraps instead of giving the dialog a horizontal scrollbar. Other
    confirmations' messages have ordinary words and look the same.
- The empty-state button and the `data-tour="session-list"` div are unchanged.

### "+ New Session" prompt (`NewSessionDialog.tsx`, new)

```ts
type Props = { onCancel: () => void; onCreate: (raw: string) => void };
```

- **Mounting:** App mounts it only while the prompt is open (`{naming && <NewSessionDialog …/>}`), so every
  opening starts with an empty box (AC-2.6).
- **Opening:** on mount, `if (!dialog.open) dialog.showModal()`. The guard is for StrictMode. `showModal`
  focuses the first focusable element, which is the input (AC-2.1).
- **Markup:** a `<dialog aria-labelledby="new-session-title">` containing a `<form>` with
  `className={confirmStyles.body}`:
  - `<h2 id="new-session-title" className={confirmStyles.title}>Name your session</h2>`. The owner set
    this heading after approval; it replaces AC-2.1's "Name this session (optional)". The placeholder,
    buttons and the box's accessible name are unchanged.
  - `<input type="text" aria-label="Session name" placeholder="e.g. Bali trip" maxLength={SESSION_NAME_MAX}>`,
    controlled by `draft`.
  - `<div className={confirmStyles.actions}>` holding `<Button onClick={cancel}>Cancel</Button>` and
    `<Button type="submit" variant="primary">Create</Button>`.
  - The tab order is box, Cancel, Create (AC-2.8). Create is always enabled (AC-2.4).
- **Submit** (Enter in the box, or Create): `preventDefault`. If the `submitted` ref is already set, return;
  otherwise set it and call `onCreate(draft)`. A double tap or repeated Enter makes exactly one session
  (AC-2.9).
- **Cancel, Escape and a backdrop click:** the dialog's `onCancel` calls `preventDefault`, then `cancel()`.
  `cancel()` calls `dialog.close()`, so the browser returns focus to the button that opened it, and then
  `onCancel()`. No session is made, and typed text is dropped without asking (AC-2.6).
- **A backdrop click closes it, the same as Cancel.** The dialog's `onClick` calls `cancel()` when
  `e.target` is the dialog element itself, exactly as `ConfirmDialog` does, so it matches the delete and
  remove-member confirmations. (The owner overruled assumption A1 at approval; AC-2.6 is read as "a backdrop
  click cancels, consistent with the confirmation dialogs".)
- **Styles:** import `../shared/ConfirmDialog.module.css` as `confirmStyles` for `dialog`, `body`, `title`
  and `actions`. There's precedent: `HistoryPage` reuses `HomePage.module.css`, and `SessionTabs` reuses
  `NavTabs.module.css`. `NewSessionDialog.module.css` adds:
  - `.input { margin-top: 6px; }`
  - Inside `@media (max-width: 640px)` the prompt is centred vertically in the *visible* viewport (an
    owner change after approval; it replaced an earlier top placement). A `useEffect` copies
    `window.visualViewport`'s `offsetTop` and `height` into `--visible-top` and `--visible-height` on the
    dialog, updated on its `resize` and `scroll` events, and
    `dialog.sheet { top: var(--visible-top, 0px); bottom: calc(100% - var(--visible-top, 0px) - var(--visible-height, 100%)); }`
    lets the shared `margin: auto` centre the box between those insets. With the keyboard closed that is
    the screen's centre. With it open, the visible viewport is the space above the keyboard, so the box and
    both buttons centre there rather than behind it (AC-2.10). Without `visualViewport` the fallbacks give
    the shared centring. The element selector keeps specificity above the shared `.dialog`.
  - The dialog element gets `className={`${confirmStyles.dialog} ${styles.sheet}`}`.

### App (`src/App.tsx`)

```ts
const { sessions, createSession, deleteSession, sync } = useSessionsStore();
const [naming, setNaming] = useState(false);

const startSession = (name: string | null) => {
  const id = createSession(name);
  if (phase === 'running' && tourSession.current === null) tourSession.current = id;
  openSession(id);
};
// The tour narrates one tap on the highlighted button; a prompt in the middle
// of it would be a step the tour knows nothing about (AC-5.2).
const newSession = () => (phase === 'running' ? startSession(null) : setNaming(true));
```

- Render `{naming && <NewSessionDialog onCancel={() => setNaming(false)} onCreate={(raw) => { setNaming(false); startSession(raw); }} />}`
  next to the onboarding dialogs.
- `createSession` normalises the name, so the raw text is passed straight through. Blank text gives an
  unnamed draft, opened on Expenses as today (AC-2.3, AC-2.4).
- `tourNavigate` is unchanged: it calls `createSession()` with no prompt (AC-5.1).
- In `endTour`, `untouched` also requires `created.name === null` (AC-5.5).
- Both New Session buttons (the nav fab and the empty state) already call `newSession` (AC-2.1, AC-2.2).

### Open session header (`SessionWorkspace.tsx`, `SessionWorkspace.module.css`)

```tsx
<div className={styles.bar}>
  <Button variant="ghost" size="sm" data-tour="workspace-back" onClick={onBack}>← Back to Home</Button>
  {session && (
    <div className={styles.titleBlock}>
      {renaming ? (
        <SessionNameInput className={styles.nameInput} initialName={session.name}
          onSave={(raw) => renameSession(sessionId, raw)}
          onClose={(via) => { setRenaming(false); if (via !== 'blur') restoreFocus.current = true; }} />
      ) : (
        <span className={styles.titles}>
          {session.name !== null && <span className={styles.name}>{session.name}</span>}
          <span className={styles.started}>{sessionTitle(session)}</span>
        </span>
      )}
      {session.status === 'draft' && !renaming && (
        <button type="button" ref={pencilRef} className={styles.rename}
                title="Rename session" aria-label="Rename session"
                onClick={() => setRenaming(true)}>
          <PencilIcon className={styles.icon} />
        </button>
      )}
    </div>
  )}
</div>
<SessionTabs active={tab} onChange={(t) => { setRenaming(false); onTabChange(t); }} />
```

- `renaming` is local state. The Back button and its `data-tour` are untouched, and the pencil is a sibling
  outside it (AC-4.1, AC-5.4).
- **Tabs while renaming:** switching tabs closes the box first, so its unmount saves even if the browser
  didn't blur (AC-4.3).
- **Back while renaming:** Back unmounts the workspace, which saves, so Home shows the new name (AC-4.4).
- **Closed sessions:** there's no pencil. Closed sessions open on the History detail page anyway (AC-4.5).
- **Unnamed:** the header shows the existing `.started` dates span, unchanged (AC-1.4).
- **CSS:**
  - `.titleBlock`: flex, `align-items: center`, `justify-content: flex-end`, gap 4px, `flex: 1 1 auto`,
    `min-width: 0`. The `auto` basis means a short date stays on Back's line, as today, and a long name
    wraps onto its own line.
  - `.titles`: flex column, `align-items: flex-end`, `text-align: right`, `min-width: 0`.
  - `.name`: 14px, 600, `--text`, `letter-spacing: -0.01em`, `overflow-wrap: anywhere`.
  - `.started`: unchanged, plus `overflow-wrap: anywhere`.
  - `.rename`: the same look as the card's `.rename` (`--text2` at 0.8, full `--text` on hover and focus),
    with a 32px target at 640px and below, plus a 16px `.icon`. It is centred on the title's **first
    line**, not on the name and dates together, so it sits beside the name (or beside the first line of a
    wrapping name), and beside the dates when the session is unnamed:
    - `.titleBlock` uses `align-items: flex-start` and sets `--first-line: calc(12px * 1.45)` (the dates
      line); `.titleBlock:has(.name)` sets `calc(14px * 1.45)` (the name line). 1.45 is the body's line
      height.
    - `.rename` sets `--pencil-height` (23px, or 32px at 640px and below), `height: var(--pencil-height)` and
      `margin-block: calc((var(--first-line) - var(--pencil-height)) / 2)`, so it is centred on that line and
      its margins give back the extra height. The line, and the header row, never grow.
  - No jump when the box opens. Desktop Back is 24px tall (a `sm` ghost button with `line-height: 1`), so
    an unnamed session's header row is 24px. `SessionWorkspace` adds `.unnamedInput` to the box when the
    session is unnamed, and `.titleBlock .unnamedInput { margin-block: -7px; }` keeps the 38px box at the
    row's 24px. A named session's two lines are already 37.7px, and on a phone Back is 38px, so neither
    needs it.
  - `.titleBlock .nameInput`: `width: min(20rem, 100%)`. It needs the two-class selector: a single
    `.nameInput` loses to the global `input[type='text'] { width: 100% }`, which is more specific, and that
    stretched the box across the whole header row in the first build.
  - At 375px a 60-character name wraps without hiding Back or the pencil (AC-4.6).

### History detail (`HistoryDetailPage.tsx`, `.module.css`)

```tsx
<h2 className={styles.heading}><span className={styles.date}>{sessionDisplayTitle(session)}</span></h2>
{session.name !== null && <p className={styles.dates}>{sessionTitle(session)}</p>}
<p className={styles.meta}>Finished …unchanged…</p>
…
<ExportSoaButton layout="inline" name={session.name} … />
```

- `.date` adds `overflow-wrap: anywhere; min-width: 0`.
- New `.dates`: 13px, `--text2`, `overflow-wrap: anywhere`.
- There's no pencil (AC-1.3).

### History list

There's no code change. `SessionCard` shows the name and dates line, with no pencil (AC-1.3).

### Summary and the SOA (`SummaryPage.tsx`, `ExportSoaButton.tsx`, `downloadSoa.ts`, `SoaDocument.tsx`, `styles.ts`)

- **`AppDataContext`:** the value gains `name: string | null` (`session.name`).
- **`SummaryPage`:** `<ExportSoaButton members={sortedMembers} records={records} name={name} />`.
- **`ExportSoaButton`:** gains the required prop `name: string | null`, passed into
  `downloadSoa({ members, records, fileNameSuffix, name })`. The disabled rule is unchanged (AC-7.13).
- **`downloadSoa`:**
  - `Args` gains `name: string | null`.
  - It passes `name` to `SoaDocument`.
  - `link.download = soaFileName(name, fileNameSuffix || todayIso())`.
- **`SoaDocument`:**
  - `SoaProps` gains `name: string | null`.
  - `const printable = printableSessionName(name)`.
  - The `Document` title is `printable ? `Hati SOA — ${printable}` : `Hati SOA — ${generatedOn}``
    (BR-20, AC-7.11).
  - `DocHeader` takes `name={printable}` and, when it isn't null, renders right after the
    "Statement of Account" line:
    ```tsx
    <Text style={styles.headerName}>{breakLongWords(name, PDF_HEADING_WORD_MAX)}</Text>
    ```
  - Nothing else changes: the Period and Generated lines are always shown, and page 2, the footer and all
    amounts are untouched (BR-18, BR-19, AC-7.14).
- **`styles.ts`:** add
  `headerName: { fontSize: 13, fontWeight: 700, color: palette.text, letterSpacing: -0.2, marginTop: 5 }`.
  It's more prominent than the 9pt `headerSub` lines and sits inside the 60% left column, so it wraps
  without reaching Members or Grand Total (AC-7.9).
- **`scripts/render-soa-check.tsx`:** pass `name: process.argv[5] ?? null` to `SoaDocument`. This is a dev
  harness for checking AC-7.9 and AC-7.10 in a real render.

The PDF is identical at any screen width, because nothing in it depends on the viewport (AC-7.12).

## 7. Onboarding tour impact

No step or target changes. One tour behaviour changes, after the ui-ux-tester's run (AC-5.2).
- `new-session` (nav fab and empty-state button), `session-list`, `workspace-back`, `tab-*`, `nav-*` and
  `finish-session` stay on the same elements, with the same names, on the same screens.
- No new element carries a `data-tour`.
- The header pencil is a sibling of the Back button, not inside it. Card pencils are children of the
  existing `session-list` div, which isn't moved.
- While `phase === 'running'`, New Session skips the prompt (AC-5.2). It shows again once the phase leaves
  `running` (AC-5.3). Step 1's Next still calls `createSession()` directly (AC-5.1).
- **Tapping the highlighted New Session on step 1 acts like Next.** The tap opens the new session on
  Expenses, which is step 2's screen. `OnboardingTour` used to treat any screen that didn't match the
  current step as wandering off and ended the tour. It now first asks `wentToNextStep(index, screen)` (new,
  in `steps.ts`): if the user is exactly where Next would have taken them, the tour moves to the next step
  instead. Anywhere else still ends it. `App` already records the tapped session as the tour's session, so
  later steps reuse it and `endTour` cleans it up as before.
- The tour's cleanup can't race the create: see the `creating` map under the store in section 5.
- **A rename open when the tour ends counts (AC-5.5).** If the header rename box is still open when Skip is
  tapped, iOS Safari doesn't blur it, so the name used to be saved only by the box's unmount, after
  `endTour` had already judged the session untouched and deleted it. Now:
  - `endTour` blurs the focused element first, so an open box saves through its normal blur path. The
    save is queued before, or together with, the tour's own state changes.
  - `endTour` no longer decides itself. It sets `tourCleanup` state to the tour's session id. An effect in
    `App` then keeps or deletes the session using the `sessions` of that render, which already hold the
    saved name. The "untouched" rule is unchanged.
  - This is React timing, not pure logic, and the Vitest suite runs in `node` with no component tests, so
    it has no unit test. The ui-ux-tester covers it: during the tour, open the header rename, type a name
    without Enter, tap Skip, and check that the session remains, named, after a reload.
- `endTour` keeps a tour session the user named (AC-5.5).
- Run `steps.test.ts` and `targets.test.ts`. Both must pass; `steps.test.ts` gains cases for
  `wentToNextStep`.

## 8. Test plan

The Vitest suite runs in `environment: 'node'` and includes only `src/**/*.test.ts`, so there are no
component tests. Pure logic is unit-tested; everything rendered goes to the ui-ux-tester. Write each Vitest
test before its code, and watch it fail.

### New and changed Vitest tests

| File | Cases |
|---|---|
| `src/lib/sessionName.test.ts` **(new)** | **`normaliseSessionName`:** trims; collapses spaces, tabs and newlines to one space; `"a\u0000b"` becomes `"a b"`; `''` and `'   '` give `null`; `42`, `{}`, `[]`, `undefined` and `null` give `null`; 80 chars become 60; 70 astral emoji become 60 code points with no lone surrogate; a cut that lands on a space is trimmed; `"bali TRIP"` keeps its casing. **`applySessionName`:** an unchanged name returns the same object (`toBe`); `"  Bali   Trip "` on a session already named `"Bali Trip"` returns the same object; a closed session returns the same object; a changed name returns a new object with the name; `'  '` on a named draft gives `name: null`; `''` on an unnamed draft returns the same object. |
| `src/lib/sessionValidation.test.ts` | `parseSession`: an absent `name` gives `null`; `"  Bali   Trip "` gives `"Bali Trip"`; `42`, `{}` or `true` give `null` and the session is still accepted; a 200-char name is cut to 60 (AC-6.3). |
| `src/lib/storage.test.ts` | The round-trip literals gain `name` (draft `"Bali Trip"`, closed `null`) and still round-trip equal; v1 migration gives `name: null`. |
| `src/lib/sessionLabel.test.ts` | `sessionDisplayTitle`: a named session gives the name; an unnamed one gives `sessionTitle`; `sessionTitle` on a named session still gives the dates (BR-8). The factory gains `name: null`. |
| `src/lib/soaName.test.ts` **(new)** | **`soaFileName`:** `"Bali Trip"` + `2026-05-05` gives `Hati-SOA-Bali-Trip-2026-05-05.pdf`; `"Dinner: 5/6 *final*?"` gives `Hati-SOA-Dinner-5-6-final-<s>.pdf`; `"🍻🍻"`, `"???"`, `"🍻️"` and `null` give `Hati-SOA-<s>.pdf`; `'a/b\\c:d*e?f"g<h>i\|j'` gives `a-b-c-d-e-f-g-h-i-j`; `"..hidden"` gives `Hati-SOA-hidden-<s>.pdf`; `"Bali_Trip"` keeps the underscore; `"Café Ñandú"` gives `Café-Ñandú`; NFD `"Café"` gives `Café`; `"東京 旅行"` gives `東京-旅行`; a 60-char name whose 40th character falls right after a space yields at most 40 code points and no trailing hyphen. **`printableSessionName`:** `"Bali Trip"` unchanged; `"Bali 🍻 Trip"` gives `"Bali Trip"`; `"🍻🍻"` gives `null`; `"???"` gives `"???"`; `"東京"` gives `null`; NFD `"Café"` gives NFC `"Café"`; `"₱"` gives `null` (a cross-check against the README's font note). **`breakLongWords`:** words of 18 or fewer chars untouched; 60 unbroken chars give 4 lines, each 18 or fewer; mixed `"Trip " + 30 chars` breaks only the long word. |
| `src/lib/apiImports.test.ts` | Unchanged. Must pass with the new `.js` imports in `storage.ts` and `_validate.ts`. |
| `src/components/onboarding/steps.test.ts`, `targets.test.ts` | Unchanged. Must pass. |

### Acceptance criteria to checks

Abbreviations: **U** is a Vitest test above; **T** is a ui-ux-tester check on `npm run dev:full` at 375px
and 1280px unless a width is named.

| AC | Check |
|---|---|
| 1.1, 1.2 | T: named card shows the name with a quieter dates line; unnamed card unchanged. U: `sessionLabel.test.ts`. |
| 1.3 | T: History card and detail show the name, dates and Finished line; no pencil. |
| 1.4 | T: header named and unnamed. |
| 1.5, 1.6, 1.7 | T: delete wording, empty and with purchases, named and unnamed; the aria-label read from the accessibility tree. |
| 1.8 | T at 320px and desktop: 60-char name with spaces and with none, in card, header and detail; no horizontal scroll or ellipsis, total visible, delete not overlapping. |
| 1.9 | T: finish a named draft; History shows the name. |
| 2.1, 2.2 | T: both New Session buttons open the dialog with focus in the box; no session exists until Create. |
| 2.3, 2.4 | T: named and blank creates open Expenses; blank gives the dates title. |
| 2.5 | T: create named, reload, then check another browser. |
| 2.6 | T: Cancel, Esc and a backdrop click each close the prompt: no session, same screen, empty box next time. |
| 2.7 | T: paste 80 chars; 60 kept. U: server truncation in `sessionName.test.ts`. |
| 2.8 | T: keyboard-only create; Tab order; the box's accessible name. |
| 2.9 | T: double-click Create and hold Enter; exactly one new card. |
| 2.10 | T at 375px (iPhone emulation): keyboard open, box and buttons visible. |
| 3.1 to 3.7 | T: pencil and aria-label on Home only; prefill and select; clicking the box doesn't open; Enter and blur save and survive a reload; Esc and an unchanged save send no PUT (Network panel); clearing reverts to dates. U: `applySessionName` same-object cases. |
| 3.8 to 3.11 | T: each ordering case, desktop and touch emulation. |
| 3.12 | T at 375px: pencil target 32px or more; box fits; total stays visible. |
| 4.1 to 4.6 | T: header pencil and label, edit, cancel and clear, tabs and Back while editing, no pencil on closed, 375px wrap. |
| 5.1 to 5.3 | T: run the tour (dev "Preview Tour") with Next and with a tap on the highlighted button; no prompt; afterwards the prompt returns. |
| 5.4 | U: `targets.test.ts`, `steps.test.ts`. T: steps highlight the same elements. |
| 5.5 | T: rename the tour session mid-tour, skip; the session remains. |
| 6.1 | T: pre-existing sessions unchanged, pencil on drafts. |
| 6.2 | T: block `/api/sessions/*` in DevTools, rename; the banner and "Try again" work. |
| 6.3 | U: `sessionValidation.test.ts`, `sessionName.test.ts`. |
| 7.1, 7.2 | T: download from Summary and from History detail; open the PDF; heading as specified, amounts unchanged. |
| 7.3, 7.4, 7.7 | T: file names. U: `soaName.test.ts`. |
| 7.5 | T: unnamed header and file name as today. |
| 7.6 | T: rename in header, then download; new name used. |
| 7.8 | T: `🍻🍻` and `???`. U: `printableSessionName`, `soaFileName`. |
| 7.9, 7.10 | Developer: `npx vite-node scripts/render-soa-check.tsx 4 10 /tmp/soa-long.pdf "<60 chars>"` for both a spaced and an unbroken name, then read the PDF. T: the same from the app. U: `breakLongWords`. |
| 7.11 | T: the PDF viewer's document title. |
| 7.12, 7.13 | T: both widths and both export points; disabled with no purchases. |
| 7.14, 7.15 | U: the existing `calculations.test.ts` stays green, and no calculation code changes. T: totals match the same session's pre-change PDF. |

## 9. Documentation impact

For the documentation-engineer, after the code ships:
- **README "Sessions" and "History" sections:** sessions can be named; the name is optional, and drafts can
  be renamed from the card pencil or the header.
- **README "SOA export":** file names `Hati-SOA-<name>-<date>.pdf` and `Hati-SOA-<date>.pdf`; the page-1
  name heading; the embedded title; characters DM Sans can't draw are omitted.
- **README "Data and privacy" SQL block:** add `name text -- null until the user names the session`.
- **`docs/mobile-breakpoints.md` (640px section):** the `SessionCard` and `SessionWorkspace` pencils (32px
  minimum) and the New Session dialog's centring in the visible viewport above the keyboard.
- Any user-facing guides in `Documentation/` that describe creating a session (the new prompt) or the SOA
  file name.

## 10. Tasks

1. **Schema.** Add the `alter table` to `schema.sql`. After approval, run
   `npx vite-node scripts/db/apply-schema.ts` once and report its output.
   → Verify: the command succeeds; re-running it is a no-op.
2. **Pure logic, tests first.**
   - Write `sessionName.test.ts` and `soaName.test.ts`, plus the new cases in `sessionValidation.test.ts`,
     `storage.test.ts` and `sessionLabel.test.ts`. Run `npm test` and confirm they fail.
   - Then add the `Session.name` type, `sessionName.ts`, `soaName.ts`, the `storage.ts` changes,
     `sessionDisplayTitle`, and `name: null` in `demoSessions.ts`.
   → Verify: `npm test` green; `npx tsc -b` green.
3. **API.** `_validate.ts` `parseSessionName`; POST and PUT SQL; `loadSessions`.
   → Verify: `npm test` (`apiImports`) green; `npx tsc -b` green.
4. **Client state.** `useServerSessions.addSession` body; `createSession(name?)` and `renameSession` in the
   store; `name` in `AppDataContext`.
5. **UI building blocks.** `PencilIcon`, `SessionNameInput`, `NewSessionDialog`.
6. **Screens.**
   - `SessionCard` restructure and rename; `HomePage` (editing state, delete by id, wording).
   - `App` (prompt, tour bypass, `endTour`).
   - `SessionWorkspace` header; `HistoryDetailPage`.
   → Verify: `steps.test.ts` and `targets.test.ts` green.
7. **PDF.** Thread `name` through `SummaryPage`, `HistoryDetailPage`, `ExportSoaButton`, `downloadSoa` and
   `SoaDocument`; add `headerName`; update the harness.
   → Verify: render the harness with no name, a 60-char spaced name and a 60-char unbroken name, and read
   each PDF.
8. **Full check.** `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, with real results reported.
9. **Local preview.** Start `npm run dev:full` (port 3000) in the background and report
   `http://localhost:3000` to the owner. Walk sections 6 and 8's T checks at 375px and desktop yourself
   before handing over to the ui-ux-tester.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| New code runs against the shared database before the column exists, so GET returns 500 on local, preview or sit | Task 1 runs first; section 3 states the order. |
| Old sit, qat or uat code against the altered table | Explicit column lists everywhere; the old upsert doesn't touch `name` (section 3). |
| A browser tab opened before the deploy (old bundle) saves a session after someone named it elsewhere, so the PUT without `name` clears the name | Accepted. It's the same last-write-wins every other field already has, and AC-6.3 defines a missing field as no name. Reloading the tab fixes it. |
| Blur-then-click ordering differs on iOS Safari, so edits could be lost or a session opened by mistake | Unmount-save backstop, `editingId` switching, and the swallow guard (section 6). Saves are idempotent, so double saves cost nothing. The tester covers touch. |
| The `SessionCard` restructure shifts the desktop or History look | The box, typography, hover and focus rules are moved, not redesigned. The tester compares unnamed cards before and after. |
| PDF heading overflow on an unbroken name | `breakLongWords` at 18, from measured glyph widths; checked by a real render (task 7). |
| Emoji print as boxes in the PDF | The coverage table filter is measured from the bundled fonts, and unit-tested. |

Size: **medium to large.** About 30 files, each change small; most of the effort is in the card
restructure and the edit-ordering cases. Risk: **medium** on interaction details, **low** on data, since
the schema change is additive only.

## 12. Decisions for the user

1. **Who applies the schema change to Neon `main`, and when.** *Recommendation:* approving this spec
   authorises the fullstack-developer to run `npx vite-node scripts/db/apply-schema.ts` once, as the first
   build task, before the local preview. It adds one nullable column and changes no existing data. The
   alternative is that you run it yourself before the build starts.
2. **Assumptions you can overrule before approving** (none blocks the build):
   - **A1. Overruled by the owner at approval.** A backdrop click on the New Session prompt closes it, the
     same as Cancel, and creates no session, matching the `ConfirmDialog` confirmations (delete session,
     remove member). AC-2.6 is amended to match.
   - **A2.** On page 1 the name sits under "Statement of Account" (Hati / Statement of Account /
     **Bali Trip** / Period / Generated). The embedded title uses the same printable text as the heading, so
     a name with nothing printable gives the unnamed title too.
   - **A3.** The file name keeps accent and vowel marks attached to their letters, and normalises to NFC, so
     names in other scripts aren't split by hyphens. All of BR-23's examples come out as written.
   - **A4.** Unbroken runs longer than 18 characters break onto a new line in the PDF heading, rather than
     being shrunk to fit.
