import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GuideOfferDialog } from './GuideOfferDialog';
import { TutorialsDialog } from './TutorialsDialog';
import { WhatsNewDialog } from './WhatsNewDialog';
import { whatsNewNotes } from '../../lib/whatsNew';

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

describe('WhatsNewDialog (AC-WC1, AC-WC5)', () => {
  const render = (seen: unknown) =>
    text(
      renderToStaticMarkup(
        createElement(WhatsNewDialog, {
          open: true,
          notes: whatsNewNotes(seen),
          onClose: noop,
          onShowMeHow: noop,
        }),
      ),
    );
  const v3 = ['Joined sessions.', "“I've paid.”", 'Collection and History.'];
  const inOrder = (markup: string, parts: string[]) => {
    const at = parts.map((p) => markup.indexOf(p));
    expect(at.every((i) => i > -1)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  };

  it('lists all seven notes for an account that has seen nothing, under real headings (AC-WC1.1)', () => {
    const markup = render(0);
    inOrder(markup, [
      '>Latest</h3>',
      ...v3,
      '>Earlier</h3>',
      'Receipts, item by item.',
      'Guides.',
      '<strong>Collection.</strong>',
      'Your name.',
    ]);
    inOrder(markup, ['Got it', 'Show me how']);
  });

  it('lists the notes after release 1 for an account that saw it (AC-WC1.2)', () => {
    const markup = render(1);
    inOrder(markup, ['>Latest</h3>', ...v3, '>Earlier</h3>', 'Receipts, item by item.', 'Guides.']);
    expect(markup).not.toContain('<strong>Collection.</strong>');
    expect(markup).not.toContain('Your name.');
    inOrder(markup, ['Got it', 'Show me how']);
  });

  it('shows the three current notes with no headings and one button for an account that saw 2 (AC-WC1.3, AC-WC5.5)', () => {
    const markup = render(2);
    expect(markup).not.toContain('<h3');
    expect(markup).not.toContain('Latest');
    expect(markup).not.toContain('Earlier');
    inOrder(markup, v3);
    expect(markup).toContain(
      "Collection now shows only what's still being paid; settled sessions are in History.",
    );
    expect(markup).toContain('Got it');
    expect(markup).not.toContain('Show me how');
  });

  it('adds no tab stop of its own; that appears only while the notes overflow', () => {
    for (const seen of [0, 1, 2]) expect(render(seen)).not.toContain('tabindex');
  });

  it('scrolls only the message of a scrollable dialog, and leaves every other message alone (BR-WC9)', () => {
    const css = readFileSync(resolve(__dirname, './OnboardingDialog.module.css'), 'utf8');
    const block = (selector: string) =>
      css.match(new RegExp(`^${selector.replace('.', '\\.')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
    expect(block('.scrollable .message')).toContain('overflow-y: auto');
    expect(block('.message')).not.toContain('overflow');
  });
});
