create table if not exists public.vault_google_drive_tokens (
  id boolean primary key default true,
  oauth_state text,
  refresh_token text,
  connected_email text,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint vault_google_drive_tokens_singleton check (id = true)
);

alter table public.vault_google_drive_tokens enable row level security;

revoke all on table public.vault_google_drive_tokens from anon;
revoke all on table public.vault_google_drive_tokens from authenticated;
