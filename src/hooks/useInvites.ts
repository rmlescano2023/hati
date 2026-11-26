import { useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { joinAnswerFrom } from '../lib/joinedSessions';
import { WRITE_TIMEOUT_MS, authorisedFetch, withDeadline } from '../lib/writeQueue';
import type { JoinAnswer, Participant } from '../types';

const ENDPOINT = '/api/invites';

/** The link an organizer shares, and who has joined through it. */
export type InviteLink = { token: string; participants: Participant[] };

/**
 * The requests behind the invite link, with no state of their own: each dialog that uses them
 * keeps what it needs. Every one resolves rather than rejects, so a caller reads the outcome
 * instead of catching. A token travels only in the POST body, never in the address (RC-3).
 */
export function useInvites() {
  const { getToken } = useAuth();

  const post = useCallback(
    (body: unknown) =>
      withDeadline(WRITE_TIMEOUT_MS, async (signal) => {
        const res = await authorisedFetch(
          () => getToken(),
          fetch,
          ENDPOINT,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
          signal,
        );
        // An answer that isn't JSON, such as a gateway's page, is no answer.
        const json: unknown = await res.json().catch(() => null);
        return { status: res.status, body: json };
      }),
    [getToken],
  );

  /** The organizer's link for a finished session, minted on first ask, or replaced when `reset`. Null on any failure. */
  const getLink = useCallback(
    async (sessionId: string, reset: boolean): Promise<InviteLink | null> => {
      try {
        const { status, body } = await post({ sessionId, reset });
        const link = body as Partial<InviteLink> | null;
        return status === 200 && typeof link?.token === 'string' && Array.isArray(link.participants)
          ? { token: link.token, participants: link.participants }
          : null;
      } catch {
        return null;
      }
    },
    [post],
  );

  /** What a token opens, for the join dialog. */
  const preview = useCallback(
    async (token: string): Promise<JoinAnswer> => {
      try {
        const { status, body } = await post({ token });
        return joinAnswerFrom(status, body);
      } catch {
        return { outcome: 'failed' };
      }
    },
    [post],
  );

  /** Joins as `member`. */
  const join = useCallback(
    async (token: string, member: string): Promise<JoinAnswer> => {
      try {
        const { status, body } = await post({ token, member });
        return joinAnswerFrom(status, body);
      } catch {
        return { outcome: 'failed' };
      }
    },
    [post],
  );

  return useMemo(() => ({ getLink, preview, join }), [getLink, preview, join]);
}
