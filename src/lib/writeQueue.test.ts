import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../types';
import {
  DELETED_ELSEWHERE,
  TimeoutError,
  WRITE_TIMEOUT_MS,
  addFailure,
  authorisedFetch,
  ALREADY_SETTLED,
  FriendlyError,
  SIGNED_OUT,
  WHOLE_SESSION,
  DELETED_ELSEWHERE_MANY,
  createLoadGuard,
  createQuietReload,
  createPendingWrites,
  createSaveConfirmations,
  createSaveQueue,
  createWriteOrder,
  discardsFailedCreate,
  failedMessage,
  failedLeaveIds,
  failedSessionIds,
  isDeletedElsewhere,
  lineKey,
  recordFailedMessage,
  CHECK_INTERVAL_MS,
  IDLE_PAUSE_MS,
  checksForChanges,
  reloadsOnReturn,
  resolveSuperseded,
  keepLocalClaims,
  keepLocalPayments,
  mergeLoaded,
  messageOf,
  needsRefresh,
  resolveAlreadySettled,
  resolveFailure,
  restoreAt,
  revertedAny,
  sameSessionContent,
  saveFailedMessage,
  saveOnceCreated,
  showsEmptyState,
  withDeadline,
  type Failure,
} from './writeQueue';

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

describe('createSaveConfirmations', () => {
  it('confirms a waiting edit once the save carrying it succeeds', () => {
    const confirmations = createSaveConfirmations();
    const onSettled = vi.fn();
    confirmations.wait('a', onSettled);
    confirmations.sending('a');
    expect(onSettled).not.toHaveBeenCalled();
    confirmations.saved('a');
    expect(onSettled.mock.calls).toEqual([[true]]);
  });

  it('does not confirm an edit with a save that started before it (AC-1.6)', () => {
    const confirmations = createSaveConfirmations();
    const onSettled = vi.fn();
    confirmations.sending('a');
    confirmations.wait('a', onSettled);
    confirmations.saved('a');
    expect(onSettled).not.toHaveBeenCalled();

    confirmations.sending('a');
    confirmations.saved('a');
    expect(onSettled.mock.calls).toEqual([[true]]);
  });

  it("settles a queued edit only with the follow-up save, not the earlier one's (AC-4.1)", () => {
    const confirmations = createSaveConfirmations();
    const first = vi.fn();
    const second = vi.fn();
    confirmations.wait('a', first);
    confirmations.sending('a');
    confirmations.wait('a', second);
    confirmations.saved('a');
    expect(first.mock.calls).toEqual([[true]]);
    expect(second).not.toHaveBeenCalled();

    confirmations.sending('a');
    confirmations.saved('a');
    expect(second.mock.calls).toEqual([[true]]);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('confirms every edit folded into one follow-up save (AC-4.2)', () => {
    const confirmations = createSaveConfirmations();
    const b = vi.fn();
    const c = vi.fn();
    confirmations.sending('a');
    confirmations.wait('a', b);
    confirmations.wait('a', c);
    confirmations.saved('a');
    confirmations.sending('a');
    confirmations.saved('a');
    expect(b.mock.calls).toEqual([[true]]);
    expect(c.mock.calls).toEqual([[true]]);
  });

  it('hands a superseded failure on to the newer copy, which settles it (AC-4.4)', () => {
    const confirmations = createSaveConfirmations();
    const first = vi.fn();
    const second = vi.fn();
    confirmations.wait('a', first);
    confirmations.sending('a');
    confirmations.wait('a', second);
    confirmations.superseded('a');
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    confirmations.sending('a');
    confirmations.saved('a');
    expect(first.mock.calls).toEqual([[true]]);
    expect(second.mock.calls).toEqual([[true]]);
  });

  it('fails a reported failure for the sent edit', () => {
    const confirmations = createSaveConfirmations();
    const onSettled = vi.fn();
    confirmations.wait('a', onSettled);
    confirmations.sending('a');
    confirmations.failed('a');
    expect(onSettled.mock.calls).toEqual([[false]]);
  });

  it('fails queued edits too, and a later success never reverses it (AC-4.5, BR-6)', () => {
    const confirmations = createSaveConfirmations();
    const first = vi.fn();
    const second = vi.fn();
    confirmations.wait('a', first);
    confirmations.sending('a');
    confirmations.wait('a', second);
    confirmations.failed('a');
    expect(first.mock.calls).toEqual([[false]]);
    expect(second.mock.calls).toEqual([[false]]);

    confirmations.sending('a');
    confirmations.saved('a');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('settles an edit made after a failure with the next save', () => {
    const confirmations = createSaveConfirmations();
    confirmations.sending('a');
    confirmations.failed('a');
    const onSettled = vi.fn();
    confirmations.wait('a', onSettled);
    confirmations.sending('a');
    confirmations.saved('a');
    expect(onSettled.mock.calls).toEqual([[true]]);
  });

  it("keeps sessions apart, so one session's outcome never settles another's edit", () => {
    const confirmations = createSaveConfirmations();
    const a = vi.fn();
    const b = vi.fn();
    confirmations.wait('a', a);
    confirmations.sending('a');
    confirmations.wait('b', b);
    confirmations.sending('b');
    confirmations.failed('b');
    expect(a).not.toHaveBeenCalled();
    expect(b.mock.calls).toEqual([[false]]);
    confirmations.saved('a');
    expect(a.mock.calls).toEqual([[true]]);
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

describe('withDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the work's value under the limit, and is still waiting at 29,999ms", async () => {
    let finish!: (value: string) => void;
    const result = withDeadline(
      WRITE_TIMEOUT_MS,
      () => new Promise<string>((res) => (finish = res)),
    );
    let settled = false;
    void result.then(
      () => (settled = true),
      () => (settled = true),
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    finish('saved');
    await expect(result).resolves.toBe('saved');
  });

  it('rejects with TimeoutError at 30,000ms and aborts the signal', async () => {
    let seen!: AbortSignal;
    const result = withDeadline(WRITE_TIMEOUT_MS, (signal) => {
      seen = signal;
      return new Promise<void>(() => {});
    });
    const outcome = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
    expect(seen.aborted).toBe(true);
  });

  // An aborted fetch rejects with an AbortError. The race must already have
  // settled with the timeout by then, or the banner would show the wrong text.
  it('settles with TimeoutError, not the AbortError the aborted work throws', async () => {
    const result = withDeadline(
      WRITE_TIMEOUT_MS,
      (signal) =>
        new Promise<void>((_, reject) =>
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const outcome = expect(result).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
    await outcome;
  });

  // Vitest fails the run on an unhandled rejection, so the late reject below
  // also proves nothing is left unhandled.
  it('ignores work that settles after the limit', async () => {
    let finish!: (value: string) => void;
    let fail!: (err: unknown) => void;
    const late = withDeadline(WRITE_TIMEOUT_MS, () => new Promise<string>((res) => (finish = res)));
    const lateReject = withDeadline(
      WRITE_TIMEOUT_MS,
      () => new Promise<string>((_, rej) => (fail = rej)),
    );
    const outcomes = Promise.all([
      expect(late).rejects.toBeInstanceOf(TimeoutError),
      expect(lateReject).rejects.toBeInstanceOf(TimeoutError),
    ]);
    await vi.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
    finish('too late');
    fail(new Error('too late'));
    await vi.advanceTimersByTimeAsync(0);
    await outcomes;
  });

  it('clears its timer once the work settles, either way', async () => {
    await withDeadline(WRITE_TIMEOUT_MS, async () => 'ok');
    expect(vi.getTimerCount()).toBe(0);
    await expect(
      withDeadline(WRITE_TIMEOUT_MS, async () => {
        throw new Error('500');
      }),
    ).rejects.toThrow('500');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('authorisedFetch', () => {
  const ok = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

  it('sends the bearer header and passes the signal', async () => {
    const send = ok();
    const controller = new AbortController();
    await authorisedFetch(
      async () => 'tok',
      send,
      '/api/sessions/a',
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      controller.signal,
    );
    expect(send).toHaveBeenCalledWith('/api/sessions/a', {
      method: 'PUT',
      body: '{}',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    });
  });

  it('never sends when the token only arrives after the attempt was abandoned', async () => {
    const send = ok();
    const controller = new AbortController();
    let giveToken!: (token: string) => void;
    const token = new Promise<string>((res) => (giveToken = res));
    const result = authorisedFetch(() => token, send, '/api/sessions/a', {}, controller.signal);
    controller.abort();
    giveToken('tok');
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects with the signed-out message without sending when there is no token', async () => {
    const send = ok();
    await expect(authorisedFetch(async () => null, send, '/api/sessions', {})).rejects.toThrow(
      SIGNED_OUT,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  const save = (sessionId: string, message = `save ${sessionId}`): Failure => ({
    kind: 'save',
    sessionId,
    message,
  });

  it("keeps A's failure when B's save succeeds", () => {
    const list = addFailure([], save('A'));
    expect(resolveFailure(list, 'save', 'B')).toEqual([save('A')]);
  });

  it('clears only once both failed sessions have saved', () => {
    const list = addFailure(addFailure([], save('A')), save('B'));
    const afterA = resolveFailure(list, 'save', 'A');
    expect(afterA).toEqual([save('B')]);
    expect(resolveFailure(afterA, 'save', 'B')).toEqual([]);
  });

  it('replaces a repeat of the same kind and session and moves it to most recent', () => {
    let list = addFailure([], save('A', 'first'));
    list = addFailure(list, save('B'));
    list = addFailure(list, save('A', 'second'));
    expect(list).toEqual([save('B'), save('A', 'second')]);
    expect(list[list.length - 1].message).toBe('second');
  });

  it("doesn't let a save resolve a delete for the same session", () => {
    const list = addFailure([], { kind: 'delete', sessionId: 'A', message: 'delete A' });
    expect(resolveFailure(list, 'save', 'A')).toEqual(list);
  });

  it('returns the same list when nothing matches', () => {
    const list = addFailure([], save('A'));
    expect(resolveFailure(list, 'save', 'B')).toBe(list);
    expect(resolveFailure(list, 'load', null)).toBe(list);
  });

  it('lists the sessions whose save or delete failed, not loads or seeds', () => {
    let list = addFailure([], save('A'));
    list = addFailure(list, { kind: 'delete', sessionId: 'B', message: 'delete B' });
    list = addFailure(list, { kind: 'load', sessionId: null, message: 'load' });
    list = addFailure(list, { kind: 'seed', sessionId: null, message: 'seed' });
    expect(failedSessionIds(list)).toEqual(['A', 'B']);
  });

  // A failed payment is already reverted on screen, so it has no edit to warn about.
  it('leaves a payment failure out of the failed sessions', () => {
    let list = addFailure([], save('A'));
    list = addFailure(list, { kind: 'payment', sessionId: 'C', message: 'payment C' });
    expect(failedSessionIds(list)).toEqual(['A']);
  });
});

describe('payment failures and the successes that answer them', () => {
  const X = lineKey({ debtor: 'Ben', creditor: 'Ana' });
  const Y = lineKey({ debtor: 'Cal', creditor: 'Ana' });
  const failure = (lines: string[], seq: number, sessionId = 'A'): Failure => ({
    kind: 'payment',
    sessionId,
    message: `payment ${lines.join('+')} #${seq}`,
    seq,
    lines,
  });

  it('is answered by a later success on the same line', () => {
    const order = createWriteOrder();
    const slow = order.start();
    const quick = order.start();
    order.succeeded('A', quick, [X]);
    expect(order.superseded('A', slow, [X])).toBe(true);
    const list = addFailure([], failure([X], slow));
    expect(resolveSuperseded(list, order, 'A')).toEqual([]);
  });

  // Mark fully paid on X is slow, Y's payment succeeds first, then X fails: X
  // is a real failure and its banner must show.
  it('is not answered by a later success on another line', () => {
    const order = createWriteOrder();
    const slowX = order.start();
    const quickY = order.start();
    order.succeeded('A', quickY, [Y]);
    expect(order.superseded('A', slowX, [X])).toBe(false);
    const list = addFailure([], failure([X], slowX));
    expect(resolveSuperseded(list, order, 'A')).toBe(list);
  });

  it('is not answered by a success that started before it', () => {
    const order = createWriteOrder();
    const slowSuccess = order.start();
    const quickFailure = order.start();
    order.succeeded('A', slowSuccess, [X]);
    expect(order.superseded('A', quickFailure, [X])).toBe(false);
  });

  it('is not answered by its own success, or by a success on another session', () => {
    const order = createWriteOrder();
    const mine = order.start();
    order.succeeded('A', mine, [X]);
    expect(order.superseded('A', mine, [X])).toBe(false);
    order.succeeded('B', order.start(), [X]);
    expect(order.superseded('A', mine, [X])).toBe(false);
  });

  it('remembers the latest success when an older write succeeds afterwards', () => {
    const order = createWriteOrder();
    const first = order.start();
    const second = order.start();
    const third = order.start();
    order.succeeded('A', third, [X]);
    order.succeeded('A', second, [X]);
    expect(order.superseded('A', first, [X])).toBe(true);
    expect(order.superseded('A', second, [X])).toBe(true);
  });

  it('keeps a Mark all failure until every line it covered has had a later success', () => {
    const order = createWriteOrder();
    const markAll = order.start();
    const list = addFailure([], failure([X, Y], markAll));
    order.succeeded('A', order.start(), [X]);
    expect(resolveSuperseded(list, order, 'A')).toBe(list);
    order.succeeded('A', order.start(), [Y]);
    expect(resolveSuperseded(list, order, 'A')).toEqual([]);
  });

  it("clears only the succeeded session's failures", () => {
    const order = createWriteOrder();
    const a = failure([X], order.start(), 'A');
    const b = failure([X], order.start(), 'B');
    const list = addFailure(addFailure([], a), b);
    order.succeeded('A', order.start(), [X]);
    expect(resolveSuperseded(list, order, 'A')).toEqual([b]);
  });

  it('is answered by a later whole-session success, for a line or the whole session', () => {
    const order = createWriteOrder();
    const lineFailure = order.start();
    const wholeFailure = order.start();
    order.succeeded('A', order.start(), [WHOLE_SESSION]);
    expect(order.superseded('A', lineFailure, [X])).toBe(true);
    expect(order.superseded('A', wholeFailure, [WHOLE_SESSION])).toBe(true);
  });

  it("does not answer a whole-session failure with one line's success", () => {
    const order = createWriteOrder();
    const undoAll = order.start();
    order.succeeded('A', order.start(), [X]);
    expect(order.superseded('A', undoAll, [WHOLE_SESSION])).toBe(false);
  });

  it('leaves failures that carry no order or lines, and other kinds, alone', () => {
    const order = createWriteOrder();
    order.succeeded('A', order.start(), [WHOLE_SESSION]);
    let list = addFailure([], { kind: 'payment', sessionId: 'A', message: 'bare' });
    list = addFailure(list, { kind: 'save', sessionId: 'A', message: 'save' });
    expect(resolveSuperseded(list, order, 'A')).toBe(list);
  });

  it('keeps a failure from a newer write when an older write fails afterwards', () => {
    const list = addFailure([], failure([X], 5));
    const after = addFailure(list, failure([X], 3));
    expect(after).toEqual(list);
    expect(after[0].seq).toBe(5);
  });

  it('replaces a failure with a newer write of the same lines, and keeps other lines apart', () => {
    let list = addFailure([], failure([X], 3));
    list = addFailure(list, failure([Y], 4));
    list = addFailure(list, failure([X], 6));
    expect(list.map((f) => f.seq)).toEqual([4, 6]);
  });
});

describe('createWriteOrder', () => {
  it('numbers writes in the order they start', () => {
    const order = createWriteOrder();
    const first = order.start();
    expect(order.start()).toBeGreaterThan(first);
  });
});

describe('failedSessionIds and a session deleted elsewhere', () => {
  it('leaves out a session the server says has gone, which a reload removes rather than reverts', () => {
    let list = addFailure([], { kind: 'save', sessionId: 'A', message: DELETED_ELSEWHERE });
    list = addFailure(list, { kind: 'save', sessionId: 'B', message: 'Could not save (500).' });
    expect(failedSessionIds(list)).toEqual(['B']);
  });
});

describe('recordFailedMessage (no status codes in a banner)', () => {
  it('says a deleted session was deleted, since retrying cannot work', () => {
    expect(recordFailedMessage(1, 404)).toBe(DELETED_ELSEWHERE);
    expect(recordFailedMessage(3, 404)).toBe(DELETED_ELSEWHERE);
  });

  it('tells a signed-out user to sign in', () => {
    expect(recordFailedMessage(1, 401)).toBe(SIGNED_OUT);
  });

  it.each([400, 409, 500])('words status %i plainly, with no number', (status) => {
    const message = recordFailedMessage(1, status);
    expect(message).toBe("Couldn't record the payment, so it was taken off. Try again.");
    expect(message).not.toMatch(/\d/);
  });

  it('says payments, plural, for Mark all', () => {
    expect(recordFailedMessage(3, 500)).toBe(
      "Couldn't record the payments, so they were taken off. Try again.",
    );
    expect(recordFailedMessage(3, null, new TypeError('Failed to fetch'))).toBe(
      "Couldn't record the payments. Check your connection and try again.",
    );
  });

  it('keeps wording Hati wrote when no answer came, and never raw error text', () => {
    expect(recordFailedMessage(1, null, new FriendlyError(SIGNED_OUT))).toBe(SIGNED_OUT);
    expect(recordFailedMessage(1, null, new TypeError('Failed to fetch'))).toBe(
      "Couldn't record the payment. Check your connection and try again.",
    );
  });
});

describe('isDeletedElsewhere (the banner button only reloads)', () => {
  it('is true for the deleted messages and nothing else', () => {
    expect(isDeletedElsewhere(DELETED_ELSEWHERE)).toBe(true);
    expect(isDeletedElsewhere(DELETED_ELSEWHERE_MANY)).toBe(true);
    expect(isDeletedElsewhere(SIGNED_OUT)).toBe(false);
    expect(isDeletedElsewhere(null)).toBe(false);
  });
});

describe('messageOf (a banner never shows raw error text)', () => {
  it('passes through a message Hati wrote for the user', () => {
    expect(messageOf(new FriendlyError(DELETED_ELSEWHERE), 'fallback')).toBe(DELETED_ELSEWHERE);
  });

  it('replaces the browser\'s "Failed to fetch" with the action\'s own wording', () => {
    const fallback = "Couldn't record the payment. Check your connection and try again.";
    expect(messageOf(new TypeError('Failed to fetch'), fallback)).toBe(fallback);
  });

  it('replaces any other error, and any non-error, with the fallback', () => {
    expect(messageOf(new SyntaxError('Unexpected token < in JSON'), 'fallback')).toBe('fallback');
    expect(messageOf(new Error('boom'), 'fallback')).toBe('fallback');
    expect(messageOf('boom', 'fallback')).toBe('fallback');
    expect(messageOf(null, 'fallback')).toBe('fallback');
  });

  it('keeps the sign-in message from authorisedFetch', async () => {
    const err = await authorisedFetch(async () => null, vi.fn(), '/x', {}).catch((e: unknown) => e);
    expect(messageOf(err, 'fallback')).toBe(SIGNED_OUT);
  });
});

describe('revertedAny and sameSessionContent', () => {
  const session = (id: string, overrides: Partial<Session> = {}): Session => ({
    id,
    status: 'draft',
    createdAt: '2026-11-01T10:00:00.000Z',
    closedAt: null,
    name: null,
    activityAt: null,
    me: null,
    finishedWithCollection: false,
    payments: [],
    members: ['Ana', 'Ben'],
    records: [
      {
        id: 'rec_1',
        date: '2026-11-01',
        payorMode: 'single',
        payors: [{ member: 'Ana', amount: 0 }],
        items: [
          { id: 'item_1', mode: 'equal', name: 'Rice', totalPrice: 100, owners: ['Ana', 'Ben'] },
        ],
        createdAt: '2026-11-01T10:01:00.000Z',
      },
      {
        id: 'rec_2',
        date: '2026-11-02',
        payorMode: 'single',
        payors: [{ member: 'Ben', amount: 0 }],
        items: [{ id: 'item_2', mode: 'custom', name: 'Taxi', amounts: { Ana: 40, Ben: 60 } }],
        createdAt: '2026-11-02T10:01:00.000Z',
      },
    ],
    ...overrides,
  });
  const check = (failed: string[], before: Session[], after: Session[]) =>
    revertedAny(failed, before, after, sameSessionContent);

  it('is true when a failed save comes back different from the server', () => {
    expect(check(['A'], [session('A', { name: 'Trip' })], [session('A')])).toBe(true);
  });

  it('is true when a failed create is missing after the load', () => {
    expect(check(['A'], [session('A')], [])).toBe(true);
  });

  it('is true when a failed delete is back after the load', () => {
    expect(check(['A'], [], [session('A')])).toBe(true);
  });

  it('is false with no failed sessions', () => {
    expect(check([], [session('A', { name: 'Trip' })], [session('A')])).toBe(false);
  });

  // The server orders records by date, rewrites the created_at of a POSTed
  // row, and jsonb reorders keys, all for a save that did land.
  it('is false when only order, key order and timestamps differ', () => {
    const local = session('A');
    const [first, second] = local.records;
    const server: Session = {
      ...local,
      createdAt: '2026-11-01T10:00:07.123Z',
      records: [
        {
          createdAt: '2026-11-02T10:01:09.000Z',
          items: [{ amounts: { Ben: 60, Ana: 40 }, name: 'Taxi', mode: 'custom', id: 'item_2' }],
          payors: second.payors,
          payorMode: second.payorMode,
          date: second.date,
          id: second.id,
        },
        { ...first, createdAt: '2026-11-01T10:01:09.000Z' },
      ],
    };
    expect(check(['A'], [local], [server])).toBe(false);
  });

  it('is false when the session that changed is not one that failed', () => {
    expect(
      check(['B'], [session('A', { name: 'Trip' }), session('B')], [session('A'), session('B')]),
    ).toBe(false);
  });

  it('is true when one of two failed sessions differs', () => {
    expect(
      check(
        ['A', 'B'],
        [session('A'), session('B', { members: ['Ana'] })],
        [session('A'), session('B')],
      ),
    ).toBe(true);
  });

  // BR-12, AC-6.6: a card's position is not content the user entered.
  it('ignores a difference in activity time alone', () => {
    const stamped = session('A', { activityAt: '2026-11-03T10:00:00.000Z' });
    expect(sameSessionContent(stamped, session('A'))).toBe(true);
    expect(check(['A'], [stamped], [session('A')])).toBe(false);
  });

  it('notices a changed status, member, item or amount', () => {
    const base = session('A');
    expect(sameSessionContent(base, session('A', { status: 'closed' }))).toBe(false);
    expect(sameSessionContent(base, session('A', { members: ['Ana', 'Cy'] }))).toBe(false);
    const priced = structuredClone(base);
    const item = priced.records[0].items[0];
    if (item.mode === 'equal') item.totalPrice = 120;
    expect(sameSessionContent(base, priced)).toBe(false);
    expect(sameSessionContent(base, { ...base, records: base.records.slice(1) })).toBe(false);
  });

  it('notices a changed pick, but not payments, which a save never carries', () => {
    const base = session('A');
    expect(sameSessionContent(base, session('A', { me: 'Ana' }))).toBe(false);
    expect(sameSessionContent(base, session('A', { finishedWithCollection: true }))).toBe(false);
    const paid = session('A', {
      payments: [
        {
          id: 'pay_1',
          debtor: 'Ben',
          creditor: 'Ana',
          amountCents: 100,
          createdAt: '2026-11-03T10:00:00.000Z',
        },
      ],
    });
    expect(sameSessionContent(base, paid)).toBe(true);
  });
});

describe('keepLocalPayments', () => {
  type S = { id: string; me: string | null; payments: string[] };

  it('takes the server copy but the on-screen payments for the sessions named', () => {
    const server: S[] = [
      { id: 'A', me: null, payments: [] },
      { id: 'B', me: null, payments: [] },
    ];
    const local: S[] = [
      { id: 'A', me: 'Ana', payments: ['pay_1'] },
      { id: 'B', me: 'Ben', payments: ['pay_2'] },
    ];
    const result = keepLocalPayments(server, local, (id) => id === 'A');
    expect(result[0]).toEqual({ id: 'A', me: null, payments: ['pay_1'] });
    expect(result[1]).toBe(server[1]);
  });

  it('leaves a session with no on-screen copy as the server sent it', () => {
    const server: S[] = [{ id: 'A', me: null, payments: ['pay_1'] }];
    expect(keepLocalPayments(server, [], () => true)[0]).toBe(server[0]);
  });
});

describe('saveOnceCreated', () => {
  it('sends at once, without a create, when none is in flight', async () => {
    const send = vi.fn(async () => {});
    await saveOnceCreated(undefined, () => false, send);
    expect(send).toHaveBeenCalledWith(false);
  });

  it('holds the save until the create in flight settles', async () => {
    const create = deferred();
    const send = vi.fn(async () => {});
    const save = saveOnceCreated(create.promise, () => false, send);
    await flush();
    expect(send).not.toHaveBeenCalled();

    create.resolve();
    await save;
    expect(send).toHaveBeenCalledWith(false);
  });

  it('sends the create again when the awaited create failed', async () => {
    // The hook's create never rejects; it records the failure instead, so the
    // flag only turns true while the save is waiting.
    const create = deferred();
    let failed = false;
    const send = vi.fn(async () => {});
    const save = saveOnceCreated(create.promise, () => failed, send);

    failed = true;
    create.resolve();
    await save;
    expect(send).toHaveBeenCalledWith(true);
  });

  it('passes on a failed send, so the save reports it', async () => {
    const err = new Error('Could not save your changes (500).');
    await expect(
      saveOnceCreated(
        undefined,
        () => false,
        async () => {
          throw err;
        },
      ),
    ).rejects.toBe(err);
  });
});

describe('saveFailedMessage', () => {
  it('says a 404 session was deleted on another device', () => {
    expect(saveFailedMessage(404)).toBe(DELETED_ELSEWHERE);
    expect(DELETED_ELSEWHERE).toBe('This session was deleted on another device.');
  });

  it('gives any other status as a plain save failure, with no number', () => {
    expect(saveFailedMessage(500)).toBe('Could not save your changes.');
  });

  it('says a signed-out save needs a sign-in', () => {
    expect(saveFailedMessage(401)).toBe(SIGNED_OUT);
  });
});

describe('failedMessage (no status codes for load, save, create or delete)', () => {
  it.each([
    ['load your data', 'Could not load your data.'],
    ['save your changes', 'Could not save your changes.'],
    ['create the session', 'Could not create the session.'],
    ['delete the session', 'Could not delete the session.'],
  ] as const)('words a refused request to %s plainly', (action, text) => {
    for (const status of [400, 403, 500, 503]) {
      expect(failedMessage(action, status)).toBe(text);
    }
    expect(text).not.toMatch(/\d/);
  });

  it('says a signed-out request needs a sign-in, whatever it was doing', () => {
    expect(failedMessage('load your data', 401)).toBe(SIGNED_OUT);
    expect(failedMessage('create the session', 401)).toBe(SIGNED_OUT);
    expect(failedMessage('delete the session', 401)).toBe(SIGNED_OUT);
  });
});

describe('resolveAlreadySettled (a failed "Already settled" the user can no longer follow)', () => {
  const settle = (sessionId: string): Failure => ({
    kind: 'payment',
    sessionId,
    message: "Couldn't mark it as settled.",
    seq: 1,
    lines: [ALREADY_SETTLED],
  });

  it("removes that session's failed Already settled", () => {
    expect(resolveAlreadySettled(addFailure([], settle('A')), 'A')).toEqual([]);
  });

  it('leaves other sessions, and ordinary line or whole-session failures, alone', () => {
    let list = addFailure([], settle('B'));
    list = addFailure(list, {
      kind: 'payment',
      sessionId: 'A',
      message: 'line',
      seq: 2,
      lines: ['x'],
    });
    list = addFailure(list, {
      kind: 'payment',
      sessionId: 'A',
      message: 'undo all',
      seq: 3,
      lines: [WHOLE_SESSION],
    });
    expect(resolveAlreadySettled(list, 'A')).toBe(list);
  });

  it('is answered by a later whole-session success too, such as a second Already settled', () => {
    const order = createWriteOrder();
    const failed = order.start();
    order.succeeded('A', order.start(), [WHOLE_SESSION]);
    expect(order.superseded('A', failed, [ALREADY_SETTLED])).toBe(true);
  });

  it("is not answered by a line's success on its own, which the page answers by the session's payments", () => {
    const order = createWriteOrder();
    const failed = order.start();
    order.succeeded('A', order.start(), ['x']);
    expect(order.superseded('A', failed, [ALREADY_SETTLED])).toBe(false);
  });
});

describe('needsRefresh (the banner button reloads when retrying cannot help)', () => {
  const failure = (message: string, refresh?: boolean): Failure => ({
    kind: 'payment',
    sessionId: 'A',
    message,
    refresh,
  });

  it('is true for a refusal the server made of the payment itself', () => {
    expect(
      needsRefresh(failure('Payment ... not recorded. Only ₱50.00 is left on this line.', true)),
    ).toBe(true);
  });

  it('is true for a deleted session, however it was reported', () => {
    expect(needsRefresh(failure(DELETED_ELSEWHERE))).toBe(true);
    expect(needsRefresh(failure(DELETED_ELSEWHERE_MANY))).toBe(true);
  });

  it('is false for anything a second try could fix, and when there is no failure', () => {
    expect(needsRefresh(failure(SIGNED_OUT))).toBe(false);
    expect(
      needsRefresh(failure("Couldn't record the payment. Check your connection and try again.")),
    ).toBe(false);
    expect(needsRefresh(undefined)).toBe(false);
  });
});

describe('a failed create of an untouched session', () => {
  const open = { optedIn: true, onScreen: true, edited: false };

  it('takes the session off the screen, as long as nothing was entered in it', () => {
    expect(discardsFailedCreate(open)).toBe(true);
  });

  it('keeps an edited session, whose next save sends the create again', () => {
    expect(discardsFailedCreate({ ...open, edited: true })).toBe(false);
  });

  it('keeps the session for a caller that did not opt in, as the tour does', () => {
    expect(discardsFailedCreate({ ...open, optedIn: false })).toBe(false);
  });

  it('has nothing to take off once the session has already gone from the screen', () => {
    expect(discardsFailedCreate({ ...open, onScreen: false })).toBe(false);
  });

  // The failure names no session, so "Try again" has no session to look for in
  // its reload and can't report the missing one as "Session not found" or as a
  // reverted edit.
  it('is not a failed session, so Try again never makes it a revert candidate', () => {
    let list = addFailure([], {
      kind: 'create',
      sessionId: null,
      message: 'Could not create the session.',
    });
    expect(failedSessionIds(list)).toEqual([]);
    expect(revertedAny(failedSessionIds(list), [], [], sameSessionContent)).toBe(false);
    list = addFailure(list, { kind: 'save', sessionId: 'A', message: 'save A' });
    expect(failedSessionIds(list)).toEqual(['A']);
  });

  it('is answered by the next create that lands, and by no save or delete', () => {
    const list = addFailure([], {
      kind: 'create',
      sessionId: null,
      message: 'Could not create the session.',
    });
    expect(resolveFailure(list, 'save', null)).toBe(list);
    expect(resolveFailure(list, 'delete', null)).toBe(list);
    expect(resolveFailure(list, 'create', null)).toEqual([]);
  });
});

describe('showsEmptyState (no "No sessions" while the load has failed)', () => {
  it('says so after a load that succeeded and found nothing', () => {
    expect(showsEmptyState(true, 0)).toBe(true);
  });

  it('stays silent while no load has succeeded, as after a failed first load', () => {
    expect(showsEmptyState(false, 0)).toBe(false);
  });

  it('stays silent when there is something to list, loaded or not', () => {
    expect(showsEmptyState(true, 2)).toBe(false);
    expect(showsEmptyState(false, 2)).toBe(false);
  });
});

describe('restoreAt (a card whose delete failed comes back where it was)', () => {
  const ids = (list: { id: string }[]) => list.map((s) => s.id);
  const a = { id: 'A' };
  const b = { id: 'B' };
  const c = { id: 'C' };

  it('puts the session back at its original position', () => {
    expect(ids(restoreAt([a, c], b, 1))).toEqual(['A', 'B', 'C']);
    expect(ids(restoreAt([b, c], a, 0))).toEqual(['A', 'B', 'C']);
    expect(ids(restoreAt([a, b], c, 2))).toEqual(['A', 'B', 'C']);
  });

  it('clamps the position when the list has shrunk meanwhile', () => {
    expect(ids(restoreAt([a], c, 5))).toEqual(['A', 'C']);
    expect(ids(restoreAt([a], c, -1))).toEqual(['C', 'A']);
  });

  it('leaves the list alone when the session is already there', () => {
    const list = [a, b];
    expect(restoreAt(list, b, 0)).toBe(list);
  });

  // A load that lands during the delete drops the session, as it must while the
  // delete is in flight; the restore then wins, and a later load keeps it.
  it('is not undone by a load that landed during the delete, nor by the next one', () => {
    const server = [a, b, c];
    const duringDelete = mergeLoaded(
      server,
      [a, c],
      () => false,
      (id) => id === 'B',
    );
    expect(ids(duringDelete)).toEqual(['A', 'C']);
    const restored = restoreAt(duringDelete, b, 1);
    expect(ids(restored)).toEqual(['A', 'B', 'C']);
    expect(
      ids(
        mergeLoaded(
          server,
          restored,
          () => false,
          () => false,
        ),
      ),
    ).toEqual(['A', 'B', 'C']);
  });

  it('is answered by a later delete of the same session, and by no other', () => {
    const list = addFailure([], {
      kind: 'delete',
      sessionId: 'B',
      message: 'Could not delete the session.',
    });
    expect(resolveFailure(list, 'delete', 'A')).toBe(list);
    expect(resolveFailure(list, 'delete', 'B')).toEqual([]);
  });
});

describe('reloadsOnReturn (AC-15.1, AC-15.2)', () => {
  it('never reloads before there has been a load', () => {
    expect(reloadsOnReturn(null, 1_000_000)).toBe(false);
  });

  it('reloads only once 30 seconds have passed since the last load started', () => {
    expect(reloadsOnReturn(1_000, 30_999)).toBe(false);
    expect(reloadsOnReturn(1_000, 31_000)).toBe(true);
  });
});

describe('failedLeaveIds (Try again after a failed Stop tracking)', () => {
  const failure = (kind: Failure['kind'], sessionId: string | null): Failure => ({
    kind,
    sessionId,
    message: 'x',
  });

  it('names the failed deletes that were stops, and nothing else', () => {
    const list = [
      failure('delete', 's1'),
      failure('delete', 's2'),
      failure('save', 's1'),
      failure('load', null),
    ];
    expect(failedLeaveIds(list, new Set(['s1']))).toEqual(['s1']);
    expect(failedLeaveIds(list, new Set())).toEqual([]);
  });
});

describe('keepLocalClaims (a confirm moves a claim into the payments)', () => {
  type S = { id: string; payments: string[]; claims: string[] };
  const loaded: S[] = [
    { id: 's1', payments: ['pay_1'], claims: [] },
    { id: 's2', payments: [], claims: ['clm_2'] },
  ];
  const local: S[] = [
    { id: 's1', payments: ['pay_1', 'clm_1'], claims: ['clm_9'] },
    { id: 's2', payments: [], claims: [] },
  ];

  it("takes the on-screen claims of the sessions kept, and the server's elsewhere", () => {
    const merged = keepLocalClaims(loaded, local, (id) => id === 's1');
    expect(merged.find((s) => s.id === 's1')?.claims).toEqual(['clm_9']);
    expect(merged.find((s) => s.id === 's2')?.claims).toEqual(['clm_2']);
  });

  it('moves with the payments, so a confirmed claim is never both', () => {
    const keep = (id: string) => id === 's1';
    const merged = keepLocalClaims(keepLocalPayments(loaded, local, keep), local, keep);
    const s1 = merged.find((s) => s.id === 's1')!;
    expect(s1.payments).toEqual(['pay_1', 'clm_1']);
    expect(s1.claims).toEqual(['clm_9']);
  });
});

describe('the "anything changed?" check (round 3, item 5)', () => {
  it('runs every 15 seconds and pauses after 5 minutes with no input', () => {
    expect(CHECK_INTERVAL_MS).toBe(15_000);
    expect(IDLE_PAUSE_MS).toBe(300_000);
  });

  const ready = {
    visible: true,
    canReload: true,
    state: 'abc' as string | null,
    checking: false,
    lastInputAt: 1_000_000,
    now: 1_000_000,
  };

  it('checks only when visible, able to reload, with a known state, none in flight, and not idle', () => {
    expect(checksForChanges(ready)).toBe(true);
    expect(checksForChanges({ ...ready, visible: false })).toBe(false);
    expect(checksForChanges({ ...ready, canReload: false })).toBe(false);
    expect(checksForChanges({ ...ready, state: null })).toBe(false);
    expect(checksForChanges({ ...ready, checking: true })).toBe(false);
  });

  it('pauses at exactly 5 minutes without input and resumes with the next input', () => {
    const at = (ms: number) => ({ ...ready, now: ready.lastInputAt + ms });
    expect(checksForChanges(at(IDLE_PAUSE_MS - 1))).toBe(true);
    expect(checksForChanges(at(IDLE_PAUSE_MS))).toBe(false);
    expect(
      checksForChanges({
        ...at(IDLE_PAUSE_MS + 60_000),
        lastInputAt: ready.lastInputAt + IDLE_PAUSE_MS + 59_000,
      }),
    ).toBe(true);
  });
});

describe('createLoadGuard (QA B2 and B5: a load that read the server before a local change)', () => {
  type S = { id: string };
  const merge = (server: S[], local: S[], guard: ReturnType<typeof createLoadGuard>): S[] =>
    mergeLoaded(
      server,
      local,
      (id) => guard.wasCreated(id),
      (id) => guard.wasRemoved(id),
    );

  it('keeps a session created while the load was out, though the load never saw it (B2)', () => {
    const guard = createLoadGuard();
    guard.begin();
    // The tour creates its session after the load's read and before its answer lands.
    guard.created('tour');
    const merged = merge([{ id: 'a' }], [{ id: 'a' }, { id: 'tour' }], guard);
    expect(merged.map((s) => s.id)).toEqual(['a', 'tour']);
  });

  it('keeps a session deleted while the load was out gone, though the load still had it (B5)', () => {
    const guard = createLoadGuard();
    guard.begin();
    guard.removed('b');
    // The delete has already landed, so nothing is "in flight" to hold it, but this load read first.
    const merged = merge([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }], guard);
    expect(merged.map((s) => s.id)).toEqual(['a']);
  });

  it('keeps an entry through the load that began after it and forgets it at the one after, so only loads that overlap a change are held back', () => {
    const guard = createLoadGuard();
    guard.begin();
    guard.created('tour');
    guard.removed('b');
    // The next load overlaps the change, so it is still held back.
    guard.begin();
    expect(guard.wasCreated('tour')).toBe(true);
    expect(guard.wasRemoved('b')).toBe(true);
    // A load that began after both loads, so after the change had landed, is the truth, as before.
    guard.begin();
    expect(guard.wasCreated('tour')).toBe(false);
    expect(guard.wasRemoved('b')).toBe(false);
    expect(merge([{ id: 'a' }], [{ id: 'a' }, { id: 'tour' }], guard).map((s) => s.id)).toEqual([
      'a',
    ]);
  });

  it('holds back a load for a create that began before it and finished while it was out', () => {
    const guard = createLoadGuard();
    guard.begin();
    // The create starts while load 1 is out, and load 2 begins before it finishes.
    guard.created('tour');
    guard.begin();
    // Load 2 read the server before the create landed, and the create has finished by its answer.
    const merged = merge([{ id: 'a' }], [{ id: 'a' }, { id: 'tour' }], guard);
    expect(merged.map((s) => s.id)).toEqual(['a', 'tour']);
  });

  it('holds back a load for a delete that began before it and finished while it was out', () => {
    const guard = createLoadGuard();
    guard.begin();
    guard.removed('b');
    guard.begin();
    const merged = merge([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }], guard);
    expect(merged.map((s) => s.id)).toEqual(['a']);
  });

  it('shows a card whose delete failed when the load that was out answers with it (restored)', () => {
    const guard = createLoadGuard();
    guard.begin();
    guard.removed('b');
    // The delete failed and the card was put back, though the load is still out.
    guard.restored('b');
    const merged = merge([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }], guard);
    expect(merged.map((s) => s.id)).toEqual(['a', 'b']);
    expect(guard.wasRemoved('b')).toBe(false);
  });

  it('believes a load about a create that failed, so a session the server lacks is not kept (createFailed)', () => {
    const guard = createLoadGuard();
    guard.begin();
    guard.created('tour');
    guard.createFailed('tour');
    expect(guard.wasCreated('tour')).toBe(false);
    expect(merge([{ id: 'a' }], [{ id: 'a' }, { id: 'tour' }], guard).map((s) => s.id)).toEqual([
      'a',
    ]);
  });

  it('undoes only the entry it names', () => {
    const guard = createLoadGuard();
    guard.begin();
    guard.removed('b');
    guard.removed('c');
    guard.created('x');
    guard.restored('b');
    expect(guard.wasRemoved('c')).toBe(true);
    expect(guard.wasCreated('x')).toBe(true);
  });
});

describe('createQuietReload (N1: visibilitychange and focus together on a tab return)', () => {
  it('starts one reload for the two events of a return, and that load is quiet', () => {
    const reload = createQuietReload();
    let bumps = 0;
    // visibilitychange, then focus, both before the load effect has run.
    for (let event = 0; event < 2; event++) if (reload.request()) bumps += 1;
    expect(bumps).toBe(1);
    // The one load that starts is the quiet one, so it never shows the loading page.
    expect(reload.take()).toBe(true);
  });

  it('is not left waiting once its load has started, so the next return reloads again', () => {
    const reload = createQuietReload();
    expect(reload.request()).toBe(true);
    expect(reload.take()).toBe(true);
    expect(reload.request()).toBe(true);
  });

  it('is not quiet for a load nobody asked to be quiet, such as the first or a retry', () => {
    const reload = createQuietReload();
    expect(reload.take()).toBe(false);
    reload.request();
    reload.take();
    expect(reload.take()).toBe(false);
  });
});
