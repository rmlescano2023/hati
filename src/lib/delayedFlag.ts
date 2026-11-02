/**
 * A flag that turns on only once `input` has been on for `showAfter` ms, and
 * once on stays on for at least `minOn` ms, so a fast save never flashes it
 * and a slow one never flickers. `onChange` is never called twice in a row
 * with the same value.
 *
 * `dispose` only clears the pending timer, and the flag keeps working after
 * it, because StrictMode disposes and then reuses the same flag on remount.
 */
export function createDelayedFlag(
  showAfter: number,
  minOn: number,
  onChange: (on: boolean) => void,
): { set(input: boolean): void; dispose(): void } {
  let on = false;
  let onSince = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  return {
    set(input) {
      clear();
      if (input && !on) {
        timer = setTimeout(() => {
          timer = undefined;
          on = true;
          onSince = Date.now();
          onChange(true);
        }, showAfter);
      } else if (!input && on) {
        timer = setTimeout(
          () => {
            timer = undefined;
            on = false;
            onChange(false);
          },
          Math.max(0, minOn - (Date.now() - onSince)),
        );
      }
      // Otherwise the flag already matches the input. Coming back on during
      // the hold lands here, which cancels the hide and keeps the flag on.
    },
    dispose: clear,
  };
}
