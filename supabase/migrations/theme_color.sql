-- Add theme color columns to school_settings
-- Run this in Supabase SQL Editor

ALTER TABLE school_settings
  ADD COLUMN IF NOT EXISTS theme_color     text DEFAULT 'emerald',
  ADD COLUMN IF NOT EXISTS theme_custom_hex text DEFAULT '#3b82f6';
