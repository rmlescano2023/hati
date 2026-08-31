import { useMemo, useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { ModeToggle } from '../shared/ModeToggle';
import { PurchaseDetailsFields } from './PurchaseDetailsFields';
import { ItemModeFields, type ItemDraft, type ItemDraftHandlers } from './ItemModeFields';
import { ItemStagingList } from './ItemStagingList';
import { useAppData } from '../../context/AppDataContext';
import { distributeRemainder, getItemTotal } from '../../lib/calculations';
import { roundMoney, sumMoney } from '../../lib/money';
import { todayIso } from '../../lib/format';
import { createId } from '../../lib/id';
import type { ItemMode, PayorContribution, PayorMode, PurchaseItem } from '../../types';
import styles from './PurchaseItemCard.module.css';

const EMPTY_DRAFT: ItemDraft = {
  mode: 'equal',
  name: '',
  price: '',
  owners: {},
  allSelected: false,
  totalAmount: '',
  amounts: {},
};

const num = (raw: string | undefined): number => {
  const parsed = Number.parseFloat(raw ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? roundMoney(parsed) : 0;
};

export function PurchaseItemCard() {
  const { members, addRecord } = useAppData();

  const [date, setDate] = useState(todayIso);
  const [payorMode, setPayorMode] = useState<PayorMode>('single');
  const [singlePayor, setSinglePayor] = useState('');
  const [contributions, setContributions] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [staged, setStaged] = useState<PurchaseItem[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const stagedTotal = useMemo(() => sumMoney(staged.map(getItemTotal)), [staged]);

  const selectedOwners = useMemo(
    () => (draft.allSelected ? members : members.filter((m) => draft.owners[m])),
    [draft.allSelected, draft.owners, members],
  );

  const enteredTotal = useMemo(
    () => sumMoney(members.map((m) => num(draft.amounts[m]))),
    [draft.amounts, members],
  );
  const blankMembers = useMemo(
    () => members.filter((m) => num(draft.amounts[m]) === 0),
    [draft.amounts, members],
  );
  const remainder = roundMoney(num(draft.totalAmount) - enteredTotal);

  const resetItemDraft = (mode: ItemMode = draft.mode) => setDraft({ ...EMPTY_DRAFT, mode });

  const handlers: ItemDraftHandlers = {
    setName: (name) => setDraft((d) => ({ ...d, name })),
    setPrice: (price) => setDraft((d) => ({ ...d, price })),
    toggleAll: () =>
      setDraft((d) =>
        d.allSelected
          ? { ...d, allSelected: false, owners: {} }
          : { ...d, allSelected: true, owners: {} },
      ),
    toggleOwner: (member) =>
      setDraft((d) => {
        const owners = { ...d.owners, [member]: !d.owners[member] };
        // Ticking every member individually is the same as "All Members".
        const allSelected = members.length > 0 && members.every((m) => owners[m]);
        return { ...d, owners, allSelected };
      }),
    setTotalAmount: (totalAmount) => setDraft((d) => ({ ...d, totalAmount })),
    setAmount: (member, value) =>
      setDraft((d) => ({ ...d, amounts: { ...d.amounts, [member]: value } })),
    fillRemainder: () => {
      const target = num(draft.totalAmount);
      const filled = members
        .filter((m) => num(draft.amounts[m]) > 0)
        .map((m) => num(draft.amounts[m]));
      const fills = distributeRemainder(target, filled, blankMembers.length);
      setDraft((d) => {
        const amounts = { ...d.amounts };
        blankMembers.forEach((m, i) => {
          if (fills[i] > 0) amounts[m] = fills[i].toFixed(2);
        });
        return { ...d, amounts };
      });
    },
  };

  const canAddItem =
    draft.name.trim().length > 0 &&
    (draft.mode === 'equal' ? num(draft.price) > 0 && selectedOwners.length > 0 : enteredTotal > 0);

  const addItem = () => {
    if (!canAddItem) return;
    const name = draft.name.trim();
    const item: PurchaseItem =
      draft.mode === 'equal'
        ? {
            id: createId('item'),
            mode: 'equal',
            name,
            totalPrice: num(draft.price),
            owners: selectedOwners,
          }
        : {
            id: createId('item'),
            mode: 'custom',
            name,
            amounts: Object.fromEntries(
              members
                .filter((m) => num(draft.amounts[m]) > 0)
                .map((m) => [m, num(draft.amounts[m])]),
            ),
          };
    setStaged((prev) => [...prev, item]);
    resetItemDraft();
    setError('');
    setSuccess('');
  };

  const payors: PayorContribution[] =
    payorMode === 'single'
      ? singlePayor
        ? [{ member: singlePayor, amount: stagedTotal }]
        : []
      : members
          .filter((m) => num(contributions[m]) > 0)
          .map((m) => ({ member: m, amount: num(contributions[m]) }));

  const canSave = Boolean(date) && payors.length > 0 && staged.length > 0;

  const save = () => {
    if (!canSave) {
      setError(
        staged.length === 0
          ? 'Add at least one item before saving.'
          : 'Choose who paid for this purchase.',
      );
      return;
    }
    addRecord({ date, payorMode, payors, items: staged });
    setStaged([]);
    setSinglePayor('');
    setContributions({});
    resetItemDraft('equal');
    setError('');
    setSuccess('Saved to Breakdown.');
  };

  return (
    <Card label="Purchase Details" className={styles.card}>
      <div className={styles.section}>
        <PurchaseDetailsFields
          members={members}
          date={date}
          onDateChange={setDate}
          payorMode={payorMode}
          onPayorModeChange={(mode) => {
            setPayorMode(mode);
            setError('');
          }}
          singlePayor={singlePayor}
          onSinglePayorChange={setSinglePayor}
          contributions={contributions}
          onContributionChange={(member, raw) =>
            setContributions((prev) => ({ ...prev, [member]: raw }))
          }
          stagedTotal={stagedTotal}
        />

        <hr className={styles.divider} />

        <div className={styles.subhead}>
          <span className={styles.subLabel}>Add Item</span>
          <ModeToggle
            ariaLabel="Item split mode"
            value={draft.mode}
            onChange={(mode) => {
              resetItemDraft(mode);
              setError('');
            }}
            options={[
              { value: 'equal', label: 'Equal Split' },
              { value: 'custom', label: 'Custom Amounts' },
            ]}
          />
        </div>

        <ItemModeFields
          members={members}
          draft={draft}
          handlers={handlers}
          derived={{
            selectedCount: selectedOwners.length,
            enteredTotal,
            blankCount: blankMembers.length,
            remainder,
          }}
        />

        <div className={styles.actions}>
          <Button onClick={addItem} disabled={!canAddItem}>
            + Add Item
          </Button>
        </div>
      </div>

      <hr className={styles.divider} />

      <ItemStagingList
        items={staged}
        onRemove={(itemId) => setStaged((prev) => prev.filter((i) => i.id !== itemId))}
      />

      <div className={styles.saveRow}>
        {error && <span className={`${styles.message} ${styles.error}`}>{error}</span>}
        {!error && success && (
          <span className={`${styles.message} ${styles.success}`}>{success}</span>
        )}
        <Button variant="primary" onClick={save} disabled={!canSave}>
          Save to Breakdown →
        </Button>
      </div>
    </Card>
  );
}
