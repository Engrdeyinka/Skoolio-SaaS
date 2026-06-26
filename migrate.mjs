// Migration: add missing columns
// Run: node migrate.mjs

const SUPABASE_URL = 'https://vuacujvzizfuuzbzkbhj.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1YWN1anZ6aXpmdXV6YnprYmhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1Mzk3NTcsImV4cCI6MjA4OTExNTc1N30.j1u_GV5sW4KI1RsGlcREKcbyGr3dg7QO_1E4c9ouECU';

// The anon key can't run DDL. Print instructions instead.
console.log('\n=== MIGRATION NEEDED ===');
console.log('Please run this SQL in your Supabase SQL Editor:\n');
console.log(`-- Add missing columns to teachers
ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS salary NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';

-- Add missing columns to students
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS medical_notes TEXT DEFAULT '';

SELECT 'Migration complete!' as result;`);
console.log('\n=== END SQL ===\n');
