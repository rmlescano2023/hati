import { useCallback, useEffect, useRef, useState } from 'react';
import { GuideTour } from '../GuideTour';
import { SessionWorkspace } from '../../layout/SessionWorkspace';
import { PracticeProfileProvider } from '../../../context/ProfileContext';
import { PracticeSessionsProvider, useSessionsStore } from '../../../context/SessionsStoreContext';
import { todayIso } from '../../../lib/format';
import type { PaidByPicks } from '../../../lib/staging';
import { expensesScenes, type ExpensesScene, type ExpensesSceneId } from './expensesScenes';
import { EXPENSES_STEPS } from './expensesSteps';
import { GUIDE_SCREEN_MARGIN, GUIDE_SCROLL_OFFSET, sameScene, targetShown } from './sceneChecks';

type Props = {
  /** Ends the guide: where it started, or Home for "← Back to Home" (BR-TG20, BR-TG21). */
  onEnd: (to: 'origin' | 'home') => void;
};

/**
 * The "Logging expenses" guide's screen, which replaces the real one while it runs (BR-TG18).
 * The scene is what's on screen, and the guide walks through four of them.
 */
export function PracticeExpenses({ onEnd }: Props) {
  const [scenes] = useState(() => expensesScenes(todayIso()));
  const [scene, setScene] = useState<ExpensesSceneId>(EXPENSES_STEPS[0].place);
  /** Bumped to start the current scene again as designed (BR-TG14). */
  const [generation, setGeneration] = useState(0);
  /** Whether every member the scene seeded is still there, as `MembersWatch` last reported. */
  const membersIntact = useRef(true);

  const onMembersIntact = useCallback((intact: boolean) => {
    membersIntact.current = intact;
  }, []);

  // Moving to another scene starts it as designed, and moving within one keeps what was typed
  // (BR-TG13). The exception is a scene the reader broke (BR-TG14): a seeded member gone, or the
  // next step's target no longer shown, so the step would have nothing to point at.
  const navigate = (place: ExpensesSceneId, index: number) => {
    if (place !== scene) {
      setScene(place);
      return;
    }
    if (!membersIntact.current || !targetShown(EXPENSES_STEPS[index].target)) {
      setGeneration((g) => g + 1);
    }
  };

  return (
    <>
      {/* The key remounts the memory store, the form and the staged list from the scene's seed. */}
      <PracticeScene
        key={`${scene}:${generation}`}
        scene={scenes[scene]}
        onBackToHome={() => onEnd('home')}
        onMembersIntact={onMembersIntact}
      />
      {/* Outside the keyed subtree, so a scene change never restarts the tour itself. */}
      <GuideTour
        run
        steps={EXPENSES_STEPS}
        place={scene}
        matches={sameScene}
        onNavigate={navigate}
        onDone={() => onEnd('origin')}
        lastLabel="Done"
        escapeSkips
        lockTabs
        scrollOffset={GUIDE_SCROLL_OFFSET}
        keepOnScreen={GUIDE_SCREEN_MARGIN}
      />
    </>
  );
}

type SceneProps = {
  scene: ExpensesScene;
  onBackToHome: () => void;
  /** Whether every member the scene seeded is still in the practice session. */
  onMembersIntact: (intact: boolean) => void;
};

/**
 * One scene's practice workspace, with its own store and profile, so nothing it does can reach
 * the real ones (BR-TG3). Exported for the render test.
 */
export function PracticeScene({ scene, onBackToHome, onMembersIntact }: SceneProps) {
  // The practice's own Paid By memory, never the app's (AC-TG3.4).
  const [picks] = useState<PaidByPicks>(() => new Map([[scene.session.id, scene.paidBy]]));
  return (
    <PracticeSessionsProvider seed={[scene.session]}>
      <PracticeProfileProvider>
        <MembersWatch
          sessionId={scene.session.id}
          members={scene.session.members}
          onChange={onMembersIntact}
        />
        <SessionWorkspace
          sessionId={scene.session.id}
          paidByPicks={picks}
          tab="expenses"
          // Only Expenses works in practice; the tour's lockTabs nudges on the others (BR-TG22).
          onTabChange={() => {}}
          onBack={onBackToHome}
          // Unreachable: Summary never shows in practice.
          onClosed={() => {}}
          practice={{ seed: scene.form, initialStaged: scene.staged }}
        />
      </PracticeProfileProvider>
    </PracticeSessionsProvider>
  );
}

/** Reports whether the practice session still has every member its scene seeded. Renders nothing. */
function MembersWatch({
  sessionId,
  members,
  onChange,
}: {
  sessionId: string;
  members: string[];
  onChange: (intact: boolean) => void;
}) {
  const { sessions } = useSessionsStore();
  const current = sessions.find((s) => s.id === sessionId)?.members ?? [];
  const intact = members.every((m) => current.includes(m));
  useEffect(() => onChange(intact), [intact, onChange]);
  return null;
}
