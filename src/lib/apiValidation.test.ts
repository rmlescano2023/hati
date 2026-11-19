import { describe, expect, it } from 'vitest';
import {
  isPracticeSessionId,
  parsePaymentsInput,
  parseProfileInput,
  parseSessionIdQuery,
  parseSessionInput,
  parseUserMark,
} from '../../api/_validate';
import { exampleB } from './billExamples';
import { NICKNAMES_MAX } from './profileName';

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'pay_abc123',
  debtor: 'Ana',
  creditor: 'Renmar',
  amountCents: 10000,
  ...over,
});

const body = (payments: unknown, over: Record<string, unknown> = {}) => ({
  sessionId: 'session_1',
  payments,
  ...over,
});

describe('parsePaymentsInput', () => {
  it('parses one payment', () => {
    expect(parsePaymentsInput(body([entry()]))).toEqual({
      sessionId: 'session_1',
      payments: [entry()],
    });
  });

  it('parses a batch of three', () => {
    const batch = [
      entry({ id: 'pay_1' }),
      entry({ id: 'pay_2', debtor: 'Cara' }),
      entry({ id: 'pay_3', debtor: 'Renmar', creditor: 'Ben' }),
    ];
    expect(parsePaymentsInput(body(batch))?.payments).toEqual(batch);
  });

  it('rejects a body that is not an object, or has no session id', () => {
    expect(parsePaymentsInput(null)).toBeNull();
    expect(parsePaymentsInput([entry()])).toBeNull();
    expect(parsePaymentsInput({ payments: [entry()] })).toBeNull();
  });

  it('rejects an empty list and one over 200, and takes exactly 200', () => {
    expect(parsePaymentsInput(body([]))).toBeNull();
    const list = (n: number) =>
      Array.from({ length: n }, (_, i) => entry({ id: `pay_${i}`, debtor: `D${i}` }));
    expect(parsePaymentsInput(body(list(200)))?.payments).toHaveLength(200);
    expect(parsePaymentsInput(body(list(201)))).toBeNull();
  });

  it('rejects a bad id', () => {
    for (const id of ['x', 'pay_', 'pay_a-b']) {
      expect(parsePaymentsInput(body([entry({ id })]))).toBeNull();
    }
  });

  it('rejects a debtor equal to the creditor, or an empty one', () => {
    expect(parsePaymentsInput(body([entry({ debtor: 'Renmar' })]))).toBeNull();
    expect(parsePaymentsInput(body([entry({ debtor: '' })]))).toBeNull();
  });

  it('rejects an amount that is not a whole number of centavos in range', () => {
    for (const amountCents of [0, -1, 1.5, '100', 2_147_483_648]) {
      expect(parsePaymentsInput(body([entry({ amountCents })]))).toBeNull();
    }
  });

  it('rejects a repeated id or a repeated pair', () => {
    expect(parsePaymentsInput(body([entry(), entry({ debtor: 'Cara' })]))).toBeNull();
    expect(parsePaymentsInput(body([entry({ id: 'pay_1' }), entry({ id: 'pay_2' })]))).toBeNull();
  });
});

describe('parseProfileInput', () => {
  it('tidies the name', () => {
    expect(parseProfileInput({ displayName: '  ana ' })).toEqual({ displayName: 'Ana' });
  });

  it('reads null or a blank name as unsetting it', () => {
    expect(parseProfileInput({ displayName: null })).toEqual({ displayName: null });
    expect(parseProfileInput({ displayName: '  ' })).toEqual({ displayName: null });
  });

  it('rejects anything else', () => {
    for (const bad of [{}, { displayName: 5 }, null, []]) {
      expect(parseProfileInput(bad)).toBeNull();
    }
  });

  it('tidies the other names and drops blanks (BR-N6)', () => {
    expect(parseProfileInput({ nicknames: [' pao ', '  '] })).toEqual({ nicknames: ['Pao'] });
  });

  it('takes the name and the other names together', () => {
    expect(parseProfileInput({ displayName: 'paolo', nicknames: [] })).toEqual({
      displayName: 'Paolo',
      nicknames: [],
    });
  });

  it('accepts a list at the limit (AC-R2-3.4)', () => {
    expect(parseProfileInput({ nicknames: ['a', 'b', 'c'] })).toEqual({
      nicknames: ['A', 'B', 'C'],
    });
  });

  it('takes one name to add (BR-N11)', () => {
    expect(parseProfileInput({ addNickname: ' pao ' })).toEqual({ addNickname: 'Pao' });
  });

  it('rejects other names that are not a short list of strings', () => {
    const tooMany = Array.from({ length: NICKNAMES_MAX + 1 }, (_, i) => `n${i}`);
    for (const bad of [{ nicknames: 'Pao' }, { nicknames: [5] }, { nicknames: tooMany }]) {
      expect(parseProfileInput(bad)).toBeNull();
    }
  });

  it('rejects a blank or mistyped name to add, and one mixed with a set', () => {
    for (const bad of [
      { addNickname: '  ' },
      { addNickname: 5 },
      { addNickname: 'Pao', displayName: 'X' },
      { addNickname: 'Pao', nicknames: [] },
    ]) {
      expect(parseProfileInput(bad)).toBeNull();
    }
  });
});

describe('parseUserMark', () => {
  it('reads no body as the onboarding mark, which is what every old client sends', () => {
    expect(parseUserMark(undefined)).toBe('onboarding');
    expect(parseUserMark(null)).toBe('onboarding');
  });

  it('passes the four named marks', () => {
    expect(parseUserMark({ mark: 'whatsNew' })).toBe('whatsNew');
    expect(parseUserMark({ mark: 'alreadySettled' })).toBe('alreadySettled');
    expect(parseUserMark({ mark: 'expensesGuide' })).toBe('expensesGuide');
    expect(parseUserMark({ mark: 'collectionGuide' })).toBe('collectionGuide');
  });

  it('rejects anything else', () => {
    for (const bad of [
      {},
      { mark: 'x' },
      { mark: 'onboarding' },
      { mark: 'expenses' },
      { mark: 'guide' },
      'whatsNew',
      [],
      5,
    ]) {
      expect(parseUserMark(bad)).toBeNull();
    }
  });
});

describe('parseSessionIdQuery', () => {
  it('passes a session id', () => {
    expect(parseSessionIdQuery('session_a')).toBe('session_a');
  });

  it('rejects an empty, missing, repeated or over-long one', () => {
    for (const bad of ['', undefined, ['a', 'b'], 'x'.repeat(201)]) {
      expect(parseSessionIdQuery(bad)).toBeNull();
    }
  });
});

describe('parseSessionInput and a Custom item with a bill', () => {
  const session = (item: unknown) => ({
    members: ['Ana', 'Ben', 'Cy', 'Dan', 'Eve', 'Fay'],
    records: [
      {
        id: 'rec_1',
        date: '2026-11-16',
        payorMode: 'single',
        payors: [{ member: 'Ana', amount: 2401.05 }],
        items: [item],
        createdAt: '2026-11-16T02:00:00.000Z',
      },
    ],
  });

  it('A-1 returns the session with the bill of Example B', () => {
    const b = exampleB();
    const parsed = parseSessionInput('session_1', session(b));
    expect(parsed?.id).toBe('session_1');
    expect(parsed?.records[0].items[0]).toEqual(b);
  });

  it('A-2 never answers a broken bill with a rejection: it drops the bill and keeps the amounts', () => {
    const b = exampleB();
    const parsed = parseSessionInput(
      'session_1',
      session({ ...b, amounts: { ...b.amounts, Dan: 1 } }),
    );
    expect(parsed).not.toBeNull();
    const item = parsed?.records[0].items[0];
    expect(item?.mode === 'custom' && 'bill' in item).toBe(false);
    expect(item?.mode === 'custom' && item.amounts.Dan).toBe(1);
    expect(parseSessionInput('session_1', session({ ...b, bill: 'nope' }))).not.toBeNull();
  });
});

describe('isPracticeSessionId', () => {
  it('is true for a practice id', () => {
    expect(isPracticeSessionId('practice_expenses')).toBe(true);
  });

  it('is false for ordinary ids, a bare prefix word, a different case and nothing', () => {
    for (const id of ['session_ab12', 'practice', 'Practice_x', '']) {
      expect(isPracticeSessionId(id)).toBe(false);
    }
  });
});
