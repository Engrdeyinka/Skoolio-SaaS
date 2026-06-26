-- ─── Fee Structures ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_structures (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  amounts       JSONB DEFAULT '{}',  -- { "KG": 50000, "Primary 1": 60000, ... }
  term          TEXT DEFAULT 'All Terms',
  is_active     BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Admissions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admissions (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_name     TEXT NOT NULL,
  date_of_birth    DATE,
  gender           TEXT,
  class_applied    TEXT NOT NULL,
  parent_name      TEXT NOT NULL,
  parent_phone     TEXT,
  parent_email     TEXT,
  address          TEXT,
  previous_school  TEXT,
  how_heard        TEXT,
  status           TEXT DEFAULT 'pending',  -- pending | approved | rejected
  admin_notes      TEXT,
  applied_at       TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ
);

-- ─── Photo Gallery ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photo_albums (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  event_date  DATE,
  cover_url   TEXT,
  photo_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  album_id  UUID REFERENCES photo_albums(id) ON DELETE CASCADE,
  url       TEXT NOT NULL,
  caption   TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Supabase Storage bucket: run this once or create via Dashboard > Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('gallery', 'gallery', true, 52428800, ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- ─── Inventory ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  quantity       INTEGER DEFAULT 1,
  unit           TEXT DEFAULT 'unit',
  condition      TEXT DEFAULT 'good',  -- excellent | good | fair | poor | damaged
  location       TEXT,
  purchase_date  DATE,
  purchase_price NUMERIC(12,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
