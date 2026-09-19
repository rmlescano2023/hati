import { useState } from 'react';
import { Header } from './components/layout/Header';
import { NavTabs, type TabId } from './components/layout/NavTabs';
import { PageShell } from './components/layout/PageShell';
import { SessionWorkspace } from './components/layout/SessionWorkspace';
import { SyncBanner } from './components/layout/SyncBanner';
import type { SessionTabId } from './components/layout/SessionTabs';
import { Button } from './components/shared/Button';
import { useSessionsStore } from './context/SessionsStoreContext';
import { HomePage } from './pages/HomePage';
import { HistoryPage } from './pages/HistoryPage';
import { HistoryDetailPage } from './pages/HistoryDetailPage';
import styles from './App.module.css';

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
  const { sessions, createSession, sync } = useSessionsStore();
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });

  const openSession = (sessionId: string) =>
    setScreen({ kind: 'session', sessionId, tab: 'expenses' });
  const newSession = () => openSession(createSession());

  // An empty Home carries the action in its own empty state, so the nav row
  // drops it there rather than offering the same button twice.
  const homeIsEmpty = !sessions.some((s) => s.status === 'draft');
  const showNewSession = !(screen.kind === 'home' && homeIsEmpty);

  const nav = !TOP_LEVEL.has(screen.kind) ? null : (
    <NavTabs
      active={screen.kind as TabId}
      onChange={(tab) => setScreen({ kind: tab })}
      actions={
        showNewSession && (
          <Button variant="primary" onClick={newSession}>
            + New Session
          </Button>
        )
      }
    />
  );

  // Nothing can be shown until the first load lands; an empty app would read
  // as lost data rather than as data still on its way.
  if (sync.status === 'loading') {
    return (
      <PageShell header={<Header />}>
        <p className={styles.loading}>Loading your sessions…</p>
      </PageShell>
    );
  }

  return (
    <PageShell header={<Header />} nav={nav}>
      <SyncBanner />
      {screen.kind === 'home' && <HomePage onOpenSession={openSession} onNewSession={newSession} />}
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
