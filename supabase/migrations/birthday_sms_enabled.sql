-- Master toggle for the birthday SMS pipeline.
-- When false, BOTH the daily cron AND the manual "Send SMS" button on the
-- admin dashboard widget become no-ops. Useful when auditing student
-- date-of-birth data so a wrong DOB doesn't accidentally trigger a real text.
alter table public.school_settings
  add column if not exists birthday_sms_enabled boolean not null default true;
