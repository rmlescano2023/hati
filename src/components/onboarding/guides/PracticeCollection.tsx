import { useCallback, useEffect, useRef, useState } from 'react';
import { GuideTour } from '../GuideTour';
import { CollectionPage } from '../../../pages/CollectionPage';
import { PracticeProfileProvider } from '../../../context/ProfileContext';
import { PracticeSessionsProvider, useSessionsStore } from '../../../context/SessionsStoreContext';
import { isFullyPaid } from '../../../lib/collection';
import {
  PRACTICE_BEACH_ID,
  collectionScenes,
  type CollectionScene,
  type CollectionSceneId,
} from './collectionScenes';
import { COLLECTION_STEPS } from './collectionSteps';
import { GUIDE_SCREEN_MARGIN, GUIDE_SCROLL_OFFSET, sameScene, targetShown } from './sceneChecks';

/** C6: Mark all there does what Next would, so the guide follows the reader on to C7. */
const MARK_ALL_STEP = COLLECTION_STEPS.findIndex((s) => s.target === 'collection-mark-all');

/** The reader reached the next step's scene on their own, which only Mark all at C6 does. */
const reachedNext = (index: number, live: CollectionSceneId) =>
  COLLECTION_STEPS[index + 1]?.place === live;

type Props = {
  /** Ends the guide: back where it started (BR-TG20). */
  onEnd: (to: 'origin' | 'home') => void;
};

/**
 * The "Tracking payments" guide's screen, which replaces the real Collection while it runs
 * (BR-TG18). The scene is what's on screen, and the guide walks through three of them.
 */
export function PracticeCollection({ onEnd }: Props) {
  const [scenes] = useState(() => collectionScenes(new Date()));
  const [scene, setScene] = useState<CollectionSceneId>(COLLECTION_STEPS[0].place);
  /** Bumped to start the current scene again as designed (BR-TG14). */
  const [generation, setGeneration] = useState(0);
  /** The step Next or Back last moved to. */
  const step = useRef(0);

  // Moving to another scene starts it as designed, and moving within one keeps what was done
  // (BR-TG13). The exception is a step whose target the reader's actions have removed (BR-TG14).
  const navigate = (place: CollectionSceneId, index: number) => {
    step.current = index;
    if (place !== scene) {
      setScene(place);
      return;
    }
    if (!targetShown(COLLECTION_STEPS[index].target)) setGeneration((g) => g + 1);
  };

  // Beach trip paid in full at C6 is scene K3, so moving there lets the tour follow along
  // (`reachedNext`) rather than leave C6's tooltip pointing at a card that has gone to Settled.
  const onBeachPaid = useCallback((paid: boolean) => {
    if (paid && step.current === MARK_ALL_STEP) setScene('K3');
  }, []);

  return (
    <>
      {/* The key remounts the memory store and the page from the scene's seed. */}
      <PracticeCollectionScene
        key={`${scene}:${generation}`}
        scene={scenes[scene]}
        onBeachPaid={onBeachPaid}
      />
      {/* Outside the keyed subtree, so a scene change never restarts the tour itself. */}
      <GuideTour
        run
        steps={COLLECTION_STEPS}
        place={scene}
        matches={sameScene}
        wentToNextStep={reachedNext}
        onNavigate={navigate}
        onDone={() => onEnd('origin')}
        lastLabel="Done"
        escapeSkips
        scrollOffset={GUIDE_SCROLL_OFFSET}
        keepOnScreen={GUIDE_SCREEN_MARGIN}
      />
    </>
  );
}

type SceneProps = {
  scene: CollectionScene;
  /** Whether Beach trip is paid in full, reported whenever it changes. */
  onBeachPaid: (paid: boolean) => void;
};

/**
 * One scene's practice Collection, with its own store and profile ("Ana"), so nothing it does
 * can reach the real ones (BR-TG3). Exported for the render test.
 */
export function PracticeCollectionScene({ scene, onBeachPaid }: SceneProps) {
  return (
    <PracticeSessionsProvider seed={scene.sessions}>
      <PracticeProfileProvider>
        <PaidWatch sessionId={PRACTICE_BEACH_ID} onChange={onBeachPaid} />
        {/* Never asks "Already settled?" (AC-TG7.7). No onHelp, so no "Need help?" inside practice. */}
        <CollectionPage openSessionId={scene.openSessionId} canAsk={false} />
      </PracticeProfileProvider>
    </PracticeSessionsProvider>
  );
}

/** Reports whether a practice session is paid in full, whenever that changes. Renders nothing. */
function PaidWatch({
  sessionId,
  onChange,
}: {
  sessionId: string;
  onChange: (paid: boolean) => void;
}) {
  const { sessions } = useSessionsStore();
  const session = sessions.find((s) => s.id === sessionId);
  const paid = session !== undefined && isFullyPaid(session);
  useEffect(() => onChange(paid), [paid, onChange]);
  return null;
}
