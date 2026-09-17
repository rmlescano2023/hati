import { useState } from 'react';
import { Button } from '../shared/Button';
import { downloadSoa } from '../../pdf/downloadSoa';
import type { PurchaseRecord } from '../../types';
import styles from './ExportSoaButton.module.css';

type Props = {
  members: string[];
  records: PurchaseRecord[];
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
};

export function ExportSoaButton({
  members,
  records,
  fileNameSuffix,
  hint,
  layout = 'block',
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setBusy(true);
    setError('');
    try {
      await downloadSoa({ members, records, fileNameSuffix });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the PDF.');
    } finally {
      setBusy(false);
    }
  };

  // Only ever gated on there being something to export — never on a record's
  // age. The 7-day freeze rule governs Breakdown's edit affordances alone, so a
  // session stays downloadable however old it gets.
  const disabled = busy || records.length === 0;

  if (layout === 'inline') {
    return (
      <div className={styles.inline}>
        <Button variant="primary" size="lg" onClick={handleClick} disabled={disabled}>
          {busy ? 'Preparing SOA…' : '↓ Download SOA'}
        </Button>
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
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
