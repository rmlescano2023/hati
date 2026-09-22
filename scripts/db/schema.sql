-- Sessions and records become real rows; items and payors stay as JSON
-- sub-documents on the record, unchanged in shape from the TypeScript types.
-- Nothing in the app queries an item or a payor independently of its parent
-- record, so splitting those out would add tables for no query benefit.

create table if not exists users (
  id         text primary key,          -- Clerk user id
  created_at timestamptz not null default now()
);

-- Null means the onboarding tour has not been finished or skipped yet. A real
-- column rather than an inferred proxy like "has no sessions", so it follows
-- the account across devices and cannot be re-triggered by deleting data.
alter table users add column if not exists onboarded_at timestamptz;

create table if not exists expense_sessions (
  id         text primary key,          -- keeps the existing "session_xxx" ids
  user_id    text not null references users (id) on delete cascade,
  status     text not null check (status in ('draft', 'closed')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz,
  members    jsonb not null default '[]'::jsonb
);

create index if not exists expense_sessions_user_id_idx on expense_sessions (user_id);

create table if not exists purchase_records (
  id         text primary key,          -- keeps the existing "rec_xxx" ids
  session_id text not null references expense_sessions (id) on delete cascade,
  date       date not null,             -- a real date, where the blob held a string
  payor_mode text not null check (payor_mode in ('single', 'multiple')),
  payors     jsonb not null,
  items      jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists purchase_records_session_date_idx
  on purchase_records (session_id, date);
