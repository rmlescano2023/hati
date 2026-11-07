import { useState } from 'react';
import { Button } from '../shared/Button';
import { OnboardingDialog } from '../onboarding/OnboardingDialog';
import type { CollectionCard } from '../../lib/collection';
import { formatLocalDate } from '../../lib/format';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import styles from './AlreadySettledDialog.module.css';

type Props = {
  /** The sessions finished before Collection that can still be marked, newest first. */
  offers: CollectionCard[];
  /** `settle` is the session ids to mark as settled, empty for "No". */
  onAnswer: (answer: { settle: string[] }) => void;
};

/**
 * The one-time question on Collection: were the sessions finished before it
 * already settled? Nothing recorded payments then, so without it every old
 * session would show as unpaid. Answering "No", or Escape, leaves them to be
 * tracked; the choice list is for when only some were settled.
 */
export function AlreadySettledDialog({ offers, onAnswer }: Props) {
  const [step, setStep] = useState<'question' | 'choose'>('question');
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const n = offers.length;

  if (step === 'question') {
    return (
      <OnboardingDialog
        open
        stacked
        title="Already settled?"
        message={
          n === 1
            ? 'You have 1 session finished before Collection. Was it already settled?'
            : `You have ${n} sessions finished before Collection. Were they already settled?`
        }
        onDismiss={() => onAnswer({ settle: [] })}
      >
        <Button variant="ghost" onClick={() => onAnswer({ settle: [] })}>
          No, track them
        </Button>
        <Button onClick={() => setStep('choose')}>Let me choose</Button>
        <Button
          variant="primary"
          autoFocus
          onClick={() => onAnswer({ settle: offers.map((c) => c.session.id) })}
        >
          Yes, all settled
        </Button>
      </OnboardingDialog>
    );
  }

  const back = () => {
    setTicked(new Set());
    setStep('question');
  };

  return (
    <OnboardingDialog
      open
      stacked
      title="Which were already settled?"
      message={
        <fieldset className={styles.list}>
          <legend className={styles.srOnly}>Sessions finished before Collection</legend>
          {offers.map(({ session }) => (
            <label key={session.id} className={styles.row}>
              <input
                type="checkbox"
                checked={ticked.has(session.id)}
                onChange={(e) =>
                  setTicked((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(session.id);
                    else next.delete(session.id);
                    return next;
                  })
                }
              />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{sessionDisplayTitle(session)}</span>
                <span className={styles.rowMeta}>
                  {`Finished ${formatLocalDate(session.closedAt ?? session.createdAt)}`}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      }
      onDismiss={back}
    >
      <Button variant="ghost" onClick={back}>
        Back
      </Button>
      <Button
        variant="primary"
        disabled={ticked.size === 0}
        onClick={() => onAnswer({ settle: [...ticked] })}
      >
        {`Mark ${ticked.size} as settled`}
      </Button>
    </OnboardingDialog>
  );
}
