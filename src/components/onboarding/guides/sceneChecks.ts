/** A step's scene is satisfied only by being in it. A module-level function, so its identity is stable. */
export const sameScene = <T>(a: T, b: T) => a === b;

/** Whether `target` is on screen with a size, so a step pointing at it has something to highlight. */
export function targetShown(target: string): boolean {
  const el = document.querySelector(`[data-tour="${target}"]`);
  return el !== null && el.getBoundingClientRect().height > 0;
}

/** Where a guide's step lands its target below the top of the screen: Joyride's own default. */
export const GUIDE_SCROLL_OFFSET = 20;

/** How far inside the top and bottom of the screen a guide's tooltip stays. */
export const GUIDE_SCREEN_MARGIN = 10;
