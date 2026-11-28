/** The release whose "What's new" is current. A later release bumps it, and each account sees that one once. */
export const WHATS_NEW_VERSION = 3;

/** One feature note in "What's new". `showMeHow` marks the note whose dialog offers the Expenses guide (BR-WC4). */
export type WhatsNewNote = { version: number; title: string; body: string; showMeHow?: true };

/**
 * Every release's notes, newest release first and each release's notes in the order they shipped,
 * so filtering keeps the order the dialog reads in. Each note is the text its release shipped
 * with. A new release adds its notes at the top and bumps WHATS_NEW_VERSION.
 */
export const WHATS_NEW_NOTES: readonly WhatsNewNote[] = [
  {
    version: 3,
    title: 'Joined sessions.',
    body: 'On a finished session, tap Share with members and share the link. Each person signs in, picks who they are, and follows what they owe or are owed in their own Collection.',
  },
  {
    version: 3,
    title: "“I've paid.”",
    body: "Members who joined can tell you they've paid. It waits until you confirm or decline it, so you both end up with the same figures.",
  },
  {
    version: 3,
    title: 'Collection and History.',
    body: "Collection now shows only what's still being paid; settled sessions are in History.",
  },
  {
    version: 2,
    title: 'Receipts, item by item.',
    body: "In Custom Amounts, type a receipt the way it's printed: what each person had, dishes people shared, discounts like PWD or senior, and service charges. Hati works out each person's share.",
  },
  {
    version: 2,
    title: 'Guides.',
    body: 'Tap “Need help?” on Expenses or Collection for a quick practice run, or open Tutorials in your account menu.',
    showMeHow: true,
  },
  {
    version: 1,
    title: 'Collection.',
    body: 'A new tab for finished sessions: see who owes you and who you owe, and record payments as they come in, even part payments.',
  },
  {
    version: 1,
    title: 'Your name.',
    body: 'Set it in Profile, in your account menu, so Hati knows which member is you.',
  },
];

/**
 * Whether this account is due the current "What's new": already onboarded
 * (a new account gets the tour instead, BR-W3), and hasn't seen this version
 * (BR-W1, BR-W2). Anything unreadable counts as not seen.
 */
export function whatsNewDue(onboardedAt: unknown, seenVersion: unknown): boolean {
  const seen = typeof seenVersion === 'number' ? seenVersion : 0;
  return onboardedAt !== null && onboardedAt !== undefined && seen < WHATS_NEW_VERSION;
}

export type WhatsNewNotes = {
  /** The current release's notes, shown under "Latest" (or with no heading when `earlier` is empty). */
  latest: WhatsNewNote[];
  /** Every older release's unseen notes, newest release first, shown under "Earlier". */
  earlier: WhatsNewNote[];
  /** Whether the Guides note is among them, which adds "Show me how" (BR-WC4). */
  showMeHow: boolean;
};

/**
 * The notes an account has not seen: every release after the one it last saw, up to the current
 * one (BR-WC1). A note above the current release never shows, so one can be written ahead of the
 * bump. `notes` and `current` are parameters only so a later release can be tested without
 * shipping it; the app always calls this with the seen version alone.
 */
export function whatsNewNotes(
  seenVersion: unknown,
  notes: readonly WhatsNewNote[] = WHATS_NEW_NOTES,
  current: number = WHATS_NEW_VERSION,
): WhatsNewNotes {
  const seen = typeof seenVersion === 'number' ? seenVersion : 0;
  const latest = notes.filter((n) => n.version === current && n.version > seen);
  const earlier = notes.filter((n) => n.version > seen && n.version < current);
  return { latest, earlier, showMeHow: [...latest, ...earlier].some((n) => n.showMeHow === true) };
}
