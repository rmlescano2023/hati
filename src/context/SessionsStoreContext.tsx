import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { parseAppData, serializeAppData, STORAGE_KEY } from '../lib/storage';
import { compareNames, toTitleCase } from '../lib/format';
import { roundMoney } from '../lib/money';
import { getItemShares } from '../lib/calculations';
import { createId } from '../lib/id';
import { isRecordEditable } from '../lib/freeze';
import type { AppData, NewPurchaseRecord, PurchaseItem, PurchaseRecord, Session } from '../types';

type SessionsStoreValue = {
  sessions: Session[];
  /** Creates an empty draft and returns its id, for the caller to navigate into. */
  createSession: () => string;
  closeSession: (sessionId: string) => void;
  addMember: (sessionId: string, rawName: string) => boolean;
  removeMember: (sessionId: string, name: string) => void;
  clearMembers: (sessionId: string) => void;
  addRecord: (sessionId: string, input: NewPurchaseRecord) => void;
  removeRecord: (sessionId: string, recordId: string) => void;
  removeItem: (sessionId: string, recordId: string, itemId: string) => void;
  updateItemName: (sessionId: string, recordId: string, itemId: string, name: string) => void;
  updateItemTotal: (sessionId: string, recordId: string, itemId: string, total: number) => void;
  updateItemMemberAmount: (
    sessionId: string,
    recordId: string,
    itemId: string,
    member: string,
    amount: number,
  ) => void;
  replaceSessionData: (
    sessionId: string,
    data: { members: string[]; records: PurchaseRecord[] },
  ) => void;
};

const SessionsStoreContext = createContext<SessionsStoreValue | null>(null);

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

/**
 * Records outside the edit window are read-only. The Breakdown UI already
 * disables their cells; this is the matching guard on the data layer, so a
 * stale render or a direct call can never mutate frozen history.
 */
function isEditable(records: PurchaseRecord[], recordId: string): boolean {
  const record = records.find((r) => r.id === recordId);
  return record !== undefined && isRecordEditable(record.date);
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

export function SessionsStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useLocalStorageState<AppData>(STORAGE_KEY, {
    deserialize: parseAppData,
    serialize: serializeAppData,
  });

  /**
   * Apply `fn` to one session, leaving every other session untouched. Returning
   * the session unchanged (or the same object) makes the whole update a no-op.
   */
  const updateSession = useCallback(
    (sessionId: string, fn: (session: Session) => Session) => {
      setData((prev) => {
        const index = prev.sessions.findIndex((s) => s.id === sessionId);
        if (index === -1) return prev;
        const next = fn(prev.sessions[index]);
        if (next === prev.sessions[index]) return prev;
        const sessions = [...prev.sessions];
        sessions[index] = next;
        return { ...prev, sessions };
      });
    },
    [setData],
  );

  /** The common case: rewrite one session's records, guarded by the freeze rule. */
  const updateRecords = useCallback(
    (sessionId: string, recordId: string, fn: (records: PurchaseRecord[]) => PurchaseRecord[]) => {
      updateSession(sessionId, (session) =>
        isEditable(session.records, recordId)
          ? { ...session, records: fn(session.records) }
          : session,
      );
    },
    [updateSession],
  );

  const createSession = useCallback((): string => {
    const id = createId('session');
    setData((prev) => ({
      ...prev,
      sessions: [
        ...prev.sessions,
        {
          id,
          status: 'draft',
          createdAt: new Date().toISOString(),
          closedAt: null,
          members: [],
          records: [],
        },
      ],
    }));
    return id;
  }, [setData]);

  const closeSession = useCallback(
    (sessionId: string) => {
      updateSession(sessionId, (session) =>
        session.records.length === 0 || session.status === 'closed'
          ? session
          : { ...session, status: 'closed', closedAt: new Date().toISOString() },
      );
    },
    [updateSession],
  );

  const addMember = useCallback(
    (sessionId: string, rawName: string): boolean => {
      const name = toTitleCase(rawName);
      if (!name) return false;
      const session = data.sessions.find((s) => s.id === sessionId);
      if (session?.members.some((m) => compareNames(m, name) === 0)) return false;

      updateSession(sessionId, (s) =>
        s.members.some((m) => compareNames(m, name) === 0)
          ? s
          : { ...s, members: [...s.members, name].sort(compareNames) },
      );
      return true;
    },
    [data.sessions, updateSession],
  );

  const removeMember = useCallback(
    (sessionId: string, name: string) => {
      updateSession(sessionId, (session) => ({
        ...session,
        members: session.members.filter((m) => m !== name),
        records: session.records
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
    [updateSession],
  );

  const clearMembers = useCallback(
    (sessionId: string) => {
      updateSession(sessionId, (session) => ({ ...session, members: [], records: [] }));
    },
    [updateSession],
  );

  const addRecord = useCallback(
    (sessionId: string, input: NewPurchaseRecord) => {
      updateSession(sessionId, (session) => ({
        ...session,
        records: [
          ...session.records,
          { ...input, id: createId('rec'), createdAt: new Date().toISOString() },
        ],
      }));
    },
    [updateSession],
  );

  const removeRecord = useCallback(
    (sessionId: string, recordId: string) => {
      updateRecords(sessionId, recordId, (records) => records.filter((r) => r.id !== recordId));
    },
    [updateRecords],
  );

  const removeItem = useCallback(
    (sessionId: string, recordId: string, itemId: string) => {
      updateRecords(sessionId, recordId, (records) =>
        mapRecordItem(records, recordId, itemId, () => null),
      );
    },
    [updateRecords],
  );

  const updateItemName = useCallback(
    (sessionId: string, recordId: string, itemId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateRecords(sessionId, recordId, (records) =>
        mapRecordItem(records, recordId, itemId, (item) => ({ ...item, name: trimmed })),
      );
    },
    [updateRecords],
  );

  const updateItemTotal = useCallback(
    (sessionId: string, recordId: string, itemId: string, total: number) => {
      const next = roundMoney(Math.max(0, total));
      updateRecords(sessionId, recordId, (records) =>
        mapRecordItem(records, recordId, itemId, (item) => {
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
      );
    },
    [updateRecords],
  );

  const updateItemMemberAmount = useCallback(
    (sessionId: string, recordId: string, itemId: string, member: string, amount: number) => {
      const next = roundMoney(Math.max(0, amount));
      updateRecords(sessionId, recordId, (records) =>
        mapRecordItem(records, recordId, itemId, (item) => {
          // Editing one member's cell means the split is no longer equal, so the
          // item becomes a custom-amount item carrying the shares it already had.
          const custom = toCustomItem(item);
          if (custom.mode !== 'custom') return custom;
          const amounts = { ...custom.amounts };
          if (next <= 0) delete amounts[member];
          else amounts[member] = next;
          return Object.keys(amounts).length > 0 ? { ...custom, amounts } : null;
        }),
      );
    },
    [updateRecords],
  );

  const replaceSessionData = useCallback(
    (sessionId: string, next: { members: string[]; records: PurchaseRecord[] }) => {
      updateSession(sessionId, (session) => ({
        ...session,
        members: [...next.members].sort(compareNames),
        records: next.records,
      }));
    },
    [updateSession],
  );

  const value = useMemo<SessionsStoreValue>(
    () => ({
      sessions: data.sessions,
      createSession,
      closeSession,
      addMember,
      removeMember,
      clearMembers,
      addRecord,
      removeRecord,
      removeItem,
      updateItemName,
      updateItemTotal,
      updateItemMemberAmount,
      replaceSessionData,
    }),
    [
      data.sessions,
      createSession,
      closeSession,
      addMember,
      removeMember,
      clearMembers,
      addRecord,
      removeRecord,
      removeItem,
      updateItemName,
      updateItemTotal,
      updateItemMemberAmount,
      replaceSessionData,
    ],
  );

  return <SessionsStoreContext.Provider value={value}>{children}</SessionsStoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSessionsStore(): SessionsStoreValue {
  const ctx = useContext(SessionsStoreContext);
  if (!ctx) throw new Error('useSessionsStore must be used inside <SessionsStoreProvider>');
  return ctx;
}
