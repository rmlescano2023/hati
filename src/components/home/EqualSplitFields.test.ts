import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EqualSplitFields } from './EqualSplitFields';

const noop = () => {};
const HINT = 'Need a discount for one person? Switch to Custom Amounts and add a shared order.';

const render = (members: string[], selectedCount: number) =>
  renderToStaticMarkup(
    createElement(EqualSplitFields, {
      members,
      price: '',
      owners: {},
      allSelected: false,
      onToggleAll: noop,
      onToggleOwner: noop,
      selectedCount,
    }),
  );

describe('Equal Split hint toward Custom Amounts (item 8)', () => {
  it('shows once at least one member is picked', () => {
    expect(render(['Ana', 'Ben'], 1)).toContain(HINT);
    expect(render(['Ana', 'Ben'], 2)).toContain(HINT);
  });

  it('is absent while nobody is picked', () => {
    expect(render(['Ana', 'Ben'], 0)).not.toContain(HINT);
  });

  it('leaves only "Add group members first." when there are no members', () => {
    const html = render([], 0);
    expect(html).toContain('Add group members first.');
    expect(html).not.toContain(HINT);
  });
});
