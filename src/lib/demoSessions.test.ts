import { describe, expect, it } from 'vitest';
import { buildCard, settlementPairs } from './collection';
import { buildNeedsSetupSessions } from './demoSessions';

describe('buildNeedsSetupSessions', () => {
  const [red, none, both] = buildNeedsSetupSessions();

  it('makes three closed sessions with no pick and no payments', () => {
    for (const s of [red, none, both]) {
      expect(s.status).toBe('closed');
      expect(s.me).toBeNull();
      expect(s.payments).toEqual([]);
      expect(s.name).toMatch(/^Needs setup/);
    }
  });

  it('keeps "Renmar" out of every one, and gives each its names', () => {
    expect(red.members).toContain('Red');
    expect(none.members).not.toContain('Red');
    expect(none.members).not.toContain('Pao');
    expect(both.members).toEqual(expect.arrayContaining(['Red', 'Pao']));
    for (const s of [red, none, both]) expect(s.members).not.toContain('Renmar');
  });

  it('gives each session settlement lines, so a confirmed pick has something to show', () => {
    for (const s of [red, none, both]) expect(settlementPairs(s).length).toBeGreaterThan(0);
  });

  it('is unplaced under the profile name "Renmar", and suggested once "Red" is saved', () => {
    expect(buildCard(red, { displayName: 'Renmar', nicknames: [] }).me).toEqual({
      kind: 'unknown',
      suggested: null,
    });
    expect(buildCard(red, { displayName: 'Renmar', nicknames: ['Red'] }).me).toEqual({
      kind: 'unknown',
      suggested: 'Red',
    });
    // With both names saved there are two hits, so nothing is preselected.
    expect(buildCard(both, { displayName: 'Renmar', nicknames: ['Red', 'Pao'] }).me).toEqual({
      kind: 'unknown',
      suggested: null,
    });
  });
});
