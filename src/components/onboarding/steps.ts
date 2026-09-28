import type { SessionTabId } from '../layout/SessionTabs';

/** The shape of `App`'s screen state a step needs before its target exists. */
export type ScreenShape =
  { kind: 'home' } | { kind: 'history' } | { kind: 'session'; tab: SessionTabId };

export type TourStep = {
  /** Matches a `data-tour` attribute in the UI. */
  target: string;
  title: string;
  content: string;
  /**
   * The screen this step's target lives on. A step is never shown while its
   * screen is not mounted.
   */
  screen: ScreenShape;
};

/**
 * The walkthrough follows the app's real shape: start on Home, open a session,
 * move through its three tabs, come back out, finish on History.
 *
 * Next carries the reader through it. Each step names the screen it needs, and
 * pressing Next takes them there — so someone can read the whole thing without
 * having to work out which control to press, and without a half-finished
 * session if they stop early.
 *
 * Every step points at something on the screen it is shown on. Earlier there
 * were steps that pointed ahead — highlighting the Breakdown tab while still
 * on Expenses — which made sense when the reader had to click that tab to go
 * on. Now that Next navigates, pointing at a tab you are not on yet just
 * describes a page that isn't in front of you.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    target: 'new-session',
    title: 'Start a session',
    content:
      'A session is one trip or night out. Everything spent together goes in one, and you settle it up at the end.',
    screen: { kind: 'home' },
  },
  {
    target: 'tab-expenses',
    title: 'Log what people spent',
    content:
      'Add the people sharing the cost, then record each purchase. Split evenly or give each person an exact amount — one purchase can mix both.',
    screen: { kind: 'session', tab: 'expenses' },
  },
  {
    target: 'tab-breakdown',
    title: 'Check the numbers',
    content:
      'Breakdown lists every purchase, item by item: one row per item, one column per person, and every cell edits in place for as long as the session is open.',
    screen: { kind: 'session', tab: 'breakdown' },
  },
  {
    // The tab rather than the Finish Session button: the tour's session is
    // empty, and Summary shows an empty state instead of its controls until
    // something has been logged. A step can only point at what is on screen
    // for a brand-new account.
    target: 'tab-summary',
    title: 'See who owes whom',
    content:
      'Summary works out who pays whom, cancelling debts that run both ways. You can download it as a PDF, and once everyone has paid, finish the session to file it away.',
    screen: { kind: 'session', tab: 'summary' },
  },
  {
    target: 'workspace-back',
    title: 'Leave it for later',
    content: 'Leaving loses nothing — the session stays open and waiting for you on Home.',
    screen: { kind: 'session', tab: 'summary' },
  },
  {
    target: 'nav-history',
    title: 'Your archive',
    content:
      'Every session you finish ends up here, read-only, with its own statement to download. That is the whole app — go and add a real one.',
    screen: { kind: 'history' },
  },
];

/** Whether a live screen satisfies what a step requires. */
export function screenMatches(shape: ScreenShape, screen: ScreenShape): boolean {
  if (shape.kind !== screen.kind) return false;
  if (shape.kind === 'session' && screen.kind === 'session') return shape.tab === screen.tab;
  return true;
}
