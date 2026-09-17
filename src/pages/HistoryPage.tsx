import { useMemo, useState } from 'react';
import { BreakdownGroup } from '../components/breakdown/BreakdownGroup';
import { DateRangeFilter } from '../components/history/DateRangeFilter';
import { Card } from '../components/shared/Card';
import { EmptyState } from '../components/shared/EmptyState';
import { ExportSoaButton } from '../components/summary/ExportSoaButton';
import { useSessionsStore } from '../context/SessionsStoreContext';
import { groupRecordsForBreakdown } from '../lib/calculations';
import { compareNames, formatLongDate, sortNames } from '../lib/format';
import type { PurchaseRecord, Session } from '../types';
import styles from './HistoryPage.module.css';

/** Earliest and latest purchase date across every archived record. */
function dateSpan(sessions: Session[]): { min: string; max: string } | null {
  const dates = sessions.flatMap((s) => s.records.map((r) => r.date)).sort();
  if (dates.length === 0) return null;
  return { min: dates[0], max: dates[dates.length - 1] };
}

export function HistoryPage() {
  const { sessions } = useSessionsStore();

  const archivedSessions = useMemo(() => sessions.filter((s) => s.status === 'closed'), [sessions]);

  const span = useMemo(() => dateSpan(archivedSessions), [archivedSessions]);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  // The pickers default to the full span, and follow it until the user narrows
  // the range themselves.
  const start = range?.start ?? span?.min ?? '';
  const end = range?.end ?? span?.max ?? '';

  const sessionsInRange = useMemo(() => {
    return (
      archivedSessions
        .map((session) => ({
          session,
          records: session.records.filter((r) => r.date >= start && r.date <= end),
        }))
        .filter(({ records }) => records.length > 0)
        // Most recently closed first.
        .sort((a, b) => (b.session.closedAt ?? '').localeCompare(a.session.closedAt ?? ''))
    );
  }, [archivedSessions, start, end]);

  const exportRecords = useMemo<PurchaseRecord[]>(
    () => sessionsInRange.flatMap(({ records }) => records),
    [sessionsInRange],
  );

  // One statement can span sessions whose rosters differ, so the SOA gets the
  // union of every in-range session's frozen roster.
  const exportMembers = useMemo(() => {
    const names = new Set<string>();
    for (const { session } of sessionsInRange) for (const m of session.members) names.add(m);
    return sortNames([...names]);
  }, [sessionsInRange]);

  if (archivedSessions.length === 0 || !span) {
    return (
      <EmptyState
        title="No archived sessions yet"
        description="Close a session from the Summary page and it will be filed here."
      />
    );
  }

  const narrowed = start !== span.min || end !== span.max;

  return (
    <>
      <Card label="Date Range">
        <DateRangeFilter
          start={start}
          end={end}
          min={span.min}
          max={span.max}
          narrowed={narrowed}
          onStartChange={(value) => setRange({ start: value, end })}
          onEndChange={(value) => setRange({ start, end: value })}
          onReset={() => setRange(null)}
        />
      </Card>

      {sessionsInRange.length === 0 ? (
        <EmptyState
          title="Nothing in this range"
          description="No archived purchases fall between these dates. Widen the range to see more."
        />
      ) : (
        sessionsInRange.map(({ session, records }) => (
          <section key={session.id} className={styles.session}>
            <h2 className={styles.sessionHeading}>
              <span className={styles.closedLabel}>Closed</span>
              <span className={styles.closedDate}>
                {formatLongDate((session.closedAt ?? session.createdAt).slice(0, 10))}
              </span>
            </h2>
            {groupRecordsForBreakdown(records, sortNames(session.members)).map((group) => (
              <BreakdownGroup
                key={group.key}
                group={group}
                members={[...session.members].sort(compareNames)}
                editable={false}
                lockedReason="closed"
              />
            ))}
          </section>
        ))
      )}

      {exportRecords.length > 0 && (
        <ExportSoaButton
          members={exportMembers}
          records={exportRecords}
          fileNameSuffix={`${start}_to_${end}`}
          hint={`A statement covering ${formatLongDate(start)} — ${formatLongDate(end)}.`}
        />
      )}
    </>
  );
}
