import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Joyride,
  ACTIONS,
  EVENTS,
  STATUS,
  defaultLocale,
  type ButtonType,
  type EventData,
  type Step,
} from 'react-joyride';
import { TOUR_STEPS, screenMatches, wentToNextStep, type ScreenShape } from './steps';
import styles from './OnboardingTour.module.css';

/** How long the "Tap Next" nudge stays after the last stray tap. */
const NUDGE_MS = 3000;

// The tooltip renders through a portal, which keeps context, so the step text
// can follow the nudge while `steps` keeps one identity. That matters because
// Joyride deep-compares `steps` and resets when they change.
const NudgeContext = createContext(false);

/**
 * A step's text, with a live region below it for the nudge. `primary` is the
 * label on the step's primary button, so the nudge names the button the
 * reader can actually see.
 */
function StepContent({ text, primary }: { text: string; primary: ReactNode }) {
  const nudging = useContext(NudgeContext);
  return (
    <>
      {text}
      {/* Always mounted and only gaining text, so the nudge is announced once
          rather than on every tap that restarts it. */}
      <span className={styles.status} role="status">
        {nudging && <span className={styles.nudge}>Tap {primary} to continue</span>}
      </span>
    </>
  );
}

type Props = {
  run: boolean;
  /** The live screen, so the tour can tell when it has been left behind. */
  screen: ScreenShape;
  /** Take the app to the screen a step needs. Next calls this. */
  onNavigate: (screen: ScreenShape) => void;
  /**
   * Called when the tour ends. `completed` is true only when the reader
   * reached the end — skipping or wandering off is an ending too, but not
   * one to congratulate.
   */
  onDone: (completed: boolean) => void;
};

/**
 * The first-run walkthrough.
 *
 * Next carries the reader through: each step names the screen it needs, and
 * advancing takes the app there. Reading the tour should not require working
 * out which control to press, and someone who stops halfway should not be
 * left mid-session.
 *
 * `stepIndex` is controlled here because advancing is two things at once —
 * moving the step and moving the app — which the library cannot do alone.
 *
 * Wandering off on their own still ends the tour rather than trying to
 * reconcile arbitrary navigation back into the sequence; being trapped in a
 * tutorial is worse than missing the end of one.
 */
export function OnboardingTour({ run, screen, onNavigate, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const done = useRef(false);
  const [nudging, setNudging] = useState(false);
  const nudgeTimer = useRef<number | undefined>(undefined);

  // Kept in a ref so the navigation effect does not re-run when the parent
  // happens to hand over a new function identity.
  const finish = useRef(onDone);
  finish.current = onDone;
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;

  const steps = useMemo<Step[]>(
    () =>
      TOUR_STEPS.map((s, i) => ({
        target: `[data-tour="${s.target}"]`,
        title: s.title,
        // The same choice Joyride makes for a continuous tour without
        // progress: its "last" label on the final step, "next" elsewhere.
        content: (
          <StepContent
            text={s.content}
            primary={i === TOUR_STEPS.length - 1 ? defaultLocale.last : defaultLocale.next}
          />
        ),
        // Every step offers Next ('primary' is its name in this library) and,
        // from the second onwards, Back — a tutorial you can only go forwards
        // through punishes anyone who reads a step too quickly.
        buttons: (i === 0
          ? ['skip', 'primary']
          : ['back', 'skip', 'primary']) as ButtonType[],
        blockTargetInteraction: false,
        // A stray click on the dimmed area used to end the tour, and left the
        // overlay behind so the page appeared frozen. Leaving is deliberate
        // now: the Skip button, or Escape.
        overlayClickAction: false,
        // Otherwise each step waits behind a small pulsing dot that has to be
        // found and clicked first. A walkthrough should speak up on its own.
        skipBeacon: true,
      })),
    [],
  );

  // Next does the navigating, so a screen that does not match the current step
  // means the user went somewhere themselves. If it is where Next would have
  // gone, as when they tap the highlighted New Session, follow along; anywhere
  // else, let them.
  useEffect(() => {
    if (!run || done.current) return;
    const current = TOUR_STEPS[index];
    if (!current || screenMatches(current.screen, screen)) return;
    if (wentToNextStep(index, screen)) {
      setIndex(index + 1);
      return;
    }

    done.current = true;
    finish.current(false);
  }, [run, screen, index]);

  // A step whose target is not mounted shows nothing at all, which reads as a
  // dead tour rather than as a bug — that is exactly how the Summary step
  // failed. The tour cannot fix it at runtime, but it can refuse to fail
  // quietly while there is a developer watching.
  useEffect(() => {
    if (!import.meta.env.DEV || !run || done.current) return;
    const current = TOUR_STEPS[index];
    if (!current || !screenMatches(current.screen, screen)) return;

    // One frame's grace for the screen the step asked for to render.
    const id = requestAnimationFrame(() => {
      if (!document.querySelector(`[data-tour="${current.target}"]`)) {
        console.warn(
          `[tour] step ${index} ("${current.title}") targets [data-tour="${current.target}"], ` +
            'which is not on screen. The step will not appear.',
        );
      }
    });
    return () => cancelAnimationFrame(id);
  }, [run, index, screen]);

  // Testers tapped the tabs to move on and the tour seemed frozen, because a
  // tap on the dimmed screen does nothing. A tap on a tab other than the
  // highlighted one now says how to continue instead. It is stopped before the
  // tab sees it, so one reached through the spotlight's padding can't change
  // the screen and end the tour.
  useEffect(() => {
    if (!run || done.current) return;

    const onClick = (event: MouseEvent) => {
      // A keyboard activation has no click count; it behaves as before.
      if (event.detail === 0) return;
      const target = event.target as Element;
      // `.react-joyride__overlay` is Joyride's own class, not a public API. If
      // a later version renames it, the nudge stops but the tour still works.
      if (!target.closest('.react-joyride__overlay') && !target.closest('[role="tab"]')) return;

      const tab = [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((el) => {
        const r = el.getBoundingClientRect();
        return (
          event.clientX >= r.left &&
          event.clientX <= r.right &&
          event.clientY >= r.top &&
          event.clientY <= r.bottom
        );
      });
      if (!tab) return;
      const highlighted = document.querySelector(`[data-tour="${TOUR_STEPS[index].target}"]`);
      if (tab === highlighted) return;

      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(nudgeTimer.current);
      setNudging(true);
      nudgeTimer.current = window.setTimeout(() => setNudging(false), NUDGE_MS);
    };

    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [run, index]);

  // Next and Back hide the nudge; the cleanup also clears its timer when the
  // tour unmounts.
  useEffect(() => {
    setNudging(false);
    return () => window.clearTimeout(nudgeTimer.current);
  }, [index]);

  const handleEvent = (data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      if (done.current) return;
      done.current = true;
      finish.current(data.status === STATUS.FINISHED);
      return;
    }

    if (data.type === EVENTS.STEP_AFTER) {
      // Back and Next arrive as the same event; only the action separates them.
      const step = data.action === ACTIONS.PREV ? -1 : 1;
      const next = data.index + step;

      if (next >= TOUR_STEPS.length) {
        if (done.current) return;
        done.current = true;
        finish.current(true);
        return;
      }
      // Back is not offered on the first step, so this should not come up.
      if (next < 0) return;

      // Take the app where that step lives, then move to it. Doing the
      // navigation first means the target exists by the time the step shows.
      navigate.current(TOUR_STEPS[next].screen);
      setIndex(next);
    }
  };

  if (!run) return null;

  return (
    <NudgeContext.Provider value={nudging}>
      <Joyride
        steps={steps}
        stepIndex={index}
        // Without this the component mounts and sits idle: the tour never
        // starts, with nothing logged to say why.
        run={run}
        continuous
        onEvent={handleEvent}
        options={{
          primaryColor: '#4ea87c',
          backgroundColor: '#1c1f25',
          arrowColor: '#1c1f25',
          textColor: '#ecebe7',
          overlayColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 10_000,
        }}
        styles={{
          // Skip is the way out, not the way forward: it should be findable
          // without competing with the button that continues.
          buttonSkip: { color: '#6c727d', fontSize: 13 },
          buttonBack: { color: '#a8adb7', fontSize: 13, marginRight: 4 },
          buttonPrimary: { fontWeight: 600 },
        }}
      />
    </NudgeContext.Provider>
  );
}
