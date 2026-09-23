import { useCallback, useEffect, useRef, useState } from 'react';
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
import { OnboardingTour } from './components/onboarding/OnboardingTour';
import { OnboardingDialog } from './components/onboarding/OnboardingDialog';
import type { ScreenShape } from './components/onboarding/steps';
import { useOnboarding } from './hooks/useOnboarding';
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
  const { sessions, createSession, deleteSession, sync } = useSessionsStore();
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const { shouldRun: firstLogin, markSeen } = useOnboarding();

  /**
   * Onboarding is a small sequence rather than a flag: the offer, the tour
   * itself, then the sign-off. Only 'running' puts the tour on screen.
   */
  const [phase, setPhase] = useState<'off' | 'intro' | 'running' | 'done'>('off');

  // The offer opens as soon as we know this is a first login, and only then —
  // the guard keeps a later state change from reopening a finished sequence.
  useEffect(() => {
    if (firstLogin) setPhase((current) => (current === 'off' ? 'intro' : current));
  }, [firstLogin]);

  /**
   * The session the tour asked the user to create, so it can be cleared up
   * afterwards — onboarding should not leave a session nobody meant to make.
   */
  const tourSession = useRef<string | null>(null);

  const openSession = (sessionId: string) =>
    setScreen({ kind: 'session', sessionId, tab: 'expenses' });
  const newSession = () => {
    const id = createSession();
    if (phase === 'running' && tourSession.current === null) tourSession.current = id;
    openSession(id);
  };

  const endTour = useCallback(
    (completed: boolean) => {
      const id = tourSession.current;
      tourSession.current = null;
      markSeen();

      if (id !== null) {
        // Keep it if they actually put something in it — silently deleting
        // what someone typed is worse than leaving a session behind.
        const created = sessions.find((s) => s.id === id);
        const untouched = created && created.members.length === 0 && created.records.length === 0;
        if (untouched) deleteSession(id);
      }

      // Whichever way it ended, do not leave them inside a session the tour
      // opened — and finishing it earns a welcome.
      setScreen({ kind: 'home' });
      setPhase(completed ? 'done' : 'off');
    },
    [deleteSession, markSeen, sessions],
  );

  /**
   * Where the tour sends the app when Next is pressed. A session step needs a
   * session to exist, so the first one creates it — the same session the tour
   * clears up when it ends.
   */
  const tourNavigate = useCallback(
    (shape: ScreenShape) => {
      if (shape.kind !== 'session') {
        setScreen({ kind: shape.kind });
        return;
      }
      setScreen((current) => {
        if (current.kind === 'session') return { ...current, tab: shape.tab };
        const id = createSession();
        if (tourSession.current === null) tourSession.current = id;
        return { kind: 'session', sessionId: id, tab: shape.tab };
      });
    },
    [createSession],
  );

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
          <Button variant="primary" data-tour="new-session" onClick={newSession}>
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

  // The tour only needs the shape of the screen, not which session is open.
  const tourScreen: ScreenShape =
    screen.kind === 'session'
      ? { kind: 'session', tab: screen.tab }
      : { kind: screen.kind === 'historyDetail' ? 'history' : screen.kind };

  return (
    <PageShell header={<Header />} nav={nav}>
      <OnboardingDialog
        open={phase === 'intro'}
        title="Welcome to Hati!"
        message="Hati splits a group's spending and works out who owes whom. Here's a quick tutorial through it — it takes about a minute."
        onDismiss={() => {
          markSeen();
          setPhase('off');
        }}
      >
        <Button
          variant="ghost"
          onClick={() => {
            markSeen();
            setPhase('off');
          }}
        >
          Skip tutorial
        </Button>
        <Button variant="primary" onClick={() => setPhase('running')} autoFocus>
          Take the tour
        </Button>
      </OnboardingDialog>
      <OnboardingTour
        run={phase === 'running'}
        screen={tourScreen}
        onNavigate={tourNavigate}
        onDone={endTour}
      />
      <OnboardingDialog
        open={phase === 'done'}
        title="You're all set"
        message="That's the whole app. Start a session whenever your group spends something together, and Hati will keep track of the rest."
        onDismiss={() => setPhase('off')}
      >
        <Button variant="primary" onClick={() => setPhase('off')} autoFocus>
          Get started
        </Button>
      </OnboardingDialog>
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
