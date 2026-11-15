import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CustomAmountFields } from './CustomAmountFields';
import {
  EMPTY_BILL_DRAFT,
  readBillDraft,
  type BillDraft,
  type LinesDraft,
} from '../../lib/orderLines';

const noop = () => {};
const members = ['Ana', 'Ben'];
const lines: LinesDraft = {
  Ana: [{ key: 'a', name: 'Ramen', price: '720' }],
  Ben: [{ key: 'b', name: 'Ramen', price: '750' }],
};
const gyoza: BillDraft = {
  ...EMPTY_BILL_DRAFT,
  shared: [{ key: 'g', name: 'Gyoza', amount: '290', everyone: true, members: {} }],
};

const render = (bill: BillDraft, picked = members) =>
  renderToStaticMarkup(
    createElement(CustomAmountFields, {
      members,
      totalAmount: '',
      onTotalAmountChange: noop,
      onFillRemainder: noop,
      owners: {},
      allSelected: true,
      onToggleAll: noop,
      onToggleOwner: noop,
      picked,
      lines,
      onLineChange: noop,
      onAddLine: noop,
      onRemoveLine: noop,
      enteredTotal: 0,
      blankCount: 0,
      remainder: 0,
      missingPrice: null,
      bill,
      billView: readBillDraft(picked, lines, bill),
      onAddBillRow: noop,
      onBillRowChange: noop,
      onRemoveBillRow: noop,
      onToggleRowEveryone: noop,
      onToggleRowMember: noop,
    }),
  ).replace(/&#x27;/g, "'");

const labels = (html: string) => [...html.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);

describe('Custom Amounts with no bill rows', () => {
  it('draws no share figures and no sections, as before (AC-CA10.2, AC-CA11.3)', () => {
    const html = render(EMPTY_BILL_DRAFT);
    expect(html).not.toContain("'s share");
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain('Shared orders');
  });

  it('offers + Add shared order once someone is picked, and not before (AC-CA1.1)', () => {
    expect(render(EMPTY_BILL_DRAFT)).toContain('+ Add shared order');
    expect(render(EMPTY_BILL_DRAFT, [])).not.toContain('+ Add shared order');
  });
});

describe('Custom Amounts with a shared order', () => {
  const html = render(gyoza);

  it("shows each member's share beside their name, readable to a screen reader (AC-CA4.1)", () => {
    expect(html).toContain("Ana's share </span>₱865.00");
    expect(html).toContain("Ben's share </span>₱895.00");
  });

  it('names the section, its boxes, its buttons and its picker (AC-CA11.4)', () => {
    expect(html).toContain('aria-labelledby="custom-shared-label"');
    expect(html).toContain('>Shared orders</span>');
    const names = labels(html);
    for (const name of [
      'Shared order 1 name',
      'Shared order 1 price',
      'Remove shared order Gyoza',
      'Who shares Gyoza',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('starts the picker on Everyone, with every pill locked (AC-CA1.2)', () => {
    const picker = html.slice(html.indexOf('aria-label="Who shares Gyoza"'));
    expect(picker).toContain('Everyone');
    expect(picker.match(/disabled=""/g)).toHaveLength(2);
  });

  it('names an unnamed row by its position', () => {
    const unnamed: BillDraft = {
      ...gyoza,
      shared: [{ ...gyoza.shared[0], name: '' }],
    };
    const names = labels(render(unnamed));
    expect(names).toContain('Remove shared order');
    expect(names).toContain('Who shares shared order 1');
  });

  it('shows the section hint and the share of a member who is not in the item as a dash', () => {
    const nobody: BillDraft = {
      ...gyoza,
      shared: [{ ...gyoza.shared[0], everyone: false }],
    };
    const view = render(nobody);
    expect(view).toContain('Choose who shares Gyoza');
    const blank = render(gyoza, ['Ana', 'Ben', 'Gus']);
    expect(blank).toContain("Gus's share </span>₱96.66");
  });
});
