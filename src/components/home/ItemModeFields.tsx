import { EqualSplitFields } from './EqualSplitFields';
import { CustomAmountFields } from './CustomAmountFields';
import type { ItemMode } from '../../types';
import styles from './ItemModeFields.module.css';

export type ItemDraft = {
  mode: ItemMode;
  name: string;
  /** Equal Split: the item's total price. */
  price: string;
  owners: Record<string, boolean>;
  allSelected: boolean;
  /** Custom Amounts: the target total the per-member amounts should hit. */
  totalAmount: string;
  amounts: Record<string, string>;
};

export type ItemDraftHandlers = {
  setName: (value: string) => void;
  setPrice: (value: string) => void;
  toggleAll: () => void;
  toggleOwner: (member: string) => void;
  setTotalAmount: (value: string) => void;
  setAmount: (member: string, value: string) => void;
  fillRemainder: () => void;
};

export type ItemDraftDerived = {
  selectedCount: number;
  enteredTotal: number;
  blankCount: number;
  remainder: number;
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
          <input
            id="item-name"
            type="text"
            placeholder="e.g. Dinner, Groceries, Taxi"
            value={draft.name}
            onChange={(e) => handlers.setName(e.target.value)}
          />
        </div>
        {draft.mode === 'equal' && (
          <div className={`${styles.field} ${styles.priceField}`}>
            <label htmlFor="item-price">Total Price (₱)</label>
            <input
              id="item-price"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={draft.price}
              onChange={(e) => handlers.setPrice(e.target.value)}
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
          selectedCount={derived.selectedCount}
        />
      ) : (
        <CustomAmountFields
          members={members}
          totalAmount={draft.totalAmount}
          onTotalAmountChange={handlers.setTotalAmount}
          amounts={draft.amounts}
          onAmountChange={handlers.setAmount}
          onFillRemainder={handlers.fillRemainder}
          enteredTotal={derived.enteredTotal}
          blankCount={derived.blankCount}
          remainder={derived.remainder}
        />
      )}
    </div>
  );
}
