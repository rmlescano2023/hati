# Spec: joined sessions, PR 3 (the invite QR on screen and on the organizer's SOA)

Status: **approved by the owner on 2026-11-20** (see section 12). Branch `joined-sessions-3`, from
`origin/joined-sessions-1` at `232aa81` (PR 1 with the owner's round 2 decisions). PR 3 builds on
PR 1's `InviteMembersDialog`, `useInvites` and `inviteUrl`; once PR 1 merges into `main`, this branch
is rebased onto `main`.

Inputs, all owner-approved and taken as fixed:
- the architect's brief, `docs/specs/joined-sessions-architecture.md`: owner decisions D7 (three
  PRs) and D8 (golden fixtures), and the section "The hand-written QR encoder";
- the requirements, `docs/specs/joined-sessions-requirements.md`: the **PR 3 section** (US-30 to
  US-33, BR-Q1 to BR-Q7, E3-1 to E3-4), AC-3.1's Reset wording, BR-G6 to BR-G9, and the owner's
  answer to Q2 (What's new is bumped with PR 2, not here);
- the PR 1 spec, `docs/specs/joined-sessions.md`, sections 5.3 (`inviteUrl`) and 6.6
  (`InviteMembersDialog`);
- the coordinator's fixed decisions for PR 3: no new dependency; the encoder is hand-written in
  `src/lib/qr.ts` (byte mode, level M, versions 1 to 10, all 8 masks with the penalty rules, format
  and version information); golden matrices are generated once with a reference encoder outside
  the repo and only the data is committed; the on-screen QR sits on a white tile in both themes;
  the organizer's SOA from History detail gets a page-1 block; a failed link fetch still downloads
  the SOA without the block and says so; no QR on a draft's or a participant's SOA; a manual scan
  check; the Reset clause is restored.

## 1. Summary

PR 1 gave the organizer a private invite link, shown as text in **Invite members**. PR 3 turns that
link into a QR code a phone camera can scan, in two places:

- **On screen**, in Invite members: a 200px QR, dark on a white tile whatever the theme, with the
  caption "Scan with a phone camera to join." It follows the link, so a reset changes it (US-30).
- **On the organizer's SOA** exported from History detail for a finished session: a page-1 block
  under the header with the QR on the left and, on the right, "Track what you owe on Hati", "Scan
  with your phone camera, or open:" and the full link in mono. Both the QR and the link are
  clickable in a PDF viewer (US-31). The link is fetched fresh at every export (BR-Q2), minting one
  for an older session (D6).
- **If the link can't be fetched**, the SOA still downloads without the block, and the page says
  "Downloaded without the invite QR, because the link couldn't be loaded. Download again to include
  it." (US-32).
- A draft's SOA (Summary) and a participant's SOA (History detail) never carry the block (US-33).
- The Reset confirmation gets back the clause PR 1 held over: "The current link, and the QR on any
  statement you've already shared, will stop working. …" (AC-3.1).

The encoder is pure TypeScript in `src/lib/qr.ts`, about 300 to 380 lines, with no dependency. Its
tests compare whole matrices bit for bit with a reference encoder's output, generated once outside
the repo (section 8.2). No schema, API or type changes.

**Assumptions** (veto any before approving):

- **A1. The QR sits first in the link area:** QR and caption, then the link text, then Copy link.
  AC-30.1 puts the QR "above Copy link", and BR-O2's parenthetical puts it after Copy link; this
  reading follows AC-30.1 and keeps the link next to its Copy button. See decision 12.1.
- **A2. "Page 1 still fits as it does today" (AC-31.5)** means nothing on page 1 is shrunk, cut or
  reordered, the new block stays whole on page 1, and whatever didn't fit before still flows onto
  the following page as it does today. The block adds about 140pt to page 1, so a page 1 that was
  nearly full can now continue onto a second page. With 20 members page 1 already continues today.
- **A3. The export waits for the link up to the existing 30-second write deadline**
  (`WRITE_TIMEOUT_MS`, through `useInvites().getLink`), while the button reads "Preparing SOA…".
  No connection fails at once; only a request that hangs waits the full 30 seconds. No new timeout
  is added.
- **A4. Hati has one theme today, a dark one** (`color-scheme: dark` in `src/styles/global.css`;
  there's no light theme or `prefers-color-scheme` rule anywhere). "A white tile in both themes" is
  met by literal `#fff` and `#000` colours rather than tokens, so no theme, present or future, can
  change them. `forced-color-adjust: none` keeps Windows high-contrast mode from repainting them.
- **A5. The PDF QR is 96pt square** with its 4-module quiet zone. At version 5 (the realistic
  invite link) that's 2.13pt, or 0.75mm, per module, inside the architect's 85 to 100pt. The link
  under it is DM Mono 8pt in the print palette's accent green, broken every 72 characters.
- **A6. Text is encoded as UTF-8 bytes, without an ECI header.** Invite links are ASCII, so this
  only matters for the tests' one non-ASCII text.
- **A7. The fallback note is a quiet notice, not an error:** `role="status"`, `--warn-text`, under
  the button, and cleared at the next click.

## 2. Layers touched

| Layer | File | Change | Reuse |
|---|---|---|---|
| Types | — | none | — |
| Schema | — | none | — |
| API | — | none. `POST /api/invites {sessionId, reset: false}` is called as PR 1 built it | — |
| Pure logic | `src/lib/qr.ts` **(new)** | the encoder: `encodeQr`, `qrPath`, `QR_BYTE_CAPACITY`, and the test-only exports (section 5) | — |
| Test data | `src/lib/qr.fixtures.ts` **(new, generated)** | `QR_GOLDEN` (14 matrices) and `QR_GOLDEN_PENALTIES`; data only, made once by the script in 8.2 | — |
| PDF | `src/pdf/SoaDocument.tsx` | `SoaProps.inviteUrl?`; a new exported `InviteBlock`, rendered between `DocHeader` and `SettlementSection` only when `inviteUrl` is set | `breakLongWords`, `palette`, `encodeQr`, `qrPath`; react-pdf's `Link`, `Svg`, `Path` (already in `@react-pdf/renderer` 4.6.1) |
| PDF | `src/pdf/styles.ts` | five styles for the block | `palette` |
| PDF | `src/pdf/downloadSoa.ts` | `Args.inviteUrl?`, passed to `SoaDocument` | — |
| UI | `src/components/summary/ExportSoaButton.tsx` (+ css) | `getInviteUrl?` prop; fetches before rendering; the fallback note | `downloadSoa` |
| UI | `src/App.tsx` | `useInvites().getLink` wrapped as `inviteUrlFor`, passed to `HistoryDetailPage` | `useInvites`, `inviteUrl` |
| UI | `src/pages/HistoryDetailPage.tsx` | `inviteUrlFor?` prop; passes `getInviteUrl` to `ExportSoaButton` for the organizer only | `isJoined` |
| UI | `src/components/collection/QrCode.tsx` (+ css) **(new)** | the on-screen QR: inline `<svg>` on a white tile | `encodeQr`, `qrPath` |
| UI | `src/components/collection/InviteMembersDialog.tsx` (+ css) | the QR and caption in the link area; the Reset message's restored clause | `QrCode` |
| Tests | `src/lib/qr.test.ts` **(new)**, `src/components/collection/QrCode.test.ts` **(new)**, `src/pdf/SoaDocument.test.ts`, `src/pdf/pdfTree.testutil.ts`, `src/components/collection/joinedCards.test.ts` | section 8 | `renderToStaticMarkup`, `textCells` |

**Why `App.tsx` and not a hook in `HistoryDetailPage`.** `useInvites` calls Clerk's `useAuth`, which
throws outside `<ClerkProvider>`. `joinedCards.test.ts` renders `HistoryDetailPage` through the
practice providers, without Clerk, and must keep passing. `InviteMembersDialog` gets away with the
hook because it mounts only on a click. `App` always runs under Clerk (it already calls
`useOnboarding`, which uses `useAuth`), and no test renders it. So `App` owns the request and hands
`HistoryDetailPage` a plain function, as it already hands it `onLeft`.

**Not touched:** `api/`, `scripts/db/`, `src/types/index.ts`, `src/hooks/useInvites.ts`,
`src/lib/joinLink.ts`, `SummaryPage`, `SessionsStoreContext`, `src/components/onboarding/`, the
guides and scenes, `whatsNew.ts` (Q2: no announcement for PR 3), `package.json`.

## 3. Data model

None. No schema change, no migration, nothing on Neon `main` changes shape.

One existing write happens more often: exporting the organizer's SOA calls the link route, which
mints `expense_sessions.invite_token` for a finished session that has none (D6, AC-31.3). That's
the same write opening Invite members already does in PR 1.

## 4. API contract

None. The export uses PR 1's `POST /api/invites` link form (PR 1 spec 4.5) unchanged:
`{ sessionId, reset: false }` → `200 { token, participants }`, or 404 for a draft, a deleted
session, another account's session or a participant. Any non-200 answer, a timeout or no connection
reaches the export as "no link" (`getLink` resolves `null`, never rejects).

## 5. Business logic: `src/lib/qr.ts`

Pure and DOM-free (only `TextEncoder`, which Node and every browser have). Never imported by `api/`.
Comments cite ISO/IEC 18004:2015 sections, as segno's code does, so a reader can check each step.

### 5.1 Public API

```ts
/** A QR symbol, row by row from the top, left to right; true is a dark module. No quiet zone. */
export type QrMatrix = boolean[][];

/**
 * Byte-mode capacity at level M for versions 1 to 10, derived from BLOCKS:
 * [14, 26, 42, 62, 84, 106, 122, 152, 180, 213].
 */
export const QR_BYTE_CAPACITY: readonly number[];

/**
 * Encodes `text` as UTF-8 bytes in byte mode at error-correction level M, in the smallest
 * version from 1 to 10 that holds it. `mask` forces a mask pattern (0 to 7); the tests use it to
 * compare every mask with the reference encoder. Without it, the mask with the lowest penalty
 * is chosen (5.6). Throws a RangeError past 213 bytes.
 */
export function encodeQr(text: string, mask?: number): QrMatrix;

/**
 * One SVG path for the dark modules, in module units, shifted by a `quiet`-module border on
 * every side. Each horizontal run of dark modules in a row is one rectangle, so a version 5
 * symbol is a few hundred short subpaths rather than about 700 squares. The caller's viewBox is
 * `0 0 S S` with S = matrix.length + 2 * quiet.
 */
export function qrPath(matrix: QrMatrix, quiet = 4): string;
```

**Exported for `qr.test.ts` only** (each says so in its doc comment):
`GF_EXP`, `GF_LOG`, `rsGenerator`, `rsRemainder`, `formatWord`, `versionWord`, `maskPenalties`.

```ts
/** α^i for i = 0 to 254 in GF(256) with the primitive polynomial x⁸+x⁴+x³+x²+1 (0x11D). */
export const GF_EXP: readonly number[];          // length 255
/** The inverse of GF_EXP for 1 to 255. GF_LOG[0] is unused and 0. */
export const GF_LOG: readonly number[];          // length 256
/** The generator polynomial Π(x − α^i), i = 0 to degree − 1, highest power first; [0] is 1. */
export function rsGenerator(degree: number): number[];
/** The `degree` error-correction codewords of `data`: data(x)·x^degree mod generator. */
export function rsRemainder(data: readonly number[], degree: number): number[];
/** The 15-bit format word, already XORed with 0x5412 (ISO 18004 Table C.1). */
export function formatWord(level: 'L' | 'M' | 'Q' | 'H', mask: number): number;
/** The 18-bit version word for versions 7 and up (Table D.1). */
export function versionWord(version: number): number;
/** [N1, N2, N3, N4] for each mask 0 to 7 of `text`, as scored when choosing (5.6). */
export function maskPenalties(text: string): [number, number, number, number][];
```

**Errors.** Only one: more than 213 bytes is
`new RangeError(`An invite QR holds at most 213 bytes; this text is ${n}.`)`. It can't happen with
Hati's links (5.8), so no caller catches it. A `mask` outside 0 to 7 isn't checked; only tests pass
one.

**Out of scope** (architect): numeric, alphanumeric and Kanji modes, ECI, structured append,
versions above 10, levels other than M (`formatWord` takes a level only so the tests can check all
32 words of the published table).

### 5.2 Tables (ISO/IEC 18004:2015 Table 9 and Annex E, level M)

```ts
/** Per version 1 to 10: [EC codewords per block, group-1 blocks, data codewords each, group-2 blocks, data codewords each]. */
const BLOCKS = [
  [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
] as const;

/** Alignment-pattern centre coordinates, versions 2 to 10 (version 1 has none). */
const ALIGNMENT = [
  [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
] as const;
```

Derived, not stored: size `17 + 4V`; data codewords `D = g1n·g1d + g2n·g2d` (16, 28, 44, 64, 86,
108, 124, 154, 182, 216); count-field bits 8 for V ≤ 9 and 16 for V = 10;
`QR_BYTE_CAPACITY[V−1] = floor((8D − 4 − countBits) / 8)`; remainder bits 7 for V = 2 to 6, else 0
(they come for free, see 5.4).

All of these were checked against segno 1.6.6's own tables while writing this spec.

### 5.3 Data codewords

1. `bytes = new TextEncoder().encode(text)`, `n = bytes.length`.
2. `V` is the first version with `n ≤ QR_BYTE_CAPACITY[V−1]`; none is the RangeError.
3. Bits, most significant first: mode `0100`; `n` in 8 bits (16 at V = 10); each byte in 8 bits.
4. Terminator: `min(4, 8D − length)` zero bits. Then zero bits up to a byte boundary.
5. Pad bytes `0xEC`, `0x11`, alternating, until there are `D` bytes.
6. Split into blocks: group 1's blocks in order, then group 2's. Each block's EC codewords are
   `rsRemainder(block, ec)`.
7. Interleave: for `i` from 0 to the longest block's length − 1, each block's `i`-th data byte if it
   has one; then for `i` from 0 to `ec − 1`, each block's `i`-th EC byte.

**Reed-Solomon.** Multiplication is `a·b = GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255]`, 0 when either is
0. `rsGenerator` starts from `[1]` and multiplies by `(x − α^i)` for `i = 0 … degree − 1`.
`rsRemainder` is long division: copy `data` followed by `degree` zeros; for each data position with
a non-zero leading value `c`, XOR `generator[j]·c` into the next `degree` positions; the last
`degree` values are the result.

### 5.4 Function patterns and placement

Two `size × size` grids: `modules` (all light) and `reserved` (all false). Every function module is
set in `modules` and marked in `reserved`.

- **Finders** at (0, 0), (0, size − 7) and (size − 7, 0) as (row, col) of the top-left corner: a
  module at offset (r, c), 0 ≤ r, c ≤ 6, is dark unless `max(|r − 3|, |c − 3|) === 2`. Each finder's
  one-module **separator** ring outside it, inside the symbol, is light and reserved (so each corner
  reserves 8×8).
- **Timing:** for `i` from 8 to size − 9, (6, i) and (i, 6) are dark when `i` is even.
- **Alignment** (V ≥ 2): for every (r, c) pair from `ALIGNMENT[V−2]` × itself except
  (6, 6), (6, last) and (last, 6): the 5×5 square centred there, dark unless
  `max(|dr|, |dc|) === 1`.
- **Format areas**, reserved and left **light** for now: (8, 0..8) and (0..8, 8) skipping the
  timing modules (8, 6) and (6, 8); (8, size − 8 .. size − 1); (size − 8 .. size − 1, 8). This
  includes the dark module's place, (size − 8, 8), which stays light until 5.7.
- **Version areas** (V ≥ 7), reserved and light: rows 0 to 5 × cols size − 11 to size − 9, and rows
  size − 11 to size − 9 × cols 0 to 5.

**Zigzag placement** (ISO 7.7.3), the final codewords' bits most significant first:

```ts
let i = 0;
for (let right = size - 1; right >= 1; right -= 2) {
  if (right === 6) right = 5; // skip the vertical timing column
  for (let vert = 0; vert < size; vert++) {
    for (let j = 0; j < 2; j++) {
      const x = right - j;
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      if (!reserved[y][x] && i < bits.length) modules[y][x] = bits[i++];
    }
  }
}
```

Modules left over are the remainder bits, and stay light.

### 5.5 Masks (ISO Table 10; i = row, j = column)

| Mask | Dark is flipped where |
|---|---|
| 0 | (i + j) % 2 === 0 |
| 1 | i % 2 === 0 |
| 2 | j % 3 === 0 |
| 3 | (i + j) % 3 === 0 |
| 4 | (floor(i / 2) + floor(j / 3)) % 2 === 0 |
| 5 | (i·j) % 2 + (i·j) % 3 === 0 |
| 6 | ((i·j) % 2 + (i·j) % 3) % 2 === 0 |
| 7 | ((i + j) % 2 + (i·j) % 3) % 2 === 0 |

A mask flips only modules that aren't `reserved`.

### 5.6 Choosing the mask (ISO 7.8.3)

Without `mask`, each of the 8 masked candidates is scored **before** the format word, the dark
module and the version word are drawn, so those areas count as light. This is ISO/IEC
18004:2015's order ("format and version information are not added before evaluation") and the
reference encoder's. The lowest total wins; a tie goes to the lower mask number.

- **N1:** in every row and every column, each maximal run of 5 or more modules of one colour adds
  `run − 2`.
- **N2:** each 2×2 square of one colour adds 3. Squares overlap: a 3×3 block of one colour is 4.
- **N3:** in every row and every column, as a sequence `s` of length `n`, with the pattern
  `P = [dark, light, dark, dark, dark, light, dark]`:

  ```text
  idx = first index ≥ 0 where s matches P
  while idx is found:
    after = idx + 7
    if s[max(idx − 4, 0) .. idx) is all light, or s[after .. min(after + 4, n)) is all light:
      add 40, and search again from after
    else:
      search again from idx + 4
  ```

  An empty range counts as all light, so a pattern touching the symbol's edge is counted (the
  quiet zone is light). The search positions are part of the rule: they decide whether
  overlapping finds count, and must match exactly.
- **N4:** `10 × floor(|100·dark − 50·total| / (5·total))` in integers, `total = size²`. (An odd size
  means the percentage never lands exactly on a multiple of 5.)

`maskPenalties(text)` returns these four numbers per mask from the same code path `encodeQr` uses.

### 5.7 Format and version information (ISO 7.9, 7.10)

- `formatWord(level, mask)`: `data = (levelBits << 3) | mask` with L = 0b01, M = 0b00, Q = 0b11,
  H = 0b10. `rem = data << 10`; for bit `i` from 14 down to 10, if set, `rem ^= 0x537 << (i − 10)`.
  The word is `((data << 10) | rem) ^ 0x5412`.
- `versionWord(v)`: `rem = v << 12`; for bit `i` from 17 down to 12, if set,
  `rem ^= 0x1F25 << (i − 12)`. The word is `(v << 12) | rem`.

Drawn after the mask is chosen, with bit 0 the least significant:

- **Copy 1:** bits 0 to 5 at (i, 8); bit 6 at (7, 8); bit 7 at (8, 8); bit 8 at (8, 7); bits 9 to
  14 at (8, 14 − i).
- **Copy 2:** bits 0 to 7 at (8, size − 1 − i); bits 8 to 14 at (size − 15 + i, 8).
- **The dark module** (size − 8, 8), that is (4V + 9, 8), is dark.
- **Version** (V ≥ 7): bit `i`, 0 to 17, at (floor(i / 3), size − 11 + i % 3) and at
  (size − 11 + i % 3, floor(i / 3)).

### 5.8 `qrPath`

For each row `y`, for each maximal run of dark modules from column `x0` to `x1` (exclusive), append
`` `M${x0 + quiet} ${y + quiet}h${x1 - x0}v1h-${x1 - x0}z` ``, rows top to bottom, runs left to
right, with no separators. For `[[true, true, false], [false, true, true]]`:
`qrPath(m, 0)` is `M0 0h2v1h-2zM1 1h2v1h-2z` and `qrPath(m)` is `M4 4h2v1h-2zM5 5h2v1h-2z`. The
subpaths never overlap, so the default non-zero fill draws exactly the dark modules. Both the
browser and react-pdf's path parser (pdfkit, SVGO-based) accept the relative `h`, `v` and `z`.

**Why 213 bytes can't be reached.** An invite link is `origin + '/?join=' + 22`. On any
`*.vercel.app` host the origin is at most `https://` + 63 + `.vercel.app`, 82 characters, so the
link is at most 111 bytes (version 7). Locally it's 50 (`http://localhost:3000`). A realistic
uat link is about 69 (version 5).

## 6. UI

### 6.1 `QrCode` (`src/components/collection/QrCode.tsx`, new)

```tsx
type Props = {
  /** Exactly what the code encodes (BR-Q1). */
  text: string;
  /** Read out in place of the picture, as `aria-label`. */
  label: string;
};
```

- `const matrix = useMemo(() => encodeQr(text), [text]);` and `size = matrix.length + 8`.
- Renders one element:
  `<svg className={styles.qr} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges"><path d={qrPath(matrix)} fill="#000" /></svg>`.
  The quiet zone is inside the viewBox, so the tile's white is the code's own border.

`QrCode.module.css`:

```css
/* Always dark modules on white with the 4-module quiet zone, whatever the theme (BR-Q3): an
   inverted code doesn't scan reliably. The colours are literals, not tokens, on purpose, so no
   theme can ever change them, and forced-colours mode leaves them alone. */
.qr {
  display: block;
  width: 200px;
  height: 200px;
  background: #fff;
  border-radius: var(--radius-sm);
  forced-color-adjust: none;
}
```

### 6.2 `InviteMembersDialog`

Inside the existing `{link !== null && !loading && (<>…</>)}` fragment, **before** the
`<p ref={linkEl} className={styles.link}>` (A1):

```tsx
<figure className={styles.qrFigure}>
  <QrCode text={link} label={`QR code for the invite link to ${title}`} />
  <figcaption className={styles.qrCaption}>Scan with a phone camera to join.</figcaption>
</figure>
```

So the order is: intro, QR, caption, link text, Copy link, the copy error (when shown), then
"Tracking on Hati" as today. While loading or after a failed fetch there's no QR, exactly as there's
no link. A reset replaces `link`, so the QR follows it (AC-30.3) and is never kept past a reset
(BR-Q2).

**The Reset message** (AC-3.1), replacing the `ConfirmDialog`'s `message`:
"The current link, and the QR on any statement you've already shared, will stop working. Members
who already joined keep tracking. You'll get a new link to share."

`InviteMembersDialog.module.css`, added after `.link`:

```css
/* The QR and its caption, centred above the link they encode. */
.qrFigure {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}

.qrCaption {
  font-size: 12px;
  color: var(--text2);
  text-align: center;
}
```

### 6.3 The organizer's export

**`App.tsx`:**

```tsx
const { getLink } = useInvites();
// The SOA's invite link, fetched fresh at each export so it's never one a reset has replaced
// (BR-Q2). It lives here rather than in History detail because the request needs Clerk, which
// App always runs under.
const inviteUrlFor = useCallback(async (sessionId: string) => {
  const link = await getLink(sessionId, false);
  return link ? inviteUrl(window.location.origin, link.token) : null;
}, [getLink]);
```

and `inviteUrlFor={inviteUrlFor}` on the existing `<HistoryDetailPage …/>`. `inviteUrl` joins the
existing import from `./lib/joinLink`.

**`HistoryDetailPage.tsx`:** a new optional prop

```ts
/** The organizer's invite link for a session, or null when it can't be had. Absent in tests. */
inviteUrlFor?: (sessionId: string) => Promise<string | null>;
```

and on the existing `<ExportSoaButton layout="inline" …/>`:

```tsx
getInviteUrl={joined || !inviteUrlFor ? undefined : () => inviteUrlFor(session.id)}
```

A participant gets no fetch and no block (AC-33.2, BR-Q6). `SummaryPage` passes nothing, so a draft
never gets one (AC-33.1, BR-J1).

**`ExportSoaButton.tsx`:** a new optional prop

```ts
/**
 * Only the organizer's export of a finished session passes this (BR-Q4). It's asked for the
 * invite link at each export; null means the SOA goes out without the invite block, and says so.
 */
getInviteUrl?: () => Promise<string | null>;
```

State gains `note` (string, `''`). `handleClick` becomes:

```ts
setBusy(true);
setError('');
setNote('');
try {
  const inviteUrl = getInviteUrl ? await getInviteUrl() : null;
  await downloadSoa({ members, records, fileNameSuffix, name, inviteUrl: inviteUrl ?? undefined });
  if (getInviteUrl && inviteUrl === null) {
    setNote("Downloaded without the invite QR, because the link couldn't be loaded. Download again to include it.");
  }
} catch (err) { …unchanged… } finally { setBusy(false); }
```

`getInviteUrl` never rejects (`getLink` resolves `null` on every failure), so the statement always
downloads when only the link failed (BR-Q5). A PDF failure still shows today's error, and no note.
The next click clears the note; a successful fetch then includes the block (AC-32.2). "Download
again" is the same button, which stays enabled.

The note renders in both layouts, after the button and before the error:
`{note && <p role="status" className={styles.note}>{note}</p>}`.

`ExportSoaButton.module.css`:

```css
/* The export went out without the invite block: a heads-up, not an error. */
.note {
  font-size: 12px;
  line-height: 1.4;
  color: var(--warn-text);
  text-align: center;
  overflow-wrap: anywhere;
}

/* Beside History detail's title it keeps to the button's width, so it can't widen the header. */
.inline > .note {
  width: var(--footer-action-width);
  text-align: left;
}

@media (max-width: 640px) {
  /* The buttons are full width on a phone (HistoryDetailPage's .actions), so the note is too. */
  .inline > .note {
    width: 100%;
  }
}
```

### 6.4 The SOA block (`src/pdf/`)

**`SoaDocument.tsx`:**

```ts
export type SoaProps = {
  members: string[];
  records: PurchaseRecord[];
  name: string | null;
  /** The organizer's invite link, on a finished session's export from History only (BR-Q4). */
  inviteUrl?: string;
};
```

Page 1 becomes `DocHeader`, then `{inviteUrl !== undefined && <InviteBlock url={inviteUrl} />}`,
then `SettlementSection`, `NetBalancesSection` and `Footer` as today. Page 2 is unchanged.

```tsx
/** Side of the printed QR in points, quiet zone included (A5). */
const INVITE_QR_PT = 96;
/** DM Mono 8pt is 4.8pt a character, so 72 fit well inside the text column beside the QR. */
const INVITE_URL_LINE_CHARS = 72;

/**
 * Page 1's invite block: the QR on the left, and how to use it beside it (AC-31.1). Both the QR
 * and the printed link are links, so a tap in a PDF viewer opens the invite (AC-31.2).
 */
export function InviteBlock({ url }: { url: string }) {
  const matrix = encodeQr(url);
  const units = matrix.length + 8;
  return (
    <View style={styles.invite} wrap={false}>
      <Link src={url}>
        <Svg width={INVITE_QR_PT} height={INVITE_QR_PT} viewBox={`0 0 ${units} ${units}`}>
          <Path d={qrPath(matrix)} fill="#000000" />
        </Svg>
      </Link>
      <View style={styles.inviteText}>
        <Text style={styles.inviteTitle}>Track what you owe on Hati</Text>
        <Text style={styles.inviteSub}>Scan with your phone camera, or open:</Text>
        <Link src={url}>
          {/* Hyphenation is off and a link has no spaces, so it's cut by hand to stay in the column. */}
          <Text style={styles.inviteUrl}>{breakLongWords(url, INVITE_URL_LINE_CHARS)}</Text>
        </Link>
      </View>
    </View>
  );
}
```

`Link`, `Svg` and `Path` join the existing `@react-pdf/renderer` import; `encodeQr` and `qrPath`
come from `../lib/qr`; `breakLongWords` is already imported. In react-pdf 4.6.1 a `Link` is a box
annotation over whatever it wraps (`setLink` in `@react-pdf/render`), so wrapping the `Svg` makes
the whole code clickable.

**`styles.ts`**, a new `/* invite */` group after the header group:

```ts
invite: {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: 6,
  padding: 12,
  marginBottom: 20,
  backgroundColor: palette.white, // the QR's quiet zone must stay white
},
inviteText: { flexDirection: 'column', marginLeft: 16, flexShrink: 1 },
inviteTitle: { fontSize: 11, fontWeight: 700, color: palette.text },
inviteSub: { fontSize: 9, color: palette.text2, marginTop: 3 },
inviteUrl: { fontFamily: 'DM Mono', fontSize: 8, color: palette.accent, marginTop: 6 },
```

Width check: 515pt usable − 2 × 13 (border and padding) − 96 − 16 = 377pt for the text column;
72 × 4.8 = 346pt. A realistic 69-character link is one line; the longest possible 111 is two.

**`downloadSoa.ts`:** `Args` gains `inviteUrl?: string` (doc: "The organizer's invite link; only
History passes it, for a finished session.") and `createElement(SoaDocument, { members, records,
name, inviteUrl })`.

### 6.5 Phone and desktop

| Where | Desktop | Phone (≤ 640px) |
|---|---|---|
| Invite members | the 200px tile centred above the link, caption under it; dialog `min(26rem, 100vw − 2rem)` as today | the same 200px tile: the dialog's content is about 297px wide at 375px (242px at 320px), so no phone rule is needed; the dialog already scrolls when taller than the screen (UA `dialog:modal` overflow) |
| History detail | the note under "↓ Download SOA", 12rem wide, left-aligned, in the right-hand actions column | the note full width under the full-width button, inside `@media (max-width: 640px)` |
| Summary | unchanged | unchanged |
| PDF | the same on every device | — |

Desktop is otherwise unchanged. Dark mode is the app's only mode today (A4); the tile is white and
the modules black in it, and would be in any future theme.

## 7. Onboarding tour impact

None.

- No new `data-tour` attribute: `QrCode`, the QR figure, the note and the PDF block carry none
  (BR-G7).
- No existing target moves, is renamed or is duplicated (BR-G8). `InviteMembersDialog`,
  `ExportSoaButton` and `HistoryDetailPage` hold no target today and still hold none.
  `CloseSessionButton`'s `finish-session` target on Summary isn't touched.
- Tour and guide steps and copy are unchanged (BR-G6), and every step still targets an element on
  the screen the reader is on. Practice scenes never open Invite members (AC-1.9) or History
  detail, and the memory backend sends no request, so nothing new appears in a guide (BR-G9).
- `steps.test.ts`, `targets.test.ts` and `guides/guides.test.ts` pass unchanged. The existing "adds
  no data-tour to the new files" check gains `QrCode.tsx` (8.1).

## 8. Test plan

Static tests only (CLAUDE.md): no jsdom, no testing-library.

### 8.1 Vitest

**`src/lib/qr.test.ts` (new):**

1. **GF(256) tables.** `GF_EXP.slice(0, 10)` is `[1, 2, 4, 8, 16, 32, 64, 128, 29, 58]`;
   `GF_EXP[254]` is 142; `GF_EXP` holds each of 1 to 255 exactly once; `GF_LOG[GF_EXP[i]] === i`
   for every `i`.
2. **Generator polynomials** against ISO 18004 Annex A, as exponents of α
   (`rsGenerator(n).map((c) => GF_LOG[c])`), for every degree versions 1 to 10 use at M:
   - 10: `0, 251, 67, 46, 61, 118, 70, 64, 94, 32, 45`
   - 16: `0, 120, 104, 107, 109, 102, 161, 76, 3, 91, 191, 147, 169, 182, 194, 225, 120`
   - 18: `0, 215, 234, 158, 94, 184, 97, 118, 170, 79, 187, 152, 148, 252, 179, 5, 98, 96, 153`
   - 22: `0, 210, 171, 247, 242, 93, 230, 14, 109, 221, 53, 200, 74, 8, 172, 98, 80, 219, 134, 160, 105, 165, 231`
   - 24: `0, 229, 121, 135, 48, 211, 117, 251, 126, 159, 180, 169, 152, 192, 226, 228, 218, 111, 0, 117, 232, 87, 96, 227, 21`
   - 26: `0, 173, 125, 158, 2, 103, 182, 118, 17, 145, 201, 111, 28, 165, 53, 161, 21, 245, 142, 13, 102, 48, 227, 153, 145, 218, 70`
3. **Reed-Solomon.** The well-known 1-M example's data
   `[32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]` gives
   `rsRemainder(…, 10)` = `[196, 35, 39, 119, 235, 215, 231, 226, 93, 23]`.
4. **All 32 format words** against Table C.1 (`formatWord(level, mask)` for masks 0 to 7):
   - L: `0x77C4, 0x72F3, 0x7DAA, 0x789D, 0x662F, 0x6318, 0x6C41, 0x6976`
   - M: `0x5412, 0x5125, 0x5E7C, 0x5B4B, 0x45F9, 0x40CE, 0x4F97, 0x4AA0`
   - Q: `0x355F, 0x3068, 0x3F31, 0x3A06, 0x24B4, 0x2183, 0x2EDA, 0x2BED`
   - H: `0x1689, 0x13BE, 0x1CE7, 0x19D0, 0x0762, 0x0255, 0x0D0C, 0x083B`
5. **Version words:** `versionWord(7..10)` = `0x07C94, 0x085BC, 0x09A99, 0x0A4D3`.
6. **Capacity.** `QR_BYTE_CAPACITY` is `[14, 26, 42, 62, 84, 106, 122, 152, 180, 213]`.
   `'a'.repeat(84)` is 37×37 (version 5), `'a'.repeat(85)` is 41×41 (version 6), 213 is 57×57,
   and 214 throws a RangeError. A multi-byte character counts as its UTF-8 bytes:
   `'₱'.repeat(28)` (84 bytes) is version 5, `'₱'.repeat(29)` (87) is version 6.
7. **Structural invariants**, for every byte length 1 to 213 (`'a'.repeat(n)`) and every golden
   text: the size is `17 + 4V` for the smallest `V` whose capacity holds it; the three finders
   (dark unless Chebyshev distance 2 from the centre) and their light separators; timing modules
   alternating, dark at even indices, along row 6 and column 6 from 8 to size − 9; the dark module
   at (4V + 9, 8); every alignment pattern of Annex E (the centres in 5.2, written out again in the
   test rather than imported) except the three finder corners (dark centre, light ring, dark
   ring); both copies of the format word read back from the positions in
   5.7 are equal and are `formatWord('M', k)` for some `k`; for V ≥ 7 both version blocks read back
   `versionWord(V)`.
8. **Golden matrices.** For each `QR_GOLDEN` entry,
   `encodeQr(text, auto ? undefined : mask)`, as rows of `'0'`/`'1'`, equals `rows`. This covers
   every mask (the 84-byte text at masks 0 to 7), versions 1, 4, 5, 6, 7 and 10, two block sizes,
   the 16-bit count, version information, a UTF-8 text and the reference encoder's own mask choice
   for six texts.
9. **Penalties.** `maskPenalties(QR_GOLDEN_PENALTIES.text)` equals `QR_GOLDEN_PENALTIES.scores`
   (for the record, segno 1.6.6 gives
   `[373,474,840,0] [486,633,800,0] [392,456,760,0] [418,441,800,0] [509,630,960,0] [434,594,880,0] [433,492,960,0] [415,534,800,0]`,
   so mask 2 wins at 1608). If 8 fails, 9 says which rule differs.
10. **`qrPath`.** The two exact strings in 5.8. And for every golden entry, reading the path back
    (`/M(\d+) (\d+)h(\d+)v1h-\d+z/g`, minus the quiet zone) reproduces the matrix's dark modules
    exactly, with no run touching another in the same row.

**`src/pdf/pdfTree.testutil.ts`:** one helper:

```ts
/** Every element of a react-pdf primitive (`Link`, `Svg`, `Path`) in the tree. Components aren't expanded. */
export function elementsOf(node: ReactNode, type: string, out: ReactElement<Record<string, unknown>>[] = []);
```

It recurses through arrays and `props.children` exactly as `textCells` does.

**`src/pdf/SoaDocument.test.ts`**, a new `describe('the invite block (US-31, US-33)')`:

- `SoaDocument({ members, records: [], name: null, inviteUrl })`: page 1's
  `Children.toArray(children)` has an element of type `InviteBlock` with `props.url === inviteUrl`,
  directly after `DocHeader` and before `SettlementSection` (AC-31.1).
- The same without `inviteUrl`: no `InviteBlock` element on either page (AC-33.1, AC-33.2).
  Page 2's children are the same with and without it (AC-31.5's "rest is unchanged").
- `InviteBlock({ url })` for the 84-byte golden text:
  - exactly two `Link`s, both with `src === url` (AC-31.2, BR-Q1);
  - one `Svg`, 96 by 96, `viewBox` `0 0 45 45`, holding one `Path` whose `d` is
    `qrPath(encodeQr(url))`;
  - `textCells` include "Track what you owe on Hati" and "Scan with your phone camera, or open:";
  - its one DM Mono cell, with `\n` removed, is `url`, and each of its lines is at most 72
    characters.
- `InviteBlock` for a 111-byte link (the longest a `*.vercel.app` host can make) breaks it into two
  lines of at most 72.

**`src/components/collection/QrCode.test.ts` (new)**, through `renderToStaticMarkup(createElement(QrCode, …))`:

- the markup has `role="img"`, `aria-label="QR code for the invite link to Bali Trip"`,
  `viewBox="0 0 45 45"` for the 84-byte text, `shape-rendering="crispEdges"`, `fill="#000"` and
  `d="${qrPath(encodeQr(text))}"` (AC-30.1, BR-Q1);
- `QrCode.module.css`, read as text, has `background: #fff`, `forced-color-adjust: none` and no
  `var(--` in the `.qr` rule's colours, and no `prefers-color-scheme` (AC-30.2, BR-Q3).

**`src/components/collection/joinedCards.test.ts`:**

- "adds no data-tour to the new files" gains `'./QrCode.tsx'` (BR-G7).
- New: `InviteMembersDialog.tsx`, read as text, contains the full restored Reset message from 6.2
  (AC-3.1), and contains `<QrCode` before `ref={linkEl}` (A1).
- The two existing `HistoryDetailPage` renders pass unchanged, which proves the page still renders
  without Clerk.

**Run after building:** `steps.test.ts`, `targets.test.ts`, `guides/guides.test.ts` (unchanged),
then `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, with the real results reported.

### 8.2 Producing the golden fixtures (owner decision D8)

Run **once, on the developer's machine, outside the repo's toolchain.** Nothing goes into
`package.json`; only `src/lib/qr.fixtures.ts` is committed. The script below isn't committed: this
spec is its record. Reference encoder: **segno 1.6.6** (pure Python, ISO/IEC 18004:2015), run with
Python 3.14 when this spec was written. segno was chosen over the `qrcode` package because it lets
the mask be forced and turns off its error-level boost, and its penalty code follows the standard
step by step.

```sh
python3 -m venv /tmp/hati-qrref
/tmp/hati-qrref/bin/pip install segno==1.6.6
# save the script below as /tmp/hati-qr-golden.py, then, from the repo root:
/tmp/hati-qrref/bin/python /tmp/hati-qr-golden.py > src/lib/qr.fixtures.ts
npx prettier --write src/lib/qr.fixtures.ts
```

```python
"""Writes src/lib/qr.fixtures.ts, the reference data for src/lib/qr.test.ts."""
import json
import segno
from segno import consts
from segno import encoder as E

TOKEN = 'Zx9_Qk-3VbT0aLmN4pRsWw'


def invite(host):
    return f'https://{host}/?join={TOKEN}'


def sized(n):
    """An invite link of exactly n bytes: the host's first label is padded."""
    base = invite('.example.app')
    return invite('h' * (n - len(base)) + '.example.app')


TEXTS = [
    '₱ Hati',                           # 8 bytes in UTF-8: version 1
    f'http://localhost:3000/?join={TOKEN}',  # 50 bytes: version 4, two blocks
    sized(84),                               # the most version 5 holds
    sized(85),                               # the least that needs version 6
    sized(122),                              # the most version 7 holds: version information
    sized(213),                              # the most version 10 holds: 16-bit count, two block sizes
]
ALL_MASKS = sized(84)


def make(text, mask=None):
    qr = segno.make_qr(text.encode('utf-8'), error='m', mode='byte', mask=mask, boost_error=False)
    assert qr.error == 'M' and qr.mode == 'byte' and 1 <= qr.version <= 10
    return qr


def entry(text, mask):
    qr = make(text, mask)
    return {
        'text': text,
        'version': qr.version,
        'mask': qr.mask,
        'auto': mask is None,
        'rows': [''.join('1' if bit else '0' for bit in row) for row in qr.matrix],
    }


def penalties(text):
    """segno's own N1 to N4 for each mask, scored before format and version information are drawn."""
    data = text.encode('utf-8')
    ver = make(text).version
    m_level = consts.ERROR_LEVEL_M
    buff = E.Buffer()
    for segment in E.prepare_data(data, consts.MODE_BYTE, None):
        E.write_segment(buff, segment, None, E.version_range(ver), False)
    cap = consts.SYMBOL_CAPACITY[ver][m_level]
    E.write_terminator(buff, cap, None, len(buff))
    E.write_padding_bits(buff, ver, len(buff))
    E.write_pad_codewords(buff, ver, cap, len(buff))
    buff = E.make_final_message(ver, m_level, buff)
    width = E.calc_matrix_size(ver)
    matrix = E.make_matrix(width, width)
    E.add_finder_patterns(matrix, width, width)
    E.add_alignment_patterns(matrix, width, width)
    E.add_codewords(matrix, buff, ver)
    functions = E.make_matrix(width, width)
    E.add_finder_patterns(functions, width, width)
    E.add_alignment_patterns(functions, width, width)
    functions[-8][8] = 0x1
    scores = []
    for fn in E.get_data_mask_functions(False):
        masked = [bytearray(row) for row in matrix]
        E.apply_mask(masked, fn, width, width, lambda i, j: functions[i][j] > 0x1)
        scores.append(list(E.mask_scores(masked, width, width)))
    # The scores must pick the mask segno itself picked.
    totals = [sum(s) for s in scores]
    assert totals.index(min(totals)) == make(text).mask
    return scores


entries = [entry(t, None) for t in TEXTS] + [entry(ALL_MASKS, m) for m in range(8)]
scores = {'text': ALL_MASKS, 'scores': penalties(ALL_MASKS)}

print('// Generated once with segno ' + segno.__version__ + ' by the script in')
print('// docs/specs/joined-sessions-3.md (section 8.2). Regenerate rather than edit by hand.')
print('// Each row is one row of modules, left to right; 1 is dark. There is no quiet zone.')
print()
print('export type QrGolden = {')
print('  text: string;')
print('  version: number;')
print('  mask: number;')
print('  /** True when the reference encoder chose the mask itself. */')
print('  auto: boolean;')
print('  rows: string[];')
print('};')
print()
print('export const QR_GOLDEN: QrGolden[] = ' + json.dumps(entries, ensure_ascii=False, indent=2) + ';')
print()
print('/** The reference encoder\'s N1 to N4 penalties for each mask, 0 to 7, of one text. */')
print('export const QR_GOLDEN_PENALTIES: { text: string; scores: number[][] } = '
      + json.dumps(scores, ensure_ascii=False) + ';')
```

**What to expect** (from a dry run in `/tmp` while writing this spec): about 30KB; 14 entries; the
six auto entries are versions 1, 4, 5, 6, 7 and 10 with masks 4, 6, 2, 2, 6 and 1. A port of 5.6's
rules reproduced segno's choice for all six texts and its exact totals for the 84-byte text. If
the developer's run differs from these numbers, stop and report: the segno version or the script
has changed.

### 8.3 Acceptance criteria

| Criterion | Verified by |
|---|---|
| AC-30.1 QR above Copy link, about 200px, caption, alt text | `QrCode.test.ts` (alt text, encoding); `joinedCards.test.ts` (order); tester (size, caption) |
| AC-30.2 dark on white in every theme | `QrCode.test.ts` (CSS); tester (screenshot in the app's dark mode) |
| AC-30.3 the QR changes with a reset | tester |
| AC-30.4 scans from the screen | manual: owner and tester, iPhone Camera and an Android camera app |
| AC-31.1 the page-1 block and its copy | `SoaDocument.test.ts`; tester (open the PDF) |
| AC-31.2 the QR and the link open the invite | `SoaDocument.test.ts` (both `Link src`); tester (tap both in Chrome's viewer and in Preview or Acrobat) |
| AC-31.3 the same link as the dialog, minted first if needed | tester: compare with the dialog; export a never-invited finished session and see the block |
| AC-31.4 a printed copy scans | manual: owner and tester, printed on A4 at 100% |
| AC-31.5 rest unchanged, page 1 as today | `SoaDocument.test.ts` (page 2 unchanged); tester: 3, 5 and 20 members against `main`'s PDF (A2) |
| AC-32.1 export without the link | tester (fetch override below): the PDF downloads, no block, the note shows |
| AC-32.2 the next good export has the block | tester: restore `fetch`, export again, the note goes and the block is there |
| AC-33.1 no QR on a draft's SOA | `SoaDocument.test.ts`; tester (Summary export) |
| AC-33.2 no QR on a participant's SOA | tester (participant's History detail export) |
| AC-3.1 the restored Reset clause | `joinedCards.test.ts`; tester |
| BR-Q1, BR-Q2 | golden tests; `Link src`; tester (reset, then export: the new link is printed) |
| E3-3 dark mode at 375px | tester: no horizontal scroll, tile and caption fit |

### 8.4 Checks for the ui-ux-tester

Follow the PR 1 spec's rules for Neon `main` data (section 8.2 there): only the tester's own test
sessions. Exporting mints an invite token on that session, which is expected.

1. Invite members at 1280px and at 375px: the white tile, the caption, then the link and Copy link;
   no horizontal scroll; the dialog scrolls if needed; screenshots of both.
2. Reset link: the confirmation shows the restored clause; after it, the QR and the link change.
3. Organizer's History detail, "↓ Download SOA": page 1 has the block between the header and Final
   Settlement; the printed link equals the dialog's; both the QR and the link open the invite in
   the PDF viewer.
4. **Export without the link:** in the page's console,

   ```js
   const realFetch = window.fetch;
   window.fetch = (input, init) =>
     String(input).includes('/api/invites') ? Promise.reject(new TypeError('blocked')) : realFetch(input, init);
   ```

   then export: the PDF downloads without the block, and the note shows under the button, at
   1280px (12rem column) and 375px (full width). Then `window.fetch = realFetch` and export again:
   the note goes and the block is back.
5. A participant's History detail export and a draft's Summary export: no block, no note, no
   request to `/api/invites` (Network panel).
6. SOAs for 3, 5 and 20 members, compared with `main`'s: everything after the block is unchanged
   (A2).
7. **Scan (with the owner):** the dialog's QR on a laptop screen and on a phone screen, and a
   printed A4 SOA at 100%, with the iPhone Camera app and an Android camera app (Google Camera or
   Lens). Each opens the invite link in the phone's browser, reaching the join flow.
8. The first-run tour and both tab guides run as before.

## 9. Documentation impact

For the documentation-engineer, when the owner asks:

- **User guide:** the QR in Invite members; the invite block on the organizer's SOA; the note when
  the SOA went out without it; that a reset kills the QR on SOAs already sent.
- **System documentation:** the PDF statement section (the page-1 block, organizer-only, fetched at
  export); `src/lib/qr.ts` in the module list.
- **Decision record** (architect section 6): a hand-written QR encoder instead of a dependency, its
  scope, and the golden-fixture procedure with segno 1.6.6 (section 8.2).
- README: the SOA description gains the invite block.

## 10. Tasks (in order)

1. **Fixtures.** Run section 8.2 on your machine; commit only `src/lib/qr.fixtures.ts`. Check the
   expected numbers.
2. **Encoder tests first.** Write `src/lib/qr.test.ts` (8.1, items 1 to 10) against a stub
   `src/lib/qr.ts`; see them fail.
3. **Encoder.** Implement `src/lib/qr.ts` (section 5) until every test passes.
4. **PDF.** `elementsOf` in `pdfTree.testutil.ts`; the new `SoaDocument.test.ts` cases (failing);
   then `InviteBlock`, `SoaProps.inviteUrl`, the styles and `downloadSoa`'s `inviteUrl`.
5. **Export.** `ExportSoaButton`'s `getInviteUrl` and note, with the CSS; `HistoryDetailPage`'s
   `inviteUrlFor`; `App`'s `inviteUrlFor`.
6. **Screen.** `QrCode` with its CSS and `QrCode.test.ts`; `InviteMembersDialog`'s QR figure, CSS
   and Reset message; the `joinedCards.test.ts` additions.
7. **Checks.** `steps.test.ts`, `targets.test.ts`, `guides/guides.test.ts`; then `npm run lint`,
   `npx tsc -b`, `npm test`, `npm run build`, with real results.
8. **Owner check.** `npm run dev:full`, give the owner `http://localhost:3000` and the branch.
   Locally a phone can scan the code but can't open a `localhost` link, so the local scan checks
   that the camera reads the exact link. Scanning through to the join flow (8.4 step 7) happens on
   sit, once the owner ships it there.

## 11. Risks and effort

| Risk | Guard |
|---|---|
| An encoder bug that phones reject | Bit-exact golden matrices from an independent encoder, for every mask and six versions; structural checks over all 213 lengths; manual scans of screen and print |
| The encoder's mask choice differs from the reference's | 5.6 is segno's evaluation, step by step, including its search positions and scoring before format information; a port reproduced its choices on all six texts and its totals; test 9 pinpoints the rule if not. Any mask scans; only the golden test would fail |
| The QR in the PDF isn't clickable in some viewer | The printed link is a second `Link`; tester taps both in two viewers |
| Hairline seams between rows in a PDF viewer | One path of abutting runs, filled at once; scanners threshold anyway; the tester zooms in |
| Page 1 runs onto another page sooner | A2; the block is about 140pt and `wrap={false}`; the tester compares 3, 5 and 20 members |
| A hanging link request delays the export up to 30 seconds | A3: no connection fails at once; the button reads "Preparing SOA…" meanwhile |
| A very long origin overflows the encoder | Impossible on Hati's hosts (5.8: at most 111 of 213 bytes) |
| Breaking `joinedCards.test.ts` by calling Clerk in History detail | The request lives in `App` (section 2); the test's two renders stay as they are |
| PR 1 is still moving (it gained a commit while this spec was written) | Specced against `232aa81`; rebase onto `joined-sessions-1`, then `main`, and recheck 6.2 against its dialog |
| Shared Neon `main` | No schema change; the only write is PR 1's existing token mint, on the tester's own sessions |

**Effort: medium.** About 350 lines of encoder, 250 of tests, 30KB of generated data, and small
changes in five UI and PDF files. No data risk.

## 12. Decisions

Approved by the owner on 2026-11-20.

1. **The spec is approved.**
2. **Assumptions A1 to A7 (section 1) are accepted.**
3. **Where the QR goes in Invite members: option (a).** QR and caption, then the link text, then
   Copy link. The requirements disagreed: AC-30.1 says the QR is "above Copy link", BR-O2 lists it
   after Copy link.
   - **(a) Chosen:** QR and caption, then the link text, then Copy link. The link stays next to its
     Copy button, and the QR, the thing most people will use, comes first.
   - (b) The link text, then the QR and caption, then Copy link (AC-30.1 read literally).
   - (c) The link text, Copy link, then the QR and caption (BR-O2).

Nothing else is open.
