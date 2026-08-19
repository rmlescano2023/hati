import { useState } from 'react';
import { Header } from './components/layout/Header';
import { NavTabs, type TabId } from './components/layout/NavTabs';
import { PageShell } from './components/layout/PageShell';
import { EmptyState } from './components/shared/EmptyState';

export default function App() {
  const [tab, setTab] = useState<TabId>('home');

  return (
    <PageShell header={<Header />} nav={<NavTabs active={tab} onChange={setTab} />}>
      <EmptyState title="Coming together" description={`The ${tab} page lands in a later phase.`} />
    </PageShell>
  );
}
