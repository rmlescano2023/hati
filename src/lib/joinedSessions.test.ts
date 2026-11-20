import { describe, expect, it } from 'vitest';
import {
  alreadyMessage,
  claimableMembers,
  closedSessionMe,
  everyoneJoinedMessage,
  inviteIntro,
  isInviteToken,
  joinAnswerFrom,
  joinFlowReady,
  joinPreselect,
  joinReadOnlyLine,
  JOIN_SHARED_REST,
  joinSharedLine,
  joinStage,
  joinedRowLine,
  nameTakenLine,
  onHatiMembers,
  unavailableMembers,
  ownMessage,
  participantView,
  stateText,
  recordsPaymentsLine,
  removeMessage,
  sharedByLine,
  stopTrackingMessage,
  takenMessage,
} from './joinedSessions';
import { formatLocalDate } from './format';
import type { InvitePreview, JoinAnswer, Session } from '../types';

const TOKEN = 'abcdefghijklmnopqrstuv';

const session = (over: Partial<Session> = {}): Session => ({
  id: 'session_1',
  status: 'closed',
  createdAt: '2026-11-01T00:00:00.000Z',
  closedAt: '2026-11-02T00:00:00.000Z',
  members: ['Ana', 'Ben', 'Carla'],
  records: [],
  name: null,
  activityAt: null,
  me: 'Ana',
  finishedWithCollection: true,
  payments: [],
  ...over,
});

const preview = (over: Partial<InvitePreview> = {}): InvitePreview => ({
  sessionId: 'session_1',
  title: 'Bali Trip',
  closedAt: '2026-11-02T00:00:00.000Z',
  members: ['Ana', 'Ben', 'Carla'],
  onHati: [],
  unavailable: ['Ana'],
  organizerName: 'Ana',
  ...over,
});

describe('isInviteToken', () => {
  it('accepts exactly 22 base64url characters', () => {
    expect(isInviteToken(TOKEN)).toBe(true);
    expect(isInviteToken('A-_9zZ0aAbB1cC2dD3eE4f')).toBe(true);
  });

  it('refuses a wrong length, other characters and a non-string', () => {
    expect(isInviteToken(TOKEN.slice(1))).toBe(false);
    expect(isInviteToken(`${TOKEN}x`)).toBe(false);
    expect(isInviteToken(`${TOKEN.slice(1)}+`)).toBe(false);
    expect(isInviteToken(`${TOKEN.slice(1)}/`)).toBe(false);
    expect(isInviteToken(`${TOKEN.slice(1)}=`)).toBe(false);
    expect(isInviteToken(42)).toBe(false);
    expect(isInviteToken(null)).toBe(false);
  });
});

describe('participantView (the D1 filter)', () => {
  const payments = [
    { id: 'p1', debtor: 'Ben', creditor: 'Ana', amountCents: 100, createdAt: 'x' },
    { id: 'p2', debtor: 'Carla', creditor: 'Ana', amountCents: 200, createdAt: 'x' },
    { id: 'p3', debtor: 'Carla', creditor: 'Ben', amountCents: 300, createdAt: 'x' },
  ];

  it("keeps only the payments on the member's own lines", () => {
    const view = participantView(session({ payments }), 'Ben', 'Ana');
    expect(view.payments.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it("sets me to the member, never the organizer's pick, and empties participants", () => {
    const base = session({
      payments,
      me: 'Ana',
      participants: [{ member: 'Carla', name: null, joinedAt: 'x' }],
    });
    const view = participantView(base, 'Ben', 'Organizer Name');
    expect(view.me).toBe('Ben');
    expect(view.role).toBe('participant');
    expect(view.participants).toEqual([]);
    expect(view.organizerName).toBe('Organizer Name');
    expect(view.members).toEqual(base.members);
    expect(view.records).toBe(base.records);
  });
});

describe('closedSessionMe', () => {
  const members = ['Ana', 'Ben', 'Carla'];

  it('keeps the stored value when the body carries none', () => {
    expect(closedSessionMe('Ana', null, members, [])).toBe('Ana');
    expect(closedSessionMe(null, null, members, [])).toBeNull();
  });

  it('takes "not in this session"', () => {
    expect(closedSessionMe('Ana', '', members, [])).toBe('');
  });

  it('takes an unclaimed member', () => {
    expect(closedSessionMe('Ana', 'Ben', members, ['Carla'])).toBe('Ben');
  });

  it('keeps the stored value for a claimed member', () => {
    expect(closedSessionMe('Ana', 'Ben', members, ['Ben'])).toBe('Ana');
  });

  it('keeps the stored value for a name that is not a member', () => {
    expect(closedSessionMe('Ana', 'Zed', members, [])).toBe('Ana');
  });
});

describe('onHatiMembers, unavailableMembers and claimableMembers', () => {
  it("labels only the members an account has joined as, not the organizer's own", () => {
    expect(onHatiMembers(['Ana', 'Ben', 'Carla'], ['Carla'])).toEqual(['Carla']);
    expect(onHatiMembers(['Ana'], [])).toEqual([]);
  });

  it("makes the organizer's member unavailable as well as the claimed ones", () => {
    expect(unavailableMembers(['Ana', 'Ben', 'Carla'], 'Ana', ['Carla'])).toEqual(['Ana', 'Carla']);
  });

  it('adds nobody for a me of "" or null', () => {
    expect(unavailableMembers(['Ana'], '', [])).toEqual([]);
    expect(unavailableMembers(['Ana'], null, [])).toEqual([]);
  });

  it('leaves the members nobody has taken', () => {
    expect(claimableMembers(preview({ unavailable: ['Ana', 'Carla'] }))).toEqual(['Ben']);
  });

  it('has none to claim when the only member is the organizer', () => {
    const one = preview({
      members: ['Ana'],
      onHati: [],
      unavailable: unavailableMembers(['Ana'], 'Ana', []),
    });
    expect(claimableMembers(one)).toEqual([]);
  });
});

describe('joinPreselect', () => {
  const names = (displayName: string | null, ...nicknames: string[]) => ({
    displayName,
    nicknames,
  });

  it('preselects a profile-name hit on a claimable member', () => {
    expect(joinPreselect(preview(), names('ben'))).toEqual({ value: 'Ben', suggested: null });
  });

  it('only suggests a nickname hit', () => {
    expect(joinPreselect(preview(), names(null, 'Ben'))).toEqual({ value: null, suggested: 'Ben' });
  });

  it('gives nothing for no hit', () => {
    expect(joinPreselect(preview(), names('Zed'))).toEqual({ value: null, suggested: null });
  });

  it('ignores a hit on a member already on Hati', () => {
    expect(joinPreselect(preview(), names('Ana'))).toEqual({ value: null, suggested: null });
  });

  it('gives nothing for two hits', () => {
    const two = preview({ members: ['Ben', 'ben', 'Carla'], unavailable: [] });
    expect(joinPreselect(two, names('Ben'))).toEqual({ value: null, suggested: null });
  });
});

describe('joinAnswerFrom', () => {
  const open = { outcome: 'open', preview: preview() };

  it('passes a 200 or 201 body with a known outcome through', () => {
    expect(joinAnswerFrom(200, open)).toEqual(open);
    const joined = { outcome: 'joined', session: session() };
    expect(joinAnswerFrom(201, joined)).toEqual(joined);
    expect(joinAnswerFrom(200, { outcome: 'own', sessionId: 's', title: 't' }).outcome).toBe('own');
    expect(
      joinAnswerFrom(200, { outcome: 'already', sessionId: 's', title: 't', member: 'Ben' })
        .outcome,
    ).toBe('already');
  });

  it('treats a 200 with an unknown outcome or no body as failed', () => {
    expect(joinAnswerFrom(200, { outcome: 'nope' })).toEqual({ outcome: 'failed' });
    expect(joinAnswerFrom(200, null)).toEqual({ outcome: 'failed' });
  });

  it('reads a 409 taken with its preview', () => {
    expect(joinAnswerFrom(409, { code: 'taken', preview: preview() })).toEqual({
      outcome: 'taken',
      preview: preview(),
    });
    expect(joinAnswerFrom(409, { error: 'x' })).toEqual({ outcome: 'failed' });
  });

  it('reads a 400 or 404 as a dead link', () => {
    expect(joinAnswerFrom(404, { code: 'dead_link' })).toEqual({ outcome: 'dead' });
    expect(joinAnswerFrom(400, {})).toEqual({ outcome: 'dead' });
  });

  it('reads anything else, no answer included, as failed', () => {
    expect(joinAnswerFrom(500, {})).toEqual({ outcome: 'failed' });
    expect(joinAnswerFrom(401, {})).toEqual({ outcome: 'failed' });
    expect(joinAnswerFrom(null, null)).toEqual({ outcome: 'failed' });
  });
});

describe('joinStage', () => {
  const stage = (a: JoinAnswer) => joinStage(a);

  it('maps each outcome to its dialog', () => {
    expect(stage({ outcome: 'own', sessionId: 's', title: 't' })).toBe('own');
    expect(stage({ outcome: 'already', sessionId: 's', title: 't', member: 'Ben' })).toBe(
      'already',
    );
    expect(stage({ outcome: 'dead' })).toBe('dead');
    expect(stage({ outcome: 'failed' })).toBe('failed');
    expect(stage({ outcome: 'joined', session: session() })).toBe('joined');
  });

  it('picks when someone is left to be, and says everyone joined when nobody is', () => {
    expect(stage({ outcome: 'open', preview: preview() })).toBe('pick');
    expect(stage({ outcome: 'taken', preview: preview() })).toBe('pick');
    const full = preview({ onHati: ['Ben', 'Carla'], unavailable: ['Ana', 'Ben', 'Carla'] });
    expect(stage({ outcome: 'open', preview: full })).toBe('full');
    expect(stage({ outcome: 'taken', preview: full })).toBe('full');
  });
});

describe('joinFlowReady', () => {
  const ready = {
    pending: true,
    loaded: true,
    profileStatus: 'ready',
    phase: 'off',
    practice: false,
  };

  it('is true once everything has loaded and nothing else is showing', () => {
    expect(joinFlowReady(ready)).toBe(true);
    expect(joinFlowReady({ ...ready, profileStatus: 'error' })).toBe(true);
  });

  it('waits for the sessions, the profile, the phase and the practice', () => {
    expect(joinFlowReady({ ...ready, pending: false })).toBe(false);
    expect(joinFlowReady({ ...ready, loaded: false })).toBe(false);
    expect(joinFlowReady({ ...ready, profileStatus: 'loading' })).toBe(false);
    expect(joinFlowReady({ ...ready, phase: 'intro' })).toBe(false);
    expect(joinFlowReady({ ...ready, practice: true })).toBe(false);
  });
});

describe('copy builders', () => {
  it('sharedByLine', () => {
    expect(sharedByLine('Ana')).toBe('Shared by Ana');
    expect(sharedByLine(null)).toBe('Shared with you');
  });

  it('recordsPaymentsLine', () => {
    expect(recordsPaymentsLine('Ana')).toBe('Ana records the payments on this session.');
    expect(recordsPaymentsLine(null)).toBe('The organizer records the payments on this session.');
  });

  it('joinedRowLine', () => {
    const joinedAt = '2026-11-05T12:00:00.000Z';
    expect(joinedRowLine({ member: 'Ben', name: 'Benny', joinedAt })).toBe(
      `Benny · joined ${formatLocalDate(joinedAt)}`,
    );
    expect(joinedRowLine({ member: 'Ben', name: null, joinedAt })).toBe(
      `No name set · joined ${formatLocalDate(joinedAt)}`,
    );
  });

  it('JOIN_SHARED_REST is the tail of the shared line after the name', () => {
    expect(JOIN_SHARED_REST).toBe(
      ' shared this session. Pick who you are, and your share of it shows up in your Collection.',
    );
    expect(joinSharedLine('Ana')).toBe(`Ana${JOIN_SHARED_REST}`);
  });

  it('joinSharedLine', () => {
    expect(joinSharedLine('Ana')).toBe(
      'Ana shared this session. Pick who you are, and your share of it shows up in your Collection.',
    );
    expect(joinSharedLine(null)).toBe(
      "You've been invited to this session. Pick who you are, and your share of it shows up in your Collection.",
    );
  });

  it('joinReadOnlyLine', () => {
    expect(joinReadOnlyLine('Ana')).toBe(
      'You can see the whole session, but only Ana can change it. Ana will see your Hati name and when you joined.',
    );
    expect(joinReadOnlyLine(null)).toBe(
      'You can see the whole session, but only the organizer can change it. The organizer will see your Hati name and when you joined.',
    );
  });

  it('nameTakenLine', () => {
    expect(nameTakenLine('Ana')).toBe(
      'Is your name taken? Ask Ana to remove it, then open the link again.',
    );
    expect(nameTakenLine(null)).toBe(
      'Is your name taken? Ask the organizer to remove it, then open the link again.',
    );
  });

  it('takenMessage, alreadyMessage and ownMessage', () => {
    expect(takenMessage('Ben')).toBe('Someone else just joined as Ben. Pick who you are again.');
    expect(alreadyMessage('Bali', 'Ben')).toBe('“Bali” is in your Collection. You joined as Ben.');
    expect(ownMessage('Bali')).toBe(
      "You're the organizer of “Bali”, so it's already in your Collection. Share this link with the others so they can track their own payments.",
    );
  });

  it('everyoneJoinedMessage', () => {
    expect(everyoneJoinedMessage('Bali', 'Ana')).toBe(
      'Every member of “Bali” is already on Hati. If one of them is you, ask Ana to remove that member, then open the link again.',
    );
    expect(everyoneJoinedMessage('Bali', null)).toContain('ask the organizer to remove');
  });

  it('inviteIntro', () => {
    expect(inviteIntro('Bali')).toBe(
      "Anyone with this link can sign in to Hati, pick who they are in “Bali”, and track their own payments. They can see the whole session but can't change it.",
    );
  });

  it('removeMessage', () => {
    const joinedAt = '2026-11-05T12:00:00.000Z';
    expect(removeMessage({ member: 'Ben', name: 'Benny', joinedAt }, 'Bali')).toBe(
      'Benny joined “Bali” as Ben. Removing them takes the session out of their Collection and History. Payments already recorded stay. They can join again with the invite link unless you reset it.',
    );
    expect(removeMessage({ member: 'Ben', name: null, joinedAt }, 'Bali')).toMatch(
      /^This account joined “Bali” as Ben\./,
    );
  });

  it('stopTrackingMessage', () => {
    expect(stopTrackingMessage('Ana')).toBe(
      'It leaves your Collection and History. Ana keeps the session, and payments already recorded stay. You can join again with the invite link if it still works.',
    );
    expect(stopTrackingMessage(null)).toContain('The organizer keeps the session');
  });
});

describe('stateText (the "anything changed?" check)', () => {
  const pay = (id: string, debtor: string, creditor: string) => ({
    id,
    debtor,
    creditor,
    amountCents: 100,
    createdAt: 'x',
  });
  const rec = (price: number) => ({
    id: 'rec_1',
    date: '2026-11-01',
    payorMode: 'single' as const,
    payors: [{ member: 'Ana', amount: 0 }],
    items: [
      { id: 'i1', mode: 'equal' as const, name: 'Dinner', totalPrice: price, owners: ['Ana'] },
    ],
    createdAt: 'x',
  });
  const base = session({ records: [rec(300)], payments: [pay('p1', 'Ben', 'Ana')] });

  it('is the same for the same sessions, and ignores the activity time', () => {
    expect(stateText([base])).toBe(stateText([{ ...base }]));
    expect(stateText([{ ...base, activityAt: '2026-12-01T00:00:00.000Z' }])).toBe(
      stateText([base]),
    );
  });

  it.each([
    ['a payment added', { ...base, payments: [...base.payments, pay('p2', 'Carla', 'Ana')] }],
    ['a payment removed', { ...base, payments: [] }],
    ['an item edited', { ...base, records: [rec(301)] }],
    ['a rename', { ...base, name: 'Bali Trip' }],
    ['someone joining', { ...base, participants: [{ member: 'Ben', name: null, joinedAt: 'x' }] }],
  ])('changes with %s', (_what, changed) => {
    expect(stateText([changed])).not.toBe(stateText([base]));
  });

  it('changes when a session is removed', () => {
    const other = session({ id: 'session_2' });
    expect(stateText([base])).not.toBe(stateText([base, other]));
  });

  it("does not let a payment between two other members move a participant's state (D1)", () => {
    const withOther = session({
      payments: [pay('p1', 'Ben', 'Ana'), pay('p2', 'Carla', 'Ana')],
    });
    const without = session({ payments: [pay('p1', 'Ben', 'Ana')] });
    expect(stateText([participantView(withOther, 'Ben', 'Ana')])).toBe(
      stateText([participantView(without, 'Ben', 'Ana')]),
    );
    // The organizer, who sees it, does change.
    expect(stateText([withOther])).not.toBe(stateText([without]));
  });
});
