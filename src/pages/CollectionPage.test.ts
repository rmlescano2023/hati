import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CollectionPage } from './CollectionPage';
import { collectionScenes } from '../components/onboarding/guides/collectionScenes';
import { PracticeProfileProvider } from '../context/ProfileContext';
import { PracticeSessionsProvider } from '../context/SessionsStoreContext';
import type { Session } from '../types';

const noop = () => {};
const K1 = collectionScenes(new Date(2026, 10, 17, 9, 0)).K1;

const render = (sessions: Session[], onHelp?: () => void) =>
  renderToStaticMarkup(
    createElement(PracticeSessionsProvider, {
      seed: sessions,
      children: createElement(PracticeProfileProvider, {
        children: createElement(CollectionPage, { canAsk: false, onHelp }),
      }),
    }),
  ).replace(/&#x27;/g, "'");

const count = (text: string, part: string) => text.split(part).length - 1;

describe('"Need help?" on Collection (AC-TG8.1)', () => {
  it('sits in the Summary heading\'s row, before the strip, named for the guide', () => {
    const markup = render(K1.sessions, noop);
    expect(count(markup, 'aria-label="Need help? See how to track payments"')).toBe(1);
    expect(count(markup, 'id="collection-help"')).toBe(1);
    const summary = markup.indexOf('Summary');
    const help = markup.indexOf('id="collection-help"');
    expect(summary).toBeGreaterThan(-1);
    expect(help).toBeGreaterThan(summary);
    expect(help).toBeLessThan(markup.indexOf('Owed to you'));
    expect(markup.indexOf('Need help?', help)).toBeLessThan(markup.indexOf('<svg', help));
  });

  it('shows above the empty state too (AC-TG10.5)', () => {
    const markup = render([], noop);
    expect(markup).toContain('Nothing to collect yet');
    expect(count(markup, 'id="collection-help"')).toBe(1);
  });

  it('is absent without onHelp, as inside a practice or during the tour', () => {
    expect(render(K1.sessions)).not.toContain('collection-help');
    expect(render([])).not.toContain('collection-help');
  });
});
