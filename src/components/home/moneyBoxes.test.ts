import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ClearableInput } from '../shared/ClearableInput';
import { CustomAmountFields } from './CustomAmountFields';
import {
  ItemModeFields,
  type ItemDraft,
  type ItemDraftDerived,
  type ItemDraftHandlers,
} from './ItemModeFields';
import { PayorModeFields } from './PayorModeFields';
import { readBillDraft, type BillDraft, type LinesDraft } from '../../lib/orderLines';

type Box = ReactElement<{
  type?: string;
  id?: string;
  'aria-label'?: string;
  onChange: (e: { target: { value: string } }) => void;
}>;

/** Every number box in a rendered tree, in screen order. Components are not expanded. */
function numberBoxes(node: ReactNode): Box[] {
  if (Array.isArray(node)) return node.flatMap(numberBoxes);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ type?: string; children?: ReactNode }>;
  const own = el.type === ClearableInput && el.props.type === 'number' ? [el as Box] : [];
  return [...own, ...numberBoxes(el.props.children)];
}

const typed = (box: Box, value: string) => box.props.onChange({ target: { value } });

const members = ['Ana', 'Ben'];
const lines: LinesDraft = {
  Ana: [{ key: 'a', name: 'Ramen', price: '720' }],
  Ben: [{ key: 'b', name: 'Ramen', price: '750' }],
};
const bill: BillDraft = {
  shared: [{ key: 's', name: 'Gyoza', amount: '290', everyone: true, members: {} }],
  discounts: [{ key: 'd', name: 'PWD', amount: '50', everyone: false, members: { Ana: true } }],
  charges: [{ key: 'c', name: 'Service', amount: '40' }],
};

describe('every money box holds its text to two decimals (app-fixes item 2)', () => {
  it('Equal Split Total Price', () => {
    const handlers = { setPrice: vi.fn() } as unknown as ItemDraftHandlers;
    const draft = { mode: 'equal', name: '', price: '' } as unknown as ItemDraft;
    const derived = { picked: [] } as unknown as ItemDraftDerived;
    const boxes = numberBoxes(ItemModeFields({ members, draft, handlers, derived }));
    expect(boxes).toHaveLength(1);
    typed(boxes[0], '800.009');
    expect(handlers.setPrice).toHaveBeenLastCalledWith('800.00');
    typed(boxes[0], '1.');
    expect(handlers.setPrice).toHaveBeenLastCalledWith('1.');
    typed(boxes[0], '');
    expect(handlers.setPrice).toHaveBeenLastCalledWith('');
  });

  it('Custom Amounts: Total Amount, each order line and each receipt row', () => {
    const onTotalAmountChange = vi.fn();
    const onLineChange = vi.fn();
    const onBillRowChange = vi.fn();
    const noop = () => {};
    const view = readBillDraft(members, lines, bill);
    const boxes = numberBoxes(
      CustomAmountFields({
        members,
        totalAmount: '',
        totalFollows: false,
        onTotalAmountChange,
        onFillRemainder: noop,
        owners: {},
        allSelected: true,
        onToggleAll: noop,
        onToggleOwner: noop,
        picked: members,
        lines,
        onLineChange,
        onAddLine: noop,
        onRemoveLine: noop,
        enteredTotal: view.entered,
        blankCount: 0,
        remainder: 0,
        missingPrice: null,
        bill,
        billView: view,
        onAddBillRow: noop,
        onBillRowChange,
        onRemoveBillRow: noop,
        onToggleRowEveryone: noop,
        onToggleRowMember: noop,
      }),
    );
    // Total Amount, 2 line prices, then a shared order, a discount and a charge.
    expect(boxes).toHaveLength(6);
    const [total, ana, ben, shared, discount, charge] = boxes;

    typed(total, '800.009');
    expect(onTotalAmountChange).toHaveBeenLastCalledWith('800.00');
    typed(total, '1.');
    expect(onTotalAmountChange).toHaveBeenLastCalledWith('1.');
    typed(total, '');
    expect(onTotalAmountChange).toHaveBeenLastCalledWith('');

    for (const [box, member] of [
      [ana, 'Ana'],
      [ben, 'Ben'],
    ] as const) {
      typed(box, '800.009');
      expect(onLineChange).toHaveBeenLastCalledWith(member, 0, { price: '800.00' });
      typed(box, '1.');
      expect(onLineChange).toHaveBeenLastCalledWith(member, 0, { price: '1.' });
      typed(box, '');
      expect(onLineChange).toHaveBeenLastCalledWith(member, 0, { price: '' });
    }

    for (const [box, section] of [
      [shared, 'shared'],
      [discount, 'discounts'],
      [charge, 'charges'],
    ] as const) {
      typed(box, '800.009');
      expect(onBillRowChange).toHaveBeenLastCalledWith(section, 0, { amount: '800.00' });
      typed(box, '1.');
      expect(onBillRowChange).toHaveBeenLastCalledWith(section, 0, { amount: '1.' });
      typed(box, '');
      expect(onBillRowChange).toHaveBeenLastCalledWith(section, 0, { amount: '' });
    }
  });

  it('Multiple Payors amounts', () => {
    const onContributionChange = vi.fn();
    const noop = () => {};
    const boxes = numberBoxes(
      PayorModeFields({
        members,
        payorMode: 'multiple',
        onPayorModeChange: noop,
        singlePayor: '',
        onSinglePayorChange: noop,
        contributions: {},
        onContributionChange,
        itemTotal: 0,
        contributed: 0,
      }),
    );
    expect(boxes).toHaveLength(2);
    boxes.forEach((box, i) => {
      typed(box, '800.009');
      expect(onContributionChange).toHaveBeenLastCalledWith(members[i], '800.00');
      typed(box, '1.');
      expect(onContributionChange).toHaveBeenLastCalledWith(members[i], '1.');
      typed(box, '');
      expect(onContributionChange).toHaveBeenLastCalledWith(members[i], '');
    });
  });
});
