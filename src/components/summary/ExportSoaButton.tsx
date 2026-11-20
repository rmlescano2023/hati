import { useState } from 'react';
import { Button } from '../shared/Button';
import { downloadSoa } from '../../pdf/downloadSoa';
import type { PurchaseRecord } from '../../types';
import styles from './ExportSoaButton.module.css';

type Props = {
  members: string[];
  records: PurchaseRecord[];
  /** The session's name at the moment of export; null when unnamed. */
  name: string | null;
  /** Passed through to the filename; defaults to today's date. */
  fileNameSuffix?: string;
  /** Overrides the caption under the button. Ignored when `layout` is 'inline'. */
  hint?: string;
  /**
   * 'block' is the page-footer action with its caption underneath; 'inline' is
   * the same button in a header row, without the caption — a caption reads as
   * explanatory text under a footer CTA, not beside a back link.
   */
  layout?: 'block' | 'inline';
  /**
   * Only the organizer's export of a finished session passes this (BR-Q4). It's asked for the
   * invite link at each export; null means the SOA goes out without the invite block, and says so.
   */
  getInviteUrl?: () => Promise<string | null>;
};

export function ExportSoaButton({
  members,
  records,
  name,
  fileNameSuffix,
  hint,
  layout = 'block',
  getInviteUrl,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const handleClick = async () => {
    setBusy(true);
    setError('');
    setNote('');
    try {
      // It resolves null on any failure, so a link that can't be had never stops the statement.
      const inviteUrl = getInviteUrl ? await getInviteUrl() : null;
      await downloadSoa({
        members,
        records,
        fileNameSuffix,
        name,
        inviteUrl: inviteUrl ?? undefined,
      });
      if (getInviteUrl && inviteUrl === null) {
        setNote(
          "Downloaded without the invite QR, because the link couldn't be loaded. Download again to include it.",
        );
      }
    } catch (err) {
      // The generator's own message is about its internals, so the user gets a
      // plain line and the cause goes to the console in development.
      if (import.meta.env.DEV) console.warn('soa: could not create the PDF', err);
      setError("Couldn't create the PDF. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Only ever gated on there being something to export — never on a record's
  // age, and never on whether the session is still open.
  const disabled = busy || records.length === 0;

  if (layout === 'inline') {
    return (
      <div className={styles.inline}>
        <Button variant="primary" size="lg" onClick={handleClick} disabled={disabled}>
          {busy ? 'Preparing SOA…' : '↓ Download SOA'}
        </Button>
        {note && (
          <p role="status" className={styles.note}>
            {note}
          </p>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <Button variant="primary" size="lg" onClick={handleClick} disabled={disabled}>
        {busy ? 'Preparing SOA…' : '↓ Download SOA'}
      </Button>
      <p className={styles.hint}>
        {hint ?? 'A paginated PDF statement — settlement, balances and every item.'}
      </p>
      {note && (
        <p role="status" className={styles.note}>
          {note}
        </p>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
