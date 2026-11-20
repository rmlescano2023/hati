import { useState } from 'react';
import { BreakdownGroup } from '../components/breakdown/BreakdownGroup';
import { EmptyState } from '../components/shared/EmptyState';
import { Button } from '../components/shared/Button';
import { InviteMembersDialog } from '../components/collection/InviteMembersDialog';
import { StopTrackingButton } from '../components/collection/StopTrackingButton';
import { ExportSoaButton } from '../components/summary/ExportSoaButton';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { groupRecordsForBreakdown } from '../lib/calculations';
import { isJoined } from '../lib/collection';
import { compareNames, formatLongDate, joinNames, sortNames } from '../lib/format';
import { sharedByLine } from '../lib/joinedSessions';
import { sessionDisplayTitle, sessionTitle } from '../lib/sessionLabel';
import styles from './HistoryDetailPage.module.css';

type Props = {
  sessionId: string;
  onBack: () => void;
  /** Called once a joined session has been left from here, so the app can go back and announce it. */
  onLeft?: (title: string) => void;
  /** The organizer's invite link for a session, or null when it can't be had. Absent in tests. */
  inviteUrlFor?: (sessionId: string) => Promise<string | null>;
};

const noop = () => {};

/**
 * One closed session in full: its read-only breakdown and its own SOA export. The organizer also
 * gets Share with members here; a member who joined gets Stop tracking in its place.
 */
export function HistoryDetailPage({ sessionId, onBack, onLeft = noop, inviteUrlFor }: Props) {
  const { sessions } = useSessionsStore();
  const [inviting, setInviting] = useState(false);
  const session = sessions.find((s) => s.id === sessionId);

  if (!session) {
    return (
      <EmptyState title="Session not found" description="It may have been removed elsewhere.">
        <Button onClick={onBack}>← History</Button>
      </EmptyState>
    );
  }

  const closedOn = (session.closedAt ?? session.createdAt).slice(0, 10);
  const members = [...session.members].sort(compareNames);
  const joined = isJoined(session);

  return (
    <>
      <div className={styles.bar}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← History
        </Button>
      </div>

      <header className={styles.header}>
        <div className={styles.titles}>
          <h2 className={styles.heading}>
            <span className={styles.date}>{sessionDisplayTitle(session)}</span>
          </h2>
          {session.name !== null && <p className={styles.dates}>{sessionTitle(session)}</p>}
          <p className={styles.meta}>
            Finished {formatLongDate(closedOn)}
            {members.length > 0 && <> · {joinNames(members)}</>}
          </p>
          {joined && (
            <p className={styles.meta}>
              {sharedByLine(session.organizerName ?? null)} · You joined as {session.me}
            </p>
          )}
        </div>
        <div className={styles.actions}>
          <ExportSoaButton
            layout="inline"
            members={sortNames(session.members)}
            records={session.records}
            name={session.name}
            fileNameSuffix={closedOn}
            getInviteUrl={joined || !inviteUrlFor ? undefined : () => inviteUrlFor(session.id)}
          />
          {joined ? (
            <StopTrackingButton
              session={session}
              variant="button"
              className={styles.secondary}
              onLeft={onLeft}
            />
          ) : (
            <Button
              variant="primary"
              size="lg"
              className={styles.secondary}
              onClick={() => setInviting(true)}
            >
              Share with members
            </Button>
          )}
        </div>
      </header>
      {inviting && <InviteMembersDialog session={session} onClose={() => setInviting(false)} />}

      {groupRecordsForBreakdown(session.records, sortNames(session.members)).map((group) => (
        <BreakdownGroup key={group.key} group={group} members={members} editable={false} />
      ))}
    </>
  );
}
