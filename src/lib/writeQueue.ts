/**
 * The rules that keep optimistic writes from losing or resurrecting data.
 * They are pure, with no React, `fetch` or `window`, so the hook that uses
 * them only wires them up and the rules themselves can be tested directly.
 */

import type { Session } from '../types';

type Send<T> = (value: T) => Promise<void>;

/**
 * One save at a time per session, with any saves made meanwhile folded into
 * one. The server takes overlapping saves for a session in whatever order they
 * reach its row lock, which isn't the order they were sent, so a stale copy
 * could land last. Values are whole sessions, so the latest copy already holds
 * every earlier edit and skipping the middle ones loses nothing.
 *
 * `send` travels with each value rather than being given to the factory, so
 * the queue holds no reference to the caller's fetcher and can't go stale.
 */
export function createSaveQueue<T>(): {
  /** Starts a drain and returns its promise, or returns null when folded into the running one. */
  enqueue(id: string, value: T, send: Send<T>): Promise<void> | null;
  /** True while `id` has a send in flight or a value waiting. */
  isBusy(id: string): boolean;
  /** True while `id` has a value waiting behind the in-flight send. */
  hasPending(id: string): boolean;
  /** Resolves once `id` has nothing in flight or waiting (at once if idle). Never rejects. */
  settled(id: string): Promise<void>;
} {
  const drains = new Map<string, Promise<void>>();
  const waiting = new Map<string, { value: T; send: Send<T> }>();

  return {
    enqueue(id, value, send) {
      if (drains.has(id)) {
        waiting.set(id, { value, send });
        return null;
      }
      const drain = (async () => {
        let next: { value: T; send: Send<T> } | undefined = { value, send };
        while (next) {
          try {
            await next.send(next.value);
          } catch {
            // The caller's send reports its own errors. A failure here must
            // not strand the newer copy waiting behind it.
          }
          next = waiting.get(id);
          waiting.delete(id);
        }
        drains.delete(id);
      })();
      drains.set(id, drain);
      return drain;
    },
    isBusy: (id) => drains.has(id),
    hasPending: (id) => waiting.has(id),
    settled: (id) => drains.get(id) ?? Promise.resolve(),
  };
}

/**
 * Counts writes the server hasn't confirmed yet, and says when that count
 * starts and stops being zero, so the caller can warn before the page is left
 * only while something would actually be lost.
 */
export function createPendingWrites(onChange: (busy: boolean) => void): {
  track(work: Promise<unknown>): void;
  readonly busy: boolean;
} {
  let count = 0;
  const done = () => {
    count -= 1;
    if (count === 0) onChange(false);
  };

  return {
    track(work) {
      count += 1;
      if (count === 1) onChange(true);
      // Handling both outcomes here is also what keeps a failed write from
      // surfacing as an unhandled rejection.
      void work.then(done, done);
    },
    get busy() {
      return count > 0;
    },
  };
}

/**
 * Tells a caller whether the server accepted a save that carries its edit,
 * for a confirmation shown where the edit was made. Every save sends the whole
 * session, so a save started after the edit carries it and one started before
 * doesn't. Waits therefore join the next save to start, and a success settles
 * only the waits that save carries.
 *
 * Failures follow what the banner reports. A plain failure with a newer copy
 * queued isn't reported, so its waits ride on with that copy. A reported one
 * fails every wait on the session, queued ones included, so a timeout is final
 * for the edits behind it too and a later success never reverses it.
 *
 * The caller marks each save with `sending` as it starts and then exactly one
 * of `saved`, `superseded` or `failed` once it settles. Each `onSettled` is
 * called once at most.
 */
export function createSaveConfirmations(): {
  /** Calls `onSettled` with true once the next save of `id` to start succeeds, or with false once a failure is reported. */
  wait(id: string, onSettled: (saved: boolean) => void): void;
  /** A save of `id` is starting, carrying every edit waited on so far. */
  sending(id: string): void;
  /** The save in flight for `id` succeeded. */
  saved(id: string): void;
  /** The save in flight failed unreported, and the newer copy queued behind it carries its edits on. */
  superseded(id: string): void;
  /** A failure was reported for `id`, failing every wait on it, sent or queued. */
  failed(id: string): void;
} {
  type Settle = (saved: boolean) => void;
  const waiting = new Map<string, Settle[]>();
  const inFlight = new Map<string, Settle[]>();
  const take = (map: Map<string, Settle[]>, id: string): Settle[] => {
    const list = map.get(id) ?? [];
    map.delete(id);
    return list;
  };

  return {
    wait(id, onSettled) {
      waiting.set(id, [...(waiting.get(id) ?? []), onSettled]);
    },
    sending(id) {
      inFlight.set(id, take(waiting, id));
    },
    saved(id) {
      for (const settle of take(inFlight, id)) settle(true);
    },
    superseded(id) {
      waiting.set(id, [...take(inFlight, id), ...take(waiting, id)]);
    },
    failed(id) {
      for (const settle of [...take(inFlight, id), ...take(waiting, id)]) settle(false);
    },
  };
}

/**
 * The list to show after a load. The server is the truth for every session
 * except those with a write it hasn't confirmed: an unconfirmed session keeps
 * its on-screen copy (and stays even if the server doesn't have it yet, as
 * with a create in flight), and a session being deleted stays gone. A session
 * whose last save failed is no longer unconfirmed, so "Try again" still
 * replaces it with the server's copy.
 */
export function mergeLoaded<S extends { id: string }>(
  server: S[],
  local: S[],
  isUnconfirmed: (id: string) => boolean,
  isDeleting: (id: string) => boolean,
): S[] {
  const localById = new Map(local.map((s) => [s.id, s]));
  const serverIds = new Set(server.map((s) => s.id));
  const merged = server.map((s) => (isUnconfirmed(s.id) ? (localById.get(s.id) ?? s) : s));
  for (const s of local) {
    if (isUnconfirmed(s.id) && !serverIds.has(s.id)) merged.push(s);
  }
  return merged.filter((s) => !isDeleting(s.id));
}

/**
 * The loaded list with the on-screen payments of the sessions `keep` names,
 * and the server's copy of everything else about them. A session whose save
 * failed must take the server's copy, so its rollback is shown and reported,
 * while a payment or undo that settled during that same load must not be
 * hidden or brought back by it.
 */
export function keepLocalPayments<S extends { id: string; payments: unknown }>(
  loaded: S[],
  local: S[],
  keep: (id: string) => boolean,
): S[] {
  const localById = new Map(local.map((s) => [s.id, s]));
  return loaded.map((s) => {
    const mine = keep(s.id) ? localById.get(s.id) : undefined;
    return mine ? { ...s, payments: mine.payments } : s;
  });
}

/**
 * How long one save, create, delete or load may take, token fetch included.
 * Local saves take 5 to 10 seconds, so this leaves room without leaving the
 * user to wait minutes on a request that is never coming back.
 */
export const WRITE_TIMEOUT_MS = 30_000;

export class TimeoutError extends Error {
  constructor() {
    super('The server took too long to answer.');
    this.name = 'TimeoutError';
  }
}

/**
 * Runs one server operation, abandoning it at `ms`. The timeout rejects
 * before the signal aborts, so the race always settles with `TimeoutError`
 * rather than the `AbortError` an aborted `fetch` throws. Whatever the work
 * does afterwards is ignored, and `Promise.race` has already handled it, so a
 * late rejection is never unhandled.
 */
export function withDeadline<T>(ms: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError());
      controller.abort();
    }, ms);
  });
  return Promise.race([work(controller.signal), deadline]).finally(() => clearTimeout(timer));
}

/**
 * An error whose message was written for the user. Anything else that is
 * thrown, such as the browser's "Failed to fetch" or a JSON parse error, is
 * about the machinery and means nothing to them.
 */
export class FriendlyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendlyError';
  }
}

/**
 * What a banner says for a thrown error: Hati's own words when it wrote them,
 * otherwise `fallback`, so a dropped connection never shows raw error text.
 */
export function messageOf(err: unknown, fallback: string): string {
  return err instanceof FriendlyError ? err.message : fallback;
}

/**
 * Sends one request with the user's token. A token that only arrives after
 * `signal` has aborted sends nothing: the attempt has already been reported
 * as failed, and a late write could undo a newer one.
 */
export async function authorisedFetch(
  getToken: () => Promise<string | null>,
  send: typeof fetch,
  path: string,
  init: RequestInit,
  signal?: AbortSignal,
): Promise<Response> {
  const token = await getToken();
  if (signal?.aborted) throw new TimeoutError();
  if (!token) throw new FriendlyError('Not signed in.');
  return send(path, {
    ...init,
    signal,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
}

/** What a save says when its session has gone from the server (404). */
export const DELETED_ELSEWHERE = 'This session was deleted on another device.';

/** The banner message for a save the server refused with `status`. */
export function saveFailedMessage(status: number): string {
  return status === 404 ? DELETED_ELSEWHERE : `Could not save your changes (${status}).`;
}

/**
 * Sends a save only once the session's row can exist. A save never creates a
 * session, so it waits for a create still in flight, and `send` is told to
 * create it first when that create failed. `createFailed` is read after the
 * wait, so a create that fails while the save waits is retried as well.
 */
export async function saveOnceCreated(
  created: Promise<unknown> | undefined,
  createFailed: () => boolean,
  send: (createFirst: boolean) => Promise<void>,
): Promise<void> {
  await created;
  await send(createFailed());
}

export type FailureKind = 'save' | 'delete' | 'load' | 'seed' | 'payment';

/**
 * One write or load that failed and hasn't been resolved yet. Keeping them
 * apart, rather than one global error, is what stops a success on one
 * session from hiding a failure on another. A `'save'` also covers a failed
 * create, because a later save of the session creates the row too. A
 * `'payment'` has already been reverted on screen, so it is left out of
 * `failedSessionIds` and never shows the reverted-edit note.
 */
export type Failure = {
  kind: FailureKind;
  sessionId: string | null;
  message: string;
  /** For a `'payment'`: the order its write started in (see `createWriteOrder`). */
  seq?: number;
};

/** Adds `next`, replacing any failure with the same kind and session, so it becomes the most recent. */
export function addFailure(list: readonly Failure[], next: Failure): Failure[] {
  return [...list.filter((f) => f.kind !== next.kind || f.sessionId !== next.sessionId), next];
}

/**
 * Removes the failure with this kind and session. Returns `list` itself when
 * there is none, so a state setter given the result skips the re-render.
 * With `by`, the order a successful write started in, a failure that started
 * after it stays, because that write's success says nothing about it.
 */
export function resolveFailure(
  list: readonly Failure[],
  kind: FailureKind,
  sessionId: string | null,
  by?: number,
): readonly Failure[] {
  const next = list.filter(
    (f) =>
      f.kind !== kind ||
      f.sessionId !== sessionId ||
      (by !== undefined && f.seq !== undefined && f.seq > by),
  );
  return next.length === list.length ? list : next;
}

/**
 * Puts a session's payment writes in the order they started, so a success
 * clears only the failures of writes that started before it. Writes settle in
 * whatever order the network allows: a failure that lands after a later write
 * succeeded is already out of date, and a success must not hide the failure of
 * a write that started after it.
 */
export function createWriteOrder(): {
  /** Numbers a write as it starts. */
  start(): number;
  /** The write numbered `seq` succeeded for `id`. */
  succeeded(id: string, seq: number): void;
  /** Whether a write that started after `seq` has succeeded for `id`. */
  laterSucceeded(id: string, seq: number): boolean;
} {
  let last = 0;
  const lastSuccess = new Map<string, number>();
  return {
    start: () => ++last,
    succeeded(id, seq) {
      lastSuccess.set(id, Math.max(lastSuccess.get(id) ?? 0, seq));
    },
    laterSucceeded: (id, seq) => (lastSuccess.get(id) ?? 0) > seq,
  };
}

/** The sessions whose save, create or delete failed, for the reverted-edit note. */
export function failedSessionIds(list: readonly Failure[]): string[] {
  return list.flatMap((f) =>
    (f.kind === 'save' || f.kind === 'delete') && f.sessionId !== null ? [f.sessionId] : [],
  );
}

/**
 * Whether a reload visibly replaced anything whose write had failed: a failed
 * session's copy changed, disappeared (a create that never landed) or
 * reappeared (a delete that never landed).
 */
export function revertedAny<S extends { id: string }>(
  failedIds: Iterable<string>,
  before: S[],
  after: S[],
  same: (a: S, b: S) => boolean,
): boolean {
  for (const id of failedIds) {
    const b = before.find((s) => s.id === id);
    const a = after.find((s) => s.id === id);
    if (!b !== !a) return true;
    if (b && a && !same(b, a)) return true;
  }
  return false;
}

/** Primitives by `===`, arrays in order, and plain objects regardless of key order. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => deepEqual(value, b[i]));
  }
  const aKeys = Object.keys(a);
  const bRecord = b as Record<string, unknown>;
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    (key) => key in bRecord && deepEqual((a as Record<string, unknown>)[key], bRecord[key]),
  );
}

/**
 * Whether two copies of a session show the user the same thing. Timestamps,
 * record order and key order are left out because the server rewrites them
 * even for a save that landed: a POSTed row gets the server's `now()`, `GET`
 * orders records by date, and `jsonb` reorders keys. Comparing them would show
 * a "not saved" note for a save that was saved.
 */
export function sameSessionContent(a: Session, b: Session): boolean {
  const records = (s: Session) =>
    s.records
      .map((record) => ({ ...record, createdAt: '' }))
      .sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return (
    a.name === b.name &&
    a.status === b.status &&
    a.me === b.me &&
    a.finishedWithCollection === b.finishedWithCollection &&
    deepEqual(a.members, b.members) &&
    deepEqual(records(a), records(b))
  );
}
