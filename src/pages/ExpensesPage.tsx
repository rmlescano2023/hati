import { lazy, Suspense, useState } from 'react';
import { MemberList } from '../components/home/MemberList';
import { PurchaseItemCard } from '../components/home/PurchaseItemCard';
import type { StagedItem } from '../lib/staging';

// Dev-only: `import.meta.env.DEV` is statically false in a production build, so
// this branch and everything it pulls in are dropped at build time.
const DevDataBar = import.meta.env.DEV
  ? lazy(() => import('../components/home/DevDataBar').then((m) => ({ default: m.DevDataBar })))
  : null;

export function ExpensesPage() {
  // Held here rather than in the card so Group Members can see what is staged.
  // Unmounting this page still drops it, which is what leaving the tab means.
  const [staged, setStaged] = useState<StagedItem[]>([]);
  // Changing the key gives Clear All a fresh Purchase Details: today's date,
  // One Payor with no pick, Equal Split, empty fields and no edit open.
  const [formKey, setFormKey] = useState(0);

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
