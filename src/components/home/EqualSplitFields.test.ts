import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EqualSplitFields } from './EqualSplitFields';

const noop = () => {};
const HINT = 'Need a discount for one person? Switch to Custom Amounts and add a shared item.';

const propsFor = (members: string[], selectedCount: number, onSwitchForDiscount = noop) => ({
  members,
  price: '',
  owners: {},
  allSelected: false,
  onToggleAll: noop,
  onToggleOwner: noop,
  selectedCount,
  onSwitchForDiscount,
});

const render = (members: string[], selectedCount: number) =>
  renderToStaticMarkup(createElement(EqualSplitFields, propsFor(members, selectedCount)));

/** The first element in the tree whose className contains `wanted`. */
function findByClass(
  node: ReactNode,
  wanted: string,
): ReactElement<{ onClick?: () => void }> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findByClass(n, wanted);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<{
    className?: string;
    children?: ReactNode;
    onClick?: () => void;
  }>;
  if (el.props.className?.includes(wanted)) return el;
  return findByClass(el.props.children, wanted);
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '');

describe('Equal Split hint toward Custom Amounts (item 8)', () => {
  it('shows once at least one member is picked', () => {
    expect(stripTags(render(['Ana', 'Ben'], 1))).toContain(HINT);
    expect(stripTags(render(['Ana', 'Ben'], 2))).toContain(HINT);
  });

  it('is absent while nobody is picked', () => {
    expect(stripTags(render(['Ana', 'Ben'], 0))).not.toContain(HINT);
  });

  it('leaves only "Add group members first." when there are no members', () => {
    const html = render([], 0);
    expect(html).toContain('Add group members first.');
    expect(stripTags(html)).not.toContain(HINT);
  });
});

describe('Equal Split hint button (bill-ux-polish-2 item 5)', () => {
  const LABEL = 'Switch to Custom Amounts and add a shared item.';

  it('is a link-styled button named by its visible text', () => {
    const html = render(['Ana', 'Ben'], 1);
    const button = html.match(/<button[^>]*>.*?<\/button>/)?.[0] ?? '';
    expect(button).toContain('type="button"');
    expect(button).toContain('link-action');
    expect(button).not.toContain('aria-label');
    expect(stripTags(button)).toBe(LABEL);
  });

  it('calls onSwitchForDiscount when pressed', () => {
    const spy = vi.fn();
    const tree = EqualSplitFields(propsFor(['Ana', 'Ben'], 1, spy));
    const button = findByClass(tree, 'link-action');
    expect(button).not.toBeNull();
    button?.props.onClick?.();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
