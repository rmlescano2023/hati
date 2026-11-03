import { describe, expect, it } from 'vitest';
import { PROFILE_NAME_MAX, normaliseProfileName } from './profileName';

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
