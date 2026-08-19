import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { parseAppData, serializeAppData, STORAGE_KEY, EMPTY_DATA } from '../lib/storage';
import { compareNames, toTitleCase } from '../lib/format';
import { roundMoney } from '../lib/money';
import { getItemShares } from '../lib/calculations';
import { createId } from '../lib/id';
import type { AppData, NewPurchaseRecord, PurchaseItem, PurchaseRecord } from '../types';

type AppDataValue = {
  members: string[];
  records: PurchaseRecord[];
  addMember: (rawName: string) => boolean;
  removeMember: (name: string) => void;
  clearMembers: () => void;
  addRecord: (input: NewPurchaseRecord) => void;
  removeRecord: (recordId: string) => void;
  removeItem: (recordId: string, itemId: string) => void;
  updateItemName: (recordId: string, itemId: string, name: string) => void;
  updateItemTotal: (recordId: string, itemId: string, total: number) => void;
  updateItemMemberAmount: (
    recordId: string,
    itemId: string,
    member: string,
    amount: number,
  ) => void;
  replaceData: (data: AppData) => void;
  resetAll: () => void;
};

const AppDataContext = createContext<AppDataValue | null>(null);

/** Drop a member out of an item, keeping the remaining members' shares unchanged. */
function purgeMemberFromItem(item: PurchaseItem, member: string): PurchaseItem | null {
  if (item.mode === 'custom') {
    if (!(member in item.amounts)) return item;
    const amounts = { ...item.amounts };
    delete amounts[member];
    return Object.keys(amounts).length > 0 ? { ...item, amounts } : null;
  }

  if (!item.owners.includes(member)) return item;
  const owners = item.owners.filter((o) => o !== member);
  if (owners.length === 0) return null;
  // Shrink the total by the departing member's share so nobody else's share moves.
  const shares = getItemShares(item);
  const totalPrice = roundMoney(item.totalPrice - (shares[member] ?? 0));
  return { ...item, owners, totalPrice };
}

/** Convert an equal-split item into the custom-amount item with the same shares. */
function toCustomItem(item: PurchaseItem): PurchaseItem {
  if (item.mode === 'custom') return item;
  return { id: item.id, mode: 'custom', name: item.name, amounts: getItemShares(item) };
}

function mapRecordItem(
  records: PurchaseRecord[],
  recordId: string,
  itemId: string,
  fn: (item: PurchaseItem) => PurchaseItem | null,
): PurchaseRecord[] {
  return records
    .map((record) => {
      if (record.id !== recordId) return record;
      const items = record.items
        .map((item) => (item.id === itemId ? fn(item) : item))
        .filter((item): item is PurchaseItem => item !== null);
      return { ...record, items };
    })
    .filter((record) => record.items.length > 0);
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useLocalStorageState<AppData>(STORAGE_KEY, {
    deserialize: parseAppData,
    serialize: serializeAppData,
  });

  const addMember = useCallback(
    (rawName: string) => {
      const name = toTitleCase(rawName);
      if (!name) return false;
      if (data.members.some((m) => compareNames(m, name) === 0)) return false;
      setData((prev) =>
        prev.members.some((m) => compareNames(m, name) === 0)
          ? prev
          : { ...prev, members: [...prev.members, name].sort(compareNames) },
      );
      return true;
    },
    [data.members, setData],
  );

  const removeMember = useCallback(
    (name: string) => {
      setData((prev) => ({
        ...prev,
        members: prev.members.filter((m) => m !== name),
        records: prev.records
          .map((record) => ({
            ...record,
            payors: record.payors.filter((p) => p.member !== name),
            items: record.items
              .map((item) => purgeMemberFromItem(item, name))
              .filter((item): item is PurchaseItem => item !== null),
          }))
          .filter((record) => record.payors.length > 0 && record.items.length > 0),
      }));
    },
    [setData],
  );

  const clearMembers = useCallback(() => {
    setData((prev) => ({ ...prev, members: [], records: [] }));
  }, [setData]);

  const addRecord = useCallback(
    (input: NewPurchaseRecord) => {
      setData((prev) => ({
        ...prev,
        records: [
          ...prev.records,
          {
            ...input,
            id: createId('rec'),
            createdAt: new Date().toISOString(),
          },
        ],
      }));
    },
    [setData],
  );

  const removeRecord = useCallback(
    (recordId: string) => {
      setData((prev) => ({ ...prev, records: prev.records.filter((r) => r.id !== recordId) }));
    },
    [setData],
  );

  const removeItem = useCallback(
    (recordId: string, itemId: string) => {
      setData((prev) => ({
        ...prev,
        records: mapRecordItem(prev.records, recordId, itemId, () => null),
      }));
    },
    [setData],
  );

  const updateItemName = useCallback(
    (recordId: string, itemId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setData((prev) => ({
        ...prev,
        records: mapRecordItem(prev.records, recordId, itemId, (item) => ({
          ...item,
          name: trimmed,
        })),
      }));
    },
    [setData],
  );

  const updateItemTotal = useCallback(
    (recordId: string, itemId: string, total: number) => {
      const next = roundMoney(Math.max(0, total));
      setData((prev) => ({
        ...prev,
        records: mapRecordItem(prev.records, recordId, itemId, (item) => {
          if (item.mode === 'equal') return { ...item, totalPrice: next };
          // Custom amounts: scale every member's share to hit the new total.
          const current = Object.values(item.amounts).reduce((a, b) => a + b, 0);
          if (current <= 0) return item;
          const factor = next / current;
          const amounts: Record<string, number> = {};
          for (const [member, amount] of Object.entries(item.amounts)) {
            amounts[member] = roundMoney(amount * factor);
          }
          return { ...item, amounts };
        }),
      }));
    },
    [setData],
  );

  const updateItemMemberAmount = useCallback(
    (recordId: string, itemId: string, member: string, amount: number) => {
      const next = roundMoney(Math.max(0, amount));
      setData((prev) => ({
        ...prev,
        records: mapRecordItem(prev.records, recordId, itemId, (item) => {
          // Editing one member's cell means the split is no longer equal, so the
          // item becomes a custom-amount item carrying the shares it already had.
          const custom = toCustomItem(item);
          if (custom.mode !== 'custom') return custom;
          const amounts = { ...custom.amounts };
          if (next <= 0) delete amounts[member];
          else amounts[member] = next;
          return Object.keys(amounts).length > 0 ? { ...custom, amounts } : null;
        }),
      }));
    },
    [setData],
  );

  const replaceData = useCallback(
    (next: AppData) => {
      setData({ ...next, members: [...next.members].sort(compareNames) });
    },
    [setData],
  );

  const resetAll = useCallback(() => setData(EMPTY_DATA), [setData]);

  const value = useMemo<AppDataValue>(
    () => ({
      members: data.members,
      records: data.records,
      addMember,
      removeMember,
      clearMembers,
      addRecord,
      removeRecord,
      removeItem,
      updateItemName,
      updateItemTotal,
      updateItemMemberAmount,
      replaceData,
      resetAll,
    }),
    [
      data.members,
      data.records,
      addMember,
      removeMember,
      clearMembers,
      addRecord,
      removeRecord,
      removeItem,
      updateItemName,
      updateItemTotal,
      updateItemMemberAmount,
      replaceData,
      resetAll,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>');
  return ctx;
}
