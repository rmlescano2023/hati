import { BreakdownGroup } from '../components/breakdown/BreakdownGroup';
import { EmptyState } from '../components/shared/EmptyState';
import { Button } from '../components/shared/Button';
import { ExportSoaButton } from '../components/summary/ExportSoaButton';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { groupRecordsForBreakdown } from '../lib/calculations';
import { compareNames, formatLongDate, joinNames, sortNames } from '../lib/format';
import styles from './HistoryDetailPage.module.css';

type Props = {
  sessionId: string;
  onBack: () => void;
};

/** One closed session in full: its read-only breakdown and its own SOA export. */
export function HistoryDetailPage({ sessionId, onBack }: Props) {
  const { sessions } = useSessionsStore();
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

  return (
    <>
      <div className={styles.bar}>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← History
        </Button>
        <ExportSoaButton
          layout="inline"
          members={sortNames(session.members)}
          records={session.records}
          fileNameSuffix={closedOn}
        />
      </div>

      <header className={styles.header}>
        <h2 className={styles.heading}>
          <span className={styles.label}>Closed</span>
          <span className={styles.date}>{formatLongDate(closedOn)}</span>
        </h2>
        {members.length > 0 && <p className={styles.members}>{joinNames(members)}</p>}
      </header>

      {groupRecordsForBreakdown(session.records, sortNames(session.members)).map((group) => (
        <BreakdownGroup
          key={group.key}
          group={group}
          members={members}
          editable={false}
          lockedReason="closed"
        />
      ))}
    </>
  );
}
