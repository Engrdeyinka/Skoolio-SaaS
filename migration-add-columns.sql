-- ============================================
-- MIGRATION: Add missing columns
-- Run this in Supabase SQL Editor
-- ============================================

-- Add missing columns to teachers table
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';

-- Add missing columns to students table
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS medical_notes TEXT DEFAULT '';

-- Add missing columns to events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_time TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_audience TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS specific_class TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS organizer TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'upcoming',
  ADD COLUMN IF NOT EXISTS venue TEXT DEFAULT '';

-- Add missing columns to expenses table
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS receipt_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Add missing columns to subjects table
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS subject_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

SELECT 'Migration complete! All columns added.' as result;
