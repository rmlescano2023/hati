import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CustomAmountFields } from './CustomAmountFields';
import styles from './CustomAmountFields.module.css';
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

const render = (
  bill: BillDraft,
  picked = members,
  typed = lines,
  totalAmount = '',
  totalFollows = false,
) =>
  renderToStaticMarkup(
    createElement(CustomAmountFields, {
      members,
      totalAmount,
      totalFollows,
      onTotalAmountChange: noop,
      onFillRemainder: noop,
      owners: {},
      allSelected: true,
      onToggleAll: noop,
      onToggleOwner: noop,
      picked,
      lines: typed,
      onLineChange: noop,
      onAddLine: noop,
      onRemoveLine: noop,
      enteredTotal: readBillDraft(picked, typed, bill).entered,
      blankCount: 0,
      remainder: 0,
      missingPrice: null,
      bill,
      billView: readBillDraft(picked, typed, bill),
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
    expect(html).not.toContain('Shared items');
  });

  it('offers + Add shared item once someone is picked, and not before (AC-CA1.1)', () => {
    expect(render(EMPTY_BILL_DRAFT)).toContain('+ Add shared item');
    expect(render(EMPTY_BILL_DRAFT, [])).not.toContain('+ Add shared item');
  });
});

describe('Custom Amounts with a shared item', () => {
  const html = render(gyoza);

  it("shows each member's share beside their name, readable to a screen reader (AC-CA4.1)", () => {
    expect(html).toContain("Ana's share </span>₱865.00");
    expect(html).toContain("Ben's share </span>₱895.00");
  });

  it('names the section, its boxes, its buttons and its picker (AC-CA11.4)', () => {
    expect(html).toContain('aria-labelledby="custom-shared-label"');
    expect(html).toContain('>Shared items</span>');
    const names = labels(html);
    for (const name of [
      'Shared item 1 name',
      'Shared item 1 price',
      'Remove shared item Gyoza',
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
    expect(names).toContain('Remove shared item');
    expect(names).toContain('Who shares shared item 1');
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

describe('Custom Amounts with a discount and a charge', () => {
  const line = (name: string, price: string) => ({ key: name, name, price });
  const dinnerLines: LinesDraft = {
    Ana: [line('Sisig', '280'), line('Rice', '100')],
    Ben: [line('Kare-kare', '450')],
    Cy: [line('Bulalo', '520')],
    Dan: [line('Adobo', '295')],
    Eve: [line('Pancit', '180'), line('Halo-halo', '230')],
    Fay: [line('Sinigang', '400.5')],
  };
  const six = ['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay'];
  const bill: BillDraft = {
    shared: [],
    discounts: [{ key: 'd', name: 'PWD', amount: '300', everyone: false, members: { Cy: true } }],
    charges: [{ key: 'c', name: 'Service charge', amount: '245.55' }],
  };
  const html = render(bill, six, dinnerLines);

  it('draws both sections with their helper lines (AC-CA2.1, AC-CA3.1)', () => {
    expect(html).toContain('>Discounts</span>');
    expect(html).toContain('Comes off the share of the people ticked.');
    expect(html).toContain('>Charges</span>');
    expect(html).toContain('Split equally across everyone in this item.');
  });

  it('names their boxes and buttons (AC-CA11.4)', () => {
    const names = labels(html);
    for (const name of [
      'Discount 1 name',
      'Discount 1 amount',
      'Clear discount 1 amount',
      'Remove discount PWD',
      'Who gets PWD',
      'Charge 1 name',
      'Charge 1 amount',
      'Remove charge Service charge',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('gives a charge no picker', () => {
    expect(
      labels(html).some((n) => n.startsWith('Who shares') || n.includes('Who gets Service')),
    ).toBe(false);
    expect(html.match(/role="group"/g)).toHaveLength(3);
  });

  it('shows Subtotal, Discounts, Charges and Entered, each on a line (AC-CA4.3)', () => {
    for (const text of ['Subtotal', '₱2,455.50', 'Discounts', '−₱300.00', 'Charges', '₱245.55']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('₱2,401.05');
    expect(html).toContain("Cy's share </span>₱260.93");
  });

  it('shows Entered alone when there is no discount or charge (AC-CA4.4)', () => {
    const plain = render({ ...EMPTY_BILL_DRAFT, shared: gyoza.shared });
    expect(plain).not.toContain('Subtotal');
    expect(plain).toContain('Entered');
  });

  it('shows the floor hint, and the negative share as a minus (AC-CA2.6)', () => {
    const over: BillDraft = {
      ...bill,
      discounts: [{ ...bill.discounts[0], amount: '900' }],
      charges: [],
    };
    const view = render(over, six, dinnerLines);
    expect(view).toContain("Cy's share would be −₱380.00. Lower the discount or add Cy's order.");
    expect(view).toContain("Cy's share </span>−₱380.00");
  });

  it('mutes Entered, and its "of" figure, while the floor hint blocks Add Item (item 2)', () => {
    const over: BillDraft = {
      ...bill,
      discounts: [{ ...bill.discounts[0], amount: '900' }],
      charges: [],
    };
    // A typed total that doesn't match, so the "of ₱Y" figure shows as well.
    const view = render(over, six, dinnerLines, '2400');
    expect(view).toContain(`class="${styles.sum} ${styles.held}"`);
    expect(view).toContain(`<span class="${styles.held}">of ₱2,400.00</span>`);
    expect(view).not.toContain(`class="${styles.sum} ${styles.mismatch}"`);
    expect(view).not.toContain(`<span class="${styles.mismatch}">of`);
  });

  it('keeps the warning colour on a mismatch when no floor hint shows (item 2)', () => {
    const view = render(bill, six, dinnerLines, '2400');
    expect(view).toContain(`class="${styles.sum} ${styles.mismatch}"`);
    expect(view).toContain(`<span class="${styles.mismatch}">of ₱2,400.00</span>`);
    expect(view).not.toContain(styles.held);
  });
});

describe('Total Amount following Entered (bill-ux-polish-2 item 2)', () => {
  const NOTE = 'Matches Entered. Type a total to use Fill Remainder.';
  const NO_TOTAL = 'Enter a total amount and leave at least one member blank';

  it('says so under the box, ties it to the box, and explains Fill Remainder', () => {
    const html = render(EMPTY_BILL_DRAFT, members, lines, '1470.00', true);
    expect(html).toContain(`<p id="custom-total-follows" class="${styles.helper}">${NOTE}</p>`);
    expect(html).toContain('aria-describedby="custom-total-follows"');
    expect(html).toContain(`title="${NOTE}"`);
  });

  it('shows nothing once the user types or presses the reset', () => {
    const html = render(EMPTY_BILL_DRAFT, members, lines, '1470.00', false);
    expect(html).not.toContain('custom-total-follows');
    expect(html).not.toContain('aria-describedby');
    expect(html).not.toContain(NOTE);
    expect(html).toContain(`title="${NO_TOTAL}"`);
  });
});

describe('Receipt rows name boxes carry an id (bill-ux-polish-2 item 5)', () => {
  it('numbers each box by its section and position', () => {
    expect(render(gyoza)).toContain('id="custom-shared-1-name"');
    const discount: BillDraft = {
      ...EMPTY_BILL_DRAFT,
      discounts: [{ key: 'd', name: '', amount: '', everyone: false, members: {} }],
    };
    expect(render(discount)).toContain('id="custom-discounts-1-name"');
  });
});
