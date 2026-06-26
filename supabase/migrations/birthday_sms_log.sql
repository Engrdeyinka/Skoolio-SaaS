-- Birthday SMS log
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per (student, sent_date). Used for two things:
--   1. Idempotency — the daily cron edge function and the admin's manual
--      "Send SMS" button both write here, so a parent never gets two
--      birthday texts on the same day even if both fire.
--   2. Audit — the widget shows a ✓ next to today's birthdays already
--      delivered, so the admin can see what's been handled.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.birthday_sms_log (
  id           uuid        primary key default gen_random_uuid(),
  student_id   uuid        not null references public.students(id) on delete cascade,
  sent_date    date        not null,            -- the birthday day (yyyy-mm-dd)
  sent_at      timestamptz not null default now(),
  phone        text,                            -- snapshot of the number used
  message      text,                            -- snapshot of what was sent
  channel      text        not null default 'sms', -- future-proof for email etc.
  status       text        not null default 'sent', -- 'sent' | 'failed'
  error        text,
  source       text,                            -- 'cron' | 'manual'
  created_date timestamptz not null default now(),
  -- The hard guard against duplicates. Same student + same date can only have
  -- one log row regardless of who tried to send.
  unique (student_id, sent_date)
);

create index if not exists birthday_sms_log_sent_date_idx
  on public.birthday_sms_log (sent_date);

create index if not exists birthday_sms_log_student_idx
  on public.birthday_sms_log (student_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.birthday_sms_log enable row level security;

drop policy if exists "birthday_sms_log read"   on public.birthday_sms_log;
drop policy if exists "birthday_sms_log insert" on public.birthday_sms_log;
drop policy if exists "birthday_sms_log update" on public.birthday_sms_log;
drop policy if exists "birthday_sms_log delete" on public.birthday_sms_log;

create policy "birthday_sms_log read"
  on public.birthday_sms_log for select
  to authenticated using (true);

create policy "birthday_sms_log insert"
  on public.birthday_sms_log for insert
  to authenticated with check (true);

create policy "birthday_sms_log update"
  on public.birthday_sms_log for update
  to authenticated using (true) with check (true);

create policy "birthday_sms_log delete"
  on public.birthday_sms_log for delete
  to authenticated using (true);
