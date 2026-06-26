-- Approval gate for new staff/admin accounts
alter table public.profiles
  add column if not exists approval_status  text not null default 'pending',
  add column if not exists approved_by      text,
  add column if not exists approved_at      timestamptz,
  add column if not exists rejection_reason text;

-- All profiles that already have a school_role are active users — auto-approve them
update public.profiles
set approval_status = 'approved'
where school_role is not null
  and approval_status = 'pending';
