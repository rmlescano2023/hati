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

-- The name the user goes by in their groups, tidied and title-cased by the
-- app. Collection matches it against each session's members to work out which
-- one is the user. Null means not set yet.
alter table users add column if not exists display_name text;

create table if not exists expense_sessions (
  id         text primary key,          -- keeps the existing "session_xxx" ids
  user_id    text not null references users (id) on delete cascade,
  status     text not null check (status in ('draft', 'closed')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz,
  members    jsonb not null default '[]'::jsonb
);

create index if not exists expense_sessions_user_id_idx on expense_sessions (user_id);

-- The name the user gave the session, if any. Null means unnamed, and the app
-- titles it by its dates instead. Length is enforced by the app's parser
-- rather than a check constraint, so the limit can change without a migration.
alter table expense_sessions add column if not exists name text;

-- When the session was last opened or changed: the moment the user acted,
-- capped at the server's clock, and never moved backwards. Home lists drafts
-- by it. Null means no activity recorded yet; the app then falls back to the
-- latest purchase or the creation time, so nothing needs backfilling.
alter table expense_sessions add column if not exists activity_at timestamptz;

-- Which member the user said they are in this finished session. Null means no
-- pick, and Collection falls back to matching the profile name. The empty
-- string means "I'm not in this session", which can't collide with a member
-- because a member name is never empty.
alter table expense_sessions add column if not exists me text;

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

-- Payments recorded against a finished session's settlement lines. Keyed by the
-- pair, not by who the user is, so changing the pick never moves a payment.
-- Whole centavos: exact, and the driver returns an integer as a JS number,
-- where numeric would come back as a string.
create table if not exists session_payments (
  id           text primary key,          -- client-minted "pay_xxx", so a retry is idempotent
  session_id   text not null references expense_sessions (id) on delete cascade,
  debtor       text not null,
  creditor     text not null,
  amount_cents integer not null check (amount_cents > 0),
  created_at   timestamptz not null default now()
);

create index if not exists session_payments_session_id_idx on session_payments (session_id);
