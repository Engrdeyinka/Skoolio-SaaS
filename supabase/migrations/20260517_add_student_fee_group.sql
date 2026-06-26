-- Student fee group / department used for fee rules such as SSS Science surcharge.
ALTER TABLE students
ADD COLUMN IF NOT EXISTS fee_group TEXT DEFAULT 'standard';

UPDATE students
SET fee_group = 'standard'
WHERE fee_group IS NULL OR fee_group = '';

CREATE INDEX IF NOT EXISTS idx_students_fee_group
ON students (fee_group);

NOTIFY pgrst, 'reload schema';
