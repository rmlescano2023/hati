import { lazy, Suspense, useEffect, useState } from 'react';
import { MemberList } from '../components/home/MemberList';
import { PurchaseItemCard } from '../components/home/PurchaseItemCard';
import type { StagedItem } from '../lib/staging';

// Dev-only: `import.meta.env.DEV` is statically false in a production build, so
// this branch and everything it pulls in are dropped at build time.
const DevDataBar = import.meta.env.DEV
  ? lazy(() => import('../components/home/DevDataBar').then((m) => ({ default: m.DevDataBar })))
  : null;

type Props = {
  /** Told how many items are staged, so the workspace can warn before leaving them. */
  onStagedCountChange: (count: number) => void;
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

export function ExpensesPage({ onStagedCountChange }: Props) {
  // Held here rather than in the card so Group Members can see what is staged.
  // Unmounting this page still drops it, which is what leaving the tab means.
  const [staged, setStaged] = useState<StagedItem[]>([]);
  // Changing the key gives Clear All a fresh Purchase Details: today's date,
  // One Payor with no pick, Equal Split, empty fields and no edit open.
  const [formKey, setFormKey] = useState(0);

  // An open edit always has a staged item, so the count alone says whether
  // there is work to lose. Back to 0 on unmount, because leaving drops it.
  useEffect(() => {
    onStagedCountChange(staged.length);
    return () => onStagedCountChange(0);
  }, [staged.length, onStagedCountChange]);

  // Reloading, closing the tab and the browser's Back button leave the app
  // without going through its own tabs, so the browser asks instead.
  const hasStaged = staged.length > 0;
  useEffect(() => {
    if (!hasStaged) return;
    window.addEventListener('beforeunload', warnAboutStaged);
    return () => window.removeEventListener('beforeunload', warnAboutStaged);
  }, [hasStaged]);

  return (
    <>
      {DevDataBar && (
        <Suspense fallback={null}>
          <DevDataBar />
        </Suspense>
      )}
      <MemberList
        staged={staged}
        onClearAll={() => {
          setStaged([]);
          setFormKey((k) => k + 1);
        }}
      />
      <PurchaseItemCard key={formKey} staged={staged} setStaged={setStaged} />
    </>
  );
}
