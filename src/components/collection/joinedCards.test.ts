import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollectionCard } from './CollectionCard';
import { MePicker } from './MePicker';
import { MovedNotice } from './MovedNotice';
import { CollectionPage } from '../../pages/CollectionPage';
import { HistoryDetailPage } from '../../pages/HistoryDetailPage';
import { HistoryPage } from '../../pages/HistoryPage';
import { buildCard } from '../../lib/collection';
import { PracticeProfileProvider } from '../../context/ProfileContext';
import { PracticeSessionsProvider } from '../../context/SessionsStoreContext';
import { collectionScenes } from '../onboarding/guides/collectionScenes';
import type { Claim, Session } from '../../types';

/**
 * What a joined session and an organizer's finished session show on Collection and History,
 * rendered through the practice providers so no request is ever sent. The practice profile is
 * "Ana", so an owned session whose pick is Ana lands as hers.
 */

const wrap = (sessions: Session[], child: ReactNode) =>
  renderToStaticMarkup(
    createElement(PracticeSessionsProvider, {
      seed: sessions,
      children: createElement(PracticeProfileProvider, { children: child }),
    }),
  )
    .replace(/&#x27;/g, "'")
    .replace(/<!-- -->/g, '');

const count = (text: string, part: string) => text.split(part).length - 1;

const pay = (id: string, debtor: string, creditor: string) => ({
  id,
  debtor,
  creditor,
  amountCents: 10000,
  createdAt: '2026-11-03T00:00:00.000Z',
});

/** Ana paid ₱300 for all three, so Ben and Carla each owe her ₱100. */
const finished = (id: string, over: Partial<Session> = {}): Session => ({
  id,
  status: 'closed',
  createdAt: '2026-11-01T00:00:00.000Z',
  closedAt: '2026-11-02T00:00:00.000Z',
  members: ['Ana', 'Ben', 'Carla'],
  records: [
    {
      id: 'rec_1',
      date: '2026-11-01',
      payorMode: 'single',
      payors: [{ member: 'Ana', amount: 0 }],
      items: [
        {
          id: 'itm_1',
          mode: 'equal',
          name: 'Dinner',
          totalPrice: 300,
          owners: ['Ana', 'Ben', 'Carla'],
        },
      ],
      createdAt: '2026-11-01T02:00:00.000Z',
    },
  ],
  name: 'Bali Trip',
  activityAt: null,
  me: 'Ana',
  finishedWithCollection: true,
  payments: [],
  ...over,
});

const joined = (over: Partial<Session> = {}) =>
  finished('session_joined', {
    role: 'participant',
    organizerName: 'Ana',
    me: 'Ben',
    participants: [],
    ...over,
  });

const collection = (sessions: Session[], openSessionId?: string) =>
  wrap(sessions, createElement(CollectionPage, { canAsk: false, openSessionId }));

describe('a joined session on Collection', () => {
  const open = collection([joined()], 'session_joined');

  it('says who shared it, who the member is, and how to stop tracking (AC-10.2, AC-12.1)', () => {
    expect(open).toContain('Shared by Ana');
    expect(open).toContain('You joined as <strong>Ben</strong>');
    expect(open).toContain('Stop tracking');
    expect(open).toContain('aria-label="Stop tracking Bali Trip"');
  });

  it('shows the lines, with no line about who records the payments (BR-V11)', () => {
    // PR 2 replaces the PR 1 line that said the organizer records the payments (BR-V11).
    expect(open).not.toContain('records the payments on this session');
    // Ben's one line: he owes Ana a third of the dinner, and nothing has been paid yet.
    expect(open).toContain('₱100.00');
    expect(open).toContain('Unpaid');
  });

  it('offers no direct recording, undo, change, Already settled or invite on a debt (BR-C20, BR-V6)', () => {
    for (const absent of [
      'Record payment',
      'I paid',
      'Mark fully paid',
      'Undo',
      'Already settled',
      'Share with members',
      'Change who you are',
      '>Change<',
    ]) {
      expect(open, absent).not.toContain(absent);
    }
  });

  it('reads "Shared with you" when the organizer has no Hati name, and collapsed has no body', () => {
    const markup = collection([joined({ organizerName: null })]);
    expect(markup).toContain('Shared with you');
    expect(markup).not.toContain('Stop tracking');
  });
});

describe('an organizer on Collection (AC-1.2, AC-1.9)', () => {
  const MARK_ALL = 'data-tour="collection-mark-all"';

  it('shows Share with members, labelled for a screen reader', () => {
    const markup = collection([finished('session_own')], 'session_own');
    expect(markup).toContain('aria-label="Share Bali Trip with members"');
    expect(markup).toContain('Share with members');
  });

  it("puts Share on the right of Mark all's row, inside the tour target and after Mark all", () => {
    const markup = collection([finished('session_own')], 'session_own');
    expect(count(markup, MARK_ALL)).toBe(1);
    const start = markup.indexOf(MARK_ALL);
    const end = markup.indexOf('</div>', start);
    const row = markup.slice(start, end);
    expect(row).toContain('Mark all as paid');
    expect(row).toContain('Share with members');
    expect(row.indexOf('Share with members')).toBeGreaterThan(row.indexOf('Mark all as paid'));
  });

  // The Settled section is collapsed on the page, so these render the card directly, open.
  const openCardOf = (
    session: Session,
    names = { displayName: 'Ana', nicknames: [] as string[] },
  ) => {
    const noop = () => {};
    const card = buildCard(session, names);
    const markup = wrap(
      [session],
      createElement(CollectionCard, {
        card,
        expanded: true,
        onToggle: noop,
        failed: () => undefined,
        onFailed: noop,
        onPaid: noop,
        onAlreadySettled: noop,
        onPlaced: noop,
        placed: false,
        onLeft: noop,
        onAnnounce: noop,
      }),
    );
    return { card, markup };
  };

  it('shows no Share on a Settled card (round 5)', () => {
    const settled = finished('session_own', {
      payments: [pay('p1', 'Ben', 'Ana'), pay('p2', 'Carla', 'Ana')],
    });
    const { card, markup } = openCardOf(settled);
    expect(card.bucket).toBe('settled');
    expect(markup).not.toContain('Share with members');
    expect(markup).not.toContain(MARK_ALL);
  });

  it('shows no Share on a Needs setup card (round 5)', () => {
    const unplaced = finished('session_own', { me: null });
    const { card, markup } = openCardOf(unplaced, { displayName: 'Nobody', nicknames: [] });
    expect(card.bucket).toBe('needsSetup');
    expect(markup).not.toContain('Share with members');
  });

  it("leaves Mark all's row as it was on a practice session, with no Share (AC-1.9)", () => {
    const markup = collection([finished('practice_own')], 'practice_own');
    const start = markup.indexOf(MARK_ALL);
    expect(start).toBeGreaterThan(-1);
    const row = markup.slice(start, markup.indexOf('</div>', start));
    expect(row).toContain('Mark all as paid');
    expect(row).not.toContain('Share');
    expect(markup).not.toContain('Share with members');
  });
});

/** The organizer's session with every line paid, so it is settled for her. */
const settledOwn = (over: Partial<Session> = {}) =>
  finished('session_own', {
    payments: [pay('p1', 'Ben', 'Ana'), pay('p2', 'Carla', 'Ana')],
    ...over,
  });
/** Ben's view, joined, with his one line to Ana paid. */
const settledJoined = (over: Partial<Session> = {}) =>
  joined({ payments: [pay('p1', 'Ben', 'Ana')], ...over });

const detail = (session: Session, props: Record<string, unknown> = {}) =>
  wrap(
    [session],
    createElement(HistoryDetailPage, {
      sessionId: session.id,
      back: 'history',
      onBack: () => {},
      ...props,
    }),
  );

describe('History lists what is settled (PR 4)', () => {
  const history = (sessions: Session[]) =>
    wrap(sessions, createElement(HistoryPage, { onOpenSession: () => {} }));

  it('lists only settled sessions under "Settled sessions", and not one that still has something left', () => {
    const markup = history([settledOwn(), finished('session_open', { name: 'Open Trip' })]);
    expect(markup).toContain('Settled sessions');
    expect(markup).toContain('Bali Trip');
    expect(markup).not.toContain('Open Trip');
  });

  it("marks a joined session 'Shared by' and gives it no bin (AC-11.1)", () => {
    const markup = history([settledJoined()]);
    expect(markup).toContain('Shared by Ana');
    expect(markup).not.toContain('Delete session');
  });

  it('keeps the bin on an owned session', () => {
    const markup = history([settledOwn()]);
    expect(markup).toContain('Delete session Bali Trip');
    expect(markup).not.toContain('Shared by');
  });

  it('gives each card its status, and the note while others still owe each other (AC-H3.1, AC-H3.2)', () => {
    // Ana's own line is paid, but Carla still owes Ben: here, only Ben→Ana is paid and Carla→Ana is
    // not, so make Ana's lines paid and add a pair she isn't on.
    const session = finished('session_own', {
      members: ['Ana', 'Ben', 'Carla'],
      records: [
        record('r1', 'Ana', 200, ['Ana', 'Ben']),
        record('r2', 'Ben', 200, ['Ben', 'Carla']),
      ],
      payments: [pay('p1', 'Ben', 'Ana')],
    });
    const markup = history([session]);
    expect(markup).toMatch(/Settled [A-Z][a-z]+ \d+, \d{4}/);
    expect(markup).toContain('Some members still owe each other');
    const all = history([settledOwn()]);
    expect(all).not.toContain('Some members still owe each other');
  });

  it('says so when nothing has settled yet (AC-H2.5)', () => {
    const markup = history([finished('session_open')]);
    expect(markup).toContain('Nothing settled yet');
    expect(markup).toContain(
      'When a finished session is paid in full, it moves here from Collection.',
    );
  });

  it('never lists a draft (AC-H2.7)', () => {
    const draft = finished('session_draft', {
      status: 'draft',
      closedAt: null,
      name: 'Draft Trip',
    });
    expect(history([draft])).not.toContain('Draft Trip');
  });
});

describe('History detail', () => {
  it('shows a joined session its header line, the SOA and Stop tracking (AC-11.2)', () => {
    const markup = detail(settledJoined());
    expect(markup).toContain('Shared by Ana · You joined as Ben');
    expect(markup).toContain('↓ Download SOA');
    expect(markup).toContain('aria-label="Stop tracking Bali Trip"');
    expect(markup).not.toContain('Share with members');
  });

  it('names where it came from on the back button, and keeps Not found reachable (BR-D1, EH-9)', () => {
    expect(detail(settledOwn())).toContain('← History');
    expect(detail(settledOwn(), { back: 'collection' })).toContain('← Collection');
    expect(detail(settledOwn(), { sessionId: 'gone', back: 'collection' })).toContain(
      '← Collection',
    );
  });

  it('shows "Your payments" with Undo, the YouAre row and no record action, for a settled session (AC-H5.1, AC-H5.2, AC-H5.6)', () => {
    const markup = detail(settledOwn({ me: 'Ana' }));
    expect(markup).toContain('Your payments');
    expect(markup).toContain('Undo');
    expect(markup).toContain('You are');
    expect(markup).toContain('aria-label="Change who you are in Bali Trip"');
    for (const absent of ['Record payment', 'I paid', 'Mark fully paid', 'Mark all as paid']) {
      expect(markup, absent).not.toContain(absent);
    }
  });

  it('offers Undo only on the Owed to you payments of a joined session (AC-H5.2)', () => {
    // Ben owes Ana, so his payment is on a You owe line: no Undo.
    expect(detail(settledJoined())).not.toContain('Undo');
  });

  it('offers Undo "Already settled" on a session marked settled before Collection (AC-H5.4)', () => {
    const markup = detail(settledOwn({ finishedWithCollection: false }));
    expect(markup).toContain('Undo “Already settled”');
  });

  it('has no "Your payments" for an Outstanding session opened from a card (AC-H4.2, AC-H5.8)', () => {
    const markup = detail(finished('session_open'), { back: 'collection' });
    expect(markup).toContain('← Collection');
    expect(markup).not.toContain('Your payments');
  });

  it('says there is nothing to do when an arrival lands on a settled session (AC-H9.2)', () => {
    const markup = detail(settledOwn(), { notice: 'nothingToDo' });
    expect(markup).toContain(
      "There's nothing for you to collect or pay in “Bali Trip”, so it's in History.",
    );
  });

  it('says the link no longer works, with no Share, for a fully paid session (AC-H11.1, AC-H11.2)', () => {
    const markup = detail(settledOwn());
    expect(markup).toContain('Everyone has paid, so the invite link no longer works.');
    expect(markup).not.toContain('Share with members');
  });

  it('keeps Share when the organizer is settled but others still owe each other (BR-L3)', () => {
    const session = finished('session_own', {
      members: ['Ana', 'Ben', 'Carla'],
      records: [
        record('r1', 'Ana', 200, ['Ana', 'Ben']),
        record('r2', 'Ben', 200, ['Ben', 'Carla']),
      ],
      payments: [pay('p1', 'Ben', 'Ana')],
    });
    const markup = detail(session);
    expect(markup).toContain('Share with members');
    expect(markup).not.toContain('the invite link no longer works');
  });

  it('shows the organizer Share with members beside the SOA while a line is unpaid (AC-1.1)', () => {
    const markup = detail(finished('session_own'));
    expect(markup).toContain('Share with members');
    expect(markup.indexOf('Share with members')).toBeGreaterThan(markup.indexOf('Download SOA'));
    expect(markup).not.toContain('Stop tracking');
  });

  it('gives the organizer Delete session, labelled, and a joined member none (AC-H10.2, AC-H10.5)', () => {
    expect(detail(settledOwn())).toContain('aria-label="Delete session Bali Trip"');
    expect(detail(settledJoined())).not.toContain('Delete session');
  });
});

describe('MePicker with members already on Hati (AC-14.1, AC-6.2)', () => {
  const picker = (extra: Record<string, unknown>) =>
    wrap(
      [],
      createElement(MePicker, {
        legend: 'Which one are you?',
        members: ['Ana', 'Ben'],
        value: null,
        onChange: () => {},
        remember: true,
        onRememberChange: () => {},
        ...extra,
      }),
    );

  it('shows the member disabled, marked on Hati', () => {
    const markup = picker({ unavailable: ['Ben'] });
    expect(markup).toMatch(
      /<input[^>]*value="Ben"[^>]*disabled=""[^>]*>|<input[^>]*disabled=""[^>]*value="Ben"[^>]*>/,
    );
    expect(markup).toContain('Ben · on Hati');
    expect(markup).not.toMatch(/<input[^>]*value="Ana"[^>]*disabled/);
  });

  it('leaves a member disabled but unlabelled when only the organizer is that member', () => {
    const markup = picker({ unavailable: ['Ana', 'Ben'], onHati: ['Ben'] });
    expect(markup).toContain('Ben · on Hati');
    expect(markup).not.toContain('Ana · on Hati');
    expect(markup).toMatch(
      /<input[^>]*value="Ana"[^>]*disabled=""[^>]*>|<input[^>]*disabled=""[^>]*value="Ana"[^>]*>/,
    );
  });

  it('can leave out "I\'m not in this session"', () => {
    expect(picker({})).toContain("I'm not in this session");
    expect(picker({ offerNotInSession: false })).not.toContain("I'm not in this session");
  });
});

describe('no new onboarding targets (BR-G7, BR-G8)', () => {
  const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

  it('adds no data-tour to the new files', () => {
    for (const path of [
      '../join/JoinFlow.tsx',
      './InviteMembersDialog.tsx',
      './QrCode.tsx',
      './StopTrackingButton.tsx',
      '../layout/SignedOutScreen.tsx',
      './LineRow.tsx',
    ]) {
      expect(source(path), path).not.toContain('data-tour');
    }
  });

  it('gives the amount box the same reset control as Expenses (round 5)', () => {
    const line = source('./LineRow.tsx');
    expect(line).toContain("from '../shared/ClearableInput'");
    expect(line).toContain('<ClearableInput');
    expect(line).toContain('clearLabel=');
    expect(line).not.toMatch(/<input\b/);
  });

  it('has no Invite members left in the sources (round 3, item 1)', () => {
    for (const path of [
      './CollectionCard.tsx',
      '../../pages/HistoryDetailPage.tsx',
      './InviteMembersDialog.tsx',
    ]) {
      expect(source(path), path).not.toContain('Invite members');
    }
  });

  it('leaves CollectionCard with exactly its two targets', () => {
    const card = source('./CollectionCard.tsx');
    const target = "data-tour={group.direction === 'owedToYou' ? 'collection-owed' : undefined}";
    expect(card.split(target)).toHaveLength(2);
    expect(card.split('data-tour="collection-mark-all"')).toHaveLength(2);
    expect(card.match(/data-tour/g)).toHaveLength(2);
  });

  it('restores the Reset clause about statements already shared (AC-3.1)', () => {
    expect(source('./InviteMembersDialog.tsx')).toContain(
      "The current link, and the QR on any statement you've already shared, will stop working. Members who already joined keep tracking. You'll get a new link to share.",
    );
  });

  it('puts the QR before the link text and Copy link (A1)', () => {
    const dialog = source('./InviteMembersDialog.tsx');
    expect(dialog).toContain('<QrCode');
    expect(dialog.indexOf('<QrCode')).toBeLessThan(dialog.indexOf('ref={linkEl}'));
  });
});

/**
 * PR 2: claims. Ana is the organizer, and Ben (the participant) owes Ana ₱500 and Carla ₱300:
 * Ana paid ₱1,000 for herself and Ben, and Carla paid ₱600 for herself and Ben.
 */
const record = (id: string, payor: string, total: number, owners: string[]) => ({
  id,
  date: '2026-11-01',
  payorMode: 'single' as const,
  payors: [{ member: payor, amount: 0 }],
  items: [{ id: `itm_${id}`, mode: 'equal' as const, name: 'Item', totalPrice: total, owners }],
  createdAt: '2026-11-01T02:00:00.000Z',
});

const owing = (over: Partial<Session> = {}): Session =>
  finished('session_claims', {
    members: ['Ana', 'Ben', 'Carla'],
    records: [
      record('rec_a', 'Ana', 1000, ['Ana', 'Ben']),
      record('rec_c', 'Carla', 600, ['Ben', 'Carla']),
    ],
    role: 'participant',
    organizerName: 'Rina',
    me: 'Ben',
    participants: [],
    withAccount: ['Ana'],
    ...over,
  });

const claim = (over: Partial<Claim> = {}): Claim => ({
  id: 'pay_claim1',
  debtor: 'Ben',
  creditor: 'Ana',
  amountCents: 20000,
  createdAt: '2026-11-03T08:30:00.000Z',
  status: 'pending',
  decidedAt: null,
  mine: true,
  ...over,
});

const openCard = (s: Session) => collection([s], s.id);

describe("a joined debtor's lines (US-20 to US-25)", () => {
  it("offers I've paid and I've paid it all, with no Undo on a confirmed payment (AC-20.1, AC-21.4)", () => {
    const markup = openCard(
      owing({
        payments: [
          {
            id: 'pay_1',
            debtor: 'Ben',
            creditor: 'Ana',
            amountCents: 10000,
            createdAt: '2026-11-03T00:00:00.000Z',
          },
        ],
      }),
    );
    expect(markup).toContain('aria-label="Tell Ana you\'ve paid"');
    expect(markup).toContain('aria-label="Tell Ana you\'ve paid the full ₱400.00"');
    expect(markup).toContain("I've paid it all");
    expect(markup).toContain('You paid ₱100.00');
    expect(markup).not.toContain('Undo');
  });

  it('shows a pending claim beside figures that do not move (AC-20.3)', () => {
    const markup = openCard(owing({ claims: [claim()] }));
    expect(markup).toContain('₱200.00 waiting for Ana to confirm');
    expect(markup).toContain('You said you paid ₱200.00');
    expect(markup).toContain('Waiting for Ana to confirm');
    expect(markup).toContain('Withdraw');
    expect(markup).toContain('Paid ₱0.00 · ₱500.00 left');
    expect(markup).toContain('Unpaid');
  });

  it('hides the claim buttons on a line whose remainder is all waiting (AC-20.5)', () => {
    const markup = openCard(owing({ claims: [claim({ amountCents: 50000 })] }));
    expect(markup).not.toContain('Tell Ana you');
    expect(markup).toContain('Tell Carla you');
  });

  it('shows a declined note with Dismiss, and no waiting text (AC-22.3)', () => {
    const markup = openCard(
      owing({ claims: [claim({ status: 'declined', decidedAt: '2026-11-04T00:00:00.000Z' })] }),
    );
    expect(markup).toContain('Not confirmed: the ₱200.00 you said you paid on');
    expect(markup).toContain('If you did pay, talk to Ana, then send it again.');
    expect(markup).toContain('Dismiss');
    expect(markup).not.toContain('waiting for');
  });

  it('names the organizer when the creditor has no account (AC-20.8)', () => {
    const toCarla = claim({ id: 'pay_claim2', creditor: 'Carla', amountCents: 15000 });
    expect(openCard(owing({ claims: [toCarla] }))).toContain('₱150.00 waiting for Rina to confirm');
    const unnamed = openCard(owing({ organizerName: null, claims: [toCarla] }));
    expect(unnamed).toContain('Waiting for the organizer to confirm');
    expect(openCard(owing({ withAccount: ['Ana', 'Carla'], claims: [toCarla] }))).toContain(
      'Waiting for Carla to confirm',
    );
  });
});

describe("a joined creditor's lines (US-21, US-26)", () => {
  // Carla joined: Ben owes her ₱300, and says he paid ₱200 of it.
  const carla = (over: Partial<Session> = {}) =>
    owing({
      me: 'Carla',
      withAccount: ['Ana', 'Carla'],
      claims: [claim({ creditor: 'Carla', mine: false })],
      payments: [
        {
          id: 'pay_1',
          debtor: 'Ben',
          creditor: 'Carla',
          amountCents: 5000,
          createdAt: '2026-11-03T00:00:00.000Z',
        },
      ],
      ...over,
    });

  it('offers Confirm and Decline, records directly, and can undo (AC-21.1, AC-26.1, AC-26.4)', () => {
    const markup = openCard(carla());
    expect(markup).toContain('Ben says they paid ₱200.00');
    expect(markup).toContain('aria-label="Confirm ₱200.00 from Ben"');
    expect(markup).toContain('aria-label="Decline ₱200.00 from Ben"');
    expect(markup).toContain('₱200.00 waiting for you to confirm');
    expect(markup).toContain('Record payment');
    expect(markup).toContain('Mark fully paid');
    expect(markup).toContain('Undo');
  });

  it('hides Record payment while pending covers what is left (AC-26.3)', () => {
    const markup = openCard(
      carla({ claims: [claim({ creditor: 'Carla', mine: false, amountCents: 25000 })] }),
    );
    expect(markup).not.toContain('Record payment');
    expect(markup).not.toContain('Mark fully paid');
    expect(markup).toContain('aria-label="Confirm ₱250.00 from Ben"');
  });

  it('keeps the card out of Settled while a claim waits, and says so collapsed (AC-23.4)', () => {
    const settled = carla({
      payments: [
        {
          id: 'pay_1',
          debtor: 'Ben',
          creditor: 'Carla',
          amountCents: 30000,
          createdAt: '2026-11-03T00:00:00.000Z',
        },
      ],
    });
    const markup = collection([settled]);
    expect(markup).toContain('1 payment to confirm');
    expect(markup).not.toContain('Settled (1)');
  });
});

describe('Mark all and the collapsed summary on a joined card (AC-27.1, AC-28.1)', () => {
  it('shows Mark all as paid when something is open, and drops the PR 1 recording line (BR-V11)', () => {
    const markup = openCard(owing());
    expect(markup).toContain('Mark all as paid');
    expect(markup).not.toContain('records the payments on this session');
  });

  it('says what is waiting on the collapsed card, and the figures still count it (AC-28.1)', () => {
    const markup = collection([owing({ claims: [claim({ amountCents: 50000 })] })]);
    expect(markup).toContain('₱500.00 waiting for confirmation');
  });
});

describe('To confirm for others on the organizer card (US-23)', () => {
  // The organizer is Zed, who isn't in the session as a member Hati can place, so the card is in
  // Needs setup; Ben (joined) says he paid Carla, who has no account.
  const organizer = (over: Partial<Session> = {}): Session =>
    finished('session_others', {
      members: ['Ana', 'Ben', 'Carla'],
      records: [
        record('rec_a', 'Ana', 1000, ['Ana', 'Ben']),
        record('rec_c', 'Carla', 600, ['Ben', 'Carla']),
      ],
      me: 'Ana',
      participants: [{ member: 'Ben', name: null, joinedAt: '2026-11-02T00:00:00.000Z' }],
      claims: [claim({ id: 'pay_oth', creditor: 'Carla', amountCents: 15000 })],
      ...over,
    });

  it('starts the open body with the group, the entry and the not-on-Hati line (AC-23.1)', () => {
    const markup = openCard(organizer());
    const group = markup.indexOf('To confirm for others');
    expect(group).toBeGreaterThan(-1);
    expect(group).toBeLessThan(markup.indexOf('You are'));
    expect(markup).toContain('Ben says they paid Carla ₱150.00');
    expect(markup).toContain("Carla isn't on Hati, so you confirm it.");
    expect(markup).toContain('aria-label="Confirm ₱150.00 from Ben to Carla"');
  });

  it('says how many wait on a collapsed card (AC-23.4)', () => {
    expect(collection([organizer()])).toContain('1 payment to confirm');
  });

  it('keeps the group above the picker in Needs setup (AC-23.7)', () => {
    const unplaced = organizer({
      me: null,
      members: ['Zed', 'Ben', 'Carla'],
      records: [record('r', 'Zed', 900, ['Zed', 'Ben', 'Carla'])],
    });
    const markup = openCard(unplaced);
    expect(markup.indexOf('To confirm for others')).toBeGreaterThan(-1);
    expect(markup.indexOf('To confirm for others')).toBeLessThan(
      markup.indexOf('Which one are you?'),
    );
  });

  it('is not shown for a creditor who joined, or on an owned card with no claims', () => {
    const joinedCarla = organizer({
      participants: [
        { member: 'Ben', name: null, joinedAt: 'x' },
        { member: 'Carla', name: null, joinedAt: 'x' },
      ],
    });
    expect(openCard(joinedCarla)).not.toContain('To confirm for others');
    expect(openCard(organizer({ claims: [] }))).not.toContain('To confirm for others');
  });
});

describe('Stop tracking and Remove with something waiting (AC-29.2, AC-29.3)', () => {
  // The extra sentence sits in a confirmation that isn't rendered until opened, so the builders are
  // covered in joinedSessions.test.ts and these check what each one decides it from.
  const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

  it("decides Stop tracking's from the member's own pending claims", () => {
    expect(source('./StopTrackingButton.tsx')).toContain("c.mine && c.status === 'pending'");
  });

  it("decides Remove's from the pending claims of that member", () => {
    expect(source('./InviteMembersDialog.tsx')).toContain('c.debtor === removing.member');
  });
});

describe('a claim waiting for you stands out (round 3)', () => {
  const organizer = (claims: Claim[]) =>
    finished('session_wait', {
      members: ['Ana', 'Ben', 'Carla'],
      records: [
        record('rec_a', 'Ana', 1000, ['Ana', 'Ben']),
        record('rec_c', 'Carla', 600, ['Ben', 'Carla']),
      ],
      me: 'Ana',
      participants: [{ member: 'Ben', name: null, joinedAt: 'x' }],
      claims,
    });

  it('shows a "1 to confirm" badge on the collapsed card, read as "1 payment to confirm"', () => {
    const markup = collection([organizer([claim({ creditor: 'Ana', mine: false })])]);
    expect(markup).toContain('aria-hidden="true">1 to confirm<');
    expect(markup).toMatch(/visually-hidden">1 payment to confirm</);
    // No longer a plain detail line.
    expect(count(markup, '1 payment to confirm')).toBe(1);
  });

  it('tints a creditor line with a pending claim and gives Confirm the primary style', () => {
    const markup = openCard(organizer([claim({ creditor: 'Ana', mine: false })]));
    expect(markup).toContain('data-to-confirm=""');
    expect(markup).toMatch(/<button[^>]*primary[^>]*aria-label="Confirm ₱200.00 from Ben"/);
  });

  it("does not tint a debtor's line for their own pending claim", () => {
    expect(openCard(owing({ claims: [claim()] }))).not.toContain('data-to-confirm');
  });

  it('tints every To confirm for others entry', () => {
    const markup = openCard(
      organizer([
        claim({ id: 'pay_a', creditor: 'Carla', mine: false }),
        claim({ id: 'pay_b', creditor: 'Carla', mine: false }),
      ]),
    );
    expect(count(markup, 'data-to-confirm=""')).toBeGreaterThanOrEqual(2);
    expect(markup).toMatch(/aria-label="Confirm ₱200.00 from Ben to Carla"/);
  });

  it('has no claims in any guide scene, so none of this can show there', () => {
    for (const scene of Object.values(collectionScenes(new Date(2026, 10, 17, 9, 0)))) {
      for (const session of scene.sessions) expect(session.claims ?? []).toEqual([]);
    }
  });
});

describe('the waiting highlight stays readable (restyle)', () => {
  const css = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');
  const files = [
    './LineRow.module.css',
    './CollectionCard.module.css',
    '../layout/NavTabs.module.css',
  ];

  it('draws its light sweep at 10% white or less, and turns it off for reduced motion', () => {
    for (const path of files) {
      const source = css(path);
      expect(source, path).toContain('::after');
      expect(source, path).toContain('prefers-reduced-motion');
      const alphas = [...source.matchAll(/rgba\(255, 255, 255, ([0-9.]+)\)\s+50%/g)].map((m) =>
        Number(m[1]),
      );
      expect(alphas.length, path).toBeGreaterThan(0);
      for (const alpha of alphas) expect(alpha, path).toBeLessThanOrEqual(0.1);
    }
  });

  it('keeps the sweep behind the text and out of the way of taps', () => {
    for (const path of files) {
      const source = css(path);
      expect(source, path).toContain('z-index: -1');
      expect(source, path).toContain('pointer-events: none');
    }
  });
});

describe('Collection holds what is active (PR 4)', () => {
  const page = (sessions: Session[], props: Record<string, unknown> = {}) =>
    wrap(sessions, createElement(CollectionPage, { canAsk: false, ...props }));
  const MARK_ALL = 'data-tour="collection-mark-all"';
  // Nobody in it is "Ana", the practice profile's name, so Hati can't place the viewer.
  const unplaced = () =>
    finished('session_setup', {
      me: null,
      name: 'Setup Trip',
      members: ['Ben', 'Zed'],
      records: [record('r_setup', 'Zed', 300, ['Ben', 'Zed'])],
    });

  it('has no Settled section, whatever the sessions (BR-H7)', () => {
    const markup = page([settledOwn(), finished('session_open', { name: 'Open Trip' })]);
    expect(markup).not.toContain('Settled (');
    expect(markup).not.toContain('collection-settled');
    expect(markup).toContain('Outstanding (1)');
  });

  it('with Needs setup only, shows Outstanding (0) and the done line, the new guide target (AC-H1.4)', () => {
    const markup = page([unplaced()]);
    expect(markup).toContain('Outstanding (0)');
    expect(markup).toContain('Nothing outstanding. Sessions that are paid in full are in History.');
    expect(count(markup, 'data-tour="collection-done"')).toBe(1);
    expect(markup).not.toContain('Everything is settled');
  });

  it('with no cards and a settled session, says All settled (AC-H1.6)', () => {
    const markup = page([settledOwn()]);
    expect(markup).toContain('All settled');
    expect(markup).toContain('Everything is paid. Settled sessions are in History.');
  });

  it('with nothing at all, says Nothing to collect yet (AC-H1.5)', () => {
    expect(page([])).toContain('Nothing to collect yet');
  });

  describe('View details and the card export', () => {
    const open = (session: Session) =>
      page([session], { openSessionId: session.id, onViewDetails: () => {} });

    it("puts View details and Download SOA after Mark all's row, outside the tour target (AC-H4.1)", () => {
      const markup = open(finished('session_own'));
      expect(count(markup, MARK_ALL)).toBe(1);
      const start = markup.indexOf(MARK_ALL);
      const rowEnd = markup.indexOf('</div>', start);
      const markAllRow = markup.slice(start, rowEnd);
      expect(markAllRow).not.toContain('View details');
      expect(markAllRow).not.toContain('Download SOA');
      const after = markup.slice(rowEnd);
      expect(after).toContain('aria-label="View details of Bali Trip"');
      expect(after).toContain('↓ Download SOA');
    });

    it('gives a joined card the same two buttons (AC-H4.5)', () => {
      const markup = open(joined());
      expect(markup).toContain('aria-label="View details of Bali Trip"');
      expect(markup).toContain('↓ Download SOA');
    });

    it('gives a Needs setup card View details only (AC-H4.6, Q2)', () => {
      const markup = open(unplaced());
      expect(markup).toContain('aria-label="View details of Setup Trip"');
      expect(markup).not.toContain('Download SOA');
    });

    it('gives a practice card neither (AC-H4.7)', () => {
      const markup = open(finished('practice_own'));
      expect(markup).not.toContain('View details');
      expect(markup).not.toContain('Download SOA');
    });

    it('has neither without onViewDetails, as in a guide', () => {
      const markup = page([finished('session_own')], { openSessionId: 'session_own' });
      expect(markup).not.toContain('View details');
    });
  });
});

describe('the onboarding targets after PR 4', () => {
  const source = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');

  it('declares collection-done once on the page and no collection-settled anywhere', () => {
    expect(
      source('../../pages/CollectionPage.tsx').match(/data-tour="collection-done"/g),
    ).toHaveLength(1);
    for (const path of ['../../pages/CollectionPage.tsx', './CollectionCard.tsx']) {
      expect(source(path), path).not.toContain('collection-settled');
    }
  });

  it('gives View details and the card export no target of their own', () => {
    const card = source('./CollectionCard.tsx');
    const row = card.slice(
      card.indexOf('styles.detailsRow'),
      card.indexOf('styles.detailsRow') + 800,
    );
    expect(row).not.toContain('data-tour');
    expect(card.match(/data-tour/g)).toHaveLength(2);
  });
});

describe('the moved-to-History notice (QA B1)', () => {
  const notice = (moved: { id: string; title: string } | { count: number }) =>
    wrap([], createElement(MovedNotice, { moved, onOpenInHistory: () => {} }));

  it('says a session moved, with an Open button that names it', () => {
    const markup = notice({ id: 'session_own', title: 'Bali Trip' });
    expect(markup).toContain('“Bali Trip” is paid in full and has moved to History.');
    expect(markup).toContain('aria-label="Open Bali Trip in History"');
    expect(markup).toContain('id="collection-moved"');
  });

  it('says how many moved when several did, with no button', () => {
    const markup = notice({ count: 3 });
    expect(markup).toContain('3 sessions are settled and have moved to History.');
    expect(markup).not.toContain('<button');
  });

  it('is shown in the empty state too, so the last card to move is still announced', () => {
    const page = readFileSync(resolve(__dirname, '../../pages/CollectionPage.tsx'), 'utf8');
    expect(page.match(/\{movedNotice\}/g)).toHaveLength(2);
    const empty = page.slice(
      page.indexOf('total === 0 ?'),
      page.indexOf('Finish a session and it will show up here'),
    );
    expect(empty).toContain('{movedNotice}');
    // With no card left, focus falls back to the Open button, then to the notice.
    expect(page).toContain("'#collection-moved button'");
  });
});

describe('owner UX picks (2026-11-21)', () => {
  const css = (path: string) => readFileSync(resolve(__dirname, path), 'utf8');
  /** The text of every `@media (max-width: 640px)` block in a stylesheet. */
  const phoneRules = (source: string) =>
    [...source.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join('\n');

  it('makes the answer, share, details and export buttons 44px tall on a phone only', () => {
    const checks: [string, string[]][] = [
      ['./LineRow.module.css', ['.entryActions > button', '.entry [data-undo]']],
      [
        './CollectionCard.module.css',
        ['.otherActions > button', '.withShare > button', '.detailsRow button'],
      ],
      ['../../pages/HistoryDetailPage.module.css', ['.header .actions button']],
    ];
    for (const [path, selectors] of checks) {
      const source = css(path);
      const phone = phoneRules(source);
      for (const selector of selectors) {
        const rule = phone.slice(phone.indexOf(selector));
        expect(phone, `${path} ${selector}`).toContain(selector);
        expect(rule.slice(0, rule.indexOf('}')), `${path} ${selector}`).toContain(
          'min-height: 44px',
        );
      }
      // Nothing outside the phone blocks asks for 44px.
      const outside = source.replace(/@media \(max-width: 640px\) \{[\s\S]*?\n\}/g, '');
      expect(outside, path).not.toContain('min-height: 44px');
    }
  });

  it('gives the History card bin a 44 by 44 hit area on a phone, keeping its label and icon size', () => {
    const source = css('../sessions/SessionCard.module.css');
    const phone = phoneRules(source);
    expect(phone).toContain('.delete {');
    expect(phone).toMatch(/\.delete \{[^}]*min-width: 44px[^}]*min-height: 44px/);
    expect(source).toContain('width: 15px;');
    const markup = wrap([settledOwn()], createElement(HistoryPage, { onOpenSession: () => {} }));
    expect(markup).toContain('aria-label="Delete session Bali Trip"');
  });

  it('makes Share with members the one primary button on History detail', () => {
    const markup = wrap(
      [finished('session_own')],
      createElement(HistoryDetailPage, {
        sessionId: 'session_own',
        back: 'history',
        onBack: () => {},
      }),
    );
    const button = (label: string) => {
      const at = markup.indexOf(label);
      return markup.slice(markup.lastIndexOf('<button', at), at);
    };
    expect(button('↓ Download SOA')).not.toContain('primary');
    expect(button('Share with members')).toContain('primary');
  });

  it('leaves the card details row with default buttons beside no primary', () => {
    const card = css('./CollectionCard.tsx');
    const row = card.slice(
      card.indexOf('styles.detailsRow'),
      card.indexOf('styles.detailsRow') + 900,
    );
    expect(row).not.toContain('variant="primary"');
  });

  it("has one Stop tracking on a joined session's History detail, in the header only", () => {
    const markup = wrap(
      [settledJoined()],
      createElement(HistoryDetailPage, {
        sessionId: 'session_joined',
        back: 'history',
        onBack: () => {},
      }),
    );
    expect(markup).toContain('Your payments');
    expect(markup).toContain('You joined as <strong>Ben</strong>');
    expect(count(markup, 'aria-label="Stop tracking Bali Trip"')).toBe(1);
  });

  it('says Resetting… and dims the old link while a reset runs', () => {
    const dialog = css('./InviteMembersDialog.tsx');
    expect(dialog).toContain("updating ? 'Resetting…' : 'Reset link'");
    expect(dialog).toContain('disabled={busy || updating || link === null}');
    expect(dialog).toContain('aria-busy={updating}');
    expect(css('./InviteMembersDialog.module.css')).toMatch(/\.updating \{[^}]*opacity: 0\.45/);
    // Both ways to reset go through the one function that sets it.
    expect(dialog).toContain('if (alsoReset) await reset();');
    expect(dialog).toContain('setUpdating(true);');
  });
});
