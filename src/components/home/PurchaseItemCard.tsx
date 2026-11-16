import {
  useCallback,
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
import { getItemTotal } from '../../lib/calculations';
import { parsePositiveAmount as num, roundMoney, sumMoney } from '../../lib/money';
import {
  EMPTY_BILL_DRAFT,
  addBillRow,
  billDraftFromItem,
  blankPicked,
  fillRemainder,
  itemFromLines,
  linesFromEqualSplit,
  linesFromItem,
  linesOf,
  readBillDraft,
  removeBillRow,
  setBillRow,
  toggleRowEveryone,
  toggleRowMember,
  unpickFromBill,
  unpricedNamedLine,
  type LineDraft,
} from '../../lib/orderLines';
import {
  buildRecords,
  contributionsMatch,
  findSavedItem,
  purgeMemberFromStaged,
  readContributions,
  sameStaged,
  stagedFromSaved,
  type SavedItemRef,
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
  lines: {},
  bill: EMPTY_BILL_DRAFT,
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
  // Everyone with an amount is picked, and "All Members" is ticked only when
  // that is every current member, as it is for Equal Split.
  const lines = linesFromItem(item, members);
  const picked = Object.keys(lines);
  const everyone = members.length > 0 && members.every((m) => picked.includes(m));
  return {
    ...EMPTY_DRAFT,
    mode: 'custom',
    name: item.name,
    totalAmount: getItemTotal(item).toFixed(2),
    allSelected: everyone,
    owners: everyone ? {} : Object.fromEntries(picked.map((m) => [m, true])),
    lines,
    bill: billDraftFromItem(item, members),
  };
}

/** The five fields Purchase Details holds, which a staged or saved item loads into and is stamped from. */
type Fields = {
  date: string;
  payorMode: PayorMode;
  singlePayor: string;
  contributions: Record<string, string>;
  draft: ItemDraft;
};

/** The fields as they stand to show `row`: what Edit loads. */
function fieldsFromStaged(row: StagedItem, members: string[]): Fields {
  return {
    date: row.date,
    payorMode: row.payorMode,
    singlePayor: row.payorMode === 'single' ? row.payors[0].member : '',
    contributions:
      row.payorMode === 'multiple'
        ? Object.fromEntries(row.payors.map((p) => [p.member, p.amount.toFixed(2)]))
        : {},
    draft: draftFromItem(row.item, members),
  };
}

/** The fields as a staged item with the given id: its item, date and payors (BR-1). */
function stampFields(fields: Fields, members: string[], id: string): StagedItem {
  const { date, payorMode, singlePayor, contributions, draft } = fields;
  const owners = draft.allSelected ? members : members.filter((m) => draft.owners[m]);
  const name = draft.name.trim();
  const item: PurchaseItem =
    draft.mode === 'equal'
      ? { id, mode: 'equal', name, totalPrice: num(draft.price), owners }
      : itemFromLines(id, name, owners, draft.lines, draft.bill);
  return {
    item,
    date,
    payorMode,
    payors:
      payorMode === 'single'
        ? [{ member: singlePayor, amount: getItemTotal(item) }]
        : readContributions(contributions, members),
  };
}

/** A line with nothing typed yet, for "+ Add order". */
const emptyLine = (): LineDraft => ({ key: createId('line'), name: '', price: '' });

const TONE_CLASS: Record<SaveMessageTone, string> = {
  muted: styles.saving,
  accent: styles.success,
  error: styles.error,
};

type Props = {
  /** Held by the Expenses page, so Group Members can see what is staged. */
  staged: StagedItem[];
  setStaged: Dispatch<SetStateAction<StagedItem[]>>;
  /** A saved item out for editing, or null; set only while this tab is open (BR-CO27). */
  savedEdit: SavedItemRef | null;
  /** Ends that edit and goes back to Breakdown; `removed` when the item had gone (BR-CO33, BR-CO35). */
  onSavedEditEnd: (removed: boolean) => void;
};

export function PurchaseItemCard({ staged, setStaged, savedEdit, onSavedEditEnd }: Props) {
  const { members, records, addRecords, saveItemEdit } = useAppData();
  const { sync } = useSessionsStore();

  // Loaded once per mount: Expenses always mounts fresh for a saved-item edit,
  // because Edit is pressed on Breakdown.
  const [savedBoot] = useState(() => {
    const found = savedEdit && findSavedItem(records, savedEdit);
    if (!savedEdit || !found) return null;
    const fields = fieldsFromStaged(stagedFromSaved(found.record, found.item), members);
    // What Save Edits compares against: the loaded fields stamped the same way
    // the edited ones will be, so an untouched old item counts as unchanged (BR-CO32).
    return { fields, baseline: stampFields(fields, members, savedEdit.itemId) };
  });

  const [date, setDate] = useState(() => savedBoot?.fields.date ?? todayIso());
  const [payorMode, setPayorMode] = useState<PayorMode>(
    () => savedBoot?.fields.payorMode ?? 'single',
  );
  const [singlePayor, setSinglePayor] = useState(() => savedBoot?.fields.singlePayor ?? '');
  const [contributions, setContributions] = useState<Record<string, string>>(
    () => savedBoot?.fields.contributions ?? {},
  );
  const [draft, setDraft] = useState<ItemDraft>(() => savedBoot?.fields.draft ?? EMPTY_DRAFT);
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
  const savedNoteRef = useRef<HTMLParagraphElement>(null);
  // Set when an edit ends, so focus goes back to that row's Edit button rather
  // than being dropped on the page when its own button was the one disabled.
  const restoreFocusTo = useRef<string | null>(null);

  const selectedOwners = useMemo(
    () => (draft.allSelected ? members : members.filter((m) => draft.owners[m])),
    [draft.allSelected, draft.owners, members],
  );

  // What the typed receipt comes to: the own orders and the shared, discount and
  // charge rows (BR-CA17). With no rows it is the sum of the own orders, as before.
  const billView = useMemo(
    () => readBillDraft(selectedOwners, draft.lines, draft.bill),
    [draft.lines, draft.bill, selectedOwners],
  );
  const enteredTotal = billView.entered;
  const blankMembers = useMemo(
    () => blankPicked(selectedOwners, draft.lines),
    [draft.lines, selectedOwners],
  );
  const missingPrice = useMemo(
    () => unpricedNamedLine(selectedOwners, draft.lines),
    [draft.lines, selectedOwners],
  );
  const remainder = roundMoney(num(draft.totalAmount) - enteredTotal);

  const resetItemDraft = (mode: ItemMode = draft.mode) => setDraft({ ...EMPTY_DRAFT, mode });

  const handlers: ItemDraftHandlers = {
    setName: (name) => setDraft((d) => ({ ...d, name })),
    setPrice: (price) => setDraft((d) => ({ ...d, price })),
    // Un-ticking "All Members" clears everyone, so their order lines go with
    // them (AC-CO1.3).
    toggleAll: () =>
      setDraft((d) =>
        d.allSelected
          ? {
              ...d,
              allSelected: false,
              owners: {},
              lines: {},
              bill: unpickFromBill(d.bill, members, []),
            }
          : { ...d, allSelected: true, owners: {} },
      ),
    toggleOwner: (member) =>
      setDraft((d) => {
        const owners = { ...d.owners, [member]: !d.owners[member] };
        // Ticking every member individually is the same as "All Members".
        const allSelected = members.length > 0 && members.every((m) => owners[m]);
        // Un-ticking a member takes their lines with them (AC-CO1.7).
        const lines = { ...d.lines };
        if (!owners[member]) delete lines[member];
        // And off every shared order and discount they were ticked on (BR-CA24).
        const pickedAfter = allSelected ? members : members.filter((m) => owners[m]);
        const bill = owners[member] ? d.bill : unpickFromBill(d.bill, [member], pickedAfter);
        return { ...d, owners, allSelected, lines, bill };
      }),
    setTotalAmount: (totalAmount) => setDraft((d) => ({ ...d, totalAmount })),
    setLine: (member, index, patch) =>
      setDraft((d) => ({
        ...d,
        lines: {
          ...d.lines,
          [member]: linesOf(d.lines, member).map((l, i) => (i === index ? { ...l, ...patch } : l)),
        },
      })),
    addLine: (member) =>
      setDraft((d) => ({
        ...d,
        lines: {
          ...d.lines,
          [member]: [...linesOf(d.lines, member), emptyLine()],
        },
      })),
    removeLine: (member, index) =>
      setDraft((d) => ({
        ...d,
        lines: { ...d.lines, [member]: linesOf(d.lines, member).filter((_, i) => i !== index) },
      })),
    fillRemainder: () =>
      setDraft((d) => ({
        ...d,
        lines: fillRemainder(num(d.totalAmount), selectedOwners, d.lines, billView.others),
      })),
    addBillRow: (section) => setDraft((d) => ({ ...d, bill: addBillRow(d.bill, section) })),
    setBillRow: (section, index, patch) =>
      setDraft((d) => ({ ...d, bill: setBillRow(d.bill, section, index, patch) })),
    removeBillRow: (section, index) =>
      setDraft((d) => ({ ...d, bill: removeBillRow(d.bill, section, index) })),
    toggleRowEveryone: (section, index) =>
      setDraft((d) => ({ ...d, bill: toggleRowEveryone(d.bill, section, index) })),
    toggleRowMember: (section, index, member) =>
      setDraft((d) => {
        const picked = d.allSelected ? members : members.filter((m) => d.owners[m]);
        return { ...d, bill: toggleRowMember(d.bill, section, index, member, picked) };
      }),
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
    (draft.mode === 'equal'
      ? num(draft.price) > 0 && selectedOwners.length > 0
      : enteredTotal > 0 &&
        missingPrice === null &&
        billView.sharedHint === null &&
        billView.discountHint === null &&
        billView.chargeHint === null &&
        billView.floorHint === null);
  // The date and payor are stamped on the item, so they are checked here and
  // not at Save. A payor name that is no longer a member doesn't count.
  const payorValid =
    payorMode === 'single'
      ? members.includes(singlePayor)
      : contributionsMatch(typedContributions, itemTotal);
  const canAddItem = itemValid && date !== '' && payorValid;

  const stampItem = (id: string): StagedItem =>
    stampFields({ date, payorMode, singlePayor, contributions, draft }, members, id);

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
    const fields = fieldsFromStaged(row, members);
    setDate(fields.date);
    setPayorMode(fields.payorMode);
    setSinglePayor(fields.singlePayor);
    setContributions(fields.contributions);
    setDraft(fields.draft);
    // So a phone user sees the fields fill. Date takes focus only with a fine
    // pointer: on touch it would open the keyboard or the date picker unasked.
    sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (!window.matchMedia('(pointer: coarse)').matches) {
      document.getElementById('purchase-date')?.focus({ preventScroll: true });
    }
  };

  /** Ends the edit the same way for Save Edits and Cancel (BR-15). */
  const endEdit = useCallback((current: { id: string; restore: EditRestore }) => {
    const { restore } = current;
    setDate(restore.date);
    setPayorMode(restore.payorMode);
    setSinglePayor(restore.singlePayor);
    setContributions({});
    setDraft({ ...EMPTY_DRAFT, mode: restore.mode });
    restoreFocusTo.current = current.id;
    setEditing(null);
  }, []);

  const saveSavedEdit = () => {
    if (!savedEdit || !savedBoot || !canAddItem) return;
    const next = stampItem(savedEdit.itemId);
    // Nothing changed writes nothing, so an old item is never rewritten (BR-CO32, AC-CO9.2).
    if (!sameStaged(next, savedBoot.baseline)) saveItemEdit(savedEdit, next);
    onSavedEditEnd(false);
  };

  const saveEdits = () => {
    if (!editing || !canAddItem) return;
    // Same id, same place in the list, newly stamped (BR-11).
    const stamped = stampItem(editing.id);
    setStaged((prev) => prev.map((s) => (s.item.id === editing.id ? stamped : s)));
    endEdit(editing);
    dispatch({ type: 'itemAdded' });
  };

  // A member can go from this device, another one or the dev bar, so this
  // works from what changed in `members` rather than from the Remove button.
  // Staged items and the fields are cleaned the way saved records are (BR-16 to
  // BR-18), and an edit whose row is gone ends as Cancel does (AC-6.6).
  const previousMembers = useRef(members);
  useEffect(() => {
    const removed = previousMembers.current.filter((m) => !members.includes(m));
    previousMembers.current = members;
    if (removed.length === 0) return;

    const next = removed.reduce(purgeMemberFromStaged, staged);
    setStaged(next);
    setDraft((d) => {
      // `allSelected` is left alone: it means "every current member".
      const owners = { ...d.owners };
      const lines = { ...d.lines };
      for (const m of removed) {
        delete owners[m];
        delete lines[m];
      }
      // Rows keep their place; only the removed members come off them (AC-CA9.5).
      const pickedAfter = d.allSelected ? members : members.filter((m) => owners[m]);
      return { ...d, owners, lines, bill: unpickFromBill(d.bill, removed, pickedAfter) };
    });
    setContributions((c) => {
      const kept = { ...c };
      for (const m of removed) delete kept[m];
      return kept;
    });
    setSinglePayor((p) => (removed.includes(p) ? '' : p));

    if (editing) {
      const restore = removed.includes(editing.restore.singlePayor)
        ? { ...editing.restore, singlePayor: '' }
        : editing.restore;
      const current = { ...editing, restore };
      if (!next.some((s) => s.item.id === editing.id)) endEdit(current);
      else if (restore !== editing.restore) setEditing(current);
    }
  }, [members, staged, editing, setStaged, endEdit]);

  // The item can go while it is open: a member removal that takes its record
  // with its payor, Clear All, another device, or a "Try again" reload. The
  // edit then ends as Cancel does, with a note on Breakdown (BR-CO35). Clear All
  // also remounts the card, which finds no item and ends the edit straight away.
  useEffect(() => {
    if (savedEdit && !findSavedItem(records, savedEdit)) onSavedEditEnd(true);
  }, [records, savedEdit, onSavedEditEnd]);

  // So a phone user sees the fields fill, as Edit on a staged item does. Date
  // takes focus only with a fine pointer: on touch it would open the keyboard
  // or the date picker unasked. The focus comes first because focusing an
  // element, even with preventScroll, cancels a smooth scroll already under way.
  // On a phone the scroll lands on the "Editing saved item" line rather than the
  // top of the section: with Paid By open on a long group the section's top
  // leaves that line below the screen, and it is what says which item is open.
  useEffect(() => {
    if (!savedBoot) return;
    if (!window.matchMedia('(pointer: coarse)').matches) {
      document.getElementById('purchase-date')?.focus({ preventScroll: true });
    }
    const phone = window.matchMedia('(max-width: 640px)').matches;
    (phone ? savedNoteRef.current : sectionRef.current)?.scrollIntoView({
      block: 'start',
      behavior: 'smooth',
    });
  }, [savedBoot]);

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
    // The button is disabled only during an edit, of a staged or a saved item,
    // so a click with nothing staged says what, rather than the button just not
    // responding.
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

        {savedEdit && (
          <p className={styles.savedEditNote} ref={savedNoteRef}>
            Editing saved item: {savedEdit.name}
          </p>
        )}

        <div className={styles.subhead}>
          <span className={styles.subLabel}>Add Item</span>
          <ModeToggle
            ariaLabel="Item split mode"
            value={draft.mode}
            onChange={(mode) => {
              // The name and who is in the item stay, whether or not an edit is
              // open; the rest is specific to the mode being left (BR-CO4).
              setDraft((d) => {
                const keep = {
                  ...EMPTY_DRAFT,
                  mode,
                  name: d.name,
                  owners: d.owners,
                  allSelected: d.allSelected,
                };
                if (mode !== 'custom') return keep;
                // Equal Split's price becomes Custom Amounts' total, shared out
                // as each picked member's first line.
                const price = num(d.price);
                if (price <= 0) return keep;
                const picked = d.allSelected ? members : members.filter((m) => d.owners[m]);
                return {
                  ...keep,
                  totalAmount: price.toFixed(2),
                  lines: linesFromEqualSplit(price, picked),
                };
              });
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
            picked: selectedOwners,
            enteredTotal,
            blankCount: blankMembers.length,
            remainder,
            missingPrice,
            bill: billView,
          }}
        />

        <div className={styles.actions}>
          {savedEdit ? (
            <>
              <Button variant="ghost" onClick={() => onSavedEditEnd(false)}>
                Cancel
              </Button>
              <Button onClick={saveSavedEdit} disabled={!canAddItem}>
                Save Edits
              </Button>
            </>
          ) : editing ? (
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
        <Button variant="primary" onClick={save} disabled={editing !== null || savedEdit !== null}>
          Save to Breakdown →
        </Button>
      </div>
    </Card>
  );
}
