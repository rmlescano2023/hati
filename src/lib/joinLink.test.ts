import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOIN_RAW_MAX,
  JOIN_STASH_KEY,
  JOIN_STASH_MS,
  clearJoin,
  inviteUrl,
  peekJoin,
  readJoinParam,
  stashJoin,
  withoutJoinParam,
  type JoinStorage,
} from './joinLink';

const memoryStorage = (): JoinStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
};

const throwingStorage: JoinStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  },
};

describe('readJoinParam', () => {
  it('reads the value, an empty value, and no parameter', () => {
    expect(readJoinParam('?join=abc')).toBe('abc');
    expect(readJoinParam('?join=')).toBe('');
    expect(readJoinParam('')).toBeNull();
    expect(readJoinParam('?other=1')).toBeNull();
  });

  it('cuts a long value', () => {
    expect(readJoinParam(`?join=${'a'.repeat(200)}`)).toHaveLength(JOIN_RAW_MAX);
    expect(JOIN_RAW_MAX).toBe(64);
  });
});

describe('withoutJoinParam', () => {
  it('keeps the other parameters and the hash', () => {
    expect(withoutJoinParam('https://x.app/?a=1&join=x#/sign-in')).toBe('/?a=1#/sign-in');
  });

  it('leaves a bare path when join was the only parameter', () => {
    expect(withoutJoinParam('https://x.app/?join=x')).toBe('/');
  });
});

describe('the stash', () => {
  const T0 = 1_000_000;

  it('is readable for under an hour and gone at an hour, without ever removing it', () => {
    const storage = memoryStorage();
    stashJoin(storage, 'tok', T0);
    expect(storage.data.has(JOIN_STASH_KEY)).toBe(true);
    expect(peekJoin(storage, T0 + JOIN_STASH_MS - 60_000)).toBe('tok');
    expect(peekJoin(storage, T0 + JOIN_STASH_MS)).toBeNull();
    expect(storage.data.has(JOIN_STASH_KEY)).toBe(true);
  });

  it('is removed by clearJoin', () => {
    const storage = memoryStorage();
    stashJoin(storage, 'tok', T0);
    clearJoin(storage);
    expect(peekJoin(storage, T0)).toBeNull();
  });

  it('treats an unreadable stash as none', () => {
    const storage = memoryStorage();
    storage.setItem(JOIN_STASH_KEY, 'not json');
    expect(peekJoin(storage, T0)).toBeNull();
    storage.setItem(JOIN_STASH_KEY, JSON.stringify({ raw: 5, at: T0 }));
    expect(peekJoin(storage, T0)).toBeNull();
  });

  it('never throws on a blocked or missing storage', () => {
    expect(() => stashJoin(throwingStorage, 'tok', T0)).not.toThrow();
    expect(peekJoin(throwingStorage, T0)).toBeNull();
    expect(() => clearJoin(throwingStorage)).not.toThrow();
    expect(() => stashJoin(null, 'tok', T0)).not.toThrow();
    expect(peekJoin(null, T0)).toBeNull();
    expect(() => clearJoin(null)).not.toThrow();
  });
});

describe('inviteUrl', () => {
  it('puts the token in a join parameter on the origin', () => {
    expect(inviteUrl('https://x.app', 'abc')).toBe('https://x.app/?join=abc');
  });
});

describe('main.tsx', () => {
  it('stashes the token and cleans the address bar before it renders', () => {
    const source = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8');
    const stash = source.indexOf('stashJoin(');
    const strip = source.indexOf('replaceState(');
    const render = source.indexOf('createRoot(');
    expect(stash).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(-1);
    expect(stash).toBeLessThan(render);
    expect(strip).toBeLessThan(render);
  });
});
