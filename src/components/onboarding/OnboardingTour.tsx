import { useEffect, useMemo, useRef, useState } from 'react';
import { Joyride, EVENTS, STATUS, type ButtonType, type EventData, type Step } from 'react-joyride';
import { TOUR_STEPS, screenMatches, type ScreenShape } from './steps';

type Props = {
  run: boolean;
  /** The live screen, so the tour can follow real navigation. */
  screen: ScreenShape;
  /** Called when the tour finishes, is skipped, or is abandoned. */
  onDone: () => void;
};

/**
 * The first-run walkthrough.
 *
 * It is driven by the app's own navigation rather than by clicking through a
 * fixed list: each step names the screen its target lives on, and an action
 * step advances only once the user has actually navigated to what comes next.
 * That is why `stepIndex` is controlled here rather than left to the library.
 *
 * Wandering somewhere no step expects ends the tour instead of trying to
 * reconcile arbitrary navigation back into the sequence — being trapped in a
 * tutorial is worse than missing the end of one.
 */
export function OnboardingTour({ run, screen, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const done = useRef(false);

  // Kept in a ref so the navigation effect does not re-run when the parent
  // happens to hand over a new function identity.
  const finish = useRef(onDone);
  finish.current = onDone;

  const steps = useMemo<Step[]>(
    () =>
      TOUR_STEPS.map((s) => ({
        target: `[data-tour="${s.target}"]`,
        title: s.title,
        content: s.content,
        // An action step asks the user to click the thing it is pointing at,
        // so it must not offer a button that skips past doing it. 'primary'
        // is the Next/Finish button in this library's vocabulary.
        buttons: (s.waitsForAction ? ['skip'] : ['skip', 'primary']) as ButtonType[],
        blockTargetInteraction: false,
        // Otherwise each step waits behind a small pulsing dot that has to be
        // found and clicked first. A walkthrough should speak up on its own.
        skipBeacon: true,
      })),
    [],
  );

  // Follow real navigation: advance when the screen becomes what a later step
  // wants, and end the tour if it goes somewhere no step expects.
  useEffect(() => {
    if (!run || done.current) return;

    const current = TOUR_STEPS[index];
    if (current && screenMatches(current.screen, screen)) return;

    const next = TOUR_STEPS[index + 1];
    if (next && screenMatches(next.screen, screen)) {
      setIndex(index + 1);
      return;
    }

    done.current = true;
    finish.current();
  }, [run, screen, index]);

  const handleEvent = (data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      if (done.current) return;
      done.current = true;
      finish.current();
      return;
    }

    // Only explanation steps advance themselves; action steps wait for the
    // screen to change instead.
    if (data.type === EVENTS.STEP_AFTER && !TOUR_STEPS[data.index]?.waitsForAction) {
      const next = data.index + 1;
      if (next >= TOUR_STEPS.length) {
        if (done.current) return;
        done.current = true;
        finish.current();
      } else {
        setIndex(next);
      }
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
    />
  );
}
