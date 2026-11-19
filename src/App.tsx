import { useCallback, useEffect, useRef, useState } from 'react';
import { Header } from './components/layout/Header';
import { NavTabs, type TabId } from './components/layout/NavTabs';
import { PageShell } from './components/layout/PageShell';
import { SessionWorkspace } from './components/layout/SessionWorkspace';
import { SyncBanner } from './components/layout/SyncBanner';
import { NewSessionDialog } from './components/sessions/NewSessionDialog';
import type { SessionTabId } from './components/layout/SessionTabs';
import { Button } from './components/shared/Button';
import { ConfirmDialog } from './components/shared/ConfirmDialog';
import { PlusIcon } from './components/shared/icons';
import { useSessionsStore } from './context/SessionsStoreContext';
import { HomePage } from './pages/HomePage';
import { HistoryPage } from './pages/HistoryPage';
import { HistoryDetailPage } from './pages/HistoryDetailPage';
import { CollectionPage } from './pages/CollectionPage';
import { ProfileDialog } from './components/profile/ProfileDialog';
import { OnboardingTour } from './components/onboarding/OnboardingTour';
import { OnboardingDialog } from './components/onboarding/OnboardingDialog';
import { TutorialsDialog, type Tutorial } from './components/onboarding/TutorialsDialog';
import { GuideOfferDialog } from './components/onboarding/GuideOfferDialog';
import { PracticeCollection } from './components/onboarding/guides/PracticeCollection';
import { PracticeExpenses } from './components/onboarding/guides/PracticeExpenses';
import onboardingStyles from './components/onboarding/OnboardingDialog.module.css';
import type { ScreenShape } from './components/onboarding/steps';
import { useOnboarding } from './hooks/useOnboarding';
import { guideOfferDue, type Guide } from './lib/guideOffer';
import { showsEmptyState } from './lib/writeQueue';
import type { PaidByPicks } from './lib/staging';
import styles from './App.module.css';

/**
 * Top level is three tabs, Home, Collection and History; opening a session
 * swaps the whole shell for that session's workspace, which carries its own
 * inner tabs. Collection can be landed on with one session open, which is
 * where finishing a session goes.
 */
type RealScreen =
  | { kind: 'home' }
  | { kind: 'collection'; openSessionId?: string; previewSettled?: boolean }
  | { kind: 'history' }
  | { kind: 'historyDetail'; sessionId: string }
  | { kind: 'session'; sessionId: string; tab: SessionTabId };

/**
 * A guide's practice screen, in place of the real one (BR-TG18). `back` is where it ends
 * (BR-TG20); `via` is how it started, so focus can go back to "?" (AC-TG4.1).
 */
type Screen =
  RealScreen | { kind: 'practice'; guide: Guide; back: RealScreen; via: 'help' | 'menu' };

/** The three screens that sit under a top-level tab and keep the tab bar. */
const TOP_LEVEL = new Set<Screen['kind']>(['home', 'collection', 'history']);

export default function App() {
  const { sessions, createSession, deleteSession, recordOpen, sync } = useSessionsStore();
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  /** Whether the New Session prompt is open. */
  const [naming, setNaming] = useState(false);
  /** Whether the profile name dialog is open. */
  const [profileOpen, setProfileOpen] = useState(false);
  /** Whether the Tutorials dialog is open. */
  const [tutorialsOpen, setTutorialsOpen] = useState(false);
  /** Remounts the practice when a guide is started again from inside one (BR-TG26). */
  const [guideKey, setGuideKey] = useState(0);
  /** What there is to lose on the open session's Expenses tab, reported by the workspace; else null. */
  const [unsavedNote, setUnsavedNote] = useState<string | null>(null);
  /**
   * The same note, kept where an effect can read it in the render it was reported in. The
   * workspace reports it from an effect, so on the render that arrives at Expenses through
   * Breakdown's Edit the state above is still null, and only this is current.
   */
  const unsavedRef = useRef<string | null>(null);
  const reportUnsaved = useCallback((note: string | null) => {
    unsavedRef.current = note;
    setUnsavedNote(note);
  }, []);
  /** A tutorial waiting on the "Leave without saving?" answer. */
  const [pendingTutorial, setPendingTutorial] = useState<{
    tutorial: Tutorial;
    via: 'help' | 'menu';
    mark: boolean;
  } | null>(null);
  /** Set when a guide that started from "?" ends, so focus goes back to it. */
  const focusHelp = useRef(false);
  /**
   * The Paid By pick each session's Expenses tab last used, by session id (app-fixes item 3).
   * Held here so it outlives the workspace and Back to Home, and in memory only, so a reload
   * forgets it. A Map, never replaced, because only the Expenses card reads it, and only as it
   * mounts.
   */
  const [paidByPicks] = useState<PaidByPicks>(() => new Map());
  const {
    shouldRun: firstLogin,
    markSeen,
    whatsNewDue,
    markWhatsNewSeen,
    guideSeen,
    markGuideSeen,
  } = useOnboarding();
  /** The once-only offer on screen, or a dev preview of one, which writes nothing (US-TG14). */
  const [offer, setOffer] = useState<{ guide: Guide; preview: boolean } | null>(null);
  /** Collection has loaded, and "Already settled?" is neither due nor asked this visit, as the page reports. */
  const [collectionClear, setCollectionClear] = useState(false);
  /** Whether the tour that just ended was a replay or a preview, which "You're all set!" must not mark (BR-TG28). */
  const finishedPreview = useRef(false);

  /**
   * Onboarding is a small sequence rather than a flag: the offer, the tour
   * itself, then the sign-off. Only 'running' puts the tour on screen.
   */
  const [phase, setPhase] = useState<'off' | 'intro' | 'running' | 'done'>('off');

  /**
   * Dev-only: shows "What's new" from the Preview What's new button even if it
   * was already seen. Closing a preview never writes the marker.
   */
  const [whatsNewPreview, setWhatsNewPreview] = useState(false);
  // A returning account sees it once, on whatever screen the app opens to. It
  // waits out the welcome and the tour, which a new account gets instead (BR-W5).
  // A guide is never interrupted (BR-TG10), so a due one opens once the guide has ended.
  const whatsNewOpen =
    phase === 'off' &&
    screen.kind !== 'practice' &&
    offer === null &&
    (whatsNewDue || whatsNewPreview);
  const closeWhatsNew = () => {
    if (whatsNewPreview) setWhatsNewPreview(false);
    else markWhatsNewSeen();
  };

  // A visit is one arrival on a screen or a session's tab (requirements section 3). It's counted
  // rather than keyed, so leaving Collection and coming back is a new visit.
  const visitKey =
    screen.kind === 'session' ? `session:${screen.sessionId}:${screen.tab}` : screen.kind;
  const [visit, setVisit] = useState({ key: visitKey, n: 0 });
  if (visit.key !== visitKey) setVisit({ key: visitKey, n: visit.n + 1 });
  /** The visit a one-time prompt last showed on: no offer follows one on the same visit (BR-TG8). */
  const [promptedVisit, setPromptedVisit] = useState(-1);
  const promptShowing = phase !== 'off' || whatsNewOpen;
  if (promptShowing && promptedVisit !== visit.n) setPromptedVisit(visit.n);
  /**
   * The visit that had unsaved work on Expenses at any point, which is how a visit through
   * Breakdown's Edit looks. It stays set when the edit ends, so saving it doesn't open the offer
   * mid-visit (AC-TG9.5).
   */
  const [unsavedVisit, setUnsavedVisit] = useState(-1);
  if (unsavedNote !== null && unsavedVisit !== visit.n) setUnsavedVisit(visit.n);

  const offerDue = guideOfferDue({
    tab:
      screen.kind === 'session' && screen.tab === 'expenses'
        ? 'expenses'
        : screen.kind === 'collection'
          ? 'collection'
          : null,
    seen: guideSeen,
    prompted: promptShowing || promptedVisit === visit.n,
    dialogOpen:
      profileOpen || tutorialsOpen || naming || pendingTutorial !== null || offer !== null,
    unsaved: unsavedNote !== null || unsavedVisit === visit.n,
    collectionClear,
  });
  useEffect(() => {
    if (offerDue === null) return;
    // The workspace's report arrives in a child effect of this same commit, so the note in state
    // may be a render behind. The ref isn't.
    if (unsavedRef.current !== null) {
      setUnsavedVisit(visit.n);
      return;
    }
    // A dialog a page opened itself (Remove member, Clear All, Undo) counts as open too (BR-TG8).
    if (document.querySelector('dialog[open]')) return;
    setOffer({ guide: offerDue, preview: false });
  }, [offerDue, visit.n]);

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
  /** The tour's session, waiting to be kept or removed once the tour has ended. */
  const [tourCleanup, setTourCleanup] = useState<string | null>(null);

  /**
   * A tour started from the Preview Tour button (dev only) or from Tutorials → App overview,
   * rather than from the account flag. It skips the offer, and its ending is not written back
   * to the account, so an already-onboarded user can rerun it freely. The key remounts the
   * tour, which otherwise keeps its step from the last run.
   */
  const previewing = useRef(false);
  const [tourKey, setTourKey] = useState(0);
  const previewTour = () => {
    previewing.current = true;
    setTourKey((k) => k + 1);
    setScreen({ kind: 'home' });
    setPhase('running');
  };

  const openSession = (sessionId: string) =>
    setScreen({ kind: 'session', sessionId, tab: 'expenses' });
  // A card picked on Home is the one deliberate open (section 4 of the
  // requirements). The tour's own navigation never records one (BR-14).
  const openFromHome = (sessionId: string) => {
    if (phase !== 'running') recordOpen(sessionId);
    openSession(sessionId);
  };
  const startSession = (name: string | null) => {
    // If the create fails before anything is entered, the session is taken off
    // the screen, so leave it for Home rather than for "Session not found". The
    // tour keeps its session as it is, since it narrates the screen it is on.
    const id = createSession(
      name,
      phase === 'running'
        ? undefined
        : () =>
            setScreen((s) => (s.kind === 'session' && s.sessionId === id ? { kind: 'home' } : s)),
    );
    if (phase === 'running' && tourSession.current === null) tourSession.current = id;
    openSession(id);
  };
  // The tour narrates one tap on the highlighted button; a prompt in the middle
  // of it would be a step the tour knows nothing about.
  const newSession = () => (phase === 'running' ? startSession(null) : setNaming(true));

  const endTour = useCallback(
    (completed: boolean) => {
      const id = tourSession.current;
      tourSession.current = null;
      finishedPreview.current = previewing.current;
      if (previewing.current) previewing.current = false;
      else markSeen();

      // A rename box still open as the tour ends saves on blur, but iOS Safari
      // does not blur it when Skip is tapped. Blurring here makes that save
      // land first, and the session is judged below only once it has.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (id !== null) setTourCleanup(id);

      // Whichever way it ended, do not leave them inside a session the tour
      // opened — and finishing it earns a welcome.
      setScreen({ kind: 'home' });
      setPhase(completed ? 'done' : 'off');
    },
    [markSeen],
  );

  /** Maybe later or Escape: for a new account it declines the Expenses offer; a replay writes nothing. */
  const laterAfterTour = () => {
    setPhase('off');
    if (!finishedPreview.current) markGuideSeen('expenses');
  };

  /**
   * Starts a tutorial from "?" or from the Tutorials dialog. Unsaved work on the Expenses tab
   * asks first, as leaving the tab does (BR-TG6, AC-TG5.5).
   */
  const startTutorial = (tutorial: Tutorial, via: 'help' | 'menu', mark = true) => {
    if (screen.kind === 'session' && unsavedNote !== null) {
      setPendingTutorial({ tutorial, via, mark });
    } else launch(tutorial, via, mark);
  };

  const launch = (tutorial: Tutorial, via: 'help' | 'menu', mark = true) => {
    // A tutorial chosen during the first-run tour ends it as Skip does (BR-TG27).
    if (phase === 'running') endTour(false);
    if (tutorial === 'overview') {
      previewTour();
      return;
    }
    // Starting a guide from any way in uses up its once-only offer (BR-TG5). Previews and replays don't.
    if (mark) markGuideSeen(tutorial);
    window.scrollTo(0, 0);
    setGuideKey((k) => k + 1);
    // Restarting during a guide keeps the first origin (BR-TG26), and may switch guides.
    setScreen((s) =>
      s.kind === 'practice'
        ? { ...s, guide: tutorial }
        : { kind: 'practice', guide: tutorial, back: s, via },
    );
  };

  /** Skip, Escape and Done return to the origin; Back to Home goes Home (BR-TG20, BR-TG21). */
  const endGuide = (to: 'origin' | 'home') => {
    if (screen.kind !== 'practice') return;
    const { back, via } = screen;
    // The origin's session may have been deleted on another device meanwhile (BR-TG20).
    const gone = back.kind === 'session' && !sessions.some((s) => s.id === back.sessionId);
    window.scrollTo(0, 0);
    setScreen(to === 'home' || gone ? { kind: 'home' } : back);
    focusHelp.current = to === 'origin' && !gone && via === 'help';
  };

  // After returning through "?", focus goes back to it (AC-TG4.1). The workspace has
  // committed by the time this runs, since a child's DOM is in place before its parent's effects.
  useEffect(() => {
    if (!focusHelp.current) return;
    const id =
      screen.kind === 'session'
        ? 'workspace-help'
        : screen.kind === 'collection'
          ? 'collection-help'
          : null;
    if (id === null) return;
    focusHelp.current = false;
    document.getElementById(id)?.focus();
  }, [screen]);

  // Keep the tour's session if they actually put something in it — silently
  // deleting what someone typed is worse than leaving a session behind. Run as
  // an effect rather than inside endTour so it reads the sessions after any
  // name saved as the tour ended, not the ones endTour was created with.
  useEffect(() => {
    if (tourCleanup === null) return;
    setTourCleanup(null);
    const created = sessions.find((s) => s.id === tourCleanup);
    const untouched =
      created &&
      created.members.length === 0 &&
      created.records.length === 0 &&
      created.name === null;
    if (untouched) deleteSession(tourCleanup);
  }, [tourCleanup, sessions, deleteSession]);

  /**
   * Where the tour sends the app when Next or Back is pressed. A session step
   * needs a session to exist, so the first one creates it — and every later
   * one reuses it, including on the way back in, so stepping backwards over
   * the workspace boundary cannot leave a second session behind.
   */
  const tourNavigate = useCallback(
    (shape: ScreenShape) => {
      if (shape.kind !== 'session') {
        setScreen({ kind: shape.kind });
        return;
      }
      if (screen.kind === 'session') {
        setScreen({ ...screen, tab: shape.tab });
        return;
      }
      // Kept out of the state updater: creating a session is a real write, and
      // React is free to run an updater more than once.
      const id = tourSession.current ?? createSession();
      tourSession.current = id;
      setScreen({ kind: 'session', sessionId: id, tab: shape.tab });
    },
    [createSession, screen],
  );

  // An empty Home carries the action in its own empty state, so the nav row
  // drops it there rather than offering the same button twice. While the load
  // has failed Home shows no empty state, so the nav row keeps the action.
  const homeIsEmpty = showsEmptyState(
    sync.loaded,
    sessions.filter((s) => s.status === 'draft').length,
  );
  const showNewSession = !(screen.kind === 'home' && homeIsEmpty);

  const nav = !TOP_LEVEL.has(screen.kind) ? null : (
    <NavTabs
      active={screen.kind as TabId}
      onChange={(tab) => setScreen({ kind: tab })}
      actions={
        showNewSession && (
          <Button
            variant="primary"
            fab
            aria-label="New Session"
            data-tour="new-session"
            onClick={newSession}
          >
            <PlusIcon />
            <span>+ New Session</span>
          </Button>
        )
      }
    />
  );

  // Whether a load has ever landed. Set while rendering rather than in an
  // effect, so the render that follows the first load already knows.
  const [hasLoaded, setHasLoaded] = useState(false);
  if (!hasLoaded && sync.status !== 'loading') setHasLoaded(true);

  // Nothing can be shown until the first load lands; an empty app would read
  // as lost data rather than as data still on its way. A later reload on
  // Collection, from "Try again" after a failed payment, keeps the page up, so
  // its open cards and the amount typed into a refused form survive and can be
  // saved again once the server's copy shows the payment wasn't recorded.
  // The practice stays up for the same reason: a reload of the real store behind it mustn't
  // replace the guide with a spinner.
  if (
    sync.status === 'loading' &&
    !(hasLoaded && (screen.kind === 'collection' || screen.kind === 'practice'))
  ) {
    return (
      <PageShell header={<Header />}>
        <div className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          Loading your sessions…
        </div>
      </PageShell>
    );
  }

  // The tour only needs the shape of the screen, not which session is open.
  // The tour never runs during a guide, because starting one ends it first.
  const shown = screen.kind === 'practice' ? screen.back : screen;
  const tourScreen: ScreenShape =
    shown.kind === 'session'
      ? { kind: 'session', tab: shown.tab }
      : { kind: shown.kind === 'historyDetail' ? 'history' : shown.kind };

  return (
    <PageShell
      header={
        <Header
          onOpenProfile={() => setProfileOpen(true)}
          onOpenTutorials={() => setTutorialsOpen(true)}
        />
      }
      nav={nav}
    >
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
        <Button variant="primary" onClick={() => setPhase('running')}>
          Take the tour
        </Button>
      </OnboardingDialog>
      <OnboardingTour
        // Prefixed because the tour and the practice are siblings, so two counters at the same
        // number would otherwise give them the same key.
        key={`tour-${tourKey}`}
        run={phase === 'running'}
        screen={tourScreen}
        onNavigate={tourNavigate}
        onDone={endTour}
      />
      <OnboardingDialog
        open={phase === 'done'}
        title="You're all set!"
        message="Next, see how to log an expense with a practice group. Nothing you do there is saved."
        onDismiss={laterAfterTour}
      >
        <Button variant="ghost" onClick={laterAfterTour}>
          Maybe later
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            setPhase('off');
            // The tour's own end has already put the app on Home and scheduled its draft for
            // cleanup, so Home is where the guide starts and where it ends.
            launch('expenses', 'menu', !finishedPreview.current);
          }}
        >
          Show me
        </Button>
      </OnboardingDialog>
      <OnboardingDialog
        open={whatsNewOpen}
        title="What's new in Hati"
        message={
          <span className={onboardingStyles.points}>
            <span>
              <strong>Receipts, item by item.</strong> In Custom Amounts, type a receipt the way
              it&apos;s printed: what each person had, dishes people shared, discounts like PWD or
              senior, and service charges. Hati works out each person&apos;s share.
            </span>
            <span>
              <strong>Guides.</strong> Tap “Need help?” on Expenses or Collection for a quick
              practice run, or open Tutorials in your account menu.
            </span>
          </span>
        }
        onDismiss={closeWhatsNew}
      >
        <Button variant="ghost" onClick={closeWhatsNew}>
          Got it
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            // A previewed What's new writes nothing, so neither does the guide it starts.
            const mark = !whatsNewPreview;
            closeWhatsNew();
            startTutorial('expenses', 'menu', mark);
          }}
        >
          Show me how
        </Button>
      </OnboardingDialog>
      {offer && (
        <GuideOfferDialog
          guide={offer.guide}
          onAnswer={(show) => {
            const { guide, preview } = offer;
            setOffer(null);
            // The origin is the screen the offer opened on (BR-TG20).
            if (show) startTutorial(guide, 'menu', !preview);
            else if (!preview) markGuideSeen(guide);
          }}
        />
      )}
      {naming && (
        <NewSessionDialog
          onCancel={() => setNaming(false)}
          onCreate={(raw) => {
            setNaming(false);
            startSession(raw);
          }}
        />
      )}
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
      {tutorialsOpen && (
        <TutorialsDialog
          onChoose={(tutorial) => {
            setTutorialsOpen(false);
            startTutorial(tutorial, 'menu');
          }}
          onClose={() => setTutorialsOpen(false)}
        />
      )}
      <ConfirmDialog
        open={pendingTutorial !== null}
        title="Leave without saving?"
        message={unsavedNote ?? ''}
        confirmLabel="Discard and leave"
        cancelLabel="Stay"
        destructive
        onCancel={() => setPendingTutorial(null)}
        onConfirm={() => {
          // Launching replaces the workspace, which drops the staged items or ends the
          // saved-item edit with the saved item unchanged, as leaving does today.
          const pending = pendingTutorial;
          setPendingTutorial(null);
          if (pending) launch(pending.tutorial, pending.via, pending.mark);
        }}
      />
      {/* Failures stay in the store, so they show as soon as the guide ends (BR-TG25). */}
      {screen.kind !== 'practice' && (
        <SyncBanner
          sticky={screen.kind === 'collection'}
          showProfileError={screen.kind === 'collection'}
        />
      )}
      {screen.kind === 'home' && (
        <HomePage
          onOpenSession={openFromHome}
          onNewSession={newSession}
          onPreviewTour={import.meta.env.DEV ? previewTour : undefined}
          onPreviewWhatsNew={import.meta.env.DEV ? () => setWhatsNewPreview(true) : undefined}
          onPreviewOffer={
            import.meta.env.DEV ? (guide) => setOffer({ guide, preview: true }) : undefined
          }
          onAskAlreadySettled={
            import.meta.env.DEV
              ? () => setScreen({ kind: 'collection', previewSettled: true })
              : undefined
          }
        />
      )}
      {screen.kind === 'collection' && (
        <CollectionPage
          key={screen.openSessionId ?? ''}
          openSessionId={screen.openSessionId}
          // Never over the tour, What's new or another dialog (BR-W10, E-S11).
          canAsk={
            phase === 'off' &&
            !whatsNewOpen &&
            !profileOpen &&
            !tutorialsOpen &&
            !naming &&
            offer === null
          }
          previewSettled={screen.previewSettled}
          onHelp={phase === 'running' ? undefined : () => startTutorial('collection', 'help')}
          onOfferClear={setCollectionClear}
        />
      )}
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
          paidByPicks={paidByPicks}
          tab={screen.tab}
          onTabChange={(tab) => setScreen({ ...screen, tab })}
          onBack={() => {
            // The session just used is now first on Home, so land where it is (AC-9.4).
            window.scrollTo(0, 0);
            setScreen({ kind: 'home' });
          }}
          // Landing on Collection, with the session open, is the confirmation
          // that the numbers are final and collecting has started.
          onClosed={() => {
            window.scrollTo(0, 0);
            setScreen({ kind: 'collection', openSessionId: screen.sessionId });
          }}
          onHelp={phase === 'running' ? undefined : () => startTutorial('expenses', 'help')}
          onUnsavedChange={reportUnsaved}
        />
      )}
      {screen.kind === 'practice' &&
        (screen.guide === 'expenses' ? (
          <PracticeExpenses key={`guide-${guideKey}`} onEnd={endGuide} />
        ) : (
          <PracticeCollection key={`guide-${guideKey}`} onEnd={endGuide} />
        ))}
    </PageShell>
  );
}
