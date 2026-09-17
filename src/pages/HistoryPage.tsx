import { useMemo } from 'react';
import { BreakdownGroup } from '../components/breakdown/BreakdownGroup';
import { EmptyState } from '../components/shared/EmptyState';
import { ExportSoaButton } from '../components/summary/ExportSoaButton';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { groupRecordsForBreakdown } from '../lib/calculations';
import { compareNames, formatLongDate, sortNames } from '../lib/format';
import styles from './HistoryPage.module.css';

export function HistoryPage() {
  const { sessions } = useSessionsStore();

  const closed = useMemo(
    () =>
      sessions
        .filter((s) => s.status === 'closed')
        // Most recently closed first.
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    [sessions],
  );

  if (closed.length === 0) {
    return (
      <EmptyState
        title="No archived sessions yet"
        description="Close a session from its Summary tab and it will be filed here."
      />
    );
  }

  return (
    <>
      {closed.map((session) => {
        const closedOn = (session.closedAt ?? session.createdAt).slice(0, 10);
        const members = [...session.members].sort(compareNames);
        return (
          <section key={session.id} className={styles.session}>
            <div className={styles.sessionHeader}>
              <h2 className={styles.sessionHeading}>
                <span className={styles.closedLabel}>Closed</span>
                <span className={styles.closedDate}>{formatLongDate(closedOn)}</span>
              </h2>
              <ExportSoaButton
                layout="inline"
                members={sortNames(session.members)}
                records={session.records}
                fileNameSuffix={closedOn}
              />
            </div>
            {groupRecordsForBreakdown(session.records, sortNames(session.members)).map((group) => (
              <BreakdownGroup
                key={group.key}
                group={group}
                members={members}
                editable={false}
                lockedReason="closed"
              />
            ))}
          </section>
        );
      })}
    </>
  );
}
