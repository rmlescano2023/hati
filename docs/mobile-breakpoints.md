# Mobile breakpoints

Mobile styles are gated behind `max-width` media queries, so desktop layout is
never affected by them. The values are hardcoded: the build has no custom-media
support, and a CSS variable cannot be used in a `@media` condition.

## 640px: mobile shell

Shell and touch-level changes:

- `layout/NavTabs.module.css`: `.nav` becomes a floating pill tab bar. It is
  repositioned, never duplicated, so the `data-tour` buttons inside it stay the
  single mounted targets the onboarding tour uses. Covers `NavTabs` and
  `SessionTabs`, which share the file.
- `layout/PageShell.module.css`: bottom padding that clears the tab bar.
- `shared/Button` (38px), `ModeToggle` (34px options, ~42px overall),
  `OwnerPill` (38px), `EditableCell` (44px): minimum touch-target heights.
- `breakdown/BreakdownTable`, `summary/OwedMatrix`: looser cell padding for the
  taller inputs, and iOS momentum scrolling. The horizontal scroll is kept on
  purpose.

## 480px: compact

Existing fine-tuning for very narrow phones in `Header.module.css` and
`NavTabs.module.css`. Left as-is; its `NavTabs` rules overlap harmlessly with
the 640px block.

## 600px / 620px: left alone

`PageShell`, `Card`, `ItemStagingList` and `PurchaseDetailsFields` already
adapt correctly at these widths. They are intentionally not folded into 640px.
