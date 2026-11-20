import { useState } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import { stopTrackingMessage } from '../../lib/joinedSessions';
import { sessionDisplayTitle } from '../../lib/sessionLabel';
import type { Session } from '../../types';

type Props = {
  session: Session;
  /** `link` beside "You joined as" on a card; `button` in History detail's header. */
  variant: 'link' | 'button';
  className?: string;
  /** Called once the user has confirmed and the session is off the screen, so the page can say so. */
  onLeft: (title: string) => void;
};

/**
 * How a joined member leaves a session: it confirms first, then the session is gone from their
 * Collection and History at once. The organizer keeps it and every payment recorded on it, and
 * the member can join again while the link still works (AC-12.1 to AC-12.3).
 */
export function StopTrackingButton({ session, variant, className, onLeft }: Props) {
  const { leaveSession } = useSessionsStore();
  const [confirming, setConfirming] = useState(false);
  const title = sessionDisplayTitle(session);
  const label = `Stop tracking ${title}`;

  return (
    <>
      <Button
        data-stop-tracking={session.id}
        {...(variant === 'link'
          ? { variant: 'ghost', size: 'sm', className: 'link-action' }
          : { size: 'lg', className })}
        aria-label={label}
        onClick={() => setConfirming(true)}
      >
        Stop tracking
      </Button>
      <ConfirmDialog
        open={confirming}
        title={`Stop tracking “${title}”?`}
        // Said only when something is waiting: what the member said they paid is withdrawn with them (AC-29.2).
        message={stopTrackingMessage(
          session.organizerName ?? null,
          (session.claims ?? []).some((c) => c.mine && c.status === 'pending'),
        )}
        confirmLabel="Stop tracking"
        destructive
        onCancel={() => {
          setConfirming(false);
          // The dialog is removed rather than closed, so focus wouldn't return to the button that
          // opened it on its own.
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLButtonElement>(`[data-stop-tracking="${CSS.escape(session.id)}"]`)
              ?.focus(),
          );
        }}
        onConfirm={() => {
          setConfirming(false);
          leaveSession(session.id);
          onLeft(title);
        }}
      />
    </>
  );
}
