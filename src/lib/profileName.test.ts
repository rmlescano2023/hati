import { describe, expect, it } from 'vitest';
import {
  NICKNAMES_MAX,
  PROFILE_NAME_MAX,
  applyProfileUpdate,
  cleanNicknames,
  normaliseProfileName,
} from './profileName';

describe('normaliseProfileName', () => {
  it('tidies and title-cases the name (AC-2.3)', () => {
    expect(normaliseProfileName('  renmar   ')).toBe('Renmar');
    expect(normaliseProfileName('bea  marie')).toBe('Bea Marie');
  });

  it('reads a blank or non-string value as no name (AC-2.4)', () => {
    for (const blank of ['', '   ', null, 42]) {
      expect(normaliseProfileName(blank)).toBeNull();
    }
  });

  it('cuts a long name to the limit with no trailing space (AC-2.6)', () => {
    const cut = normaliseProfileName(`${'a'.repeat(59)} ${'b'.repeat(10)}`);
    expect(cut).toBe(`A${'a'.repeat(58)}`);
    const long = normaliseProfileName('x'.repeat(70));
    expect(Array.from(long ?? '')).toHaveLength(PROFILE_NAME_MAX);
  });

  it('turns a tab or a control character into a space', () => {
    expect(normaliseProfileName('ana\tbea')).toBe('Ana Bea');
    expect(normaliseProfileName('ana\u0000bea')).toBe('Ana Bea');
  });
});

describe('cleanNicknames (BR-N6, BR-N8, BR-N9)', () => {
  it('tidies and title-cases each name, and drops blanks', () => {
    expect(cleanNicknames(['  pao ', '   ', 'red   tan'], 'Paolo')).toEqual(['Pao', 'Red Tan']);
  });

  it('keeps one of two names that differ only by case or accent', () => {
    expect(cleanNicknames(['pao', 'Páo'], null)).toEqual(['Pao']);
  });

  it('drops a name equal to the profile name (E5)', () => {
    expect(cleanNicknames(['Paolo', 'pao'], 'paolo')).toEqual(['Pao']);
  });

  it('sorts the result', () => {
    expect(cleanNicknames(['Tantan', 'Red', 'Pao'], null)).toEqual(['Pao', 'Red', 'Tantan']);
  });
});

describe('applyProfileUpdate (BR-N7, BR-N11, BR-N13)', () => {
  const stored = { displayName: 'Paolo', nicknames: ['Pao', 'Red'] };

  it('keeps the other names on a name-only update, minus one now equal to the name (BR-N8)', () => {
    expect(applyProfileUpdate(stored, { displayName: 'Ana' })).toEqual({
      displayName: 'Ana',
      nicknames: ['Pao', 'Red'],
    });
    expect(applyProfileUpdate(stored, { displayName: 'pao' })).toEqual({
      displayName: 'pao',
      nicknames: ['Red'],
    });
  });

  it('keeps the name on a nicknames-only update', () => {
    expect(applyProfileUpdate(stored, { nicknames: ['tantan'] })).toEqual({
      displayName: 'Paolo',
      nicknames: ['Tantan'],
    });
  });

  it('replaces both when both are given', () => {
    expect(applyProfileUpdate(stored, { displayName: null, nicknames: [] })).toEqual({
      displayName: null,
      nicknames: [],
    });
  });

  it('adds a name and sorts', () => {
    expect(applyProfileUpdate(stored, { addNickname: 'Ben' })).toEqual({
      displayName: 'Paolo',
      nicknames: ['Ben', 'Pao', 'Red'],
    });
  });

  it('leaves the profile unchanged, and not null, when the name is already known', () => {
    expect(applyProfileUpdate(stored, { addNickname: 'Páo' })).toEqual(stored);
    expect(applyProfileUpdate(stored, { addNickname: 'Paolo' })).toEqual(stored);
  });

  it('refuses an add past the limit, but not a duplicate at the limit', () => {
    const ten = Array.from(
      { length: NICKNAMES_MAX },
      (_, i) => `Name${String.fromCharCode(97 + i)}`,
    );
    const full = { displayName: 'Paolo', nicknames: ten };
    expect(applyProfileUpdate(full, { addNickname: 'Pao' })).toBeNull();
    expect(applyProfileUpdate(full, { addNickname: 'namea' })).toEqual(full);
  });

  it('adds with no profile name (E4)', () => {
    expect(
      applyProfileUpdate({ displayName: null, nicknames: [] }, { addNickname: 'Pao' }),
    ).toEqual({
      displayName: null,
      nicknames: ['Pao'],
    });
  });
});
