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

  // The error banner replaces the cue. If the flag stayed on behind it, the
  // cue would blink back for an instant when the banner cleared.
  it('turns off at once on hideNow, skipping the hold', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(400);
    flag.hideNow();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    vi.advanceTimersByTime(5_000);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('cancels a pending show on hideNow, without calling onChange', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(300);
    flag.hideNow();
    vi.advanceTimersByTime(5_000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels a pending hide on hideNow, turning off once', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(400);
    flag.set(false);
    flag.hideNow();
    vi.advanceTimersByTime(5_000);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('waits the full delay again after hideNow', () => {
    const onChange = vi.fn();
    const flag = createDelayedFlag(400, 600, onChange);
    flag.set(true);
    vi.advanceTimersByTime(400);
    flag.hideNow();
    flag.set(true);
    vi.advanceTimersByTime(399);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
    vi.advanceTimersByTime(1);
    expect(onChange.mock.calls).toEqual([[true], [false], [true]]);
  });
});
