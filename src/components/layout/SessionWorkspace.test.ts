import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EDIT_ITEM_MESSAGE, SessionWorkspace } from './SessionWorkspace';
import { PracticeSessionsProvider } from '../../context/SessionsStoreContext';
import { PracticeProfileProvider } from '../../context/ProfileContext';
import type { SessionTabId } from './SessionTabs';
import type { Session } from '../../types';

describe('the "Edit item" prompt (bill-ux-polish-2 item 6)', () => {
  it('tells the user where Cancel leads', () => {
    expect(EDIT_ITEM_MESSAGE).toBe(
      'It opens on the Expenses tab with its date and Paid By. Breakdown keeps it as it is until you press Save Edits. Cancel brings you back to Breakdown.',
    );
  });
});

describe('the "Need help?" link (tab-guides AC-TG1.1, AC-TG1.2)', () => {
  const draft: Session = {
    id: 'practice_test',
    status: 'draft',
    createdAt: '2026-11-16T12:00:00.000Z',
    closedAt: null,
    members: ['Ana'],
    records: [],
    name: 'Beach trip',
    activityAt: null,
    me: null,
    finishedWithCollection: false,
    payments: [],
  };
  const noop = () => {};

  const render = (tab: SessionTabId, onHelp?: () => void, session: Session = draft) =>
    renderToStaticMarkup(
      createElement(PracticeSessionsProvider, {
        seed: [session],
        children: createElement(PracticeProfileProvider, {
          children: createElement(SessionWorkspace, {
            sessionId: session.id,
            paidByPicks: new Map(),
            tab,
            onTabChange: noop,
            onBack: noop,
            onClosed: noop,
            onHelp,
          }),
        }),
      }),
    );

  it('shows on Expenses when a guide can start, named for the tab', () => {
    const markup = render('expenses', noop);
    expect(markup).toContain('aria-label="Need help? See how to log expenses"');
    expect(markup).toContain('id="workspace-help"');
  });

  it('puts the text before the icon, under the date, inside the title stack', () => {
    const markup = render('expenses', noop);
    const date = markup.indexOf('Started');
    const help = markup.indexOf('id="workspace-help"');
    expect(date).toBeGreaterThan(-1);
    expect(help).toBeGreaterThan(date);
    expect(markup.indexOf('Need help?', help)).toBeLessThan(markup.indexOf('<svg', help));
  });

  it('is absent on Expenses without onHelp', () => {
    const markup = render('expenses');
    expect(markup).not.toContain('Need help?');
    expect(markup).not.toContain('workspace-help');
  });

  it('is absent on Breakdown even with onHelp', () => {
    const markup = render('breakdown', noop);
    expect(markup).not.toContain('Need help?');
    expect(markup).not.toContain('workspace-help');
  });
});

describe('the empty-session hint in Group Members', () => {
  const empty: Session = {
    id: 'practice_empty',
    status: 'draft',
    createdAt: '2026-11-16T12:00:00.000Z',
    closedAt: null,
    members: [],
    records: [],
    name: null,
    activityAt: null,
    me: null,
    finishedWithCollection: false,
    payments: [],
  };
  const noop = () => {};

  const render = (session: Session, onHelp?: () => void) =>
    renderToStaticMarkup(
      createElement(PracticeSessionsProvider, {
        seed: [session],
        children: createElement(PracticeProfileProvider, {
          children: createElement(SessionWorkspace, {
            sessionId: session.id,
            paidByPicks: new Map(),
            tab: 'expenses',
            onTabChange: noop,
            onBack: noop,
            onClosed: noop,
            onHelp,
          }),
        }),
      }),
    );

  it('offers the guide under the empty state', () => {
    const markup = render(empty, noop);
    expect(markup).toContain('No members yet. Add some above.');
    expect(markup).toContain('New to Hati?');
    expect(markup).toContain('See how to log expenses');
  });

  it('is absent while the guide cannot start, as during the first-run tour', () => {
    expect(render(empty)).not.toContain('New to Hati?');
  });

  it('is absent once the session has members', () => {
    expect(render({ ...empty, members: ['Ana'] }, noop)).not.toContain('New to Hati?');
  });
});
