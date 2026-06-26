-- ============================================================
-- migrate-columns.sql
-- Run this in Supabase SQL Editor BEFORE running migrate-data.mjs
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================

-- Students: extra fields from Base44
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS medical_notes           TEXT;

-- Teachers: extra fields from Base44
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS salary  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Subjects: extra fields from Base44
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS subject_code TEXT,
  ADD COLUMN IF NOT EXISTS description  TEXT;

-- Quizzes: publish/hide toggle + score visibility toggle
ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS is_published    BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS results_visible BOOLEAN DEFAULT true;

-- Teacher availability: extra fields from Base44
ALTER TABLE teacher_availability
  ADD COLUMN IF NOT EXISTS employment_type           TEXT,
  ADD COLUMN IF NOT EXISTS max_periods_per_day       INT,
  ADD COLUMN IF NOT EXISTS max_periods_per_week      INT,
  ADD COLUMN IF NOT EXISTS unavailable_days          TEXT[],
  ADD COLUMN IF NOT EXISTS unavailable_periods       JSONB,
  ADD COLUMN IF NOT EXISTS unavailable_periods_by_day JSONB;

-- Class Fees: term/year scoped fee schedule
CREATE TABLE IF NOT EXISTS class_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade TEXT NOT NULL,
  term TEXT,
  academic_year TEXT,
  termly_tuition NUMERIC DEFAULT 0,
  other_fees JSONB DEFAULT '[]',
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_date TIMESTAMPTZ DEFAULT now()
);

-- Add scoped columns for existing installs
ALTER TABLE class_fees ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE class_fees ADD COLUMN IF NOT EXISTS academic_year TEXT;
ALTER TABLE class_fees ADD COLUMN IF NOT EXISTS other_fees JSONB DEFAULT '[]';

-- Replace old unique-by-grade constraint with scoped uniqueness.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'class_fees_grade_key'
  ) THEN
    ALTER TABLE class_fees DROP CONSTRAINT class_fees_grade_key;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS class_fees_scope_unique
  ON class_fees (grade, COALESCE(term, ''), COALESCE(academic_year, ''));

-- Trigger: auto-update updated_date on class_fees
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'set_updated_date_class_fees'
  ) THEN
    CREATE TRIGGER set_updated_date_class_fees
      BEFORE UPDATE ON class_fees
      FOR EACH ROW EXECUTE FUNCTION update_updated_date();
  END IF;
END;
$$;

-- RLS for class_fees
ALTER TABLE class_fees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'class_fees' AND policyname = 'class_fees_write'
  ) THEN
    CREATE POLICY "class_fees_write" ON class_fees FOR ALL USING (get_user_role() IN ('admin', 'super_admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'class_fees' AND policyname = 'class_fees_read'
  ) THEN
    CREATE POLICY "class_fees_read" ON class_fees FOR SELECT USING (true);
  END IF;
END;
$$;
