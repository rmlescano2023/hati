import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useServerSessions, type PaymentResult, type SyncStatus } from '../hooks/useServerSessions';
import { compareNames, toTitleCase } from '../lib/format';
import { roundMoney } from '../lib/money';
import { getItemShares } from '../lib/calculations';
import { createId } from '../lib/id';
import { applySessionName, normaliseSessionName } from '../lib/sessionName';
import type {
  NewPayment,
  NewPurchaseRecord,
  PurchaseItem,
  PurchaseRecord,
  Session,
} from '../types';

type SessionsStoreValue = {
  sessions: Session[];
  /**
   * Creates an empty draft, named if `name` has anything usable in it, and
   * returns its id for the caller to navigate into. `onDiscarded` is called if
   * the create fails before the draft was edited and it is taken off the
   * screen, so the caller can leave it; see `useServerSessions`.
   */
  createSession: (name?: string | null, onDiscarded?: () => void) => string;
  /** Names or renames a draft; a blank name clears it. Closed sessions are left alone. */
  renameSession: (sessionId: string, rawName: string) => void;
  /**
   * Finishes a draft. `me` is who the user said they are in it, or null for no
   * pick; it travels in the same save as the finish, so neither lands without
   * the other.
   */
  closeSession: (sessionId: string, me: string | null) => void;
  /** Sets who the user is in a finished session: a member, or `NOT_IN_SESSION`. */
  setMe: (sessionId: string, me: string) => void;
  /** Records payments on a finished session, all or nothing; see `useServerSessions`. */
  addPayments: (
    sessionId: string,
    payments: NewPayment[],
    onSettled?: (result: PaymentResult) => boolean | void,
    options?: { quiet?: boolean },
  ) => Promise<void>;
  /** Marks finished sessions as already settled, one all-or-nothing request each; see `useServerSessions`. */
  settleSessions: (sessionIds: string[]) => Promise<{ settled: string[]; failed: string[] }>;
  /** Undoes "already settled" on one session, in one request; see `useServerSessions`. */
  removeAllPayments: (sessionId: string) => void;
  /** Whether a payment write for the session is still waiting on the server; see `useServerSessions`. */
  isPaying: (sessionId: string) => boolean;
  /** Undoes one payment; see `useServerSessions`. */
  removePayment: (
    sessionId: string,
    paymentId: string,
    onSettled?: (result: PaymentResult) => void,
  ) => void;
  /** Removes a session outright. Unlike closing, nothing is kept. */
  deleteSession: (sessionId: string) => void;
  /** Moves a draft to the top of Home because the user opened it. Silent; see BR-8. */
  recordOpen: (sessionId: string) => void;
  addMember: (sessionId: string, rawName: string) => boolean;
  removeMember: (sessionId: string, name: string) => void;
  clearMembers: (sessionId: string) => void;
  /**
   * `onSettled` hears true once the server accepts a save carrying the new
   * record, or false once a failure is reported for it.
   */
  addRecord: (
    sessionId: string,
    input: NewPurchaseRecord,
    onSettled?: (saved: boolean) => void,
  ) => void;
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
  /** Dev-only seeding: swap the whole session list. On a shared database this deletes real sessions. */
  replaceAllSessions: (sessions: Session[]) => void;
  /** Dev-only seeding that only adds: nothing existing is deleted or re-saved. */
  appendSessions: (sessions: Session[]) => void;
  /** Where the current data stands with the server. */
  sync: {
    status: SyncStatus;
    error: string | null;
    /** True when retrying can't help, so the banner's button reloads and says "Refresh". */
    refresh: boolean;
    retry: () => void;
    /** True when "Try again" rolled back something whose write had failed. */
    reverted: boolean;
    dismissReverted: () => void;
  };
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
  const {
    sessions,
    mutateSession,
    addSession,
    removeSession,
    recordOpen,
    addPayments,
    settleSessions,
    removeAllPayments,
    removePayment,
    isPaying,
    replaceAll,
    appendAll,
    status,
    error,
    refresh,
    retry,
    reverted,
    dismissReverted,
  } = useServerSessions();

  /**
   * Apply `fn` to one session, leaving every other session untouched. Returning
   * the session unchanged (or the same object) makes the whole update a no-op.
   */
  /**
   * Apply `fn` to one session, leaving every other session untouched.
   * Returning the session unchanged (or the same object) makes the whole
   * update a no-op — including the write, which now names this session alone
   * rather than rewriting the account.
   */
  const updateSession = useCallback(
    (
      sessionId: string,
      fn: (session: Session) => Session,
      onSettled?: (saved: boolean) => void,
    ) => {
      mutateSession(sessionId, fn, onSettled);
    },
    [mutateSession],
  );

  /**
   * The common case: rewrite one session's records. No age check — a record
   * stays editable for as long as its session is open, and a closed session
   * is read-only by its status rather than by the dates inside it.
   *
   * `recordId` is still taken so callers read the same way, and so the record
   * being edited stays named at this seam.
   */
  const updateRecords = useCallback(
    (sessionId: string, _recordId: string, fn: (records: PurchaseRecord[]) => PurchaseRecord[]) => {
      updateSession(sessionId, (session) => ({ ...session, records: fn(session.records) }));
    },
    [updateSession],
  );

  const createSession = useCallback(
    (name?: string | null, onDiscarded?: () => void): string => {
      const id = createId('session');
      // The caller navigates into the session immediately, so the id is minted
      // here and the server catches up rather than being awaited.
      addSession(
        {
          id,
          status: 'draft',
          createdAt: new Date().toISOString(),
          closedAt: null,
          members: [],
          records: [],
          name: normaliseSessionName(name ?? null),
          activityAt: null,
          me: null,
          finishedWithCollection: false,
          payments: [],
        },
        onDiscarded,
      );
      return id;
    },
    [addSession],
  );

  const renameSession = useCallback(
    (sessionId: string, rawName: string) => {
      updateSession(sessionId, (session) => applySessionName(session, rawName));
    },
    [updateSession],
  );

  const closeSession = useCallback(
    (sessionId: string, me: string | null) => {
      updateSession(sessionId, (session) =>
        session.records.length === 0 || session.status === 'closed'
          ? session
          : {
              ...session,
              status: 'closed',
              closedAt: new Date().toISOString(),
              me: me ?? session.me,
              // Finished by a Hati with Collection, in the same save that finishes it,
              // so the mark can't be missing (Q1).
              finishedWithCollection: true,
            },
      );
    },
    [updateSession],
  );

  const setMe = useCallback(
    (sessionId: string, me: string) => {
      // Only a finished session has anyone to collect from, and an unchanged
      // pick returns the session itself, which sends nothing.
      updateSession(sessionId, (session) =>
        session.status !== 'closed' || session.me === me ? session : { ...session, me },
      );
    },
    [updateSession],
  );

  const deleteSession = useCallback(
    (sessionId: string) => {
      removeSession(sessionId);
    },
    [removeSession],
  );

  const addMember = useCallback(
    (sessionId: string, rawName: string): boolean => {
      const name = toTitleCase(rawName);
      if (!name) return false;
      const session = sessions.find((s) => s.id === sessionId);
      if (session?.members.some((m) => compareNames(m, name) === 0)) return false;

      updateSession(sessionId, (s) =>
        s.members.some((m) => compareNames(m, name) === 0)
          ? s
          : { ...s, members: [...s.members, name].sort(compareNames) },
      );
      return true;
    },
    [sessions, updateSession],
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
    (sessionId: string, input: NewPurchaseRecord, onSettled?: (saved: boolean) => void) => {
      updateSession(
        sessionId,
        (session) => ({
          ...session,
          records: [
            ...session.records,
            { ...input, id: createId('rec'), createdAt: new Date().toISOString() },
          ],
        }),
        onSettled,
      );
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

  const replaceAllSessions = useCallback((next: Session[]) => replaceAll(next), [replaceAll]);
  const appendSessions = useCallback((next: Session[]) => appendAll(next), [appendAll]);

  const value = useMemo<SessionsStoreValue>(
    () => ({
      sessions,
      createSession,
      renameSession,
      closeSession,
      setMe,
      addPayments,
      settleSessions,
      removeAllPayments,
      removePayment,
      isPaying,
      deleteSession,
      recordOpen,
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
      replaceAllSessions,
      appendSessions,
      sync: { status, error, refresh, retry, reverted, dismissReverted },
    }),
    [
      status,
      error,
      refresh,
      retry,
      reverted,
      dismissReverted,
      sessions,
      createSession,
      renameSession,
      closeSession,
      setMe,
      addPayments,
      settleSessions,
      removeAllPayments,
      removePayment,
      isPaying,
      deleteSession,
      recordOpen,
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
      replaceAllSessions,
      appendSessions,
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
