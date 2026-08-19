import { lazy, Suspense } from 'react';
import { MemberList } from '../components/home/MemberList';
import { PurchaseItemCard } from '../components/home/PurchaseItemCard';

// Dev-only: `import.meta.env.DEV` is statically false in a production build, so
// this branch and everything it pulls in are dropped at build time.
const DevDataBar = import.meta.env.DEV
  ? lazy(() => import('../components/home/DevDataBar').then((m) => ({ default: m.DevDataBar })))
  : null;

export function HomePage() {
  return (
    <>
      {DevDataBar && (
        <Suspense fallback={null}>
          <DevDataBar />
        </Suspense>
      )}
      <MemberList />
      <PurchaseItemCard />
    </>
  );
}
