import { useState } from 'react';
import { Card } from '../shared/Card';
import { Button } from '../shared/Button';
import { useAppData } from '../../context/AppDataContext';
import { toTitleCase } from '../../lib/format';
import styles from './MemberList.module.css';

export function MemberList() {
  const { members, records, addMember, removeMember, clearMembers } = useAppData();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

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

  const handleClearAll = () => {
    if (records.length > 0) {
      const ok = window.confirm('Clearing all members also clears every saved record. Continue?');
      if (!ok) return;
    }
    clearMembers();
    setError('');
  };

  const handleRemove = (name: string) => {
    if (records.length > 0) {
      const ok = window.confirm(
        `Remove ${name}? Their shares are taken out of every saved record.`,
      );
      if (!ok) return;
    }
    removeMember(name);
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
    </Card>
  );
}
