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

describe('the "?" button (tab-guides AC-TG1.1, AC-TG1.2)', () => {
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

  const render = (tab: SessionTabId, onHelp?: () => void) =>
    renderToStaticMarkup(
      createElement(PracticeSessionsProvider, {
        seed: [draft],
        children: createElement(PracticeProfileProvider, {
          children: createElement(SessionWorkspace, {
            sessionId: draft.id,
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
    expect(markup).toContain('aria-label="How this works: the Expenses tab"');
    expect(markup).toContain('id="workspace-help"');
  });

  it('is absent on Expenses without onHelp', () => {
    const markup = render('expenses');
    expect(markup).not.toContain('How this works');
    expect(markup).not.toContain('workspace-help');
  });

  it('is absent on Breakdown even with onHelp', () => {
    const markup = render('breakdown', noop);
    expect(markup).not.toContain('How this works');
    expect(markup).not.toContain('workspace-help');
  });
});
