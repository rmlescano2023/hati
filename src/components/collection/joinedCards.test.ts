import { createElement, type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollectionCard } from './CollectionCard';
import { MePicker } from './MePicker';
import { CollectionPage } from '../../pages/CollectionPage';
import { HistoryDetailPage } from '../../pages/HistoryDetailPage';
import { HistoryPage } from '../../pages/HistoryPage';
import { buildCard } from '../../lib/collection';
import { PracticeProfileProvider } from '../../context/ProfileContext';
import { PracticeSessionsProvider } from '../../context/SessionsStoreContext';
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

  it('shows Share alone, in its own row, on a Settled card with no Mark all', () => {
    const settled = finished('session_own', {
      payments: [pay('p1', 'Ben', 'Ana'), pay('p2', 'Carla', 'Ana')],
    });
    // The Settled section is collapsed on the page, so the card is rendered directly, open.
    const card = buildCard(settled, { displayName: 'Ana', nicknames: [] });
    expect(card.bucket).toBe('settled');
    const noop = () => {};
    const markup = wrap(
      [settled],
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
    expect(markup).toContain('Share with members');
    expect(markup).not.toContain(MARK_ALL);
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

describe('History', () => {
  it("marks a joined session 'Shared by' and gives it no bin (AC-11.1)", () => {
    const markup = wrap([joined()], createElement(HistoryPage, { onOpenSession: () => {} }));
    expect(markup).toContain('Shared by Ana');
    expect(markup).not.toContain('Delete session');
  });

  it('keeps the bin on an owned session', () => {
    const markup = wrap(
      [finished('session_own')],
      createElement(HistoryPage, { onOpenSession: () => {} }),
    );
    expect(markup).toContain('Delete session Bali Trip');
    expect(markup).not.toContain('Shared by');
  });

  it('shows a joined session its header line, the SOA and Stop tracking (AC-11.2)', () => {
    const markup = wrap(
      [joined()],
      createElement(HistoryDetailPage, { sessionId: 'session_joined', onBack: () => {} }),
    );
    expect(markup).toContain('Shared by Ana · You joined as Ben');
    expect(markup).toContain('↓ Download SOA');
    expect(markup).toContain('aria-label="Stop tracking Bali Trip"');
    expect(markup).not.toContain('Share with members');
  });

  it('shows the organizer Share with members beside the SOA (AC-1.1)', () => {
    const markup = wrap(
      [finished('session_own')],
      createElement(HistoryDetailPage, { sessionId: 'session_own', onBack: () => {} }),
    );
    expect(markup).toContain('Share with members');
    expect(markup.indexOf('Share with members')).toBeGreaterThan(markup.indexOf('Download SOA'));
    expect(markup).not.toContain('Stop tracking');
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
      './StopTrackingButton.tsx',
      '../layout/SignedOutScreen.tsx',
      './LineRow.tsx',
    ]) {
      expect(source(path), path).not.toContain('data-tour');
    }
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
