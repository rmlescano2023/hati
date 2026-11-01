import { describe, expect, it } from 'vitest';
import { SESSION_NAME_MAX, applySessionName, normaliseSessionName } from './sessionName';
import type { Session } from '../types';

const session = (over: Partial<Session> = {}): Session => ({
  id: 'session_1',
  status: 'draft',
  createdAt: '2026-09-17T08:00:00.000Z',
  closedAt: null,
  members: ['Ana'],
  records: [],
  name: null,
  ...over,
});

/** True when the string holds a high or low surrogate without its partner. */
const hasLoneSurrogate = (s: string) =>
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe('normaliseSessionName', () => {
  it('trims the ends', () => {
    expect(normaliseSessionName('  Bali Trip  ')).toBe('Bali Trip');
  });

  it('collapses runs of spaces, tabs and newlines to one space', () => {
    expect(normaliseSessionName('Bali \t\n  Trip')).toBe('Bali Trip');
  });

  it('turns a control character into a space, so a NUL can never reach Postgres', () => {
    expect(normaliseSessionName('a\u0000b')).toBe('a b');
  });

  it('treats an empty or blank name as no name', () => {
    expect(normaliseSessionName('')).toBeNull();
    expect(normaliseSessionName('   ')).toBeNull();
  });

  it('treats anything that is not a string as no name', () => {
    for (const bad of [42, {}, [], undefined, null]) {
      expect(normaliseSessionName(bad)).toBeNull();
    }
  });

  it('cuts an over-long name to the limit', () => {
    expect(normaliseSessionName('x'.repeat(80))).toBe('x'.repeat(SESSION_NAME_MAX));
    expect(SESSION_NAME_MAX).toBe(60);
  });

  it('counts code points, so an emoji is never split in half', () => {
    const result = normaliseSessionName('🍻'.repeat(70));
    expect(result).not.toBeNull();
    expect(Array.from(result!)).toHaveLength(60);
    expect(hasLoneSurrogate(result!)).toBe(false);
  });

  it('trims a cut that lands on a space', () => {
    const raw = `${'a'.repeat(59)} b`;
    expect(normaliseSessionName(raw)).toBe('a'.repeat(59));
  });

  it('keeps the casing as typed', () => {
    expect(normaliseSessionName('bali TRIP')).toBe('bali TRIP');
  });
});

describe('applySessionName', () => {
  it('returns the same object when the name is unchanged', () => {
    const s = session({ name: 'Bali Trip' });
    expect(applySessionName(s, 'Bali Trip')).toBe(s);
  });

  it('returns the same object when the name only differs by tidying', () => {
    const s = session({ name: 'Bali Trip' });
    expect(applySessionName(s, '  Bali   Trip ')).toBe(s);
  });

  it('never renames a closed session', () => {
    const s = session({ status: 'closed', closedAt: '2026-09-20T08:00:00.000Z', name: 'Bali' });
    expect(applySessionName(s, 'Somewhere else')).toBe(s);
  });

  it('returns a new session with the tidied name when it changes', () => {
    const s = session({ name: 'Bali' });
    const next = applySessionName(s, ' Bali  Trip ');
    expect(next).not.toBe(s);
    expect(next).toEqual({ ...s, name: 'Bali Trip' });
  });

  it('clears the name when the new one is blank', () => {
    expect(applySessionName(session({ name: 'Bali Trip' }), '  ').name).toBeNull();
  });

  it('returns the same object when a blank name is saved on an unnamed draft', () => {
    const s = session();
    expect(applySessionName(s, '')).toBe(s);
  });
});
