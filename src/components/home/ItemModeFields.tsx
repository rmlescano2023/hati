import { EqualSplitFields } from './EqualSplitFields';
import { CustomAmountFields } from './CustomAmountFields';
import { ClearableInput } from '../shared/ClearableInput';
import type {
  BillDraft,
  BillDraftView,
  BillSection,
  LineDraft,
  LinesDraft,
} from '../../lib/orderLines';
import { clipMoneyInput } from '../../lib/money';
import type { ItemMode } from '../../types';
import styles from './ItemModeFields.module.css';

export type ItemDraft = {
  mode: ItemMode;
  name: string;
  /** Equal Split: the item's total price. */
  price: string;
  /** Who is in the item: Equal Split's owners, and Custom Amounts' picked members. */
  owners: Record<string, boolean>;
  allSelected: boolean;
  /** Custom Amounts: the target total the picked members' lines should hit. */
  totalAmount: string;
  /** Custom Amounts: each picked member's order lines. */
  lines: LinesDraft;
  /** Custom Amounts: the receipt's shared orders, discounts and charges. */
  bill: BillDraft;
  /**
   * Custom Amounts: true from the moment Edit loads an item until the Total Amount box is
   * typed in (or cleared with its ↺). While true the box shows Entered, so editing a row never
   * shows a mismatch the user didn't make.
   */
  totalFollows: boolean;
};

export type ItemDraftHandlers = {
  setName: (value: string) => void;
  setPrice: (value: string) => void;
  toggleAll: () => void;
  toggleOwner: (member: string) => void;
  setTotalAmount: (value: string) => void;
  setLine: (
    member: string,
    index: number,
    patch: Partial<Pick<LineDraft, 'name' | 'price'>>,
  ) => void;
  addLine: (member: string) => void;
  removeLine: (member: string, index: number) => void;
  fillRemainder: () => void;
  addBillRow: (section: BillSection) => void;
  setBillRow: (
    section: BillSection,
    index: number,
    patch: { name?: string; amount?: string },
  ) => void;
  removeBillRow: (section: BillSection, index: number) => void;
  toggleRowEveryone: (section: 'shared' | 'discounts', index: number) => void;
  toggleRowMember: (section: 'shared' | 'discounts', index: number, member: string) => void;
  /** The Equal Split hint's switch to Custom Amounts with a shared order and a discount. */
  switchForDiscount: () => void;
};

export type ItemDraftDerived = {
  /** The picked members, which both modes read as who is in the item. */
  picked: string[];
  enteredTotal: number;
  blankCount: number;
  remainder: number;
  /** The first order that has a name but no price, which stops the item being added. */
  missingPrice: string | null;
  /** The receipt as typed: each member's share, the figures and the hints (BR-CA16, BR-CA17). */
  bill: BillDraftView;
};

type Props = {
  members: string[];
  draft: ItemDraft;
  handlers: ItemDraftHandlers;
  derived: ItemDraftDerived;
};

export function ItemModeFields({ members, draft, handlers, derived }: Props) {
  return (
    <div className={styles.wrap}>
      {/* Equal Split's price sits beside the name: a full-width name box
          and a lone short price box underneath it both read as misfits. */}
      <div className={styles.nameRow}>
        <div className={`${styles.field} ${styles.nameField}`}>
          <label htmlFor="item-name">Item Name</label>
          <ClearableInput
            id="item-name"
            clearLabel="Clear item name"
            type="text"
            placeholder="e.g. Dinner, Groceries, Taxi"
            value={draft.name}
            onChange={(e) => handlers.setName(e.target.value)}
          />
        </div>
        {draft.mode === 'equal' && (
          <div className={`${styles.field} ${styles.priceField}`}>
            <label htmlFor="item-price">Total Price (₱)</label>
            <ClearableInput
              id="item-price"
              clearLabel="Clear total price"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={draft.price}
              onChange={(e) => handlers.setPrice(clipMoneyInput(e.target.value))}
            />
          </div>
        )}
      </div>

      {draft.mode === 'equal' ? (
        <EqualSplitFields
          members={members}
          price={draft.price}
          owners={draft.owners}
          allSelected={draft.allSelected}
          onToggleAll={handlers.toggleAll}
          onToggleOwner={handlers.toggleOwner}
          selectedCount={derived.picked.length}
          onSwitchForDiscount={handlers.switchForDiscount}
        />
      ) : (
        <CustomAmountFields
          members={members}
          totalAmount={draft.totalAmount}
          totalFollows={draft.totalFollows}
          onTotalAmountChange={handlers.setTotalAmount}
          onFillRemainder={handlers.fillRemainder}
          owners={draft.owners}
          allSelected={draft.allSelected}
          onToggleAll={handlers.toggleAll}
          onToggleOwner={handlers.toggleOwner}
          picked={derived.picked}
          lines={draft.lines}
          onLineChange={handlers.setLine}
          onAddLine={handlers.addLine}
          onRemoveLine={handlers.removeLine}
          enteredTotal={derived.enteredTotal}
          blankCount={derived.blankCount}
          remainder={derived.remainder}
          missingPrice={derived.missingPrice}
          bill={draft.bill}
          billView={derived.bill}
          onAddBillRow={handlers.addBillRow}
          onBillRowChange={handlers.setBillRow}
          onRemoveBillRow={handlers.removeBillRow}
          onToggleRowEveryone={handlers.toggleRowEveryone}
          onToggleRowMember={handlers.toggleRowMember}
        />
      )}
    </div>
  );
}
