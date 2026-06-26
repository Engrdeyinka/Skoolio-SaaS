-- Store the first term/year a student should appear in fee balances.
-- Existing students default to Second Term 2025/2026 as requested.
ALTER TABLE students
ADD COLUMN IF NOT EXISTS start_term TEXT DEFAULT 'Second Term',
ADD COLUMN IF NOT EXISTS start_academic_year TEXT DEFAULT '2025/2026';

UPDATE students
SET
  start_term = COALESCE(NULLIF(start_term, ''), 'Second Term'),
  start_academic_year = COALESCE(NULLIF(start_academic_year, ''), '2025/2026')
WHERE start_term IS NULL
   OR start_term = ''
   OR start_academic_year IS NULL
   OR start_academic_year = '';

CREATE INDEX IF NOT EXISTS idx_students_start_term_scope
ON students (start_academic_year, start_term);

NOTIFY pgrst, 'reload schema';
