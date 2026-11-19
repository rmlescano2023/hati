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
  type Placement,
  type Step,
} from 'react-joyride';
import styles from './GuideTour.module.css';

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

export type GuideStep<P> = {
  /** Matches a `data-tour` attribute in the UI. */
  target: string;
  title: string;
  content: string;
  /** Where the tooltip sits against the target. Omitted, Joyride's bottom, flipping to the side with room. */
  placement?: Placement;
  /** Where the target lives: a screen for the first-run tour, a scene for a guide. */
  place: P;
};

type Props<P> = {
  run: boolean;
  /** Stable (a module constant): Joyride deep-compares the steps and resets when they change. */
  steps: readonly GuideStep<P>[];
  /** The live place, so the tour can tell when it has been left behind. */
  place: P;
  /** Whether the live place satisfies a step's. A module-level function. */
  matches: (step: P, live: P) => boolean;
  /** Whether, on step `index`, the reader went exactly where Next would have gone. Omitted: never. */
  wentToNextStep?: (index: number, live: P) => boolean;
  /** Take the app to step `index`'s place before it shows. Next and Back call it. */
  onNavigate: (place: P, index: number) => void;
  /**
   * Called when the tour ends. `completed` is true only when the reader
   * reached the end — skipping or wandering off is an ending too, but not
   * one to congratulate.
   */
  onDone: (completed: boolean) => void;
  /** The last step's primary label. Joyride's "Last" when omitted. */
  lastLabel?: string;
  /** Escape ends the tour as Skip does, unless something on the page already took it. */
  escapeSkips?: boolean;
  /** Every tab but the highlighted one is inert and nudges, keyboard activations included. */
  lockTabs?: boolean;
  /** Where a step's target lands below the top of the screen when the tour scrolls to it. Joyride's 20px when omitted. */
  scrollOffset?: number;
  /**
   * Keeps every tooltip at least this many pixels inside the top and bottom of the screen. It
   * flips to the side of the target with room first, and when neither side has room it slides
   * over the target rather than off the screen. Omitted, Joyride places it as it always has.
   */
  keepOnScreen?: number;
};

/** Joyride's own name for what `floatingOptions.middleware` takes. */
type TooltipMiddleware = NonNullable<NonNullable<Step['floatingOptions']>['middleware']>[number];

/** Slides a tooltip vertically so it lies between `margin` from the top and the bottom of the screen. */
const keepInBand = (margin: number): TooltipMiddleware => ({
  name: 'keepInBand',
  fn: ({ y, rects, elements }) => {
    // Floating UI's y is measured from the tooltip's offset parent. The reference sits at
    // `rects.reference.y` there and at its bounding box on screen, which converts one to the other.
    const toScreen = elements.reference.getBoundingClientRect().top - rects.reference.y;
    const screenTop = y + toScreen;
    // The top wins if the band is too short, so a tooltip's title is never what's lost.
    const max = Math.max(margin, window.innerHeight - margin - rects.floating.height);
    // A target the reader's action removed leaves nothing to sit beside. The bottom of the
    // band keeps the tooltip's buttons in reach and the page's own scroll to the result clear.
    const gone = 'isConnected' in elements.reference && !elements.reference.isConnected;
    const wanted = gone ? max : screenTop;
    return { y: y + (Math.min(Math.max(wanted, margin), max) - screenTop) };
  },
});

/** For a tour that never follows the reader's own navigation along. */
const never = () => false;

/**
 * The walkthrough engine, shared by the first-run tour and the guides.
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
export function GuideTour<P>({
  run,
  steps: guideSteps,
  place,
  matches,
  wentToNextStep,
  onNavigate,
  onDone,
  lastLabel,
  escapeSkips,
  lockTabs,
  scrollOffset,
  keepOnScreen,
}: Props<P>) {
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
      guideSteps.map((s, i) => ({
        target: `[data-tour="${s.target}"]`,
        title: s.title,
        // The same choice Joyride makes for a continuous tour without
        // progress: its "last" label on the final step, "next" elsewhere.
        content: (
          <StepContent
            text={s.content}
            primary={
              i === guideSteps.length - 1 ? (lastLabel ?? defaultLocale.last) : defaultLocale.next
            }
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
        ...(lastLabel ? { locale: { ...defaultLocale, last: lastLabel } } : {}),
        // Joyride's Escape advances the step. A guide wants it to end instead, which the
        // listener below does, so Joyride's own is switched off.
        ...(escapeSkips ? { dismissKeyAction: false as const } : {}),
        ...(scrollOffset !== undefined ? { scrollOffset } : {}),
        ...(s.placement ? { placement: s.placement } : {}),
        ...(keepOnScreen !== undefined
          ? {
              floatingOptions: {
                // Flip by the room that is really there, so the side with room is the one picked.
                flipOptions: {
                  padding: {
                    top: keepOnScreen,
                    right: 20,
                    bottom: keepOnScreen,
                    left: 20,
                  },
                },
                middleware: [keepInBand(keepOnScreen)],
              },
            }
          : {}),
      })),
    [guideSteps, lastLabel, escapeSkips, scrollOffset, keepOnScreen],
  );

  // Next does the navigating, so a screen that does not match the current step
  // means the user went somewhere themselves. If it is where Next would have
  // gone, as when they tap the highlighted New Session, follow along; anywhere
  // else, let them.
  useEffect(() => {
    if (!run || done.current) return;
    const current = guideSteps[index];
    if (!current || matches(current.place, place)) return;
    if ((wentToNextStep ?? never)(index, place)) {
      setIndex(index + 1);
      return;
    }

    done.current = true;
    finish.current(false);
  }, [run, place, index, guideSteps, matches, wentToNextStep]);

  // The reader's own action can resize the target, as opening a card or a form does, which may
  // push it off the top of the screen or its tooltip off the bottom. The tooltip follows the
  // target by itself; the page doesn't, so it is scrolled back to where a step puts its target.
  useEffect(() => {
    if (!run || scrollOffset === undefined || typeof ResizeObserver === 'undefined') return;
    const target = document.querySelector(`[data-tour="${guideSteps[index].target}"]`);
    if (!target) return;
    let height = target.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      // A removed target reports no size, and there is nothing left to scroll to.
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      if (Math.abs(rect.height - height) < 2) return;
      height = rect.height;
      // Joyride leaves the target's top a spotlight padding (10px) below the offset.
      const delta = rect.top - (scrollOffset + 10);
      if (Math.abs(delta) > 2) window.scrollBy({ top: delta });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [run, index, guideSteps, scrollOffset]);

  // A step whose target is not mounted shows nothing at all, which reads as a
  // dead tour rather than as a bug — that is exactly how the Summary step
  // failed. The tour cannot fix it at runtime, but it can refuse to fail
  // quietly while there is a developer watching.
  useEffect(() => {
    if (!import.meta.env.DEV || !run || done.current) return;
    const current = guideSteps[index];
    if (!current || !matches(current.place, place)) return;

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
  }, [run, index, place, guideSteps, matches]);

  // Testers tapped the tabs to move on and the tour seemed frozen, because a
  // tap on the dimmed screen does nothing. A tap on a tab other than the
  // highlighted one now says how to continue instead. It is stopped before the
  // tab sees it, so one reached through the spotlight's padding can't change
  // the screen and end the tour.
  useEffect(() => {
    if (!run || done.current) return;

    const onClick = (event: MouseEvent) => {
      // A keyboard activation has no click count; it behaves as before, unless the tabs are
      // locked, where it nudges like a tap does.
      if (event.detail === 0 && !lockTabs) return;
      const target = event.target as Element;
      // `.react-joyride__overlay` is Joyride's own class, not a public API. If
      // a later version renames it, the nudge stops but the tour still works.
      if (!target.closest('.react-joyride__overlay') && !target.closest('[role="tab"]')) return;

      const tab =
        event.detail === 0
          ? target.closest<HTMLElement>('[role="tab"]')
          : [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((el) => {
              const r = el.getBoundingClientRect();
              return (
                event.clientX >= r.left &&
                event.clientX <= r.right &&
                event.clientY >= r.top &&
                event.clientY <= r.bottom
              );
            });
      if (!tab) return;
      const highlighted = document.querySelector(`[data-tour="${guideSteps[index].target}"]`);
      if (tab === highlighted) return;

      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(nudgeTimer.current);
      setNudging(true);
      nudgeTimer.current = window.setTimeout(() => setNudging(false), NUDGE_MS);
    };

    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [run, index, guideSteps, lockTabs]);

  // A guide ends on Escape as Skip does. React's own key handlers run before this document
  // listener, so a box that takes Escape for itself (the rename box) keeps it, and a native
  // dialog open over the guide (Remove member, Clear All) takes it for its own cancel.
  useEffect(() => {
    if (!run || !escapeSkips) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || done.current) return;
      if (document.querySelector('dialog[open]')) return;
      done.current = true;
      finish.current(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [run, escapeSkips]);

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

      if (next >= guideSteps.length) {
        if (done.current) return;
        done.current = true;
        finish.current(true);
        return;
      }
      // Back is not offered on the first step, so this should not come up.
      if (next < 0) return;

      // Take the app where that step lives, then move to it. Doing the
      // navigation first means the target exists by the time the step shows.
      navigate.current(guideSteps[next].place, next);
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
