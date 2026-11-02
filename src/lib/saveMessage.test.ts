import { describe, expect, it } from 'vitest';
import {
  firstMissing,
  initialSaveMessage,
  saveMessageReducer,
  saveMessageView,
  type MissingFlags,
  type SaveMessageAction,
  type SaveMessageState,
} from './saveMessage';

const complete: MissingFlags = { items: false, date: false, payor: false };

/** Runs actions from the initial state, as the component's dispatches would. */
function run(...actions: SaveMessageAction[]): SaveMessageState {
  return actions.reduce(saveMessageReducer, initialSaveMessage);
}

const text = (state: SaveMessageState, missing: MissingFlags = complete) =>
  saveMessageView(state, missing).text;

describe('firstMissing', () => {
  it('checks items, then date, then payor', () => {
    expect(firstMissing({ items: true, date: true, payor: true })).toBe('items');
    expect(firstMissing({ items: false, date: true, payor: true })).toBe('date');
    expect(firstMissing({ items: false, date: false, payor: true })).toBe('payor');
    expect(firstMissing(complete)).toBeNull();
  });

  it('names the date, not the payor, when only the date is missing (AC-D6.8)', () => {
    expect(firstMissing({ items: false, date: true, payor: false })).toBe('date');
  });
});

describe('saveMessageReducer and saveMessageView', () => {
  it('starts empty', () => {
    expect(text(initialSaveMessage)).toBe('');
  });

  it('reads Saving… on click, then Saved once confirmed', () => {
    const saving = run({ type: 'start', save: 1 });
    expect(saveMessageView(saving, complete)).toEqual({ text: 'Saving…', tone: 'muted' });
    const saved = saveMessageReducer(saving, { type: 'settled', save: 1, saved: true });
    expect(saveMessageView(saved, complete)).toEqual({
      text: 'Saved to Breakdown.',
      tone: 'accent',
    });
  });

  it('turns Saving… into Still saving… when the slow timer fires (AC-D3.1)', () => {
    const state = run({ type: 'start', save: 1 }, { type: 'slow', save: 1 });
    expect(saveMessageView(state, complete)).toEqual({ text: 'Still saving…', tone: 'muted' });
    expect(text(saveMessageReducer(state, { type: 'settled', save: 1, saved: true }))).toBe(
      'Saved to Breakdown.',
    );
  });

  it('never shows Still saving… after an outcome, whichever fires first (AC-D3.5)', () => {
    const saved = run({ type: 'start', save: 1 }, { type: 'settled', save: 1, saved: true });
    expect(text(saveMessageReducer(saved, { type: 'slow', save: 1 }))).toBe('Saved to Breakdown.');
    const failed = run({ type: 'start', save: 1 }, { type: 'settled', save: 1, saved: false });
    expect(text(saveMessageReducer(failed, { type: 'slow', save: 1 }))).toBe(
      'Not saved — see above.',
    );
  });

  it("ignores an earlier click's timer and outcome (BR-4, BR-D4)", () => {
    const state = run(
      { type: 'start', save: 1 },
      { type: 'start', save: 2 },
      { type: 'slow', save: 1 },
      { type: 'settled', save: 1, saved: true },
    );
    expect(text(state)).toBe('Saving…');
    expect(text(saveMessageReducer(state, { type: 'settled', save: 2, saved: false }))).toBe(
      'Not saved — see above.',
    );
  });

  it('shows Not saved in error colour on a failure, from Saving… or Still saving… (AC-D4.1, AC-D4.2)', () => {
    expect(
      saveMessageView(
        run({ type: 'start', save: 1 }, { type: 'settled', save: 1, saved: false }),
        complete,
      ),
    ).toEqual({ text: 'Not saved — see above.', tone: 'error' });
    const late = run(
      { type: 'start', save: 1 },
      { type: 'slow', save: 1 },
      { type: 'settled', save: 1, saved: false },
    );
    expect(text(late)).toBe('Not saved — see above.');
  });

  it('keeps Saved and Not saved final, so neither turns into the other (AC-D4.4)', () => {
    const failed = run({ type: 'start', save: 1 }, { type: 'settled', save: 1, saved: false });
    expect(text(saveMessageReducer(failed, { type: 'settled', save: 1, saved: true }))).toBe(
      'Not saved — see above.',
    );
    const saved = run({ type: 'start', save: 1 }, { type: 'settled', save: 1, saved: true });
    expect(text(saveMessageReducer(saved, { type: 'settled', save: 1, saved: false }))).toBe(
      'Saved to Breakdown.',
    );
  });

  it('clears Not saved to empty when the banner clears, never to Saved (AC-D4.7)', () => {
    const failed = run({ type: 'start', save: 1 }, { type: 'settled', save: 1, saved: false });
    const cleared = saveMessageReducer(failed, { type: 'bannerCleared' });
    expect(text(cleared)).toBe('');
    expect(text(saveMessageReducer(cleared, { type: 'settled', save: 1, saved: true }))).toBe('');
  });

  it('leaves every other state alone when the banner clears', () => {
    const saving = run({ type: 'start', save: 1 });
    expect(saveMessageReducer(saving, { type: 'bannerCleared' })).toBe(saving);
    const saved = saveMessageReducer(saving, { type: 'settled', save: 1, saved: true });
    expect(saveMessageReducer(saved, { type: 'bannerCleared' })).toBe(saved);
  });

  it('replaces Not saved with Saving… on the next click (AC-D4.5)', () => {
    const state = run(
      { type: 'start', save: 1 },
      { type: 'settled', save: 1, saved: false },
      { type: 'start', save: 2 },
    );
    expect(text(state)).toBe('Saving…');
  });

  it('clears Saved when an item is added, but keeps Saving… and Not saved (Q1, BR-D9)', () => {
    const saved = run({ type: 'start', save: 1 }, { type: 'settled', save: 1, saved: true });
    expect(text(saveMessageReducer(saved, { type: 'itemAdded' }))).toBe('');
    const saving = run({ type: 'start', save: 1 });
    expect(text(saveMessageReducer(saving, { type: 'itemAdded' }))).toBe('Saving…');
    const failed = saveMessageReducer(saving, { type: 'settled', save: 1, saved: false });
    expect(text(saveMessageReducer(failed, { type: 'itemAdded' }))).toBe('Not saved — see above.');
  });

  it('shows each validation message in error colour, with the exact wording', () => {
    const missingAll: MissingFlags = { items: true, date: true, payor: true };
    expect(saveMessageView(run({ type: 'invalid', missing: 'items' }), missingAll)).toEqual({
      text: 'Add an item first.',
      tone: 'error',
    });
    expect(text(run({ type: 'invalid', missing: 'date' }), missingAll)).toBe('Pick a date.');
    expect(text(run({ type: 'invalid', missing: 'payor' }), missingAll)).toBe('Choose who paid.');
  });

  it('puts validation over the save state, which keeps running underneath (D2, AC-D6.4)', () => {
    const missingItems: MissingFlags = { items: true, date: false, payor: true };
    const state = run({ type: 'start', save: 1 }, { type: 'invalid', missing: 'items' });
    expect(text(state, missingItems)).toBe('Add an item first.');
    expect(text(saveMessageReducer(state, { type: 'clearValidation' }), missingItems)).toBe(
      'Saving…',
    );
  });

  it('drops validation when the save state changes (BR-D1, AC-D6.5)', () => {
    const missingItems: MissingFlags = { items: true, date: false, payor: true };
    const base = run({ type: 'start', save: 1 }, { type: 'invalid', missing: 'items' });
    expect(text(saveMessageReducer(base, { type: 'slow', save: 1 }), missingItems)).toBe(
      'Still saving…',
    );
    expect(
      text(saveMessageReducer(base, { type: 'settled', save: 1, saved: true }), missingItems),
    ).toBe('Saved to Breakdown.');
    expect(
      text(saveMessageReducer(base, { type: 'settled', save: 1, saved: false }), missingItems),
    ).toBe('Not saved — see above.');
  });

  it("keeps validation over a stale click's timer or outcome", () => {
    const missingItems: MissingFlags = { items: true, date: false, payor: true };
    const state = run(
      { type: 'start', save: 1 },
      { type: 'start', save: 2 },
      { type: 'invalid', missing: 'items' },
      { type: 'slow', save: 1 },
      { type: 'settled', save: 1, saved: true },
    );
    expect(text(state, missingItems)).toBe('Add an item first.');
  });

  it('hides validation once its item is supplied, without moving on to the next one (BR-D14)', () => {
    const state = run({ type: 'invalid', missing: 'date' });
    expect(text(state, { items: false, date: false, payor: true })).toBe('');
  });

  it('replaces validation with Saving… on a click that saves (BR-D2)', () => {
    const state = run({ type: 'invalid', missing: 'payor' }, { type: 'start', save: 1 });
    expect(text(state, { items: true, date: false, payor: true })).toBe('Saving…');
  });

  it('returns the same state for a click with nothing new, so nothing re-renders', () => {
    const state = run({ type: 'invalid', missing: 'items' });
    expect(saveMessageReducer(state, { type: 'invalid', missing: 'items' })).toBe(state);
    expect(saveMessageReducer(initialSaveMessage, { type: 'clearValidation' })).toBe(
      initialSaveMessage,
    );
  });
});
