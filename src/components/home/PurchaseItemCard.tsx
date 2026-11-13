import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { ModeToggle } from '../shared/ModeToggle';
import { PurchaseDetailsFields } from './PurchaseDetailsFields';
import { ItemModeFields, type ItemDraft, type ItemDraftHandlers } from './ItemModeFields';
import { ItemStagingList } from './ItemStagingList';
import { useAppData } from '../../context/AppDataContext';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { distributeRemainder, getItemTotal } from '../../lib/calculations';
import { parsePositiveAmount as num, roundMoney, sumMoney } from '../../lib/money';
import {
  buildRecords,
  contributionsMatch,
  readContributions,
  type StagedItem,
} from '../../lib/staging';
import { todayIso } from '../../lib/format';
import { createId } from '../../lib/id';
import {
  SLOW_SAVE_MS,
  firstMissing,
  initialSaveMessage,
  saveMessageReducer,
  saveMessageView,
  type MissingFlags,
  type SaveMessageTone,
} from '../../lib/saveMessage';
import type { ItemMode, PayorMode, PurchaseItem } from '../../types';
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

const TONE_CLASS: Record<SaveMessageTone, string> = {
  muted: styles.saving,
  accent: styles.success,
  error: styles.error,
};

type Props = {
  /** Held by the Expenses page, so Group Members can see what is staged. */
  staged: StagedItem[];
  setStaged: Dispatch<SetStateAction<StagedItem[]>>;
};

export function PurchaseItemCard({ staged, setStaged }: Props) {
  const { members, addRecords } = useAppData();
  const { sync } = useSessionsStore();

  const [date, setDate] = useState(todayIso);
  const [payorMode, setPayorMode] = useState<PayorMode>('single');
  const [singlePayor, setSinglePayor] = useState('');
  const [contributions, setContributions] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [message, dispatch] = useReducer(saveMessageReducer, initialSaveMessage);
  /**
   * Numbers the saves from this form, so only the latest one's timer and
   * outcome reach the message. Its save carries every earlier purchase, so its
   * "Saved" covers them too.
   */
  const latestSave = useRef(0);

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

  // The price the contributions have to cover. Custom Amounts uses what the
  // member amounts add up to, never the Total Amount box, which is only a target.
  const itemTotal = draft.mode === 'equal' ? num(draft.price) : enteredTotal;
  const typedContributions = useMemo(
    () => readContributions(contributions, members),
    [contributions, members],
  );
  const contributed = sumMoney(typedContributions.map((p) => p.amount));

  const itemValid =
    draft.name.trim().length > 0 &&
    (draft.mode === 'equal' ? num(draft.price) > 0 && selectedOwners.length > 0 : enteredTotal > 0);
  // The date and payor are stamped on the item, so they are checked here and
  // not at Save. A payor name that is no longer a member doesn't count.
  const payorValid =
    payorMode === 'single'
      ? members.includes(singlePayor)
      : contributionsMatch(typedContributions, itemTotal);
  const canAddItem = itemValid && date !== '' && payorValid;

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
    const stamped: StagedItem = {
      item,
      date,
      payorMode,
      payors:
        payorMode === 'single'
          ? [{ member: singlePayor, amount: getItemTotal(item) }]
          : typedContributions,
    };
    setStaged((prev) => [...prev, stamped]);
    // The date and the payor pick stay for the next item. The mode that isn't
    // on screen is cleared, so it can't come back later (BR-13).
    if (payorMode === 'multiple') setSinglePayor('');
    setContributions({});
    resetItemDraft();
    dispatch({ type: 'itemAdded' });
  };

  const missing: MissingFlags = { items: staged.length === 0 };

  // Timed by an effect, so a newer click, an outcome or leaving the tab
  // cancels it through the cleanup, and a stale timer can't fire at all.
  useEffect(() => {
    if (message.status !== 'saving') return;
    const save = message.save;
    const timer = setTimeout(() => dispatch({ type: 'slow', save }), SLOW_SAVE_MS);
    return () => clearTimeout(timer);
  }, [message.status, message.save]);

  // "Not saved." leans on the banner to explain it, so it goes when the banner
  // goes, which a later successful save of this session does on its own.
  const bannerShown = sync.status === 'error';
  useEffect(() => {
    if (!bannerShown) dispatch({ type: 'bannerCleared' });
  }, [bannerShown]);

  // The view already hides a validation message once what it names is
  // supplied. Forgetting it too stops it coming back if that is removed
  // again before the next click.
  const validationSupplied = message.validation !== null && !missing[message.validation];
  useEffect(() => {
    if (validationSupplied) dispatch({ type: 'clearValidation' });
  }, [validationSupplied]);

  const save = () => {
    // The button is never disabled, so a click with nothing staged says
    // what, rather than the button just not responding.
    if (firstMissing(missing)) {
      dispatch({ type: 'invalid', missing });
      return;
    }
    const thisSave = (latestSave.current += 1);
    // First, because a save that can't start settles at once.
    dispatch({ type: 'start', save: thisSave });
    // After an unmount the dispatch is dropped, and a remount starts empty, so
    // leaving the tab mid-save never brings the message back.
    // Every staged item goes in one write, each into the record for its own
    // date and payor.
    addRecords(buildRecords(staged), (saved) =>
      dispatch({ type: 'settled', save: thisSave, saved }),
    );
    setStaged([]);
    setSinglePayor('');
    setContributions({});
    resetItemDraft('equal');
  };

  const shown = saveMessageView(message, missing);

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
            dispatch({ type: 'clearValidation' });
          }}
          singlePayor={singlePayor}
          onSinglePayorChange={setSinglePayor}
          contributions={contributions}
          onContributionChange={(member, raw) =>
            setContributions((prev) => ({ ...prev, [member]: raw }))
          }
          itemTotal={itemTotal}
          contributed={contributed}
        />

        <hr className={styles.divider} />

        <div className={styles.subhead}>
          <span className={styles.subLabel}>Add Item</span>
          <ModeToggle
            ariaLabel="Item split mode"
            value={draft.mode}
            onChange={(mode) => {
              resetItemDraft(mode);
              dispatch({ type: 'clearValidation' });
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
        onRemove={(itemId) => setStaged((prev) => prev.filter((s) => s.item.id !== itemId))}
      />

      <div className={styles.saveRow}>
        {/* One region for every message, always mounted, so a screen reader
            announces each change of its text once and politely. */}
        <span className={`${styles.message} ${TONE_CLASS[shown.tone]}`} role="status">
          {shown.text}
        </span>
        <Button variant="primary" onClick={save}>
          Save to Breakdown →
        </Button>
      </div>
    </Card>
  );
}
