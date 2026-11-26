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
  JOIN_CONFIRM_REST,
  JOIN_SHARED_REST,
  joinConfirmLine,
  joinSharedLine,
  joinStage,
  movedManyLine,
  movedToHistoryLine,
  backInCollectionLine,
  nothingToDoLine,
  joinedRowLine,
  nameTakenLine,
  onHatiMembers,
  joinMatch,
  joinPromptView,
  organizerMember,
  ownMessage,
  participantView,
  stateText,
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
  // The organizer's own member (Ana) is not listed at all.
  members: ['Ben', 'Carla'],
  memberCount: 3,
  onHati: [],
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

describe("organizerMember (the organizer's effective member)", () => {
  const members = ['Ana', 'Ben', 'Carla'];
  const names = (displayName: string | null, ...nicknames: string[]) => ({
    displayName,
    nicknames,
  });

  it('is the stored pick when it is a member', () => {
    expect(organizerMember({ me: 'Ben', members }, [], names('Ana'))).toBe('Ben');
  });

  it('is nobody when the organizer said they are not in the session, even with a matching name', () => {
    expect(organizerMember({ me: '', members }, [], names('Ana'))).toBeNull();
  });

  it('is the profile-name match when there is no pick', () => {
    expect(organizerMember({ me: null, members }, [], names('ana'))).toBe('Ana');
  });

  it('is not a nickname-only match, which Collection only suggests', () => {
    expect(organizerMember({ me: null, members }, [], names('Zed', 'Ana'))).toBeNull();
  });

  it('is nobody with no pick and no match, or no profile name', () => {
    expect(organizerMember({ me: null, members }, [], names('Zed'))).toBeNull();
    expect(organizerMember({ me: null, members }, [], names(null))).toBeNull();
  });

  it('skips a member someone has joined as, as Collection does', () => {
    expect(organizerMember({ me: null, members }, ['Ana'], names('Ana'))).toBeNull();
  });
});

describe('onHatiMembers and claimableMembers', () => {
  it('labels only the members an account has joined as', () => {
    expect(onHatiMembers(['Ana', 'Ben', 'Carla'], ['Carla'])).toEqual(['Carla']);
    expect(onHatiMembers(['Ana'], [])).toEqual([]);
  });

  it('leaves the members nobody has taken', () => {
    expect(claimableMembers(preview({ onHati: ['Carla'] }))).toEqual(['Ben']);
  });

  it('has none to claim when only the organizer was a member (they are not listed)', () => {
    expect(claimableMembers(preview({ members: [], memberCount: 1 }))).toEqual([]);
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

  it("ignores a hit on a member already on Hati, or on the organizer's who is not listed", () => {
    expect(joinPreselect(preview({ onHati: ['Ben'] }), names('Ben'))).toEqual({
      value: null,
      suggested: null,
    });
    expect(joinPreselect(preview(), names('Ana'))).toEqual({ value: null, suggested: null });
  });

  it('gives nothing for two hits', () => {
    const two = preview({ members: ['Ben', 'ben', 'Carla'] });
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

  it('knows the paid answer, which carries nothing but the word', () => {
    expect(joinAnswerFrom(200, { outcome: 'paid' })).toEqual({ outcome: 'paid' });
    expect(stage({ outcome: 'paid' })).toBe('paid');
  });

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
    const full = preview({ onHati: ['Ben', 'Carla'] });
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
    // Just the date: the profile name is no longer shown on the row (round 5).
    expect(joinedRowLine({ member: 'Ben', name: 'Benny', joinedAt })).toBe(
      `Joined ${formatLocalDate(joinedAt)}`,
    );
    expect(joinedRowLine({ member: 'Ben', name: null, joinedAt })).toBe(
      `Joined ${formatLocalDate(joinedAt)}`,
    );
  });

  it('JOIN_SHARED_REST is the tail of the shared line after the name', () => {
    expect(JOIN_SHARED_REST).toBe(
      ' shared this session. Pick who you are, and your share of it shows up in your Collection.',
    );
    expect(joinSharedLine('Ana')).toBe(`Ana${JOIN_SHARED_REST}`);
  });

  it('joinConfirmLine asks the joiner to confirm rather than pick', () => {
    expect(JOIN_CONFIRM_REST).toBe(
      " shared this session. Confirm it's you, and your share of it shows up in your Collection.",
    );
    expect(joinConfirmLine('Ana')).toBe(
      "Ana shared this session. Confirm it's you, and your share of it shows up in your Collection.",
    );
    expect(joinConfirmLine(null)).toBe(
      "You've been invited to this session. Confirm it's you, and your share of it shows up in your Collection.",
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
    expect(alreadyMessage('Bali', 'Ben', 'collection')).toBe(alreadyMessage('Bali', 'Ben'));
    expect(alreadyMessage('Bali', 'Ben', 'history')).toBe(
      '“Bali” is in your History. You joined as Ben.',
    );
    expect(ownMessage('Bali')).toBe(
      "You're the organizer of “Bali”, so it's already in your Collection. Share this link with the others so they can track their own payments.",
    );
    expect(ownMessage('Bali', 'history')).toBe(
      "You're the organizer of “Bali”, so it's already in your History.",
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
    expect(stateText([participantView(withOther, 'Ben', 'Ana', [])])).toBe(
      stateText([participantView(without, 'Ben', 'Ana', [])]),
    );
    // The organizer, who sees it, does change.
    expect(stateText([withOther])).not.toBe(stateText([without]));
  });
});

describe('the join prompt view (round 4)', () => {
  const names = (displayName: string | null, ...nicknames: string[]) => ({
    displayName,
    nicknames,
  });

  it('matches the one claimable member a profile name or a nickname hits', () => {
    expect(joinMatch(preview(), names('ben'))).toBe('Ben');
    expect(joinMatch(preview(), names(null, 'Carla'))).toBe('Carla');
  });

  it('matches nobody for no hit, an ambiguous hit, the organizer, or a member already on Hati', () => {
    expect(joinMatch(preview(), names('Zed'))).toBeNull();
    expect(joinMatch(preview({ members: ['Ben', 'ben', 'Carla'] }), names('Ben'))).toBeNull();
    expect(joinMatch(preview(), names('Ana'))).toBeNull();
    expect(joinMatch(preview({ onHati: ['Ben'] }), names('Ben'))).toBeNull();
  });

  it('shows the confirm for a match, the list otherwise, and the list after "Not you?"', () => {
    expect(joinPromptView('Ben', false)).toBe('confirm');
    expect(joinPromptView('Ben', true)).toBe('list');
    expect(joinPromptView(null, false)).toBe('list');
  });
});

describe('History and Collection copy (PR 4)', () => {
  it('words the move and the way back, exactly', () => {
    expect(movedToHistoryLine('Bali Trip')).toBe(
      '“Bali Trip” is paid in full and has moved to History.',
    );
    expect(movedManyLine(3)).toBe('3 sessions are settled and have moved to History.');
    expect(backInCollectionLine('Bali Trip', 'undo')).toBe(
      '“Bali Trip” is back in Collection, because a payment was undone.',
    );
    expect(backInCollectionLine('Bali Trip', 'change')).toBe(
      '“Bali Trip” is back in Collection, because you changed who you are in it.',
    );
    expect(nothingToDoLine('Bali Trip')).toBe(
      "There's nothing for you to collect or pay in “Bali Trip”, so it's in History.",
    );
  });
});
