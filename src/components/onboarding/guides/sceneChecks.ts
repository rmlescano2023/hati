/** A step's scene is satisfied only by being in it. A module-level function, so its identity is stable. */
export const sameScene = <T>(a: T, b: T) => a === b;

/** Whether `target` is on screen with a size, so a step pointing at it has something to highlight. */
export function targetShown(target: string): boolean {
  const el = document.querySelector(`[data-tour="${target}"]`);
  return el !== null && el.getBoundingClientRect().height > 0;
}

/**
 * Where a guide's tooltip must stay below, from the top of the screen: a gap under the practice
 * banner wherever it is, whether it has stuck to the top as the page scrolled or still sits in its
 * place under the header. Read at the moment a tooltip is placed.
 */
export const practiceBannerBottom = () => {
  const banner = document.querySelector('[data-practice-banner]');
  return (banner ? banner.getBoundingClientRect().bottom : 0) + 8;
};
