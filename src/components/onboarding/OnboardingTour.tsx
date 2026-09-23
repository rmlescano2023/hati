import { useEffect, useMemo, useRef, useState } from 'react';
import { Joyride, EVENTS, STATUS, type ButtonType, type EventData, type Step } from 'react-joyride';
import { TOUR_STEPS, screenMatches, type ScreenShape } from './steps';

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

  // Kept in a ref so the navigation effect does not re-run when the parent
  // happens to hand over a new function identity.
  const finish = useRef(onDone);
  finish.current = onDone;
  const navigate = useRef(onNavigate);
  navigate.current = onNavigate;

  const steps = useMemo<Step[]>(
    () =>
      TOUR_STEPS.map((s) => ({
        target: `[data-tour="${s.target}"]`,
        title: s.title,
        content: s.content,
        // Every step offers Next; 'primary' is its name in this library.
        buttons: ['skip', 'primary'] as ButtonType[],
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
  // means the user went somewhere themselves. Let them.
  useEffect(() => {
    if (!run || done.current) return;
    const current = TOUR_STEPS[index];
    if (!current || screenMatches(current.screen, screen)) return;

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

  const handleEvent = (data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      if (done.current) return;
      done.current = true;
      finish.current(data.status === STATUS.FINISHED);
      return;
    }

    if (data.type === EVENTS.STEP_AFTER) {
      const next = data.index + 1;
      if (next >= TOUR_STEPS.length) {
        if (done.current) return;
        done.current = true;
        finish.current(true);
        return;
      }
      // Take the app where the next step lives, then move to it. Doing the
      // navigation first means the target exists by the time the step shows.
      navigate.current(TOUR_STEPS[next].screen);
      setIndex(next);
    }
  };

  if (!run) return null;

  return (
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
        buttonPrimary: { fontWeight: 600 },
      }}
    />
  );
}
