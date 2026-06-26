alter table if exists public.payments
  add column if not exists recorded_by_name text,
  add column if not exists recorded_by_id text,
  add column if not exists recorded_by_role text;

