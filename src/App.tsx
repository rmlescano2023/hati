import { useState } from 'react';
import { Header } from './components/layout/Header';
import { NavTabs, type TabId } from './components/layout/NavTabs';
import { PageShell } from './components/layout/PageShell';
import { SessionWorkspace } from './components/layout/SessionWorkspace';
import type { SessionTabId } from './components/layout/SessionTabs';
import { HomePage } from './pages/HomePage';
import { HistoryPage } from './pages/HistoryPage';

/**
 * Top level is just Home and History; opening a session swaps the whole shell
 * for that session's workspace, which carries its own inner tabs.
 */
type Screen =
  | { kind: 'home' }
  | { kind: 'history' }
  | { kind: 'session'; sessionId: string; tab: SessionTabId };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

  const openSession = (sessionId: string) =>
    setScreen({ kind: 'session', sessionId, tab: 'expenses' });

  const nav =
    screen.kind === 'session' ? null : (
      <NavTabs active={screen.kind as TabId} onChange={(tab) => setScreen({ kind: tab })} />
    );

  return (
    <PageShell header={<Header />} nav={nav}>
      {screen.kind === 'home' && <HomePage onOpenSession={openSession} />}
      {screen.kind === 'history' && <HistoryPage />}
      {screen.kind === 'session' && (
        <SessionWorkspace
          sessionId={screen.sessionId}
          tab={screen.tab}
          onTabChange={(tab) => setScreen({ ...screen, tab })}
          onBack={() => setScreen({ kind: 'home' })}
          // Landing on History after closing is the confirmation that the
          // session was archived rather than lost.
          onClosed={() => setScreen({ kind: 'history' })}
        />
      )}
    </PageShell>
  );
}
