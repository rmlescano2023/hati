# Spec: Collection follow-up — quieter "who you are", nicknames, clearer money labels

Status: **draft, awaiting the owner's approval.** Branch `collection` (unshipped). A follow-up to
`docs/specs/collection.md`; where the two differ, this one wins for the parts it names.

## 1. Summary

The owner reviewed the unshipped Collection tab and found three problems: every card repeats "You are Renmar ·
Change" and the page repeats "You: Renmar · Edit"; a session where the user goes by another name ("Red",
"Tantan") lands in Needs setup every time; and the grey uppercase "OWED TO YOU" / "YOU OWE" labels don't read at
a glance.

This change:

- **Hides the identity line on cards Hati recognises** (placed by the profile name or a saved other name, or
  picked as one of them), and puts a quiet "Not you? Change" at the bottom of the expanded card instead. One-off
  picks and "I'm not in this session" keep today's line.
- **Removes the page-level "You:" line.** A failed "remember" now shows in Collection's sticky alert strip.
- **Adds saved other names (nicknames)** to the account: a nullable `users.nicknames text[]` column, read and
  written through `GET`/`PATCH /api/user`. Matching uses the profile name first and the other names only when the
  profile name matches no member. Pickers offer "Remember “Red” as another name for me", ticked by default. The
  Profile dialog gets an optional "Other names you go by" list.
- **Restyles the direction labels** in the totals strip, the card summary and the group headings: green with ↓
  for "Owed to you", amber with ↑ for "You owe", sentence case, larger. The hints ("they pay you", "you pay them")
  go in the strip and the group headings only.

Sources:
- the owner's intake brief, `peaceful-coalescing-karp.md` (2026-11-06);
- the business-analyst's requirements, `nicknames-requirements.md`: US-N1 to US-N6, BR-N1 to BR-N16, E1 to E23;
- the owner's answers to its open questions:
  - **Q1:** the profile name wins. Other names count only when the profile name matches no member, and two or more
    nickname hits mean ask.
  - **Q2:** the card summary gets the colour, arrow and words, with no hints.
  - **Q3:** green and amber stay, even though the status chips also use them.
- the analyst's defaults, which stand:
  - E11: re-saving the same one-off pick in Change with the box ticked remembers the name.
  - The Settled summary's "Received ₱X · Paid ₱Y" stays neutral.

Because of Q1, BR-N3, E2 and E7 read as follows:
- **E2** (a session with both "Paolo" and "Pao"): placed as Paolo automatically.
- **E7** (adding "Pao" when a friend Pao shares a session with Paolo): the session stays placed as Paolo.

**Assumptions** (veto any before approving):

- **N-A1.** The "Remember" checkbox state is per picker. It starts ticked each time a picker opens or its
  selection changes to a member that can be remembered (BR-N10).
- **N-A2.** A failed remember says so on Collection only, and the message persists until a profile save succeeds
  or the user dismisses it. The Profile dialog and the banner keep their own inline errors and no longer set it.
- **N-A3.** The amounts in the strip stay in the neutral `--text` colour. Only the label, arrow and hint are
  coloured (AC-N6.1 names the label only), so a ₱0.00 tile doesn't look like good or bad news.
- **N-A4.** The Profile dialog's title stays "Your name", and its menu item stays "Profile".
- **N-A5.** Other names are stored tidied, deduplicated and sorted (`sortNames`), so the stored order is the
  display order (BR-N9).

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Schema | `scripts/db/schema.sql` | `alter table users add column if not exists nicknames text[]` | `scripts/db/apply-schema.ts`, unchanged |
| Pure logic | `src/lib/profileName.ts` | `NICKNAMES_MAX`, `cleanNicknames`, `ProfileUpdate`, `StoredProfile`, `applyProfileUpdate` | `normaliseProfileName`, `compareNames`, `sortNames` |
| Pure logic | `src/lib/collection.ts` | `KnownNames`, `isKnownName`; `matchMember`, `resolveMe`, `buildCard` and `buildCollection` take `KnownNames`; `Me` gains `recognised`; `rememberOffer` (moved from `MePicker.tsx` and rewritten) | `compareNames`, `normaliseProfileName` |
| Dev data | `src/lib/demoSessions.ts` | its two `buildCard(picked, null)` calls pass `{ displayName: null, nicknames: [] }` | — |
| API | `api/_validate.ts` | `parseProfileInput` accepts `nicknames` and `addNickname` | `normaliseProfileName`, `NICKNAMES_MAX`, `isPlainObject` |
| API | `api/user.ts` | GET returns `nicknames`; PATCH runs in a locked transaction through `applyProfileUpdate`, with a 409 | `ensureUser`, the `pool.connect()` transaction pattern from `api/payments/index.ts` |
| Client state | `src/context/ProfileContext.tsx` | `nicknames`; `save(update)`; new `remember(name, as)` and `dismissSaveError`; PATCHes run one at a time | `authorisedFetch`, `withDeadline` |
| UI | `src/components/shared/icons.tsx` | `ArrowDownIcon`, `ArrowUpIcon`, `CloseIcon` | `Icon` |
| UI | `src/components/collection/DirectionLabel.tsx` + `.module.css` **(new)** | the one source of each direction's words, arrow and colour | — |
| UI | `src/components/collection/CollectionCard.tsx` + css | the quiet rule, "Not you? Change", coloured summary and group headings | `YouAre`, `ChangeMeDialog`, `DirectionLabel` |
| UI | `src/components/collection/MePicker.tsx` | the checkbox's rule and label come from `rememberOffer`; `offersRemember` removed | — |
| UI | `src/components/collection/ChangeMeDialog.tsx` | remembers through `profile.remember` | `rememberOffer` |
| UI | `src/components/summary/FinishSessionDialog.tsx`, `CloseSessionButton.tsx` | match with known names; `onConfirm`'s `remember` becomes `RememberOffer \| null` | `matchMember`, `rememberOffer` |
| UI | `src/components/profile/ProfileDialog.tsx` + css | the load guard, the "Other names you go by" list | `ProfileNameField`, `Button`, `isKnownName`, `cleanNicknames` |
| UI | `src/components/profile/ProfileBanner.tsx` | `save({ displayName: draft })` | — |
| UI | `src/pages/CollectionPage.tsx` + css | the "You:" line and its error removed; the strip uses `DirectionLabel`; the `onEditProfile` prop goes | — |
| UI | `src/App.tsx` | drops `onEditProfile`; passes `showProfileError` to `SyncBanner` | — |
| UI | `src/components/layout/SyncBanner.tsx` + css | on Collection, also shows a failed remember, in one sticky stack | `useProfile` |
| Tests | see section 8 | — | — |

**Not touched:** `LineRow` (wording and chips unchanged, AC-N6.8), the payments API and hooks,
`SessionsStoreContext`, `ProfileNameField`, `ModalDialog`, History, Summary, the PDF, the calculations (BR-N16),
and the onboarding tour.

## 3. Data model

Add after the `display_name` alter in `scripts/db/schema.sql`:

```sql
-- Other names the user goes by in some groups ("Pao" for "Paolo"), tidied
-- like display_name, deduplicated and sorted by the app. Collection matches
-- them only when display_name matches no member. Null means none, as does
-- an empty array.
alter table users add column if not exists nicknames text[];
```

- **Existing rows:** `null`, read as `[]`. No backfill.
- **Idempotent:** `if not exists`, so a re-run does nothing.
- **Non-destructive:** a nullable column with no default only changes the catalog. Nothing is dropped, rewritten
  or migrated.
- **Old code against the altered table** (sit, qat and uat until this ships there) keeps working. The old GET
  names its columns. The old PATCH sets only `display_name`.
- **Rollback:** leave the column. Never drop it on `main`.

**Applying it to the shared Neon `main`:** `npx vite-node scripts/db/apply-schema.ts`.
- **Gate:** approving this spec does **not** authorise the run. At task 1 the fullstack-developer stops and asks
  the coordinating session for the owner's explicit OK. The OK covers only this one statement. If the script
  would do anything else, the developer stops and reports.
- **When:** before `api/user.ts` is edited. The new GET selects `nicknames`, and against an unaltered table it
  returns 500, which makes Collection show "Couldn't load your profile."
- **stg and prod:** the devops-engineer runs the same command with `DATABASE_URL_OVERRIDE` before the hop that
  first brings this code there.

## 4. API contract

`api/user.ts` keeps the existing rules:
- `getUserId` first: 401 `{ error: 'Not signed in.' }`, or 500 `{ error: 'Auth is misconfigured.' }`.
- The row is the caller's own (`where id = ${userId}`), so the id is the ownership check.
- Validation in `api/_validate.ts`.
- `sql` templates only.

### `GET /api/user`

`select onboarded_at, display_name, nicknames from users where id = ${userId}`. The response adds
`nicknames: rows[0]?.nicknames ?? []`. Everything else is unchanged.

```json
{ "onboardedAt": "2026-11-01T00:00:00.000Z", "displayName": "Paolo", "nicknames": ["Pao"] }
```

### `PATCH /api/user`

**Request:** one of these shapes.

| Body | Meaning | Sent by |
|---|---|---|
| `{ "displayName": string \| null }` | Set the profile name. Other names are kept, minus one now equal to it (BR-N8, BR-N13). | the banner, "Remember as my name", and any tab on the old bundle |
| `{ "nicknames": string[] }` | Replace the other names, and keep the profile name. | not sent today, but valid |
| `{ "displayName": …, "nicknames": [...] }` | Replace both. | the Profile dialog |
| `{ "addNickname": string }` | Add one other name to whatever is stored (BR-N11). | the pickers' "Remember “X” as another name for me" |

**Validation:** `parseProfileInput(raw): ProfileUpdate | null` in `api/_validate.ts`. It returns `null`, and the
handler 400s with `{ error: 'Malformed profile.' }`, when:
- `raw` isn't a plain object;
- `addNickname` is present together with `displayName` or `nicknames`;
- `addNickname` is present and `normaliseProfileName(addNickname)` is null (not a string, or blank);
- neither `displayName` nor `nicknames` is present (so `{}` stays a 400);
- `displayName` is present and is neither a string nor `null`;
- `nicknames` is present and isn't an array of at most `NICKNAMES_MAX` (10) strings. Refusing a list of 11, rather
  than cutting it, means a name the user thinks is saved is never silently dropped (BR-N7).

Otherwise it returns one of these:
- `{ addNickname: normaliseProfileName(addNickname) }`;
- or the keys present, each normalised. `displayName` is normalised, so a blank one becomes `null`. `nicknames`
  becomes `nicknames.map(normaliseProfileName)` with the nulls dropped.

The three existing `parseProfileInput` tests still pass as written.

**Handler** (replaces today's PATCH branch):

1. Parse the body as today, then 400 on null.
2. `await ensureUser(userId)`.
3. `const client = await pool.connect()`, then `begin`. Lock the row, so two remembers from two devices are applied
   one after the other and neither is lost (AC-N4.8):

   ```sql
   select display_name, nicknames from users where id = ${userId} for update
   ```

4. `const next = applyProfileUpdate({ displayName: row.display_name ?? null, nicknames: row.nicknames ?? [] }, input)`.
5. If `next === null`: `rollback`, then 409
   `{ error: 'You can keep up to 10 other names.', code: 'too_many_names' }`.
6. Update the row:

   ```sql
   update users set display_name = ${next.displayName}, nicknames = ${next.nicknames}::text[]
   where id = ${userId}
   ```

   The driver sends a JS array as a Postgres array literal. The cast makes an empty array unambiguous.
7. `commit`, then 200 `{ displayName: next.displayName, nicknames: next.nicknames }`.

Wrap steps 3 to 7 in `try { … } catch (err) { await client.sql\`rollback\`; throw err; } finally { client.release(); }`,
as `api/payments/index.ts` does. The 409 path rolls back before it returns.

**Statuses:** 200, 400, 401, 405 (`Allow: GET, PUT, PATCH`, unchanged), 409, and 500 for misconfigured auth or a
body that isn't JSON.

## 5. Business logic

No money rule changes (BR-N16). Only who "me" is changes, and with it which lines show, exactly as a pick or a
rename does today.

### `src/lib/profileName.ts` additions

It already imports `toTitleCase` from `'./format.js'`. Add `compareNames` and `sortNames` to that import.

```ts
/** The most other names an account keeps (BR-N7). */
export const NICKNAMES_MAX = 10;

/**
 * Other names as they are stored: each tidied like the profile name, blanks
 * dropped, one per name ignoring case and accents, none equal to the profile
 * name, and sorted as member lists are (BR-N6, BR-N8, BR-N9). It doesn't cap
 * the count; the callers refuse a list that is too long instead of cutting it.
 */
export function cleanNicknames(raw: readonly string[], displayName: string | null): string[]

export type StoredProfile = { displayName: string | null; nicknames: string[] };

/** A profile write: set either field or both, or add one other name (BR-N11). */
export type ProfileUpdate =
  | { displayName?: string | null; nicknames?: string[] }
  | { addNickname: string };

/**
 * What a write leaves stored, or null when an add would go past the limit.
 * Only the fields the write names change, so a tab on the previous bundle,
 * which only sends the name, never wipes the other names (BR-N13).
 */
export function applyProfileUpdate(stored: StoredProfile, update: ProfileUpdate): StoredProfile | null
```

- **`cleanNicknames`:** for each entry in order:
  1. Normalise it with `normaliseProfileName`. Skip it if that's null.
  2. Skip it if `displayName !== null` and it compares equal to `displayName`.
  3. Skip it if it compares equal to one already kept.
  4. Otherwise keep it.

  Return `sortNames(kept)`.
- **`applyProfileUpdate`**, set (no `addNickname` key):
  1. `displayName = update.displayName !== undefined ? update.displayName : stored.displayName`.
  2. `nicknames = cleanNicknames(update.nicknames ?? stored.nicknames, displayName)`.
- **`applyProfileUpdate`**, add:
  1. `current = cleanNicknames(stored.nicknames, stored.displayName)`.
  2. If `addNickname` compares equal to `stored.displayName` or to any of `current`, return
     `{ displayName: stored.displayName, nicknames: current }`. This is a no-op that succeeds.
  3. Otherwise, if `current.length >= NICKNAMES_MAX`, return `null`.
  4. Otherwise return `{ displayName: stored.displayName, nicknames: cleanNicknames([...current, addNickname], stored.displayName) }`.

### `src/lib/collection.ts` changes

Add `import { NICKNAMES_MAX, normaliseProfileName } from './profileName.js';`. The `.js` is required, because the
API imports this module (`apiImports.test.ts`).

```ts
/** The names Hati recognises the user by: the profile name, if set, and their other names (BR-N1). */
export type KnownNames = { displayName: string | null; nicknames: string[] };

const sameName = (a: string, b: string): boolean => compareNames(a, b) === 0;

/** Whether a name is one of the user's own, ignoring case and accents but not spaces (BR-N2). */
export function isKnownName(name: string, names: KnownNames): boolean {
  return (
    (names.displayName !== null && sameName(name, names.displayName)) ||
    names.nicknames.some((n) => sameName(name, n))
  );
}

/**
 * The one member who is the user. The profile name decides first: one hit
 * places the session, and more than one is ambiguous, so nothing is guessed.
 * Only when it matches no member do the other names count, with the same
 * one-hit rule (owner, Q1), so saving a nickname never unplaces a session the
 * profile name already placed. Hits are counted by member, so one member
 * matching two of the names is still one hit.
 */
export function matchMember(members: string[], names: KnownNames): string | null {
  const { displayName } = names;
  const byName = displayName === null ? [] : members.filter((m) => sameName(m, displayName));
  if (byName.length > 0) return byName.length === 1 ? byName[0] : null;
  const byNickname = members.filter((m) => names.nicknames.some((n) => sameName(m, n)));
  return byNickname.length === 1 ? byNickname[0] : null;
}

export type Me =
  /**
   * `recognised`: the member is one of the user's own names, whether picked or
   * matched, so the card needn't say who they are (BR-N5). Derived on every
   * render, so it follows the names as they change.
   */
  | { kind: 'member'; name: string; picked: boolean; recognised: boolean }
  | { kind: 'notInSession' }
  | { kind: 'unknown' };
```

- **`resolveMe(session, names: KnownNames)`:** the same order as today (BR-N4).
  - A pick returns `{ kind: 'member', name: session.me, picked: true, recognised: isKnownName(session.me, names) }`.
  - A match returns `{ …, picked: false, recognised: true }`.
  - Update the doc comment to "an explicit pick, then the match on the user's names, then unknown".
- **`buildCard(session, names: KnownNames)`** and **`buildCollection(sessions, names: KnownNames)`:** the
  parameter is renamed and passed through. There's no other change.
- **`rememberOffer`**, moved here from `MePicker.tsx` so it can be unit tested, and rewritten for BR-N10:

  ```ts
  /** Which "Remember" checkbox a picker offers for its selection, if any. */
  export type RememberOffer = 'name' | 'nickname';

  /**
   * "Remember as my name" while no profile name is set, otherwise "Remember
   * “X” as another name for me", and only for a member Hati doesn't already
   * know (BR-N10). Callers use it both to show the checkbox and to decide
   * whether its value counts, since it only means something while shown.
   */
  export function rememberOffer(
    profile: KnownNames & { status: string },
    value: string | null,
  ): RememberOffer | null {
    if (profile.status !== 'ready' || value === null || value === NOT_IN_SESSION) return null;
    if (isKnownName(value, profile)) return null;
    // The name is stored tidied. One that tidies into something else, such as a
    // member name past 60 characters or with doubled spaces, would never match
    // again, so it isn't offered (BR-N6, E15).
    const stored = normaliseProfileName(value);
    if (stored === null || !sameName(stored, value)) return null;
    if (profile.displayName === null) return 'name';
    return profile.nicknames.length < NICKNAMES_MAX ? 'nickname' : null;
  }
  ```

- **`src/lib/demoSessions.ts`:** both `buildCard(picked, null)` calls become
  `buildCard(picked, { displayName: null, nicknames: [] })`. Its comment is unchanged.

### `src/context/ProfileContext.tsx`

```ts
type ProfileValue = {
  status: 'loading' | 'ready' | 'error';
  displayName: string | null;
  /** Other names the user goes by, tidied and sorted; empty when none. */
  nicknames: string[];
  /** The last failed remember's message, until a profile save succeeds or it's dismissed. Shown on Collection. */
  saveError: string | null;
  /**
   * The Profile dialog and the banner: stores exactly the fields given, raw as
   * typed. Not optimistic: resolves true once the server has stored them, and
   * only then updates the names. A failure is the caller's to show.
   */
  save: (update: { displayName?: string; nicknames?: string[] }) => Promise<boolean>;
  /**
   * A picker's "Remember": as the profile name, or added to the other names.
   * Never awaited by its callers; a failure sets `saveError`.
   */
  remember: (name: string, as: RememberOffer) => Promise<void>;
  dismissSaveError: () => void;
  reload: () => void;
};
```

- **Load:** also sets `nicknames` from
  `Array.isArray(body.nicknames) ? body.nicknames.filter((n): n is string => typeof n === 'string') : []`.
- **One PATCH at a time.** A `useRef<Promise<unknown>>(Promise.resolve())` chain. Each PATCH waits for the previous
  one to settle before it starts, and its deadline starts when it does. This keeps the responses in the order the
  server applied them, so a remember's reply can never be overwritten by an older one (AC-N4.8). The same chain
  serves `save` and `remember`.
- **`patch(body)`** (internal): `PATCH /api/user` with `withDeadline(WRITE_TIMEOUT_MS)`. It returns
  `{ ok: true }` or `{ ok: false; code?: string }`, reading `code` from a JSON error body. On 200 it sets
  `displayName` and `nicknames` from the response and clears `saveError`.
- **`save(update)`:** `patch(update)` resolves to `ok`. It no longer sets `saveError` on failure (N-A2).
- **`remember(name, as)`:** `patch(as === 'name' ? { displayName: name } : { addNickname: name })`. On failure it
  sets `saveError`:
  - With `code === 'too_many_names'`: `` `“${name}” wasn't saved: you already have 10 other names. Remove one in Profile to make room.` ``
  - With `as === 'nickname'`: `` `“${name}” wasn't saved as one of your names. Add it in Profile to try again.` ``
  - With `as === 'name'`: `` `“${name}” wasn't saved as your name. Enter it in Profile to try again.` ``
- **`dismissSaveError`:** `setSaveError(null)`.
- Remove the `SAVE_FAILED` constant. Add `nicknames`, `remember` and `dismissSaveError` to the memo and its
  dependencies.

Because `ProfileValue` has `displayName` and `nicknames`, a `profile` from `useProfile()` can be passed wherever
`KnownNames` is expected.

## 6. UI

New text is exactly as written. Colours used, with their WCAG contrast measured against the surfaces they sit on:

| Text | On `--surface` #1c1f25 | On `--bg` #14161a | On `--surface2` #23272f | On `--danger-bg` #2e1c1a |
|---|---|---|---|---|
| `--accent-text` #7fd3a8 (Owed to you) | 9.26:1 | 10.16:1 | 8.40:1 | — |
| `--warn-text` #e0b357 (You owe) | 8.45:1 | 9.28:1 | 7.67:1 | — |
| `--text2` #9ba1ac ("Not you?", headings, notes) | 6.36:1 | 6.98:1 | 5.77:1 | 6.23:1 (Dismiss) |
| `--danger-text` #f09287 (alert message) | — | — | — | 7.07:1 |

Every pairing passes AA (4.5:1) at any size. `--text3` (3.41:1 on surface) is used only for decorative separators
and the remove icon. The icon is a graphic, so it needs 3:1 (WCAG 1.4.11), and it gets 3.41:1.

### Icons (`src/components/shared/icons.tsx`)

On the shared `Icon`, which is `aria-hidden`. Add each one to the file's opening comment ("…the direction arrows
on Collection, the remove control in Profile"):

```tsx
export function ArrowDownIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </Icon>
  );
}

export function ArrowUpIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </Icon>
  );
}

export function CloseIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}
```

### `DirectionLabel` (`src/components/collection/DirectionLabel.tsx`, new)

This is the one place the words, arrows and colours are defined, so all three uses match (AC-N6.8).

```tsx
type Direction = CollectionLine['direction'];

const WORDS: Record<Direction, { label: string; hint: string }> = {
  owedToYou: { label: 'Owed to you', hint: 'they pay you' },
  youOwe: { label: 'You owe', hint: 'you pay them' },
};

type Props = {
  direction: Direction;
  /** Where the hint goes: after the label, under it, or nowhere (the card summary, Q2). */
  hint?: 'inline' | 'stacked';
  /** Follows the label inside its colour, such as the card summary's amount. */
  children?: ReactNode;
  className?: string;
};
```

It renders this, with each class from `DirectionLabel.module.css`:

```tsx
<span className={[styles.label, styles[direction], hint === 'stacked' && styles.stacked, className].filter(Boolean).join(' ')}>
  <span className={styles.main}>
    {direction === 'owedToYou' ? <ArrowDownIcon className={styles.arrow} /> : <ArrowUpIcon className={styles.arrow} />}
    {WORDS[direction].label}
    {children}
  </span>
  {hint && <span className={styles.hint}>{WORDS[direction].hint}</span>}
</span>
```

```css
/* Colour is never the only cue: the arrow and the words say the same (AC-N6.4). */
.label { display: inline-flex; flex-wrap: wrap; align-items: baseline; column-gap: 6px; row-gap: 2px; min-width: 0; }
.stacked { flex-direction: column; align-items: flex-start; }
.main { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.arrow { flex: none; width: 1.1em; height: 1.1em; }
.hint { font-size: 12px; font-weight: 400; }
.owedToYou { color: var(--accent-text); }
.youOwe { color: var(--warn-text); }
```

A screen reader reads the words and then the hint ("Owed to you", "they pay you"), and skips the arrow.

### Totals strip (`CollectionPage.tsx`)

Each tile becomes:

```tsx
<DirectionLabel direction="owedToYou" hint="stacked" className={styles.tileLabel} />
<span className={styles.tileAmount}>{formatCents(collection.owedToYouCents)}</span>
```

The "You owe" tile is the same with `youOwe`. In `CollectionPage.module.css`, `.tileLabel` becomes
`{ font-size: 14px; }`; its 12px size and `--text2` colour go. The tile, grid and amount are unchanged, and the
amount stays `--text` (N-A3). A ₱0.00 tile keeps its colour, arrow and hint (E22).

- **375px:** the tiles stay side by side (`1fr 1fr`, unchanged). Each tile is about 166px wide, with 142px inside
  its 12px padding. "↓ Owed to you" at 14px is about 115px, the hint sits under it, and ₱1,000,000.00 at 18px
  mono is about 140px. That's tight, but `.tileAmount` already has `overflow-wrap: anywhere`, so it wraps rather
  than overflowing (AC-N6.6).
- **1280px:** the same, wider. Nothing else moves (AC-N6.7).

### Card summary and group headings (`CollectionCard.tsx`)

- **Summary, Outstanding only (AC-N6.2):**
  - `summaryDetail` keeps returning `${settled} of ${count} settled` for Outstanding, but no longer returns the
    money part.
  - Render a new `MoneySummary` after the detail spans, inside `.titles`, when `card.bucket === 'outstanding'`:

    ```tsx
    <span className={styles.money}>
      {owedToYou.length > 0 && (
        <DirectionLabel direction="owedToYou">{` ${formatCents(card.owedToYouRemainingCents)}`}</DirectionLabel>
      )}
      {owedToYou.length > 0 && youOwe.length > 0 && <span aria-hidden="true" className={styles.sep}>·</span>}
      {youOwe.length > 0 && (
        <DirectionLabel direction="youOwe">{` ${formatCents(card.youOweRemainingCents)}`}</DirectionLabel>
      )}
    </span>
    ```

  - CSS: `.money { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; font-size: 13px; }`,
    `.money > * { white-space: nowrap; }` (a side wraps as a whole, never mid-amount) and
    `.sep { color: var(--text3); }`.
  - At 375px the card's text column is about 279px, so both sides usually fit on one line and otherwise wrap to
    two. There are no hints (Q2). The Settled summary's "Received ₱X · Paid ₱Y" is unchanged and neutral.
- **Group headings (AC-N6.3), on Outstanding and Settled alike:**
  - The `groups` array becomes `{ direction: CollectionLine['direction']; lines }[]`, keyed by `direction`.
  - Each heading becomes `<h4 className={styles.groupHeading}><DirectionLabel direction={group.direction} hint="inline" /></h4>`.
  - `.groupHeading` becomes `{ font-size: 14px; margin: 6px 0 2px; }`. The 10px size, uppercase, letter-spacing
    and `--text3` colour go.

### The identity line (`CollectionCard.tsx`, AC-N1.1 to N1.10)

Let `quiet = card.me.kind === 'member' && card.me.recognised`.

- **Where the line goes:**

  | Card | Line | Where |
  |---|---|---|
  | Needs setup | none | — (unchanged) |
  | Not quiet: a one-off pick, or "not in this session" | today's `YouAre`: "You are **Carlo** · Change" / "You're not in this session · Change" | where it is today, visible collapsed too (AC-N1.7, AC-N1.8) |
  | Quiet and expandable (`lineCount > 0`) | "Not you? Change" | last child of the expanded body: after `MarkAll` on Outstanding, after the last group on Settled; not shown collapsed (AC-N1.4) |
  | Quiet and not expandable (Settled, no lines) | "Not you? Change" | where `YouAre` is today, below the summary (AC-N1.6) |

- **`YouAre`** renders both variants. When `quiet`:

  ```tsx
  <span>Not you?</span>
  <Button variant="ghost" size="sm" className="link-action"
    aria-label={`Change who you are in ${title}. Now: ${card.me.name}`}
    onClick={() => setChanging(true)}>Change</Button>
  ```

  - It has no middle dot. "Not you?" is plain text (AC-N1.5).
  - The not-quiet variant, its dot and its `aria-label` are unchanged.
  - Both variants open `ChangeMeDialog`, with the current member preselected (unchanged).
  - Its doc comment becomes: "Who the user is in the session. Spelled out on the card for a one-off pick or 'not in
    this session'; a card placed by one of the user's own names only offers 'Not you? Change', once expanded,
    since repeating their own name on every card is noise (US-N1)."
- **The line follows the names** with no reload (AC-N1.9, AC-N3.6). `recognised` is derived from the context on
  every render, through `buildCollection`'s memo.
- **Timing:** after Confirm with the box ticked, the card shows "You are **Pao** · Change" until the name is saved,
  then goes quiet (AC-N4.2). That's because saving names isn't optimistic (BR-N12).

### Pickers (`MePicker`, Needs setup, `ChangeMeDialog`, Finish)

- **`MePicker`:**
  - Delete `offersRemember` and its eslint-disable line.
  - Compute `const offer = rememberOffer(profile, value)`. Show the checkbox when `offer !== null`, labelled:
    - "Remember as my name" for `'name'`;
    - `` `Remember “${value}” as another name for me` `` for `'nickname'`.
  - It uses the existing `.option` and `.optionLabel` classes, which are already 38px tall on phone and wrap long
    names (AC-N4.10). There's no CSS change.
  - It never shows both checkboxes (AC-N4.7).
- **"Starts ticked" (N-A1):** in each parent (`NeedsSetup`, `ChangeMeDialog`, `FinishSessionDialog`),
  `remember` starts `true` and is never reset during the picker's life. An untick holds until the picker closes
  (BR-N10).
- **Committing,** in all three, uses one rule:
  `const offer = rememberOffer(profile, value); if (remember && offer !== null) void profile.remember(value, offer);`.
  - `NeedsSetup` and `ChangeMeDialog` run it right after `setMe`.
  - `FinishSessionDialog` passes it up instead: `onConfirm(value, remember ? rememberOffer(profile, value) : null)`
    with the picker open, and `onConfirm(null, null)` with a match shown.
  - E11 (Change on a one-off pick, saved unchanged with the box ticked) therefore remembers the name.
- **`FinishSessionDialog`:**
  - `match = profile.status === 'ready' ? matchMember(members, profile) : null`, so "Collecting as **Pao** ·
    Change" shows for a nickname match, and Finish stores no pick (AC-N3.5, A1).
  - The `onConfirm` doc says `remember` is the offer to act on, or null.
- **`CloseSessionButton`:**
  - Calls `if (remember !== null && me !== null) void profile.remember(me, remember);`. `rememberOffer` already
    excludes `NOT_IN_SESSION`, so the `NOT_IN_SESSION` import goes.
  - Its comment becomes: "Not awaited: the session is finished either way, and a failed save shows in Collection's
    alert strip (A2)."

### Failed remember (`SyncBanner`, AC-N2.4)

**Where:** in the alert strip at the top of Collection, the one `SyncBanner` already pins there with `sticky`.
Landing from Finish scrolls the page down to the new card, and the remember fails some seconds later, so only a
pinned strip is guaranteed to be on screen when it does. Picks made in Needs setup or Change move their card to
another section, so a message on the card would leave with it.

- **`App.tsx`:** `<SyncBanner sticky={screen.kind === 'collection'} showProfileError={screen.kind === 'collection'} />`.
- **`SyncBanner.tsx`:**
  - New prop: `showProfileError?: boolean`, documented as "Collection only: also report a name a picker couldn't
    remember".
  - It reads `useProfile()`.
  - It builds today's sync strip (error or reverted note, with today's precedence) **without** the sticky class,
    or null.
  - When `showProfileError && profile.saveError !== null`, it also builds:

    ```tsx
    <div className={styles.banner} role="alert">
      <span className={styles.message}>{profile.saveError}</span>
      <Button size="sm" variant="ghost" onClick={profile.dismissSaveError}>Dismiss</Button>
    </div>
    ```

  - If both are null, it returns null. Otherwise it returns
    `<div className={`${styles.stack}${sticky ? ` ${styles.sticky}` : ''}`}>{syncStrip}{profileStrip}</div>`, so
    when both show they stack instead of overlapping.
- **`SyncBanner.module.css`:**
  - Remove `margin-bottom: 1rem` from `.banner`.
  - Add `.stack { display: flex; flex-direction: column; gap: 6px; margin-bottom: 1rem; }`.
  - Move `box-shadow: var(--shadow-md)` from `.sticky` to a new `.sticky > .banner` rule.
  - A single strip looks exactly as today on every screen.
- **Lifetime:** the message stays until a profile save succeeds or Dismiss is pressed. It names the name, and
  points to Profile in the avatar menu. The pick itself is already stored (BR-N12).

### Collection page (`CollectionPage.tsx`, US-N2)

- Delete `youLine`, the `.top` wrapper, the `saveError` alert and the `onEditProfile` prop (with its doc). The page
  now starts with the banner or the empty state (AC-N2.1, AC-N2.5).
- In `CollectionPage.module.css`, delete `.top`, `.you`, `.you > button:first-child`, `.you strong` and `.alert`.
- `Button` stays imported, because the load error's "Try again" uses it.
- `buildCollection(sessions, { displayName: profile.displayName, nicknames: profile.nicknames })`, with the memo
  depending on `[sessions, profile.displayName, profile.nicknames]`.
- `ProfileBanner` still shows when `displayName === null` and a finished session exists, whatever the other names
  (AC-N2.3).
- `App.tsx` drops `onEditProfile={…}`. The profile stays reachable from the avatar menu (AC-N2.2).

### Profile dialog (`ProfileDialog.tsx`, US-N5)

- **Load guard (AC-N5.10, E14).** `ProfileDialog` keeps the `ModalDialog` and title, and renders by status:
  - `loading`: `<p role="status" className={confirmStyles.message}>Loading your profile…</p>` and actions
    [Cancel].
  - `error`: `<p role="alert" className={confirmStyles.message}>Couldn't load your profile.</p>` and actions
    [Cancel, primary "Try again" calling `profile.reload`].
  - `ready`: a new inner `ProfileForm`, in the same file. Mounting it only once the profile is ready means its
    state starts from the loaded values, even if the dialog was opened earlier.

  There's no Save in the first two states, so a blank can never overwrite the stored profile.
- **`ProfileForm` state:**
  - `name` starts at `displayName ?? ''`.
  - `others` starts at `nicknames`.
  - `adding: boolean` starts false.
  - `pending: string` starts `''`.
  - `duplicate: boolean`.
  - `saving` and `failed`.
- **Layout,** top to bottom inside the existing `<form>`:
  1. `ProfileNameField` with `autoFocus`, unchanged, so it keeps the focus (AC-N5.1).
  2. `<section aria-labelledby={othersId} className={styles.others}>`, holding:
     - **Heading:** `<h3 id={othersId} className={styles.othersHeading}>Other names you go by</h3>`.
     - **List:** when `others.length > 0`, a `<ul className={styles.list}>` with one `<li className={styles.item}>`
       per name. Each item holds `<span className={styles.itemName}>{n}</span>` and a remove button:
       `<Button variant="icon" size="sm" className={styles.remove} aria-label={`Remove ${n}`} onClick={…}><CloseIcon className={styles.removeIcon} /></Button>`.
       The button removes the name from `others` (AC-N5.3). It's icon-only, so it has the `aria-label`.
     - **Below the list:**
       - With `others.length >= NICKNAMES_MAX`: a disabled ghost "Add a name" button, then
         `<p className={styles.note}>You can keep up to 10 other names.</p>` (AC-N5.6).
       - Otherwise, when `!adding`: a ghost `size="sm"` button with `className="link-action"`, "Add a name". It
         sets `adding`, and the add field takes focus.
       - Otherwise (`adding`): the add row. It holds `<input type="text" autoComplete="off" maxLength={PROFILE_NAME_MAX} aria-label="Another name you go by" aria-describedby={duplicate ? dupId : undefined} autoFocus>`
         and a `Button size="sm"` "Add", disabled while `normaliseProfileName(pending) === null`. When
         `duplicate`, it also shows
         `<p id={dupId} role="alert" className={styles.error}>That's already one of your names.</p>`
         (AC-N5.5). Typing clears `duplicate`.
  3. On a failed save: `<p role="alert" className={styles.error}>Couldn't save your profile. Check your connection and try again.</p>`
     (AC-N5.8). This changes the dialog's text only; the banner keeps "Couldn't save your name."
  4. Actions Cancel and Save, unchanged.
- **Adding** runs on "Add", or on Enter in the add field, which calls `e.preventDefault()` so the form isn't
  submitted (AC-N5.2):
  1. `const n = normaliseProfileName(pending)`. If it's null, do nothing.
  2. If `isKnownName(n, { displayName: normaliseProfileName(name), nicknames: others })`, set `duplicate` and
     stop.
  3. Otherwise `setOthers(sortNames([...others, n]))`, clear `pending` and keep the field focused for another
     name.

  At the limit the add row gives way to the note.
- **Save** (AC-N5.4):
  1. `const extra = normaliseProfileName(pending)`.
  2. `const list = extra !== null && others.length < NICKNAMES_MAX ? [...others, extra] : others`. A name typed
     but not yet added is included, and the server drops it if it's a duplicate.
  3. `const ok = await save({ displayName: name, nicknames: list })`. True closes the dialog; false keeps it open
     with the edits and shows the alert.
- **Cancel and Escape** store nothing (unchanged).
- **CSS** (`ProfileDialog.module.css`, added alongside `.error`):

  ```css
  .others { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .othersHeading { font-size: 12px; font-weight: 500; color: var(--text2); }
  .list { display: flex; flex-direction: column; gap: 4px; list-style: none; }
  .item { display: flex; align-items: center; gap: 8px; padding: 2px 2px 2px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px; color: var(--text); }
  /* A 60-character name wraps inside the dialog rather than scrolling it sideways (AC-N5.7). */
  .itemName { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
  .remove { flex: none; }
  .removeIcon { width: 14px; height: 14px; }
  .addRow { display: flex; gap: 8px; }
  .addRow input { flex: 1 1 auto; min-width: 0; }
  .note { font-size: 12px; color: var(--text2); }

  @media (max-width: 640px) {
    /* The remove control is icon-only, so it also needs the touch width the
       shared Button only gives in height. */
    .remove { min-width: 38px; }
  }
  ```

- **Rows are 38px tall on phone** through the shared `Button` rule. The dialog relies on the browser's modal
  `max-height` and `overflow: auto` to scroll with 10 names at 375×667. The ui-ux-tester checks this (T-N6).
- **`ProfileBanner`:** `save(draft)` becomes `save({ displayName: draft })`. There's no other change.
- **Nothing else asks for other names** (AC-N5.9). There's no banner text, Finish text or tour step for them.

### Phone and desktop summary

- **Mobile-only CSS:** one new rule, `.remove { min-width: 38px; }` in `ProfileDialog.module.css`, inside
  `@media (max-width: 640px)`. Everything else is one layout at every width, built from rules that already wrap.
- **Desktop at 1280px:** the label restyle and the changes above. There are no layout moves (AC-N6.7). Home,
  History and the session screens are unchanged.

## 7. Onboarding tour impact

**None.**
- No `data-tour` attribute is added, moved, renamed or duplicated. Collection's step targets only
  `nav-collection`, which this doesn't touch. `finish-session` stays on the same button in `CloseSessionButton`.
- The removed "You:" line, the new "Not you? Change" and the Profile list carry no targets.
- No step's text mentions the "You:" line or the labels.
- Run `steps.test.ts` and `targets.test.ts`. Both must pass unchanged.

## 8. Test plan

Vitest runs in `node` over `src/**/*.test.ts`, with no component tests (adding them would need a dependency).
Write each case first and watch it fail. Fixtures follow the requirements: the profile is "Paolo", the other name
is "Pao", and the other members are Ana, Ben and Carlo. Add a helper
`const names = (displayName: string | null, ...nicknames: string[]): KnownNames => ({ displayName, nicknames })`.

### Vitest

**`src/lib/collection.test.ts`:**

- **Existing cases:** every `profileName` argument becomes `names(…)`, and the `resolveMe` member expectations gain
  `recognised`. Every case passes as before.
- **`matchMember`:**
  - "Pao" places members [Ana, Pao] with no profile hit (AC-N3.1).
  - "pao" and "Páo" match "Pao"; "Pao L" doesn't (AC-N3.2).
  - The profile name wins: names("Paolo", "Pao") on [Paolo, Pao] gives Paolo (Q1, E2).
  - Two profile hits give null even with one nickname hit.
  - No profile hit and two nickname hits give null: names("Paolo", "Pao", "Red") on [Pao, Red], and names(null,
    "Pao") on [Pao, Páo] (AC-N3.3).
  - names(null, "Pao") on [Ana, Pao] gives Pao (AC-N3.4).
  - names(null) gives null.
- **`isKnownName`:** true for the profile name and for an other name, ignoring case and accents; false otherwise,
  and false with no names.
- **`resolveMe`:**
  - An automatic match is `recognised: true`.
  - A pick of "Pao" with "Pao" known is `picked: true, recognised: true` (AC-N1.3).
  - A pick of "Carlo" is `recognised: false` (AC-N1.7).
  - `NOT_IN_SESSION` is still `notInSession` (AC-N1.8, E18).
- **`buildCollection`:**
  - A [Ana, Pao] session is outstanding with names("Paolo", "Pao") and needsSetup with names("Paolo")
    (AC-N1.2, AC-N3.6).
  - Removing "Pao" sends an automatic Pao session to needsSetup, keeps a picked one (now not recognised), and
    changes no payment (AC-N3.6, E3).
  - Adding "Pao" leaves a [Paolo, Pao] session matched as Paolo (E7 under Q1).
  - A one-off "Carlo" pick becomes recognised once "Carlo" is added (AC-N1.9).
  - A one-member session is placed when its member is known (E19).
- **`rememberOffer`** (BR-N10, AC-N4.1, N4.6, N4.7):
  - Null while `loading` or `error`, for `NOT_IN_SESSION`, and for `null`.
  - Null for a member matching the profile name, an other name, or an accent variant of one (E23).
  - `'nickname'` for an unknown member with a profile name set, and `'name'` without one.
  - Null with 10 other names and a profile name; `'name'` with 10 other names and no profile name.
  - Null for a 61-character member name and for "Pao  L" with a double space (BR-N6, E15).

**`src/lib/profileName.test.ts`:**

- **`cleanNicknames`:**
  - Tidies and title-cases.
  - Drops blanks.
  - Keeps one of "pao" and "Páo".
  - Drops a name equal to the profile name (E5).
  - Sorts the result.
- **`applyProfileUpdate`:**
  - A name-only update keeps the other names (BR-N13), but drops one that now equals the new name (BR-N8).
  - A nicknames-only update keeps the name.
  - An add appends and sorts.
  - An add of a known name, or the profile name, is unchanged and not null.
  - An add at 10 is null; an add of a duplicate at 10 is unchanged, not null (BR-N7).
  - An add with no profile name works (E4).

**`src/lib/apiValidation.test.ts`, `parseProfileInput`:**

- The three existing cases are unchanged.
- **Accepted:**
  - `{ nicknames: [' pao ', '  '] }` gives `{ nicknames: ['Pao'] }`.
  - `{ displayName: 'paolo', nicknames: [] }` gives both fields.
  - `{ addNickname: ' pao ' }` gives `{ addNickname: 'Pao' }`.
- **Null:**
  - `{ nicknames: 'Pao' }` and `{ nicknames: [5] }`.
  - 11 entries.
  - `{ addNickname: '  ' }` and `{ addNickname: 5 }`.
  - `{ addNickname: 'Pao', displayName: 'X' }`.

**Unchanged, and must pass:** `steps.test.ts`, `targets.test.ts`, `apiImports.test.ts` (now reaching
`profileName.ts` from `collection.ts`), `demoData.test.ts`, and the rest.

### Reviewer checks (surgeon-reviewer)

- **R-N1.** `PATCH /api/user`: `getUserId` first; validation only in `_validate.ts`; the `for update` lock; the
  409 path rolls back; the client is released in `finally`; `sql` templates only; `${next.nicknames}::text[]`.
- **R-N2.** `ProfileContext` PATCHes go through the one chain. `save` doesn't set `saveError`; `remember` does.
- **R-N3.** No `data-tour` changes. The only mobile rule is inside `@media (max-width: 640px)`. Every remove
  button has its `aria-label`. No new dependency. The arrows are `aria-hidden`.
- **R-N4.** `offersRemember` is gone, with no orphaned imports (`NOT_IN_SESSION` in `CloseSessionButton`).
  CollectionPage's dead styles are removed. `LineRow` is untouched.

### ui-ux-tester walkthrough

Run on `http://localhost:3000` at 375px, then at 1280px. The ground rules from `collection.md` apply: use "UI
test …" sessions only, on the second test account, and restore any profile you change.

**Setup:** profile name "Paolo", no other names. Finished sessions:
- "UI test N1": Ana and Paolo.
- "UI test N2": Ana and Pao.
- "UI test N3": Ben and Pao.
- "UI test N4": Paolo and Pao.
- "UI test N5": Carlo and Ana.
- "UI test N6": Ana and Paolo, even, so Settled with no lines.

| # | Steps | ACs |
|---|---|---|
| T-N1 | Collection has no "You:" line, in the empty state or with sessions. N1 shows no "You are" line, collapsed or expanded. Expanded, "Not you? Change" is last, after Mark all. Change's accessible name is "Change who you are in UI test N1. Now: Paolo", and it opens the dialog with Paolo selected. N6 shows "Not you? Change" under its summary, with no toggle. N4 is placed as Paolo, not Needs setup. | N1.1, N1.4 to N1.6, N2.1, N2.5, Q1 |
| T-N2 | N2 and N3 are in Needs setup. Select Pao on N2: "Remember “Pao” as another name for me" shows, ticked, and is 38px tall at 375px. Confirm: N2 is placed, goes quiet once saved, and N3 leaves Needs setup on its own. | N1.2, N3.1, N4.1, N4.2, N4.10, E8 |
| T-N3 | Pick Carlo on N5 with the box **unticked**: "You are **Carlo** · Change" shows, and the other names are unchanged. Open Change on N5 and Save unchanged with the box ticked: Carlo is remembered and the line goes (E11). Remove Carlo in Profile: the line comes back. Remove Pao: N2 and N3 return to Needs setup, and no payment changes. | N1.7, N1.9, N3.6, N4.3, N4.5, E3 |
| T-N4 | Finish a draft with Ana and Pao, with Pao saved: "Collecting as **Pao** · Change". Finish one with Ana and Zed: the picker shows; select Zed, and the ticked box saves Zed after Finish. With the profile name cleared, the box reads "Remember as my name", and only that one shows. Select "I'm not in this session", or a known member: no box. | N3.5, N4.4, N4.6, N4.7, E17 |
| T-N5 | Go Offline, then pick on a Needs setup card with the box ticked. The pick stands, and the pinned strip reads "“X” wasn't saved as one of your names. Add it in Profile to try again." with Dismiss. Repeat via Finish: the strip is on screen after landing scrolled to the card. With both a sync failure and this one, the two strips stack and don't overlap. Dismiss clears it. | N2.4, N4.9 |
| T-N6 | **Profile:** with no other names, a quiet "Other names you go by" heading and "Add a name", with no empty rows or counts, and the name field focused. Add "pao" with Enter: "Pao" is listed, and the dialog stays open. Add "Páo" or "paolo": "That's already one of your names." Remove has `aria-label="Remove Pao"`. Type a name without Add, then Save: it's saved. Cancel and Escape store nothing. Add 10: "Add a name" is disabled with the note, and the dialog scrolls at 375×667. A 60-character name wraps, with no sideways scroll. Offline Save: the dialog stays open with "Couldn't save your profile…". Open Profile while the profile is failing to load: it shows "Couldn't load your profile." with Try again, and no Save. | N5.1 to N5.8, N5.10 |
| T-N7 | **Labels at 375px and 1280px:** the strip shows ↓ "Owed to you" in green with "they pay you" under it, and ↑ "You owe" in amber with "you pay them". Both stay side by side, including at ₱0.00, and ₱1,000,000.00 wraps inside its tile. A collapsed Outstanding card shows the coloured "↓ Owed to you ₱X · ↑ You owe ₱Y" with no hints. The expanded headings are coloured, 14px, sentence case, with inline hints, on Settled too. A greyscale screenshot still tells them apart. The Settled summary, the LineRow wording and the chips are unchanged. | N6.1 to N6.8, E22 |
| T-N8 | Two quick Confirms on cards for "Pao" and "Paoie": both names end up in Profile. Tour (Preview Tour): every step lands as before. | N4.8, section 7 |

### Checks before done

`npm run lint`, `npx tsc -b`, `npm test` and `npm run build`, with the real results reported.

## 9. Documentation impact

For the documentation-engineer, when the Collection work ships (it isn't documented yet, so fold this in with
`collection.md`'s items):

- **README, "Data and privacy":** the SQL block gains `users.nicknames`. **"How it works", Collection:** Hati
  matches the profile name first, then saved other names; the "Remember" checkbox; the "Other names you go by"
  list in Profile.
- **API reference:** `GET /api/user` returns `nicknames`; `PATCH /api/user` takes the four body shapes, with the 409.
- **`docs/mobile-breakpoints.md`:** under 640px, `profile/ProfileDialog.module.css` `.remove` (38px touch width).
- The agents' Word documents are updated only when the owner asks (see memory).

## 10. Tasks

1. **Schema (gated).** Add the statement to `schema.sql`. **Stop and get the owner's explicit OK** through the
   coordinating session. Then run `npx vite-node scripts/db/apply-schema.ts` once and report the output.
   → Verify: a second run succeeds the same way, and Collection loads on `:3000`.
2. **Tests first.** The new cases in `collection.test.ts`, `profileName.test.ts` and `apiValidation.test.ts`,
   and the existing ones moved to `names(…)`.
   → Verify: `npm test` fails on exactly those.
3. **Pure logic.** The `profileName.ts` additions, then the `collection.ts` changes, including `rememberOffer`.
   Then `demoSessions.ts`.
   → Verify: `npm test` passes. `npx tsc -b` fails only at the callers.
4. **API.** `parseProfileInput`, then `api/user.ts` GET and PATCH.
   → Verify: `npx tsc -b` passes for `api/`. On `:3000`:
   - `GET /api/user` returns `nicknames: []`.
   - PATCH `{ addNickname: 'pao' }` returns `["Pao"]`, and repeating it is a no-op.
   - PATCH `{ displayName: 'Pao' }` drops "Pao" from the other names.
   - Restore the account afterwards.
5. **Client state.** `ProfileContext`: `nicknames`, the chain, `save`, `remember`, `dismissSaveError`.
6. **UI:**
   - the icons;
   - `DirectionLabel`;
   - `CollectionCard` (summary, headings, `YouAre`);
   - `MePicker`, `NeedsSetup`, `ChangeMeDialog`, `FinishSessionDialog` and `CloseSessionButton`;
   - `CollectionPage` and `App`;
   - `SyncBanner`;
   - `ProfileDialog` and `ProfileBanner`.
7. **Full check.** `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and `targets.test.ts`) and
   `npm run build`.
8. **Local preview.** Walk T-N2, T-N5 and T-N6 yourself on `http://localhost:3000`. Then hand over to the
   surgeon-reviewer and the ui-ux-tester, with the branch and the local URL.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| A wrong automatic match is less visible now that recognised cards are quiet, and other names widen what matches: a friend called Pao, in a session without Paolo, places the user as Pao (E1) | Exact matching only. Two hits mean ask. The profile name wins. "Not you? Change" sits in every recognised card (two taps: expand, Change). "Collecting as X" shows in Finish. Payments are keyed by pair, so fixing "me" moves nothing. The ui-ux-tester confirms it's fixable within two taps. |
| New API code runs before the column exists, so `GET /api/user` 500s and Collection shows its load error | Task 1 runs first, behind the owner's OK. |
| Two remembers race, on one device or two, and one name is lost | The row lock serialises the server; the client chain keeps the replies in order (AC-N4.8). |
| A tab on the old bundle saves the name and wipes the other names | A PATCH changes only the fields it names (BR-N13), tested in `applyProfileUpdate`. |
| Saving Profile after a failed load blanks the stored profile (E14) | The dialog shows no Save until the profile is ready (AC-N5.10). |
| The driver sends the array wrongly | The `::text[]` cast, and task 4's checks on `:3000`. |
| Two sticky strips overlap | One stacked container (`.stack`), checked in T-N5. |
| Cards move under the finger when one remember places several sessions (E8) | Accepted; the sections already re-sort on a pick today. |
| Green and amber also mean Paid and Unpaid on the chips | The owner's call (Q3). The arrows and words carry the direction. |

**Size: medium.** About 20 files: one new component, three icons, one column, one route changed, and a context
reworked. **Risk: low to medium.** The schema is additive, no money logic changes, and the main new behaviour,
matching by other names, is pure and fully unit tested.

## 12. Decisions for the user

1. **Applying the schema to Neon `main`.** One nullable column, `users.nicknames`; no existing data changes.
   Approving this spec doesn't run it: the developer asks for your explicit OK at task 1. *Recommendation:* give
   that OK when asked.
2. **Assumptions N-A1 to N-A5** (section 1) stand unless you overrule them. The ones most worth a glance:
   - **N-A2:** a failed remember shows in Collection's pinned alert strip with a Dismiss button. The alternative,
     a line at the top of the page, would be scrolled out of view after Finish lands on the new card.
   - **N-A3:** the strip's amounts stay white, and only the labels are coloured.

Technical choices made here, no input needed:
- A `text[]` column rather than a table, because the names are read and written only as a whole, with the user's
  row.
- `{ addNickname }` as a separate additive PATCH shape, so a remember never replaces the stored list with the
  device's copy (BR-N11).
- The row lock plus a client-side chain, rather than a version column.
- `rememberOffer` moves into `src/lib/collection.ts` so it can be unit tested.
- `DirectionLabel` is the single source of the words, arrows and colours.
