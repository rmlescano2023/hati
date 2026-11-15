import { useMemo } from 'react';
import { BreakdownGroup } from '../components/breakdown/BreakdownGroup';
import { EmptyState } from '../components/shared/EmptyState';
import { useAppData } from '../context/AppDataContext';
import { groupRecordsForBreakdown } from '../lib/calculations';
import { sortNames } from '../lib/format';
import type { SavedItemRef } from '../lib/staging';

type Props = {
  /** Asks to edit a saved item; the workspace confirms and opens it on Expenses. */
  onEditItem: (ref: SavedItemRef) => void;
};

export function BreakdownPage({ onEditItem }: Props) {
  const { members, records } = useAppData();

  const sortedMembers = useMemo(() => sortNames(members), [members]);
  const groups = useMemo(
    () => groupRecordsForBreakdown(records, sortedMembers),
    [records, sortedMembers],
  );

  if (groups.length === 0) {
    return <EmptyState title="No records yet" description="Add expenses from the Expenses tab." />;
  }

  return (
    <>
      {groups.map((group) => (
        // Always editable: this page only renders inside an open session, and
        // a session's records stay editable for as long as it is open.
        <BreakdownGroup key={group.key} group={group} members={sortedMembers} onEdit={onEditItem} />
      ))}
    </>
  );
}
