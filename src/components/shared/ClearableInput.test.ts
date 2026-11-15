import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
