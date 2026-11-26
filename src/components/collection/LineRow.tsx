import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '../shared/Button';
import { ClearableInput } from '../shared/ClearableInput';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import {
  formatCents,
  pairPaymentIds,
  parseLineAmount,
  type CollectionLine,
  type LineStatus,
} from '../../lib/collection';
import { formatLocalDateTime } from '../../lib/format';
import { createId } from '../../lib/id';
import {
  declineMessage,
  notConfirmedLine,
  saysTheyPaidLine,
  talkToLine,
  toConfirmLine,
  waitingForLine,
  waitingLine,
  withdrawMessage,
  youSaidLine,
} from '../../lib/joinedSessions';
import type { Claim, Payment } from '../../types';
import styles from './LineRow.module.css';

/**
 * A payment that didn't record, kept by the page rather than the row so the
 * form survives its card moving between sections as the figures revert.
 * `against` is the line's payments when it was refused (see `pairPaymentIds`):
 * once they change, the refusal no longer describes the line and is dropped.
 * It lives here rather than in the row because a row mounts afresh whenever
 * its card moves section, and would then note the changed payments as new.
 */
export type FailedPayment = { id: string; amountText: string; message: string; against: string };

type Props = {
  sessionId: string;
  line: CollectionLine;
  failed: FailedPayment | undefined;
  /** Sets or clears this line's failed payment. */
  onFailed: (failed: FailedPayment | null) => void;
  /** Called as a payment ends, `ok` once the server has it, so the page can announce a session settling. */
  onPaid: (ok: boolean) => void;
  /** A line on a session the account joined, rather than owns. */
  joined?: boolean;
  /**
   * The line is shown on History detail, under "Your payments": the figures, Undo and Dismiss stay,
   * and every action that records or claims is hidden. An undo makes the line unpaid for a moment,
   * and without this a record button would flash in the detail page (BR-D2).
   */
  inHistory?: boolean;
  /** Who a claim on a You owe line waits on (BR-C19), already worded for mid-sentence. */
  decider?: string;
  /** Says what happened, for a screen reader, where the line's own card may have moved on. */
  onAnnounce?: (text: string) => void;
};

const STATUS_LABEL: Record<LineStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
};

/**
 * One settlement line involving the user: who, how much, how much is paid,
 * and the payments against it. The wording follows the direction of the money
 * (BR-20), so "Record payment" is money coming in and "I paid" money going out.
 */
export function LineRow({
  sessionId,
  line,
  failed,
  onFailed,
  onPaid,
  joined = false,
  inHistory = false,
  decider = 'the organizer',
  onAnnounce,
}: Props) {
  const { addPayments, removePayment, addClaims, decideClaim, removeClaim } = useSessionsStore();
  const owedToYou = line.direction === 'owedToYou';
  const { other } = line;
  // A participant who owes says "I've paid", which waits for the creditor. Everyone else records at
  // once: the organizer, and anyone who is the creditor (BR-C1, BR-C3, BR-C20).
  const claiming = joined && !owedToYou;
  // A participant can undo only payments owed to them (BR-C4).
  const canUndo = !joined || owedToYou;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(failed?.amountText ?? '');
  const [undoing, setUndoing] = useState<Payment | null>(null);
  const [declining, setDeclining] = useState<Claim | null>(null);
  const [withdrawing, setWithdrawing] = useState<Claim | null>(null);
  // A refusal of a decision, by claim, shown on its entry, or under the figures once the entry is
  // gone (a withdrawn claim's confirm).
  const [entryErrors, setEntryErrors] = useState(new Map<string, string>());
  // A double tap on Save, or a held Enter, must still record one payment (AC-7.10).
  const submitted = useRef(false);
  // The form and the undo dialog are removed rather than closed, so focus would
  // fall back to the page. These find the buttons that opened them again.
  const actions = useRef<HTMLDivElement>(null);
  const history = useRef<HTMLUListElement>(null);
  const messageId = useId();
  // Whether the row is on screen, so a refusal arriving after it has gone is
  // reported in the banner instead of into state nobody sees.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A failure reported after the form closed reopens it with what was typed.
  // The page drops it once the line's payments change (see `FailedPayment`).
  const [seenFailed, setSeenFailed] = useState(failed);
  if (failed !== seenFailed) {
    setSeenFailed(failed);
    if (failed) setText(failed.amountText);
  }

  // A line with nothing open, paid in full or with the rest waiting on a claim, has nothing left to
  // record or claim, so its form closes and a refusal shows as the line's state.
  const paidUp = line.openCents === 0;
  if (open && paidUp) setOpen(false);
  const showForm = !inHistory && (open || failed !== undefined) && !paidUp;
  useEffect(() => {
    // The box is inside a wrapper that takes no ref, so it is found by its id.
    if (showForm) document.getElementById(`${messageId}-input`)?.focus();
  }, [showForm, messageId]);

  const parsed = parseLineAmount(text, line, claiming ? 'debtor' : 'creditor');
  // While the refused amount is unchanged, the server's refusal already says
  // why ("Only ₱50.00 is left on this line."), so the local check stays quiet.
  // Once it is edited, the refusal no longer describes what is typed, so it
  // goes and the local check speaks instead.
  const serverSaysSo = failed !== undefined && text === failed.amountText;

  const openForm = () => {
    submitted.current = false;
    // A fresh start: no message or amount from an earlier refusal.
    if (failed) onFailed(null);
    setText((line.openCents / 100).toFixed(2));
    setOpen(true);
  };

  const closeForm = () => {
    setOpen(false);
    onFailed(null);
    // The first button of the actions is the one that opened the form.
    requestAnimationFrame(() => actions.current?.querySelector('button')?.focus());
  };

  /** `onFailure` returns whether it showed the message, as `addPayments` asks. */
  const record = (
    id: string,
    amountCents: number,
    onFailure?: (message: string, payments: Payment[]) => boolean,
  ) => {
    const entry = { id, debtor: line.debtor, creditor: line.creditor, amountCents };
    const settled = (result: Parameters<NonNullable<Parameters<typeof addPayments>[2]>>[0]) => {
      onPaid(result.ok);
      // Only the form has somewhere to show a refusal; Mark fully paid leaves
      // it to the banner.
      return result.ok ? undefined : onFailure?.(result.message, result.payments);
    };
    if (claiming) void addClaims(sessionId, [entry], settled);
    else void addPayments(sessionId, [entry], settled);
  };

  const submit = () => {
    if (!parsed.ok || submitted.current) return;
    submitted.current = true;
    // A retry of the same amount reuses the failed attempt's id, so if that
    // attempt did land after all, the server records it only once.
    const retry = failed
      ? parseLineAmount(failed.amountText, line, claiming ? 'debtor' : 'creditor')
      : null;
    const id = failed && retry?.ok && retry.cents === parsed.cents ? failed.id : createId('pay');
    const amountText = text;
    setOpen(false);
    onFailed(null);
    record(id, parsed.cents, (message, payments) => {
      submitted.current = false;
      // Kept by the page even when this row isn't on screen, so the amount
      // comes back with the line; the banner covers the message then.
      onFailed({
        id,
        amountText,
        message,
        against: pairPaymentIds(payments, line.debtor, line.creditor),
      });
      return mounted.current;
    });
  };

  const progress =
    line.overpaidCents > 0
      ? `Overpaid by ${formatCents(line.overpaidCents)}`
      : line.paidCents === line.amountCents
        ? 'Paid in full'
        : `Paid ${formatCents(line.paidCents)} · ${formatCents(line.remainingCents)} left`;

  // What a decision on a claim says when refused, by claim, kept off the entries once they are gone.
  const decided = (claim: Claim) => (result: { ok: boolean; message?: string; code?: string }) => {
    setEntryErrors((current) => {
      const next = new Map(current);
      next.delete(claim.id);
      if (!result.ok && result.code !== undefined && result.message) {
        next.set(claim.id, result.message);
      }
      return next;
    });
    // A refusal is shown here while this row is on screen; anything else is the banner's.
    return !result.ok && result.code !== undefined && mounted.current ? true : undefined;
  };

  const confirmClaim = (claim: Claim) => {
    setEntryErrors(new Map());
    decideClaim(sessionId, claim.id, 'confirm', (result) => {
      onPaid(result.ok);
      if (result.ok) onAnnounce?.('Payment confirmed.');
      return decided(claim)(result);
    });
  };

  /** The error of an entry, beside it; an orphan's, once the entry has gone, under the figures. */
  const entryError = (id: string): ReactNode => {
    const message = entryErrors.get(id);
    return message ? (
      <span role="alert" className={`${styles.error} ${styles.entryError}`}>
        {message}
      </span>
    ) : null;
  };
  const shownIds = new Set([...line.claims, ...line.declined].map((c) => c.id));
  const orphanErrors = [...entryErrors].filter(([id]) => !shownIds.has(id));

  return (
    <div
      className={styles.line}
      data-to-confirm={owedToYou && line.claims.length > 0 ? '' : undefined}
    >
      <div className={styles.top}>
        <span className={styles.name}>{other}</span>
        <span className={styles.amount}>{formatCents(line.amountCents)}</span>
      </div>
      <div className={styles.progress}>
        <span>{progress}</span>
        <span className={`${styles.chip} ${styles[line.status]}`}>{STATUS_LABEL[line.status]}</span>
      </div>
      {line.pendingCents > 0 && (
        <p className={styles.pending}>
          {owedToYou ? toConfirmLine(line.pendingCents) : waitingLine(line.pendingCents, decider)}
        </p>
      )}
      {orphanErrors.map(([id, message]) => (
        <p key={id} role="alert" className={styles.error}>
          {message}
        </p>
      ))}

      {paidUp && failed && (
        <p role="alert" className={styles.error}>
          {failed.message}
        </p>
      )}

      {showForm ? (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className={styles.label} htmlFor={`${messageId}-input`}>
            {owedToYou ? 'Amount received' : 'Amount you paid'}
          </label>
          <ClearableInput
            id={`${messageId}-input`}
            clearLabel={
              owedToYou ? `Clear amount received from ${other}` : `Clear amount paid to ${other}`
            }
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={styles.amountBox}
            value={text}
            aria-describedby={messageId}
            aria-invalid={!parsed.ok}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                // Escape here cancels the form, not a dialog the page sits in.
                e.preventDefault();
                closeForm();
              }
            }}
          />
          <p id={messageId} className={styles.message}>
            {!parsed.ok && !serverSaysSo && parsed.message}
          </p>
          {failed && serverSaysSo && (
            <p role="alert" className={styles.error}>
              {failed.message}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="submit" variant="primary" size="sm" disabled={!parsed.ok}>
              {claiming ? 'Send for confirmation' : 'Save payment'}
            </Button>
            <Button size="sm" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        !paidUp &&
        !inHistory && (
          <div ref={actions} className={styles.actions}>
            {claiming ? (
              <>
                <Button size="sm" aria-label={`Tell ${other} you've paid`} onClick={openForm}>
                  I&apos;ve paid
                </Button>
                <Button
                  size="sm"
                  aria-label={`Tell ${other} you've paid the full ${formatCents(line.openCents)}`}
                  onClick={() => record(createId('pay'), line.openCents)}
                >
                  I&apos;ve paid it all
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  aria-label={
                    owedToYou ? `Record payment from ${other}` : `Record what you paid ${other}`
                  }
                  onClick={openForm}
                >
                  {owedToYou ? 'Record payment' : 'I paid'}
                </Button>
                <Button
                  size="sm"
                  aria-label={
                    owedToYou
                      ? `Mark ${other} as fully paid`
                      : `Mark what you owe ${other} as fully paid`
                  }
                  onClick={() => record(createId('pay'), line.openCents)}
                >
                  Mark fully paid
                </Button>
              </>
            )}
          </div>
        )
      )}

      {(line.claims.length > 0 || line.declined.length > 0 || line.payments.length > 0) && (
        <ul ref={history} className={styles.history}>
          {line.claims.map((claim) =>
            owedToYou ? (
              <li key={claim.id} className={styles.entry}>
                <span className={styles.entryText}>
                  <span>{saysTheyPaidLine(other, claim.amountCents)}</span>
                  <span className={styles.time}>{formatLocalDateTime(claim.createdAt)}</span>
                  {entryError(claim.id)}
                </span>
                {!inHistory && (
                  <span className={styles.entryActions}>
                    <Button
                      variant="primary"
                      size="sm"
                      aria-label={`Confirm ${formatCents(claim.amountCents)} from ${other}`}
                      onClick={() => confirmClaim(claim)}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      aria-label={`Decline ${formatCents(claim.amountCents)} from ${other}`}
                      onClick={() => setDeclining(claim)}
                    >
                      Decline
                    </Button>
                  </span>
                )}
              </li>
            ) : (
              <li key={claim.id} className={styles.entry}>
                <span className={styles.entryText}>
                  <span>{youSaidLine(claim.amountCents)}</span>
                  <span className={styles.time}>{formatLocalDateTime(claim.createdAt)}</span>
                  <span>{waitingForLine(decider)}</span>
                  {entryError(claim.id)}
                </span>
                {!inHistory && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Withdraw the ${formatCents(claim.amountCents)} you said you paid ${other}`}
                    onClick={() => setWithdrawing(claim)}
                  >
                    Withdraw
                  </Button>
                )}
              </li>
            ),
          )}
          {line.declined.map((claim) => (
            <li key={claim.id} className={styles.entry}>
              <span className={styles.entryText}>
                <span>{notConfirmedLine(claim.amountCents, claim.createdAt)}</span>
                <span>{talkToLine(other)}</span>
                {entryError(claim.id)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Dismiss the note about the ${formatCents(claim.amountCents)} you said you paid ${other}`}
                onClick={() => {
                  setEntryErrors(new Map());
                  removeClaim(sessionId, claim.id, decided(claim));
                }}
              >
                Dismiss
              </Button>
            </li>
          ))}
          {line.payments.map((payment) => (
            <li key={payment.id} className={styles.entry}>
              <span className={styles.entryText}>
                <span>
                  {owedToYou ? 'Received' : 'You paid'} {formatCents(payment.amountCents)}
                </span>
                <span className={styles.time}>{formatLocalDateTime(payment.createdAt)}</span>
              </span>
              {canUndo && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-undo={payment.id}
                  aria-label={
                    owedToYou
                      ? `Undo ${formatCents(payment.amountCents)} received from ${other}`
                      : `Undo ${formatCents(payment.amountCents)} paid to ${other}`
                  }
                  onClick={() => setUndoing(payment)}
                >
                  Undo
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={undoing !== null}
        title="Undo this payment?"
        message={
          undoing === null
            ? ''
            : owedToYou
              ? `This removes the ${formatCents(undoing.amountCents)} received from ${other} on ${formatLocalDateTime(undoing.createdAt)}.`
              : `This removes the ${formatCents(undoing.amountCents)} you paid ${other} on ${formatLocalDateTime(undoing.createdAt)}.`
        }
        confirmLabel="Undo payment"
        destructive
        onCancel={() => {
          const id = undoing?.id;
          setUndoing(null);
          requestAnimationFrame(() =>
            [...(history.current?.querySelectorAll<HTMLButtonElement>('[data-undo]') ?? [])]
              .find((button) => button.dataset.undo === id)
              ?.focus(),
          );
        }}
        onConfirm={() => {
          // The ending is reported so History detail can wait for the server before it says the
          // session is back in Collection; on a card the report is harmless.
          if (undoing) removePayment(sessionId, undoing.id, (result) => onPaid(result.ok));
          setUndoing(null);
        }}
      />
      <ConfirmDialog
        open={declining !== null}
        title="Decline this payment?"
        message={
          declining === null
            ? ''
            : declineMessage(
                declining.debtor,
                declining.creditor,
                declining.amountCents,
                declining.createdAt,
                true,
              )
        }
        confirmLabel="Decline"
        destructive
        onCancel={() => setDeclining(null)}
        onConfirm={() => {
          const claim = declining;
          setDeclining(null);
          if (claim) {
            setEntryErrors(new Map());
            decideClaim(sessionId, claim.id, 'decline', decided(claim));
          }
        }}
      />
      <ConfirmDialog
        open={withdrawing !== null}
        title="Withdraw this payment?"
        message={
          withdrawing === null
            ? ''
            : withdrawMessage(other, withdrawing.amountCents, withdrawing.createdAt)
        }
        confirmLabel="Withdraw"
        destructive
        onCancel={() => setWithdrawing(null)}
        onConfirm={() => {
          const claim = withdrawing;
          setWithdrawing(null);
          if (claim) {
            setEntryErrors(new Map());
            removeClaim(sessionId, claim.id, decided(claim));
          }
        }}
      />
    </div>
  );
}
