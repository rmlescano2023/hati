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

/**
 * What an edit puts back when it ends, taken just before Edit loads the row
 * (BR-15). A half-typed item isn't part of it, so it is never restored.
 */
type EditRestore = { date: string; payorMode: PayorMode; singlePayor: string; mode: ItemMode };

/** The fields as they stand to show `item`, which is what Edit loads. */
function draftFromItem(item: PurchaseItem, members: string[]): ItemDraft {
  if (item.mode === 'equal') {
    // "All Members" is ticked only when the owners are every current member,
    // because a staged item stores the actual names.
    const everyone = members.length > 0 && members.every((m) => item.owners.includes(m));
    return {
      ...EMPTY_DRAFT,
      mode: 'equal',
      name: item.name,
      price: item.totalPrice.toFixed(2),
      allSelected: everyone,
      owners: everyone ? {} : Object.fromEntries(item.owners.map((o) => [o, true])),
    };
  }
  return {
    ...EMPTY_DRAFT,
    mode: 'custom',
    name: item.name,
    totalAmount: getItemTotal(item).toFixed(2),
    amounts: Object.fromEntries(Object.entries(item.amounts).map(([m, a]) => [m, a.toFixed(2)])),
  };
}

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
  /** The row being edited, with what to put back when the edit ends; null when none is. */
  const [editing, setEditing] = useState<{ id: string; restore: EditRestore } | null>(null);
  const [message, dispatch] = useReducer(saveMessageReducer, initialSaveMessage);
  /**
   * Numbers the saves from this form, so only the latest one's timer and
   * outcome reach the message. Its save carries every earlier purchase, so its
   * "Saved" covers them too.
   */
  const latestSave = useRef(0);
  const sectionRef = useRef<HTMLDivElement>(null);
  // Set when an edit ends, so focus goes back to that row's Edit button rather
  // than being dropped on the page when its own button was the one disabled.
  const restoreFocusTo = useRef<string | null>(null);

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

  /** The fields as a staged item with the given id: its item, date and payors (BR-1). */
  const stampItem = (id: string): StagedItem => {
    const name = draft.name.trim();
    const item: PurchaseItem =
      draft.mode === 'equal'
        ? { id, mode: 'equal', name, totalPrice: num(draft.price), owners: selectedOwners }
        : {
            id,
            mode: 'custom',
            name,
            amounts: Object.fromEntries(
              members
                .filter((m) => num(draft.amounts[m]) > 0)
                .map((m) => [m, num(draft.amounts[m])]),
            ),
          };
    return {
      item,
      date,
      payorMode,
      payors:
        payorMode === 'single'
          ? [{ member: singlePayor, amount: getItemTotal(item) }]
          : typedContributions,
    };
  };

  const addItem = () => {
    if (!canAddItem) return;
    setStaged((prev) => [...prev, stampItem(createId('item'))]);
    // The date and the payor pick stay for the next item. The mode that isn't
    // on screen is cleared, so it can't come back later (BR-13).
    if (payorMode === 'multiple') setSinglePayor('');
    setContributions({});
    resetItemDraft();
    dispatch({ type: 'itemAdded' });
  };

  const startEdit = (id: string) => {
    const row = staged.find((s) => s.item.id === id);
    if (!row) return;
    // Whatever was half-typed is replaced without asking (AC-4.3).
    setEditing({ id, restore: { date, payorMode, singlePayor, mode: draft.mode } });
    setDate(row.date);
    setPayorMode(row.payorMode);
    setSinglePayor(row.payorMode === 'single' ? row.payors[0].member : '');
    setContributions(
      row.payorMode === 'multiple'
        ? Object.fromEntries(row.payors.map((p) => [p.member, p.amount.toFixed(2)]))
        : {},
    );
    setDraft(draftFromItem(row.item, members));
    // So a phone user sees the fields fill. Date takes focus only with a fine
    // pointer: on touch it would open the keyboard or the date picker unasked.
    sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (!window.matchMedia('(pointer: coarse)').matches) {
      document.getElementById('purchase-date')?.focus({ preventScroll: true });
    }
  };

  /** Ends the edit the same way for Save Edits and Cancel (BR-15). */
  const endEdit = (current: { id: string; restore: EditRestore }) => {
    const { restore } = current;
    setDate(restore.date);
    setPayorMode(restore.payorMode);
    setSinglePayor(restore.singlePayor);
    setContributions({});
    setDraft({ ...EMPTY_DRAFT, mode: restore.mode });
    restoreFocusTo.current = current.id;
    setEditing(null);
  };

  const saveEdits = () => {
    if (!editing || !canAddItem) return;
    // Same id, same place in the list, newly stamped (BR-11).
    const stamped = stampItem(editing.id);
    setStaged((prev) => prev.map((s) => (s.item.id === editing.id ? stamped : s)));
    endEdit(editing);
    dispatch({ type: 'itemAdded' });
  };

  useEffect(() => {
    if (editing !== null || restoreFocusTo.current === null) return;
    const id = restoreFocusTo.current;
    restoreFocusTo.current = null;
    document.getElementById(`edit-${id}`)?.focus();
  }, [editing]);

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
    // The button is disabled only during an edit, so a click with nothing
    // staged says what, rather than the button just not responding.
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
      <div className={styles.section} ref={sectionRef}>
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
              // The name stays, whether or not an edit is open; the rest is
              // specific to the mode being left.
              setDraft((d) => ({ ...EMPTY_DRAFT, mode, name: d.name }));
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
          {editing ? (
            <>
              <Button variant="ghost" onClick={() => endEdit(editing)}>
                Cancel
              </Button>
              <Button onClick={saveEdits} disabled={!canAddItem}>
                Save Edits
              </Button>
            </>
          ) : (
            <Button onClick={addItem} disabled={!canAddItem}>
              + Add Item
            </Button>
          )}
        </div>
      </div>

      <hr className={styles.divider} />

      <ItemStagingList
        items={staged}
        editingId={editing?.id ?? null}
        onEdit={startEdit}
        onRemove={(itemId) => setStaged((prev) => prev.filter((s) => s.item.id !== itemId))}
      />

      <div className={styles.saveRow}>
        {/* One region for every message, always mounted, so a screen reader
            announces each change of its text once and politely. */}
        <span className={`${styles.message} ${TONE_CLASS[shown.tone]}`} role="status">
          {shown.text}
        </span>
        <Button variant="primary" onClick={save} disabled={editing !== null}>
          Save to Breakdown →
        </Button>
      </div>
    </Card>
  );
}
