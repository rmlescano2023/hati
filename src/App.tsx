import { useState } from 'react';
import { Header } from './components/layout/Header';
import { NavTabs, type TabId } from './components/layout/NavTabs';
import { PageShell } from './components/layout/PageShell';
import { HomePage } from './pages/HomePage';
import { BreakdownPage } from './pages/BreakdownPage';
import { SummaryPage } from './pages/SummaryPage';

export default function App() {
  const [tab, setTab] = useState<TabId>('home');

  return (
    <PageShell header={<Header />} nav={<NavTabs active={tab} onChange={setTab} />}>
      {tab === 'home' && <HomePage />}
      {tab === 'breakdown' && <BreakdownPage />}
      {tab === 'summary' && <SummaryPage />}
    </PageShell>
  );
}
