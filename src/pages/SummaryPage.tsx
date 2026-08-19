import { useMemo, useState } from 'react';
import { EmptyState } from '../components/shared/EmptyState';
import { FinalSettlement } from '../components/summary/FinalSettlement';
import { NetBalanceCards } from '../components/summary/NetBalanceCards';
import { OwedMatrix, type MatrixView } from '../components/summary/OwedMatrix';
import { ExportEsoaButton } from '../components/summary/ExportEsoaButton';
import { useAppData } from '../context/AppDataContext';
import {
  getFinalSettlement,
  getNetBalances,
  getNettedOwedMatrix,
  getRawOwedMatrix,
} from '../lib/calculations';
import { sortNames } from '../lib/format';

export function SummaryPage() {
  const { members, records } = useAppData();
  const [view, setView] = useState<MatrixView>('netted');

  const sortedMembers = useMemo(() => sortNames(members), [members]);

  const raw = useMemo(() => getRawOwedMatrix(records, sortedMembers), [records, sortedMembers]);
  const netted = useMemo(() => getNettedOwedMatrix(raw), [raw]);

  // Net balances and the settlement are always driven by the netted numbers,
  // whichever view the matrix is showing.
  const balances = useMemo(() => getNetBalances(netted, sortedMembers), [netted, sortedMembers]);
  const settlements = useMemo(
    () => getFinalSettlement(netted, sortedMembers),
    [netted, sortedMembers],
  );

  if (records.length === 0) {
    return <EmptyState title="No records yet" description="Add expenses from the Home page." />;
  }

  return (
    <>
      <FinalSettlement settlements={settlements} />
      <OwedMatrix
        matrix={view === 'netted' ? netted : raw}
        members={sortedMembers}
        view={view}
        onViewChange={setView}
      />
      <NetBalanceCards balances={balances} />
      <ExportEsoaButton members={sortedMembers} records={records} />
    </>
  );
}
