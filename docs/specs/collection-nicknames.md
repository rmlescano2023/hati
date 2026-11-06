# Spec: Collection follow-up — quieter "who you are", nicknames, clearer money labels

Status: **draft, awaiting the owner's approval.** Branch `collection` (unshipped). A follow-up to
`docs/specs/collection.md`; where the two differ, this one wins for the parts it names. **Section 13 (owner
review, round 2) amends sections 1 to 12. Where they differ, section 13 wins.**

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

- **N-A1.** The "Remember" checkbox state is per picker. It starts ticked each time a picker opens, and an untick
  holds until that picker closes. It does not re-tick when the selection changes (BR-N10).
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

## 13. Owner review, round 2

The owner checked the build at `77026ee` and settled these eight refinements in Plan Mode on 2026-11-06 (brief:
`peaceful-coalescing-karp.md`, items 1 to 7; item 8 was added afterwards). The business-analyst was skipped this
round, at the owner's choice. This section changes the code as built at `77026ee`, and it also replaces the
sections and acceptance criteria named below. No schema or API shape changes. The only server change is the limit.

### 13.1 What it replaces

| Earlier text | Now |
|---|---|
| N-A4 (the dialog keeps the title "Your name") | The title is "Profile" (R2-1). |
| `collection.md` AC-2.2 and the chip in its section 6 `ProfileNameField` (the "Use {first name}" suggestion) | Removed (R2-2). |
| BR-N7, E6, AC-N4.6 (limit bullet), AC-N5.6, and every "10" in sections 4 to 6 and 8 | The limit is **3** (R2-3). |
| AC-N1.4, AC-N1.5, AC-N1.6; the "Quiet" rows of the identity-line table in section 6; the "Not you?" variant of `YouAre` | Removed. A recognised card shows no identity line and no Change (R2-4). |
| AC-N1.9 ("…and 'Not you? Change' appears inside it") | The line disappears and nothing replaces it. Removing the name brings the line back, as before. |
| `collection.md` AC-6.6 and its page state "`open: Set<string>` … Several can be open at once" | One card at a time (R2-5). |
| AC-N6.2 and the Settled summary in `collection.md` section 6 | The money line shows only while the card is collapsed (R2-6). |
| AC-N6.3 (the hints in the group headings) and AC-N6.4's screen-reader example for the headings | The headings have no hints (R2-7). The strip keeps its hints, and AC-N6.1 is unchanged. |
| `collection.md` section 6, "Strip" | A "Summary" heading goes above it (R2-8). |
| Section 11, first risk row ("Not you? Change sits in every recognised card") | See 13.5. |

### 13.2 Changes, item by item, with acceptance criteria

**R2-1. The Profile dialog is titled "Profile".** (`src/components/profile/ProfileDialog.tsx`)

- Both `<h2 id="profile-title">` elements change from "Your name" to "Profile": the one in the loading and error
  states, and the one in `ProfileForm`.
- The field keeps its "Your name" label. `ProfileBanner`'s "What should Hati call you?" is unchanged.
- **AC-R2-1.1.**
  - Given the Profile dialog opens from the avatar menu, in any state (loading, error, ready),
  - Then its title reads "Profile",
  - And the dialog's accessible name is "Profile",
  - And the name field's label still reads "Your name".

**R2-2. No "Use {first name}" button.** (`src/components/profile/ProfileNameField.tsx`)

- Delete the `suggestion` constant and the chip block (`{suggestion !== null && … }`).
- Delete the imports this leaves unused: `useUser` from `@clerk/clerk-react`, `Button`, and
  `normaliseProfileName`. `PROFILE_NAME_MAX` stays.
- `@clerk/clerk-react` stays in `package.json`, because the rest of the app uses it.
- The doc comment becomes: "The profile name's field, shared by the dialog and Collection's nudge. It asks for the
  name the group typed into its member lists, which may not be the one the account was signed up with (BR-3)."
- **AC-R2-2.1.**
  - Given the Profile dialog, or the "What should Hati call you?" banner,
  - Then no "Use …" button shows, whatever the account's first name,
  - And the field, its helper text and Save work as before.

**R2-3. At most 3 other names.**

Change these:
- `src/lib/profileName.ts`: `NICKNAMES_MAX = 3`. The doc comment is unchanged.
- `api/user.ts`: the 409 body's error reads `` `You can keep up to ${NICKNAMES_MAX} other names.` ``, so it no
  longer hardcodes 10. Import `NICKNAMES_MAX` from `'../src/lib/profileName.js'`.
- `src/context/ProfileContext.tsx`: the `too_many_names` message reads
  `` `“${name}” wasn't saved: you already have ${NICKNAMES_MAX} other names. Remove one in Profile to make room.` ``,
  with the same import.

These already follow the constant, so they need no change: `parseProfileInput`'s cap, `applyProfileUpdate`'s
`>=` check, `rememberOffer`, and the dialog's Add guard and note ("You can keep up to 3 other names.").

**A stored list longer than 3** (recommendation, not an owner question):
- **It stays readable.** Matching reads every stored name, and nothing trims it, so the change is
  non-destructive.
- **Adds are refused:**
  - The server's add path returns 409, because of the `>=` check.
  - Pickers offer no checkbox, because `rememberOffer` requires `length < NICKNAMES_MAX`.
  - The dialog's "Add a name" is disabled, with the note.
- **A name-only PATCH** (the banner, "Remember as my name", an old tab) keeps the whole list, because
  `cleanNicknames` doesn't cap it.
- **Known gap:** the dialog's Save sends the full list, so `parseProfileInput` refuses more than 3 with a 400. The
  user sees the generic "Couldn't save your profile…" until they remove names down to 3.

I recommend no extra UI or migration for this. Per the brief, the only account that used other names was reset to
`[]`, and nothing in the app can create a longer list after this change. A dedicated message would be handling for
a state that can't occur, which CLAUDE.md rules out.

- **AC-R2-3.1.** Given 3 other names are saved, then in the Profile dialog "Add a name" is disabled with "You can
  keep up to 3 other names.", and no add field shows.
- **AC-R2-3.2.** Given 3 other names and a profile name, when I select an unknown member in any picker, then no
  "Remember “X” as another name for me" checkbox shows. Without a profile name, "Remember as my name" still shows
  (AC-N4.7).
- **AC-R2-3.3.** Given 2 other names, when I add a third, then it's saved and "Add a name" becomes disabled with
  the note.
- **AC-R2-3.4.** A `PATCH /api/user` with 4 `nicknames` is a 400 `Malformed profile.`, and an `addNickname` onto 3
  stored is a 409 `{ error: 'You can keep up to 3 other names.', code: 'too_many_names' }`.
- **AC-R2-3.5.** Given a stored list of more than 3 (a fixture only), then every name in it still matches, a
  name-only update keeps all of them, and an add is refused.

**R2-4. No "Not you? Change".** (`src/components/collection/CollectionCard.tsx`)

- **`YouAre`:**
  - Drop the `quiet` prop and the "Not you?" branch, so it renders only today's line: "You are **X** · Change" or
    "You're not in this session · Change", with `aria-label={`Change who you are in ${title}`}` and
    `ChangeMeDialog`.
  - Its doc comment becomes: "Who the user is in the session, spelled out only for a one-off pick or 'not in this
    session', since Change is the only way to undo those. A card placed by one of the user's own names says
    nothing; a wrong match there is fixed by editing the names in Profile."
- **The card:**
  - Render `{!setup && !quiet && <YouAre card={card} title={title} />}` in today's place, visible collapsed too.
  - Delete the `{quiet && <YouAre … quiet />}` line at the end of the body.
  - The `quiet` comment becomes: "A card placed by one of the user's own names doesn't say who they are (BR-N5)."
- `Me.recognised` and `resolveMe` are unchanged. `ChangeMeDialog` is unchanged and still used.
- **AC-R2-4.1.**
  - Given a card placed by the profile name or another name, or picked as one of them,
  - Then it shows no identity line and no Change control: collapsed, expanded, or as a Settled card with no lines.
- **AC-R2-4.2.**
  - Given a one-off pick or "I'm not in this session",
  - Then the card shows "You are **X** · Change" or "You're not in this session · Change" exactly as before,
    collapsed and expanded,
  - And Change opens "Who are you in this session?" (AC-N1.7, AC-N1.8 unchanged).
- **AC-R2-4.3.**
  - Given a one-off "Carlo" card,
  - When "Carlo" is added in Profile,
  - Then its line disappears with no reload. When it's removed again, the line comes back (AC-N1.9 as amended).

**R2-5. One card open at a time.** (`src/pages/CollectionPage.tsx`)

- **State:**
  - Replace `open: Set<string>` with `const [openId, setOpenId] = useState<string | null>(openSessionId ?? null)`.
  - `expanded={openId === id}`.
  - `onToggle={() => { toggled.current = true; setOpenId((current) => (current === id ? null : id)); }}`.
- **Comment on the state:** "One card at a time: opening one closes the other, so the page never grows into
  several long bodies on a phone (owner, round 2)."
- **Keep the opened card in view.** Closing a long card above the one tapped moves the tapped card up the page, by
  the closed body's height, and possibly out of view. Safari has no scroll anchoring to correct that.
  - Add `const toggled = useRef(false)` and an effect on `[openId]`.
  - If `toggled.current`, reset it. Then, when `openId !== null` and
    `document.getElementById(`collection-${openId}`)?.getBoundingClientRect().top < 0`, call
    `scrollIntoView({ block: 'start' })` on that element.
  - It runs only after a tap, so the landing scroll and re-sorts are left alone.
- **Landing from Finish** already starts with that one card open; its effect is unchanged.
- **Moving between sections:** a card that moves stays the open one, because it's tracked by id. Needs setup cards
  follow the same rule.
- **Failed payment forms:** keyed by session and line as before, so a failed form on a card that was closed in the
  meantime reappears when that card is opened again. Its failure also shows in the pinned strip. A failure never
  reopens its card, which would close the one being used.
- **AC-R2-5.1.** Given card A is expanded, when I expand card B, then A collapses and only B is expanded,
  whichever sections A and B are in.
- **AC-R2-5.2.** Given B is expanded, when I tap B's header, then B collapses and no card is expanded.
- **AC-R2-5.3.** Given I finish a session, when Collection opens, then only that card is expanded (AC-4.9
  otherwise unchanged).
- **AC-R2-5.4.** Given A, expanded, sits above B, at 375px, when I expand B, then B's header is on screen
  afterwards, not scrolled off the top.
- **AC-R2-5.5.** `aria-expanded` is true on the open card's header only.

**R2-6. The money line shows only while collapsed.** (`CollectionCard.tsx`)

- **Outstanding:** `{card.bucket === 'outstanding' && !expanded && <MoneySummary card={card} />}`. "N of M
  settled" stays in both states.
- **Settled:** `summaryDetail(card, expanded)`. The settled branch returns `Settled <date>`, and adds the
  "Received ₱X · Paid ₱Y" part only when `!expanded`. "Nothing to collect…" and the not-in-session case are
  unchanged, and those cards can't expand anyway.
- The expanded body shows the same figures per line, which is why the summary can drop them.
- **AC-R2-6.1.** Given an Outstanding card, when it's collapsed, then the coloured "↓ Owed to you ₱X · ↑ You owe
  ₱Y" line shows; when it's expanded, that line is gone and "N of M settled" stays.
- **AC-R2-6.2.** Given a Settled card with lines, when it's collapsed, then "Settled <date>" and "Received ₱X ·
  Paid ₱Y" show; when it's expanded, only "Settled <date>" does.
- **AC-R2-6.3.** Collapsing brings the line back, unchanged, with the `77026ee` wrapping intact: a side never
  wraps mid-amount, and no dot ends a line.

**R2-7. No hints in the group headings.** (`CollectionCard.tsx`, `DirectionLabel.tsx`, `CollectionPage.tsx`)

- Each heading becomes `<h4 className={styles.groupHeading}><DirectionLabel direction={group.direction} /></h4>`.
  It stays 14px, coloured, with its arrow and in sentence case.
- **`DirectionLabel`:**
  - With `'inline'` now unused, `hint` becomes `hint?: boolean`, documented as "Shows the hint under the label: the
    totals strip only."
  - The class is `hint && styles.stacked`.
  - Its doc comment says the hint appears only in the strip.
- **`CollectionPage`:** the two tiles pass `hint` instead of `hint="stacked"`.
- No CSS changes.
- **AC-R2-7.1.**
  - Given an expanded card,
  - Then its headings read "↓ Owed to you" in green and "↑ You owe" in amber, with no "they pay you" or "you pay
    them",
  - And a screen reader reads "Owed to you" and "You owe".
- **AC-R2-7.2.** The totals strip still shows both hints under their labels (AC-N6.1).

**R2-8. A "Summary" heading above the totals strip.** (`CollectionPage.tsx`)

- Wrap the strip and its "Not counting …" note in `<section>`, opened by
  `<h2 className={homeStyles.heading}>Summary</h2>`.
  - It's the same element and class as "Needs setup (N)", "Outstanding (N)" and "Settled (N)", with no count.
  - `h2` keeps the order: page sections are `h2`, cards `h3` and groups `h4`.
- **Spacing:**
  - The section gets no class. It's the first section, and `styles.section`'s `margin-top: 1.5rem` exists to
    separate a section from the one above.
  - The heading's own `margin: 0 0 0.75rem` puts the same gap between it and the tiles as between the other
    headings and their cards.
  - The gap down to the next section stays the next section's 1.5rem.
  - When `ProfileBanner` shows, it stays above the Summary section, with its own 1.25rem margin.
- The empty state shows no strip, so no Summary heading.
- No new CSS. Both widths use the same class, so 375px and 1280px match the other headings. The heading's
  `--text3` colour is the existing headings' (3.41:1, below AA for small text). It's matched as asked, and not
  changed here.
- **Tour:** none. The page has no `data-tour` target. `nav-collection` is in the tab bar, outside the page
  content, so a heading above the strip can't move or cover it.
- **AC-R2-8.1.**
  - Given Collection with finished sessions,
  - Then a "Summary" heading sits directly above the two tiles, styled and spaced like "Outstanding (N)", with no
    count,
  - And it's an `h2` like the other section headings.
- **AC-R2-8.2.** Given the empty state, then no Summary heading shows.
- **AC-R2-8.3.** At 375px and at 1280px, the strip still sits side by side under the heading, and the tour's
  Collection step still highlights the Collection tab.

### 13.3 Test updates

**Vitest** (written first, watched failing):
- **`src/lib/profileName.test.ts`:**
  - Add `it('keeps at most 3 other names')` asserting `NICKNAMES_MAX` is 3.
  - The existing limit case builds its list from `NICKNAMES_MAX`; rename `ten` to `full`.
  - **New, a stored list of 5 (AC-R2-3.5):**
    - `applyProfileUpdate(five, { addNickname: 'Pao' })` is null.
    - `applyProfileUpdate(five, { displayName: 'Paolo' })` keeps all 5.
    - An add of one of the 5 is unchanged, not null.
- **`src/lib/apiValidation.test.ts`:**
  - `eleven` becomes `Array.from({ length: NICKNAMES_MAX + 1 }, …)` (4 entries) and stays rejected.
  - Add a case where `{ nicknames: ['a', 'b', 'c'] }` is accepted (AC-R2-3.4).
- **`src/lib/collection.test.ts`:**
  - "stops offering another name at ten" becomes "at the limit", built from `NICKNAMES_MAX`.
  - Add a case where a 5-name list still gives null.
  - Add a case where `matchMember` matches a member against the 5th of 5 stored names (AC-R2-3.5).
- **UI items R2-1, R2-2 and R2-4 to R2-8** have no Vitest coverage, because the suite has no component tests. The
  ui-ux-tester and the reviewer check them.
- **Unchanged, and must pass:** `steps.test.ts`, `targets.test.ts`, `apiImports.test.ts` (which now reaches
  `profileName.js` from `api/user.ts`) and the rest.

**Reviewer (surgeon-reviewer):**
- Every changed line traces to R2-1 to R2-8.
- No orphans: `useUser`, `Button` and `normaliseProfileName` in `ProfileNameField`; the `quiet` prop; `'inline'`;
  `Set` in `CollectionPage`, if it's no longer used.
- No "10" is left in limit messages.
- No `data-tour` changes and no new mobile CSS.
- Also review the `77026ee` wrap fixes, which haven't been reviewed yet.

**ui-ux-tester walkthrough:** run at 375px, then 1280px. The section 8 setup applies, with at most 3 other names.

| # | Change | ACs |
|---|---|---|
| T-N1 | **Replaced:**<br>- N1, N4 and N6 show no identity line and no Change, collapsed or expanded (N6 has no toggle).<br>- N5 with a one-off Carlo pick shows "You are **Carlo** · Change", collapsed and expanded, and Change opens the dialog.<br>- A not-in-session card shows its line. | R2-4.1, R2-4.2 |
| T-N3 | **Amended:**<br>- Adding Carlo removes N5's line with no reload, and no "Not you?" appears.<br>- Removing Carlo brings it back.<br>- The rest is unchanged. | R2-4.3, N3.6 |
| T-N6 | **Amended:**<br>- The title reads "Profile".<br>- There's no "Use …" button in the dialog or in the banner (clear the profile name to see the banner).<br>- After a third name, "Add a name" is disabled with "You can keep up to 3 other names.".<br>- 10 names are no longer reachable, so drop the 375×667 scroll check.<br>- The rest is unchanged. | R2-1.1, R2-2.1, R2-3.1, R2-3.3, N5.x |
| T-N7 | **Amended:**<br>- The expanded headings read "↓ Owed to you" and "↑ You owe" with no hints.<br>- The strip keeps its hints.<br>- An expanded Outstanding card shows no money line, but keeps "N of M settled".<br>- An expanded Settled card shows no "Received · Paid".<br>- Collapsed, both show again, and the `77026ee` wrapping holds: ₱1,000,000.00 whole, no dangling dot at 375px. | R2-6.x, R2-7.x, N6.1 |
| T-N4 | **Amended:** with 3 other names saved and a profile name, the Finish picker shows no "Remember “Zed”…" for an unknown member. | R2-3.2 |
| T-N9 | **New, one open card:**<br>- Expand A, then B: A collapses.<br>- Tap B: nothing is open.<br>- Expand a long A, scroll down, then expand B below it: B's header stays on screen.<br>- Finish a session: only its card is open on landing.<br>- Check `aria-expanded` on each header. | R2-5.1 to R2-5.5 |
| T-N10 | **New, Summary heading:**<br>- "SUMMARY", in the same uppercase grey style as "OUTSTANDING (N)", sits above the tiles, with the same gap above the tiles as the Outstanding heading has above its cards.<br>- It's an `h2` in the accessibility tree.<br>- It's absent in the empty state.<br>- With the banner showing, it's below the banner.<br>- Preview Tour: the Collection step highlights the Collection tab. | R2-8.1 to R2-8.3 |
| T-N8 | **Amended:** two quick Confirms for "Pao" and "Paoie", starting from 1 saved name: both end up saved (3 in all). | N4.8 |

### 13.4 Tasks for the fullstack-developer

No schema run is needed this round.

1. **Tests first.** Add the 13.3 Vitest changes.
   → Verify: `npm test` fails on exactly those.
2. **Limit.** Set `NICKNAMES_MAX = 3`, and change the messages in `api/user.ts` and `ProfileContext.tsx` to use the
   constant.
   → Verify: `npm test` passes, and `npx tsc -b` passes.
3. **Profile.** R2-1 (`ProfileDialog` title) and R2-2 (`ProfileNameField` chip and orphaned imports).
4. **Cards.**
   1. R2-4: `YouAre` and the card.
   2. R2-6: `MoneySummary` and `summaryDetail(card, expanded)`.
   3. R2-7: the headings, then `DirectionLabel`'s `hint?: boolean`.
5. **Page.** R2-5 (`openId`, `toggled` and the keep-in-view effect), R2-7 (the tiles pass `hint`) and R2-8 (the
   Summary section).
6. **Full check.** `npm run lint`, `npx tsc -b`, `npm test` (including `steps.test.ts` and `targets.test.ts`) and
   `npm run build`, with the real results reported.
7. **Owner check.** Give the owner `http://localhost:3000` and the branch, then wait for their "go" before handing
   over to the surgeon-reviewer and the ui-ux-tester. Those two also cover the `77026ee` wrap fixes.

### 13.5 Risks, size and a consequence to note

- **A wrong automatic match now has no per-card fix.** The owner's call is that it's fixed in Profile, which
  works:
  - Remove the other name, or change the profile name.
  - The session drops to Needs setup, and the right pick goes in there.
- **One ordering trap.** Say a friend called "Pao" is in a session the user isn't in, and that session was placed
  by the user's other name "Pao":
  1. After removing "Pao", the user should first pick "I'm not in this session" on that session,
  2. and only then re-pick "Pao", with the box ticked, elsewhere.

  Done the other way round, the ticked box re-adds "Pao" before the friend's session has a pick, and that session
  matches again. Picks persist, so the right order fixes it for good.
- **The same trap with the profile name.** A wrong match by the profile name itself, where a namesake is in a
  session the user isn't in, needs a temporary rename. That briefly sends every session matched only by the
  profile name to Needs setup; they come back when the name is restored.
- These are rare, because they need a namesake in a session the user isn't in, but they're the cost of removing
  Change. See 13.6.
- **Other risks:**
  - **The opened card scrolling out of view:** guarded by the keep-in-view effect, and checked in T-N9.
  - **Orphaned code:** covered by the reviewer's checklist.
- **Size: small.** About 10 files, with no schema change, no API shape change and no new dependency. **Risk:
  low.**

### 13.6 Decisions for the owner

There are no blocking questions. To confirm, or to overrule, at approval:

1. **A stored list of more than 3 names** stays readable, is never trimmed, and refuses adds, with no special
   dialog message (13.2, R2-3). *Recommendation:* accept. No such list exists.
2. **No per-card fix for a wrong match** (13.5). It's what you decided. The workaround is the ordering above.
   *Recommendation:* accept as decided. If testers trip over it, the smallest fix would be to bring back Change
   inside the expanded card only.
3. **The "Summary" heading uses the existing section-heading style,** which is uppercase grey at 3.41:1, below AA
   for small text, as are "Outstanding" and "Settled". *Recommendation:* accept for now. Raising `.heading` to
   `--text2` (6.36:1) would fix all of them, but it changes Home and History too, so it's a separate change if
   you want it.

### 13.7 Owner review, round 2 follow-up: items 9 to 11

**Approved on 2026-11-06, from 13.6:**
- Section 13 (`74f7ded`) is approved, and the keep-in-view scroll in R2-5 stays.
- **13.6 point 1 is accepted:** a stored list longer than 3 stays readable, and adds are refused.
- **13.6 point 2 is replaced by item 9:** a nickname-only match is confirmed, not placed silently.
- **13.6 point 3 is replaced by item 11:** the headings are brightened now.

Where 13.7 differs from 13.1 to 13.6, 13.7 wins. No schema or API change is needed.

#### What it replaces

| Earlier text | Now |
|---|---|
| AC-N1.2, AC-N3.1 and AC-N3.4 (a nickname match places the session automatically, with or without a profile name) | A nickname-only match goes to Needs setup with that member preselected (R2-9). |
| AC-N3.5, and `collection.md` AC-4.2 ("Collecting as **X** · Change") | The line is gone. A profile match just finishes, and a nickname-only match preselects in the picker (R2-10). |
| AC-N1.3 ("a pick of a known name is quiet"), AC-N1.9 and AC-R2-4.3 (the line follows the names) | Every stored pick shows its "You are X · Change" line. Only an automatic profile-name match is quiet (R2-9, BR-N5 as re-checked below). |
| AC-R2-4.1 | Amended: "a card placed automatically by the profile name" is quiet; a stored pick is not. |
| AC-N4.2's "every other session … leaves Needs setup on its own", and E8 | After the save, those sessions stay in Needs setup, now with the member preselected. |
| AC-N3.6 | Amended: removing a nickname takes the preselect off its Needs setup cards; confirmed sessions are stored picks, so they stay where they are. |
| E1, E7, and the first three bullets of 13.5 (the ordering trap) | See "Risks" below: a nickname now never places a session without a tap. |
| `HomePage.module.css` `.heading` colour `--text3`, and 13.6 point 3 | `--text2` (R2-11). |

#### BR-N5 re-checked: when the "You are X · Change" line shows

Once a nickname match is confirmed, it's a stored pick. Removing the name in Profile no longer moves it, so Change
on the card is the only way to undo a wrong confirmation. That's the owner's own round 2 reason for keeping the
line on one-off picks. So the rule becomes:

| How "me" was resolved | Line | How a mistake is fixed |
|---|---|---|
| Automatic match on the profile name (no pick stored) | none (quiet) | rename in Profile, as decided in round 2 |
| Any stored pick: a confirmed nickname, a one-off, or a member matching the profile name (for example after two profile hits) | "You are **X** · Change" | Change |
| "I'm not in this session" | "You're not in this session · Change" | Change |

Without this, a confirmed "Pao" card would have no line and no Change. A wrong confirmation could then never be
undone anywhere in the app, and its payments would sit on the wrong lines. This is listed for confirmation in
"Decisions" below.

#### R2-9. A nickname-only match needs confirming

**`src/lib/collection.ts`:**

- **`matchMember`** keeps its rules (profile name first; nicknames only when the profile name matches no member;
  one hit or none). It now says which kind of hit it found:

  ```ts
  /** One member matched by the user's names, and by which: only a profile-name hit places a session. */
  export type Match = { member: string; via: 'profile' | 'nickname' };

  export function matchMember(members: string[], names: KnownNames): Match | null
  ```

  - It returns `{ member, via: 'profile' }` on one profile hit.
  - It returns `{ member, via: 'nickname' }` on no profile hit and one nickname hit.
  - It returns null otherwise.
  - Its doc comment adds: "A nickname hit is only a suggestion, confirmed by the user, because a friend can share
    the nickname (owner, round 2)."
- **`Me`:**

  ```ts
  export type Me =
    | { kind: 'member'; name: string; picked: boolean }
    /** `suggested`: the one member matched by a nickname alone, preselected for the user to confirm. */
    | { kind: 'unknown'; suggested: string | null }
    | { kind: 'notInSession' };
  ```

  `recognised` is removed. Its only reader was the card's `quiet`, which becomes `!picked` (below).
- **`resolveMe`:**
  - The order is unchanged: an explicit pick, then the match, then unknown.
  - A profile match gives `{ kind: 'member', name, picked: false }`.
  - A nickname match gives `{ kind: 'unknown', suggested: member }`.
  - No match gives `{ kind: 'unknown', suggested: null }`.
  - Its doc comment becomes: "BR-N4: an explicit pick, then a profile-name match, then unknown (Needs setup), with
    a nickname match as the suggestion."
- **New:**

  ```ts
  /** The question a Needs setup card or the Finish picker asks about a nickname match. */
  export const nicknamePrompt = (member: string): string => `You go by “${member}” — is that you here?`;
  ```

  It names the member as it appears in the session, which is the radio being confirmed.
- **Unchanged:**
  - `buildCard` and `buildCollection`. A suggested card is `needsSetup`, so it has no lines and stays out of the
    strip's totals.
  - `isKnownName` and `rememberOffer`. A preselected nickname member is already known, so there's no checkbox.
    Choosing another, unknown member shows the checkbox, ticked (N-A1).

**`CollectionCard.tsx`:**

- `const quiet = card.me.kind === 'member' && !card.me.picked;`. The comment becomes: "Only a card placed
  automatically by the profile name says nothing about who the user is; every stored pick keeps its line, since
  Change is the only way to undo one (BR-N5, round 2)."
- `{!setup && !quiet && <YouAre … />}` is otherwise as in R2-4.
- **`NeedsSetup`:**
  - `const suggested = card.me.kind === 'unknown' ? card.me.suggested : null`.
  - The choice state starts at `null`, meaning untouched, and the selection is `const selected = choice ?? suggested`.
    A suggestion that arrives or goes while the card is open (a remember saving, a name removed) is then followed
    until the user taps a radio.
  - The legend is `suggested !== null ? nicknamePrompt(suggested) : 'Which one are you?'`.
  - `MePicker` gets `value={selected}`.
  - The primary button reads "Yes, that's me" while `selected !== null && selected === suggested`, and "Confirm"
    otherwise. It's disabled while `selected === null`.
  - On press, `setMe(card.session.id, selected)` plus the existing remember rule. The pick is stored, so the
    session never asks again.

**Acceptance criteria:**

- **AC-R2-9.1.**
  - Given the profile name is "Paolo", "Pao" is saved, and a finished session has Ana and Pao with no pick,
  - Then its card is in Needs setup, not Outstanding or Settled,
  - And it's not counted in the strip, which says "Not counting 1 session that needs setup",
  - And, expanded, it asks "You go by “Pao” — is that you here?" with Pao preselected and the button "Yes, that's
    me",
  - And no Remember checkbox shows.
- **AC-R2-9.2.**
  - Given AC-R2-9.1,
  - When I press "Yes, that's me",
  - Then the session is placed as Pao (Outstanding or Settled), and `me` is stored as "Pao",
  - And its card shows "You are **Pao** · Change",
  - And it never returns to Needs setup, even if "Pao" is later removed.
- **AC-R2-9.3.**
  - Given AC-R2-9.1,
  - When I select Ana, or "I'm not in this session",
  - Then the button reads "Confirm",
  - And for Ana, an unknown member, "Remember “Ana” as another name for me" shows, ticked,
  - And Confirm stores that choice.
- **AC-R2-9.4.**
  - Given no profile name and "Pao" saved,
  - Then a session with Pao behaves as AC-R2-9.1: it's suggested, never placed automatically.
- **AC-R2-9.5.**
  - Given the profile name matches no member and two members match nicknames (for example Pao and Red), or two
    members match the profile name,
  - Then the card is in Needs setup with nothing preselected and "Which one are you?" (AC-N3.3).
- **AC-R2-9.6.**
  - Given a session with Paolo and Pao,
  - Then it's placed automatically as Paolo, with no line (Q1 unchanged).
- **AC-R2-9.7.**
  - Given Needs setup cards for sessions N2 and N3, both with a "Pao", and no "Pao" saved,
  - When I confirm Pao on N2 with the box ticked and the save succeeds,
  - Then N3 stays in Needs setup, now preselected on Pao with the prompt,
  - And N2 shows "You are **Pao** · Change".
- **AC-R2-9.8.**
  - Given a suggested card,
  - When "Pao" is removed in Profile,
  - Then the card stays in Needs setup, with nothing preselected and "Which one are you?".
  - Confirmed Pao sessions are unchanged.
- **AC-R2-9.9.** Given an automatic profile-name match, the card has no line (AC-R2-4.1 as amended). Given any
  stored pick, including one of the profile-name member, the card shows "You are **X** · Change".

#### R2-10. The Finish dialog has no "Collecting as X · Change" line

**`src/components/summary/FinishSessionDialog.tsx`:**

- **State:**
  - `match = profile.status === 'ready' ? matchMember(members, profile) : null`.
  - `const [value, setValue] = useState<string | null>(null)`, where null means untouched.
  - `const suggested = match?.via === 'nickname' ? match.member : null`.
  - `const selected = value ?? suggested`.
  - `const picking = value !== null || match?.via !== 'profile'`. A choice made stands even if a profile match
    loads afterwards, as today.
- **With `picking` false (a profile match):** no picker and no line. Just the title, the message and the actions.
  Finish calls `onConfirm(null, null)`, so no pick is stored (A1).
- **With `picking` true:** `MePicker` with `value={selected}`, and the legend
  `suggested !== null ? nicknamePrompt(suggested) : 'Which one are you?'`.
  - Finish calls `onConfirm(selected, remember ? rememberOffer(profile, selected) : null)`.
  - With the nickname member left preselected, that stores it as the pick. This counts as the confirmation
    (assumption kept).
  - The Remember checkbox follows `rememberOffer`, as today.
- **Delete:**
  - `pickerOpen` and its `useEffect` (the focus move existed only because Change disappeared);
  - the `useEffect` and `useRef` imports, if they're now unused;
  - the "Collecting as" block and its `Button` import, if unused;
  - `.collecting` and `.collecting strong` in `FinishSessionDialog.module.css`.
- **Doc comment:** "…a profile-name match finishes without asking; otherwise the picker asks, preselecting a
  nickname match, and the choice can be left for later."
- `CloseSessionButton` is unchanged.

**Acceptance criteria:**

- **AC-R2-10.1.**
  - Given the profile name matches exactly one member,
  - When I press Finish Session,
  - Then the dialog shows no "Collecting as" line and no picker,
  - And finishing stores no pick, and the card lands placed and quiet.
- **AC-R2-10.2.**
  - Given no member matches the profile name or a nickname,
  - Then the picker shows "Which one are you?" with nothing preselected, and Remember as today (AC-N4.4,
    AC-N4.7).
- **AC-R2-10.3.**
  - Given the only match is through "Pao",
  - Then the picker asks "You go by “Pao” — is that you here?" with Pao preselected and no checkbox,
  - And Finish stores `me = 'Pao'`, so Collection opens on that card placed, showing "You are **Pao** · Change".
  - Choosing another member or "I'm not in this session" stores that instead.
- **AC-R2-10.4.**
  - Given two nickname hits,
  - Then nothing is preselected.

#### R2-11. Brighter section headings

- **Change:** in `src/pages/HomePage.module.css`, `.heading { color: var(--text2); }`, replacing `var(--text3)`.
  - Size, weight, letter-spacing, uppercase and margins are unchanged.
  - This is an existing token: `--text2` #9ba1ac on the page background `--bg` #14161a measures **6.98:1**, which
    passes AA for small text. `--text3` measured 3.74:1. Nothing is added to `tokens.css`.
- **Every place that uses the class.** All of these change, at every width, on desktop and phone:

  | Screen | Heading | File |
  |---|---|---|
  | Home | "In Progress" | `src/pages/HomePage.tsx:73` |
  | History | "Closed Sessions" | `src/pages/HistoryPage.tsx:45` |
  | Collection | "Summary" (R2-8) | `src/pages/CollectionPage.tsx` |
  | Collection | "Needs setup (N)" | `src/pages/CollectionPage.tsx:212` |
  | Collection | "Outstanding (N)" | `src/pages/CollectionPage.tsx:219` |
  | Collection | "Settled (N)", the heading around the toggle, which inherits the colour | `src/pages/CollectionPage.tsx`, with `styles.settledHeading` and `.settledToggle` |

- **The Settled toggle's hover:** in `CollectionPage.module.css`, `.settledToggle:hover { color: var(--text2); }`
  becomes `var(--text)`, so hover still visibly brightens it.
- **Not changed:** these are different styles, not section headings on Home, History or Collection:
  - the card-internal uppercase labels in `Card.module.css`, `BreakdownGroup`, `NetBalanceCards`, `OwedMatrix`
    and others;
  - `HistoryDetailPage.module.css` `.heading`, which is the session title;
  - the global `.sec-label` in `src/styles/global.css`, which nothing uses. It's pre-existing dead code, noted
    and left in place.
- **Tour:** no `data-tour` attribute is on or around these headings except Home's `session-list` on the list below
  "In Progress". It doesn't move, because only a colour changes.
- **AC-R2-11.1.** At 375px and 1280px, each heading in the table renders in `--text2`, and measures at least
  4.5:1 against the page background.
- **AC-R2-11.2.** Nothing else about Home or History changes: size, spacing, position and the tour's highlights.

#### Tests

**Vitest, `src/lib/collection.test.ts`** (written first, watched failing):

- **`matchMember`:** every existing expectation becomes a `Match`, for example
  `{ member: 'Renmar', via: 'profile' }`. Add:
  - A nickname-only hit is `via: 'nickname'`.
  - With names(null, "Pao") the hit is `via: 'nickname'`.
  - Two nickname hits are null.
- **`resolveMe`:**
  - A profile match is `{ kind: 'member', name, picked: false }`.
  - A nickname match is `{ kind: 'unknown', suggested: 'Pao' }`.
  - No match is `{ kind: 'unknown', suggested: null }`.
  - A stored pick of "Pao" is `{ kind: 'member', name: 'Pao', picked: true }`.
  - Remove every `recognised` expectation.
- **`buildCollection`:**
  - With names("Paolo", "Pao"), the [Ana, Pao] session is in `needsSetup` with `suggested: 'Pao'` and isn't in
    the totals (AC-R2-9.1).
  - With `me: 'Pao'` stored, it's outstanding, and it stays so when "Pao" is removed (AC-R2-9.2).
  - [Paolo, Pao] stays placed as Paolo (AC-R2-9.6).
  - Removing "Pao" turns `suggested` to null (AC-R2-9.8).
  - The AC-N1.9 case ("turns a one-off pick into a recognised one") is deleted.
- **`nicknamePrompt('Pao')`** gives "You go by “Pao” — is that you here?".
- **`rememberOffer`:** unchanged; its known-member cases already cover the preselected nickname.
- **Also unchanged:** `profileName.test.ts`, `apiValidation.test.ts` and `demoData.test.ts`. `steps.test.ts` and
  `targets.test.ts` must pass.

**Reviewer:**
- `recognised` is gone everywhere.
- `pickerOpen` and its effect are gone, with no orphaned imports.
- `.collecting` is removed.
- The only colour change is `.heading` and the toggle's hover.
- No `data-tour` changes.

**ui-ux-tester:** run at 375px and 1280px. These replace or extend the 13.3 rows.

| # | Steps | ACs |
|---|---|---|
| T-N1 | **Amended:**<br>- N1 (Ana, Paolo) is placed with no line.<br>- N4 (Paolo, Pao) is placed as Paolo with no line.<br>- N5 with a Carlo pick shows "You are **Carlo** · Change".<br>- A not-in-session card shows its line. | R2-4.2, R2-9.6, R2-9.9 |
| T-N2 | **Replaced:**<br>1. With no other names, N2 (Ana, Pao) and N3 (Ben, Pao) are in Needs setup with nothing preselected.<br>2. On N2, select Pao: the ticked "Remember “Pao” as another name for me" shows. Confirm.<br>3. N2 shows "You are **Pao** · Change".<br>4. N3 stays in Needs setup, now asking "You go by “Pao” — is that you here?" with Pao preselected, "Yes, that's me", and no checkbox.<br>5. Press "Yes, that's me": N3 is placed and shows its line.<br>6. On a fresh "UI test N7" (Ana, Pao), select Ana: the button reads "Confirm" and the checkbox offers Ana. | R2-9.1 to R2-9.3, R2-9.7, N4.1, N4.10 |
| T-N3 | **Amended:**<br>- Remove "Pao" in Profile: N2 and N3 stay placed, with their lines. A still-unconfirmed Pao card loses its preselect.<br>- Adding or removing Carlo no longer changes N5's line. | R2-9.2, R2-9.8 |
| T-N4 | **Replaced:**<br>- Finish a draft containing "Paolo": no "Collecting as" line and no picker. It lands placed and quiet.<br>- Finish one with Ana and Pao, "Pao" saved: the prompt with Pao preselected and no checkbox. Finish: the card is placed as Pao, with its line.<br>- Finish one with Ana and Zed: "Which one are you?" with nothing preselected; select Zed and the ticked box saves Zed.<br>- With the profile name cleared: "Remember as my name".<br>- Pao and Red both saved, in a draft with both: nothing preselected. | R2-10.1 to R2-10.4, N4.4, N4.7 |
| T-N11 | **New, headings:**<br>- On Home, History and Collection, at 375px and 1280px, every heading in the R2-11 table is the lighter grey. Measure one in DevTools: at least 4.5:1.<br>- The Settled toggle still brightens on hover.<br>- Preview Tour: the Home steps highlight as before. | R2-11.1, R2-11.2 |

#### Tasks

Round 2 isn't built yet, so build 13.4 and 13.7 together, in this order:

1. 13.4 steps 1 and 2 (tests, and the limit), with the 13.7 Vitest changes added to step 1.
   → Verify: `npm test` fails on exactly the new cases before the code, and passes after.
2. **R2-9 logic** in `collection.ts`: `Match`, `matchMember`, `Me` without `recognised`, `resolveMe` and
   `nicknamePrompt`.
   → Verify: `npm test` passes; `npx tsc -b` fails only at the callers.
3. 13.4 step 3 (Profile: R2-1 and R2-2).
4. **Cards:**
   - 13.4 step 4 (R2-4, R2-6 and R2-7), with `quiet` as `!picked`;
   - then `NeedsSetup`: `suggested`, `selected`, the legend and the button label.
5. **Finish:** R2-10 in `FinishSessionDialog.tsx` and its CSS.
6. **Page:** 13.4 step 5 (R2-5, R2-7 and R2-8), then R2-11 in `HomePage.module.css` and `.settledToggle:hover`.
7. 13.4 steps 6 and 7: the full check with real results, then the owner's check at `http://localhost:3000` before
   the reviewer and the tester.

#### Risks and size

- **Mistakes are now fixable everywhere.**
  - A nickname never places a session without a tap.
  - Every confirmed or picked session keeps "You are X · Change".
  - The round-1 risk of a friend called Pao being taken for the user (E1) needs a deliberate "Yes, that's me", so
    the ordering trap in 13.5 no longer applies.
  - What's left is the profile-name case: a namesake in a session the user isn't in is fixed by a temporary rename,
    as decided in round 2.
- **More taps.**
  - Each nickname session needs one confirm, and it stays out of the totals until then.
  - That's the owner's trade for not guessing.
- **Code churn.**
  - `Me` and `matchMember` change shape. `tsc` flags every caller, and Vitest covers the logic.
- **Size: small** (about 6 more files). **Risk: low.**

#### Decisions for the owner

No blocking questions. To confirm, or to overrule, at approval:

1. **The line on stored picks.** A confirmed nickname, and any other stored pick, shows "You are **X** · Change",
   so a wrong confirmation can always be undone. Only an automatic profile-name match is quiet. *Recommendation:*
   accept. Otherwise a mistaken "Yes, that's me" could never be undone.
2. **The button label.** It reads "Yes, that's me" only while the preselected member is still selected, and
   "Confirm" for any other choice, including "I'm not in this session". *Recommendation:* accept.
3. **The Finish dialog uses the same prompt** as Needs setup for a nickname-only match. *Recommendation:* accept,
   for consistency.
