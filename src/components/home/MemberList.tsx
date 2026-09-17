import { useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { useAppData } from '../../context/AppDataContext';
import { toTitleCase } from '../../lib/format';
import styles from './MemberList.module.css';

export function MemberList() {
  const { members, records, addMember, removeMember, clearMembers } = useAppData();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  /** Which destructive action is waiting on confirmation, if any. */
  const [pending, setPending] = useState<
    { kind: 'clear' } | { kind: 'remove'; name: string } | null
  >(null);

  const submit = () => {
    const name = toTitleCase(draft);
    if (!name) {
      setDraft('');
      return;
    }
    if (!addMember(name)) {
      setError(`${name} is already in the group.`);
      return;
    }
    setError('');
    setDraft('');
  };

  const clearAll = () => {
    clearMembers();
    setError('');
  };

  // With nothing saved yet there is nothing to lose, so these go straight
  // through; the confirmation only appears once records exist.
  const handleClearAll = () => (records.length > 0 ? setPending({ kind: 'clear' }) : clearAll());

  const handleRemove = (name: string) =>
    records.length > 0 ? setPending({ kind: 'remove', name }) : removeMember(name);

  const confirmPending = () => {
    if (pending?.kind === 'clear') clearAll();
    else if (pending?.kind === 'remove') removeMember(pending.name);
    setPending(null);
  };

  return (
    <Card
      label="Group Members"
      actions={
        <Button variant="danger" size="sm" disabled={members.length === 0} onClick={handleClearAll}>
          Clear All
        </Button>
      }
    >
      <div className={styles.addRow}>
        <input
          type="text"
          placeholder="Enter member name…"
          aria-label="New member name"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit}>+ Add</Button>
      </div>

      {members.length === 0 ? (
        <p className={styles.hint}>No members yet. Add some above.</p>
      ) : (
        <div className={styles.chips}>
          {members.map((m) => (
            <span className={styles.chip} key={m}>
              {m}
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${m}`}
                onClick={() => handleRemove(m)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.kind === 'remove' ? `Remove ${pending.name}?` : 'Clear all members?'}
        message={
          pending?.kind === 'remove'
            ? 'Their shares are taken out of every saved record.'
            : 'This also clears every saved record in this session.'
        }
        confirmLabel={pending?.kind === 'remove' ? 'Remove' : 'Clear All'}
        destructive
        onCancel={() => setPending(null)}
        onConfirm={confirmPending}
      />
    </Card>
  );
}
