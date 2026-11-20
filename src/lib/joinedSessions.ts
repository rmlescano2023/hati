import { NOT_IN_SESSION, matchMember, resolveMe, type KnownNames } from './collection.js';
import { formatLocalDate } from './format.js';
import type { InvitePreview, JoinAnswer, Participant, Session } from '../types';

/**
 * The rules of joined sessions that the server and the app must agree on. It is DOM-free and
 * imported by `api/`, so the server's view of a session and the app's reading of it can't drift.
 * It imports only `collection.ts` and `format.ts`: `collection.ts` imports `sessionLabel.ts`, so
 * neither of those may import this file.
 */

/** 128 random bits as base64url: 22 characters, no padding. */
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** Whether a value has the shape of an invite token. A shape check only: it says nothing about whether the link works. */
export const isInviteToken = (raw: unknown): raw is string =>
  typeof raw === 'string' && INVITE_TOKEN_PATTERN.test(raw);

/**
 * What a participant is allowed to see of a session (D1): everything about it, but only the
 * payments on their own lines, and never the organizer's pick or who else joined. It is the one
 * place that rule lives, so every joined session the server sends has passed through it.
 */
export function participantView(
  session: Session,
  member: string,
  organizerName: string | null,
): Session {
  return {
    ...session,
    me: member,
    role: 'participant',
    organizerName,
    participants: [],
    payments: session.payments.filter((p) => p.debtor === member || p.creditor === member),
  };
}

/**
 * What the "anything changed?" check compares: each session as the viewer is sent it, with the
 * activity time left out. It is taken over exactly the array a full load would send, so it covers
 * every insert, deletion and edit the viewer could see, and nothing they can't: a participant's
 * sessions have already been through `participantView`. The activity time is left out so that
 * opening a session on another device doesn't cause a reload.
 */
export const stateText = (sessions: Session[]): string =>
  JSON.stringify(sessions.map((s) => ({ ...s, activityAt: null })));

/**
 * The `me` a save of a finished session stores. Only the pick can change on a finished session,
 * and never to a member someone has already joined as, so the organizer and a participant are
 * never the same person (BR-R1). Anything that isn't a valid change keeps what is stored.
 */
export function closedSessionMe(
  stored: string | null,
  incoming: string | null,
  members: string[],
  claimed: string[],
): string | null {
  if (incoming === null) return stored;
  if (incoming === NOT_IN_SESSION) return NOT_IN_SESSION;
  return members.includes(incoming) && !claimed.includes(incoming) ? incoming : stored;
}

/** The members already on Hati: the ones an account has joined as. Only these are labelled so. */
export const onHatiMembers = (members: string[], claimed: string[]): string[] =>
  members.filter((m) => claimed.includes(m));

/**
 * The member the organizer is, worked out exactly as Collection places them: the stored pick when
 * it is a member, nobody when they said they aren't in the session, otherwise their profile name's
 * match. A nickname-only match is only a suggestion there, so it doesn't count here. Members
 * someone has joined as are skipped, as Collection skips them (AC-14.2). The join uses this, so a
 * joiner is never offered the member who is already the organizer, whether or not they ever picked
 * (BR-J4).
 */
export function organizerMember(
  session: { me: string | null; members: string[] },
  claimed: string[],
  names: KnownNames,
): string | null {
  const me = resolveMe(
    {
      me: session.me,
      members: session.members,
      participants: claimed.map((member) => ({ member, name: null, joinedAt: '' })),
    },
    names,
  );
  return me.kind === 'member' ? me.name : null;
}

/** The members a joiner can still be: listed, and not already joined as. */
export const claimableMembers = (preview: Pick<InvitePreview, 'members' | 'onHati'>): string[] =>
  preview.members.filter((m) => !preview.onHati.includes(m));

/**
 * Who the join dialog starts on: a profile-name hit among the claimable members is preselected, a
 * nickname hit is only suggested, and anything else leaves the choice to the user. It is the
 * same matching Collection uses, so a member already on Hati can never be picked by it.
 */
export function joinPreselect(
  preview: Pick<InvitePreview, 'members' | 'onHati'>,
  names: KnownNames,
): { value: string | null; suggested: string | null } {
  const match = matchMember(claimableMembers(preview), names);
  if (match === null) return { value: null, suggested: null };
  return match.via === 'profile'
    ? { value: match.member, suggested: null }
    : { value: null, suggested: match.member };
}

const OUTCOMES = new Set(['own', 'already', 'open', 'joined']);

/**
 * What a preview or join request's answer means to the app. Only a status and a body the server
 * is known to send count as an answer; anything else, including no answer at all, is a failure to
 * check, which is not the same as a dead link.
 */
export function joinAnswerFrom(status: number | null, body: unknown): JoinAnswer {
  const record =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  if ((status === 200 || status === 201) && record && OUTCOMES.has(String(record.outcome))) {
    return record as unknown as JoinAnswer;
  }
  if (
    status === 409 &&
    record?.code === 'taken' &&
    typeof record.preview === 'object' &&
    record.preview
  ) {
    return { outcome: 'taken', preview: record.preview as InvitePreview };
  }
  if (status === 400 || status === 404) return { outcome: 'dead' };
  return { outcome: 'failed' };
}

/**
 * The one claimable member the joiner's names point at, or null. A profile-name hit counts, and
 * failing that a nickname hit, each only when it is exactly one member (`matchMember`'s rule), so
 * an ambiguous name, the organizer's member and a member already joined never match.
 */
export const joinMatch = (
  preview: Pick<InvitePreview, 'members' | 'onHati'>,
  names: KnownNames,
): string | null => {
  const pre = joinPreselect(preview, names);
  return pre.value ?? pre.suggested;
};

/** Which view the join prompt opens on: a confirm for one match, otherwise the list. */
export const joinPromptView = (match: string | null, wantsList: boolean): 'confirm' | 'list' =>
  match !== null && !wantsList ? 'confirm' : 'list';

export type JoinStage = 'own' | 'already' | 'dead' | 'failed' | 'full' | 'pick' | 'joined';

/** The dialog an answer calls for. A session with nobody left to be is "full", not a picker with nothing to pick. */
export function joinStage(answer: JoinAnswer): JoinStage {
  switch (answer.outcome) {
    case 'own':
    case 'already':
    case 'dead':
    case 'failed':
    case 'joined':
      return answer.outcome;
    case 'open':
    case 'taken':
      return claimableMembers(answer.preview).length === 0 ? 'full' : 'pick';
  }
}

/**
 * Whether the join dialog may open now: a link is waiting, the sessions and the profile have
 * loaded (the preselect needs both), no welcome, tour or other prompt is open, and the user isn't
 * in a practice session. A profile that failed to load still lets it run, without a preselect.
 */
export const joinFlowReady = (s: {
  pending: boolean;
  loaded: boolean;
  profileStatus: string;
  phase: string;
  practice: boolean;
}): boolean =>
  s.pending && s.loaded && s.profileStatus !== 'loading' && s.phase === 'off' && !s.practice;

const org = (name: string | null, capital: boolean): string =>
  name ?? (capital ? 'The organizer' : 'the organizer');

export const sharedByLine = (name: string | null): string =>
  name === null ? 'Shared with you' : `Shared by ${name}`;

export const recordsPaymentsLine = (name: string | null): string =>
  `${org(name, true)} records the payments on this session.`;

export const joinedRowLine = (p: Participant): string =>
  `${p.name ?? 'No name set'} · joined ${formatLocalDate(p.joinedAt)}`;

/**
 * What follows the organizer's name in the join prompt's first line. The prompt sets the name apart
 * in the accent colour, so the line is built from the name and this tail rather than as one string.
 */
export const JOIN_SHARED_REST =
  ' shared this session. Pick who you are, and your share of it shows up in your Collection.';

export const joinSharedLine = (name: string | null): string =>
  name === null
    ? "You've been invited to this session. Pick who you are, and your share of it shows up in your Collection."
    : `${name}${JOIN_SHARED_REST}`;

export const joinReadOnlyLine = (name: string | null): string =>
  `You can see the whole session, but only ${org(name, false)} can change it. ${org(name, true)} will see your Hati name and when you joined.`;

export const nameTakenLine = (name: string | null): string =>
  `Is your name taken? Ask ${org(name, false)} to remove it, then open the link again.`;

export const takenMessage = (member: string): string =>
  `Someone else just joined as ${member}. Pick who you are again.`;

export const alreadyMessage = (title: string, member: string): string =>
  `“${title}” is in your Collection. You joined as ${member}.`;

export const ownMessage = (title: string): string =>
  `You're the organizer of “${title}”, so it's already in your Collection. Share this link with the others so they can track their own payments.`;

export const everyoneJoinedMessage = (title: string, name: string | null): string =>
  `Every member of “${title}” is already on Hati. If one of them is you, ask ${org(name, false)} to remove that member, then open the link again.`;

export const inviteIntro = (title: string): string =>
  `Anyone with this link can sign in to Hati, pick who they are in “${title}”, and track their own payments. They can see the whole session but can't change it.`;

export const removeMessage = (p: Participant, title: string): string =>
  `${p.name ?? 'This account'} joined “${title}” as ${p.member}. Removing them takes the session out of their Collection and History. Payments already recorded stay. They can join again with the invite link unless you reset it.`;

export const stopTrackingMessage = (name: string | null): string =>
  `It leaves your Collection and History. ${org(name, true)} keeps the session, and payments already recorded stay. You can join again with the invite link if it still works.`;
