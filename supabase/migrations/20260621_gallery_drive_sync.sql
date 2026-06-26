alter table public.photo_albums
  add column if not exists drive_folder_id text;

alter table public.gallery_photos
  add column if not exists drive_file_id text,
  add column if not exists drive_url text,
  add column if not exists drive_name text,
  add column if not exists source text default 'app';

create index if not exists idx_photo_albums_drive_folder_id
  on public.photo_albums (drive_folder_id);

create index if not exists idx_gallery_photos_drive_file_id
  on public.gallery_photos (drive_file_id);
