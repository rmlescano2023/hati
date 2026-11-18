import { Button } from '../shared/Button';
import type { Guide } from '../../lib/guideOffer';
import { OnboardingDialog } from './OnboardingDialog';

const OFFERS: Record<Guide, { title: string; message: string }> = {
  expenses: {
    title: 'Learn how to log a purchase?',
    message:
      'A quick practice run, about two minutes, with made-up people. Nothing you do in it is saved. You can find it any time under “Need help?” on this tab, or Tutorials in your account menu.',
  },
  collection: {
    title: 'Learn how to track payments?',
    message:
      'A quick practice run with made-up sessions: who owes you, recording payments, and undoing one. Nothing you do in it is saved. You can find it any time under “Need help?” on this page, or Tutorials in your account menu.',
  },
};

/** A guide's once-only offer (BR-TG8). Escape is Not now. */
export function GuideOfferDialog({
  guide,
  onAnswer,
}: {
  guide: Guide;
  onAnswer: (show: boolean) => void;
}) {
  const { title, message } = OFFERS[guide];
  return (
    <OnboardingDialog open title={title} message={message} onDismiss={() => onAnswer(false)}>
      <Button variant="ghost" onClick={() => onAnswer(false)}>
        Not now
      </Button>
      <Button variant="primary" onClick={() => onAnswer(true)}>
        Show me
      </Button>
    </OnboardingDialog>
  );
}
