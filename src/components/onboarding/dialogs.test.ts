import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuideOfferDialog } from './GuideOfferDialog';
import { TutorialsDialog } from './TutorialsDialog';

const noop = () => {};
// React escapes apostrophes and quotes in markup; the copy is compared as typed.
const text = (markup: string) => markup.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

describe('TutorialsDialog (AC-TG5.2)', () => {
  const markup = text(
    renderToStaticMarkup(createElement(TutorialsDialog, { onChoose: noop, onClose: noop })),
  );

  it('lists App overview, Logging expenses and Tracking payments, in that order', () => {
    const at = ['App overview', 'Logging expenses', 'Tracking payments'].map((l) =>
      markup.indexOf(l),
    );
    expect(at.every((i) => i > -1)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('describes each one', () => {
    expect(markup).toContain("A one-minute tour of Hati's screens.");
    expect(markup).toContain(
      'Adding people and purchases, including receipts with shared dishes and discounts.',
    );
    expect(markup).toContain("Recording who has paid you, and what you've paid.");
  });
});

describe('GuideOfferDialog (AC-TG9.1, AC-TG10.1)', () => {
  const render = (guide: 'expenses' | 'collection') =>
    text(renderToStaticMarkup(createElement(GuideOfferDialog, { guide, onAnswer: noop })));

  it('offers the Expenses guide', () => {
    const markup = render('expenses');
    expect(markup).toContain('Learn how to log a purchase?');
    expect(markup).toContain(
      'A quick practice run, about two minutes, with made-up people. Nothing you do in it is saved. You can find it any time under “Need help?” on this tab, or Tutorials in your account menu.',
    );
  });

  it('offers the Collection guide', () => {
    const markup = render('collection');
    expect(markup).toContain('Learn how to track payments?');
    expect(markup).toContain(
      'A quick practice run with made-up sessions: who owes you, recording payments, and undoing one. Nothing you do in it is saved. You can find it any time under “Need help?” on this page, or Tutorials in your account menu.',
    );
  });

  it.each(['expenses', 'collection'] as const)('puts Not now before Show me for %s', (guide) => {
    const markup = render(guide);
    expect(markup.indexOf('Not now')).toBeGreaterThan(-1);
    expect(markup.indexOf('Show me')).toBeGreaterThan(markup.indexOf('Not now'));
  });
});
