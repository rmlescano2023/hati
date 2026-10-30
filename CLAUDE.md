# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Applying these guidelines in Hati's agents

Hati's work is done by project subagents in `.claude/agents/`, dispatched by a
coordinating session. The four principles above apply to all of them, with one
adjustment:

- **"Ask" means stop and report.** A subagent can't ask the user mid-task. When
  something is unclear or there are several reasonable readings, don't pick one
  silently: stop before acting on it, and put the question in your report so
  the coordinating session can bring it to the user.
- **Reviews use the Surgical Changes test.** For `surgeon-reviewer`, every
  changed line in a diff should trace back to the task. Unrelated changes, such
  as reformatting, drive-by refactors or deleted pre-existing code, are a
  finding.

## Hati project rules

These hold for every task in this repository. When an agent definition repeats
one of them, this is the source of truth.

**Architecture**
- React 18 + TypeScript + Vite, CSS Modules with tokens in
  `src/styles/tokens.css`, Vercel Functions in `api/`, Postgres (Neon) through
  `@vercel/postgres`, Clerk for auth.
- Keep it minimal: no router, ORM, state library, or UI/icon library. Icons are
  hand-written SVG in `src/components/shared/icons.tsx`.
- **No new dependency** without the owner's approval.
- Comments explain *why*, in full sentences. Match the existing code's style.

**Onboarding tour** (`src/components/onboarding/`)
- Every tour step targets an element on the screen the reader is already on,
  never one on the next page or one that only appears once there's data.
- `data-tour` attributes stay on the elements the steps point at. Never move,
  rename or duplicate a mounted target. Run `steps.test.ts` after touching
  anything near them.

**Layout**
- Phone and desktop both keep working. Mobile-only styles go inside
  `@media (max-width: 640px)` (see `docs/mobile-breakpoints.md`). Don't change
  the desktop layout unless the task asks for it.
- Icon-only controls get an `aria-label`.
- Dev-only tooling is gated behind `import.meta.env.DEV` and lazy-imported.

**API and data**
- Every handler authenticates with `getUserId` (401 without a user), checks
  ownership explicitly (another account's id is a 404), validates input in
  `api/_validate.ts`, and uses the `pool.sql` template, never string-built SQL.
- The Neon `main` branch holds **real user data** and is shared by local
  development, sit, qat and uat. Never reset, truncate or delete data there.
- Schema changes in `scripts/db/schema.sql` stay idempotent and
  non-destructive. Anything destructive needs the owner's explicit approval.

**Running and checking**
- `npm run dev:full` (`vercel dev`, port 3000) for the full app; plain
  `npm run dev` doesn't serve `/api`.
- Before calling work done: `npm run lint`, `npx tsc -b`, `npm test`,
  `npm run build`, with real results reported.

**Git and delivery**
- Work on feature branches. Never commit or push directly to `main` or an
  environment branch, and never force-push.
- Merging into `main` and promoting through
  `main → sit → qat → uat → stg → prod` happen only when the owner asks, one
  hop at a time, never past the environment named. The `build, lint and test`
  check is required on `main` only, deliberately.
- `sit` and `qat` stay private; `uat` is the one public stage for testers.

**Deliberately absent:** an in-app calculator, sharing sessions between
accounts, currency selection, offline use. Don't add them without the owner
asking.
