/**
 * The rules that keep optimistic writes from losing or resurrecting data.
 * They are pure, with no React, `fetch` or `window`, so the hook that uses
 * them only wires them up and the rules themselves can be tested directly.
 */

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
