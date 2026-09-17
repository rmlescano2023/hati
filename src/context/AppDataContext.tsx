import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { EmptyState } from '../components/shared/EmptyState';
import { useSessionsStore } from './SessionsStoreContext';
import type { NewPurchaseRecord, PurchaseRecord } from '../types';

/**
 * The shape every page and component inside a session workspace consumes. It is
 * deliberately unchanged from when the app had a single global session, so
 * `MemberList`, `PurchaseItemCard`, `DevDataBar`, Breakdown and Summary need to
 * know nothing about sessions at all.
 */
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
  closeSession: () => void;
  replaceData: (data: { members: string[]; records: PurchaseRecord[] }) => void;
  resetAll: () => void;
};

const AppDataContext = createContext<AppDataValue | null>(null);

/**
 * Binds the sessions store to one open session. Mounted by the session
 * workspace rather than at the app root, so which session `useAppData()` refers
 * to is decided purely by which provider is wrapping the tree.
 */
export function AppDataProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const store = useSessionsStore();
  const session = store.sessions.find((s) => s.id === sessionId);

  const value = useMemo<AppDataValue | null>(() => {
    if (!session) return null;
    return {
      members: session.members,
      records: session.records,
      addMember: (name) => store.addMember(sessionId, name),
      removeMember: (name) => store.removeMember(sessionId, name),
      clearMembers: () => store.clearMembers(sessionId),
      addRecord: (input) => store.addRecord(sessionId, input),
      removeRecord: (recordId) => store.removeRecord(sessionId, recordId),
      removeItem: (recordId, itemId) => store.removeItem(sessionId, recordId, itemId),
      updateItemName: (recordId, itemId, name) =>
        store.updateItemName(sessionId, recordId, itemId, name),
      updateItemTotal: (recordId, itemId, total) =>
        store.updateItemTotal(sessionId, recordId, itemId, total),
      updateItemMemberAmount: (recordId, itemId, member, amount) =>
        store.updateItemMemberAmount(sessionId, recordId, itemId, member, amount),
      closeSession: () => store.closeSession(sessionId),
      replaceData: (data) => store.replaceSessionData(sessionId, data),
      // Scoped to this session on purpose: the dev Reset button should not be
      // able to wipe other drafts or anything already filed into History.
      resetAll: () => store.replaceSessionData(sessionId, { members: [], records: [] }),
    };
  }, [session, store, sessionId]);

  if (!value) {
    return (
      <EmptyState title="Session not found" description="It may have been closed elsewhere." />
    );
  }

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>');
  return ctx;
}

/**
 * The same context, but tolerant of there being no open session. History
 * renders the read-only Breakdown cards outside any session workspace, so the
 * components behind them must be able to render without a provider — their
 * editing callbacks are unreachable there anyway.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAppDataOptional(): AppDataValue | null {
  return useContext(AppDataContext);
}
