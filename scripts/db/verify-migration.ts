/**
 * Compares what `loadSessions` would return from the new tables against what
 * `parseAppData` returns from the original blob, per account. Counts matching
 * is not enough — this checks the actual reassembled documents agree.
 */
import { readFileSync } from 'node:fs';
import { createPool } from '@vercel/postgres';
import { parseAppData } from '../../src/lib/storage';
import type { Session } from '../../src/types';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const pool = createPool({ connectionString: process.env.HATI_DATABASE_URL });

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));

/** JSONB does not preserve key order, so compare by value rather than by text. */
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
};

/** Comparable shape: ordering and timestamp formatting must not count as drift. */
const normalise = (sessions: Session[]) =>
  [...sessions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({
      id: s.id,
      status: s.status,
      members: [...s.members].sort(),
      records: [...s.records]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => ({ id: r.id, date: r.date, payorMode: r.payorMode, items: r.items, payors: r.payors })),
    }));

let mismatches = 0;

const { rows: blobs } = await pool.sql`select user_id, data from app_data`;
for (const { user_id: userId, data } of blobs) {
  const fromBlob = parseAppData(JSON.stringify(data)).sessions;

  const { rows: sRows } = await pool.sql`
    select id, status, created_at, closed_at, members from expense_sessions
    where user_id = ${userId}`;
  const { rows: rRows } = await pool.sql`
    select r.id, r.session_id, r.date::text as date, r.payor_mode,
           r.payors, r.items, r.created_at
    from purchase_records r
    join expense_sessions s on s.id = r.session_id where s.user_id = ${userId}`;

  const fromTables: Session[] = sRows.map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: iso(s.created_at),
    closedAt: s.closed_at === null ? null : iso(s.closed_at),
    members: s.members,
    records: rRows
      .filter((r) => r.session_id === s.id)
      .map((r) => ({
        id: r.id,
        date: r.date,
        payorMode: r.payor_mode,
        payors: r.payors,
        items: r.items,
        createdAt: iso(r.created_at),
      })),
  }));

  const a = JSON.stringify(sortKeys(normalise(fromBlob)));
  const b = JSON.stringify(sortKeys(normalise(fromTables)));
  const same = a === b;
  if (!same) mismatches += 1;
  console.log(`${userId.slice(0, 16)}… ${same ? 'identical' : 'DIFFERS'}  (${fromBlob.length} sessions)`);
  if (!same) {
    console.log('  blob  :', a.slice(0, 300));
    console.log('  tables:', b.slice(0, 300));
  }
}

console.log(mismatches === 0 ? '\nEvery account reassembles identically' : `\n${mismatches} MISMATCH(ES)`);
if (mismatches > 0) process.exitCode = 1;
await pool.end();
