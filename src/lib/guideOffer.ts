export type Guide = 'expenses' | 'collection';

/** Whether each guide has been started or declined on this account; null until the account is read. */
export type GuideSeen = Record<Guide, boolean> | null;

export type OfferContext = {
  /** The tab this visit is on: a real session's Expenses tab, Collection, or neither. */
  tab: Guide | null;
  seen: GuideSeen;
  /** A one-time prompt (welcome, tour, "You're all set!", What's new) is open, or opened earlier this visit. */
  prompted: boolean;
  /** Profile, Tutorials, New Session, the app's "Leave without saving?", or an offer, is open. */
  dialogOpen: boolean;
  /** Expenses only: staged items or an open saved-item edit, which is how a visit through Breakdown's Edit looks. */
  unsaved: boolean;
  /** Collection only: the profile has loaded, and "Already settled?" is neither due nor asked this visit. */
  collectionClear: boolean;
};

/** The guide to offer on this visit, if any (BR-TG8, BR-TG9). */
export function guideOfferDue(c: OfferContext): Guide | null {
  if (c.tab === null || c.seen === null || c.seen[c.tab]) return null;
  if (c.prompted || c.dialogOpen) return null;
  if (c.tab === 'expenses' && c.unsaved) return null;
  if (c.tab === 'collection' && !c.collectionClear) return null;
  return c.tab;
}
