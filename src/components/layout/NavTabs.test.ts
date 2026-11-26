import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NavTabs } from './NavTabs';

const render = (counts?: Record<string, number>) =>
  renderToStaticMarkup(
    createElement(NavTabs, {
      active: 'home',
      onChange: () => {},
      counts: counts as never,
    }),
  ).replace(/<!-- -->/g, '');

const count = (text: string, part: string) => text.split(part).length - 1;

/** The Collection tab's button, from its opening tag to its closing one. */
const collectionTab = (markup: string) => {
  const start = markup.indexOf('data-tour="nav-collection"');
  return markup.slice(markup.lastIndexOf('<button', start), markup.indexOf('</button>', start));
};

describe('NavTabs counts (round 3)', () => {
  it('shows the count inside the Collection tab, read with its meaning', () => {
    const tab = collectionTab(render({ collection: 2 }));
    expect(tab).toContain('aria-hidden="true">2<');
    expect(tab).toContain(', 2 payments to confirm');
    expect(tab).toContain('Collection');
  });

  it('caps a large count at 99+', () => {
    expect(collectionTab(render({ collection: 120 }))).toContain('>99+<');
  });

  it('reads a single claim in the singular', () => {
    expect(collectionTab(render({ collection: 1 }))).toContain(', 1 payment to confirm');
  });

  it('leaves each nav target on its own button, once, with nav-collection on the tab holding the count', () => {
    const markup = render({ collection: 2 });
    for (const id of ['nav-home', 'nav-collection', 'nav-history']) {
      expect(count(markup, `data-tour="${id}"`)).toBe(1);
    }
    expect(collectionTab(markup)).toContain('data-tour="nav-collection"');
  });

  it("is exactly today's markup with no counts, or a zero count", () => {
    const plain = render();
    expect(render({ collection: 0 })).toBe(plain);
    expect(plain).not.toContain('to confirm');
  });
});
