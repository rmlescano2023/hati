import { useEffect, useId, useRef } from 'react';
import { getGrandTotal } from '../../lib/calculations';
import { formatMoney, joinNames, pluralize } from '../../lib/format';
import { sessionDisplayTitle, sessionTitle } from '../../lib/sessionLabel';
import type { Session } from '../../types';
import { PencilIcon } from '../shared/icons';
import { SessionNameInput } from './SessionNameInput';
import styles from './SessionCard.module.css';

type Props = {
  session: Session;
  onClick: () => void;
  /** When given, the card offers a delete action. Omitted, it doesn't. */
  onDelete?: () => void;
  /** Drafts on Home only: the pencil and the inline name editor. */
  rename?: {
    editing: boolean;
    onStart: () => void;
    onSave: (raw: string) => void;
    onEnd: () => void;
  };
};

/** A bin rather than a cross: this removes the whole session, not one row. */
function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={styles.icon}>
      <path
        d="M2.5 4h11M6.5 4V2.75A.75.75 0 0 1 7.25 2h1.5a.75.75 0 0 1 .75.75V4M6.5 7v4.5M9.5 7v4.5M3.75 4l.6 8.4a1.25 1.25 0 0 0 1.25 1.1h4.8a1.25 1.25 0 0 0 1.25-1.1l.6-8.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One session as a scannable summary row — a draft on Home, a finished session
 * on History. Both lists lead somewhere, so the card always opens on a tap. A
 * session is named by what the user called it, or else by the days its
 * expenses cover; the list's own heading says which kind of session you are
 * looking at.
 *
 * The title is the card's one real button, stretched over the whole card, so a
 * tap anywhere still opens it with the keyboard behaviour a real button gives
 * for free. Rename and delete are siblings laid above that stretch rather than
 * children of it, because a button cannot nest inside another button.
 */
export function SessionCard({ session, onClick, onDelete, rename }: Props) {
  const id = useId();
  const editing = rename?.editing ?? false;
  const named = session.name !== null;
  const pencilRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  // Set when an edit ends from the keyboard, so focus goes back to the pencil
  // rather than being dropped on the page.
  const restoreFocus = useRef(false);
  // While editing there is no open button, and a tap on the card body ends the
  // edit. It must not also open the session: the next tap does that.
  const swallowClick = useRef(false);

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      pencilRef.current?.focus();
    }
  }, [editing]);

  const describedBy = [named && `${id}-dates`, `${id}-total`, `${id}-members`, `${id}-count`]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={styles.row}
      onPointerDownCapture={(e) => {
        if (!editing) {
          swallowClick.current = false;
          return;
        }
        const target = e.target as Element;
        swallowClick.current =
          target.closest('input') === null && !deleteRef.current?.contains(target);
      }}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.stopPropagation();
        // The browser normally blurs the box first, which already ended the
        // edit; this covers the times it doesn't.
        if (rename?.editing) rename.onEnd();
      }}
    >
      <span className={styles.top}>
        <span className={styles.titles}>
          <span className={styles.titleLine}>
            {editing && rename ? (
              <SessionNameInput
                className={styles.nameInput}
                initialName={session.name}
                onSave={rename.onSave}
                onClose={(via) => {
                  if (via !== 'blur') restoreFocus.current = true;
                  rename.onEnd();
                }}
              />
            ) : (
              <button
                type="button"
                className={styles.open}
                onClick={onClick}
                aria-describedby={describedBy}
              >
                {sessionDisplayTitle(session)}
              </button>
            )}
            {rename && !editing && (
              <button
                type="button"
                ref={pencilRef}
                className={styles.rename}
                title="Rename session"
                aria-label={`Rename session ${sessionDisplayTitle(session)}`}
                onClick={rename.onStart}
              >
                <PencilIcon className={styles.pencilIcon} />
              </button>
            )}
          </span>
          {named && (
            <span id={`${id}-dates`} className={styles.dates}>
              {sessionTitle(session)}
            </span>
          )}
        </span>
        <span id={`${id}-total`} className={styles.total}>
          {formatMoney(getGrandTotal(session.records))}
        </span>
      </span>
      <span id={`${id}-members`} className={styles.members}>
        {session.members.length > 0 ? joinNames(session.members) : 'No members yet'}
      </span>
      <span id={`${id}-count`} className={styles.count}>
        {pluralize(session.records.length, 'purchase')}
      </span>
      {onDelete && (
        <button
          type="button"
          ref={deleteRef}
          className={styles.delete}
          title="Delete session"
          aria-label={`Delete session ${sessionDisplayTitle(session)}`}
          onClick={onDelete}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}
