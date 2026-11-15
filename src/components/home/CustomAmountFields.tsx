import { Button } from '../shared/Button';
import { ClearableInput } from '../shared/ClearableInput';
import { OwnerGrid } from '../shared/OwnerGrid';
import { formatMoney, formatSignedMoney } from '../../lib/format';
import {
  ORDER_NAME_MAX,
  hasBillRows,
  linesOf,
  normaliseOrderName,
  type BillDraft,
  type BillDraftView,
  type BillSection,
  type LineDraft,
  type LinesDraft,
} from '../../lib/orderLines';
import styles from './CustomAmountFields.module.css';

/** What each section of the receipt is called, in the form and to a screen reader. */
const SECTIONS: {
  section: BillSection;
  heading: string;
  /** The row's noun, lower case: "Remove shared order Gyoza". */
  noun: string;
  placeholder: string;
  /** What the amount box is called to a screen reader: a shared order has a price, the rest an amount. */
  amountWord: string;
  helper: string | null;
  /** The picker's group name: "Who shares Gyoza", "Who gets PWD". */
  who: string | null;
}[] = [
  {
    section: 'shared',
    heading: 'Shared orders',
    noun: 'shared order',
    placeholder: 'Order name',
    amountWord: 'price',
    helper: null,
    who: 'shares',
  },
  {
    section: 'discounts',
    heading: 'Discounts',
    noun: 'discount',
    placeholder: 'Discount name',
    amountWord: 'amount',
    helper: 'Comes off the share of the people ticked.',
    who: 'gets',
  },
  {
    section: 'charges',
    heading: 'Charges',
    noun: 'charge',
    placeholder: 'Charge name',
    amountWord: 'amount',
    helper: 'Split equally across everyone in this item.',
    who: null,
  },
];

const sectionHint = (view: BillDraftView, section: BillSection) =>
  section === 'shared'
    ? view.sharedHint
    : section === 'discounts'
      ? view.discountHint
      : view.chargeHint;

type Props = {
  members: string[];
  /** The target total the picked members' lines should add up to. */
  totalAmount: string;
  onTotalAmountChange: (raw: string) => void;
  onFillRemainder: () => void;
  owners: Record<string, boolean>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggleOwner: (member: string) => void;
  /** Who is in the item, alphabetically; each gets a block of order lines. */
  picked: string[];
  lines: LinesDraft;
  onLineChange: (
    member: string,
    index: number,
    patch: Partial<Pick<LineDraft, 'name' | 'price'>>,
  ) => void;
  onAddLine: (member: string) => void;
  onRemoveLine: (member: string, index: number) => void;
  /** Sum of the picked members' priced lines. */
  enteredTotal: number;
  blankCount: number;
  remainder: number;
  /** The first order with a name and no price, or null. */
  missingPrice: string | null;
  /** The shared orders, discounts and charges as typed. */
  bill: BillDraft;
  /** Each member's share and the receipt's figures and hints. */
  billView: BillDraftView;
  onAddBillRow: (section: BillSection) => void;
  onBillRowChange: (
    section: BillSection,
    index: number,
    patch: { name?: string; amount?: string },
  ) => void;
  onRemoveBillRow: (section: BillSection, index: number) => void;
  onToggleRowEveryone: (section: 'shared' | 'discounts', index: number) => void;
  onToggleRowMember: (section: 'shared' | 'discounts', index: number, member: string) => void;
};

export function CustomAmountFields({
  members,
  totalAmount,
  onTotalAmountChange,
  onFillRemainder,
  owners,
  allSelected,
  onToggleAll,
  onToggleOwner,
  picked,
  lines,
  onLineChange,
  onAddLine,
  onRemoveLine,
  enteredTotal,
  blankCount,
  remainder,
  missingPrice,
  bill,
  billView,
  onAddBillRow,
  onBillRowChange,
  onRemoveBillRow,
  onToggleRowEveryone,
  onToggleRowMember,
}: Props) {
  if (members.length === 0) {
    return <p className={styles.hint}>Add group members first.</p>;
  }

  const target = Number.parseFloat(totalAmount);
  const hasTarget = Number.isFinite(target) && target > 0;
  const mismatch = hasTarget && Math.abs(target - enteredTotal) >= 0.01;
  const canFill = hasTarget && blankCount > 0 && remainder > 0;
  // Each member's share shows beside their name once there is any shared order,
  // discount or charge row (BR-CA31).
  const showShares = hasBillRows(bill);

  return (
    <div className={styles.wrap}>
      <div className={styles.topRow}>
        <div className={`${styles.field} ${styles.totalField}`}>
          <label htmlFor="custom-total">Total Amount (₱)</label>
          <ClearableInput
            id="custom-total"
            clearLabel="Clear total amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={totalAmount}
            onChange={(e) => onTotalAmountChange(e.target.value)}
          />
        </div>
        <Button
          onClick={onFillRemainder}
          disabled={!canFill}
          title={
            canFill
              ? `Split ${formatMoney(remainder)} across ${blankCount} blank member${
                  blankCount === 1 ? '' : 's'
                }`
              : 'Enter a total amount and leave at least one member blank'
          }
        >
          Fill Remainder
        </Button>
      </div>

      <div className={styles.field}>
        <label>Who&apos;s in this item</label>
        <OwnerGrid
          members={members}
          selected={owners}
          allSelected={allSelected}
          onToggleAll={onToggleAll}
          onToggle={onToggleOwner}
        />
      </div>

      <div className={styles.blocks}>
        {picked.map((m) => {
          const memberLines = linesOf(lines, m);
          return (
            <div className={styles.block} key={m}>
              {showShares ? (
                <div className={styles.blockHead}>
                  <span className={styles.blockName}>{m}</span>
                  <span
                    className={`${styles.share} ${billView.shares[m] < 0 ? styles.negative : ''}`}
                  >
                    <span className="visually-hidden">{m}&apos;s share </span>
                    {Object.hasOwn(billView.shares, m)
                      ? formatSignedMoney(billView.shares[m])
                      : '—'}
                  </span>
                </div>
              ) : (
                <span className={styles.blockName}>{m}</span>
              )}
              {memberLines.map((line, i) => {
                const orderName = normaliseOrderName(line.name);
                return (
                  <div className={styles.line} key={line.key}>
                    <ClearableInput
                      type="text"
                      clearLabel={`Clear ${m}'s order ${i + 1} name`}
                      compactClear
                      maxLength={ORDER_NAME_MAX}
                      placeholder="Order name"
                      aria-label={`${m}'s order ${i + 1} name`}
                      value={line.name}
                      onChange={(e) => onLineChange(m, i, { name: e.target.value })}
                    />
                    <ClearableInput
                      type="number"
                      className={styles.priceBox}
                      clearLabel={`Clear ${m}'s order ${i + 1} price`}
                      compactClear
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      aria-label={`${m}'s order ${i + 1} price`}
                      value={line.price}
                      onChange={(e) => onLineChange(m, i, { price: e.target.value })}
                    />
                    {/* A member always keeps one line, so a lone line has no ×. */}
                    {memberLines.length > 1 && (
                      <Button
                        variant="icon"
                        title="Remove order"
                        aria-label={
                          orderName ? `Remove ${m}'s order ${orderName}` : `Remove ${m}'s order`
                        }
                        onClick={() => onRemoveLine(m, i)}
                      >
                        ×
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                className={styles.addOrder}
                aria-label={`Add order for ${m}`}
                onClick={() => onAddLine(m)}
              >
                + Add order
              </Button>
            </div>
          );
        })}
      </div>

      {missingPrice !== null && (
        <p className={styles.lineHint}>Add a price for {missingPrice} or remove it</p>
      )}

      {SECTIONS.map(({ section, heading, noun, placeholder, amountWord, helper, who }) => {
        const rows = bill[section];
        if (rows.length === 0) return null;
        const hint = sectionHint(billView, section);
        const labelId = `custom-${section}-label`;
        return (
          <div className={styles.billSection} role="group" aria-labelledby={labelId} key={section}>
            <span id={labelId} className={styles.sectionLabel}>
              {heading}
            </span>
            {helper && <p className={styles.helper}>{helper}</p>}
            {rows.map((row, i) => {
              const rowName = normaliseOrderName(row.name);
              const n = i + 1;
              return (
                <div className={styles.billRow} key={row.key}>
                  <div className={styles.line}>
                    <ClearableInput
                      type="text"
                      clearLabel={`Clear ${noun} ${n} name`}
                      compactClear
                      maxLength={ORDER_NAME_MAX}
                      placeholder={placeholder}
                      aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} ${n} name`}
                      value={row.name}
                      onChange={(e) => onBillRowChange(section, i, { name: e.target.value })}
                    />
                    <ClearableInput
                      type="number"
                      className={styles.priceBox}
                      clearLabel={`Clear ${noun} ${n} ${amountWord}`}
                      compactClear
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} ${n} ${amountWord}`}
                      value={row.amount}
                      onChange={(e) => onBillRowChange(section, i, { amount: e.target.value })}
                    />
                    <Button
                      variant="icon"
                      title={`Remove ${noun}`}
                      aria-label={rowName ? `Remove ${noun} ${rowName}` : `Remove ${noun}`}
                      onClick={() => onRemoveBillRow(section, i)}
                    >
                      ×
                    </Button>
                  </div>
                  {'everyone' in row && section !== 'charges' && (
                    <div
                      className={styles.rowPicker}
                      role="group"
                      aria-label={rowName ? `Who ${who} ${rowName}` : `Who ${who} ${noun} ${n}`}
                    >
                      <OwnerGrid
                        members={picked}
                        selected={row.members}
                        allSelected={row.everyone}
                        onToggleAll={() => onToggleRowEveryone(section, i)}
                        onToggle={(m) => onToggleRowMember(section, i, m)}
                        allLabel="Everyone"
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {hint && <p className={styles.lineHint}>{hint}</p>}
          </div>
        );
      })}

      {picked.length > 0 && (
        <div className={styles.addRow}>
          <Button variant="ghost" size="sm" onClick={() => onAddBillRow('shared')}>
            + Add shared order
          </Button>
        </div>
      )}

      <div className={styles.footer}>
        <span>Entered</span>
        <span className={`${styles.sum} ${mismatch ? styles.mismatch : ''}`}>
          {formatMoney(enteredTotal)}
        </span>
        {mismatch && <span className={styles.mismatch}>of {formatMoney(target)}</span>}
      </div>
    </div>
  );
}
