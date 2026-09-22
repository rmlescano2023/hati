import { describe, expect, it } from 'vitest';
import { TOUR_STEPS, screenMatches } from './steps';

describe('screenMatches', () => {
  it('matches a top-level screen by kind', () => {
    expect(screenMatches({ kind: 'home' }, { kind: 'home' })).toBe(true);
    expect(screenMatches({ kind: 'home' }, { kind: 'history' })).toBe(false);
  });

  it('matches a session screen only on the same tab', () => {
    const step = { kind: 'session', tab: 'breakdown' } as const;
    expect(screenMatches(step, { kind: 'session', tab: 'breakdown' })).toBe(true);
    expect(screenMatches(step, { kind: 'session', tab: 'summary' })).toBe(false);
  });

  it('does not match a session step against a top-level screen', () => {
    expect(screenMatches({ kind: 'session', tab: 'expenses' }, { kind: 'home' })).toBe(false);
  });
});

describe('the tour sequence', () => {
  it('starts on Home, so a fresh account sees it immediately', () => {
    expect(TOUR_STEPS[0].screen).toEqual({ kind: 'home' });
  });

  it('ends on History', () => {
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].screen).toEqual({ kind: 'history' });
  });

  it('never asks the user to act on the last step', () => {
    // There would be nothing to advance to.
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].waitsForAction).toBe(false);
  });

  it('makes every screen change an action step', () => {
    // A step that needs a different screen from the one before it can only be
    // reached by the user navigating, so the step before it must wait.
    for (let i = 1; i < TOUR_STEPS.length; i += 1) {
      const prev = TOUR_STEPS[i - 1];
      const changesScreen = !screenMatches(TOUR_STEPS[i].screen, prev.screen);
      if (changesScreen) {
        expect(prev.waitsForAction, `step ${i - 1} precedes a screen change`).toBe(true);
      }
    }
  });

  it('never waits for an action that does not change the screen', () => {
    // Such a step could never advance: nothing would signal completion.
    for (let i = 0; i < TOUR_STEPS.length - 1; i += 1) {
      if (!TOUR_STEPS[i].waitsForAction) continue;
      const changesScreen = !screenMatches(TOUR_STEPS[i + 1].screen, TOUR_STEPS[i].screen);
      expect(changesScreen, `step ${i} waits but the screen never changes`).toBe(true);
    }
  });

  it('gives every step a target and some words', () => {
    for (const step of TOUR_STEPS) {
      expect(step.target).toMatch(/^[a-z-]+$/);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.content.length).toBeGreaterThan(20);
    }
  });
});
