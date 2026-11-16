import { lazy, Suspense, useEffect, useState } from 'react';
import { MemberList } from '../components/home/MemberList';
import { PurchaseItemCard } from '../components/home/PurchaseItemCard';
import {
  NO_PAID_BY_PICK,
  type PaidByMemory,
  type SavedItemRef,
  type StagedItem,
} from '../lib/staging';

// Dev-only: `import.meta.env.DEV` is statically false in a production build, so
// this branch and everything it pulls in are dropped at build time.
const DevDataBar = import.meta.env.DEV
  ? lazy(() => import('../components/home/DevDataBar').then((m) => ({ default: m.DevDataBar })))
  : null;

type Props = {
  /** Told how many items are staged, so the workspace can warn before leaving them. */
  onStagedCountChange: (count: number) => void;
  /** A saved item out for editing, which the workspace holds; null when none is. */
  savedEdit: SavedItemRef | null;
  /** Ends that edit and returns to Breakdown; `removed` when the item had gone. */
  onSavedEditEnd: (removed: boolean) => void;
  /** This session's remembered Paid By pick (app-fixes item 3). */
  paidBy: PaidByMemory;
};

/**
 * Its own function, not the one useServerSessions registers for writes in
 * flight: addEventListener ignores a second registration of the same function,
 * so sharing one would let either side remove the other's prompt.
 */
function warnAboutStaged(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = '';
}

export function ExpensesPage({ onStagedCountChange, savedEdit, onSavedEditEnd, paidBy }: Props) {
  // Held here rather than in the card so Group Members can see what is staged.
  // Unmounting this page still drops it, which is what leaving the tab means.
  const [staged, setStaged] = useState<StagedItem[]>([]);
  // Changing the key gives Clear All a fresh Purchase Details: today's date,
  // One Payor with no pick, Equal Split, empty fields and no edit open.
  const [formKey, setFormKey] = useState(0);

  // An open edit of a staged item always has a staged item, so the count alone
  // says whether there is work to lose. An edit of a saved item is reported
  // separately, through the workspace's own state. Back to 0 on unmount, because
  // leaving drops it.
  useEffect(() => {
    onStagedCountChange(staged.length);
    return () => onStagedCountChange(0);
  }, [staged.length, onStagedCountChange]);

  // Reloading, closing the tab and the browser's Back button leave the app
  // without going through its own tabs, so the browser asks instead.
  const hasUnsaved = staged.length > 0 || savedEdit !== null;
  useEffect(() => {
    if (!hasUnsaved) return;
    window.addEventListener('beforeunload', warnAboutStaged);
    return () => window.removeEventListener('beforeunload', warnAboutStaged);
  }, [hasUnsaved]);

  return (
    <>
      {DevDataBar && (
        <Suspense fallback={null}>
          <DevDataBar />
        </Suspense>
      )}
      <MemberList
        staged={staged}
        savedEdit={savedEdit}
        onClearAll={() => {
          setStaged([]);
          paidBy.write(NO_PAID_BY_PICK);
          setFormKey((k) => k + 1);
        }}
      />
      <PurchaseItemCard
        key={formKey}
        staged={staged}
        setStaged={setStaged}
        savedEdit={savedEdit}
        onSavedEditEnd={onSavedEditEnd}
        paidBy={paidBy}
      />
    </>
  );
}
