import { describe, expect, it, vi } from 'vitest';
import { createPendingWrites, createSaveQueue, mergeLoaded } from './writeQueue';

/** A promise the test settles by hand, so it decides when a "request" lands. */
function deferred() {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every queued `then` run, so the queue can move on after a settle. */
const flush = () => new Promise((res) => setTimeout(res, 0));

/**
 * A `send` that records each value and hands back a deferred per call, so a
 * test can see what was sent and settle each one when it chooses.
 */
function recordingSend() {
  const sent: string[] = [];
  const calls: ReturnType<typeof deferred>[] = [];
  const send = vi.fn((value: string) => {
    sent.push(value);
    const d = deferred();
    calls.push(d);
    return d.promise;
  });
  return { send, sent, calls };
}

describe('createSaveQueue', () => {
  it('sends straight away for an idle id and returns the drain', () => {
    const queue = createSaveQueue<string>();
    const { send, sent } = recordingSend();
    const drain = queue.enqueue('a', 'v1', send);
    expect(drain).toBeInstanceOf(Promise);
    expect(sent).toEqual(['v1']);
  });

  it('holds a second value while one is in flight, then sends it', async () => {
    const queue = createSaveQueue<string>();
    const { send, sent, calls } = recordingSend();
    queue.enqueue('a', 'v1', send);
    expect(queue.enqueue('a', 'v2', send)).toBeNull();
    expect(sent).toEqual(['v1']);
    calls[0].resolve();
    await flush();
    expect(sent).toEqual(['v1', 'v2']);
  });

  it('sends only the first and the last of several values', async () => {
    const queue = createSaveQueue<string>();
    const { send, sent, calls } = recordingSend();
    queue.enqueue('a', 'v1', send);
    queue.enqueue('a', 'v2', send);
    queue.enqueue('a', 'v3', send);
    queue.enqueue('a', 'v4', send);
    calls[0].resolve();
    await flush();
    calls[1].resolve();
    await flush();
    expect(sent).toEqual(['v1', 'v4']);
  });

  it('uses the send stored with the latest value', async () => {
    const queue = createSaveQueue<string>();
    const first = recordingSend();
    const second = recordingSend();
    const third = recordingSend();
    queue.enqueue('a', 'v1', first.send);
    queue.enqueue('a', 'v2', second.send);
    queue.enqueue('a', 'v3', third.send);
    first.calls[0].resolve();
    await flush();
    expect(second.send).not.toHaveBeenCalled();
    expect(third.sent).toEqual(['v3']);
  });

  it('runs different ids at the same time', () => {
    const queue = createSaveQueue<string>();
    const { send, sent } = recordingSend();
    expect(queue.enqueue('a', 'a1', send)).not.toBeNull();
    expect(queue.enqueue('b', 'b1', send)).not.toBeNull();
    expect(sent).toEqual(['a1', 'b1']);
  });

  it('moves on after a rejected send, and the drain still resolves', async () => {
    const queue = createSaveQueue<string>();
    const { send, sent, calls } = recordingSend();
    const drain = queue.enqueue('a', 'v1', send);
    queue.enqueue('a', 'v2', send);
    calls[0].reject(new Error('offline'));
    await flush();
    expect(sent).toEqual(['v1', 'v2']);
    calls[1].resolve();
    await expect(drain).resolves.toBeUndefined();
  });

  it('settles at once when idle, and otherwise only after the pending value is sent', async () => {
    const queue = createSaveQueue<string>();
    await expect(queue.settled('a')).resolves.toBeUndefined();

    const { send, calls } = recordingSend();
    queue.enqueue('a', 'v1', send);
    queue.enqueue('a', 'v2', send);
    let settled = false;
    void queue.settled('a').then(() => {
      settled = true;
    });
    calls[0].resolve();
    await flush();
    expect(settled).toBe(false);
    calls[1].resolve();
    await flush();
    expect(settled).toBe(true);
  });

  it('reports busy and pending at the right moments', async () => {
    const queue = createSaveQueue<string>();
    const { send, calls } = recordingSend();
    expect(queue.isBusy('a')).toBe(false);
    expect(queue.hasPending('a')).toBe(false);

    queue.enqueue('a', 'v1', send);
    expect(queue.isBusy('a')).toBe(true);
    expect(queue.hasPending('a')).toBe(false);

    queue.enqueue('a', 'v2', send);
    expect(queue.hasPending('a')).toBe(true);

    calls[0].resolve();
    await flush();
    expect(queue.isBusy('a')).toBe(true);
    expect(queue.hasPending('a')).toBe(false);

    calls[1].resolve();
    await flush();
    expect(queue.isBusy('a')).toBe(false);
    expect(queue.hasPending('a')).toBe(false);
  });
});

describe('createPendingWrites', () => {
  it('reports busy once for the first tracked write, not again for the second', () => {
    const onChange = vi.fn();
    const pending = createPendingWrites(onChange);
    pending.track(deferred().promise);
    pending.track(deferred().promise);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('reports idle once when the last write settles, including when it rejects', async () => {
    const onChange = vi.fn();
    const pending = createPendingWrites(onChange);
    const first = deferred();
    const second = deferred();
    pending.track(first.promise);
    pending.track(second.promise);
    first.resolve();
    await flush();
    expect(onChange.mock.calls).toEqual([[true]]);
    second.reject(new Error('offline'));
    await flush();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('follows the count with busy, and re-arms after going idle', async () => {
    const onChange = vi.fn();
    const pending = createPendingWrites(onChange);
    expect(pending.busy).toBe(false);

    const first = deferred();
    pending.track(first.promise);
    expect(pending.busy).toBe(true);
    first.resolve();
    await flush();
    expect(pending.busy).toBe(false);

    const second = deferred();
    pending.track(second.promise);
    expect(pending.busy).toBe(true);
    second.resolve();
    await flush();
    expect(pending.busy).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  // Vitest fails the whole run on an unhandled rejection, so this passes only
  // if `track` handles the rejection itself.
  it('never leaves a tracked rejection unhandled', async () => {
    const pending = createPendingWrites(() => {});
    pending.track(Promise.reject(new Error('offline')));
    await flush();
    expect(pending.busy).toBe(false);
  });
});

describe('mergeLoaded', () => {
  type S = { id: string; v: string };
  const none = () => false;
  const only =
    (...ids: string[]) =>
    (id: string) =>
      ids.includes(id);

  it('takes the server copy of an idle session', () => {
    const merged = mergeLoaded<S>(
      [{ id: 'a', v: 'server' }],
      [{ id: 'a', v: 'local' }],
      none,
      none,
    );
    expect(merged).toEqual([{ id: 'a', v: 'server' }]);
  });

  it("keeps the local copy of an unconfirmed session, in the server's position", () => {
    const server = [
      { id: 'a', v: 'server' },
      { id: 'b', v: 'server' },
      { id: 'c', v: 'server' },
    ];
    const local = [
      { id: 'b', v: 'local' },
      { id: 'a', v: 'local' },
      { id: 'c', v: 'local' },
    ];
    expect(mergeLoaded<S>(server, local, only('b'), none)).toEqual([
      { id: 'a', v: 'server' },
      { id: 'b', v: 'local' },
      { id: 'c', v: 'server' },
    ]);
  });

  it('appends an unconfirmed local session the server does not have yet', () => {
    const server = [{ id: 'a', v: 'server' }];
    const local = [
      { id: 'n2', v: 'local' },
      { id: 'a', v: 'local' },
      { id: 'n1', v: 'local' },
    ];
    expect(mergeLoaded<S>(server, local, only('n1', 'n2'), none)).toEqual([
      { id: 'a', v: 'server' },
      { id: 'n2', v: 'local' },
      { id: 'n1', v: 'local' },
    ]);
  });

  it('drops an idle local session the server does not have', () => {
    const merged = mergeLoaded<S>(
      [{ id: 'a', v: 'server' }],
      [{ id: 'gone', v: 'local' }],
      none,
      none,
    );
    expect(merged).toEqual([{ id: 'a', v: 'server' }]);
  });

  it('leaves out a session being deleted, even when the server returns it', () => {
    const server = [
      { id: 'a', v: 'server' },
      { id: 'b', v: 'server' },
    ];
    expect(mergeLoaded<S>(server, [], none, only('b'))).toEqual([{ id: 'a', v: 'server' }]);
  });

  it("follows the server's order", () => {
    const server = [
      { id: 'c', v: 'server' },
      { id: 'a', v: 'server' },
      { id: 'b', v: 'server' },
    ];
    const local = [
      { id: 'a', v: 'local' },
      { id: 'b', v: 'local' },
      { id: 'c', v: 'local' },
    ];
    expect(mergeLoaded<S>(server, local, none, none).map((s) => s.id)).toEqual(['c', 'a', 'b']);
  });
});
