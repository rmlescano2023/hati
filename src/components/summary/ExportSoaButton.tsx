import { useState } from 'react';
import { Button } from '../shared/Button';
import { downloadSoa } from '../../pdf/downloadSoa';
import type { PurchaseRecord } from '../../types';
import styles from './ExportSoaButton.module.css';

type Props = {
  members: string[];
  records: PurchaseRecord[];
};

export function ExportSoaButton({ members, records }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setBusy(true);
    setError('');
    try {
      await downloadSoa({ members, records });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <Button
        variant="primary"
        size="lg"
        onClick={handleClick}
        disabled={busy || records.length === 0}
      >
        {busy ? 'Preparing SOA…' : '↓ Download SOA'}
      </Button>
      <p className={styles.hint}>
        A paginated PDF statement — settlement, balances and every item.
      </p>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
