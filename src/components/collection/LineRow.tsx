import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useSessionsStore } from '../../context/SessionsStoreContext';
import {
  formatCents,
  parsePaymentAmount,
  type CollectionLine,
  type LineStatus,
} from '../../lib/collection';
import { formatLocalDateTime } from '../../lib/format';
import { createId } from '../../lib/id';
import type { Payment } from '../../types';
import styles from './LineRow.module.css';

/**
 * A payment that didn't record, kept by the page rather than the row so the
 * form survives its card moving between sections as the figures revert.
 */
export type FailedPayment = { id: string; amountText: string; message: string };

type Props = {
  sessionId: string;
  line: CollectionLine;
  failed: FailedPayment | undefined;
  /** Sets or clears this line's failed payment. */
  onFailed: (failed: FailedPayment | null) => void;
  /** Called as a payment is recorded, so the page can announce a session settling. */
  onPaid: () => void;
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
export function LineRow({ sessionId, line, failed, onFailed, onPaid }: Props) {
  const { addPayments, removePayment } = useSessionsStore();
  const owedToYou = line.direction === 'owedToYou';
  const { other } = line;

  const [open, setOpen] = useState(false);
  const [text, setText] = useState(failed?.amountText ?? '');
  const [undoing, setUndoing] = useState<Payment | null>(null);
  // A double tap on Save, or a held Enter, must still record one payment (AC-7.10).
  const submitted = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const messageId = useId();

  // A failure reported after the form closed reopens it with what was typed.
  const [seenFailed, setSeenFailed] = useState(failed);
  if (failed !== seenFailed) {
    setSeenFailed(failed);
    if (failed) setText(failed.amountText);
  }

  const showForm = open || failed !== undefined;
  useEffect(() => {
    if (showForm) input.current?.focus();
  }, [showForm]);

  const parsed = parsePaymentAmount(text, line.remainingCents);

  const openForm = () => {
    submitted.current = false;
    setText((line.remainingCents / 100).toFixed(2));
    setOpen(true);
  };

  const closeForm = () => {
    setOpen(false);
    onFailed(null);
  };

  const record = (id: string, amountCents: number, onFailure?: (message: string) => void) => {
    onPaid();
    addPayments(
      sessionId,
      [{ id, debtor: line.debtor, creditor: line.creditor, amountCents }],
      (result) => {
        if (!result.ok) onFailure?.(result.message);
      },
    );
  };

  const submit = () => {
    if (!parsed.ok || submitted.current) return;
    submitted.current = true;
    // A retry of the same amount reuses the failed attempt's id, so if that
    // attempt did land after all, the server records it only once.
    const retry = failed ? parsePaymentAmount(failed.amountText, line.remainingCents) : null;
    const id = failed && retry?.ok && retry.cents === parsed.cents ? failed.id : createId('pay');
    const amountText = text;
    setOpen(false);
    onFailed(null);
    record(id, parsed.cents, (message) => {
      submitted.current = false;
      onFailed({ id, amountText, message });
    });
  };

  const progress =
    line.overpaidCents > 0
      ? `Overpaid by ${formatCents(line.overpaidCents)}`
      : line.paidCents === line.amountCents
        ? 'Paid in full'
        : `Paid ${formatCents(line.paidCents)} · ${formatCents(line.remainingCents)} left`;

  return (
    <div className={styles.line}>
      <div className={styles.top}>
        <span className={styles.name}>{other}</span>
        <span className={styles.amount}>{formatCents(line.amountCents)}</span>
      </div>
      <div className={styles.progress}>
        <span>{progress}</span>
        <span className={`${styles.chip} ${styles[line.status]}`}>{STATUS_LABEL[line.status]}</span>
      </div>

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
          <input
            ref={input}
            id={`${messageId}-input`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={styles.input}
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
            {!parsed.ok && parsed.message}
          </p>
          {failed && (
            <p role="alert" className={styles.error}>
              {failed.message}
            </p>
          )}
          <div className={styles.actions}>
            <Button type="submit" variant="primary" size="sm" disabled={!parsed.ok}>
              Save payment
            </Button>
            <Button size="sm" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        line.remainingCents > 0 && (
          <div className={styles.actions}>
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
              onClick={() => record(createId('pay'), line.remainingCents)}
            >
              Mark fully paid
            </Button>
          </div>
        )
      )}

      {line.payments.length > 0 && (
        <ul className={styles.history}>
          {line.payments.map((payment) => (
            <li key={payment.id} className={styles.entry}>
              <span className={styles.entryText}>
                <span>
                  {owedToYou ? 'Received' : 'You paid'} {formatCents(payment.amountCents)}
                </span>
                <span className={styles.time}>{formatLocalDateTime(payment.createdAt)}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={
                  owedToYou
                    ? `Undo ${formatCents(payment.amountCents)} received from ${other}`
                    : `Undo ${formatCents(payment.amountCents)} paid to ${other}`
                }
                onClick={() => setUndoing(payment)}
              >
                Undo
              </Button>
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
        onCancel={() => setUndoing(null)}
        onConfirm={() => {
          if (undoing) removePayment(sessionId, undoing.id);
          setUndoing(null);
        }}
      />
    </div>
  );
}
