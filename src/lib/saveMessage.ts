/**
 * The message beside Save to Breakdown: what to say about the latest click,
 * and which one message wins when several apply. It is pure, so the
 * component only dispatches and renders, and the rules are tested directly.
 */

/**
 * What a click can find missing, in the order it is checked. Only the items:
 * the date and the payor are stamped on each item when it is added, so an item
 * that is staged always has both.
 */
export type Missing = 'items';
export type MissingFlags = Record<Missing, boolean>;

const CHECK_ORDER: readonly Missing[] = ['items'];

export function firstMissing(missing: MissingFlags): Missing | null {
  return CHECK_ORDER.find((m) => missing[m]) ?? null;
}

/** How long a save may run before "Saving…" admits it is slow. */
export const SLOW_SAVE_MS = 10_000;

export type SaveStatus = 'idle' | 'saving' | 'stillSaving' | 'saved' | 'notSaved';

export type SaveMessageState = {
  /** The latest click that saved, so an earlier click's timer or outcome can be told apart. */
  save: number;
  status: SaveStatus;
  /** Shown over `status` while what it names is still missing. */
  validation: Missing | null;
};

export type SaveMessageAction =
  /** A click with everything present. */
  | { type: 'start'; save: number }
  /** A click with something missing. Nothing is saved, and the save state carries on underneath. */
  | { type: 'invalid'; missing: MissingFlags }
  /** `SLOW_SAVE_MS` has passed since click `save`. */
  | { type: 'slow'; save: number }
  /** The server accepted click `save`'s purchase, or a failure was reported for it. */
  | { type: 'settled'; save: number; saved: boolean }
  /** "+ Add Item", which has always cleared the message. */
  | { type: 'itemAdded' }
  /** The error banner has gone, so nothing is left explaining "Not saved." */
  | { type: 'bannerCleared' }
  | { type: 'clearValidation' };

export const initialSaveMessage: SaveMessageState = { save: 0, status: 'idle', validation: null };

const isWaiting = (status: SaveStatus) => status === 'saving' || status === 'stillSaving';

/**
 * A save empties the staging list, so a quick second tap meets exactly this
 * gap. Telling that tap to add an item would hide "Saving…" for no reason, so
 * it is ignored instead.
 */
const onlyResetGaps = (missing: MissingFlags) => missing.items;

/**
 * Returns `state` itself when nothing changes, so a repeated click or a stale
 * timer costs no render. A change of save state drops any validation message,
 * because a double tap puts one over "Saving…" and it must not hide whether
 * the save landed.
 */
export function saveMessageReducer(
  state: SaveMessageState,
  action: SaveMessageAction,
): SaveMessageState {
  switch (action.type) {
    case 'start':
      return { save: action.save, status: 'saving', validation: null };
    case 'invalid': {
      if (isWaiting(state.status) && onlyResetGaps(action.missing)) return state;
      const gap = firstMissing(action.missing);
      return state.validation === gap ? state : { ...state, validation: gap };
    }
    case 'slow':
      return action.save === state.save && state.status === 'saving'
        ? { ...state, status: 'stillSaving', validation: null }
        : state;
    case 'settled':
      // Saved and Not saved are final: only a click still waiting takes an outcome.
      return action.save === state.save && isWaiting(state.status)
        ? { ...state, status: action.saved ? 'saved' : 'notSaved', validation: null }
        : state;
    case 'itemAdded':
      // "Saving…" and "Not saved" stay, so the user still learns how the last
      // purchase went, and isn't told nothing is wrong when it might be.
      return {
        ...state,
        status: state.status === 'saved' ? 'idle' : state.status,
        validation: null,
      };
    case 'bannerCleared':
      return state.status === 'notSaved' ? { ...state, status: 'idle' } : state;
    case 'clearValidation':
      return state.validation === null ? state : { ...state, validation: null };
  }
}

const SAVE_TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  stillSaving: 'Still saving…',
  saved: 'Saved to Breakdown.',
  notSaved: 'Not saved.',
};

/**
 * Short enough to fit two lines beside the button at 320px, so the
 * row never grows. "Not saved." is shorter still, because the banner above
 * already explains the failure.
 */
const VALIDATION_TEXT: Record<Missing, string> = {
  items: 'Add an item first.',
};

export type SaveMessageTone = 'muted' | 'accent' | 'error';

const SAVE_TONE: Record<SaveStatus, SaveMessageTone> = {
  idle: 'muted',
  saving: 'muted',
  stillSaving: 'muted',
  saved: 'accent',
  notSaved: 'error',
};

/**
 * The one message to show. A validation message disappears as soon as what
 * it names is supplied, read from the form as it is now, so it never
 * outlives the problem by a render.
 */
export function saveMessageView(
  state: SaveMessageState,
  missing: MissingFlags,
): { text: string; tone: SaveMessageTone } {
  if (state.validation && missing[state.validation]) {
    return { text: VALIDATION_TEXT[state.validation], tone: 'error' };
  }
  return { text: SAVE_TEXT[state.status], tone: SAVE_TONE[state.status] };
}
