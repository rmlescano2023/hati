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

  it('visits every part of the app', () => {
    const seen = new Set(
      TOUR_STEPS.map((s) =>
        s.screen.kind === 'session' ? `session:${s.screen.tab}` : s.screen.kind,
      ),
    );
    expect([...seen].sort()).toEqual([
      'history',
      'home',
      'session:breakdown',
      'session:expenses',
      'session:summary',
    ]);
  });

  it('enters and leaves the session workspace exactly once', () => {
    // Home appears twice on purpose — the tour goes in, then comes back out to
    // show that leaving keeps the session. But bouncing in and out of the
    // workspace would read as the app navigating at random.
    const inSession = TOUR_STEPS.map((s) => s.screen.kind === 'session');
    const entries = inSession.filter((v, i) => v && !inSession[i - 1]).length;
    expect(entries).toBe(1);
  });

  it('moves through the session tabs in the order the app presents them', () => {
    const tabs = TOUR_STEPS.flatMap((s) => (s.screen.kind === 'session' ? [s.screen.tab] : []));
    const order = ['expenses', 'breakdown', 'summary'] as const;
    const firstSeen = order.map((t) => tabs.indexOf(t));
    expect(firstSeen.every((n) => n >= 0)).toBe(true);
    expect([...firstSeen].sort((a, b) => a - b)).toEqual(firstSeen);
  });

  it('gives every step a target and some words', () => {
    for (const step of TOUR_STEPS) {
      expect(step.target).toMatch(/^[a-z-]+$/);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.content.length).toBeGreaterThan(20);
    }
  });
});
