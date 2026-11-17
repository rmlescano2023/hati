# Architect feature brief: Expenses and Collection guides with a practice session (2026-11-16)

Owner answers to section 10 are at the bottom of `buzzing-roaming-lark.md`.

## Recommendation
- **A1, store.** Split `SessionsStoreProvider` (`src/context/SessionsStoreContext.tsx`)
  into `SessionsStoreCore({ backend, children })`, which holds all the domain logic,
  and a backend.
  - The backend is `useServerSessions()` (real) or a new `useMemorySessions(seed)`.
    The memory one has the same `Result` shape and no network code.
  - In the memory backend:
    - `mutateSession` applies the function locally and calls `onSettled(true)`;
    - payments and settle reuse `settlePayments` from `lib/collection`;
    - `isPaying` is false;
    - `sync` is always ready.
  - `PracticeProfileProvider`, in `ProfileContext.tsx`, is fixed:
    - ready, with `displayName` set to the practice "you";
    - `save` and `remember` resolve with no request;
    - `alreadySettledAnswered` is true, and `answerAlreadySettled` does nothing.
  - Nested providers override the real ones for the practice subtree.
- **Practice screen kind.** App gains `{ kind: 'practice'; guide; back: Screen }`.
  - It REPLACES the real workspace or Collection. Hiding the real one would
    leave `workspace-back`, `tab-*` and `nav-*` mounted twice.
  - Ending the guide unmounts it and returns to `back`.
  - Practice gets its own `new Map()` for the Paid By picks, never App's
    `paidByPicks`.
  - Practice sessions are seeded with `status: 'closed'`, `me` set and
    `finishedWithCollection: true`, so "Already settled?" never appears and
    `ProfileBanner` stays hidden. `canAsk` is false in practice.
  - A flag turns off `beforeunload` and the `SessionWorkspace` leave prompt in
    practice.
  - Practice ids start with `practice_`.
- **B1, scenes.** Each guide step names a scene, authored as domain
  `StagedItem`s.
  - An optional `seed` prop on `PurchaseItemCard` is read only by its
    `useState` initialisers, through `fieldsFromStaged`, the conversion Edit
    already uses.
  - An optional `initialStaged` prop on `ExpensesPage` seeds the staged list.
  - The scene id is the `key` on `ExpensesPage`. What the reader typed stays
    within a scene and resets when the step moves to a new one.
  - Custom Amounts is switched on through the seed (`mode: 'custom'`).
  - For Collection, `openSessionId` combined with the existing key opens a
    card or the Settled section. The tech lead decides between a `LineRow`
    `initialOpen` prop and a step pointing at "Record payment".
- **C1, flags.** Two `timestamptz` columns, `expenses_guide_seen_at` and
  `collection_guide_seen_at`.
  - `parseUserMark` gains `'expensesGuide' | 'collectionGuide'`.
  - `api/user.ts` gets one branch per mark, with `coalesce(col, now())`.
  - The GET response gains `expensesGuideSeenAt` and `collectionGuideSeenAt`.
  - `useOnboarding` exposes the flags and `markGuideSeen(guide)`, which updates
    the screen at once and is silent on failure.
  - The onboarding PUT with no body must not set them.
- **D1, engine.** `GuideTour<P>({ steps, place, matches, onNavigate, onDone })`
  holds the Joyride setup, Back/Skip, the `[role="tab"]` nudge, the dev
  missing-target warning and the ending rules.
  - `OnboardingTour` stays as a thin wrapper with the same name and props.
  - `steps.ts` keeps `TOUR_STEPS`, `screenMatches` and `wentToNextStep`, and
    `steps.test.ts` doesn't change.
  - The guides go in `guides/expensesSteps.ts`, `guides/collectionSteps.ts` and
    `guides.test.ts`. `targets.test.ts` is extended.
- **New `data-tour` targets.** For example: `paid-by`, `item-mode`,
  `custom-total`, `who-in-item`, `sub-items`, `shared-items`, `discounts`,
  `charges`, `staged-list`, `save-to-breakdown`, `collection-card`,
  `record-payment`, `mark-all` and `settled-toggle`. A target on a repeated row
  or card goes on its container or on exactly one instance.

## Isolation
1. The practice modules contain no `fetch`, `authorisedFetch`, `useAuth`,
   `writeQueue` network helpers, `useServerSessions` or `@clerk/*`.
2. A static import test enforces that, modelled on `src/lib/apiImports.test.ts`.
3. The memory backend is pure reducers plus a thin hook, so the node test
   environment can unit-test it.
4. `/api/sessions` rejects `practice_` ids with a 400 (approved).
5. The tester checks the network log.

## Proposed static tests (no jsdom or testing-library; vitest runs in node)
- Every guide target is declared in the UI, and appears in exactly one source
  location.
- Every step names a scene that exists.
- Each data-dependent target declares what it needs, and the test checks that
  the scene's seed has it.
- Every seed passes the form's validators.
- The practice modules import no network code.

## Risks
1. **A leak to Neon `main`.** Covered by the defences above.
2. **Deploy order.** The schema must be applied to `main` before the branch
   runs anywhere that shares it. Otherwise `/api/user` returns 500,
   `useOnboarding` goes quiet and Collection shows "Couldn't load your profile".
3. **App overview replay.** It must use `previewing.current`, because
   `markSeen` runs `set onboarded_at = now()` without `coalesce`. Each replay
   creates and deletes a real empty draft.
4. **Typing is lost when a step moves to a new scene.**
5. **The flags live on the shared `main`.** Testing an offer on sit uses it up
   for that account on uat; hence the dev-only Preview offer.
6. **Practice names must be invented.** `src/lib/demoData.ts` may contain
   real names.
7. **Unknown:** Joyride positioning at 375px when a scene remounts the card
   under a step.
8. **Unknown:** what the Breakdown and Summary tabs and Finish Session do
   inside practice.
9. **`whatsNew.test.ts:18`.** `whatsNewDue(onboarded, 1)` becomes true after
   the bump to 2.

## For the business-analyst to settle
- The order on Collection when "Already settled?" and the Collection guide
  offer are both due.
- What's new and an offer due at the same time.
- The practice marker banner and its wording.
- What ends a guide (Skip, Back to Home, tabs) and where it returns.
- Whether a closing dialog follows a guide.
- Whether `SyncBanner` shows during practice.
- The scene boundaries and the reset when moving to a new scene.
- The example data and step copy, for the owner to approve.
- Where Tutorials lives:
  - a separate account-menu action, the simpler option, because
    `ProfileDialog` shows its content only once the profile has loaded;
  - or inside `ProfileDialog`.
- The tabs and Finish Session inside practice.

## For the tech-lead to specify
- The backend interface and the memory reducers.
- The practice id prefix.
- The `PracticeProfileProvider` value.
- The practice screen and its `back` behaviour.
- The flag that turns off the prompts in practice.
- The `seed` and `initialStaged` prop types.
- The `LineRow` `initialOpen` decision.
- The `GuideTour<P>` signature and the `OnboardingTour` wrapper.
- The exact unique `data-tour` targets.
- The columns, marks, GET fields and `useOnboarding` additions.
- The offer gating (`phase`, `whatsNewOpen`, `canAsk`, flags loaded).
- The steps for applying the schema to `main`.
- The tests, including the `whatsNew.test.ts` update.
