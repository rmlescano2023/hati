import { useMemo } from 'react';
import { BreakdownGroup } from '../components/breakdown/BreakdownGroup';
import { EmptyState } from '../components/shared/EmptyState';
import { useAppData } from '../context/AppDataContext';
import { groupRecordsForBreakdown } from '../lib/calculations';
import { sortNames } from '../lib/format';

export function BreakdownPage() {
  const { members, records } = useAppData();

  const sortedMembers = useMemo(() => sortNames(members), [members]);
  const groups = useMemo(
    () => groupRecordsForBreakdown(records, sortedMembers),
    [records, sortedMembers],
  );

  if (groups.length === 0) {
    return <EmptyState title="No records yet" description="Add expenses from the Home page." />;
  }

  return (
    <>
      {groups.map((group) => (
        <BreakdownGroup key={group.key} group={group} members={sortedMembers} />
      ))}
    </>
  );
}
