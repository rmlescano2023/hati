import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDelayedFlag } from './delayedFlag';

describe('createDelayedFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never turns on for input that clears within 399ms', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(399);
    flag.set(false);
    vi.advanceTimersByTime(5_000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('turns on once the input has been on for 400ms', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(399);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('stays on for 600ms after showing, even when the input clears sooner', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(100);
    flag.set(false);
    vi.advanceTimersByTime(499);
    expect(onChange.mock.calls).toEqual([[true]]);
    vi.advanceTimersByTime(1);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('turns off on the next tick once it has been on for longer than the hold', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(2_000);
    flag.set(false);
    expect(onChange.mock.calls).toEqual([[true]]);
    vi.advanceTimersByTime(0);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('stays on with no extra calls when the input returns during the hold', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(400);
    flag.set(false);
    vi.advanceTimersByTime(300);
    flag.set(true);
    vi.advanceTimersByTime(5_000);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it('cancels a pending timer on dispose, and still works afterwards', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    flag.dispose();
    vi.advanceTimersByTime(5_000);
    expect(onChange).not.toHaveBeenCalled();
    flag.set(true);
    vi.advanceTimersByTime(400);
    expect(onChange.mock.calls).toEqual([[true]]);
  });
});
