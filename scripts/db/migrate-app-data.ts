/**
 * One-off: unwraps each `app_data` blob into `expense_sessions` and
 * `purchase_records` rows. Nothing is transformed — it is a mechanical
 * unwrap of two nesting levels.
 *
 * `app_data` is left in place, untouched, as a rollback net.
 *
 * Re-runnable: every insert is `on conflict do nothing`, so a second run
 * against a migrated database is a no-op rather than a duplicate-key error.
 */
import { readFileSync } from 'node:fs';
import { createPool } from '@vercel/postgres';
import { parseAppData } from '../../src/lib/storage';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const url = process.env.DATABASE_URL_OVERRIDE ?? process.env.HATI_DATABASE_URL;
const pool = createPool({ connectionString: url });

const { rows: blobs } = await pool.sql`select user_id, data from app_data`;
console.log(`app_data rows: ${blobs.length}`);

let expectedSessions = 0;
let expectedRecords = 0;

for (const { user_id: userId, data } of blobs) {
  // The same defensive parser the app uses, so anything unrecognisable is
  // dropped here exactly as it would be on load.
  const parsed = parseAppData(JSON.stringify(data));
  expectedSessions += parsed.sessions.length;

  await pool.sql`insert into users (id) values (${userId}) on conflict (id) do nothing`;

  for (const session of parsed.sessions) {
    expectedRecords += session.records.length;

    await pool.sql`
      insert into expense_sessions (id, user_id, status, created_at, closed_at, members)
      values (
        ${session.id}, ${userId}, ${session.status},
        ${session.createdAt}, ${session.closedAt},
        ${JSON.stringify(session.members)}::jsonb
      )
      on conflict (id) do nothing`;

    for (const record of session.records) {
      await pool.sql`
        insert into purchase_records
          (id, session_id, date, payor_mode, payors, items, created_at)
        values (
          ${record.id}, ${session.id}, ${record.date}, ${record.payorMode},
          ${JSON.stringify(record.payors)}::jsonb,
          ${JSON.stringify(record.items)}::jsonb,
          ${record.createdAt}
        )
        on conflict (id) do nothing`;
    }
  }

  console.log(
    `  ${userId.slice(0, 16)}… → ${parsed.sessions.length} sessions, ` +
      `${parsed.sessions.reduce((n, s) => n + s.records.length, 0)} records`,
  );
}

const { rows: got } = await pool.sql`
  select
    (select count(*) from users)::int            as users,
    (select count(*) from expense_sessions)::int as sessions,
    (select count(*) from purchase_records)::int as records`;

console.log('\nexpected: sessions', expectedSessions, '| records', expectedRecords);
console.log('actual:   sessions', got[0].sessions, '| records', got[0].records, '| users', got[0].users);

const ok = got[0].sessions === expectedSessions && got[0].records === expectedRecords;
console.log(ok ? '\nCOUNTS MATCH' : '\nMISMATCH — do not deploy against this');
if (!ok) process.exitCode = 1;
await pool.end();
