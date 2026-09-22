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
  /**
   * An action step waits for the user to do the thing and advances when the
   * screen changes to what the next step needs. An explanation step advances
   * on its own Next button.
   */
  waitsForAction: boolean;
};

/**
 * The walkthrough follows the app's real shape: start on Home, open a session,
 * move through its three tabs, come back out, finish on History.
 *
 * Steps that move between screens wait for the user rather than navigating for
 * them — the tour narrates what they do instead of driving the app itself.
 */
export const TOUR_STEPS: TourStep[] = [
  {
    target: 'new-session',
    title: 'Start a session',
    content:
      'A session is one trip or night out. Everything spent together goes in one, and you settle it up at the end. Open one to see how it works.',
    screen: { kind: 'home' },
    waitsForAction: true,
  },
  {
    target: 'tab-expenses',
    title: 'Log what people spent',
    content:
      'Add the people sharing the cost, then record each purchase. Split evenly or give each person an exact amount — one purchase can mix both.',
    screen: { kind: 'session', tab: 'expenses' },
    waitsForAction: false,
  },
  {
    target: 'tab-breakdown',
    title: 'Check the numbers',
    content: 'Open Breakdown to see every purchase, item by item.',
    screen: { kind: 'session', tab: 'expenses' },
    waitsForAction: true,
  },
  {
    target: 'tab-breakdown',
    title: 'Fix anything wrong',
    content:
      'One row per item, one column per person, and every cell edits in place. Purchases older than seven days lock, so old records stay put.',
    screen: { kind: 'session', tab: 'breakdown' },
    waitsForAction: false,
  },
  {
    target: 'tab-summary',
    title: 'See who owes whom',
    content: 'Open Summary for the part everyone actually wants.',
    screen: { kind: 'session', tab: 'breakdown' },
    waitsForAction: true,
  },
  {
    target: 'finish-session',
    title: 'Settle up and finish',
    content:
      'Summary works out who pays whom, cancelling debts that run both ways. Download it as a PDF, and once everyone has paid, finish the session to file it away.',
    screen: { kind: 'session', tab: 'summary' },
    waitsForAction: false,
  },
  {
    target: 'workspace-back',
    title: 'Leave it for later',
    content: 'Leaving loses nothing — the session stays open and waiting. Head back out.',
    screen: { kind: 'session', tab: 'summary' },
    waitsForAction: true,
  },
  {
    target: 'nav-history',
    title: 'Look back at old sessions',
    content: 'Finished sessions move to History. Open it to see what lives there.',
    screen: { kind: 'home' },
    waitsForAction: true,
  },
  {
    target: 'nav-history',
    title: 'Your archive',
    content:
      'Every session you finish ends up here, read-only, with its own statement to download. That is the whole app — go and add a real one.',
    screen: { kind: 'history' },
    waitsForAction: false,
  },
];

/** Whether a live screen satisfies what a step requires. */
export function screenMatches(shape: ScreenShape, screen: ScreenShape): boolean {
  if (shape.kind !== screen.kind) return false;
  if (shape.kind === 'session' && screen.kind === 'session') return shape.tab === screen.tab;
  return true;
}
