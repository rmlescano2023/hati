import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ItemModeFields } from '../home/ItemModeFields';
import { PayorModeFields } from '../home/PayorModeFields';
import { ClearableInput } from './ClearableInput';

const render = (props: Partial<Parameters<typeof ClearableInput>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ClearableInput, {
      value: '',
      clearLabel: 'Clear item name',
      onChange: () => {},
      ...props,
    }),
  );

describe('ClearableInput', () => {
  it('renders no button and no data-filled for an empty box', () => {
    const html = render({ value: '' });
    expect(html).not.toContain('<button');
    expect(html).not.toContain('data-filled');
  });

  it('renders the button for text, spaces only and a typed 0', () => {
    for (const value of ['D', '   ', '0']) {
      const html = render({ value });
      expect(html).toContain('<button');
      expect(html).toContain('data-filled="true"');
    }
  });

  it('gives the button type, tabindex and aria-label, and no text', () => {
    const html = render({ value: 'D', clearLabel: "Clear Ana's order 1 name" });
    const button = html.match(/<button[^>]*>(.*?)<\/button>/);
    expect(button).not.toBeNull();
    expect(button![0]).toContain('type="button"');
    expect(button![0]).toContain('tabindex="-1"');
    expect(button![0]).toContain('aria-label="Clear Ana&#x27;s order 1 name"');
    expect(button![1].replace(/<[^>]*>/g, '')).toBe('');
  });

  it('renders no button when disabled or read-only, even with text', () => {
    expect(render({ value: 'D', disabled: true })).not.toContain('<button');
    expect(render({ value: 'D', readOnly: true })).not.toContain('<button');
  });

  it('passes the input attributes through unchanged', () => {
    const html = render({
      id: 'item-price',
      type: 'number',
      min: '0',
      step: '0.01',
      maxLength: 40,
      placeholder: '0.00',
      'aria-label': 'Price',
    });
    const input = html.match(/<input[^>]*>/)![0];
    for (const attr of [
      'id="item-price"',
      'type="number"',
      'min="0"',
      'step="0.01"',
      'maxLength="40"',
      'placeholder="0.00"',
      'aria-label="Price"',
    ]) {
      expect(input).toContain(attr);
    }
  });
});

/* The Expenses form's props-only components, which need no context to render. */
const clearLabels = (html: string) =>
  [...html.matchAll(/<button[^>]*aria-label="([^"]*)"/g)].map((m) => m[1].replace(/&#x27;/g, "'"));

const handlers = {
  setName: () => {},
  setPrice: () => {},
  toggleAll: () => {},
  toggleOwner: () => {},
  setTotalAmount: () => {},
  setLine: () => {},
  addLine: () => {},
  removeLine: () => {},
  fillRemainder: () => {},
};
const derived = { picked: [], enteredTotal: 0, blankCount: 0, remainder: 0, missingPrice: null };

describe('ClearableInput in the Expenses form', () => {
  it('shows only the filled Item Name box on Equal Split', () => {
    const html = renderToStaticMarkup(
      createElement(ItemModeFields, {
        members: ['Ana'],
        draft: {
          mode: 'equal',
          name: 'Dinner',
          price: '',
          owners: {},
          allSelected: false,
          totalAmount: '',
          lines: {},
        },
        handlers,
        derived,
      }),
    );
    const labels = clearLabels(html);
    expect(labels.filter((l) => l.startsWith('Clear'))).toEqual(['Clear item name']);
  });

  it("clears Ana's first order only, and leaves the Remove names alone", () => {
    const html = renderToStaticMarkup(
      createElement(ItemModeFields, {
        members: ['Ana'],
        draft: {
          mode: 'custom',
          name: '',
          price: '',
          owners: { Ana: true },
          allSelected: true,
          totalAmount: '',
          lines: {
            Ana: [
              { key: 'a', name: 'Pasta', price: '300' },
              { key: 'b', name: '', price: '' },
            ],
          },
        },
        handlers,
        derived: { ...derived, picked: ['Ana'] },
      }),
    );
    const labels = clearLabels(html);
    expect(labels.filter((l) => l.startsWith('Clear'))).toEqual([
      "Clear Ana's order 1 name",
      "Clear Ana's order 1 price",
    ]);
    expect(labels.filter((l) => l.startsWith('Remove'))).toEqual([
      "Remove Ana's order Pasta",
      "Remove Ana's order",
    ]);
  });

  it('shows a clear only on the contribution that has an amount', () => {
    const html = renderToStaticMarkup(
      createElement(PayorModeFields, {
        members: ['Ana', 'Ben'],
        payorMode: 'multiple',
        onPayorModeChange: () => {},
        singlePayor: '',
        onSinglePayorChange: () => {},
        contributions: { Ana: '600', Ben: '' },
        onContributionChange: () => {},
        itemTotal: 1000,
        contributed: 600,
      }),
    );
    expect(clearLabels(html)).toEqual(["Clear Ana's contribution"]);
  });
});
