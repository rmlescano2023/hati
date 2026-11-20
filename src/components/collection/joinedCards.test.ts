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
import type { Session } from '../../types';

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

  it('shows the lines and says the organizer records the payments (AC-10.4)', () => {
    expect(open).toContain('Ana records the payments on this session.');
    // Ben's one line: he owes Ana a third of the dinner, and nothing has been paid yet.
    expect(open).toContain('₱100.00');
    expect(open).toContain('Unpaid');
  });

  it('offers nothing to record, mark, undo, change or invite (BR-V6, BR-V7)', () => {
    for (const absent of [
      'Record payment',
      'I paid',
      'Mark fully paid',
      'Undo',
      'Mark all as paid',
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

  it('shows no Share on History detail once the session is settled (round 5)', () => {
    const settled = finished('session_own', {
      payments: [pay('p1', 'Ben', 'Ana'), pay('p2', 'Carla', 'Ana')],
    });
    const markup = wrap(
      [settled],
      createElement(HistoryDetailPage, { sessionId: 'session_own', onBack: () => {} }),
    );
    expect(markup).toContain('Download SOA');
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
});
