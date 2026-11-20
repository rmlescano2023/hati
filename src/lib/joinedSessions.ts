import {
  NOT_IN_SESSION,
  formatCents,
  markAllText,
  matchMember,
  type KnownNames,
} from './collection.js';
import { formatLocalDate, formatLocalDateTime } from './format.js';
import type { Claim, InvitePreview, JoinAnswer, Participant, Payment, Session } from '../types';

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

/** A claim as the server stores it: the sender's account is known here and goes no further. */
export type ClaimRow = Omit<Claim, 'mine'> & { claimedBy: string };

/**
 * The payments and claims a caller may see of one session, and the one place that rule lives: the
 * session GET and every 409 body that carries a ledger both go through it (D1, BR-C8).
 *
 * The organizer sees every payment and the pending claims, never a declined one. A participant
 * sees the payments on their own lines, and the claims that are theirs: ones they sent as the
 * debtor, pending or declined, and pending ones waiting on them as the creditor. `claimedBy` is
 * stripped and `mine` is set from `userId`, so no account id reaches a client.
 */
export function visibleLedger(
  access: { role: 'owner' } | { role: 'participant'; member: string },
  payments: Payment[],
  claims: ClaimRow[],
  userId: string,
): { payments: Payment[]; claims: Claim[] } {
  const shown =
    access.role === 'owner'
      ? { payments, claims: claims.filter((c) => c.status === 'pending') }
      : {
          payments: payments.filter(
            (p) => p.debtor === access.member || p.creditor === access.member,
          ),
          claims: claims.filter(
            (c) =>
              (c.debtor === access.member && c.claimedBy === userId) ||
              (c.creditor === access.member && c.status === 'pending'),
          ),
        };
  return {
    payments: shown.payments,
    claims: shown.claims.map(({ claimedBy, ...claim }) => ({
      ...claim,
      mine: claimedBy === userId,
    })),
  };
}

/**
 * What a participant is allowed to see of a session (D1): everything about it, but only the
 * payments on their own lines, and never the organizer's pick or who else joined. The claims it is
 * given have already been through `visibleLedger`, so that rule isn't repeated here. `withAccount`
 * is which members have an account on it, which only decides whose name a claim waits on.
 */
export function participantView(
  session: Session,
  member: string,
  organizerName: string | null,
  withAccount: string[],
): Session {
  return {
    ...session,
    me: member,
    role: 'participant',
    organizerName,
    participants: [],
    withAccount,
    payments: session.payments.filter((p) => p.debtor === member || p.creditor === member),
  };
}

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
 * The members a joiner can't pick: the ones on Hati, and the organizer's own member (BR-J4). A
 * `me` of '' or null never equals a member name, so an organizer who isn't in the session takes
 * nobody.
 */
export const unavailableMembers = (
  members: string[],
  organizerMe: string | null,
  claimed: string[],
): string[] => members.filter((m) => claimed.includes(m) || m === organizerMe);

/** The members a joiner can still be. */
export const claimableMembers = (
  preview: Pick<InvitePreview, 'members' | 'unavailable'>,
): string[] => preview.members.filter((m) => !preview.unavailable.includes(m));

/**
 * Who the join dialog starts on: a profile-name hit among the claimable members is preselected, a
 * nickname hit is only suggested, and anything else leaves the choice to the user. It is the
 * same matching Collection uses, so a member already on Hati can never be picked by it.
 */
export function joinPreselect(
  preview: Pick<InvitePreview, 'members' | 'unavailable'>,
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

export const joinedRowLine = (p: Participant): string =>
  `${p.name ?? 'No name set'} · joined ${formatLocalDate(p.joinedAt)}`;

export const joinSharedLine = (name: string | null): string =>
  `${name === null ? "You've been invited to this session." : `${name} shared this session.`} Pick who you are, and your share of it shows up in your Collection.`;

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

export const removeMessage = (p: Participant, title: string, hasPending = false): string =>
  `${p.name ?? 'This account'} joined “${title}” as ${p.member}. Removing them takes the session out of their Collection and History. Payments already recorded stay. They can join again with the invite link unless you reset it.${hasPending ? " Any payment they've said they made that's still waiting is withdrawn." : ''}`;

export const stopTrackingMessage = (name: string | null, hasPending = false): string =>
  `It leaves your Collection and History. ${org(name, true)} keeps the session, and payments already recorded stay. You can join again with the invite link if it still works.${hasPending ? " Any payment you've said you made that's still waiting for confirmation is withdrawn." : ''}`;

/**
 * The name a claim waits on: the creditor when they have an account on the session, otherwise the
 * organizer, who decides for everyone without one (BR-C19). Lower case mid-sentence.
 */
export const deciderName = (
  creditor: string,
  withAccount: string[],
  organizerName: string | null,
): string => (withAccount.includes(creditor) ? creditor : (organizerName ?? 'the organizer'));

export const waitingLine = (cents: number, decider: string): string =>
  `${formatCents(cents)} waiting for ${decider} to confirm`;

export const toConfirmLine = (cents: number): string =>
  `${formatCents(cents)} waiting for you to confirm`;

export const youSaidLine = (cents: number): string => `You said you paid ${formatCents(cents)}`;

export const waitingForLine = (decider: string): string => `Waiting for ${decider} to confirm`;

export const saysTheyPaidLine = (debtor: string, cents: number): string =>
  `${debtor} says they paid ${formatCents(cents)}`;

export const saysTheyPaidOtherLine = (debtor: string, creditor: string, cents: number): string =>
  `${debtor} says they paid ${creditor} ${formatCents(cents)}`;

export const notConfirmedLine = (cents: number, at: string): string =>
  `Not confirmed: the ${formatCents(cents)} you said you paid on ${formatLocalDateTime(at)}`;

export const talkToLine = (creditor: string): string =>
  `If you did pay, talk to ${creditor}, then send it again.`;

export const notOnHatiLine = (creditor: string): string =>
  `${creditor} isn't on Hati, so you confirm it.`;

export const toConfirmCountLine = (n: number): string =>
  n === 1 ? '1 payment to confirm' : `${n} payments to confirm`;

export const waitingSummaryLine = (cents: number): string =>
  `${formatCents(cents)} waiting for confirmation`;

/** `own` is a claim on the decider's own line, "paid you"; otherwise it names the creditor. */
export const declineMessage = (
  debtor: string,
  creditor: string,
  cents: number,
  at: string,
  own: boolean,
): string =>
  `${debtor} said they paid ${own ? 'you' : creditor} ${formatCents(cents)} on ${formatLocalDateTime(at)}. Declining records nothing, and ${debtor} will see that it wasn't confirmed.`;

export const confirmOthersMessage = (
  debtor: string,
  creditor: string,
  cents: number,
  title: string,
): string => `This records ${formatCents(cents)} paid by ${debtor} to ${creditor} on “${title}”.`;

export const withdrawMessage = (creditor: string, cents: number, at: string): string =>
  `This takes back the ${formatCents(cents)} you said you paid ${creditor} on ${formatLocalDateTime(at)}. Nothing was recorded yet.`;

/** What Mark all as paid confirms on a joined card, by which sides have something open. */
export function joinedMarkAllMessage(title: string, owedCents: number, oweCents: number): string {
  if (owedCents > 0 && oweCents > 0) {
    return `This records the ${formatCents(owedCents)} still owed to you as received, and tells the people you owe that you've paid them ${formatCents(oweCents)}. What you've paid counts once it's confirmed.`;
  }
  if (oweCents > 0) {
    return `This tells the people you owe on “${title}” that you've paid them ${formatCents(oweCents)}, one payment per person. Each counts once it's confirmed, and you can withdraw any of them until then.`;
  }
  return markAllText(title, owedCents, 0);
}

/**
 * Why a payment or claim over the cap is refused (A3). `remaining` is what is left on the line and
 * `open` is that minus what is pending, so a line fully covered by pending claims says so rather
 * than quoting a figure the user can't use.
 */
export function overCapMessage(remainingCents: number, openCents: number): string {
  if (remainingCents === 0) return 'This line is already paid in full.';
  if (openCents === 0) return "What's left on this line is already waiting for confirmation.";
  return `Only ${formatCents(openCents)} is left on this line.`;
}

/** Why a confirm is refused when less is left than the claim (AC-21.5, A3). */
export function overConfirmMessage(remainingCents: number, debtor: string): string {
  if (remainingCents === 0) {
    return "This line is already paid in full, so this can't be confirmed. Decline it.";
  }
  return `Only ${formatCents(remainingCents)} is left on this line, so this can't be confirmed. Decline it, or ask ${debtor} to withdraw it and send what's left.`;
}
