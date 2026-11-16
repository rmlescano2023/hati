import { readFileSync } from 'node:fs';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OwnerGrid } from './OwnerGrid';
import { OwnerPill } from './OwnerPill';

type Children = { children?: ReactNode };

/** The first element of the given type in a rendered tree. */
function findTag(node: ReactNode, tag: string): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findTag(n, tag);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<Children>;
  if (el.type === tag) return el as ReactElement<Record<string, unknown>>;
  return findTag(el.props.children, tag);
}

describe('OwnerPill keyboard reach (app-fixes item 1)', () => {
  it('keeps the checkbox in the tab order, hidden by the shared class', () => {
    const onChange = vi.fn();
    const input = findTag(OwnerPill({ label: 'Ana', checked: false, onChange }), 'input');
    expect(input?.props).toMatchObject({
      type: 'checkbox',
      className: 'visually-hidden',
      disabled: false,
      onChange,
    });
    expect(input?.props).not.toHaveProperty('tabIndex');
    expect(input?.props).not.toHaveProperty('hidden');
    // Space on a focused native checkbox fires this.
    (input?.props.onChange as () => void)();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('disables a locked pill and gives it no handler', () => {
    const input = findTag(
      OwnerPill({ label: 'Ana', checked: true, disabled: true, onChange: vi.fn() }),
      'input',
    );
    expect(input?.props.disabled).toBe(true);
    expect(input?.props.onChange).toBeUndefined();
  });

  it('locks the member pills, and not All Members, while All Members is ticked', () => {
    const grid = (allSelected: boolean) =>
      renderToStaticMarkup(
        createElement(OwnerGrid, {
          members: ['Ana', 'Ben'],
          selected: {},
          allSelected,
          onToggleAll: () => {},
          onToggle: () => {},
        }),
      );
    const boxes = (html: string) => [...html.matchAll(/<input[^>]*>/g)].map((m) => m[0]);

    const locked = boxes(grid(true));
    expect(locked).toHaveLength(3);
    locked.forEach((box) => {
      expect(box).toContain('type="checkbox"');
      expect(box).toContain('class="visually-hidden"');
    });
    expect(locked[0]).not.toContain('disabled');
    expect(locked[1]).toContain('disabled');
    expect(locked[2]).toContain('disabled');

    boxes(grid(false)).forEach((box) => expect(box).not.toContain('disabled'));
  });

  it('shows a focus ring on the pill instead of hiding the checkbox with display: none', () => {
    const css = readFileSync(new URL('./OwnerPill.module.css', import.meta.url), 'utf8');
    expect(css).not.toContain('display: none');
    expect(css).toMatch(/\.pill:has\(input:focus-visible\)\s*\{[^}]*outline:/);
  });
});
