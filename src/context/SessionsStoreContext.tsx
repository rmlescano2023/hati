import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  useServerSessions,
  type PaymentResult,
  type SessionsBackend,
  type SyncStatus,
} from '../hooks/useServerSessions';
import { useMemorySessions } from '../hooks/useMemorySessions';
import { compareNames, toTitleCase } from '../lib/format';
import { purgeMemberFromItem } from '../lib/calculations';
import { includeMember, type ItemRef } from '../lib/includeMember';
import { createId } from '../lib/id';
import { applyItemEdit, type StagedItem } from '../lib/staging';
import { isJoined } from '../lib/collection';
import { applySessionName, normaliseSessionName } from '../lib/sessionName';
import type {
  ClaimDecision,
  NewClaim,
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
  /** A joined debtor says they've paid; see `useServerSessions`. */
  addClaims: (
    sessionId: string,
    claims: NewClaim[],
    onSettled?: (result: PaymentResult) => boolean | void,
    options?: { quiet?: boolean },
  ) => Promise<void>;
  /** Confirms or declines a claim; see `useServerSessions`. */
  decideClaim: (
    sessionId: string,
    claimId: string,
    decision: ClaimDecision,
    onSettled?: (result: PaymentResult) => boolean | void,
  ) => void;
  /** Withdraws a pending claim or dismisses a declined one; see `useServerSessions`. */
  removeClaim: (
    sessionId: string,
    claimId: string,
    onSettled?: (result: PaymentResult) => boolean | void,
  ) => void;
  /** Removes a session outright. Unlike closing, nothing is kept. A joined session is never deleted: leave it instead. */
  deleteSession: (sessionId: string) => void;
  /** Puts a session the account has just joined on screen; see `useServerSessions`. */
  addJoinedSession: (session: Session) => void;
  /** Stops tracking a joined session; see `useServerSessions`. */
  leaveSession: (sessionId: string) => void;
  /** The organizer removes a joined account; see `useServerSessions`. */
  removeParticipant: (sessionId: string, member: string) => Promise<boolean>;
  /** Moves a draft to the top of Home because the user opened it. Silent; see BR-8. */
  recordOpen: (sessionId: string) => void;
  /**
   * `include` makes the new member an owner of those saved Equal Split items in
   * the same change, so the member and their shares are saved together.
   */
  addMember: (sessionId: string, rawName: string, include?: ItemRef[]) => boolean;
  removeMember: (sessionId: string, name: string) => void;
  clearMembers: (sessionId: string) => void;
  /**
   * Adds several records in one change, so they are saved together or not at
   * all. `onSettled` hears true once the server accepts a save carrying them,
   * or false once a failure is reported for it.
   */
  addRecords: (
    sessionId: string,
    inputs: NewPurchaseRecord[],
    onSettled?: (saved: boolean) => void,
  ) => void;
  removeRecord: (sessionId: string, recordId: string) => void;
  removeItem: (sessionId: string, recordId: string, itemId: string) => void;
  /**
   * Writes an edited saved item back in one change: in place, or moved to the
   * record its new Date and Paid By belong to. Does nothing if the item has gone.
   */
  saveItemEdit: (sessionId: string, ref: ItemRef, next: StagedItem) => void;
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
    /** True once a load has succeeded; until then an empty list is not an empty account. */
    loaded: boolean;
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
  return <SessionsStoreCore backend={useServerSessions()}>{children}</SessionsStoreCore>;
}

/** A guide's practice store: the same domain logic over memory, with no request ever sent (BR-TG3). */
export function PracticeSessionsProvider({
  seed,
  children,
}: {
  seed: Session[];
  children: ReactNode;
}) {
  return <SessionsStoreCore backend={useMemorySessions(seed)}>{children}</SessionsStoreCore>;
}

function SessionsStoreCore({
  backend,
  children,
}: {
  backend: SessionsBackend;
  children: ReactNode;
}) {
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
    addClaims,
    decideClaim,
    removeClaim,
    isPaying,
    replaceAll,
    appendAll,
    addJoinedSession,
    leaveSession,
    removeParticipant,
    status,
    loaded,
    error,
    refresh,
    retry,
    reverted,
    dismissReverted,
  } = backend;

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
      // A joined session is read-only. No screen offers an edit on one, and the server refuses a
      // save of a finished session's content anyway; this is the backstop, so a stray call is a
      // no-op that sends nothing.
      mutateSession(sessionId, (session) => (isJoined(session) ? session : fn(session)), onSettled);
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
      // A participant can't delete the organizer's session. The server would answer 404 and the
      // card would come back, so it never leaves the screen at all.
      if (sessions.some((s) => s.id === sessionId && isJoined(s))) return;
      removeSession(sessionId);
    },
    [removeSession, sessions],
  );

  const addMember = useCallback(
    (sessionId: string, rawName: string, include: ItemRef[] = []): boolean => {
      const name = toTitleCase(rawName);
      if (!name) return false;
      const session = sessions.find((s) => s.id === sessionId);
      if (session?.members.some((m) => compareNames(m, name) === 0)) return false;

      updateSession(sessionId, (s) =>
        s.members.some((m) => compareNames(m, name) === 0)
          ? s
          : {
              ...s,
              members: [...s.members, name].sort(compareNames),
              // The member and their shares travel in the same change, so
              // they're saved together or not at all.
              records: include.length > 0 ? includeMember(s.records, name, include) : s.records,
            },
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

  const addRecords = useCallback(
    (sessionId: string, inputs: NewPurchaseRecord[], onSettled?: (saved: boolean) => void) => {
      // One change for the whole click, so its records are saved together or not at
      // all (BR-6). Each gets its own millisecond, in staging order: the server reads
      // records back ordered by date and created_at, and a tie there has no defined
      // order (BR-9).
      const base = Date.now();
      updateSession(
        sessionId,
        (session) => ({
          ...session,
          records: [
            ...session.records,
            ...inputs.map((input, i) => ({
              ...input,
              id: createId('rec'),
              createdAt: new Date(base + i).toISOString(),
            })),
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

  const saveItemEdit = useCallback(
    (sessionId: string, ref: ItemRef, next: StagedItem) => {
      // One change, so the item leaves its old place and lands in its new one in
      // a single write, or not at all (AC-CO8.1).
      const fresh = { id: createId('rec'), createdAt: new Date().toISOString() };
      updateSession(sessionId, (session) => {
        const records = applyItemEdit(session.records, ref, next, fresh);
        return records === session.records ? session : { ...session, records };
      });
    },
    [updateSession],
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
      addClaims,
      decideClaim,
      removeClaim,
      isPaying,
      deleteSession,
      addJoinedSession,
      leaveSession,
      removeParticipant,
      recordOpen,
      addMember,
      removeMember,
      clearMembers,
      addRecords,
      removeRecord,
      removeItem,
      saveItemEdit,
      replaceSessionData,
      replaceAllSessions,
      appendSessions,
      sync: { status, loaded, error, refresh, retry, reverted, dismissReverted },
    }),
    [
      status,
      loaded,
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
      addClaims,
      decideClaim,
      removeClaim,
      isPaying,
      deleteSession,
      addJoinedSession,
      leaveSession,
      removeParticipant,
      recordOpen,
      addMember,
      removeMember,
      clearMembers,
      addRecords,
      removeRecord,
      removeItem,
      saveItemEdit,
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
