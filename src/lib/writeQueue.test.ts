import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../types';
import {
  TimeoutError,
  WRITE_TIMEOUT_MS,
  addFailure,
  authorisedFetch,
  createPendingWrites,
  createSaveConfirmations,
  createSaveQueue,
  failedSessionIds,
  keepLocalPayments,
  mergeLoaded,
  resolveFailure,
  revertedAny,
  sameSessionContent,
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

  it('rejects with "Not signed in." without sending when there is no token', async () => {
    const send = ok();
    await expect(authorisedFetch(async () => null, send, '/api/sessions', {})).rejects.toThrow(
      'Not signed in.',
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
