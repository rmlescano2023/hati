import { useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { SettlementCard } from './SettlementCard';
import type { Settlement } from '../../types';
import styles from './FinalSettlement.module.css';

/** Past this many debtor blocks the list collapses behind a "Show all" button. */
const COLLAPSE_AFTER = 5;

export function FinalSettlement({ settlements }: { settlements: Settlement[] }) {
  const [expanded, setExpanded] = useState(false);

  const collapsible = settlements.length > COLLAPSE_AFTER;
  const visible = collapsible && !expanded ? settlements.slice(0, COLLAPSE_AFTER) : settlements;
  const hidden = settlements.length - visible.length;

  return (
    <Card label="Final Settlement">
      {settlements.length === 0 ? (
        <p className={styles.settled}>Everyone is settled up.</p>
      ) : (
        <>
          <div className={styles.blocks}>
            {visible.map((settlement) => (
              <SettlementCard key={settlement.debtor} settlement={settlement} />
            ))}
          </div>
          {collapsible && (
            <div className={styles.more}>
              <Button onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show Less' : `Show ${hidden} More`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
