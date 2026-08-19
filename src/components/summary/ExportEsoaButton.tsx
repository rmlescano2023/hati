import { useState } from 'react';
import { Button } from '../shared/Button';
import { downloadEsoa } from '../../pdf/downloadEsoa';
import type { PurchaseRecord } from '../../types';
import styles from './ExportEsoaButton.module.css';

type Props = {
  members: string[];
  records: PurchaseRecord[];
};

export function ExportEsoaButton({ members, records }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleClick = async () => {
    setBusy(true);
    setError('');
    try {
      await downloadEsoa({ members, records });
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
        {busy ? 'Preparing eSOA…' : '↓ Download eSOA'}
      </Button>
      <p className={styles.hint}>
        A paginated PDF statement — settlement, balances and every item.
      </p>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
