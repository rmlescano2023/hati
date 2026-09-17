import { useState } from 'react';
import { Header } from './components/layout/Header';
import { NavTabs, type TabId } from './components/layout/NavTabs';
import { PageShell } from './components/layout/PageShell';
import { SessionWorkspace } from './components/layout/SessionWorkspace';
import type { SessionTabId } from './components/layout/SessionTabs';
import { Button } from './components/shared/Button';
import { useSessionsStore } from './context/SessionsStoreContext';
import { HomePage } from './pages/HomePage';
import { HistoryPage } from './pages/HistoryPage';
import { HistoryDetailPage } from './pages/HistoryDetailPage';

/**
 * Top level is just Home and History; opening a session swaps the whole shell
 * for that session's workspace, which carries its own inner tabs.
 */
type Screen =
  | { kind: 'home' }
  | { kind: 'history' }
  | { kind: 'historyDetail'; sessionId: string }
  | { kind: 'session'; sessionId: string; tab: SessionTabId };

/** The two screens that sit under a top-level tab and keep the tab bar. */
const TOP_LEVEL = new Set<Screen['kind']>(['home', 'history']);

export default function App() {
  const { createSession } = useSessionsStore();
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

  const openSession = (sessionId: string) =>
    setScreen({ kind: 'session', sessionId, tab: 'expenses' });

  const nav = !TOP_LEVEL.has(screen.kind) ? null : (
    <NavTabs
      active={screen.kind as TabId}
      onChange={(tab) => setScreen({ kind: tab })}
      actions={
        <Button variant="primary" onClick={() => openSession(createSession())}>
          + New Session
        </Button>
      }
    />
  );

  return (
    <PageShell header={<Header />} nav={nav}>
      {screen.kind === 'home' && <HomePage onOpenSession={openSession} />}
      {screen.kind === 'history' && (
        <HistoryPage
          onOpenSession={(sessionId) => setScreen({ kind: 'historyDetail', sessionId })}
        />
      )}
      {screen.kind === 'historyDetail' && (
        <HistoryDetailPage
          sessionId={screen.sessionId}
          onBack={() => setScreen({ kind: 'history' })}
        />
      )}
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
