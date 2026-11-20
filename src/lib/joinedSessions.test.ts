import { describe, expect, it } from 'vitest';
import {
  alreadyMessage,
  confirmOthersMessage,
  declineMessage,
  deciderName,
  joinedMarkAllMessage,
  notConfirmedLine,
  notOnHatiLine,
  saysTheyPaidLine,
  saysTheyPaidOtherLine,
  talkToLine,
  toConfirmCountLine,
  toConfirmLine,
  visibleLedger,
  waitingForLine,
  waitingLine,
  waitingSummaryLine,
  withdrawMessage,
  youSaidLine,
  type ClaimRow,
  claimableMembers,
  closedSessionMe,
  everyoneJoinedMessage,
  inviteIntro,
  isInviteToken,
  joinAnswerFrom,
  joinFlowReady,
  joinPreselect,
  joinReadOnlyLine,
  joinSharedLine,
  joinStage,
  joinedRowLine,
  nameTakenLine,
  onHatiMembers,
  unavailableMembers,
  ownMessage,
  participantView,
  removeMessage,
  sharedByLine,
  stopTrackingMessage,
  takenMessage,
} from './joinedSessions';
import { formatLocalDate, formatLocalDateTime } from './format';
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
    const view = participantView(session({ payments }), 'Ben', 'Ana', []);
    expect(view.payments.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  it("sets me to the member, never the organizer's pick, and empties participants", () => {
    const base = session({
      payments,
      me: 'Ana',
      participants: [{ member: 'Carla', name: null, joinedAt: 'x' }],
    });
    const view = participantView(base, 'Ben', 'Organizer Name', []);
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

  it('joinedRowLine', () => {
    const joinedAt = '2026-11-05T12:00:00.000Z';
    expect(joinedRowLine({ member: 'Ben', name: 'Benny', joinedAt })).toBe(
      `Benny · joined ${formatLocalDate(joinedAt)}`,
    );
    expect(joinedRowLine({ member: 'Ben', name: null, joinedAt })).toBe(
      `No name set · joined ${formatLocalDate(joinedAt)}`,
    );
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
    expect(stopTrackingMessage('Ana', true)).toBe(
      "It leaves your Collection and History. Ana keeps the session, and payments already recorded stay. You can join again with the invite link if it still works. Any payment you've said you made that's still waiting for confirmation is withdrawn.",
    );
    expect(stopTrackingMessage('Ana', false)).toBe(stopTrackingMessage('Ana'));
  });
});

const row = (over: Partial<ClaimRow> = {}): ClaimRow => ({
  id: 'pay_1',
  debtor: 'Ben',
  creditor: 'Ana',
  amountCents: 20000,
  createdAt: '2026-11-03T00:00:00.000Z',
  status: 'pending',
  decidedAt: null,
  claimedBy: 'user_b',
  ...over,
});

describe('visibleLedger (D1, BR-C8)', () => {
  const pay = (id: string, debtor: string, creditor: string) => ({
    id,
    debtor,
    creditor,
    amountCents: 100,
    createdAt: 'x',
  });
  const payments = [pay('p1', 'Ben', 'Ana'), pay('p2', 'Carla', 'Ana'), pay('p3', 'Carla', 'Ben')];
  const claims = [
    row({ id: 'c_pending_ben', claimedBy: 'user_b' }),
    row({ id: 'c_declined_ben', status: 'declined', decidedAt: 'd', claimedBy: 'user_b' }),
    row({ id: 'c_carla_ana', debtor: 'Carla', creditor: 'Ana', claimedBy: 'user_c' }),
    row({
      id: 'c_carla_declined',
      debtor: 'Carla',
      creditor: 'Ana',
      status: 'declined',
      decidedAt: 'd',
      claimedBy: 'user_c',
    }),
    row({ id: 'c_carla_ben', debtor: 'Carla', creditor: 'Ben', claimedBy: 'user_c' }),
    row({ id: 'c_ana_ben', debtor: 'Ana', creditor: 'Ben', claimedBy: 'user_a' }),
  ];
  const ids = (list: { id: string }[]) => list.map((x) => x.id);

  it('gives the owner every payment and only the pending claims', () => {
    const view = visibleLedger({ role: 'owner' }, payments, claims, 'user_a');
    expect(ids(view.payments)).toEqual(['p1', 'p2', 'p3']);
    expect(ids(view.claims)).toEqual(['c_pending_ben', 'c_carla_ana', 'c_carla_ben', 'c_ana_ben']);
  });

  it('gives a debtor their own pending and declined claims, and claims waiting on them', () => {
    const view = visibleLedger({ role: 'participant', member: 'Ben' }, payments, claims, 'user_b');
    expect(ids(view.claims)).toEqual([
      'c_pending_ben',
      'c_declined_ben',
      'c_carla_ben',
      'c_ana_ben',
    ]);
    expect(ids(view.payments)).toEqual(['p1', 'p3']);
  });

  it('gives a creditor the pending claims on their lines and never declined ones', () => {
    const view = visibleLedger({ role: 'participant', member: 'Ana' }, payments, claims, 'user_x');
    expect(ids(view.claims)).toEqual(['c_pending_ben', 'c_carla_ana']);
  });

  it('never gives anyone claims or payments between two other members', () => {
    const view = visibleLedger({ role: 'participant', member: 'Dan' }, payments, claims, 'user_d');
    expect(view.claims).toEqual([]);
    expect(view.payments).toEqual([]);
  });

  it('strips claimedBy and sets mine from the user id', () => {
    const view = visibleLedger({ role: 'participant', member: 'Ben' }, payments, claims, 'user_b');
    expect(view.claims.every((c) => !('claimedBy' in c))).toBe(true);
    expect(view.claims.find((c) => c.id === 'c_pending_ben')?.mine).toBe(true);
    expect(view.claims.find((c) => c.id === 'c_carla_ben')?.mine).toBe(false);
  });
});

describe('participantView with claims', () => {
  it('sets withAccount and leaves the ledger it is given as it is', () => {
    const claim = { ...row(), mine: true };
    const view = participantView(session({ claims: [claim] }), 'Ben', 'Ana', ['Ana', 'Ben']);
    expect(view.withAccount).toEqual(['Ana', 'Ben']);
    expect(view.claims).toEqual([claim]);
  });
});

describe('deciderName (BR-C19)', () => {
  it('is the creditor when they have an account', () => {
    expect(deciderName('Ana', ['Ana', 'Ben'], 'Ana Test')).toBe('Ana');
  });

  it('is the organizer otherwise, by name or as "the organizer"', () => {
    expect(deciderName('Carla', ['Ana'], 'Ana Test')).toBe('Ana Test');
    expect(deciderName('Carla', ['Ana'], null)).toBe('the organizer');
  });
});

describe('claim copy builders', () => {
  const at = '2026-11-03T08:30:00.000Z';

  it('words the waiting and to-confirm lines', () => {
    expect(waitingLine(20000, 'Ana')).toBe('₱200.00 waiting for Ana to confirm');
    expect(toConfirmLine(20000)).toBe('₱200.00 waiting for you to confirm');
    expect(youSaidLine(20000)).toBe('You said you paid ₱200.00');
    expect(waitingForLine('the organizer')).toBe('Waiting for the organizer to confirm');
    expect(saysTheyPaidLine('Ben', 20000)).toBe('Ben says they paid ₱200.00');
    expect(saysTheyPaidOtherLine('Ben', 'Carla', 15000)).toBe('Ben says they paid Carla ₱150.00');
    expect(talkToLine('Ana')).toBe('If you did pay, talk to Ana, then send it again.');
    expect(notOnHatiLine('Carla')).toBe("Carla isn't on Hati, so you confirm it.");
    expect(toConfirmCountLine(1)).toBe('1 payment to confirm');
    expect(toConfirmCountLine(3)).toBe('3 payments to confirm');
    expect(waitingSummaryLine(50000)).toBe('₱500.00 waiting for confirmation');
  });

  it('words the dated lines through the local date format', () => {
    const when = formatLocalDateTime(at);
    expect(notConfirmedLine(20000, at)).toBe(
      `Not confirmed: the ₱200.00 you said you paid on ${when}`,
    );
    expect(withdrawMessage('Ana', 20000, at)).toBe(
      `This takes back the ₱200.00 you said you paid Ana on ${when}. Nothing was recorded yet.`,
    );
    expect(declineMessage('Ben', 'Ana', 20000, at, true)).toBe(
      `Ben said they paid you ₱200.00 on ${when}. Declining records nothing, and Ben will see that it wasn't confirmed.`,
    );
    expect(declineMessage('Ben', 'Carla', 15000, at, false)).toBe(
      `Ben said they paid Carla ₱150.00 on ${when}. Declining records nothing, and Ben will see that it wasn't confirmed.`,
    );
  });

  it('words the confirm-for-others message', () => {
    expect(confirmOthersMessage('Ben', 'Carla', 15000, 'Bali')).toBe(
      'This records ₱150.00 paid by Ben to Carla on “Bali”.',
    );
  });

  it('words Mark all on a joined card for each mix', () => {
    expect(joinedMarkAllMessage('Bali', 0, 30000)).toBe(
      "This tells the people you owe on “Bali” that you've paid them ₱300.00, one payment per person. Each counts once it's confirmed, and you can withdraw any of them until then.",
    );
    expect(joinedMarkAllMessage('Bali', 10000, 30000)).toBe(
      "This records the ₱100.00 still owed to you as received, and tells the people you owe that you've paid them ₱300.00. What you've paid counts once it's confirmed.",
    );
    expect(joinedMarkAllMessage('Bali', 10000, 0)).toBe(
      'This records the ₱100.00 still owed to you on “Bali”, as one payment per person. You can undo each one on its own.',
    );
  });

  it('adds the pending sentence to the Remove message only when asked', () => {
    const p = { member: 'Ben', name: 'Benny', joinedAt: '2026-11-05T12:00:00.000Z' };
    expect(removeMessage(p, 'Bali', true)).toBe(
      `${removeMessage(p, 'Bali')} Any payment they've said they made that's still waiting is withdrawn.`,
    );
    expect(removeMessage(p, 'Bali', false)).toBe(removeMessage(p, 'Bali'));
  });
});
