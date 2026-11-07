import { describe, expect, it } from 'vitest';
import {
  NOT_IN_SESSION,
  buildCard,
  buildCollection,
  isKnownName,
  markAllMessage,
  matchMember,
  nicknamePrompt,
  mergeServerPayments,
  newPayments,
  openLinePayments,
  pairPaymentIds,
  parsePaymentAmount,
  rememberOffer,
  PAYMENTS_PER_REQUEST_MAX,
  resolveMe,
  settlePayments,
  settlementPairs,
  type KnownNames,
} from './collection';
import { NICKNAMES_MAX } from './profileName';
import type { Payment, PurchaseRecord, Session } from '../types';

const names = (displayName: string | null, ...nicknames: string[]): KnownNames => ({
  displayName,
  nicknames,
});

/** One single-payor purchase split equally between `owners`. */
const purchase = (id: string, payor: string, total: number, owners: string[]): PurchaseRecord => ({
  id,
  date: '2026-11-01',
  payorMode: 'single',
  payors: [{ member: payor, amount: 0 }],
  items: [{ id: `itm_${id}`, mode: 'equal', name: 'Item', totalPrice: total, owners }],
  createdAt: '2026-11-01T02:00:00.000Z',
});

const finished = (
  id: string,
  members: string[],
  records: PurchaseRecord[],
  over: Partial<Session> = {},
): Session => ({
  id,
  status: 'closed',
  createdAt: '2026-11-01T00:00:00.000Z',
  closedAt: '2026-11-02T00:00:00.000Z',
  members,
  records,
  name: null,
  activityAt: null,
  me: null,
  finishedWithCollection: false,
  payments: [],
  ...over,
});

const pay = (
  id: string,
  debtor: string,
  creditor: string,
  amountCents: number,
  createdAt = '2026-11-03T00:00:00.000Z',
): Payment => ({ id, debtor, creditor, amountCents, createdAt });

/** Trip A: Renmar paid ₱1,200 for all four; Ben paid ₱800 for himself and Renmar. */
const tripA = (over: Partial<Session> = {}) =>
  finished(
    'session_a',
    ['Ana', 'Ben', 'Cara', 'Renmar'],
    [
      purchase('r1', 'Renmar', 1200, ['Ana', 'Ben', 'Cara', 'Renmar']),
      purchase('r2', 'Ben', 800, ['Ben', 'Renmar']),
    ],
    over,
  );

/** Trip B: Renmar paid ₱100 for all three, which leaves an odd centavo. */
const tripB = (over: Partial<Session> = {}) =>
  finished(
    'session_b',
    ['Ana', 'Ben', 'Renmar'],
    [purchase('r3', 'Renmar', 100, ['Ana', 'Ben', 'Renmar'])],
    over,
  );

/** Trip C: the user isn't a member. */
const tripC = (over: Partial<Session> = {}) =>
  finished('session_c', ['Ana', 'Ben'], [purchase('r4', 'Ana', 100, ['Ana', 'Ben'])], over);

/** Trip D: Renmar and Ana each paid for themselves, so nobody owes anybody. */
const tripD = (over: Partial<Session> = {}) =>
  finished(
    'session_d',
    ['Ana', 'Renmar'],
    [purchase('r5', 'Renmar', 100, ['Renmar']), purchase('r6', 'Ana', 100, ['Ana'])],
    over,
  );

/** Trip E: "Renmar L" never matches the profile name "Renmar". */
const tripE = (over: Partial<Session> = {}) =>
  finished(
    'session_e',
    ['Renmar L', 'Zoe'],
    [purchase('r7', 'Zoe', 100, ['Renmar L', 'Zoe'])],
    over,
  );

describe('settlementPairs', () => {
  it('gives Trip A exactly its three netted lines', () => {
    expect(settlementPairs(tripA())).toEqual([
      { debtor: 'Ana', creditor: 'Renmar', amountCents: 30000 },
      { debtor: 'Cara', creditor: 'Renmar', amountCents: 30000 },
      { debtor: 'Renmar', creditor: 'Ben', amountCents: 10000 },
    ]);
  });

  it('puts the odd centavo where the split puts it (AC-7.7)', () => {
    expect(settlementPairs(tripB())).toEqual([
      { debtor: 'Ana', creditor: 'Renmar', amountCents: 3334 },
      { debtor: 'Ben', creditor: 'Renmar', amountCents: 3333 },
    ]);
  });

  it('gives an even session no lines', () => {
    expect(settlementPairs(tripD())).toEqual([]);
  });
});

const profileHit = (member: string) => ({ member, via: 'profile' });
const nicknameHit = (member: string) => ({ member, via: 'nickname' });

describe('matchMember (BR-4, BR-N2, BR-N3)', () => {
  it('ignores case and accents', () => {
    expect(matchMember(['Ana', 'Renmar'], names('renmar'))).toEqual(profileHit('Renmar'));
    expect(matchMember(['José', 'Ana'], names('Jose'))).toEqual(profileHit('José'));
  });

  it('does not match a longer name', () => {
    expect(matchMember(['Renmar'], names('Renmar L'))).toBeNull();
  });

  it('gives null without any name', () => {
    expect(matchMember(['Renmar'], names(null))).toBeNull();
  });

  it('treats two profile-name matches as none, whatever the other names say', () => {
    expect(matchMember(['José', 'Jose'], names('jose'))).toBeNull();
    expect(matchMember(['José', 'Jose', 'Pao'], names('jose', 'Pao'))).toBeNull();
  });

  it('finds a member by an other name, as a nickname hit (AC-R2-9.1, AC-R2-9.4)', () => {
    expect(matchMember(['Ana', 'Pao'], names('Paolo', 'Pao'))).toEqual(nicknameHit('Pao'));
    expect(matchMember(['Ana', 'Pao'], names(null, 'Pao'))).toEqual(nicknameHit('Pao'));
  });

  it('ignores case and accents but not spaces for other names (AC-N3.2)', () => {
    expect(matchMember(['Ana', 'pao'], names('Paolo', 'Pao'))).toEqual(nicknameHit('pao'));
    expect(matchMember(['Ana', 'Páo'], names('Paolo', 'Pao'))).toEqual(nicknameHit('Páo'));
    expect(matchMember(['Ana', 'Pao L'], names('Paolo', 'Pao'))).toBeNull();
  });

  it('lets the profile name win over an other name (Q1, E2)', () => {
    expect(matchMember(['Paolo', 'Pao'], names('Paolo', 'Pao'))).toEqual(profileHit('Paolo'));
  });

  it('gives null when the other names match two members and the profile name none (AC-N3.3)', () => {
    expect(matchMember(['Pao', 'Red'], names('Paolo', 'Pao', 'Red'))).toBeNull();
    expect(matchMember(['Pao', 'Páo'], names(null, 'Pao'))).toBeNull();
  });

  it('matches a member against the last of a stored list longer than the limit (AC-R2-3.5)', () => {
    const five = names('Paolo', 'Namea', 'Nameb', 'Namec', 'Named', 'Namee');
    expect(matchMember(['Ana', 'Namee'], five)).toEqual(nicknameHit('Namee'));
  });
});

describe('nicknamePrompt', () => {
  it('names the member as it appears in the session', () => {
    expect(nicknamePrompt('Pao')).toBe('You go by “Pao” — is that you here?');
  });
});

describe('isKnownName', () => {
  it('is true for the profile name and for an other name, ignoring case and accents', () => {
    expect(isKnownName('paolo', names('Paolo', 'Pao'))).toBe(true);
    expect(isKnownName('Páo', names('Paolo', 'Pao'))).toBe(true);
  });

  it('is false for anything else, and with no names', () => {
    expect(isKnownName('Pao L', names('Paolo', 'Pao'))).toBe(false);
    expect(isKnownName('Pao', names(null))).toBe(false);
  });
});

describe('resolveMe (BR-5, BR-N4)', () => {
  const members = ['Ana', 'Renmar'];

  it('prefers a picked member over a different match', () => {
    expect(resolveMe({ me: 'Ana', members }, names('Renmar'))).toEqual({
      kind: 'member',
      name: 'Ana',
      picked: true,
    });
  });

  it('keeps a pick of a known name a pick, so its line shows (AC-R2-9.9)', () => {
    expect(resolveMe({ me: 'Renmar', members }, names('Renmar'))).toEqual({
      kind: 'member',
      name: 'Renmar',
      picked: true,
    });
  });

  it('reads the empty pick as not in the session, even with a match', () => {
    expect(resolveMe({ me: NOT_IN_SESSION, members }, names('Renmar'))).toEqual({
      kind: 'notInSession',
    });
  });

  it('falls back to the match when the pick is no longer a member', () => {
    expect(resolveMe({ me: 'Zed', members }, names('Renmar'))).toEqual({
      kind: 'member',
      name: 'Renmar',
      picked: false,
    });
  });

  it('places a profile-name match, and is unknown without one', () => {
    expect(resolveMe({ me: null, members }, names('renmar'))).toEqual({
      kind: 'member',
      name: 'Renmar',
      picked: false,
    });
    expect(resolveMe({ me: null, members }, names('Zoe'))).toEqual({
      kind: 'unknown',
      suggested: null,
    });
    expect(resolveMe({ me: null, members }, names(null))).toEqual({
      kind: 'unknown',
      suggested: null,
    });
  });

  it('only suggests a nickname match, never places it (AC-R2-9.1)', () => {
    expect(resolveMe({ me: null, members }, names('Zoe', 'Ana'))).toEqual({
      kind: 'unknown',
      suggested: 'Ana',
    });
  });
});

describe('buildCard', () => {
  it('splits Trip A into what Renmar is owed and what he owes (AC-6.5, AC-6.7)', () => {
    const card = buildCard(tripA(), names('Renmar'));
    expect(card.bucket).toBe('outstanding');
    expect(card.owedToYou.map((l) => [l.other, l.amountCents, l.status])).toEqual([
      ['Ana', 30000, 'unpaid'],
      ['Cara', 30000, 'unpaid'],
    ]);
    expect(card.youOwe.map((l) => [l.other, l.amountCents, l.status])).toEqual([
      ['Ben', 10000, 'unpaid'],
    ]);
    expect(card.youOwe[0].direction).toBe('youOwe');
    expect([card.settledLineCount, card.lineCount]).toEqual([0, 3]);
    expect(card.owedToYouRemainingCents).toBe(60000);
    expect(card.youOweRemainingCents).toBe(10000);
  });

  it('marks a part payment Partial and keeps the line first (AC-7.2)', () => {
    const card = buildCard(
      tripA({ payments: [pay('pay_1', 'Ana', 'Renmar', 10000)] }),
      names('Renmar'),
    );
    const [ana] = card.owedToYou;
    expect(ana.other).toBe('Ana');
    expect(ana.status).toBe('partial');
    expect(ana.paidCents).toBe(10000);
    expect(ana.remainingCents).toBe(20000);
    expect(card.receivedCents).toBe(10000);
  });

  it('settles the card when every line is paid, at the last payment (AC-11.1)', () => {
    const card = buildCard(
      tripA({
        payments: [
          pay('pay_1', 'Ana', 'Renmar', 30000, '2026-11-03T00:00:00.000Z'),
          pay('pay_2', 'Cara', 'Renmar', 30000, '2026-11-05T00:00:00.000Z'),
          pay('pay_3', 'Renmar', 'Ben', 10000, '2026-11-04T00:00:00.000Z'),
        ],
      }),
      names('Renmar'),
    );
    expect(card.bucket).toBe('settled');
    expect(card.settledLineCount).toBe(3);
    expect(card.settledAt).toBe('2026-11-05T00:00:00.000Z');
    expect(card.receivedCents).toBe(60000);
    expect(card.paidOutCents).toBe(10000);
  });

  it('sorts a paid line after an unpaid one (BR-17a)', () => {
    const card = buildCard(
      tripA({ payments: [pay('pay_1', 'Ana', 'Renmar', 30000)] }),
      names('Renmar'),
    );
    expect(card.owedToYou.map((l) => l.other)).toEqual(['Cara', 'Ana']);
  });

  it('lists a line’s payments newest first, then by id descending', () => {
    const card = buildCard(
      tripA({
        payments: [
          pay('pay_a', 'Ana', 'Renmar', 100, '2026-11-03T00:00:00.000Z'),
          pay('pay_c', 'Ana', 'Renmar', 100, '2026-11-04T00:00:00.000Z'),
          pay('pay_b', 'Ana', 'Renmar', 100, '2026-11-03T00:00:00.000Z'),
        ],
      }),
      names('Renmar'),
    );
    expect(card.owedToYou[0].payments.map((p) => p.id)).toEqual(['pay_c', 'pay_b', 'pay_a']);
  });

  it('settles an even session with no lines, at the finish time', () => {
    const card = buildCard(tripD(), names('Renmar'));
    expect(card.bucket).toBe('settled');
    expect(card.lineCount).toBe(0);
    expect(card.settledAt).toBe('2026-11-02T00:00:00.000Z');
  });

  it('needs setup without a profile, and is settled when not in the session', () => {
    expect(buildCard(tripC(), names(null)).bucket).toBe('needsSetup');
    const out = buildCard(tripC({ me: NOT_IN_SESSION }), names(null));
    expect(out.bucket).toBe('settled');
    expect(out.me).toEqual({ kind: 'notInSession' });
    expect(out.settledAt).toBe('2026-11-02T00:00:00.000Z');
  });

  it('neither counts nor shows a payment whose pair is not a line (BR-15)', () => {
    const card = buildCard(
      tripA({ payments: [pay('pay_x', 'Ana', 'Ben', 5000)] }),
      names('Renmar'),
    );
    expect(card.receivedCents).toBe(0);
    expect(card.paidOutCents).toBe(0);
    expect([...card.owedToYou, ...card.youOwe].flatMap((l) => l.payments)).toEqual([]);
  });

  it('shows only the picked member’s lines, and keeps the rest (AC-5.5, BR-7)', () => {
    const payments = [pay('pay_1', 'Ana', 'Renmar', 10000)];
    const asAna = buildCard(tripA({ me: 'Ana', payments }), names('Renmar'));
    expect(asAna.owedToYou).toEqual([]);
    expect(asAna.youOwe.map((l) => [l.other, l.paidCents])).toEqual([['Renmar', 10000]]);

    const asRenmar = buildCard(tripA({ me: 'Renmar', payments }), names('Renmar'));
    expect(asRenmar.owedToYou[0].paidCents).toBe(10000);
  });

  it('shows an overpaid line as Paid with nothing left (BR-15)', () => {
    const card = buildCard(
      tripA({ payments: [pay('pay_1', 'Ana', 'Renmar', 35000)] }),
      names('Renmar'),
    );
    const ana = card.owedToYou.find((l) => l.other === 'Ana')!;
    expect(ana.status).toBe('paid');
    expect(ana.remainingCents).toBe(0);
    expect(ana.overpaidCents).toBe(5000);
  });
});

describe('buildCollection', () => {
  const draft = tripA({ id: 'session_draft', status: 'draft', closedAt: null });

  it('totals Outstanding only, and leaves drafts out (AC-6.1, AC-6.2, AC-1.5)', () => {
    const c = buildCollection([tripA(), tripB(), tripE(), draft], names('Renmar'));
    expect(c.owedToYouCents).toBe(66667);
    expect(c.youOweCents).toBe(10000);
    expect(c.needsSetup.map((card) => card.session.id)).toEqual(['session_e']);
    const ids = [...c.needsSetup, ...c.outstanding, ...c.settled].map((card) => card.session.id);
    expect(ids).not.toContain('session_draft');
  });

  it('orders Outstanding by finish time, newest first, then by id', () => {
    const c = buildCollection(
      [
        tripA({ id: 'session_old', closedAt: '2026-11-01T00:00:00.000Z' }),
        tripA({ id: 'session_z', closedAt: '2026-11-04T00:00:00.000Z' }),
        tripA({ id: 'session_y', closedAt: '2026-11-04T00:00:00.000Z' }),
      ],
      names('Renmar'),
    );
    expect(c.outstanding.map((card) => card.session.id)).toEqual([
      'session_y',
      'session_z',
      'session_old',
    ]);
  });

  it('orders Settled by when it was settled, newest first', () => {
    const c = buildCollection(
      [
        tripD({ id: 'session_even', closedAt: '2026-11-02T00:00:00.000Z' }),
        tripB({
          payments: [
            pay('pay_1', 'Ana', 'Renmar', 3334, '2026-11-06T00:00:00.000Z'),
            pay('pay_2', 'Ben', 'Renmar', 3333, '2026-11-06T00:00:00.000Z'),
          ],
        }),
      ],
      names('Renmar'),
    );
    expect(c.settled.map((card) => card.session.id)).toEqual(['session_b', 'session_even']);
  });

  it('totals nothing once everything is settled (AC-6.3)', () => {
    const c = buildCollection([tripD(), tripC({ me: NOT_IN_SESSION })], names('Renmar'));
    expect([c.owedToYouCents, c.youOweCents]).toEqual([0, 0]);
    expect(c.outstanding).toEqual([]);
  });

  it('moves matched-only sessions to Needs setup on a rename, keeping picks (AC-12.3)', () => {
    const picked = tripB({ me: 'Renmar' });
    const c = buildCollection([tripA(), picked], names('Ren'));
    expect(c.needsSetup.map((card) => card.session.id)).toEqual(['session_a']);
    expect(c.outstanding.map((card) => card.session.id)).toEqual(['session_b']);
  });
});

describe('buildCollection with other names (US-N1, US-N3)', () => {
  const paoTrip = (over: Partial<Session> = {}) =>
    finished('session_pao', ['Ana', 'Pao'], [purchase('r8', 'Pao', 100, ['Ana', 'Pao'])], over);

  it('suggests a nickname match in Needs setup, out of the totals (AC-R2-9.1)', () => {
    const c = buildCollection([paoTrip()], names('Paolo', 'Pao'));
    expect(c.outstanding).toEqual([]);
    expect(c.needsSetup[0].me).toEqual({ kind: 'unknown', suggested: 'Pao' });
    expect([c.owedToYouCents, c.youOweCents]).toEqual([0, 0]);
  });

  it('places the session once Pao is confirmed, and keeps it when the name goes (AC-R2-9.2)', () => {
    const confirmed = paoTrip({ me: 'Pao' });
    expect(buildCollection([confirmed], names('Paolo', 'Pao')).outstanding).toHaveLength(1);
    const after = buildCollection([confirmed], names('Paolo'));
    expect(after.outstanding[0].me).toMatchObject({ name: 'Pao', picked: true });
    expect(after.outstanding[0].owedToYou.concat(after.outstanding[0].youOwe)).toHaveLength(1);
  });

  it('drops the suggestion when the name is removed (AC-R2-9.8)', () => {
    const c = buildCollection([paoTrip()], names('Paolo'));
    expect(c.needsSetup[0].me).toEqual({ kind: 'unknown', suggested: null });
  });

  it('keeps a session with the profile name and a friend placed as the profile name (AC-R2-9.6)', () => {
    const both = finished(
      'session_both',
      ['Paolo', 'Pao'],
      [purchase('r9', 'Paolo', 100, ['Paolo', 'Pao'])],
    );
    for (const known of [names('Paolo'), names('Paolo', 'Pao')]) {
      expect(buildCollection([both], known).outstanding[0].me).toMatchObject({
        name: 'Paolo',
        picked: false,
      });
    }
  });

  it('does not place a one-member session from a nickname alone (E19)', () => {
    const solo = finished('session_solo', ['Pao'], []);
    expect(buildCard(solo, names('Pao')).me).toMatchObject({ name: 'Pao', picked: false });
    expect(buildCard(solo, names(null, 'Pao')).me).toEqual({ kind: 'unknown', suggested: 'Pao' });
    expect(buildCard(solo, names(null)).me).toEqual({ kind: 'unknown', suggested: null });
    // With no pairs there is nothing to collect, so it is Settled whoever "me" is (Q4).
    expect(buildCard(solo, names(null)).bucket).toBe('settled');
  });
});

describe('rememberOffer (BR-N10)', () => {
  const ready = (displayName: string | null, ...nicknames: string[]) => ({
    status: 'ready',
    ...names(displayName, ...nicknames),
  });

  it('offers nothing until the profile has loaded, or for no real member', () => {
    expect(rememberOffer({ ...ready('Paolo'), status: 'loading' }, 'Pao')).toBeNull();
    expect(rememberOffer({ ...ready('Paolo'), status: 'error' }, 'Pao')).toBeNull();
    expect(rememberOffer(ready('Paolo'), NOT_IN_SESSION)).toBeNull();
    expect(rememberOffer(ready('Paolo'), null)).toBeNull();
  });

  it('offers nothing for a member that is already a known name, accents included (E23)', () => {
    expect(rememberOffer(ready('Paolo'), 'paolo')).toBeNull();
    expect(rememberOffer(ready('Paolo', 'Pao'), 'Pao')).toBeNull();
    expect(rememberOffer(ready('Paolo', 'Pao'), 'Páo')).toBeNull();
  });

  it('offers an other name with a profile name set, and the profile name without one', () => {
    expect(rememberOffer(ready('Paolo'), 'Pao')).toBe('nickname');
    expect(rememberOffer(ready(null), 'Pao')).toBe('name');
    expect(rememberOffer(ready(null, 'Red'), 'Pao')).toBe('name');
  });

  it('stops offering another name at the limit, but still offers the profile name', () => {
    const full = Array.from(
      { length: NICKNAMES_MAX },
      (_, i) => `Name${String.fromCharCode(97 + i)}`,
    );
    expect(rememberOffer(ready('Paolo', ...full), 'Pao')).toBeNull();
    expect(rememberOffer(ready(null, ...full), 'Pao')).toBe('name');
  });

  it('offers no other name for a stored list longer than the limit (AC-R2-3.5)', () => {
    const five = ['Namea', 'Nameb', 'Namec', 'Named', 'Namee'];
    expect(rememberOffer(ready('Paolo', ...five), 'Pao')).toBeNull();
  });

  it('offers nothing for a name that would not survive being stored (BR-N6, E15)', () => {
    expect(rememberOffer(ready('Paolo'), 'x'.repeat(61))).toBeNull();
    expect(rememberOffer(ready('Paolo'), 'Pao  L')).toBeNull();
  });
});

/** Every pair of a trip paid in full, as the "already settled" mark records them. */
const allPaid = (session: Session): Payment[] =>
  settlementPairs(session).map((p, i) => pay(`pay_all_${i}`, p.debtor, p.creditor, p.amountCents));

describe('the bucket rule when every pair is paid (BR-S3, Q4)', () => {
  it('settles an unknown "me" once every pair is paid, with no question (R2)', () => {
    const trip = tripA();
    const card = buildCard({ ...trip, payments: allPaid(trip) }, names(null));
    expect(card.bucket).toBe('settled');
    expect(card.allPairsPaid).toBe(true);
    expect(card.presettled).toBe(true);
    expect(card.me).toEqual({ kind: 'unknown', suggested: null });
  });

  it('settles a known "me" too, with their lines Paid', () => {
    const trip = tripA();
    const card = buildCard({ ...trip, payments: allPaid(trip) }, names('Renmar'));
    expect(card.bucket).toBe('settled');
    expect([...card.owedToYou, ...card.youOwe].every((l) => l.status === 'paid')).toBe(true);
  });

  it('keeps an unknown "me" in Needs setup while any pair is unpaid', () => {
    const trip = tripA({ payments: [pay('pay_1', 'Ana', 'Renmar', 30000)] });
    const card = buildCard(trip, names(null));
    expect(card.bucket).toBe('needsSetup');
    expect(card.allPairsPaid).toBe(false);
  });

  it('is not presettled when the session was finished with Collection', () => {
    const trip = tripA({ finishedWithCollection: true });
    const card = buildCard({ ...trip, payments: allPaid(trip) }, names('Renmar'));
    expect(card.bucket).toBe('settled');
    expect(card.presettled).toBe(false);
  });

  it('settles a session with no pairs even when "me" is unknown (Q4)', () => {
    const card = buildCard(tripD(), names(null));
    expect(card.bucket).toBe('settled');
    expect(card.pairCount).toBe(0);
    expect(card.presettled).toBe(false);
    expect(buildCard(tripD(), names('Renmar')).bucket).toBe('settled');
  });
});

describe('offersAlreadySettled (BR-S1)', () => {
  /** Twenty-one members, one purchase per pair i<j: 210 settlement pairs. */
  const big = () => {
    const members = Array.from({ length: 21 }, (_, i) => `M${String(i).padStart(2, '0')}`);
    const records: PurchaseRecord[] = [];
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        records.push(purchase(`r_${i}_${j}`, members[i], 100 + i, [members[j]]));
      }
    }
    return finished('session_big', members, records);
  };

  it('is offered for an unplaced session and for an unpaid placed one', () => {
    expect(buildCard(tripA(), names(null)).offersAlreadySettled).toBe(true);
    expect(buildCard(tripA(), names('Renmar')).offersAlreadySettled).toBe(true);
  });

  it('is not offered once finished with Collection', () => {
    expect(
      buildCard(tripA({ finishedWithCollection: true }), names(null)).offersAlreadySettled,
    ).toBe(false);
  });

  it('is not offered once any payment exists', () => {
    const trip = tripA({ payments: [pay('pay_1', 'Ana', 'Renmar', 100)] });
    expect(buildCard(trip, names('Renmar')).offersAlreadySettled).toBe(false);
  });

  it('is not offered with no pairs, or when already Settled', () => {
    expect(buildCard(tripD(), names(null)).offersAlreadySettled).toBe(false);
    // A member with no lines of their own is Settled only when every pair is paid.
    const trip = tripA();
    const paid = buildCard({ ...trip, payments: allPaid(trip) }, names('Renmar'));
    expect(paid.offersAlreadySettled).toBe(false);
  });

  it('is not offered for a session with more pairs than one request takes (S-A4)', () => {
    const card = buildCard(big(), names(null));
    expect(card.pairCount).toBe(210);
    expect(card.pairCount).toBeGreaterThan(PAYMENTS_PER_REQUEST_MAX);
    expect(card.offersAlreadySettled).toBe(false);
  });
});

describe('settlePayments (BR-S2)', () => {
  it('records every pair at its full amount, including pairs the user is not in', () => {
    const entries = settlePayments(tripA());
    expect(entries.map((e) => e.amountCents).sort((a, b) => a - b)).toEqual([10000, 30000, 30000]);
    expect(new Set(entries.map((e) => `${e.debtor}>${e.creditor}`)).size).toBe(3);
  });

  it('records only what is left on a part-paid pair, and nothing on a paid one', () => {
    const trip = tripA({
      payments: [pay('pay_1', 'Ana', 'Renmar', 10000), pay('pay_2', 'Cara', 'Renmar', 30000)],
    });
    const entries = settlePayments(trip);
    expect(entries.find((e) => e.debtor === 'Ana')?.amountCents).toBe(20000);
    expect(entries.some((e) => e.debtor === 'Cara')).toBe(false);
  });

  it('gives nothing for a session with no pairs', () => {
    expect(settlePayments(tripD())).toEqual([]);
  });
});

describe('buildCollection with already settled sessions', () => {
  it('lists the offered cards from Needs setup and Outstanding, newest finished first', () => {
    const older = tripA({ id: 'session_old', closedAt: '2026-11-01T00:00:00.000Z' });
    const newer = tripA({ id: 'session_new', closedAt: '2026-11-04T00:00:00.000Z' });
    const finishedNow = tripA({ id: 'session_now', finishedWithCollection: true });
    const settled = tripD({ id: 'session_even' });
    const c = buildCollection([older, finishedNow, newer, settled], names('Renmar'));
    expect(c.alreadySettledOffers.map((card) => card.session.id)).toEqual([
      'session_new',
      'session_old',
    ]);
  });

  it('sorts a presettled session by its finish date among the others by settled date (Q3)', () => {
    const marked = tripA({
      id: 'session_marked',
      closedAt: '2026-10-01T00:00:00.000Z',
      payments: [],
    });
    const markedPaid = {
      ...marked,
      payments: allPaid(marked).map((p) => ({ ...p, createdAt: '2026-11-06T00:00:00.000Z' })),
    };
    const collected = tripB({
      id: 'session_collected',
      finishedWithCollection: true,
      closedAt: '2026-10-20T00:00:00.000Z',
      payments: [
        pay('pay_a', 'Ana', 'Renmar', 3334, '2026-11-02T00:00:00.000Z'),
        pay('pay_b', 'Ben', 'Renmar', 3333, '2026-11-02T00:00:00.000Z'),
      ],
    });
    const c = buildCollection([markedPaid, collected], names('Renmar'));
    expect(c.settled.map((card) => card.session.id)).toEqual([
      'session_collected',
      'session_marked',
    ]);
  });

  it('leaves presettled sessions out of the totals (BR-S4)', () => {
    const trip = tripA();
    const c = buildCollection([{ ...trip, payments: allPaid(trip) }], names('Renmar'));
    expect([c.owedToYouCents, c.youOweCents]).toEqual([0, 0]);
    expect(c.alreadySettledOffers).toEqual([]);
  });
});

describe('parsePaymentAmount', () => {
  const greater = 'Enter an amount greater than ₱0.00.';

  it('rejects each AC-7.5 input with its message', () => {
    expect(parsePaymentAmount('', 20000)).toEqual({ ok: false, message: greater });
    expect(parsePaymentAmount('0', 20000)).toEqual({ ok: false, message: greater });
    expect(parsePaymentAmount('-5', 20000)).toEqual({ ok: false, message: greater });
    expect(parsePaymentAmount('10.005', 20000)).toEqual({
      ok: false,
      message: 'Use at most 2 decimal places.',
    });
    expect(parsePaymentAmount('abc', 20000)).toEqual({ ok: false, message: 'Enter a number.' });
    expect(parsePaymentAmount('200.01', 20000)).toEqual({
      ok: false,
      message: "That's more than what's left (₱200.00).",
    });
  });

  it('accepts exactly the remaining amount and the smallest one (AC-7.6)', () => {
    expect(parsePaymentAmount('200', 20000)).toEqual({ ok: true, cents: 20000 });
    expect(parsePaymentAmount('0.01', 20000)).toEqual({ ok: true, cents: 1 });
  });

  it('reads commas and the peso sign as parseAmount does (AC-7.8)', () => {
    expect(parsePaymentAmount('1,000', 100000)).toEqual({ ok: true, cents: 100000 });
    expect(parsePaymentAmount('₱100', 20000)).toEqual({ ok: true, cents: 10000 });
  });

  it('is exact to the centavo', () => {
    expect(parsePaymentAmount('33.34', 3334)).toEqual({ ok: true, cents: 3334 });
  });

  it('calls anything that is not a number not a number', () => {
    for (const raw of ['.', '1.2.3', '--1']) {
      expect(parsePaymentAmount(raw, 20000)).toEqual({ ok: false, message: 'Enter a number.' });
    }
  });

  it('treats minus zero as not above zero', () => {
    expect(parsePaymentAmount('-0', 20000)).toEqual({ ok: false, message: greater });
  });
});

describe('openLinePayments (US-8b)', () => {
  it('gives one entry per open line at what is left on it', () => {
    const card = buildCard(
      tripA({ payments: [pay('pay_1', 'Ana', 'Renmar', 10000)] }),
      names('Renmar'),
    );
    expect(openLinePayments(card)).toEqual([
      { debtor: 'Ana', creditor: 'Renmar', amountCents: 20000 },
      { debtor: 'Cara', creditor: 'Renmar', amountCents: 30000 },
      { debtor: 'Renmar', creditor: 'Ben', amountCents: 10000 },
    ]);
  });

  it('leaves out a paid line', () => {
    const card = buildCard(
      tripA({ payments: [pay('pay_1', 'Ana', 'Renmar', 30000)] }),
      names('Renmar'),
    );
    expect(openLinePayments(card).map((p) => p.debtor)).toEqual(['Cara', 'Renmar']);
  });
});

describe('markAllMessage', () => {
  const tail = 'as one payment per person. You can undo each one on its own.';

  it('names both sides when both are open', () => {
    const card = buildCard(tripA({ name: 'Bali' }), names('Renmar'));
    expect(markAllMessage(card)).toBe(
      `This records the ₱600.00 still owed to you and the ₱100.00 you still owe on “Bali”, ${tail}`,
    );
  });

  it('names only what is owed to you when nothing is owed by you', () => {
    const card = buildCard(tripB({ name: 'Lunch' }), names('Renmar'));
    expect(markAllMessage(card)).toBe(
      `This records the ₱66.67 still owed to you on “Lunch”, ${tail}`,
    );
  });

  it('names only what you owe when nothing is owed to you', () => {
    const card = buildCard(tripB({ name: 'Lunch' }), names('Ana'));
    expect(markAllMessage(card)).toBe(`This records the ₱33.34 you still owe on “Lunch”, ${tail}`);
  });
});

describe('mergeServerPayments', () => {
  const a = pay('pay_a', 'Ana', 'Renmar', 100);
  const b = pay('pay_b', 'Ana', 'Renmar', 200);
  const c = pay('pay_c', 'Cara', 'Renmar', 300);
  const none = () => false;

  it('keeps the server’s list', () => {
    expect(mergeServerPayments([], [a, b], none, none)).toEqual([a, b]);
  });

  it('drops a payment whose undo is still in flight', () => {
    expect(mergeServerPayments([], [a, b], none, (id) => id === 'pay_a')).toEqual([b]);
  });

  it('keeps a local add still in flight that the server lacks', () => {
    expect(mergeServerPayments([c], [a], (id) => id === 'pay_c', none)).toEqual([a, c]);
  });

  it('does not duplicate an in-flight add the server already has', () => {
    expect(mergeServerPayments([a], [a], (id) => id === 'pay_a', none)).toEqual([a]);
  });
});

describe('newPayments', () => {
  const at = '2026-11-04T07:00:00.000Z';
  const stored = pay('pay_a', 'Ana', 'Renmar', 100, '2026-11-03T00:00:00.000Z');

  it('stamps payments that are not on screen yet', () => {
    expect(
      newPayments([], [{ id: 'pay_b', debtor: 'Cara', creditor: 'Renmar', amountCents: 200 }], at),
    ).toEqual([pay('pay_b', 'Cara', 'Renmar', 200, at)]);
  });

  // A retry of a payment that did land, shown again by a reload, must not show twice.
  it('leaves out a payment whose id is already there', () => {
    const retry = { id: 'pay_a', debtor: 'Ana', creditor: 'Renmar', amountCents: 100 };
    expect(newPayments([stored], [retry], at)).toEqual([]);
  });

  it('keeps the new ones of a batch that is partly there already', () => {
    const batch = [
      { id: 'pay_a', debtor: 'Ana', creditor: 'Renmar', amountCents: 100 },
      { id: 'pay_c', debtor: 'Cara', creditor: 'Renmar', amountCents: 300 },
    ];
    expect(newPayments([stored], batch, at).map((p) => p.id)).toEqual(['pay_c']);
  });
});

describe('pairPaymentIds', () => {
  const a = pay('pay_a', 'Ana', 'Renmar', 100, '2026-11-04T00:00:00.000Z');
  const b = pay('pay_b', 'Ana', 'Renmar', 100, '2026-11-03T00:00:00.000Z');
  const other = pay('pay_c', 'Cara', 'Renmar', 100);

  it('names one pair’s payments, whatever their order', () => {
    expect(pairPaymentIds([a, other, b], 'Ana', 'Renmar')).toBe('pay_a pay_b');
    expect(pairPaymentIds([b, a], 'Ana', 'Renmar')).toBe('pay_a pay_b');
  });

  it('changes when the pair gets a payment, and not for another pair', () => {
    const before = pairPaymentIds([a], 'Ana', 'Renmar');
    expect(pairPaymentIds([a, b], 'Ana', 'Renmar')).not.toBe(before);
    expect(pairPaymentIds([a, other], 'Ana', 'Renmar')).toBe(before);
  });
});
