import { GuideTour, type GuideStep } from './GuideTour';
import { TOUR_STEPS, screenMatches, wentToNextStep, type ScreenShape } from './steps';

// The first-run tour's steps in the engine's shape, built once so their identity never changes.
const STEPS: GuideStep<ScreenShape>[] = TOUR_STEPS.map(({ screen, ...step }) => ({
  ...step,
  place: screen,
}));

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
 * The first-run walkthrough: the guide engine over `TOUR_STEPS`, with Joyride's own
 * Escape behaviour kept as it was (the guides alone make Escape skip).
 */
export function OnboardingTour({ run, screen, onNavigate, onDone }: Props) {
  return (
    <GuideTour
      run={run}
      steps={STEPS}
      place={screen}
      matches={screenMatches}
      wentToNextStep={wentToNextStep}
      onNavigate={onNavigate}
      onDone={onDone}
    />
  );
}
