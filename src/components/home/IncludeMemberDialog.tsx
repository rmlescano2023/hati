import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../shared/Button';
import { ModalDialog } from '../shared/ModalDialog';
import { formatLongDate, formatMoney, joinNames } from '../../lib/format';
import type { IncludeGroup, ItemRef } from '../../lib/includeMember';
import confirmStyles from '../shared/ConfirmDialog.module.css';
import styles from './IncludeMemberDialog.module.css';

type Props = {
  /** The member being added, who isn't in the group yet. */
  name: string;
  groups: IncludeGroup[];
  onInclude: (include: ItemRef[]) => void;
  onSkip: () => void;
  /** Escape or a click on the backdrop: the member isn't added. */
  onCancel: () => void;
};

const tickKey = (ref: ItemRef) => `${ref.recordId}\u0000${ref.itemId}`;

/**
 * Asks which saved items a late-joining member shared. Mounted only while it
 * is open, so it starts with nothing ticked every time.
 */
export function IncludeMemberDialog({ name, groups, onInclude, onSkip, onCancel }: Props) {
  // A group key holds "::" and "|", so the heading ids use the index instead.
  const idBase = useId();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Only items still listed count, so one that vanished in a background reload
  // is ignored rather than sent.
  const listed: ItemRef[] = groups.flatMap((g) =>
    g.items.map(({ recordId, itemId }) => ({ recordId, itemId })),
  );
  const chosen = listed.filter((ref) => ticked.has(tickKey(ref)));
  const allTicked = listed.length > 0 && chosen.length === listed.length;
  const someTicked = chosen.length > 0;

  // React has no attribute for the partial state of a checkbox.
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someTicked && !allTicked;
  }, [someTicked, allTicked]);

  const toggleAll = () => setTicked(allTicked ? new Set() : new Set(listed.map(tickKey)));

  const toggleOne = (ref: ItemRef) =>
    setTicked((prev) => {
      const next = new Set(prev);
      const key = tickKey(ref);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const payorNames = (group: IncludeGroup) =>
    group.payorMode === 'single'
      ? group.payors[0].member
      : joinNames(group.payors.map((p) => p.member));

  return (
    <ModalDialog labelledBy="include-title" onCancel={onCancel}>
      <div className={`${confirmStyles.body} ${styles.body}`}>
        <h2 id="include-title" className={`${confirmStyles.title} ${styles.title}`}>
          Include {name} in earlier items?
        </h2>
        <p className={confirmStyles.message}>
          Tick the saved items {name} shared. Each keeps its price and is split again with {name}.
        </p>
        <label className={`${styles.option} ${styles.selectAll}`}>
          <input type="checkbox" ref={selectAllRef} checked={allTicked} onChange={toggleAll} />
          Select all
        </label>
        <div className={styles.list}>
          {groups.map((group, index) => (
            <section
              key={group.key}
              className={styles.group}
              aria-labelledby={`${idBase}-group-${index}`}
            >
              <h3 id={`${idBase}-group-${index}`} className={styles.groupHead}>
                {formatLongDate(group.date)} · Paid by {payorNames(group)}
              </h3>
              {group.items.map((item) => (
                <label key={`${item.recordId}-${item.itemId}`} className={styles.option}>
                  <input
                    type="checkbox"
                    aria-label={`${item.name}, ${formatMoney(item.price)}`}
                    checked={ticked.has(tickKey(item))}
                    onChange={() => toggleOne(item)}
                  />
                  <span className={styles.name}>{item.name}</span>
                  <span className={styles.price}>{formatMoney(item.price)}</span>
                </label>
              ))}
            </section>
          ))}
        </div>
        <div className={confirmStyles.actions}>
          <Button onClick={onSkip}>Skip</Button>
          <Button variant="primary" disabled={!someTicked} onClick={() => onInclude(chosen)}>
            Include
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
