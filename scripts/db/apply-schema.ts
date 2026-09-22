/**
 * Applies schema.sql to whichever database HATI_DATABASE_URL points at.
 * Idempotent — every statement is `if not exists` — so it is safe to re-run,
 * and safe to point at `prod` when that branch is first promoted to.
 */
import { readFileSync } from 'node:fs';
import { createPool } from '@vercel/postgres';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2];
}

const url = process.env.DATABASE_URL_OVERRIDE ?? process.env.HATI_DATABASE_URL;
if (!url) throw new Error('No connection string: set HATI_DATABASE_URL or DATABASE_URL_OVERRIDE');

const pool = createPool({ connectionString: url });
await pool.query(readFileSync('scripts/db/schema.sql', 'utf8'));

const { rows } = await pool.sql`
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name`;
console.log('tables:', rows.map((r) => r.table_name).join(', '));
await pool.end();
