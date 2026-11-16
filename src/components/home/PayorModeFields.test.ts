import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PayorModeFields } from './PayorModeFields';

const noop = () => {};

const render = () =>
  renderToStaticMarkup(
    createElement(PayorModeFields, {
      members: ['Ana', 'Ben'],
      payorMode: 'multiple',
      onPayorModeChange: noop,
      singlePayor: '',
      onSinglePayorChange: noop,
      // Filled, because a clear button is drawn only for a box with something in it.
      contributions: { Ana: '10', Ben: '20' },
      onContributionChange: noop,
      itemTotal: 0,
      contributed: 0,
    }),
  ).replace(/&#x27;/g, "'");

describe('Multiple Payors boxes (item 7)', () => {
  const html = render();

  it('gives each amount box its own name', () => {
    const boxes = [...html.matchAll(/<input[^>]*id="contrib-[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain('aria-label="Ana\'s amount paid"');
    expect(boxes[1]).toContain('aria-label="Ben\'s amount paid"');
  });

  it('keeps the visible labels and the clear buttons as they were', () => {
    expect(html).toContain('<label for="contrib-Ana">Ana</label>');
    expect(html).toContain('<label for="contrib-Ben">Ben</label>');
    expect(html).toContain('aria-label="Clear Ana\'s contribution"');
    expect(html).toContain('aria-label="Clear Ben\'s contribution"');
  });
});
