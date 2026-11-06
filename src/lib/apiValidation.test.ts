import { describe, expect, it } from 'vitest';
import { parsePaymentsInput, parseProfileInput } from '../../api/_validate';
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

  it('rejects an empty list and one over 100', () => {
    expect(parsePaymentsInput(body([]))).toBeNull();
    const many = Array.from({ length: 101 }, (_, i) => entry({ id: `pay_${i}`, debtor: `D${i}` }));
    expect(parsePaymentsInput(body(many))).toBeNull();
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
