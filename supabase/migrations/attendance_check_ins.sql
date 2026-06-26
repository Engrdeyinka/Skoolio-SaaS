-- Attendance check-ins
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per (grade, attendance_date) when the class teacher (or admin) has
-- explicitly opened that class's attendance for that day.
--
-- The whole point of this table is to flip the attendance model from
-- "default-present" to "active-default-absent":
--   - If a check-in row exists for (grade, date) → use the existing absence
--     records to derive each student's status (default present).
--   - If NO check-in row exists for (grade, date) → every student in that
--     class is counted ABSENT in every report and dashboard widget.
--
-- The class teacher cannot escape engagement: silently doing nothing now
-- shows up loudly as a 0% attendance class, instead of hiding behind a
-- silent "everyone was present" default.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.attendance_check_ins (
  id              uuid        primary key default gen_random_uuid(),
  grade           text        not null,
  attendance_date date        not null,
  term            text,
  academic_year   text,
  teacher_id      uuid        references public.teachers(id) on delete set null,
  checked_in_at   timestamptz not null default now(),
  created_date    timestamptz not null default now(),
  updated_date    timestamptz not null default now(),
  -- A class can only be "checked in" once per day. Re-opening the page is a
  -- no-op INSERT (handled with onConflict / upsert from the client).
  unique (grade, attendance_date)
);

-- Fast lookups for the Admin Dashboard widget ("today's check-in status for
-- every class") and for resolveAttendanceStatus() (per-student per-day).
create index if not exists attendance_check_ins_date_idx
  on public.attendance_check_ins (attendance_date);

create index if not exists attendance_check_ins_grade_date_idx
  on public.attendance_check_ins (grade, attendance_date);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Same posture as the rest of the school tables: authenticated users can
-- read; writes go through the application layer. Add stricter per-role rules
-- later if needed.
alter table public.attendance_check_ins enable row level security;

drop policy if exists "attendance_check_ins read"   on public.attendance_check_ins;
drop policy if exists "attendance_check_ins insert" on public.attendance_check_ins;
drop policy if exists "attendance_check_ins update" on public.attendance_check_ins;
drop policy if exists "attendance_check_ins delete" on public.attendance_check_ins;

create policy "attendance_check_ins read"
  on public.attendance_check_ins for select
  to authenticated using (true);

create policy "attendance_check_ins insert"
  on public.attendance_check_ins for insert
  to authenticated with check (true);

create policy "attendance_check_ins update"
  on public.attendance_check_ins for update
  to authenticated using (true) with check (true);

create policy "attendance_check_ins delete"
  on public.attendance_check_ins for delete
  to authenticated using (true);

-- updated_date auto-refresh on UPDATE (matches the convention of the rest of
-- this schema).
create or replace function public.touch_attendance_check_ins_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end$$;

drop trigger if exists attendance_check_ins_touch_updated on public.attendance_check_ins;
create trigger attendance_check_ins_touch_updated
  before update on public.attendance_check_ins
  for each row execute function public.touch_attendance_check_ins_updated_date();
